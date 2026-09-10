<script setup lang="ts">
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'

interface Props {
  label?: string
  error?: string
  hint?: string
}

const props = defineProps<Props>()

const id = designId('field')
const labelId = `${id}-label`
const descriptionId = `${id}-description`
const fieldRoot = ref<HTMLLabelElement | null>(null)

function focusControl() {
  fieldRoot.value
    ?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"][tabindex="0"]')
    ?.focus()
}

provide(fieldContextKey, {
  labelId,
  label: computed(() => props.label),
  descriptionId: computed(() => (props.error || props.hint) ? descriptionId : undefined),
  invalid: computed(() => !!props.error),
})
</script>

<template>
  <label
    ref="fieldRoot"
    class="field"
  >
    <span
      v-if="label"
      :id="labelId"
      class="field__label"
      @click="focusControl"
    >{{ label }}</span>
    <slot />
    <span
      v-if="error"
      :id="descriptionId"
      class="field__error"
      role="alert"
    >{{ error }}</span>
    <span
      v-else-if="hint"
      :id="descriptionId"
      class="field__hint"
    >{{ hint }}</span>
  </label>
</template>
