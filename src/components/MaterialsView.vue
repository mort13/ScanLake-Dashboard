<template>
  <div class="results-view">
    <!-- A material's details replace the cards; the filter sidebar stays available -->
    <MaterialDetail v-if="materialDetail" :material="materialDetail" @close="materialDetail = null" />

    <template v-else>
      <div class="results-meta">
        <span v-if="unused.length" class="meta-note">
          The {{ unused.join(' and ') }} filter doesn't apply to these results.
        </span>
        <span v-else-if="error" class="panel-error">{{ error }}</span>
        <span v-else-if="ignored" class="meta-note">Quality and date filters don't apply to these results.</span>
        <span v-else class="meta-count">{{ cards.length.toLocaleString() }} {{ cards.length === 1 ? 'material' : 'materials' }}</span>
        <span class="meta-spacer" />
        <CardOptions />
      </div>

      <div v-if="cards.length === 0 && !loading" class="no-results">No materials match the filters.</div>
      <div v-else class="region-grid">
        <section
          v-for="card in shownCards"
          :key="card.material"
          class="region-card"
          role="button"
          tabindex="0"
          title="Show details"
          @click="open(card)"
          @keydown.enter="open(card)"
        >
          <header class="region-head">
            <h3>{{ card.material }}</h3>
            <p>{{ card.locations.length }} {{ card.locations.length === 1 ? 'location' : 'locations' }}</p>
          </header>
          <ol class="region-materials" :class="{ 'by-gap': results.cardMetric === 'gap' }">
            <li v-for="l in card.locations" :key="l.key" :title="rowTitle(l)">
              <span class="mat-name">{{ locationName(l) }}</span>
              <span class="mat-bar"><span :style="{ width: l.pct + '%' }" /></span>
              <span class="mat-share">{{ metricText(l, results.cardMetric) }}</span>
            </li>
          </ol>
          <footer class="region-foot">{{ card.scans.toLocaleString() }} scans contain it</footer>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { useResultsStore } from '@/stores/results'
import { formatCell } from '@/lib/results'
import {
  REGION_TABLE, loadRegionConcentrations, locationName, sortByMetric, metricText, barScale,
} from '@/lib/regionData'
import MaterialDetail from '@/components/MaterialDetail.vue'
import CardOptions from '@/components/CardOptions.vue'

const db = useDbStore()
const filters = useFiltersStore()
const results = useResultsStore()
const { materialDetail } = storeToRefs(results) // the open material (kept in the store)

const cards = ref([]) // { material, scans, locations: [{ key, system, gravity_well, region, share, presence, gap }] }
const columns = ref([])
const loading = ref(false)
const error = ref(null)

// How the hint names each unused filter, where its key alone doesn't read well
const FILTER_NAMES = { mine: '"Only my scans"' }
const unused = computed(() => results.unusedFilters(columns.value).map((f) => FILTER_NAMES[f] ?? f))
// The results are precomputed, so the sidebar's quality and date filters can't be applied
const ignored = computed(
  () =>
    filters.qualityRange[0] !== 0 ||
    filters.qualityRange[1] !== 1000 ||
    filters.dateRange[0] !== null ||
    filters.dateRange[1] !== null,
)

// The cards as shown: locations ordered by the chosen figure
const shownCards = computed(() =>
  cards.value.map((card) => {
    const sorted = sortByMetric(card.locations, results.cardMetric, locationName)
    const pct = barScale(sorted, results.cardMetric)
    return { ...card, locations: sorted.map((l) => ({ ...l, pct: pct(l) })) }
  }),
)

function rowTitle(l) {
  return results.cardMetric === 'gap'
    ? `${l.system} · ${l.gravity_well} · ${l.gap ? `average over ${l.gap.n} ${l.gap.n === 1 ? 'gap' : 'gaps'}` : 'no gaps measured'}`
    : `${l.system} · ${l.gravity_well} · present in ${formatCell(l.presence)}% of scans there`
}

function open(card) {
  results.materialSelection = []
  materialDetail.value = card.material
}

/** One card per material. */
async function load() {
  if (!db.isReady || !db.resultTables.includes(REGION_TABLE)) return
  loading.value = true
  error.value = null
  try {
    columns.value = (await db.describeTable(`results_${REGION_TABLE}`)).map((c) => c.column_name)
    const { cells } = await loadRegionConcentrations(db, results, columns.value, { byWell: results.groupByWell })
    const byMaterial = new Map()
    for (const c of cells) {
      let card = byMaterial.get(c.material)
      if (!card) byMaterial.set(c.material, (card = { material: c.material, scans: 0, locations: [] }))
      card.scans += c.materialScans
      card.locations.push(c)
    }
    cards.value = [...byMaterial.values()].sort(
      (a, b) => b.scans - a.scans || a.material.localeCompare(b.material),
    )
  } catch (err) {
    error.value = err.message
    cards.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [results.locationFilters, results.depositFilters, results.materialFilters, results.groupByWell],
  load,
  { deep: true },
)
watch(() => db.dataVersion, load)
watch(() => db.isReady, (ready) => { if (ready) load() })

onMounted(load)
</script>
