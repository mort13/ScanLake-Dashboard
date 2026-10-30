<template>
  <span class="num-cell">
    <span class="num-int" :style="{ width: width + 'ch' }">{{ parts.int }}</span><span class="num-frac">{{ parts.frac }}</span><span v-if="parts.int !== '–'" class="num-suffix">{{ suffix }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { splitNumber } from '@/lib/results'

/**
 * A number laid out so a column of them lines up at the decimal point while the
 * column itself stays left aligned: the part before the decimal sign gets a fixed
 * width (the widest in the column, see intWeight) and is right aligned inside it.
 */
const props = defineProps({
  value: { type: Number, default: null },
  width: { type: Number, default: 1 }, // width of the integer part, in ch
  suffix: { type: String, default: '' }, // e.g. "%", shown after the decimals
})

const parts = computed(() => splitNumber(props.value))
</script>

<style scoped>
.num-cell { display: inline-flex; white-space: nowrap; font-variant-numeric: tabular-nums; }
.num-int { display: inline-block; text-align: right; flex-shrink: 0; }
</style>
