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
      </div>

      <div v-if="cards.length === 0 && !loading" class="no-results">No materials match the filters.</div>
      <div v-else class="region-grid">
        <section
          v-for="card in cards"
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
          <ol class="region-materials">
            <li
              v-for="l in card.locations"
              :key="l.key"
              :title="`${l.system} · ${l.gravity_well} · present in ${formatCell(l.presence)}% of scans there`"
            >
              <span class="mat-name">{{ locationName(l) }}</span>
              <span class="mat-bar"><span :style="{ width: Math.min(100, l.share) + '%' }" /></span>
              <span class="mat-share">{{ formatCell(l.share) }}%</span>
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
import { REGION_TABLE, loadRegionConcentrations, locationName } from '@/lib/regionData'
import MaterialDetail from '@/components/MaterialDetail.vue'

const db = useDbStore()
const filters = useFiltersStore()
const results = useResultsStore()
const { materialDetail } = storeToRefs(results) // the open material (kept in the store)

const cards = ref([]) // { material, scans, locations: [{ key, system, gravity_well, region, share, presence }] }
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

function open(card) {
  results.materialLocation = null
  materialDetail.value = card.material
}

/** One card per material, its locations ordered by concentration. */
async function load() {
  if (!db.isReady || !db.resultTables.includes(REGION_TABLE)) return
  loading.value = true
  error.value = null
  try {
    columns.value = (await db.describeTable(`results_${REGION_TABLE}`)).map((c) => c.column_name)
    const { cells } = await loadRegionConcentrations(db, results, columns.value)
    const byMaterial = new Map()
    for (const c of cells) {
      let card = byMaterial.get(c.material)
      if (!card) byMaterial.set(c.material, (card = { material: c.material, scans: 0, locations: [] }))
      card.scans += c.materialScans
      card.locations.push(c)
    }
    for (const card of byMaterial.values()) {
      card.locations.sort((a, b) => b.share - a.share || locationName(a).localeCompare(locationName(b)))
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
  () => [results.locationFilters, results.depositFilters, results.materialFilters],
  load,
  { deep: true },
)
watch(() => db.dataVersion, load)
watch(() => db.isReady, (ready) => { if (ready) load() })

onMounted(load)
</script>
