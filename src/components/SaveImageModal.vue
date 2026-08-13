<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal save-dialog">
      <div class="modal-header">
        <h3>Save as Image</h3>
        <button class="modal-close" @click="emit('close')">×</button>
      </div>
      <div class="tab-pane save-image-body">
        <div class="size-presets">
          <button
            v-for="p in presets"
            :key="p.label"
            class="preset-btn"
            :class="{ active: selected === p.label }"
            @click="applyPreset(p)"
          >{{ p.label }}</button>
        </div>
        <div class="size-row">
          <label class="size-label">
            <span>Width</span>
            <input type="number" v-model.number="width" min="100" max="4000" @input="selected = 'Custom'" />
          </label>
          <span class="size-sep">×</span>
          <label class="size-label">
            <span>Height</span>
            <input type="number" v-model.number="height" min="100" max="4000" @input="selected = 'Custom'" />
          </label>
        </div>
        <p class="size-hint">{{ width }} × {{ height }} px</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" @click="emit('close')">Cancel</button>
        <button class="btn-primary" @click="emit('download', { width, height })">Download PNG</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'download'])

const presets = [
  { label: 'Small',   w: 800,  h: 500  },
  { label: 'HD',      w: 1280, h: 720  },
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: 'Custom',  w: null, h: null },
]

const width    = ref(1280)
const height   = ref(720)
const selected = ref('HD')

function applyPreset(p) {
  selected.value = p.label
  if (p.w !== null) {
    width.value  = p.w
    height.value = p.h
  }
}
</script>
