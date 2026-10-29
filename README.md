# ScanLake Dashboard

A browser-based analytics dashboard for ScanLake scan data. Parquet files are queried in-browser using DuckDB WebAssembly. The dashboard runs as a static site on Cloudflare Pages, with a server-side Pages Function acting as a secure proxy to the ScanLake Gateway API.

## How it works

On load, the app fetches the consolidated Parquet files that ScanLake Refinery publishes to the `scanlake-derived` bucket (`/api/derived/consolidated/{scans,compositions,confidences}.parquet`) and registers each as a view of the same name inside DuckDB WASM. The Refinery already deduplicates captures, unifies the schema and normalises names, so the dashboard does no merging of its own.

The files are cached in the browser (Cache Storage, `scanlake-parquet`). Each load first reads the bucket's `manifest.json` and looks up every file by the sha256 listed there, so a reload downloads only the files the Refinery has changed since, and older versions are removed from the cache. If the manifest can't be read, the files are downloaded without caching.

An open tab checks the manifest again every 15 minutes. When a file's hash has changed, it downloads only that file, points the view at it and re-runs the panels and filter suggestions. If the check fails, the loaded data stays in place. All subsequent queries run entirely in the browser — no backend is needed for query execution.

The Cloudflare Pages Function at `functions/api/[[path]].js` forwards requests to `gateway.scanlake.rocks`, injecting the `GATEWAY_API_KEY` secret server-side so it is never exposed to the browser.

## Features

- Three tabs (`#dashboard`, `#results`, `#highscores` in the URL): the panel dashboard, the Refinery's result tables, and the highscore boards
- Results tab: `results/deposit_materials_by_region.parquet` as one card per location, materials ordered by concentration; click a card for deposit and material charts, time between clusters and quality bands (by SCU or count). Filterable by location (gravity well / system / region), deposit and material (deposit and material accept `!` to exclude). The other result tables are loaded but not shown
- Highscores tab: the top 10 per category from `results/highscores.parquet`
- A running text under the header lists sessions that are new since the last visit or the last background refresh (the known session ids are kept in `localStorage`; the first visit only records them). It can be dismissed
- Drag-and-drop resizable panel grid (GridStack)
- Chart panels (bar, scatter, pie) powered by Plotly
- Stats panels for aggregate metrics
- SQL query editor with syntax highlighting (CodeMirror 6)
- Filter sidebar: location (gravity well / system / region), deposit, material, and quality range
- Dashboard layout persisted to `localStorage` and exportable/importable as JSON
- Default dashboard loaded from `public/default-dashboard.json`

## Development

```bash
npm install
npm run dev
```

For local development with the API proxy, use Wrangler:

```bash
npx wrangler pages dev dist --binding GATEWAY_API_KEY=sk_...
```

Build first if you want Wrangler to serve the built assets:

```bash
npm run build
npx wrangler pages dev dist --binding GATEWAY_API_KEY=sk_...
```

## Deployment

Deploy to Cloudflare Pages:

```bash
npm run build
npx wrangler pages deploy dist
```

Set `GATEWAY_API_KEY` as a secret in the Cloudflare Pages dashboard under **Settings > Environment variables**. It must never be committed to source control.

## Dashboard configuration

The layout and panel definitions are stored as JSON with the following structure:

```json
{
  "version": 1,
  "panels": [...],
  "layout": [{ "id": "panel-id", "x": 0, "y": 0, "w": 6, "h": 4 }]
}
```

Each panel has a `type` of either `"chart"` or `"stats"`. Chart panels reference a `builtinKey` (mapped to SQL in `src/lib/queries.js`) or carry an inline `sql` string. The layout can be exported from the header and re-imported to restore or share a configuration.

## Tech stack

| Layer | Library |
|---|---|
| UI framework | Vue 3 (Composition API) |
| State management | Pinia |
| Build tool | Vite |
| In-browser SQL | DuckDB WASM |
| Charts | Plotly.js |
| Grid layout | GridStack |
| SQL editor | CodeMirror 6 |
| Hosting / proxy | Cloudflare Pages |
