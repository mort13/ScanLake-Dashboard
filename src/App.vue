<template>
  <div class="app-root">
    <AppHeader @open-query="queryEditorOpen = true" @add-panel="queryEditorOpen = true" />

    <div class="app-body">
      <FilterSidebar @apply="onFiltersApply" />
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
        <DashboardGrid v-else />
      </main>
    </div>

    <QueryEditor :open="queryEditorOpen" @close="queryEditorOpen = false" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useDbStore } from '@/stores/db'
import { useFiltersStore } from '@/stores/filters'
import { useDashboardStore } from '@/stores/dashboard'
import AppHeader from '@/components/AppHeader.vue'
import FilterSidebar from '@/components/FilterSidebar.vue'
import DashboardGrid from '@/components/DashboardGrid.vue'
import QueryEditor from '@/components/QueryEditor.vue'

const db = useDbStore()
const filters = useFiltersStore()
const dashboard = useDashboardStore()

const queryEditorOpen = ref(false)

onMounted(async () => {
  // Load dashboard config (localStorage first, then default)
  const loaded = dashboard.loadFromStorage()
  if (!loaded) await dashboard.loadDefault()

  // Init DuckDB and load parquets
  await db.init()
})

// Load autocomplete data once DB is ready
watch(() => db.isReady, (ready) => {
  if (ready) filters.loadAutocomplete()
})

function onFiltersApply() {
  // Panels watch the filter store reactively — no explicit trigger needed
}
</script>

