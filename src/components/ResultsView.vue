<template>
  <div class="results-view">
    <div class="view-toolbar">
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

    <div class="results-filters">
      <FilterGroup label="Location" hint="system, gravity well, or region">
        <TagInput
          v-model="results.locationFilters"
          :suggestions="filters.acLocation"
          placeholder="e.g. Pyro, Bloom"
          :allow-negation="false"
          :as-objects="false"
        />
      </FilterGroup>
      <FilterGroup label="Deposit" hint="prefix with ! to exclude">
        <TagInput
          v-model="results.depositFilters"
          :suggestions="filters.acDeposit"
          placeholder="e.g. Quantanium, !Tungsten"
          :allow-negation="true"
          :as-objects="true"
        />
      </FilterGroup>
      <FilterGroup label="Material" hint="prefix with ! to exclude">
        <TagInput
          v-model="results.materialFilters"
          :suggestions="filters.acMaterial"
          placeholder="e.g. Iron, !Inert Materials"
          :allow-negation="true"
          :as-objects="true"
        />
      </FilterGroup>
    </div>

    <div class="results-meta">
      <span v-if="unused.length" class="meta-note">
        The {{ unused.join(' and ') }} filter doesn't apply to this table (no matching column).
      </span>
      <span v-else-if="error" class="panel-error">{{ error }}</span>
      <span v-else class="meta-count">{{ total.toLocaleString() }} {{ total === 1 ? 'row' : 'rows' }}</span>
      <span class="meta-spacer" />
      <button
        v-if="hasFilters"
        class="btn-ghost"
        @click="results.clearFilters()"
      >Clear filters</button>
      <button class="btn-secondary" :disabled="total === 0" @click="exportCsv">↓ CSV</button>
    </div>

    <div v-if="tables.length === 0" class="no-results">
      No result tables were published yet.
    </div>
    <div v-else-if="rows.length === 0 && !loading" class="no-results">No rows match the filters.</div>
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

    <div v-if="pageCount > 1" class="results-pager">
      <button class="btn-ghost" :disabled="page === 0" @click="page--">‹ Prev</button>
      <span>Page {{ page + 1 }} / {{ pageCount }}</span>
      <button class="btn-ghost" :disabled="page >= pageCount - 1" @click="page++">Next ›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { useResultsStore } from '@/stores/results'
import { selectList, prettyName, formatCell } from '@/lib/results'
import { rowsToCsv, downloadCsv } from '@/lib/csv'
import FilterGroup from '@/components/FilterGroup.vue'
import TagInput from '@/components/TagInput.vue'

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

// Highscores have their own tab
const tables = computed(() => db.resultTables.filter((t) => t !== 'highscores'))
const columns = computed(() => schema.value.map((c) => c.column_name))
const unused = computed(() => results.unusedFilters(columns.value))
const pageCount = computed(() => Math.ceil(total.value / PAGE_SIZE))
const hasFilters = computed(
  () =>
    results.locationFilters.length > 0 ||
    results.depositFilters.length > 0 ||
    results.materialFilters.length > 0,
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
    schema.value = await db.describeTable(`results_${name}`)
    const where = results.buildWhere(columns.value)
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
