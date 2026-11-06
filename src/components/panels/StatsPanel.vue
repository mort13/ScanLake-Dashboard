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
import { ref, watch, onMounted, inject } from 'vue'
import { useDbStore } from '@/stores/db'
import { getBuiltinSQL } from '@/lib/queries'
import { rowsToCsv, downloadCsv } from '@/lib/csv'

const props = defineProps({
  panel: { type: Object, required: true },
})

const db = useDbStore()
const loading = ref(true)
const error = ref(null)
const chips = ref([])
const lastRows = ref([])

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
    lastRows.value = rows
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

const registerSaveHandler = inject('registerSaveHandler', null)
const registerCsvHandler  = inject('registerCsvHandler',  null)

function drawStatsCanvas(width, height, title) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0a0602'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#ffd98a'
  ctx.font = '22px "VT323", ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText((title || 'Statistics').toUpperCase(), 24, 28)

  const count = chips.value.length
  if (count === 0) return canvas

  const padH  = 24
  const padV  = 56
  const gap   = 12
  const chipH = Math.min(100, height - padV - padH)
  const chipW = (width - padH * 2 - gap * (count - 1)) / count
  const startY = padV + (height - padV - padH - chipH) / 2

  chips.value.forEach((chip, i) => {
    const x = padH + i * (chipW + gap)
    const y = startY

    ctx.fillStyle = '#120b03'
    ctx.beginPath()
    ctx.rect(x, y, chipW, chipH)
    ctx.fill()
    ctx.strokeStyle = '#a86a10'
    ctx.lineWidth = 1
    ctx.stroke()

    const valSize = Math.min(26, Math.max(13, chipH * 0.32))
    ctx.fillStyle = '#ffd98a'
    ctx.font = `${Math.round(valSize * 1.3)}px "VT323", ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(chip.value, x + chipW / 2, y + chipH * 0.42)

    const lblSize = Math.min(11, Math.max(9, chipH * 0.14))
    ctx.fillStyle = '#a86a10'
    ctx.font = `${lblSize}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.fillText(chip.label.toUpperCase(), x + chipW / 2, y + chipH * 0.72)
  })

  return canvas
}

onMounted(() => {
  registerCsvHandler?.((title) => {
    downloadCsv(rowsToCsv(lastRows.value), `${(title || 'stats').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`)
  })
  registerSaveHandler?.((width, height, title) => {
    const canvas = drawStatsCanvas(width, height, title)
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'stats').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`
    a.click()
  })
  if (db.isReady) refresh()
})
watch(() => db.isReady, (ready) => { if (ready) refresh() })
watch(() => db.dataVersion, () => refresh())
</script>
