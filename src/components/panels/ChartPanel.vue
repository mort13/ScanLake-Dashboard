<template>
  <div class="chart-panel-inner">
    <div v-if="loading" class="panel-loading">
      <span class="spinner" />
    </div>
    <div v-else-if="queryError" class="panel-error">
      <span>{{ queryError }}</span>
    </div>
    <div v-else ref="plotEl" class="plotly-container" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { getBuiltinSQL } from '@/lib/queries'

const props = defineProps({
  panel: { type: Object, required: true },
})

const db = useDbStore()
const filters = useFiltersStore()

const plotEl = ref(null)
const loading = ref(true)
const queryError = ref(null)
let plotted = false

async function refresh() {
  if (!db.isReady) return
  loading.value = true
  queryError.value = null

  try {
    const where = filters.buildWhere()
    const sql = props.panel.sql || getBuiltinSQL(props.panel.builtinKey, where)
    if (!sql) throw new Error('No SQL defined for panel')

    const rows = await db.runQuery(sql)
    loading.value = false   // must be false so v-else mounts plotEl before renderPlot
    await nextTick()
    renderPlot(rows)
  } catch (err) {
    queryError.value = err.message
    loading.value = false
  }
}

function renderPlot(rows) {
  if (!plotEl.value) return

  if (rows.length === 0) {
    Plotly.purge(plotEl.value)
    plotted = false
    return
  }

  const chart = props.panel.chart
  const type = chart.type || 'bar'

  let data = []
  const layout = plotlyLayout(props.panel.title)

  if (type === 'pie') {
    // Pie: use solid blue, no colorscale
    data = [{
      type: 'pie',
      labels: rows.map((r) => r[chart.x]),
      values: rows.map((r) => r[chart.y]),
      textinfo: 'label+percent',
      hoverinfo: 'label+value+percent',
      marker: {
        color: rows.map((_, i) => {
          // Blue gradient by index
          const hue = 210
          const light = 50 + (i / Math.max(1, rows.length - 1)) * 30
          return `hsl(${hue}, 70%, ${light}%)`
        }),
      },
    }]
    layout.showlegend = true
  } else if (type === 'scatter') {
    const colorCol = chart.color
    const colors = colorCol ? rows.map((r) => r[colorCol]) : undefined
    const colorscale = colorCol ? (chart.colorscale || 'Viridis') : undefined

    data = [{
      type: 'scatter',
      mode: 'markers',
      x: rows.map((r) => r[chart.x]),
      y: rows.map((r) => r[chart.y]),
      text: rows.map((r) => hoverText(r, chart)),
      hoverinfo: 'text',
      marker: {
        size: 7,
        opacity: 0.8,
        color: colors || '#5470c6',
        colorscale,
        showscale: !!colorCol,
        colorbar: colorCol ? { title: { text: colorCol }, thickness: 12, len: 0.7 } : undefined,
      },
    }]
    layout.xaxis = { title: { text: chart.x }, color: 'var(--text-muted)' }
    layout.yaxis = { title: { text: chart.y }, color: 'var(--text-muted)' }
  } else {
    // bar: use blue gradient, not colorscale
    const xs = rows.map((r) => r[chart.x])
    const ys = rows.map((r) => r[chart.y])

    const marker = {
      color: rows.map((_, i) => {
        // Blue gradient by rank
        const hue = 210
        const light = 40 + (i / Math.max(1, rows.length - 1)) * 40
        return `hsl(${hue}, 70%, ${light}%)`
      }),
    }

    data = [{
      type: 'bar',
      x: chart.orientation === 'h' ? ys : xs,
      y: chart.orientation === 'h' ? xs : ys,
      orientation: chart.orientation || 'v',
      marker,
    }]
    if (chart.orientation === 'h') {
      layout.xaxis = { title: { text: chart.y } }
      layout.yaxis = { automargin: true }
    } else {
      layout.xaxis = { title: { text: chart.x }, tickangle: -35, automargin: true }
      layout.yaxis = { title: { text: chart.y } }
    }
  }

  Plotly.react(plotEl.value, data, layout, { responsive: true, displayModeBar: false })
  plotted = true
}

function plotlyLayout(title) {
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(255,255,255,0.03)',
    font: { color: '#c9d1d9', family: 'Inter, system-ui, sans-serif', size: 12 },
    margin: { t: 10, r: 16, b: 48, l: 52 },
    showlegend: false,
    xaxis: { gridcolor: 'rgba(255,255,255,0.07)', zerolinecolor: 'rgba(255,255,255,0.1)' },
    yaxis: { gridcolor: 'rgba(255,255,255,0.07)', zerolinecolor: 'rgba(255,255,255,0.1)' },
  }
}

function hoverText(row, chart) {
  return Object.entries(row)
    .map(([k, v]) => `${k}: ${v}`)
    .join('<br>')
}

onMounted(() => {
  if (db.isReady) refresh()
})

// Refresh when DB becomes ready
watch(() => db.isReady, (ready) => { if (ready) refresh() })

// Refresh when filters change (only if panel is filterable)
watch(
  () => filters.filterSignature,
  () => { if (props.panel.filterable !== false) refresh() },
)

onBeforeUnmount(() => {
  if (plotEl.value && plotted) Plotly.purge(plotEl.value)
})
</script>
