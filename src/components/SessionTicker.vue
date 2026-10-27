<template>
  <div v-if="db.newSessions.length" class="session-ticker" role="status">
    <span class="ticker-label">NEW</span>
    <div class="ticker-window" :title="text">
      <span class="ticker-text" :style="{ animationDuration: duration }">{{ text }}</span>
    </div>
    <button class="ticker-close" title="Dismiss" @click="db.dismissNewSessions()">×</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDbStore } from '@/stores/db'

const SHOWN = 8

const db = useDbStore()

const text = computed(() => {
  const list = db.newSessions
  const n = list.length
  const parts = list.slice(0, SHOWN).map((s) => {
    const where = s.gravity_well ? ` at ${s.gravity_well}` : ''
    return `${s.user_name ?? 'Unknown'}: ${s.scans} ${s.scans === 1 ? 'scan' : 'scans'}${where}`
  })
  if (n > SHOWN) parts.push(`and ${n - SHOWN} more`)
  return `${n} new ${n === 1 ? 'session' : 'sessions'} loaded  ·  ${parts.join('  ·  ')}`
})

// Roughly constant reading speed regardless of how much text there is
const duration = computed(() => `${Math.max(20, Math.round(text.value.length * 0.22))}s`)
</script>
