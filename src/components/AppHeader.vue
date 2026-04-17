<template>
  <header class="app-header">
    <div class="header-brand">
      <span class="header-logo">◈</span>
      <span class="header-title">ScanLake</span>
    </div>

    <div class="header-status">
      <template v-if="db.status === 'initializing' || db.status === 'loading'">
        <span class="spinner sm" />
        <span class="status-text">{{ db.loadingMessage }}</span>
        <span v-if="db.loadingProgress.total > 0" class="progress-text">
          {{ db.loadingProgress.loaded }} / {{ db.loadingProgress.total }}
        </span>
      </template>
      <template v-else-if="db.status === 'error'">
        <span class="status-error">⚠ {{ db.error }}</span>
      </template>
      <template v-else-if="db.status === 'ready'">
        <span class="status-ready">● Ready</span>
      </template>
    </div>

    <nav class="header-actions">
      <button class="btn-secondary" @click="emit('openQuery')">
        ✎ Query Editor
      </button>
      <button class="btn-ghost" @click="emit('addPanel')">
        + Add Panel
      </button>
      <button class="btn-ghost" @click="dashboard.exportJSON()" title="Export dashboard layout as JSON">
        ↓ Export
      </button>
      <label class="btn-ghost" title="Import dashboard layout from JSON">
        ↑ Import
        <input type="file" accept=".json" style="display:none" @change="onImport" />
      </label>
    </nav>
  </header>
</template>

<script setup>
import { useDbStore } from '@/stores/db'
import { useDashboardStore } from '@/stores/dashboard'

const db = useDbStore()
const dashboard = useDashboardStore()
const emit = defineEmits(['openQuery', 'addPanel'])

async function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    await dashboard.importJSON(file)
  } catch (err) {
    alert('Import failed: ' + err.message)
  }
  e.target.value = ''
}
</script>
