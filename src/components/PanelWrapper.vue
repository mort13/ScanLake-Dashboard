<template>
  <div class="panel">
    <div class="panel-header">
      <span class="panel-drag-handle gs-drag-handle">⠿</span>
      <h4 class="panel-title">{{ panel.title }}</h4>
      <div class="panel-actions">
        <button
          v-if="resolvedSQL"
          class="panel-btn panel-btn--action"
          title="View SQL query"
          @click="queryOpen = true"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
        </button>
        <button
          v-if="csvHandler"
          class="panel-btn panel-btn--action"
          title="Export as CSV"
          @click="handleCsvExport"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
        <button
          class="panel-btn panel-btn--action"
          title="Save as image"
          @click="saveOpen = true"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button
          v-if="panel.custom"
          class="panel-btn"
          title="Remove panel"
          @click="emit('remove')"
        >×</button>
      </div>
    </div>
    <div class="panel-body">
      <slot />
    </div>

    <SaveImageModal
      v-if="saveOpen"
      @close="saveOpen = false"
      @download="handleDownload"
    />
    <QueryViewerModal
      v-if="queryOpen && resolvedSQL"
      :title="panel.title"
      :sql="resolvedSQL"
      @close="queryOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, provide } from 'vue'
import { useFiltersStore } from '@/stores/filters'
import { useAliasesStore } from '@/stores/aliases'
import { getBuiltinSQL } from '@/lib/queries'
import SaveImageModal from './SaveImageModal.vue'
import QueryViewerModal from './QueryViewerModal.vue'

const props = defineProps({
  panel: { type: Object, required: true },
})
const emit = defineEmits(['remove'])

const filters = useFiltersStore()
const aliases = useAliasesStore()

const saveOpen  = ref(false)
const queryOpen = ref(false)

// Resolved SQL (with current filter state) for the query viewer
const resolvedSQL = computed(() => {
  if (props.panel.sql) return props.panel.sql
  if (props.panel.builtinKey) {
    const where = filters.buildWhere()
    const ae = {
      deposit:   aliases.buildCaseExpr('s.deposit',      'deposit'),
      material:  aliases.buildCaseExpr('c.type',         'material'),
      user_name: aliases.buildCaseExpr('s.user_name',    'user_name'),
      location:  aliases.buildCaseExpr('s.gravity_well', 'location'),
    }
    return getBuiltinSQL(props.panel.builtinKey, where, ae)
  }
  return null
})

// Save handler registered by the child panel component via inject
const saveHandler = ref(null)
provide('registerSaveHandler', (fn) => { saveHandler.value = fn })

// CSV handler registered by the child panel component via inject
const csvHandler = ref(null)
provide('registerCsvHandler', (fn) => { csvHandler.value = fn })

async function handleDownload({ width, height }) {
  saveOpen.value = false
  if (saveHandler.value) {
    await saveHandler.value(width, height, props.panel.title)
  }
}

function handleCsvExport() {
  if (csvHandler.value) {
    csvHandler.value(props.panel.title)
  }
}
</script>
