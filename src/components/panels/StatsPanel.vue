<template>
  <div class="stats-panel-inner">
    <div v-if="loading" class="panel-loading"><span class="spinner" /></div>
    <div v-else-if="error" class="panel-error">{{ error }}</div>
    <div v-else class="stat-chips">
      <div v-for="chip in chips" :key="chip.label" class="stat-chip">
        <div class="stat-value">{{ chip.value }}</div>
        <div class="stat-label">{{ chip.label }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useDbStore } from '@/stores/db'
import { getBuiltinSQL } from '@/lib/queries'

const props = defineProps({
  panel: { type: Object, required: true },
})

const db = useDbStore()
const loading = ref(true)
const error = ref(null)
const chips = ref([])

const LABELS = {
  total_scans: 'Total Scans',
  total_users: 'Users',
  gravity_wells: 'Gravity Wells',
  systems: 'Systems',
  regions: 'Regions',
  deposit_types: 'Deposit Types',
  material_types: 'Material Types',
}

async function refresh() {
  if (!db.isReady) return
  loading.value = true
  error.value = null

  try {
    const sql = getBuiltinSQL('db_stats', null)
    const rows = await db.runQuery(sql)
    if (rows.length > 0) {
      chips.value = Object.entries(rows[0]).map(([key, val]) => ({
        label: LABELS[key] ?? key,
        value: typeof val === 'number' ? val.toLocaleString() : val,
      }))
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => { if (db.isReady) refresh() })
watch(() => db.isReady, (ready) => { if (ready) refresh() })
</script>
