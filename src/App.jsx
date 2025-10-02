import { useEffect, useMemo, useState } from "react";
import { Line, Bar } from "react-chartjs-2";
import Filters from "./components/Filters.jsx";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
// Dark theme defaults for charts
ChartJS.defaults.color = '#e5e7eb';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.1)';

const BASE_URL = "/fred";

// Known-good series overrides per indicator and CBSA (indicatorKey|CBSA -> seriesId)
const SERIES_OVERRIDES = {
  // Housing Inventory: Active Listing Count for selected MSAs
  "HOUSING_HPI|33100": "ACTLISCOU33100", // Miami–Fort Lauderdale–West Palm Beach, FL
  "HOUSING_HPI|45300": "ACTLISCOU45300", // Tampa–St. Petersburg–Clearwater, FL
  "HOUSING_HPI|36740": "ACTLISCOU36740", // Orlando–Kissimmee–Sanford, FL
};

// Supported indicators and how to build FRED series IDs per CBSA
const INDICATORS = {
  EMP_RATE: {
    label: "Employment Rate",
    // Series discovery recommended; fallback attempt pattern for FL MSAs
    seriesIdForCbsa: (cbsa) => `LAUMT12${cbsa}0000000003`,
    transformValue: (v) => 100 - Number(v),
    valueFormatter: (v) => `${Number(v).toFixed(1)}%`,
    needsDiscovery: true,
    searchText: (msaName) => `${msaName} Unemployment Rate`,
    pickSeries: (items) => {
      const candidates = items.filter((s) =>
        /^LAUMT/i.test(s.id) && /Unemployment Rate/i.test(s.title)
      );
      return candidates[0]?.id || items[0]?.id;
    },
  },
 
  HOUSING_HPI: {
    label: "Housing Inventory: Active Listing Count",
    seriesIdForCbsa: (cbsa) => `ACTLISCOU${cbsa}`,
    valueFormatter: (v) => `${Number(v).toLocaleString()}`,
    needsDiscovery: true,
    searchText: (msaName) => `Housing Inventory: Active Listing Count in ${msaName}`,
    pickSeries: (items, ctx) => {
      const { cbsa } = ctx || {};
      const candidates = items.filter((s) =>
        /^ACTLISCOU/i.test(s.id) && /Active Listing Count/i.test(s.title)
      );
      const byCbsa = candidates.find((s) => new RegExp(cbsa).test(s.id));
      if (byCbsa) return byCbsa.id;
      if (candidates[0]) return candidates[0].id;
      return items[0]?.id;
    },
  },
  GDP: {
    label: "GDP",
    // BEA Real GDP for MSAs: RGMP{CBSA}
    seriesIdForCbsa: (cbsa) => `RGMP${cbsa}`,
    valueFormatter: (v) => `${Number(v).toLocaleString()}`,
  },
};

// Minimal MSA list with CBSA codes
const MSAS = [
  { name: "Miami–Fort Lauderdale–West Palm Beach, FL", cbsa: "33100" },
  { name: "Tampa–St. Petersburg–Clearwater, FL", cbsa: "45300" },
  { name: "Orlando–Kissimmee–Sanford, FL", cbsa: "36740" },
  { name: "Atlanta–Sandy Springs–Roswell, GA", cbsa: "12060" },
];

function generateColorFromString(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    border: `hsl(${hue}, 70%, 45%)`,
    background: `hsla(${hue}, 70%, 45%, 0.2)`,
  };
}

function App() {
  const apiKey = import.meta.env.VITE_FRED_API_KEY;
  const [indicatorKey, setIndicatorKey] = useState("EMP_RATE");
  const [selectedMsas, setSelectedMsas] = useState([MSAS[0].cbsa, MSAS[1].cbsa]);
  const [seriesCache, setSeriesCache] = useState({}); // { seriesId: [{date, value}] }
  const [seriesIdMap, setSeriesIdMap] = useState({}); // { `${indicatorKey}|${cbsa}`: seriesId }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const indicator = INDICATORS[indicatorKey];

  const plannedSeries = useMemo(() => {
    return selectedMsas.map((cbsa) => {
      const msaName = MSAS.find((m) => m.cbsa === cbsa)?.name || cbsa;
      const key = `${indicatorKey}|${cbsa}`;
      const staticOverride = SERIES_OVERRIDES[key];
      const dynamicOverride = seriesIdMap[key];
      const seriesId = staticOverride || dynamicOverride || indicator.seriesIdForCbsa(cbsa);
      return { cbsa, msaName, seriesId };
    });
  }, [selectedMsas, indicatorKey, seriesIdMap]);

  useEffect(() => {
    let aborted = false;
    async function fetchMissing() {
      setError("");
      setLoading(true);
      try {
        // 1) Discover series IDs when needed
        if (indicator.needsDiscovery) {
          const discoveries = await Promise.all(
            plannedSeries.map(async ({ cbsa, msaName, seriesId }) => {
              const key = `${indicatorKey}|${cbsa}`;
              if (seriesIdMap[key]) return null;
              const q = indicator.searchText(msaName);
              const url = `${BASE_URL}/series/search?search_text=${encodeURIComponent(q)}&limit=100&api_key=${apiKey}&file_type=json`;
              const res = await fetch(url);
              if (!res.ok) return null;
              const json = await res.json();
              const items = json?.seriess || [];
              if (!items.length) return null;
              const picked = indicator.pickSeries ? indicator.pickSeries(items, { cbsa, msaName }) : items[0]?.id;
              return picked ? [key, picked] : null;
            })
          );
          const entries = discoveries.filter(Boolean);
          if (entries.length) {
            setSeriesIdMap((prev) => {
              const next = { ...prev };
              entries.forEach(([k, v]) => {
                next[k] = v;
              });
              return next;
            });
          }
        }

        const missing = plannedSeries.filter((p) => !seriesCache[p.seriesId]);
        if (!missing.length) return;
        const results = await Promise.all(
          missing.map(async ({ seriesId }) => {
      const url = `${BASE_URL}/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
      const cleaned = (json.observations || [])
        .filter((d) => d.value !== ".")
              .map((d) => {
                const raw = Number(d.value);
                const val = indicator.transformValue ? indicator.transformValue(raw) : raw;
                return { date: d.date, value: val };
              })
              .sort((a, b) => a.date.localeCompare(b.date));
            return [seriesId, cleaned];
          })
        );
        if (aborted) return;
        setSeriesCache((prev) => {
          const next = { ...prev };
          results.forEach(([id, data]) => {
            next[id] = data;
          });
          return next;
        });
      } catch (e) {
        if (!aborted) setError(``);
    } finally {
        if (!aborted) setLoading(false);
      }
    }
    if (apiKey) fetchMissing();
  }, [plannedSeries, apiKey]);

  const unifiedDates = useMemo(() => {
    const dateSet = new Set();
    plannedSeries.forEach(({ seriesId }) => {
      const rows = seriesCache[seriesId] || [];
      rows.forEach((r) => dateSet.add(r.date));
    });
    return Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  }, [seriesCache, plannedSeries]);

  const chartData = useMemo(() => {
    const datasets = plannedSeries.map(({ seriesId, msaName, cbsa }) => {
      const rows = seriesCache[seriesId] || [];
      const dateToVal = new Map(rows.map((r) => [r.date, r.value]));
      let border, background;
      if (cbsa === "36740") {
        border = "#FF00FF"; // Orlando - magenta
        background = "rgba(255, 0, 255, 0.25)";
      } else if (cbsa === "33100") {
        border = "#FFFF00"; // Miami - yellow
        background = "rgba(255, 255, 0, 0.25)";
      } else if (cbsa === "12060") {
        border = "#FFFFFF"; // Atlanta - white outline
        background = "rgba(255,255,255,0.18)";
      } else if (cbsa === "45300") {
        border = "#00FFFF"; // Tampa - cyan
        background = "rgba(0, 255, 255, 0.25)";
      } else {
        const c = generateColorFromString(msaName);
        border = c.border;
        background = c.background;
      }
      return {
        label: msaName,
        data: unifiedDates.map((d) => (dateToVal.has(d) ? dateToVal.get(d) : null)),
        borderColor: border,
        backgroundColor: background,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBorderWidth: 2,
        pointBackgroundColor: 'rgba(2,6,23,1)',
        pointStyle: 'circle',
        tension: 0.35,
        cubicInterpolationMode: 'monotone',
        spanGaps: true,
        fill: false,
      };
    });
    return { labels: unifiedDates, datasets };
  }, [unifiedDates, plannedSeries, seriesCache]);

  const barData = useMemo(() => {
    const labels = plannedSeries.map(({ msaName }) => msaName);
    const values = plannedSeries.map(({ seriesId }) => {
      const rows = seriesCache[seriesId] || [];
      const latest = rows[rows.length - 1];
      return latest ? latest.value : null;
    });
    const backgroundColor = plannedSeries.map(({ msaName, cbsa }) => {
      if (cbsa === "36740") return "rgba(255, 0, 255, 0.35)";
      if (cbsa === "33100") return "rgba(255, 255, 0, 0.35)";
      if (cbsa === "12060") return "rgba(255, 255, 255, 0.35)";
      if (cbsa === "45300") return "rgba(0, 255, 255, 0.35)";
      return generateColorFromString(msaName).background;
    });
    const borderColor = plannedSeries.map(({ msaName, cbsa }) => {
      if (cbsa === "36740") return "#FF00FF";
      if (cbsa === "33100") return "#FFFF00";
      if (cbsa === "12060") return "#FFFFFF";
      if (cbsa === "45300") return "#00FFFF";
      return generateColorFromString(msaName).border;
    });
    return {
      labels,
      datasets: [
        {
          label: INDICATORS[indicatorKey].label,
          data: values,
          backgroundColor,
          borderColor,
          borderWidth: 1.5,
      },
    ],
  };
  }, [plannedSeries, seriesCache, indicatorKey]);

  const stackedBarData = useMemo(() => {
    const dates = unifiedDates.slice(-12);
    const datasets = plannedSeries.map(({ msaName, cbsa, seriesId }) => {
      const rows = seriesCache[seriesId] || [];
      const map = new Map(rows.map((r) => [r.date, r.value]));
      let border, background;
      if (cbsa === "36740") {
        border = "#FF00FF";
        background = "rgba(255, 0, 255, 0.35)";
      } else if (cbsa === "33100") {
        border = "#FFFF00";
        background = "rgba(255, 255, 0, 0.35)";
      } else if (cbsa === "12060") {
        border = "#FFFFFF";
        background = "rgba(255,255,255,0.35)";
      } else if (cbsa === "45300") {
        border = "#00FFFF";
        background = "rgba(0, 255, 255, 0.35)";
      } else {
        const c = generateColorFromString(msaName);
        border = c.border;
        background = c.background;
      }
      return {
        label: msaName,
        data: dates.map((d) => (map.has(d) ? map.get(d) : null)),
        backgroundColor: background,
        borderColor: border,
        borderWidth: 1,
        stack: "msa",
      };
    });
    return { labels: dates, datasets };
  }, [plannedSeries, seriesCache, unifiedDates]);

  const latestRows = useMemo(() => {
    return plannedSeries.map(({ seriesId, msaName, cbsa }) => {
      const rows = seriesCache[seriesId] || [];
      const latest = rows[rows.length - 1];
      return { cbsa, msaName, seriesId, latest };
    });
  }, [plannedSeries, seriesCache]);

  // Build comparison rows (pivoted) for multiple MSAs and full series for single MSA
  const tableData = useMemo(() => {
    if (plannedSeries.length === 1) {
      const only = plannedSeries[0];
      const rows = seriesCache[only.seriesId] || [];
      return { mode: "single", rows };
    }
    const lastDates = unifiedDates.slice(-12);
    const seriesMaps = plannedSeries.map(({ seriesId }) => new Map((seriesCache[seriesId] || []).map((r) => [r.date, r.value])));
    const rows = lastDates.map((date) => {
      const values = plannedSeries.map((_, idx) => (seriesMaps[idx].has(date) ? seriesMaps[idx].get(date) : null));
      return { date, values };
    });
    return { mode: "multi", dates: lastDates, rows };
  }, [plannedSeries, seriesCache, unifiedDates]);

  function onSelectIndicator(e) {
    setSeriesCache({}); // reset cache when indicator changes
    setSeriesIdMap({}); // clear discovered map
    setIndicatorKey(e.target.value);
  }

  function onToggleMsa(cbsa) {
    setSelectedMsas((prev) =>
      prev.includes(cbsa) ? prev.filter((id) => id !== cbsa) : [...prev, cbsa]
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="container">
          <h1><span className="logo-emoji">📊</span> <span className="title-gradient">Data Dashboard</span></h1>
          <p className="app-subtitle">Federal Reserve Economic Data (FRED) Analytics Platform</p>
        </div>
      </header>
      <main className="container" style={{ padding: "1.5rem 0" }}>
        {!apiKey && (
          <div className="alert">
            Missing API key. Add <code>VITE_FRED_API_KEY</code> to your <code>.env</code> file.
          </div>
        )}

        <Filters
          indicatorOptions={Object.keys(INDICATORS).map((key) => ({ key, label: INDICATORS[key].label }))}
          indicatorKey={indicatorKey}
          onChangeIndicator={(val) => onSelectIndicator({ target: { value: val } })}
          msas={MSAS}
          selectedMsas={selectedMsas}
          onToggleMsa={onToggleMsa}
          onClearAll={() => {
            setSelectedMsas([]);
          }}
        />

        {selectedMsas.length === 0 ? (
          <section className="card" style={{ marginTop: 16 }}>
            <p className="empty-state">No data to display. Select at least one region.</p>
          </section>
        ) : (
          <>
            <section className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title">Current {INDICATORS[indicatorKey].label}</h3>
              <div className="stats-grid">
                {latestRows.map(({ msaName, latest }) => (
                  <div className="stat-card" key={`stat-${msaName}`}>
                    <div className="stat-title">{msaName}</div>
                    <div className="stat-value">
                      {latest ? INDICATORS[indicatorKey].valueFormatter(latest.value) : "—"}
                    </div>
                    <div className="stat-sub">
                      {latest ? latest.date : "No data"}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="chart-wrap">
                <Line
                  data={chartData}
                  options={{
    responsive: true,
                maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
                  title: { display: true, text: INDICATORS[indicatorKey].label },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed?.y;
                        const name = ctx.dataset?.label || "";
                        if (val == null) return name;
                        return `${name}: ${INDICATORS[indicatorKey].valueFormatter(val)}`;
                      },
                    },
                  },
                  legend: {
                    position: "top",
                    labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10, padding: 16 },
                  },
                },
                interaction: { mode: "nearest", axis: "x", intersect: false },
                scales: {
                  x: {
                    title: { display: true, text: "Date" },
                    ticks: { maxTicksLimit: 10 },
                    grid: { color: 'rgba(148,163,184,0.15)', borderColor: '#334155', borderDash: [4,4] },
                  },
                  y: {
                    title: { display: true, text: INDICATORS[indicatorKey].label },
                    beginAtZero: false,
                    grid: { color: 'rgba(148,163,184,0.15)', borderColor: '#334155', borderDash: [4,4] },
                  },
                },
                  }}
                />
              </div>
            </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="chart-wrap" style={{ height: 360 }}>
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  title: { display: true, text: `${INDICATORS[indicatorKey].label} — Latest Comparison` },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const v = ctx.parsed?.y;
                        if (v == null) return ctx.label || "";
                        return INDICATORS[indicatorKey].valueFormatter(v);
                      },
                    },
                  },
    },
    scales: {
                  x: { title: { display: true, text: "Region" }, grid: { display: false } },
                  y: { title: { display: true, text: INDICATORS[indicatorKey].label }, grid: { color: "rgba(200,200,200,0.2)" } },
                },
              }}
            />
      </div>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="chart-wrap" style={{ height: 360 }}>
            <Bar
              data={stackedBarData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "top" },
                  title: { display: true, text: `${INDICATORS[indicatorKey].label} — Last 12 Periods` },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                      label: (ctx) => {
                        const v = ctx.parsed?.y;
                        const name = ctx.dataset?.label || "";
                        if (v == null) return name;
                        return `${name}: ${INDICATORS[indicatorKey].valueFormatter(v)}`;
                      },
                    },
                  },
                },
                scales: {
                  x: { stacked: true, title: { display: true, text: "Date" }, grid: { display: false } },
                  y: { stacked: true, title: { display: true, text: INDICATORS[indicatorKey].label }, grid: { color: "rgba(200,200,200,0.2)" } },
                },
              }}
            />
          </div>
        </section>

            <section className="card" style={{ marginTop: 16 }}>
          {tableData.mode === "single" ? (
            <>
              <h3 style={{ marginTop: 0 }}>
                {INDICATORS[indicatorKey].label} — All Observations
              </h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th align="left">Date</th>
                      <th align="right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.slice(-50).map((r) => (
                      <tr key={r.date}>
                        <td>{r.date}</td>
                        <td align="right">{INDICATORS[indicatorKey].valueFormatter(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="help">Showing last 50 periods</div>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>
                {INDICATORS[indicatorKey].label} — Comparison (last 12 periods)
              </h3>
              <div className="table-wrap">
                <table className="data-table">
              <thead>
                <tr>
                      <th align="left">Date</th>
                      {plannedSeries.map(({ msaName, cbsa }) => (
                        <th key={`col-${cbsa}`} align="right">{msaName}</th>
                      ))}
                </tr>
              </thead>
              <tbody>
                    {tableData.rows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        {row.values.map((val, idx) => (
                          <td key={`cell-${row.date}-${idx}`} align="right">
                            {val == null ? "—" : INDICATORS[indicatorKey].valueFormatter(val)}
                          </td>
                        ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
        </section>
          </>
        )}
      </main>
    </>
  );
}

export default App;
