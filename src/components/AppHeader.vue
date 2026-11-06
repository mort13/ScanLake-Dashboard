<template>
  <header class="app-header">
    <!-- Back to the landing page; the mark is the same drawing as public/favicon.svg -->
    <a class="header-brand" href="https://scanlake.rocks/" title="ScanLake home">
      <svg class="logo-mark" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M7 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5v-1H4v-1H3v-1H2V9H1V7h1V6h1V5h1V4h1V3h1V2h1zM7 3h2v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5v-1H4V9H3V7h1V6h1V5h1V4h1zM7 5h2v1h1v1h1v2h-1v1h-1v1H7v-1H6V9H5V7h1V6h1z"/></svg>
      <span class="header-title">ScanLake</span>
    </a>

    <nav class="header-tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="header-tab"
        :class="{ active: view === tab.id }"
        role="tab"
        @click="emit('update:view', tab.id)"
      >{{ tab.label }}</button>
    </nav>

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

    <nav v-if="view === 'dashboard'" class="header-actions">
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

    <!-- Optional Discord login, shared with the other *.scanlake.rocks apps -->
    <div class="header-account">
      <template v-if="auth.isLoggedIn">
        <span class="account-avatar" aria-hidden="true">
          <!-- crossorigin: the page's COEP require-corp blocks a plain cross-origin image -->
          <img
            v-if="avatarUrl && avatarUrl !== failedAvatar"
            :src="avatarUrl"
            alt=""
            crossorigin="anonymous"
            @error="failedAvatar = avatarUrl"
          />
          <template v-else>{{ initial }}</template>
        </span>
        <span class="account-name" :title="displayName">{{ displayName }}</span>
        <button class="btn-ghost" @click="auth.logout()">Log out</button>
      </template>
      <button v-else-if="auth.status === 'ready' || auth.status === 'error'" class="btn-secondary" @click="auth.login()">
        Login with Discord
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'

const db = useDbStore()
const dashboard = useDashboardStore()
const auth = useAuthStore()
const emit = defineEmits(['openQuery', 'addPanel', 'update:view'])

defineProps({
  view: { type: String, default: 'locations' },
})

const TABS = [
  { id: 'locations', label: 'Locations' },
  { id: 'materials', label: 'Materials' },
  { id: 'dashboard', label: 'Statistics' },
  { id: 'highscores', label: 'Highscores' },
]

const displayName = computed(() => {
  const d = auth.me?.discord
  return d?.globalName || d?.username || 'Discord user'
})
const initial = computed(() => Array.from(displayName.value)[0]?.toUpperCase() ?? '?')
const avatarUrl = computed(() => auth.me?.discord?.avatarUrl ?? null)
// The avatar URL that failed to load; shows the initial until the URL changes
const failedAvatar = ref(null)

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
