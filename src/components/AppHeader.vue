<template>
  <header class="app-header">
    <div class="header-brand">
      <span class="header-logo">◈</span>
      <span class="header-title">ScanLake</span>
    </div>

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
  view: { type: String, default: 'results' },
})

const TABS = [
  { id: 'results', label: 'Results' },
  { id: 'dashboard', label: 'Dashboard' },
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
