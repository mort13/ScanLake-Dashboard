<template>
  <div class="loc-detail">
    <div>
      <header class="loc-head">
        <button class="btn-secondary loc-back" title="Back to all locations (Esc)" @click="emit('close')">‹ Back</button>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ subtitle }}</p>
        </div>
      </header>

      <p v-if="error" class="panel-error">{{ error }}</p>
      <p v-else-if="deposits.length === 0 && !loading" class="no-results">Nothing matches the filters here.</p>
      <div v-else class="loc-body">
        <p v-if="filterNote" class="meta-note">{{ filterNote }}</p>

        <div class="loc-stats">
          <div><strong>{{ stats.scans.toLocaleString() }}</strong><span>scans</span></div>
          <div><strong>{{ deposits.length }}</strong><span>{{ deposits.length === 1 ? 'deposit' : 'deposits' }}</span></div>
          <div><strong>{{ materials.length }}</strong><span>{{ materials.length === 1 ? 'material' : 'materials' }}</span></div>
          <div><strong>{{ formatCell(stats.mass) }}</strong><span>avg mass</span></div>
          <div><strong>{{ formatCell(stats.scu) }}</strong><span>avg SCU</span></div>
          <div><strong>{{ formatCell(stats.resistance) }}</strong><span>avg resistance</span></div>
          <div><strong>{{ formatCell(stats.instability) }}</strong><span>avg instability</span></div>
        </div>
        <p class="loc-hint loc-focus">
          {{ focusText }}
          <button v-if="selection.length" class="btn-ghost loc-clear" @click="selection = []">Clear selection</button>
        </p>

        <div class="loc-charts">
          <section class="loc-chart">
            <h3>Deposits <small>share of the scans here</small></h3>
            <div class="split-head" aria-hidden="true" />
            <ul @mouseleave="hover = null">
              <li
                v-for="d in deposits"
                :key="d.deposit"
                :class="[depClass(d), { pinned: isPinned('deposit', d.deposit) }]"
                @mouseenter="hover = { type: 'deposit', name: d.deposit }"
                @click="toggle('deposit', d.deposit)"
              >
                <span class="bar-name">{{ d.deposit }}</span>
                <span class="bar-track"><span :style="{ width: (d.share / maxDeposit) * 100 + '%' }" /></span>
                <span class="bar-value">{{ depNote(d) ?? formatCell(d.share) + '%' }}</span>
              </li>
            </ul>
          </section>

          <section class="loc-chart">
            <h3>Between clusters <small>average, per deposit</small></h3>
            <div class="split-head" aria-hidden="true"><span /><span>distance</span><span>time</span></div>
            <ul @mouseleave="hover = null">
              <li
                v-for="s in spacingRows"
                :key="s.deposit ?? 'all'"
                class="split-row"
                :class="s.deposit ? [depClass(s.dep), { pinned: isPinned('deposit', s.deposit) }] : 'loc-total'"
                @mouseenter="hover = s.deposit ? { type: 'deposit', name: s.deposit } : null"
                @click="s.deposit && toggle('deposit', s.deposit)"
              >
                <span class="bar-name">{{ s.deposit ?? 'All deposits' }}</span>
                <template v-for="metric in ['distance', 'gap']" :key="metric">
                  <span class="bar-track" :title="spacingDetail(s[metric], metric)">
                    <span v-if="s[metric]" :style="{ width: (s[metric].avg / maxSpacing[metric]) * 100 + '%' }" />
                  </span>
                  <span class="bar-value" :title="spacingDetail(s[metric], metric)">{{ spacingText(s[metric], metric) }}</span>
                </template>
              </li>
            </ul>
            <p v-if="!hasSpacing" class="loc-hint">Not enough clusters here to measure.</p>
            <p v-else class="loc-hint">
              Distance from a cluster to the nearest other cluster of the deposit (from uploaded ship positions),
              and time between consecutive clusters of the deposit; hover for the median.
            </p>
          </section>
        </div>

        <div class="loc-lower">
          <section class="loc-chart">
            <h3>Materials <small>average share of a rock here</small></h3>
            <div class="q-axis" aria-hidden="true" />
            <ul @mouseleave="hover = null">
              <li
                v-for="m in materials"
                :key="m.material"
                :class="[matClass(m), { pinned: isPinned('material', m.material) }]"
                @mouseenter="hover = { type: 'material', name: m.material }"
                @click="toggle('material', m.material)"
              >
                <span class="bar-name">{{ m.material }}</span>
                <span class="bar-track"><span :style="{ width: (m.share / maxMaterial) * 100 + '%' }" /></span>
                <span class="bar-value">{{ matNote(m) ?? formatCell(m.share) + '%' }}</span>
              </li>
            </ul>
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
                :class="[matClass(m), { pinned: isPinned('material', m.material) }]"
                @mouseenter="hover = { type: 'material', name: m.material }"
                @click="toggle('material', m.material)"
              >
                <span class="bar-name">{{ m.material }}</span>
                <span class="q-bands">
                  <span
                    v-for="(pct, i) in bandsOf(m)"
                    :key="i"
                    class="q-band"
                    :style="{ '--a': pct ? 0.12 + (pct / 100) * 0.88 : 0.06 }"
                    :title="`${BAND_LABELS[i]}: ${formatCell(pct)}%`"
                  ><span v-if="focus.length && matClass(m) === 'hi' && pct >= 0.5">{{ Math.round(pct) }}</span></span>
                </span>
                <span class="bar-value">{{ peakBand(m) }}</span>
              </li>
            </ul>
            <p v-if="!hasQuality" class="loc-hint">No quality data for these materials.</p>
            <p v-else class="loc-hint">
              Darker means more of the material's {{ qualityMode === 'scu' ? 'SCU' : 'scans' }} fall in that band; the label is the most common one.
              Highlight a row to see the percentages; a single deposit shows its own distribution.
            </p>
          </section>
        </div>
        <p class="loc-hint">Hover a deposit to light up its materials, or a material to light up the deposits it occurs in. Click to keep it highlighted; click several to combine them.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDbStore } from '@/stores/db'
import { useResultsStore } from '@/stores/results'
import { formatCell, QUALITY_BANDS as BANDS, BAND_LABELS, BAND_COLUMNS } from '@/lib/results'
import { loadDepositDistances, combineSpacing, spacingText, spacingDetail } from '@/lib/regionData'

const TABLE = 'results_deposit_materials_by_region'
const NO_BANDS = BANDS.map(() => 0)

const props = defineProps({
  // { system, gravity_well, region, byWell } of the clicked card; with byWell the
  // card stands for every region of the gravity well combined
  location: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()

// { deposit, share, scans, scu, materials: Map(material → share in deposit), bands: Map(material → {scu, count}),
//   gap: {avg, median, n} | null (time between clusters), distance: {avg, median, n} | null }
const deposits = ref([])
const materials = ref([]) // { material, share, scuTotal | null, materialScans, bands: {scu, count} | null }
const scanRows = ref([]) // { capture_id, deposit, material, mass, resistance, instability } passing the filters
const summary = ref({ scans: 0, share: 0, depositScans: 0, avgScu: 0 })
const regionCount = ref(0) // named regions combined into a gravity well's view
const loading = ref(false)
const error = ref(null)
const { qualityMode, selection } = storeToRefs(results) // kept in the store across tab switches
const hover = ref(null) // { type: 'deposit' | 'material', name } under the pointer

const title = computed(() => props.location.region ?? props.location.gravity_well)
const subtitle = computed(() => {
  const { system, gravity_well: well, region, byWell } = props.location
  if (byWell) return regionCount.value > 1 ? `${system} · ${regionCount.value} regions combined` : system
  return region ? `${system} · ${well}` : system
})
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
const qualityRows = computed(() => materials.value)
const hasQuality = computed(() => materials.value.some((m) => m.bands))
const depByName = computed(() => new Map(deposits.value.map((d) => [d.deposit, d])))
// Distance and time between clusters: a row per deposit, in the order of the deposits
// chart next to it, then all deposits together (each average weighted by what it rests on)
const spacingRows = computed(() => {
  const rows = deposits.value.map((d) => ({ deposit: d.deposit, dep: d, gap: d.gap, distance: d.distance }))
  const all = {
    deposit: null,
    gap: combineSpacing(rows.map((r) => r.gap && { ...r.gap, median: null })),
    distance: combineSpacing(rows.map((r) => r.distance && { ...r.distance, median: null })),
  }
  return all.gap || all.distance ? [...rows, all] : rows
})
const hasSpacing = computed(() => spacingRows.value.some((r) => r.gap || r.distance))
const maxSpacing = computed(() => {
  const max = (metric) => Math.max(1, ...spacingRows.value.map((r) => r[metric]?.avg ?? 0))
  return { gap: max('gap'), distance: max('distance') }
})

// ── selection and hover ──────────────────────────────────────────
// Clicked items stay highlighted (any number of deposits and materials); the item
// under the pointer is added on top while it is there.
const isPinned = (type, name) => selection.value.some((i) => i.type === type && i.name === name)
const focus = computed(() => {
  const h = hover.value
  return h && !isPinned(h.type, h.name) ? [...selection.value, h] : selection.value
})
const focusNames = (type) => focus.value.filter((i) => i.type === type).map((i) => i.name)

function toggle(type, name) {
  selection.value = isPinned(type, name)
    ? selection.value.filter((i) => !(i.type === type && i.name === name))
    : [...selection.value, { type, name }]
}

const focusText = computed(() => {
  const d = focusNames('deposit')
  const m = focusNames('material')
  if (!d.length && !m.length) return 'All scans here'
  const parts = []
  if (d.length) parts.push(`of ${d.join(', ')}`)
  if (m.length) parts.push(`containing ${m.join(', ')}`)
  return `Scans ${parts.join(' or ')}`
})

// The figures above the charts cover all scans, or the scans of the focused
// deposits / containing the focused materials
const stats = computed(() => {
  const deps = new Set(focusNames('deposit'))
  const mats = new Set(focusNames('material'))
  const scans = new Map()
  for (const r of scanRows.value) {
    if (focus.value.length && !deps.has(r.deposit) && !mats.has(r.material)) continue
    scans.set(r.capture_id, r)
  }
  const avg = (key) => {
    const v = [...scans.values()].map((r) => r[key]).filter((x) => x != null).map(Number)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  // SCU per rock: per deposit scanned, or per scan a material is in. The two
  // can't be combined, so a mixed selection shows none.
  let scu = summary.value.avgScu
  if (deps.size && mats.size) {
    scu = null
  } else if (deps.size) {
    const sel = [...deps].map((n) => depByName.value.get(n)).filter(Boolean)
    const n = sel.reduce((s, d) => s + d.scans, 0)
    scu = n ? sel.reduce((s, d) => s + d.scu, 0) / n : null
  } else if (mats.size) {
    const sel = materials.value.filter((m) => mats.has(m.material) && m.scuTotal != null)
    const n = sel.reduce((s, m) => s + m.materialScans, 0)
    scu = n ? sel.reduce((s, m) => s + m.scuTotal, 0) / n : null
  }
  return {
    scans: scans.size,
    mass: avg('mass'),
    resistance: avg('resistance'),
    instability: avg('instability'),
    scu,
  }
})

// ── highlighting ─────────────────────────────────────────────────
function depClass(d) {
  if (!focus.value.length || !d) return ''
  const mats = focusNames('material')
  const hit = focusNames('deposit').includes(d.deposit) || mats.some((m) => d.materials.has(m))
  return hit ? 'hi' : 'dim'
}
function matClass(m) {
  if (!focus.value.length) return ''
  const hit =
    focusNames('material').includes(m.material) ||
    focusNames('deposit').some((n) => depByName.value.get(n)?.materials.has(m.material))
  return hit ? 'hi' : 'dim'
}
// With exactly one thing in focus the bars show how it relates to the others:
// a material's share in each deposit, a deposit's share of each material
const single = computed(() => (focus.value.length === 1 ? focus.value[0] : null))
function depNote(d) {
  if (single.value?.type !== 'material') return null
  const s = d.materials.get(single.value.name)
  return s == null ? null : `${formatCell(s)}% ${single.value.name}`
}
function matNote(m) {
  if (single.value?.type !== 'deposit') return null
  const s = depByName.value.get(single.value.name)?.materials.get(m.material)
  return s == null ? null : `${formatCell(s)}% here`
}
// A single focused deposit switches the quality strips to its own distribution
function bandsOf(m) {
  const own = single.value?.type === 'deposit' ? depByName.value.get(single.value.name)?.bands.get(m.material) : null
  return (own ?? m.bands)?.[qualityMode.value] ?? NO_BANDS
}
function peakBand(m) {
  const bands = bandsOf(m)
  const max = Math.max(...bands)
  return max > 0 ? BAND_LABELS[bands.indexOf(max)] : '–'
}

// ── data ─────────────────────────────────────────────────────────
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"

async function load() {
  if (!db.isReady) return
  loading.value = true
  error.value = null
  try {
    const { system, gravity_well: well, region, byWell } = props.location
    const place =
      `system = ${q(system)} AND gravity_well = ${q(well)}` +
      (byWell ? '' : ` AND ${region == null ? 'region IS NULL' : `region = ${q(region)}`}`)
    const columns = (await db.describeTable(TABLE)).map((c) => c.column_name)
    // The material filter only chooses what is listed: deposit sizes and
    // the share denominators are always taken over every material
    const rows = await db.runQuery(
      byWell
        ? wellRowsSql(place, columns)
        : `SELECT deposit, material, deposit_share_pct, deposit_scans, total_scu,
                  composition_scans, material_scans, avg_share_pct, location_scans,
                  deposit_cluster_gaps, deposit_avg_cluster_gap_seconds, deposit_median_cluster_gap_seconds,
                  ${BAND_COLUMNS.scu.join(', ')}, ${BAND_COLUMNS.count.join(', ')}
           FROM ${TABLE} WHERE ${place} AND ${results.buildWhere(columns, ['material'])}`,
    )
    regionCount.value = byWell ? Number(rows[0]?.regions ?? 0) : 0
    const listed = new Set(
      (
        await db.runQuery(
          `SELECT DISTINCT material FROM ${TABLE} WHERE ${place} AND ${results.buildWhere(columns)}`,
        )
      ).map((r) => r.material),
    )
    // Distances per deposit; a gravity well combines those of its regions the filters keep
    const dist = await loadDepositDistances(
      db,
      `${place} AND ${results.buildWhere(['system', 'gravity_well', 'region', 'deposit'])}`,
    )
    const distances = new Map()
    for (const d of dist) distances.set(d.deposit, [...(distances.get(d.deposit) ?? []), d])
    build(rows, listed, new Map([...distances].map(([dep, list]) => [dep, combineSpacing(list)])))
    // Picks that the new data no longer contains are dropped
    selection.value = selection.value.filter((i) =>
      i.type === 'deposit' ? depByName.value.has(i.name) : materials.value.some((m) => m.material === i.name),
    )
    // The scans at this place, one row per material, narrowed by the same filters
    // (the location filter matters for a gravity well: it can pick some of its regions)
    scanRows.value = await db.runQuery(
      `SELECT * FROM (
         SELECT s.capture_id, s.deposit, c.type AS material, s.mass, s.resistance, s.instability
         FROM (SELECT * FROM scans WHERE ${place} AND ${results.buildWhere(['system', 'gravity_well', 'region'])}) s
         LEFT JOIN compositions c ON s.capture_id = c.capture_id
       ) WHERE ${results.buildWhere(['deposit', 'material'])}`,
    )
  } catch (err) {
    error.value = err.message
    deposits.value = []
    materials.value = []
    scanRows.value = []
  } finally {
    loading.value = false
  }
}

/**
 * A gravity well's rows in the shape of one region's: each deposit x material
 * combined over the well's regions (those passing the filters). Scan counts and
 * SCU add up; the deposit's share is its scans over the well's; a material's share
 * in a deposit is weighted by the deposit's rocks in each region (regions without
 * the material count as 0); quality bands are weighted by the material's SCU or
 * scans there, time between clusters by its gaps. Medians can't be combined, so a
 * deposit keeps one only when a single region measured it.
 */
function wellRowsSql(place, columns) {
  const where = results.buildWhere(columns, ['material'])
  // The well's scans: every region the location filter keeps, whatever deposits it has
  const whereRegions = results.buildWhere(columns, ['material', 'deposit'])
  const band = (c, w) =>
    `coalesce(sum(r.${c} * r.${w}) / nullif(sum(CASE WHEN r.${c} IS NOT NULL THEN r.${w} END), 0), avg(r.${c})) AS ${c}`
  return `
    WITH r AS (SELECT * FROM ${TABLE} WHERE ${place} AND ${where}),
    dep_region AS (
      SELECT region, deposit, max(deposit_scans) AS deposit_scans, max(composition_scans) AS composition_scans,
             max(deposit_cluster_gaps) AS gaps, max(deposit_avg_cluster_gap_seconds) AS gap_avg,
             max(deposit_median_cluster_gap_seconds) AS gap_median
      FROM r GROUP BY region, deposit
    ),
    dep AS (
      SELECT deposit, sum(deposit_scans) AS deposit_scans, sum(composition_scans) AS composition_scans,
             sum(gaps) FILTER (WHERE gap_avg IS NOT NULL) AS gaps,
             sum(gap_avg * gaps) FILTER (WHERE gap_avg IS NOT NULL)
               / sum(gaps) FILTER (WHERE gap_avg IS NOT NULL) AS gap_avg,
             CASE WHEN count(gap_avg) = 1 THEN max(gap_median) END AS gap_median
      FROM dep_region GROUP BY deposit
    ),
    well AS (
      SELECT sum(location_scans) AS location_scans, count(region) AS regions FROM (
        SELECT region, max(location_scans) AS location_scans
        FROM ${TABLE} WHERE ${place} AND ${whereRegions} GROUP BY region
      )
    )
    SELECT r.deposit, r.material,
           round(100.0 * any_value(d.deposit_scans) / any_value(well.location_scans), 2) AS deposit_share_pct,
           any_value(d.deposit_scans)::BIGINT AS deposit_scans,
           sum(r.total_scu) AS total_scu,
           any_value(d.composition_scans)::BIGINT AS composition_scans,
           sum(r.material_scans)::BIGINT AS material_scans,
           sum(r.avg_share_pct * r.composition_scans) / nullif(any_value(d.composition_scans), 0) AS avg_share_pct,
           any_value(well.location_scans)::BIGINT AS location_scans,
           any_value(well.regions)::BIGINT AS regions,
           any_value(d.gaps)::BIGINT AS deposit_cluster_gaps,
           any_value(d.gap_avg) AS deposit_avg_cluster_gap_seconds,
           any_value(d.gap_median) AS deposit_median_cluster_gap_seconds,
           ${BAND_COLUMNS.scu.map((c) => band(c, 'total_scu')).join(', ')},
           ${BAND_COLUMNS.count.map((c) => band(c, 'material_scans')).join(', ')}
    FROM r JOIN dep d ON d.deposit IS NOT DISTINCT FROM r.deposit CROSS JOIN well
    GROUP BY r.deposit, r.material`
}

// `distances`: Map(deposit → {avg, median, n}) of the distance between its clusters
function build(rows, listed, distances) {
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
        distance: distances.get(r.deposit) ?? null,
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
      scuTotal: null,
      materialScans: 0,
      weighted: 0,
      bands: { scu: new Array(BANDS.length).fill(0), count: new Array(BANDS.length).fill(0) },
      w: { scu: 0, count: 0 },
    }
    a.weighted += (num(r.avg_share_pct) ?? 0) * (num(r.composition_scans) ?? 0)
    if (r.total_scu != null) a.scuTotal = (a.scuTotal ?? 0) + num(r.total_scu)
    a.materialScans += num(r.material_scans) ?? 0
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
    scuTotal: a.scuTotal,
    materialScans: a.materialScans,
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
