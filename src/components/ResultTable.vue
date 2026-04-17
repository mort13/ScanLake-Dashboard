<template>
  <div v-if="!rows || rows.length === 0" class="no-results">
    <span v-if="rows === null">Run a query to see results.</span>
    <span v-else>No rows returned.</span>
  </div>
  <div v-else class="table-scroll">
    <table class="result-table">
      <thead>
        <tr>
          <th v-for="col in cols" :key="col">{{ col }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="col in cols" :key="col">{{ fmt(row[col]) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rows: { type: Array, default: null },
})

const cols = computed(() => (props.rows?.length ? Object.keys(props.rows[0]) : []))

function fmt(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4)
  return String(v)
}
</script>
