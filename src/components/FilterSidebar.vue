<template>
  <aside class="filter-sidebar" :class="{ collapsed }">
    <button class="sidebar-toggle" @click="collapsed = !collapsed" :title="collapsed ? 'Show filters' : 'Hide filters'">
      <span class="toggle-icon">{{ collapsed ? '›' : '‹' }}</span>
    </button>

    <div class="sidebar-body" v-show="!collapsed">
      <h3 class="sidebar-title">Filters</h3>

      <!-- Location filter -->
      <FilterGroup label="Location" hint="system, gravity well, or region">
        <TagInput
          v-model="filters.locationFilters"
          :suggestions="filters.acLocation"
          placeholder="e.g. Pyro, Bloom"
          :allow-negation="false"
          :as-objects="false"
        />
      </FilterGroup>

      <!-- Deposit filter (supports negation) -->
      <FilterGroup label="Deposit Type" hint="prefix with ! to exclude">
        <TagInput
          v-model="filters.depositFilters"
          :suggestions="filters.acDeposit"
          placeholder="e.g. Quantanium, !Tungsten"
          :allow-negation="true"
          :as-objects="true"
        />
      </FilterGroup>

      <!-- Material filter (supports negation) -->
      <FilterGroup label="Material Type" hint="prefix with ! to exclude">
        <TagInput
          v-model="filters.materialFilters"
          :suggestions="filters.acMaterial"
          placeholder="e.g. iron, !none"
          :allow-negation="true"
          :as-objects="true"
        />
      </FilterGroup>

      <!-- Quality range -->
      <FilterGroup label="Quality Range">
        <div class="quality-inputs">
          <div class="quality-input-group">
            <label for="quality-min">Min</label>
            <input
              id="quality-min"
              type="number" min="0" max="1000" step="1"
              :value="filters.qualityRange[0]"
              @input="setQualityMin($event.target.value)"
              class="quality-input"
            />
          </div>
          <div class="quality-input-group">
            <label for="quality-max">Max</label>
            <input
              id="quality-max"
              type="number" min="0" max="1000" step="1"
              :value="filters.qualityRange[1]"
              @input="setQualityMax($event.target.value)"
              class="quality-input"
            />
          </div>
        </div>
      </FilterGroup>

      <!-- Date range (only shown when a date column is detected) -->
      <FilterGroup v-if="filters.dateColumn" label="Date Range">
        <div class="date-inputs">
          <div class="date-input-group">
            <label for="date-from">From</label>
            <input
              id="date-from"
              type="date"
              :value="filters.dateRange[0] ?? ''"
              :min="filters.dateMin ?? undefined"
              :max="filters.dateRange[1] ?? filters.dateMax ?? undefined"
              @change="setDateFrom($event.target.value || null)"
              class="date-input"
            />
          </div>
          <div class="date-input-group">
            <label for="date-to">To</label>
            <input
              id="date-to"
              type="date"
              :value="filters.dateRange[1] ?? ''"
              :min="filters.dateRange[0] ?? filters.dateMin ?? undefined"
              :max="filters.dateMax ?? undefined"
              @change="setDateTo($event.target.value || null)"
              class="date-input"
            />
          </div>
        </div>
        <p v-if="filters.dateMin" class="date-range-hint">
          {{ filters.dateMin }} → {{ filters.dateMax }}
        </p>
      </FilterGroup>

      <div class="sidebar-actions">
        <button class="btn-primary" @click="apply">Apply</button>
        <button class="btn-ghost" @click="clear">Clear</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useFiltersStore } from '@/stores/filters'
import FilterGroup from './FilterGroup.vue'
import TagInput from './TagInput.vue'

const filters = useFiltersStore()
const collapsed = ref(false)

const emit = defineEmits(['apply'])

function setQualityMin(v) {
  const newMin = Math.min(Number(v), filters.qualityRange[1])
  filters.$patch({ qualityRange: [newMin, filters.qualityRange[1]] })
}
function setQualityMax(v) {
  const newMax = Math.max(Number(v), filters.qualityRange[0])
  filters.$patch({ qualityRange: [filters.qualityRange[0], newMax] })
}

function setDateFrom(v) {
  filters.$patch({ dateRange: [v, filters.dateRange[1]] })
}
function setDateTo(v) {
  filters.$patch({ dateRange: [filters.dateRange[0], v] })
}

function apply() {
  // Filters are reactive — panels watch them automatically, no emit needed
}

function clear() {
  filters.clearAll()
}
</script>

<style scoped>
.quality-inputs {
  display: flex;
  gap: 12px;
}

.quality-input-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quality-input-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #c9d1d9;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  transition: all 200ms ease;
}

.quality-input:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.quality-input:focus {
  outline: none;
  border-color: #5470c6;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 2px rgba(84, 112, 198, 0.2);
}

.date-inputs {
  display: flex;
  gap: 8px;
}

.date-input-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-input-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.date-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #c9d1d9;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  width: 100%;
  transition: all 200ms ease;
  color-scheme: dark;
}

.date-input:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.date-input:focus {
  outline: none;
  border-color: #5470c6;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 2px rgba(84, 112, 198, 0.2);
}

.date-range-hint {
  font-size: 11px;
  color: var(--text-subtle);
  margin-top: 4px;
  text-align: center;
}
</style>
