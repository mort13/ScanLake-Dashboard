<template>
  <div class="tag-input-wrap">
    <!-- Existing tags -->
    <div class="tags" v-if="allTags.length > 0">
      <span
        v-for="(tag, i) in allTags"
        :key="i"
        class="tag"
        :class="{ negated: tag.negated }"
      >
        <span v-if="tag.negated" class="tag-neg-icon">✕</span>
        {{ tag.value }}
        <button class="tag-remove" @click="removeTag(i)">×</button>
      </span>
    </div>

    <!-- Text input -->
    <div class="tag-input-field-wrap">
      <input
        ref="inputEl"
        v-model="inputText"
        class="tag-input-field"
        :placeholder="allTags.length === 0 ? placeholder : ''"
        @keydown.enter.prevent="commitInput"
        @keydown.backspace="onBackspace"
        @input="onInput"
        @focus="showDropdown = suggestions.length > 0"
        @blur="hideDropdown"
        autocomplete="off"
      />
      <!-- Autocomplete dropdown -->
      <ul
        v-if="showDropdown && filtered.length > 0"
        class="autocomplete-dropdown"
      >
        <li
          v-for="s in filtered"
          :key="s"
          @mousedown.prevent="selectSuggestion(s)"
          class="autocomplete-item"
        >
          {{ s }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  suggestions: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Add filter…' },
  allowNegation: { type: Boolean, default: false },
  // When true, modelValue items are { value, negated } objects; otherwise strings
  asObjects: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const inputText = ref('')
const showDropdown = ref(false)
const inputEl = ref(null)

// Normalise internal representation to always use objects
const allTags = computed(() =>
  props.modelValue.map((t) =>
    props.asObjects ? t : { value: t, negated: false },
  ),
)

const filtered = computed(() => {
  const q = inputText.value.replace(/^!/, '').toLowerCase()
  const existing = new Set(allTags.value.map((t) => t.value.toLowerCase()))
  return props.suggestions
    .filter((s) => !existing.has(s.toLowerCase()) && (q === '' || s.toLowerCase().includes(q)))
    .slice(0, 20)
})

function commitInput() {
  const raw = inputText.value.trim()
  if (!raw) return
  const negated = props.allowNegation && raw.startsWith('!')
  const value = negated ? raw.slice(1).trim() : raw
  if (!value) return
  addTag(value, negated)
  inputText.value = ''
  showDropdown.value = false
}

function addTag(value, negated = false) {
  const exists = allTags.value.some((t) => t.value === value && t.negated === negated)
  if (exists) return
  const newTag = props.asObjects ? { value, negated } : value
  emit('update:modelValue', [...props.modelValue, newTag])
}

function removeTag(i) {
  const updated = [...props.modelValue]
  updated.splice(i, 1)
  emit('update:modelValue', updated)
}

function onBackspace() {
  if (inputText.value === '' && props.modelValue.length > 0) {
    removeTag(props.modelValue.length - 1)
  }
}

function selectSuggestion(s) {
  const negated = props.allowNegation && inputText.value.startsWith('!')
  addTag(s, negated)
  inputText.value = ''
  showDropdown.value = false
  inputEl.value?.focus()
}

function onInput() {
  showDropdown.value = true
}

function hideDropdown() {
  // small delay so mousedown on item fires first
  setTimeout(() => { showDropdown.value = false }, 150)
}
</script>
