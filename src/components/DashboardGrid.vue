<template>
  <div ref="gridEl" class="grid-stack">
    <div
      v-for="panel in dashboard.panels"
      :key="panel.id"
      class="grid-stack-item"
      :gs-id="panel.id"
      :gs-x="layoutMap[panel.id]?.x ?? 0"
      :gs-y="layoutMap[panel.id]?.y ?? 0"
      :gs-w="layoutMap[panel.id]?.w ?? 6"
      :gs-h="layoutMap[panel.id]?.h ?? 4"
      :gs-min-w="panel.type === 'stats' ? 4 : 3"
      :gs-min-h="panel.type === 'stats' ? 1 : 3"
    >
      <div class="grid-stack-item-content">
        <PanelWrapper :panel="panel" @remove="dashboard.removePanel(panel.id)">
          <StatsPanel v-if="panel.type === 'stats'" :panel="panel" />
          <ChartPanel v-else :panel="panel" />
        </PanelWrapper>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import { useDashboardStore } from '@/stores/dashboard'
import PanelWrapper from './PanelWrapper.vue'
import ChartPanel from './panels/ChartPanel.vue'
import StatsPanel from './panels/StatsPanel.vue'

const dashboard = useDashboardStore()
const gridEl = ref(null)
let grid = null

const layoutMap = computed(() => {
  const m = {}
  for (const l of dashboard.layout) m[l.id] = l
  return m
})

onMounted(async () => {
  await nextTick()
  grid = GridStack.init(
    {
      column: 12,
      cellHeight: 80,
      margin: 8,
      animate: true,
      draggable: { handle: '.gs-drag-handle' },
      resizable: { handles: 'e,se,s,sw,w' },
    },
    gridEl.value,
  )

  grid.on('change', (_e, items) => {
    if (!items) return
    const updated = dashboard.layout.map((l) => {
      const found = items.find((i) => i.id === l.id)
      return found ? { id: l.id, x: found.x, y: found.y, w: found.w, h: found.h } : l
    })
    dashboard.updateLayout(updated)
  })
})

// When panels array changes (add/remove), re-init grid items
watch(
  () => dashboard.panels.length,
  async () => {
    if (!grid) return
    await nextTick()
    grid.makeWidget(gridEl.value.lastElementChild)
  },
)

onBeforeUnmount(() => {
  grid?.destroy(false)
})
</script>
