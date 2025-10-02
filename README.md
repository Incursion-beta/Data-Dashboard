# FRED Regional Indicators Dashboard

A React + Vite analytics dashboard for exploring **Federal Reserve Economic Data (FRED)** with interactive filters and rich visualizations.

## ✨ Features

- **Live FRED data**: Fetches series by CBSA (MSA) with API key
- **Modern UI**: Dark theme, glass cards, gradient accents, responsive layout
- **Filters**: Indicator dropdown, multi-select MSAs with chips, Clear All
- **Charts**:
  - Smooth multi-series line chart (time series)
  - Latest-value comparison bar chart
  - Stacked bar chart for last 12 periods
- **Tables**:
  - Single-region full series table
  - Multi-region comparison table (last 12 periods)

## 📦 Tech Stack

- React + Vite
- Chart.js + react-chartjs-2
- Fetch API

## 🔧 Setup

1) Install dependencies
```
npm install
```

2) Configure environment
```
Update .env and add your API key
# then set your key
VITE_FRED_API_KEY=your_actual_fred_api_key_here
```

3) Run locally
```
npm start
```
Open the printed local URL (typically http://localhost:5173).

## 📈 Indicators and Regions

Included indicators (extendable in `src/App.jsx`):
- Employment Rate (derived from unemployment rate)
- Housing Inventory: Active Listing Count (Realtor.com)
- GDP (BEA RGMP series)



## 🔍 Customization

- Add more MSAs in the `MSAS` array in `src/App.jsx`.
- Add indicators by defining how to compute a series ID per CBSA and optional transform/formatters in the `INDICATORS` map.




## 📝 Notes

- This project uses a Vite dev proxy for FRED (`/fred`) to avoid CORS in development. In production, requests go directly to `https://api.stlouisfed.org`.
- Some series discovery uses the FRED Series Search API to resolve the best available series for an MSA when patterns vary.
