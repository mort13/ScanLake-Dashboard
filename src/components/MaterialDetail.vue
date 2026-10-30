<template>
  <div class="loc-detail">
    <div>
      <header class="loc-head">
        <button class="btn-secondary loc-back" title="Back to all materials (Esc)" @click="emit('close')">‹ Back</button>
        <div>
          <h2>{{ material }}</h2>
          <p>{{ locations.length }} {{ locations.length === 1 ? 'location' : 'locations' }}</p>
        </div>
      </header>

      <p v-if="error" class="panel-error">{{ error }}</p>
      <p v-else-if="locations.length === 0 && !loading" class="no-results">Nothing matches the filters for this material.</p>
      <div v-else class="loc-body">
        <p v-if="filterNote" class="meta-note">{{ filterNote }}</p>

        <div class="loc-stats">
          <div><strong>{{ locationRows.length }}</strong><span>{{ locationRows.length === 1 ? 'location' : 'locations' }}</span></div>
          <div><strong>{{ depositRows.length }}</strong><span>{{ depositRows.length === 1 ? 'deposit' : 'deposits' }}</span></div>
          <div><strong>{{ overall.scans.toLocaleString() }}</strong><span>scans contain it</span></div>
          <div><strong>{{ formatCell(overall.mass) }}</strong><span>avg mass</span></div>
          <div :title="`Average SCU of ${material} in a rock; rocks without it count as 0`"><strong>{{ formatCell(overall.scu) }}</strong><span>avg SCU</span></div>
          <div><strong>{{ formatCell(overall.resistance) }}</strong><span>avg resistance</span></div>
          <div><strong>{{ formatCell(overall.instability) }}</strong><span>avg instability</span></div>
        </div>
        <p class="loc-hint loc-focus">
          {{ focusText }}
          <button v-if="selection.length" class="btn-ghost loc-clear" @click="selection = []">Clear selection</button>
        </p>

        <section class="loc-chart">
          <h3>Locations <small>concentration of {{ material }} in a rock there</small></h3>
          <div class="table-scroll">
            <table class="result-table loc-table loc-compare" @mouseleave="hover = null">
              <thead>
                <tr>
                  <th
                    v-for="c in COLUMNS"
                    :key="c.key"
                    class="sortable"
                    :class="{ sorted: sort.column === c.key }"
                    :title="c.title"
                    @click="toggleSort(c.key)"
                  >
                    {{ c.label }}
                    <span class="sort-arrow">{{ sort.column === c.key ? (sort.desc ? '▼' : '▲') : '' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="l in sortedLocationRows"
                  :key="l.key"
                  :class="[locClass(l), { pinned: isPinned('location', l.key) }]"
                  :title="`${l.system} · ${l.gravity_well} · present in ${formatCell(l.presence)}% of scans there`"
                  @mouseenter="hover = { type: 'location', name: l.key }"
                  @click="toggle('location', l.key)"
                >
                  <td>{{ locationName(l) }} <small class="loc-sub">{{ l.system }}</small></td>
                  <td>
                    <div class="loc-conc">
                    <span class="bar-track"><span :style="{ width: (l.share / maxShare) * 100 + '%' }" /></span>
                    <NumCell :value="l.share" :width="numWidth.share" suffix="%" />
                  </div>
                  </td>
                  <td><NumCell :value="l.m.scans" :width="numWidth.scans" /></td>
                  <td><NumCell :value="l.m.mass" :width="numWidth.mass" /></td>
                  <td><NumCell :value="l.m.scu" :width="numWidth.scu" /></td>
                  <td><NumCell :value="l.m.resistance" :width="numWidth.resistance" /></td>
                  <td><NumCell :value="l.m.instability" :width="numWidth.instability" /></td>
                  <td :title="l.m.gap ? `${l.m.gap.n} ${l.m.gap.n === 1 ? 'gap' : 'gaps'}` : 'No gaps measured'">
                    {{ l.m.gap ? formatGap(l.m.gap.avg) : '–' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="loc-hint">Click locations to keep them highlighted and compare, or a column name to sort; the charts below follow the selection.</p>
        </section>

        <section v-if="entries.length" class="loc-chart">
          <h3>
            Quality by entry
            <span class="q-mode">
              <button :class="{ active: qualityMode === 'scu' }" @click="qualityMode = 'scu'">by SCU</button>
              <button :class="{ active: qualityMode === 'count' }" @click="qualityMode = 'count'">by count</button>
            </span>
          </h3>
          <div class="q-axis"><span>0</span><span>500</span><span>1000</span></div>
          <ul class="quality-list" @mouseleave="hoverEntry = null">
            <li
              v-for="e in entries"
              :key="e.entry"
              :class="{ dim: hoverEntry != null && hoverEntry !== e.entry }"
              :style="{ '--q-color': entryColor(e.entry) }"
              :title="`Entry ${e.entry}: ${formatCell(e.scuPerRock)} SCU when present, ${e.scans.toLocaleString()} scans`"
              @mouseenter="hoverEntry = e.entry"
            >
              <span class="bar-name"><i class="entry-dot" :style="{ background: entryColor(e.entry) }" />Entry {{ e.entry }}</span>
              <span class="q-bands">
                <span
                  v-for="(pct, i) in e.bands"
                  :key="i"
                  class="q-band"
                  :style="{ '--a': pct ? 0.12 + (pct / 100) * 0.88 : 0.06 }"
                  :title="`${BAND_LABELS[i]}: ${formatCell(pct)}%`"
                ><span v-if="pct >= 0.5">{{ Math.round(pct) }}</span></span>
              </span>
              <span class="bar-value">{{ formatCell(e.scuPerRock) }} SCU</span>
            </li>
          </ul>
          <p class="loc-hint">
            Darker means more of the entry's {{ qualityMode === 'scu' ? 'SCU' : 'scans' }} fall in that band; the
            number at the right is the SCU of the entry per rock it is in. A material can appear more than once
            in a rock, for example as a bulk entry and a small higher quality one. Entries are combined across
            the selected locations and deposits.
          </p>
        </section>

        <div class="loc-charts">
          <section class="loc-chart">
            <h3>Deposits <small>share of the deposit that is {{ material }}</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="d in depositRows"
                :key="d.deposit"
                :class="[depClass(d), { pinned: isPinned('deposit', d.deposit) }]"
                :title="`Present in ${formatCell(d.presence)}% of the ${d.scans.toLocaleString()} scans of this deposit`"
                @mouseenter="hover = { type: 'deposit', name: d.deposit }"
                @click="toggle('deposit', d.deposit)"
              >
                <span class="bar-name">{{ d.deposit }}</span>
                <span class="bar-track"><span :style="{ width: (d.share / maxDepositShare) * 100 + '%' }" /></span>
                <span class="bar-value">{{ formatCell(d.share) }}%</span>
              </li>
            </ul>
          </section>

          <section class="loc-chart">
            <h3>Time between clusters <small>average, per deposit</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="d in depositRows"
                :key="d.deposit"
                :class="[depClass(d), { pinned: isPinned('deposit', d.deposit) }]"
                :title="gapTitle(d)"
                @mouseenter="hover = { type: 'deposit', name: d.deposit }"
                @click="toggle('deposit', d.deposit)"
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
              {{ scopeKeys ? '' : 'Averaged over the locations, weighted by the number of gaps.' }}
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
import { formatCell, formatGap, intWeight, BAND_LABELS, BAND_COLUMNS } from '@/lib/results'
import NumCell from '@/components/NumCell.vue'
import { REGION_TABLE, loadRegionConcentrations, locationKey, locationName } from '@/lib/regionData'

const props = defineProps({
  material: { type: String, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()
// [{ type: 'location' | 'deposit', name }] kept highlighted, in the store so it survives tab switches
const { materialSelection: selection, qualityMode } = storeToRefs(results)

const locations = ref([]) // { key, system, gravity_well, region, share, presence, materialScans }
const rows = ref([]) // this material's rows of the results table
const scanRows = ref([]) // { capture_id, key, deposit, mass, resistance, instability } of the scans containing it
const loading = ref(false)
const error = ref(null)
const hover = ref(null) // { type, name } under the pointer
const entryRows = ref([]) // this material's rows of the entries table (one per location x deposit x entry)
const hoverEntry = ref(null) // entry index under the pointer in the quality chart

const num = (v) => (v == null ? null : Number(v))
const filterNote = computed(() => {
  const names = (list) => list.map((f) => (f.negated ? '!' : '') + f.value)
  const parts = [
    ...results.locationFilters,
    ...names(results.depositFilters),
    ...names(results.materialFilters),
  ]
  return parts.length ? `Filtered by ${parts.join(', ')}` : ''
})

// ── selection and hover ──────────────────────────────────────────
// Clicked locations and deposits stay in focus; the item under the pointer is
// added while it is there. Locations narrow what the deposit charts and the
// figures cover (any of the focused locations); focused deposits narrow the
// figures to their scans.
const isPinned = (type, name) => selection.value.some((i) => i.type === type && i.name === name)
const focus = computed(() => {
  const h = hover.value
  return h && !isPinned(h.type, h.name) ? [...selection.value, h] : selection.value
})
const focusNames = (type) => focus.value.filter((i) => i.type === type).map((i) => i.name)
const focusLocations = computed(() => new Set(focusNames('location')))
const focusDeposits = computed(() => new Set(focusNames('deposit')))
const scopeKeys = computed(() => (focusLocations.value.size ? focusLocations.value : null))

function toggle(type, name) {
  selection.value = isPinned(type, name)
    ? selection.value.filter((i) => !(i.type === type && i.name === name))
    : [...selection.value, { type, name }]
}

const locByKey = computed(() => new Map(locations.value.map((l) => [l.key, l])))
const focusText = computed(() => {
  const places = [...focusLocations.value].map((k) => locationName(locByKey.value.get(k) ?? { gravity_well: k }))
  const deps = [...focusDeposits.value]
  if (!places.length && !deps.length) return `All scans containing ${props.material}`
  const parts = []
  if (places.length) parts.push(`at ${places.join(', ')}`)
  if (deps.length) parts.push(`in ${deps.join(', ')}`)
  return `Scans containing ${props.material} ${parts.join(' ')}`
})

// ── figures ──────────────────────────────────────────────────────
// Mass, resistance, instability and the scan count come from the scans; SCU from the
// results rows: the material's SCU in a rock there, i.e. its total SCU over the rocks
// scanned (rocks without it count as 0). Both are narrowed the same way. With deposits
// in focus the rocks are those deposits' scans, else all rocks scanned at the locations.
function figures(keys, deposits) {
  const scans = new Map()
  for (const r of scanRows.value) {
    if (keys && !keys.has(r.key)) continue
    if (deposits?.size && !deposits.has(r.deposit)) continue
    scans.set(r.capture_id, r)
  }
  const avg = (field) => {
    const v = [...scans.values()].map((r) => r[field]).filter((x) => x != null).map(Number)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  let rocks = 0
  let scu = 0
  let gapSum = 0
  let gapN = 0
  const seen = new Set()
  for (const r of rows.value) {
    if (keys && !keys.has(locationKey(r))) continue
    if (deposits?.size && !deposits.has(r.deposit)) continue
    scu += num(r.total_scu) ?? 0
    // Time between clusters of the deposit, weighted by how many gaps it is based on
    const n = num(r.deposit_cluster_gaps)
    if (n && r.deposit_avg_cluster_gap_seconds != null) {
      gapSum += num(r.deposit_avg_cluster_gap_seconds) * n
      gapN += n
    }
    const id = locationKey(r) + '|' + r.deposit // composition_scans repeats on each material row
    if (deposits?.size && !seen.has(id)) {
      seen.add(id)
      rocks += num(r.composition_scans) ?? 0
    }
  }
  if (!deposits?.size) {
    rocks = locations.value.filter((l) => !keys || keys.has(l.key)).reduce((s, l) => s + l.rocks, 0)
  }
  return {
    scans: scans.size,
    mass: avg('mass'),
    resistance: avg('resistance'),
    instability: avg('instability'),
    scu: rocks ? scu / rocks : null,
    gap: gapN ? { avg: gapSum / gapN, n: gapN } : null,
  }
}

// Top strip: all of the focused locations together, within the focused deposits
const overall = computed(() => figures(scopeKeys.value, focusDeposits.value))

// One row per location, each with its own figures (within the focused deposits)
const locationRows = computed(() =>
  locations.value.map((l) => ({ ...l, m: figures(new Set([l.key]), focusDeposits.value) })),
)
// Columns of the table; clicking a name sorts by it (ascending, descending, then back to concentration order)
const COLUMNS = [
  { key: 'name', label: 'location' },
  { key: 'share', label: 'concentration' },
  { key: 'scans', label: 'scans' },
  { key: 'mass', label: 'avg mass' },
  { key: 'scu', label: 'avg SCU', title: 'Average SCU of this material in a rock at the location' },
  { key: 'resistance', label: 'avg resistance' },
  { key: 'instability', label: 'avg instability' },
  { key: 'gap', label: 'time between clusters', title: 'Average time between clusters of the deposits containing this material' },
]
const sort = ref({ column: null, desc: false })
function toggleSort(column) {
  const s = sort.value
  if (s.column !== column) sort.value = { column, desc: false }
  else if (!s.desc) sort.value = { column, desc: true }
  else sort.value = { column: null, desc: false }
}
const sortValue = (l, key) =>
  key === 'name' ? locationName(l) : key === 'share' ? l.share : key === 'gap' ? l.m.gap?.avg ?? null : l.m[key]
const sortedLocationRows = computed(() => {
  const { column, desc } = sort.value
  if (!column) return locationRows.value
  const dir = desc ? -1 : 1
  return [...locationRows.value].sort((a, b) => {
    const x = sortValue(a, column)
    const y = sortValue(b, column)
    if (x == null || y == null) return (x == null) - (y == null) // empty values last either way
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir
  })
})
// Width of the part before the decimal sign per numeric column, so the numbers line up at it
const numWidth = computed(() => {
  const widest = (value) => Math.max(1, ...locationRows.value.map((l) => intWeight(value(l))))
  return {
    share: widest((l) => l.share),
    scans: widest((l) => l.m.scans),
    mass: widest((l) => l.m.mass),
    scu: widest((l) => l.m.scu),
    resistance: widest((l) => l.m.resistance),
    instability: widest((l) => l.m.instability),
  }
})
const maxShare = computed(() => Math.max(1, ...locations.value.map((l) => l.share)))

// ── deposits and gaps ────────────────────────────────────────────
// One entry per deposit the material occurs in, over the rows of the focused locations:
//   share    — the material's share of the deposit (avg_share_pct weighted by the deposit's scans)
//   presence — how many of the deposit's scans contain it
//   gap      — time between clusters; the value is per location x deposit (repeated on each
//              material row), so it is taken once per location and weighted by its gap count
const depositRows = computed(() => {
  const byDeposit = new Map()
  for (const r of rows.value) {
    if (scopeKeys.value && !scopeKeys.value.has(locationKey(r))) continue
    let d = byDeposit.get(r.deposit)
    if (!d) byDeposit.set(r.deposit, (d = { deposit: r.deposit, weighted: 0, scans: 0, hits: 0, keys: new Set(), gaps: new Map() }))
    const w = num(r.composition_scans) ?? 0
    d.weighted += (num(r.avg_share_pct) ?? 0) * w
    d.scans += w
    d.hits += num(r.material_scans) ?? 0
    d.keys.add(locationKey(r))
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
        keys: d.keys,
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
const maxDepositShare = computed(() => Math.max(1, ...depositRows.value.map((d) => d.share)))
const maxGap = computed(() => Math.max(1, ...depositRows.value.map((d) => d.gap?.avg ?? 0)))

// ── quality bands per entry ──────────────────────────────────────
// A material can appear more than once in a rock (say a bulk entry and a small, higher
// quality one). The Refinery numbers these entries per deposit; here the rows of the
// focused locations and deposits are combined per entry number, weighting each row's
// bands by its SCU (SCU mode) or by its scans (count mode).
const ENTRY_COLORS = ['#4c8dff', '#f5a524', '#3fb68b', '#e5534b', '#a371f7', '#17c3b2']
const entryColor = (n) => ENTRY_COLORS[(n - 1) % ENTRY_COLORS.length]

const entries = computed(() => {
  const mode = qualityMode.value
  const byEntry = new Map()
  for (const r of entryRows.value) {
    if (scopeKeys.value && !scopeKeys.value.has(locationKey(r))) continue
    if (focusDeposits.value.size && !focusDeposits.value.has(r.deposit)) continue
    if (r[BAND_COLUMNS[mode][0]] == null) continue
    const e = byEntry.get(r.entry) ?? { entry: Number(r.entry), scu: 0, scans: 0, w: 0, sums: new Array(BAND_LABELS.length).fill(0) }
    const w = Number(mode === 'scu' ? r.total_scu : r.entry_scans) || 0
    BAND_COLUMNS[mode].forEach((c, i) => { e.sums[i] += (Number(r[c]) || 0) * w })
    e.w += w
    e.scu += num(r.total_scu) ?? 0
    e.scans += num(r.entry_scans) ?? 0
    byEntry.set(r.entry, e)
  }
  return [...byEntry.values()]
    .filter((e) => e.w > 0)
    .map((e) => ({
      entry: e.entry,
      scans: e.scans,
      scuPerRock: e.scans ? e.scu / e.scans : null,
      bands: e.sums.map((v) => v / e.w),
    }))
    .sort((a, b) => a.entry - b.entry)
})
// ── highlighting ─────────────────────────────────────────────────
// A focused location lights up the deposits it has this material in, and a focused
// deposit the locations it is found at
function locClass(l) {
  if (!focus.value.length) return ''
  const fl = focusLocations.value
  const fd = focusDeposits.value
  const hit =
    (!fl.size || fl.has(l.key)) &&
    (!fd.size || rows.value.some((r) => locationKey(r) === l.key && fd.has(r.deposit)))
  return hit ? 'hi' : 'dim'
}
function depClass(d) {
  if (!focus.value.length) return ''
  const fd = focusDeposits.value
  const fl = focusLocations.value
  const hit = (!fd.size || fd.has(d.deposit)) && (!fl.size || [...fl].some((k) => d.keys.has(k)))
  return hit ? 'hi' : 'dim'
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
    const hasEntries = db.resultTables.includes('material_entries_by_region')
    const entryTable = 'results_material_entries_by_region'
    const entryColumns = hasEntries ? (await db.describeTable(entryTable)).map((c) => c.column_name) : []
    const [{ cells }, data, scans, entryData] = await Promise.all([
      loadRegionConcentrations(db, results, columns),
      db.runQuery(
        `SELECT system, gravity_well, region, deposit, avg_share_pct, composition_scans, material_scans, total_scu,
                deposit_cluster_gaps, deposit_avg_cluster_gap_seconds, deposit_median_cluster_gap_seconds
         FROM "${table}" WHERE material = ${q(props.material)} AND ${results.buildWhere(columns)}`,
      ),
      // The scans containing the material, narrowed by the sidebar's location and deposit filters
      db.runQuery(
        `SELECT * FROM (
           SELECT s.capture_id, s.system, s.gravity_well, s.region, s.deposit, s.mass, s.resistance, s.instability
           FROM scans s JOIN compositions c ON s.capture_id = c.capture_id
           WHERE c.type = ${q(props.material)}
         ) WHERE ${results.buildWhere(['system', 'gravity_well', 'region', 'deposit'])}`,
      ),
      hasEntries
        ? db.runQuery(
            `SELECT system, gravity_well, region, deposit, entry, entry_scans, total_scu,
                    ${BAND_COLUMNS.scu.join(', ')}, ${BAND_COLUMNS.count.join(', ')}
             FROM "${entryTable}" WHERE material = ${q(props.material)} AND ${results.buildWhere(entryColumns)}`,
          )
        : [],
    ])
    const mine = cells.filter((c) => c.material === props.material)
    mine.sort((a, b) => b.share - a.share || locationName(a).localeCompare(locationName(b)))
    locations.value = mine
    rows.value = data
    scanRows.value = scans.map((r) => ({ ...r, key: locationKey(r) }))
    entryRows.value = entryData
    // Picks the filters removed are dropped
    selection.value = selection.value.filter((i) =>
      i.type === 'location' ? mine.some((l) => l.key === i.name) : data.some((r) => r.deposit === i.name),
    )
  } catch (err) {
    error.value = err.message
    locations.value = []
    rows.value = []
    scanRows.value = []
    entryRows.value = []
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
