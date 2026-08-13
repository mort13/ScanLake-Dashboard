<template>
  <Teleport to="body">
    <div v-show="open" class="modal-backdrop" @click.self="emit('close')">
      <div class="modal query-editor-modal">
        <!-- Header -->
        <div class="modal-header">
          <h2>Query Editor</h2>
          <button class="modal-close" @click="emit('close')">×</button>
        </div>

        <!-- Tabs -->
        <div class="modal-tabs">
          <button
            v-for="t in TABS"
            :key="t.id"
            class="modal-tab"
            :class="{ active: activeTab === t.id }"
            @click="activeTab = t.id"
          >{{ t.label }}</button>
        </div>

        <!-- Tab: SQL Runner -->
        <div v-show="activeTab === 'sql'" class="tab-pane">
          <p class="tab-hint">
            Query <code>scans</code> and <code>compositions</code> (join on <code>capture_id</code>).
            Results appear in the table below. Use "Save as Panel" to add to the dashboard.
          </p>
          <div ref="sqlEditorEl" class="code-editor" />
          <div class="editor-actions">
            <button class="btn-primary" @click="runSQL" :disabled="running">
              {{ running ? 'Running…' : '▶ Run' }}
            </button>
            <button class="btn-secondary" @click="openSaveDialog" :disabled="!sqlRows.length">
              + Save as Panel
            </button>
            <span v-if="sqlError" class="run-error">{{ sqlError }}</span>
          </div>
          <ResultTable :rows="sqlRows" />
        </div>

        <!-- Tab: Chart Builder -->
        <div v-show="activeTab === 'chart'" class="tab-pane">
          <p class="tab-hint">
            Write SQL, fetch columns, map axes, preview — then save to the dashboard.
          </p>
          <div ref="chartSqlEditorEl" class="code-editor" />
          <div class="editor-actions">
            <button class="btn-secondary" @click="fetchColumns" :disabled="fetchingCols">
              {{ fetchingCols ? 'Fetching…' : '⟳ Fetch Columns' }}
            </button>
            <span v-if="chartFetchError" class="run-error">{{ chartFetchError }}</span>
          </div>

          <div v-if="columns.length > 0" class="chart-builder">
            <div class="mapping-grid">
              <label>Chart type</label>
              <select v-model="cbType">
                <option value="bar">Bar</option>
                <option value="scatter">Scatter</option>
                <option value="pie">Pie</option>
              </select>

              <label>X axis</label>
              <select v-model="cbX">
                <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
              </select>

              <label>Y axis</label>
              <select v-model="cbY">
                <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
              </select>

              <label v-if="cbType === 'scatter'">Color column</label>
              <select v-if="cbType === 'scatter'" v-model="cbColor">
                <option value="">— none —</option>
                <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
              </select>

              <label>Orientation (bar)</label>
              <select v-if="cbType === 'bar'" v-model="cbOrientation">
                <option value="v">Vertical</option>
                <option value="h">Horizontal</option>
              </select>
            </div>

            <div class="editor-actions">
              <button class="btn-secondary" @click="previewChart" :disabled="running">Preview</button>
              <button class="btn-primary" @click="saveChartPanel" :disabled="!cbX || !cbY">
                + Save to Dashboard
              </button>
            </div>

            <div v-if="previewRows.length > 0" ref="previewEl" class="chart-preview" />
          </div>
        </div>

        <!-- Tab: Schema -->
        <div v-show="activeTab === 'schema'" class="tab-pane schema-tab">
          <div v-for="table in schemaData" :key="table.name" class="schema-table">
            <h4>{{ table.name }}</h4>
            <table class="result-table">
              <thead><tr><th>Column</th><th>Type</th></tr></thead>
              <tbody>
                <tr v-for="col in table.cols" :key="col.column_name">
                  <td>{{ col.column_name }}</td>
                  <td class="type-cell">{{ col.column_type }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!schemaData.length" class="tab-hint">Connect to the gateway first.</p>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Save panel dialog -->
  <Teleport to="body">
    <div v-if="saveDialogOpen" class="modal-backdrop" @click.self="saveDialogOpen = false">
      <div class="modal save-dialog">
        <div class="modal-header">
          <h3>Save as Panel</h3>
          <button class="modal-close" @click="saveDialogOpen = false">×</button>
        </div>
        <div class="save-form">
          <label>Panel title</label>
          <input v-model="saveTitle" class="text-input" placeholder="My custom panel" />
          <label>Panel type</label>
          <select v-model="saveType" class="text-input">
            <option value="table">Table</option>
            <option value="chart">Chart (configure in Chart Builder tab)</option>
          </select>
          <div class="editor-actions">
            <button class="btn-primary" @click="confirmSaveSQL">Save</button>
            <button class="btn-ghost" @click="saveDialogOpen = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useDbStore } from '@/stores/db'
import { useDashboardStore } from '@/stores/dashboard'
import ResultTable from './ResultTable.vue'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const TABS = [
  { id: 'sql', label: 'SQL Runner' },
  { id: 'chart', label: 'Chart Builder' },
  { id: 'schema', label: 'Schema' },
]

const db = useDbStore()
const dashboard = useDashboardStore()

const activeTab = ref('sql')

// ── Editors ───────────────────────────────────────────────────────
const sqlEditorEl = ref(null)
const chartSqlEditorEl = ref(null)
let sqlEditor = null
let chartSqlEditor = null

const DEFAULT_SQL = `-- Example: average mass per deposit type
SELECT deposit,
       ROUND(AVG(mass), 1) AS avg_mass,
       COUNT(*) AS n
FROM scans
GROUP BY deposit
ORDER BY avg_mass DESC;`

const DEFAULT_CHART_SQL = `SELECT s.mass, s.resistance, s.instability, s.deposit
FROM scans s
LIMIT 2000`

onMounted(() => {
  sqlEditor = new EditorView({
    doc: DEFAULT_SQL,
    extensions: [basicSetup, sql(), oneDark],
    parent: sqlEditorEl.value,
  })
  chartSqlEditor = new EditorView({
    doc: DEFAULT_CHART_SQL,
    extensions: [basicSetup, sql(), oneDark],
    parent: chartSqlEditorEl.value,
  })
  if (db.isReady) loadSchema()
})

onBeforeUnmount(() => {
  sqlEditor?.destroy()
  chartSqlEditor?.destroy()
})

// ── SQL runner ────────────────────────────────────────────────────
const running = ref(false)
const sqlError = ref(null)
const sqlRows = ref([])

async function runSQL() {
  const userSql = sqlEditor?.state.doc.toString().trim()
  if (!userSql || !db.isReady) return
  running.value = true
  sqlError.value = null
  try {
    sqlRows.value = await db.runQuery(userSql)
  } catch (err) {
    sqlError.value = err.message
    sqlRows.value = []
  } finally {
    running.value = false
  }
}

// ── Chart Builder ─────────────────────────────────────────────────
const fetchingCols = ref(false)
const chartFetchError = ref(null)
const columns = ref([])
const cbType = ref('bar')
const cbX = ref('')
const cbY = ref('')
const cbColor = ref('')
const cbOrientation = ref('v')
const previewRows = ref([])
const previewEl = ref(null)

async function fetchColumns() {
  const userSql = chartSqlEditor?.state.doc.toString().trim()
  if (!userSql || !db.isReady) return
  fetchingCols.value = true
  chartFetchError.value = null
  try {
    const rows = await db.runQuery(userSql + ' LIMIT 1')
    columns.value = rows.length > 0 ? Object.keys(rows[0]) : []
    if (columns.value.length > 0) {
      cbX.value = columns.value[0]
      cbY.value = columns.value[1] ?? columns.value[0]
    }
  } catch (err) {
    chartFetchError.value = err.message
    columns.value = []
  } finally {
    fetchingCols.value = false
  }
}

async function previewChart() {
  const userSql = chartSqlEditor?.state.doc.toString().trim()
  if (!userSql || !db.isReady) return
  running.value = true
  try {
    previewRows.value = await db.runQuery(userSql)
    await nextTick()
    renderPreview()
  } finally {
    running.value = false
  }
}

function renderPreview() {
  if (!previewEl.value || previewRows.value.length === 0) return
  const rows = previewRows.value
  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(255,255,255,0.03)',
    font: { color: '#c9d1d9', size: 12 },
    margin: { t: 10, r: 16, b: 48, l: 52 },
    showlegend: false,
    xaxis: { gridcolor: 'rgba(255,255,255,0.07)' },
    yaxis: { gridcolor: 'rgba(255,255,255,0.07)' },
  }

  let data = []
  if (cbType.value === 'pie') {
    data = [{ type: 'pie', labels: rows.map((r) => r[cbX.value]), values: rows.map((r) => r[cbY.value]), textinfo: 'label+percent' }]
  } else if (cbType.value === 'scatter') {
    data = [{ type: 'scatter', mode: 'markers', x: rows.map((r) => r[cbX.value]), y: rows.map((r) => r[cbY.value]),
      marker: { color: cbColor.value ? rows.map((r) => r[cbColor.value]) : undefined, colorscale: 'Viridis', showscale: !!cbColor.value, size: 6, opacity: 0.8 } }]
  } else {
    data = [{ type: 'bar', x: rows.map((r) => r[cbX.value]), y: rows.map((r) => r[cbY.value]), orientation: cbOrientation.value }]
  }

  Plotly.react(previewEl.value, data, layout, { responsive: true, displayModeBar: false })
}

function saveChartPanel() {
  const userSql = chartSqlEditor?.state.doc.toString().trim()
  if (!userSql || !cbX.value || !cbY.value) return
  const id = 'custom-' + Date.now()
  dashboard.addPanel({
    id,
    type: 'chart',
    title: 'Custom Chart',
    custom: true,
    filterable: false,
    sql: userSql,
    chart: {
      type: cbType.value,
      x: cbX.value,
      y: cbY.value,
      color: cbColor.value || null,
      colorscale: 'Viridis',
      orientation: cbOrientation.value,
    },
  })
  emit('close')
}

// ── Save SQL as table/chart panel ─────────────────────────────────
const saveDialogOpen = ref(false)
const saveTitle = ref('My Query')
const saveType = ref('table')

function openSaveDialog() {
  saveDialogOpen.value = true
}

function confirmSaveSQL() {
  const userSql = sqlEditor?.state.doc.toString().trim()
  if (!userSql) return
  const id = 'custom-' + Date.now()
  dashboard.addPanel({
    id,
    type: saveType.value === 'table' ? 'table' : 'chart',
    title: saveTitle.value || 'Custom Panel',
    custom: true,
    filterable: false,
    sql: userSql,
    chart: saveType.value === 'chart' ? { type: 'bar', x: '', y: '', colorscale: 'Viridis' } : null,
  })
  saveDialogOpen.value = false
  emit('close')
}

// ── Schema ────────────────────────────────────────────────────────
const schemaData = ref([])

async function loadSchema() {
  try {
    const [scans, comps] = await Promise.all([
      db.describeTable('scans'),
      db.describeTable('compositions'),
    ])
    schemaData.value = [
      { name: 'scans', cols: scans },
      { name: 'compositions', cols: comps },
    ]
  } catch {}
}

watch(() => db.isReady, (ready) => { if (ready) loadSchema() })
watch(() => props.open, (open) => { if (open && db.isReady && activeTab.value === 'schema') loadSchema() })
</script>
