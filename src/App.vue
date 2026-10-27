<template>
  <div class="app-root">
    <AppHeader v-model:view="view" @open-query="queryEditorOpen = true" @add-panel="queryEditorOpen = true" />
    <SessionTicker />

    <div class="app-body">
      <FilterSidebar v-show="view === 'dashboard'" @apply="onFiltersApply" />
      <main class="dashboard-main">
        <div v-if="db.status === 'idle' || db.status === 'initializing' || db.status === 'loading'" class="loading-overlay">
          <span class="spinner lg" />
          <p>{{ db.loadingMessage || 'Initialising…' }}</p>
          <p v-if="db.loadingProgress.total > 0" class="progress-detail">
            {{ db.loadingProgress.loaded }} / {{ db.loadingProgress.total }} files
          </p>
        </div>
        <div v-else-if="db.status === 'error'" class="error-overlay">
          <p>⚠ Failed to connect: {{ db.error }}</p>
          <button class="btn-primary" @click="db.init()">Retry</button>
        </div>
        <template v-else>
          <!-- Kept mounted while hidden: the grid and its charts size themselves to the page -->
          <DashboardGrid v-show="view === 'dashboard'" />
          <ResultsView v-if="view === 'results'" />
          <HighscoresView v-else-if="view === 'highscores'" />
        </template>
      </main>
    </div>

    <QueryEditor :open="queryEditorOpen" @close="queryEditorOpen = false" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { useDashboardStore } from '@/stores/dashboard'
import { useAliasesStore } from '@/stores/aliases'
import AppHeader from '@/components/AppHeader.vue'
import SessionTicker from '@/components/SessionTicker.vue'
import FilterSidebar from '@/components/FilterSidebar.vue'
import DashboardGrid from '@/components/DashboardGrid.vue'
import ResultsView from '@/components/ResultsView.vue'
import HighscoresView from '@/components/HighscoresView.vue'
import QueryEditor from '@/components/QueryEditor.vue'

const VIEWS = ['dashboard', 'results', 'highscores']

const db = useDbStore()
const filters = useFiltersStore()
const dashboard = useDashboardStore()
const aliases = useAliasesStore()

const queryEditorOpen = ref(false)

// The tab lives in the URL hash so a view can be linked and survives a reload
const fromHash = () => {
  const id = location.hash.slice(1)
  return VIEWS.includes(id) ? id : 'dashboard'
}
const view = ref(fromHash())
window.addEventListener('hashchange', () => { view.value = fromHash() })
watch(view, (id) => {
  if (fromHash() !== id) history.replaceState(null, '', id === 'dashboard' ? location.pathname : `#${id}`)
  // Charts drawn while hidden have no size; let them re-measure
  if (id === 'dashboard') nextTick(() => window.dispatchEvent(new Event('resize')))
})

onMounted(async () => {
  // Load aliases config (optional — silently skipped if file missing)
  await aliases.load()

  // Load dashboard config (localStorage first, then default)
  const loaded = dashboard.loadFromStorage()
  if (!loaded) await dashboard.loadDefault()

  // Init DuckDB and load parquets
  await db.init()
})

// Load autocomplete data once DB is ready, and again after a background refresh
watch(() => db.isReady, (ready) => {
  if (ready) filters.loadAutocomplete()
})
watch(() => db.dataVersion, () => filters.loadAutocomplete())

function onFiltersApply() {
  // Panels watch the filter store reactively — no explicit trigger needed
}
</script>
