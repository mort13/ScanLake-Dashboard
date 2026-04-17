<template>
  <div class="panel">
    <div class="panel-header">
      <span class="panel-drag-handle gs-drag-handle">⠿</span>
      <h4 class="panel-title">{{ panel.title }}</h4>
      <div class="panel-actions">
        <button
          v-if="panel.custom"
          class="panel-btn"
          title="Remove panel"
          @click="emit('remove')"
        >×</button>
      </div>
    </div>
    <div class="panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  panel: { type: Object, required: true },
})
const emit = defineEmits(['remove'])
</script>
