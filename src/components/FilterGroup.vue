<template>
  <div class="filter-group">
    <label class="filter-label">{{ label }}</label>
    <p v-if="hint" class="filter-hint">{{ hint }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  label: String,
  hint: String,
})
</script>
