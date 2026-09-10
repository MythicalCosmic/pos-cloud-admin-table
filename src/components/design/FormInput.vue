<script setup lang="ts">
import Field from './Field.vue'
import Input from './Input.vue'
import Textarea from './Textarea.vue'
import DesignIcon from './DesignIcon.vue'

withDefaults(defineProps<{
  modelValue?: string | number | null
  label?: string
  hint?: string
  type?: string
  multiline?: boolean
  rows?: string | number
  disabled?: boolean
  readonly?: boolean
  clearable?: boolean
  loading?: boolean
  error?: boolean
  errorMessages?: string | string[]
  rules?: any[]
  prefix?: string
  suffix?: string
  prependInnerIcon?: string
  density?: string
  hideDetails?: boolean | string
  variant?: string
  persistentHint?: boolean
  autoGrow?: boolean
}>(), { modelValue: '', type: 'text', rows: 4 })

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const { t } = useI18n({ useScope: 'global' })
const control = ref<{ focus?: () => void } | null>(null)
function focus() { control.value?.focus?.() }
defineExpose({ focus })
</script>

<template>
  <VInput
    :model-value="modelValue"
    :rules="rules"
    :error="error"
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
        <div class="form-input__control">
          <span
            v-if="prefix"
            class="form-input__prefix"
          >{{ prefix }}</span>
          <Textarea
            v-if="multiline"
            v-bind="$attrs"
            :class="undefined"
            :style="undefined"
            :model-value="modelValue == null ? '' : String(modelValue)"
            :rows="Number(rows)"
            :disabled="disabled"
            :readonly="readonly"
            :error="isValid.value === false"
            :aria-describedby="messagesId.value"
            @update:model-value="emit('update:modelValue', $event)"
          />
          <Input
            v-else
            ref="control"
            v-bind="$attrs"
            :class="undefined"
            :style="undefined"
            :type="type"
            :model-value="modelValue"
            :disabled="disabled"
            :readonly="readonly"
            :icon="prependInnerIcon"
            :error="isValid.value === false"
            :aria-describedby="messagesId.value"
            @update:model-value="emit('update:modelValue', $event)"
          />
          <span
            v-if="suffix"
            class="form-input__suffix"
          >{{ suffix }}</span>
          <button
            v-if="clearable && modelValue && !disabled && !readonly"
            type="button"
            class="form-input__clear"
            :aria-label="t('Clear')"
            @click="emit('update:modelValue', ''); focus()"
          >
            <DesignIcon
              name="close"
              :size="16"
            />
          </button>
          <span
            v-if="loading"
            class="button-spinner"
            role="status"
            :aria-label="t('Loading...')"
          />
        </div>
      </Field>
    </template>
  </VInput>
</template>
