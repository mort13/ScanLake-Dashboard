<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="loc-modal" role="dialog" aria-modal="true" :aria-label="title">
      <header class="loc-head">
        <div>
          <h2>{{ title }}</h2>
          <p>{{ subtitle }}</p>
        </div>
        <button class="btn-ghost loc-close" title="Close (Esc)" @click="emit('close')">×</button>
      </header>

      <p v-if="error" class="panel-error">{{ error }}</p>
      <p v-else-if="deposits.length === 0 && !loading" class="no-results">Nothing matches the filters here.</p>
      <div v-else class="loc-body">
        <p v-if="filterNote" class="meta-note">{{ filterNote }}</p>

        <div class="loc-stats">
          <div><strong>{{ summary.scans.toLocaleString() }}</strong><span>scans</span></div>
          <div><strong>{{ deposits.length }}</strong><span>deposits</span></div>
          <div><strong>{{ materials.length }}</strong><span>materials</span></div>
          <div><strong>{{ formatCell(summary.avgScu) }}</strong><span>avg size (SCU)</span></div>
        </div>

        <div class="loc-charts">
          <section class="loc-chart">
            <h3>Deposits <small>share of the scans here</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="d in deposits"
                :key="d.deposit"
                :class="depClass(d)"
                @mouseenter="hover = { type: 'deposit', name: d.deposit }"
              >
                <span class="bar-name">{{ d.deposit }}</span>
                <span class="bar-track"><span :style="{ width: (d.share / maxDeposit) * 100 + '%' }" /></span>
                <span class="bar-value">{{ depNote(d) ?? formatCell(d.share) + '%' }}</span>
              </li>
            </ul>
          </section>

          <section class="loc-chart">
            <h3>Materials <small>average share of a rock here</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="m in materials"
                :key="m.material"
                :class="matClass(m)"
                @mouseenter="hover = { type: 'material', name: m.material }"
              >
                <span class="bar-name">{{ m.material }}</span>
                <span class="bar-track"><span :style="{ width: (m.share / maxMaterial) * 100 + '%' }" /></span>
                <span class="bar-value">{{ matNote(m) ?? formatCell(m.share) + '%' }}</span>
              </li>
            </ul>
          </section>
        </div>

        <div class="loc-lower">
          <section class="loc-chart">
            <h3>Time between clusters <small>average, per deposit</small></h3>
            <ul @mouseleave="hover = null">
              <li
                v-for="g in gapRows"
                :key="g.deposit ?? 'all'"
                :class="g.deposit ? depClass(g.dep) : 'loc-total'"
                :title="`${g.median != null ? `median ${formatGap(g.median)} · ` : ''}${g.n} ${g.n === 1 ? 'gap' : 'gaps'}`"
                @mouseenter="hover = g.deposit ? { type: 'deposit', name: g.deposit } : null"
              >
                <span class="bar-name">{{ g.deposit ?? 'All deposits' }}</span>
                <span class="bar-track"><span :style="{ width: (g.avg / maxGap) * 100 + '%' }" /></span>
                <span class="bar-value">{{ formatGap(g.avg) }}</span>
              </li>
            </ul>
            <p v-if="gapRows.length === 0" class="loc-hint">Not enough consecutive clusters here.</p>
            <p v-else class="loc-hint">Time between consecutive clusters of the deposit; hover a bar for the median.</p>
          </section>
          <section class="loc-chart">
            <h3>
              Quality
              <span class="q-mode">
                <button :class="{ active: qualityMode === 'scu' }" @click="qualityMode = 'scu'">by SCU</button>
                <button :class="{ active: qualityMode === 'count' }" @click="qualityMode = 'count'">by count</button>
              </span>
            </h3>
            <div class="q-axis"><span>0</span><span>500</span><span>1000</span></div>
            <ul class="quality-list" @mouseleave="hover = null">
              <li
                v-for="m in qualityRows"
                :key="m.material"
                :class="matClass(m)"
                @mouseenter="hover = { type: 'material', name: m.material }"
              >
                <span class="bar-name">{{ m.material }}</span>
                <span class="q-bands">
                  <span
                    v-for="(pct, i) in bandsOf(m)"
                    :key="i"
                    class="q-band"
                    :style="{ opacity: pct ? 0.12 + (pct / 100) * 0.88 : 0.06 }"
                    :title="`${BAND_LABELS[i]}: ${formatCell(pct)}%`"
                  />
                </span>
                <span class="bar-value">{{ peakBand(m) }}</span>
              </li>
            </ul>
            <p v-if="qualityRows.length === 0" class="loc-hint">No quality data for these materials.</p>
            <p v-else class="loc-hint">
              Darker means more of the material's {{ qualityMode === 'scu' ? 'SCU' : 'scans' }} fall in that band; the label is the most common one.
              Hover a deposit to see its own distribution.
            </p>
          </section>
        </div>
        <p class="loc-hint">Hover a deposit to light up its materials, or a material to light up the deposits it occurs in.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDbStore } from '@/stores/db'
import { useResultsStore } from '@/stores/results'
import { formatCell } from '@/lib/results'

const TABLE = 'results_deposit_materials_by_region'
// Quality bands of 100, as in the quality_<lo>_<hi>_pct columns
const BANDS = ['0_100', '101_200', '201_300', '301_400', '401_500', '501_600', '601_700', '701_800', '801_900', '901_1000']
const BAND_LABELS = BANDS.map((b) => b.replace('_', '–'))
// Each band is published twice: as a share of the SCU and as a share of the scans
const BAND_COLUMNS = {
  scu: BANDS.map((b) => `quality_${b}_scu_pct`),
  count: BANDS.map((b) => `quality_${b}_count_pct`),
}

const props = defineProps({
  // { system, gravity_well, region } of the clicked card
  location: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()

// { deposit, share, scans, scu, materials: Map(material → share in deposit), bands: Map(material → {scu, count}), gap: {avg, median, n} | null }
const deposits = ref([])
const materials = ref([]) // { material, share, bands: {scu, count} | null }
const gaps = ref([]) // { deposit | null (all), avg, median | null, n }
const summary = ref({ scans: 0, share: 0, depositScans: 0, avgScu: 0 })
const loading = ref(false)
const error = ref(null)
const qualityMode = ref('scu') // which band columns the quality strips use
const hover = ref(null) // { type: 'deposit' | 'material', name }

const title = computed(() => props.location.region ?? props.location.gravity_well)
const subtitle = computed(() =>
  props.location.region
    ? `${props.location.system} · ${props.location.gravity_well}`
    : props.location.system,
)
const filterNote = computed(() => {
  const names = (list) => list.map((f) => (f.negated ? '!' : '') + f.value)
  const parts = [
    ...results.locationFilters,
    ...names(results.depositFilters),
    ...names(results.materialFilters),
  ]
  return parts.length ? `Filtered by ${parts.join(', ')}` : ''
})

const maxDeposit = computed(() => Math.max(1, ...deposits.value.map((d) => d.share)))
const maxMaterial = computed(() => Math.max(1, ...materials.value.map((m) => m.share)))
const maxGap = computed(() => Math.max(1, ...gaps.value.map((g) => g.avg)))
const qualityRows = computed(() => materials.value.filter((m) => m.bands))
const depByName = computed(() => new Map(deposits.value.map((d) => [d.deposit, d])))
// Gap rows carry their deposit so the hover linking can reuse depClass
const gapRows = computed(() =>
  gaps.value.map((g) => ({ ...g, dep: g.deposit ? depByName.value.get(g.deposit) : null })),
)

// ── hover linking ────────────────────────────────────────────────
function depClass(d) {
  const h = hover.value
  if (!h || !d) return ''
  if (h.type === 'deposit') return h.name === d.deposit ? 'hi' : 'dim'
  return d.materials.has(h.name) ? 'hi' : 'dim'
}
function matClass(m) {
  const h = hover.value
  if (!h) return ''
  if (h.type === 'material') return h.name === m.material ? 'hi' : 'dim'
  return depByName.value.get(h.name)?.materials.has(m.material) ? 'hi' : 'dim'
}
// Hovering a material shows its share in each deposit instead of the deposit's own
function depNote(d) {
  const h = hover.value
  if (h?.type !== 'material') return null
  const s = d.materials.get(h.name)
  return s == null ? null : `${formatCell(s)}% ${h.name}`
}
function matNote(m) {
  const h = hover.value
  if (h?.type !== 'deposit') return null
  const s = depByName.value.get(h.name)?.materials.get(m.material)
  return s == null ? null : `${formatCell(s)}% here`
}
// Hovering a deposit switches the quality strips to that deposit's own distribution
function bandsOf(m) {
  const h = hover.value
  const own = h?.type === 'deposit' ? depByName.value.get(h.name)?.bands.get(m.material) : null
  return (own ?? m.bands)[qualityMode.value]
}
function peakBand(m) {
  const bands = bandsOf(m)
  const max = Math.max(...bands)
  return max > 0 ? BAND_LABELS[bands.indexOf(max)] : '–'
}

function formatGap(seconds) {
  if (seconds == null) return '–'
  const s = Math.round(seconds)
  return s < 120 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

// ── data ─────────────────────────────────────────────────────────
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"

async function load() {
  if (!db.isReady) return
  loading.value = true
  error.value = null
  try {
    const { system, gravity_well: well, region } = props.location
    const place =
      `system = ${q(system)} AND gravity_well = ${q(well)} AND ` +
      (region == null ? 'region IS NULL' : `region = ${q(region)}`)
    const columns = (await db.describeTable(TABLE)).map((c) => c.column_name)
    // The material filter only chooses what is listed: deposit sizes and
    // the share denominators are always taken over every material
    const rows = await db.runQuery(
      `SELECT deposit, material, deposit_share_pct, deposit_scans, total_scu,
              composition_scans, material_scans, avg_share_pct, location_scans,
              deposit_cluster_gaps, deposit_avg_cluster_gap_seconds, deposit_median_cluster_gap_seconds,
              ${BAND_COLUMNS.scu.join(', ')}, ${BAND_COLUMNS.count.join(', ')}
       FROM ${TABLE} WHERE ${place} AND ${results.buildWhere(columns, ['material'])}`,
    )
    const listed = new Set(
      (
        await db.runQuery(
          `SELECT DISTINCT material FROM ${TABLE} WHERE ${place} AND ${results.buildWhere(columns)}`,
        )
      ).map((r) => r.material),
    )
    build(rows, listed)
    buildGaps()
  } catch (err) {
    error.value = err.message
    deposits.value = []
    materials.value = []
    gaps.value = []
  } finally {
    loading.value = false
  }
}

function build(rows, listed) {
  const num = (v) => (v == null ? null : Number(v))
  const bandsOfRow = (r) =>
    r[BAND_COLUMNS.scu[0]] == null
      ? null
      : {
          scu: BAND_COLUMNS.scu.map((c) => num(r[c]) ?? 0),
          count: BAND_COLUMNS.count.map((c) => num(r[c]) ?? 0),
        }
  const byDeposit = new Map()
  for (const r of rows) {
    let d = byDeposit.get(r.deposit)
    if (!d) {
      d = {
        deposit: r.deposit,
        share: num(r.deposit_share_pct) ?? 0,
        scans: num(r.deposit_scans) ?? 0,
        scu: 0, // ore of all materials, summed below
        compositionScans: num(r.composition_scans) ?? 0,
        materials: new Map(),
        bands: new Map(),
        // Deposit-level, repeated on every material row
        gap: r.deposit_cluster_gaps
          ? {
              n: num(r.deposit_cluster_gaps),
              avg: num(r.deposit_avg_cluster_gap_seconds),
              median: num(r.deposit_median_cluster_gap_seconds),
            }
          : null,
      }
      byDeposit.set(r.deposit, d)
    }
    d.scu += num(r.total_scu) ?? 0
    if (listed.has(r.material)) {
      d.materials.set(r.material, num(r.avg_share_pct) ?? 0)
      const bands = bandsOfRow(r)
      if (bands) d.bands.set(r.material, bands)
    }
  }
  const all = [...byDeposit.values()]
  const shown = all.filter((d) => d.materials.size)
  shown.sort((a, b) => b.share - a.share || a.deposit.localeCompare(b.deposit))

  // Materials are ordered by concentration: share per deposit weighted by that
  // deposit's scans, over the scans of all deposits (deposits without it count as 0).
  // A material's quality bands are averaged over deposits, weighted by its scans there.
  const totalScans = all.reduce((s, d) => s + d.compositionScans, 0)
  const acc = new Map()
  for (const r of rows) {
    if (!listed.has(r.material)) continue
    const a = acc.get(r.material) ?? {
      weighted: 0,
      bands: { scu: new Array(BANDS.length).fill(0), count: new Array(BANDS.length).fill(0) },
      w: { scu: 0, count: 0 },
    }
    a.weighted += (num(r.avg_share_pct) ?? 0) * (num(r.composition_scans) ?? 0)
    const bands = bandsOfRow(r)
    if (bands) {
      // SCU bands weigh a deposit by the material's SCU there, count bands by its scans
      const w = { scu: num(r.total_scu) ?? 0, count: num(r.material_scans) ?? 0 }
      for (const mode of ['scu', 'count']) {
        bands[mode].forEach((pct, i) => { a.bands[mode][i] += pct * w[mode] })
        a.w[mode] += w[mode]
      }
    }
    acc.set(r.material, a)
  }
  const list = [...acc].map(([material, a]) => ({
    material,
    share: totalScans ? Math.round((a.weighted / totalScans) * 100) / 100 : 0,
    bands: a.w.scu || a.w.count
      ? {
          scu: a.bands.scu.map((v) => v / (a.w.scu || 1)),
          count: a.bands.count.map((v) => v / (a.w.count || 1)),
        }
      : null,
  }))
  list.sort((a, b) => b.share - a.share || a.material.localeCompare(b.material))

  const depositScans = shown.reduce((s, d) => s + d.scans, 0)
  const totalScu = shown.reduce((s, d) => s + d.scu, 0)
  deposits.value = shown
  materials.value = list
  summary.value = {
    scans: num(rows[0]?.location_scans) ?? 0,
    share: Math.round(shown.reduce((s, d) => s + d.share, 0) * 100) / 100,
    depositScans,
    avgScu: depositScans ? totalScu / depositScans : 0,
  }
}

// Per deposit as published; the overall average weighs deposits by their number of gaps
// (medians can't be combined, so the "all deposits" row has none)
function buildGaps() {
  const list = deposits.value.filter((d) => d.gap?.avg != null)
  const n = list.reduce((s, d) => s + d.gap.n, 0)
  gaps.value = list.length
    ? [
        ...list.map((d) => ({ deposit: d.deposit, ...d.gap })),
        { deposit: null, n, avg: list.reduce((s, d) => s + d.gap.avg * d.gap.n, 0) / n, median: null },
      ]
    : []
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
watch(() => props.location, load)
watch(() => db.dataVersion, load)
</script>
