<template>
  <div class="loc-detail">
    <div>
      <header class="loc-head">
        <button class="btn-secondary loc-back" title="Back to all materials (Esc)" @click="emit('close')">‹ Back</button>
        <div>
          <h2>{{ material }}</h2>
          <p>{{ subtitle }}</p>
        </div>
      </header>

      <p v-if="error" class="panel-error">{{ error }}</p>
      <p v-else-if="locations.length === 0 && !loading" class="no-results">Nothing matches the filters for this material.</p>
      <div v-else class="loc-body">
        <p v-if="filterNote" class="meta-note">{{ filterNote }}</p>

        <div class="loc-stats">
          <div><strong>{{ locations.length }}</strong><span>locations</span></div>
          <div><strong>{{ deposits.length }}</strong><span>deposits</span></div>
          <div><strong>{{ stats.scans.toLocaleString() }}</strong><span>scans contain it</span></div>
          <div><strong>{{ formatCell(stats.scu) }}</strong><span>avg SCU per scan</span></div>
        </div>

        <section class="loc-chart">
          <h3>Location <small>concentration of {{ material }} in a rock there; pick one to focus on it</small></h3>
          <div class="result-tabs">
            <button class="result-chip" :class="{ active: !location }" @click="location = null">All locations</button>
            <button
              v-for="l in locations"
              :key="l.key"
              class="result-chip"
              :class="{ active: location === l.key }"
              :title="`${l.system} · ${l.gravity_well} · present in ${formatCell(l.presence)}% of scans there`"
              @click="location = location === l.key ? null : l.key"
            >{{ locationName(l) }} <small>{{ formatCell(l.share) }}%</small></button>
          </div>
        </section>

        <div class="loc-charts">
          <section class="loc-chart">
            <h3>Deposits <small>share of the deposit that is {{ material }}</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="d in deposits"
                :key="d.deposit"
                :class="rowClass(d)"
                :title="`Present in ${formatCell(d.presence)}% of the ${d.scans.toLocaleString()} scans of this deposit`"
                @mouseenter="hover = d.deposit"
              >
                <span class="bar-name">{{ d.deposit }}</span>
                <span class="bar-track"><span :style="{ width: (d.share / maxShare) * 100 + '%' }" /></span>
                <span class="bar-value">{{ formatCell(d.share) }}%</span>
              </li>
            </ul>
          </section>

          <section class="loc-chart">
            <h3>Time between clusters <small>average, per deposit{{ locationLabel }}</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="d in deposits"
                :key="d.deposit"
                :class="rowClass(d)"
                :title="gapTitle(d)"
                @mouseenter="hover = d.deposit"
              >
                <span class="bar-name">{{ d.deposit }}</span>
                <span class="bar-track">
                  <span v-if="d.gap" :style="{ width: (d.gap.avg / maxGap) * 100 + '%' }" />
                </span>
                <span class="bar-value">{{ d.gap ? formatGap(d.gap.avg) : '–' }}</span>
              </li>
            </ul>
            <p class="loc-hint">
              Time between consecutive clusters of the deposit; hover a bar for the median.
              {{ location ? '' : 'Averaged over the locations, weighted by the number of gaps.' }}
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDbStore } from '@/stores/db'
import { useResultsStore } from '@/stores/results'
import { formatCell, formatGap } from '@/lib/results'
import { REGION_TABLE, loadRegionConcentrations, locationKey, locationName } from '@/lib/regionData'

const props = defineProps({
  material: { type: String, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()
const { materialLocation: location } = storeToRefs(results) // kept in the store across tab switches

const locations = ref([]) // { key, system, gravity_well, region, share, presence, materialScans }
const rows = ref([]) // this material's rows of the results table
const loading = ref(false)
const error = ref(null)
const hover = ref(null) // deposit under the pointer

const num = (v) => (v == null ? null : Number(v))
const selected = computed(() => locations.value.find((l) => l.key === location.value) ?? null)
const subtitle = computed(() =>
  selected.value ? `${locationName(selected.value)} · ${selected.value.system}` : 'All locations',
)
const locationLabel = computed(() => (selected.value ? ` at ${locationName(selected.value)}` : ''))
const filterNote = computed(() => {
  const names = (list) => list.map((f) => (f.negated ? '!' : '') + f.value)
  const parts = [
    ...results.locationFilters,
    ...names(results.depositFilters),
    ...names(results.materialFilters),
  ]
  return parts.length ? `Filtered by ${parts.join(', ')}` : ''
})

// The rows in scope: one location when picked, else all
const scoped = computed(() =>
  location.value ? rows.value.filter((r) => locationKey(r) === location.value) : rows.value,
)

// One entry per deposit the material occurs in, over the scoped rows:
//   share    — the material's share of the deposit (avg_share_pct weighted by the deposit's scans)
//   presence — how many of the deposit's scans contain it
//   gap      — time between clusters; the value is per location x deposit (repeated on each
//              material row), so it is taken once per location and weighted by its gap count
const deposits = computed(() => {
  const byDeposit = new Map()
  for (const r of scoped.value) {
    let d = byDeposit.get(r.deposit)
    if (!d) byDeposit.set(r.deposit, (d = { deposit: r.deposit, weighted: 0, scans: 0, hits: 0, gaps: new Map() }))
    const w = num(r.composition_scans) ?? 0
    d.weighted += (num(r.avg_share_pct) ?? 0) * w
    d.scans += w
    d.hits += num(r.material_scans) ?? 0
    if (num(r.deposit_cluster_gaps) && r.deposit_avg_cluster_gap_seconds != null) {
      d.gaps.set(locationKey(r), {
        n: num(r.deposit_cluster_gaps),
        avg: num(r.deposit_avg_cluster_gap_seconds),
        median: num(r.deposit_median_cluster_gap_seconds),
      })
    }
  }
  return [...byDeposit.values()]
    .map((d) => {
      const g = [...d.gaps.values()]
      const n = g.reduce((s, x) => s + x.n, 0)
      return {
        deposit: d.deposit,
        scans: d.scans,
        share: d.scans ? Math.round((d.weighted / d.scans) * 100) / 100 : 0,
        presence: d.scans ? Math.round((d.hits / d.scans) * 10000) / 100 : 0,
        gap: n
          ? {
              n,
              avg: g.reduce((s, x) => s + x.avg * x.n, 0) / n,
              // Medians can't be combined across locations
              median: g.length === 1 ? g[0].median : null,
            }
          : null,
      }
    })
    .sort((a, b) => b.share - a.share || a.deposit.localeCompare(b.deposit))
})

const stats = computed(() => {
  const r = scoped.value
  const scans = selected.value
    ? selected.value.materialScans
    : locations.value.reduce((s, l) => s + l.materialScans, 0)
  const present = r.reduce((s, x) => s + (num(x.material_scans) ?? 0), 0)
  const scu = r.reduce((s, x) => s + (num(x.total_scu) ?? 0), 0)
  return { scans, scu: present ? scu / present : null }
})

const maxShare = computed(() => Math.max(1, ...deposits.value.map((d) => d.share)))
const maxGap = computed(() => Math.max(1, ...deposits.value.map((d) => d.gap?.avg ?? 0)))

function rowClass(d) {
  return hover.value ? (hover.value === d.deposit ? 'hi' : 'dim') : ''
}
function gapTitle(d) {
  if (!d.gap) return 'No gaps measured'
  const median = d.gap.median != null ? `median ${formatGap(d.gap.median)} · ` : ''
  return `${median}${d.gap.n} ${d.gap.n === 1 ? 'gap' : 'gaps'}`
}

// ── data ─────────────────────────────────────────────────────────
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"

async function load() {
  if (!db.isReady) return
  loading.value = true
  error.value = null
  try {
    const table = `results_${REGION_TABLE}`
    const columns = (await db.describeTable(table)).map((c) => c.column_name)
    const [{ cells }, data] = await Promise.all([
      loadRegionConcentrations(db, results, columns),
      db.runQuery(
        `SELECT system, gravity_well, region, deposit, avg_share_pct, composition_scans, material_scans, total_scu,
                deposit_cluster_gaps, deposit_avg_cluster_gap_seconds, deposit_median_cluster_gap_seconds
         FROM "${table}" WHERE material = ${q(props.material)} AND ${results.buildWhere(columns)}`,
      ),
    ])
    const mine = cells.filter((c) => c.material === props.material)
    mine.sort((a, b) => b.share - a.share || locationName(a).localeCompare(locationName(b)))
    locations.value = mine
    rows.value = data
    // A picked location that the filters removed is dropped
    if (location.value && !mine.some((l) => l.key === location.value)) location.value = null
  } catch (err) {
    error.value = err.message
    locations.value = []
    rows.value = []
  } finally {
    loading.value = false
  }
}

const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => {
  window.addEventListener('keydown', onKey)
  load()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

watch(
  () => [results.locationFilters, results.depositFilters, results.materialFilters],
  load,
  { deep: true },
)
watch(() => props.material, load)
watch(() => db.dataVersion, load)
</script>
