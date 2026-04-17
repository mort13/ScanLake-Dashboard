# ScanLake Dashboard

A browser-based analytics dashboard for ScanLake scan data. Parquet files are queried in-browser using DuckDB WebAssembly. The dashboard runs as a static site on Cloudflare Pages, with a server-side Pages Function acting as a secure proxy to the ScanLake Gateway API.

## How it works

On load, the app fetches the list of available Parquet files from `/api/files` and registers them as views inside DuckDB WASM. All subsequent queries run entirely in the browser — no backend is needed for query execution.

The Cloudflare Pages Function at `functions/api/[[path]].js` forwards requests to `gateway.scanlake.rocks`, injecting the `GATEWAY_API_KEY` secret server-side so it is never exposed to the browser.

## Features

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
