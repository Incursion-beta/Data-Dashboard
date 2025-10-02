export default function Filters({
  indicatorOptions,
  indicatorKey,
  onChangeIndicator,
  msas,
  selectedMsas,
  onToggleMsa,
  onClearAll,
}) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="filters-header">
        <h3 className="filters-title">Data Filters</h3>
        <button className="pill-button" onClick={onClearAll}>Clear All</button>
      </div>

      <div className="filters">
        <div className="field" style={{ flex: 1 }}>
          <label>Economic Indicators</label>
          <select className="select-input" value={indicatorKey} onChange={(e) => onChangeIndicator(e.target.value)}>
            {indicatorOptions.map((opt) => (
              <option value={opt.key} key={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="chips">
            {indicatorOptions
              .filter((o) => o.key === indicatorKey)
              .map((o) => (
                <span key={o.key} className="chip chip-indicator">
                  {o.label}
                </span>
              ))}
          </div>
        </div>

        <div className="field" style={{ flex: 1 }}>
          <label>Geographic Areas</label>
          <select
            className="select-input"
            value=""
            onChange={(e) => {
              if (e.target.value) onToggleMsa(e.target.value);
            }}
          >
            <option value="">Select a region…</option>
            {msas.map((m) => (
              <option key={m.cbsa} value={m.cbsa}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="chips">
            {msas
              .filter((m) => selectedMsas.includes(m.cbsa))
              .map((m) => (
                <span key={m.cbsa} className="chip chip-region">
                  {m.name}
                  <button className="chip-close" onClick={() => onToggleMsa(m.cbsa)}>×</button>
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}


