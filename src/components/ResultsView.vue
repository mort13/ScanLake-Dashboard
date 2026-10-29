<template>
  <div class="results-view">
    <!-- A location's details replace the cards; the filter sidebar stays available -->
    <LocationDetail v-if="detail && cardMode" :location="detail" @close="detail = null" />

    <template v-else>
    <!-- Only worth showing when there is something to switch between -->
    <div v-if="tables.length > 1" class="view-toolbar">
      <div class="result-tabs" role="tablist">
        <button
          v-for="name in tables"
          :key="name"
          class="result-chip"
          :class="{ active: name === results.active }"
          role="tab"
          @click="results.active = name"
        >{{ prettyName(name) }}</button>
      </div>
    </div>

    <div class="results-meta">
      <span v-if="unused.length" class="meta-note">
        The {{ unused.join(' and ') }} filter doesn't apply to this table (no matching column).
      </span>
      <span v-else-if="error" class="panel-error">{{ error }}</span>
      <span v-else-if="ignored" class="meta-note">Quality and date filters don't apply to these results.</span>
      <span v-else class="meta-count">{{ total.toLocaleString() }} {{ total === 1 ? 'row' : 'rows' }}</span>
      <span class="meta-spacer" />
      <button class="btn-secondary" :disabled="total === 0" @click="exportCsv">↓ CSV</button>
    </div>

    <div v-if="tables.length === 0" class="no-results">
      No result tables were published yet.
    </div>
    <div v-else-if="rows.length === 0 && !loading" class="no-results">No rows match the filters.</div>
    <div v-else-if="cardMode" class="region-grid">
      <section
        v-for="card in cards"
        :key="card.key"
        class="region-card"
        role="button"
        tabindex="0"
        title="Show details"
        @click="detail = card"
        @keydown.enter="detail = card"
      >
        <header class="region-head">
          <h3>{{ card.region ?? card.gravity_well }}</h3>
          <p>{{ card.region ? `${card.system} · ${card.gravity_well}` : card.system }}</p>
        </header>
        <ol class="region-materials">
          <li v-for="m in card.materials" :key="m.material" :title="`Present in ${formatCell(m.presence)}% of scans`">
            <span class="mat-name">{{ m.material }}</span>
            <span class="mat-bar"><span :style="{ width: Math.min(100, m.share) + '%' }" /></span>
            <span class="mat-share">{{ formatCell(m.share) }}%</span>
          </li>
        </ol>
        <footer class="region-foot">{{ card.scans.toLocaleString() }} scans · {{ card.materials.length }} materials</footer>
      </section>
    </div>
    <div v-else class="table-scroll results-table-wrap">
      <table class="result-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              class="sortable"
              :class="{ sorted: results.sort.column === col }"
              :title="col"
              @click="toggleSort(col)"
            >
              {{ col.replace(/_/g, ' ') }}
              <span class="sort-arrow">{{ sortArrow(col) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i">
            <td v-for="col in columns" :key="col" :class="{ num: typeof row[col] === 'number', empty: row[col] == null }">
              {{ formatCell(row[col]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!cardMode && pageCount > 1" class="results-pager">
      <button class="btn-ghost" :disabled="page === 0" @click="page--">‹ Prev</button>
      <span>Page {{ page + 1 }} / {{ pageCount }}</span>
      <button class="btn-ghost" :disabled="page >= pageCount - 1" @click="page++">Next ›</button>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { useResultsStore } from '@/stores/results'
import { selectList, metaLast, prettyName, formatCell } from '@/lib/results'
import { rowsToCsv, downloadCsv } from '@/lib/csv'
import LocationDetail from '@/components/LocationDetail.vue'

const PAGE_SIZE = 100

const db = useDbStore()
const filters = useFiltersStore()
const results = useResultsStore()

const schema = ref([]) // DESCRIBE of the active table
const rows = ref([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const error = ref(null)
const cards = ref([]) // one per location, in card mode
const detail = ref(null) // the card whose details are open

// This table is shown as one card per region instead of a grid
const CARD_TABLE = 'deposit_materials_by_region'
const cardMode = computed(() => results.active === CARD_TABLE)

// The result tables that get a tab, in this order (highscores have their own page)
const SHOWN_TABLES = [CARD_TABLE]
const tables = computed(() => SHOWN_TABLES.filter((t) => db.resultTables.includes(t)))
const columns = computed(() => schema.value.map((c) => c.column_name))
const unused = computed(() => results.unusedFilters(columns.value))
const pageCount = computed(() => Math.ceil(total.value / PAGE_SIZE))
// The results are precomputed, so the sidebar's quality and date filters can't be applied
const ignored = computed(
  () =>
    filters.qualityRange[0] !== 0 ||
    filters.qualityRange[1] !== 1000 ||
    filters.dateRange[0] !== null ||
    filters.dateRange[1] !== null,
)

function orderClause() {
  const { column, desc } = results.sort
  return column && columns.value.includes(column)
    ? `ORDER BY "${column}" ${desc ? 'DESC' : 'ASC'} NULLS LAST`
    : ''
}

async function load() {
  const name = results.active
  if (!db.isReady || !name) return
  loading.value = true
  error.value = null
  try {
    schema.value = metaLast(await db.describeTable(`results_${name}`))
    const where = results.buildWhere(columns.value)
    if (name === CARD_TABLE) {
      await loadCards(where)
      return
    }
    cards.value = []
    const from = `FROM "results_${name}" WHERE ${where}`
    const [count] = await db.runQuery(`SELECT count(*) AS n ${from}`)
    total.value = count.n
    rows.value = await db.runQuery(
      `SELECT ${selectList(schema.value)} ${from} ${orderClause()} LIMIT ${PAGE_SIZE} OFFSET ${page.value * PAGE_SIZE}`,
    )
  } catch (err) {
    error.value = err.message
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * Groups the by-region rows into one card per location. A material's
 * concentration is its average share over all scans at the location: each
 * deposit's avg_share_pct weighted by that deposit's scans, divided by the
 * scans of every deposit there (so deposits without the material count as 0).
 * The material filter only selects what is listed; it doesn't change the maths.
 */
async function loadCards(where) {
  const table = `"results_${CARD_TABLE}"`
  const whereAll = results.buildWhere(columns.value, ['material'])
  const loc = 'system, gravity_well, region'
  const [data, denoms] = await Promise.all([
    db.runQuery(
      `SELECT ${loc}, material, sum(avg_share_pct * composition_scans) AS weighted,
              sum(material_scans) AS material_scans
       FROM ${table} WHERE ${where} GROUP BY ${loc}, material`,
    ),
    db.runQuery(
      `SELECT ${loc}, sum(scans) AS scans, max(location_scans) AS location_scans FROM (
         SELECT ${loc}, deposit, max(composition_scans) AS scans, max(location_scans) AS location_scans
         FROM ${table} WHERE ${whereAll} GROUP BY ${loc}, deposit
       ) GROUP BY ${loc}`,
    ),
  ])
  const key = (r) => [r.system, r.gravity_well, r.region].join('|')
  const byLoc = new Map(
    denoms.map((d) => [key(d), { ...d, key: key(d), scans: Number(d.scans), materials: [] }]),
  )
  for (const r of data) {
    const card = byLoc.get(key(r))
    if (!card || !card.scans) continue
    card.materials.push({
      material: r.material,
      share: Math.round((Number(r.weighted) / card.scans) * 100) / 100,
      presence: Math.round((Number(r.material_scans) / card.scans) * 10000) / 100,
    })
  }
  for (const c of byLoc.values()) {
    c.materials.sort((a, b) => b.share - a.share || a.material.localeCompare(b.material))
    c.scans = Number(c.location_scans ?? c.scans)
  }
  cards.value = [...byLoc.values()]
    .filter((c) => c.materials.length)
    .sort((a, b) => b.scans - a.scans || (a.region ?? a.gravity_well).localeCompare(b.region ?? b.gravity_well))
  total.value = cards.value.length
  rows.value = cards.value // keeps the empty-state check working
}

async function exportCsv() {
  const name = results.active
  const where = results.buildWhere(columns.value)
  const all = await db.runQuery(
    `SELECT ${selectList(schema.value)} FROM "results_${name}" WHERE ${where} ${orderClause()}`,
  )
  downloadCsv(rowsToCsv(all), `${name}.csv`)
}

function toggleSort(col) {
  const s = results.sort
  if (s.column !== col) results.sort = { column: col, desc: false }
  else if (!s.desc) results.sort = { column: col, desc: true }
  else results.sort = { column: null, desc: false }
}

function sortArrow(col) {
  if (results.sort.column !== col) return ''
  return results.sort.desc ? '▼' : '▲'
}

// Keep the selection valid as tables come and go
watch(
  tables,
  (list) => {
    if (!list.includes(results.active)) results.active = list[0] ?? null
  },
  { immediate: true },
)

// A different table or new filters start again on page 1; the sort column may not exist there
watch(() => results.active, () => {
  results.sort = { column: null, desc: false }
  page.value = 0
  load()
})
watch(
  () => [results.locationFilters, results.depositFilters, results.materialFilters],
  () => {
    page.value = 0
    load()
  },
  { deep: true },
)
watch(() => results.sort, () => { page.value = 0; load() })
watch(page, load)
watch(() => db.dataVersion, load)
watch(() => db.isReady, (ready) => { if (ready) load() })

onMounted(load)
</script>
