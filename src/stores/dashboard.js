import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'scanlake_dashboard_v1'
const SCHEMA_VERSION = 1

export const useDashboardStore = defineStore('dashboard', () => {
  const panels = ref([])
  const layout = ref([]) // [{ id, x, y, w, h }]

  // ── Load / save ────────────────────────────────────────────────
  function _persistConfig() {
    const cfg = {
      version: SCHEMA_VERSION,
      panels: panels.value,
      layout: layout.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  }

  async function loadDefault() {
    try {
      const res = await fetch('/default-dashboard.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const cfg = await res.json()
      _applyConfig(cfg)
    } catch (err) {
      console.warn('[dashboard] Could not load default config:', err.message)
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const cfg = JSON.parse(raw)
      if (cfg.version !== SCHEMA_VERSION) return false
      _applyConfig(cfg)
      return true
    } catch {
      return false
    }
  }

  function _applyConfig(cfg) {
    panels.value = cfg.panels ?? []
    layout.value = cfg.layout ?? _defaultLayout(cfg.panels ?? [])
  }

  function _defaultLayout(pnls) {
    return pnls.map((p, i) => ({
      id: p.id,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 4,
      w: p.type === 'stats' ? 12 : 6,
      h: p.type === 'stats' ? 2 : 4,
    }))
  }

  // ── Export / Import ────────────────────────────────────────────
  function exportJSON() {
    const cfg = {
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      panels: panels.value,
      layout: layout.value,
    }
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const date = new Date().toISOString().slice(0, 10)
    a.download = `scanlake-dashboard-${date}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const cfg = JSON.parse(e.target.result)
          if (!cfg.panels) throw new Error('Invalid dashboard file: missing panels')
          _applyConfig(cfg)
          _persistConfig()
          resolve()
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('File read failed'))
      reader.readAsText(file)
    })
  }

  // ── Panel management ───────────────────────────────────────────
  function addPanel(panelDef) {
    panels.value.push(panelDef)

    // Place new panel after existing ones
    const maxY = layout.value.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    layout.value.push({ id: panelDef.id, x: 0, y: maxY, w: 6, h: 4 })

    _persistConfig()
  }

  function removePanel(id) {
    panels.value = panels.value.filter((p) => p.id !== id)
    layout.value = layout.value.filter((l) => l.id !== id)
    _persistConfig()
  }

  function updatePanel(id, patch) {
    const idx = panels.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      panels.value[idx] = { ...panels.value[idx], ...patch }
      _persistConfig()
    }
  }

  function updateLayout(newLayout) {
    layout.value = newLayout
    _persistConfig()
  }

  return {
    panels,
    layout,
    loadDefault,
    loadFromStorage,
    exportJSON,
    importJSON,
    addPanel,
    removePanel,
    updatePanel,
    updateLayout,
  }
})
