/**
 * Chart colours and Plotly layout for the amber terminal theme (src/theme.css).
 */

/**
 * Categorical colours in fixed order, checked for colour-blind separation on the
 * panel surface (#120b03): amber, blue, green, rose, violet, teal.
 */
export const CATEGORICAL = ['#c68206', '#407bc5', '#34893c', '#d56a8f', '#7b50b9', '#08a2af']

/** Sequential scale for magnitude (dark brown to bright amber). */
export const AMBER_SCALE = [
  [0, '#3d2808'],
  [0.35, '#6b450c'],
  [0.7, '#c68206'],
  [1, '#ffd98a'],
]

/** Plotly's colorscale for a chart: the amber scale unless one was chosen on purpose. */
export function colorscaleFor(name) {
  return !name || name === 'Viridis' ? AMBER_SCALE : name
}

/** One amber shade per item, brightest first (bars by rank, pie slices). */
export function amberShade(i, n, from = 62, to = 26) {
  const light = from - (i / Math.max(1, n - 1)) * (from - to)
  return `hsl(40, 100%, ${light.toFixed(1)}%)`
}

const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace'

/** Base layout shared by every Plotly chart. */
export function plotlyBase() {
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(255,176,0,0.03)',
    font: { color: '#d4921c', family: MONO, size: 12 },
    colorway: CATEGORICAL,
    hoverlabel: { bgcolor: '#120b03', bordercolor: '#ffb000', font: { color: '#ffd98a', family: MONO, size: 12 } },
    xaxis: { gridcolor: 'rgba(255,176,0,0.10)', zerolinecolor: 'rgba(255,176,0,0.25)', linecolor: '#6b450c' },
    yaxis: { gridcolor: 'rgba(255,176,0,0.10)', zerolinecolor: 'rgba(255,176,0,0.25)', linecolor: '#6b450c' },
  }
}

/** A 2px gap in the background colour between neighbouring fills (pie slices, bars). */
export const SURFACE_GAP = { color: '#0a0602', width: 2 }
