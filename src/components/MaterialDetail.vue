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
          <div><strong>{{ formatCell(overall.scu) }}</strong><span>avg SCU</span></div>
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
                  <th>location</th>
                  <th>concentration</th>
                  <th>scans</th>
                  <th>avg mass</th>
                  <th>avg SCU</th>
                  <th>avg resistance</th>
                  <th>avg instability</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="l in locationRows"
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
                    <span class="num">{{ formatCell(l.share) }}%</span>
                  </div>
                  </td>
                  <td class="num">{{ l.m.scans.toLocaleString() }}</td>
                  <td class="num">{{ formatCell(l.m.mass) }}</td>
                  <td class="num">{{ formatCell(l.m.scu) }}</td>
                  <td class="num">{{ formatCell(l.m.resistance) }}</td>
                  <td class="num">{{ formatCell(l.m.instability) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="loc-hint">Click locations to keep them highlighted and compare; the charts below follow the selection.</p>
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
import { formatCell, formatGap } from '@/lib/results'
import { REGION_TABLE, loadRegionConcentrations, locationKey, locationName } from '@/lib/regionData'

const props = defineProps({
  material: { type: String, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()
// [{ type: 'location' | 'deposit', name }] kept highlighted, in the store so it survives tab switches
const { materialSelection: selection } = storeToRefs(results)

const locations = ref([]) // { key, system, gravity_well, region, share, presence, materialScans }
const rows = ref([]) // this material's rows of the results table
const scanRows = ref([]) // { capture_id, key, deposit, mass, resistance, instability } of the scans containing it
const loading = ref(false)
const error = ref(null)
const hover = ref(null) // { type, name } under the pointer

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
// Mass, resistance, instability and the scan count come from the scans; SCU from
// the results rows (per scan the material is in). Both are narrowed the same way.
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
  let present = 0
  let scu = 0
  for (const r of rows.value) {
    if (keys && !keys.has(locationKey(r))) continue
    if (deposits?.size && !deposits.has(r.deposit)) continue
    present += num(r.material_scans) ?? 0
    scu += num(r.total_scu) ?? 0
  }
  return {
    scans: scans.size,
    mass: avg('mass'),
    resistance: avg('resistance'),
    instability: avg('instability'),
    scu: present ? scu / present : null,
  }
}

// Top strip: all of the focused locations together, within the focused deposits
const overall = computed(() => figures(scopeKeys.value, focusDeposits.value))

// One row per location, each with its own figures (within the focused deposits)
const locationRows = computed(() =>
  locations.value.map((l) => ({ ...l, m: figures(new Set([l.key]), focusDeposits.value) })),
)
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
    const [{ cells }, data, scans] = await Promise.all([
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
    ])
    const mine = cells.filter((c) => c.material === props.material)
    mine.sort((a, b) => b.share - a.share || locationName(a).localeCompare(locationName(b)))
    locations.value = mine
    rows.value = data
    scanRows.value = scans.map((r) => ({ ...r, key: locationKey(r) }))
    // Picks the filters removed are dropped
    selection.value = selection.value.filter((i) =>
      i.type === 'location' ? mine.some((l) => l.key === i.name) : data.some((r) => r.deposit === i.name),
    )
  } catch (err) {
    error.value = err.message
    locations.value = []
    rows.value = []
    scanRows.value = []
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
