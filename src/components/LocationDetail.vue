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
        <p class="loc-hint">Hover a deposit to light up its materials, or a material to light up the deposits it occurs in.</p>

        <div class="loc-lower">
          <section class="loc-chart">
            <h3>Size and frequency</h3>
            <table class="result-table loc-table">
              <thead>
                <tr><th>deposit</th><th>frequency</th><th>scans</th><th>avg size (SCU)</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in deposits" :key="d.deposit" :class="depClass(d)">
                  <td>{{ d.deposit }}</td>
                  <td class="num">{{ formatCell(d.share) }}%</td>
                  <td class="num">{{ d.scans.toLocaleString() }}</td>
                  <td class="num">{{ formatCell(d.scu / d.scans) }}</td>
                </tr>
                <tr class="loc-total">
                  <td>All deposits</td>
                  <td class="num">{{ formatCell(summary.share) }}%</td>
                  <td class="num">{{ summary.depositScans.toLocaleString() }}</td>
                  <td class="num">{{ formatCell(summary.avgScu) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="loc-hint">
              Frequency is the share of all scans here that were this deposit. Size is the average SCU of ore
              per rock.
            </p>
          </section>

          <section class="loc-chart">
            <h3>Quality <small>min – max, box = middle half, line = median</small></h3>
            <ul class="quality-list" @mouseleave="hover = null">
              <li
                v-for="m in qualityRows"
                :key="m.material"
                :class="matClass(m)"
                @mouseenter="hover = { type: 'material', name: m.material }"
              >
                <span class="bar-name">{{ m.material }}</span>
                <span class="q-track">
                  <span class="q-range" :style="qStyle(m.q.min, m.q.max)" />
                  <span class="q-box" :style="qStyle(m.q.p25, m.q.p75)" />
                  <span class="q-median" :style="{ left: m.q.median / 10 + '%' }" />
                </span>
                <span class="bar-value" :title="`${m.q.min} – ${m.q.max}`">{{ Math.round(m.q.median) }}</span>
              </li>
            </ul>
            <p v-if="qualityRows.length === 0" class="loc-hint">No quality data for these materials.</p>
          </section>
        </div>
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
const QUALITY_MAX = 1000

const props = defineProps({
  // { system, gravity_well, region } of the clicked card
  location: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const db = useDbStore()
const results = useResultsStore()

const deposits = ref([]) // { deposit, share, scans, scu, materials: Map(material → share in deposit) }
const materials = ref([]) // { material, share, q }
const summary = ref({ scans: 0, share: 0, depositScans: 0, avgScu: 0 })
const loading = ref(false)
const error = ref(null)
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
const qualityRows = computed(() => materials.value.filter((m) => m.q))

// ── hover linking ────────────────────────────────────────────────
const depByName = computed(() => new Map(deposits.value.map((d) => [d.deposit, d])))

function depClass(d) {
  const h = hover.value
  if (!h) return ''
  if (h.type === 'deposit') return h.name === d.deposit ? 'hi' : 'dim'
  return d.materials.has(h.name) ? 'hi' : 'dim'
}
function matClass(m) {
  const h = hover.value
  if (!h) return ''
  if (h.type === 'material') return h.name === m.material ? 'hi' : 'dim'
  return depByName.value.get(h.name)?.materials.has(m.material) ? 'hi' : 'dim'
}
// While hovering, the linked bars show the share of the pair instead of their own
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

const qStyle = (from, to) => ({
  left: (from / QUALITY_MAX) * 100 + '%',
  width: Math.max(0.5, ((to - from) / QUALITY_MAX) * 100) + '%',
})

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
              quality_min, quality_p25, quality_median, quality_p75, quality_max
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
  } catch (err) {
    error.value = err.message
    deposits.value = []
    materials.value = []
  } finally {
    loading.value = false
  }
}

function build(rows, listed) {
  const num = (v) => (v == null ? null : Number(v))
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
      }
      byDeposit.set(r.deposit, d)
    }
    d.scu += num(r.total_scu) ?? 0
    if (listed.has(r.material)) d.materials.set(r.material, num(r.avg_share_pct) ?? 0)
  }
  const all = [...byDeposit.values()]
  const shown = all.filter((d) => d.materials.size)
  shown.sort((a, b) => b.share - a.share || a.deposit.localeCompare(b.deposit))

  // A material's concentration: its share per deposit weighted by that deposit's
  // scans, over the scans of all deposits (deposits without it count as 0).
  const totalScans = all.reduce((s, d) => s + d.compositionScans, 0)
  const acc = new Map()
  for (const r of rows) {
    if (!listed.has(r.material)) continue
    const a = acc.get(r.material) ?? { weighted: 0, w: 0, q: null }
    a.weighted += (num(r.avg_share_pct) ?? 0) * (num(r.composition_scans) ?? 0)
    // Quality: the extremes are exact; the quartiles are averaged over deposits
    // weighted by how often the material was scanned there, so they are approximate
    if (r.quality_median != null) {
      const w = num(r.material_scans) ?? 1
      const x = a.q ?? { min: Infinity, max: -Infinity, p25: 0, median: 0, p75: 0, w: 0 }
      x.min = Math.min(x.min, num(r.quality_min))
      x.max = Math.max(x.max, num(r.quality_max))
      x.p25 += num(r.quality_p25) * w
      x.median += num(r.quality_median) * w
      x.p75 += num(r.quality_p75) * w
      x.w += w
      a.q = x
    }
    acc.set(r.material, a)
  }
  const list = [...acc].map(([material, a]) => ({
    material,
    share: totalScans ? Math.round((a.weighted / totalScans) * 100) / 100 : 0,
    q: a.q && {
      min: a.q.min,
      max: a.q.max,
      p25: a.q.p25 / a.q.w,
      median: a.q.median / a.q.w,
      p75: a.q.p75 / a.q.w,
    },
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
