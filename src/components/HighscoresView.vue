<template>
  <div class="highscores-view">
    <div v-if="error" class="panel-error">{{ error }}</div>
    <div v-else-if="boards.length === 0" class="no-results">No highscores were published yet.</div>
    <div v-else class="board-grid">
      <section v-for="board in boards" :key="board.category" class="board">
        <header class="board-head">
          <h3>{{ board.title }}</h3>
          <p>{{ board.subtitle }}</p>
        </header>
        <ol class="board-list">
          <li v-for="e in board.entries" :key="e.rank" class="board-row" :class="'rank-' + e.rank">
            <span class="board-rank">{{ e.rank }}</span>
            <span class="board-who">
              <strong>{{ e.user_name }}</strong>
              <small v-if="e.detail">{{ e.detail }}</small>
            </span>
            <span class="board-value">
              {{ board.format(e) }}
              <small v-if="e.achieved_at">{{ e.achieved_at.slice(0, 10) }}</small>
            </span>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDbStore } from '@/stores/db'
import { selectList, prettyName, formatCell } from '@/lib/results'

const db = useDbStore()
const entries = ref([])
const error = ref(null)

const num = (e) => formatCell(e.value)
const withUnit = (e) => (e.unit ? `${num(e)} ${e.unit}` : num(e))

// Known categories in display order; any new category the Refinery adds is
// appended with a prettified name and the value shown with its unit.
const CATEGORIES = {
  fastest_session_avg_scan_time: {
    title: 'Fastest session',
    subtitle: 'Lowest average time between scans, sessions of 30+ scans',
    format: (e) => `${formatCell(Math.round(e.value * 10) / 10)} s / scan`,
  },
  biggest_scan: { title: 'Biggest scan', subtitle: 'Heaviest rock scanned', format: withUnit },
  most_scans_in_session: {
    title: 'Most scans in a session',
    subtitle: 'Rocks scanned in one sitting',
    format: (e) => `${num(e)} scans`,
  },
  most_scans_total: {
    title: 'Most scans overall',
    subtitle: 'All sessions together',
    format: (e) => `${num(e)} scans`,
  },
}

const boards = computed(() => {
  const byCategory = new Map()
  for (const e of entries.value) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, [])
    byCategory.get(e.category).push(e)
  }
  const known = Object.keys(CATEGORIES).filter((c) => byCategory.has(c))
  const extra = [...byCategory.keys()].filter((c) => !(c in CATEGORIES)).sort()
  return [...known, ...extra].map((category) => {
    const meta = CATEGORIES[category] ?? {
      title: prettyName(category),
      subtitle: '',
      format: withUnit,
    }
    return { category, ...meta, entries: byCategory.get(category).sort((a, b) => a.rank - b.rank) }
  })
})

async function load() {
  if (!db.isReady || !db.resultTables.includes('highscores')) {
    entries.value = []
    return
  }
  try {
    const schema = await db.describeTable('results_highscores')
    entries.value = await db.runQuery(
      `SELECT ${selectList(schema)} FROM results_highscores ORDER BY category, rank`,
    )
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

watch(() => db.dataVersion, load)
watch(() => db.isReady, load)
onMounted(load)
</script>
