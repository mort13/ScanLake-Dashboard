<template>
  <div class="card-options">
    <div class="result-tabs" role="group" aria-label="Show on the cards">
      <button
        class="result-chip"
        :class="{ active: results.cardMetric === 'share' }"
        title="Share of a rock at the location that is this material"
        @click="results.cardMetric = 'share'"
      >Concentration</button>
      <button
        class="result-chip"
        :class="{ active: results.cardMetric === 'gap' }"
        title="Average time between clusters of the deposits containing the material"
        @click="results.cardMetric = 'gap'"
      >Time between clusters</button>
    </div>
    <button
      class="result-chip"
      :class="{ active: results.groupByWell }"
      :aria-pressed="results.groupByWell"
      @click="results.groupByWell = !results.groupByWell"
    >Group by gravity well</button>
  </div>
</template>

<script setup>
import { useResultsStore } from '@/stores/results'

const results = useResultsStore()
</script>
