<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal query-view-modal">
      <div class="modal-header">
        <h3>SQL Query — {{ title }}</h3>
        <button class="modal-close" @click="emit('close')">×</button>
      </div>
      <div class="tab-pane">
        <p class="tab-hint">SQL query used to generate this panel (with current filter state applied).</p>
        <pre class="query-display"><code>{{ sql }}</code></pre>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" @click="copy">{{ copied ? '✓ Copied' : 'Copy SQL' }}</button>
        <button class="btn-primary" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  sql:   { type: String, required: true },
})
const emit = defineEmits(['close'])
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.sql)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>
