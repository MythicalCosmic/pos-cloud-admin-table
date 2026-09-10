<script setup lang="ts">
import Field from './Field.vue'
import SearchSelect from './SearchSelect.vue'
import MultiSelect from './MultiSelect.vue'

const props = withDefaults(defineProps<{
  modelValue?: any
  items?: any[]
  itemTitle?: string
  itemValue?: string
  label?: string
  placeholder?: string
  hint?: string
  disabled?: boolean
  readonly?: boolean
  multiple?: boolean
  creatable?: boolean
  clearable?: boolean
  loading?: boolean
  errorMessages?: string | string[]
  rules?: any[]
  density?: string
  hideDetails?: boolean | string
  variant?: string
  chips?: boolean
  closableChips?: boolean
  persistentHint?: boolean
  returnObject?: boolean
}>(), { items: () => [], itemTitle: 'title', itemValue: 'value' })

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const options = computed(() => props.items.map(item => typeof item === 'object' ? { value: item[props.itemValue], label: String(item[props.itemTitle] ?? item[props.itemValue]), disabled: item.props?.disabled } : { value: item, label: String(item) }))
const selected = computed(() => props.returnObject ? props.modelValue?.[props.itemValue] : props.modelValue)
function update(value: any) {
  if (Array.isArray(value)) { emit('update:modelValue', value); return }
  const option = options.value.find(o => String(o.value) === String(value))

  emit('update:modelValue', props.returnObject ? props.items.find(item => item[props.itemValue] === option?.value) ?? null : option?.value ?? null)
}
</script>

<template>
  <VInput
    :model-value="modelValue"
    :rules="rules"
    :error-messages="errorMessages"
    :disabled="disabled"
    hide-details="auto"
    class="form-input"
    :class="attrs.class"
    :style="attrs.style as any"
  >
    <template #default="{ isValid, messagesId }">
      <Field
        :label="label"
        :hint="hint"
      >
        <MultiSelect
          v-if="multiple || creatable"
          v-bind="$attrs"
          :class="undefined"
          :style="undefined"
          :model-value="modelValue || []"
          :options="options"
          :placeholder="placeholder || label"
          :disabled="disabled || readonly"
          :creatable="creatable"
          @update:model-value="update"
        />
        <SearchSelect
          v-else
          v-bind="$attrs"
          :class="undefined"
          :style="undefined"
          :model-value="selected"
          :options="options.map(o => ({ ...o, value: String(o.value) }))"
          :placeholder="placeholder || label"
          :disabled="disabled || readonly"
          :error="isValid.value === false"
          :aria-describedby="messagesId.value"
          :clearable="clearable ?? false"
          @update:model-value="update"
        />
      </Field>
    </template>
  </VInput>
</template>
