<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import Checkbox from './Checkbox.vue'
import Input from './Input.vue'
import { fieldContextKey } from './fieldContext'

interface Option { value: string | number; label: string; disabled?: boolean }
const props = withDefaults(defineProps<{ modelValue?: Array<string | number>; options?: Option[]; placeholder?: string; disabled?: boolean; creatable?: boolean }>(), { modelValue: () => [], options: () => [] })
const emit = defineEmits<{ (e: 'update:modelValue', values: Array<string | number>): void }>()
const { t } = useI18n({ useScope: 'global' })
const field = inject(fieldContextKey, null)
const trigger = ref<HTMLButtonElement | null>(null)
const popup = ref<HTMLDialogElement | null>(null)
const query = ref('')
const style = ref<Record<string, string>>({})
const isOpen = ref(false)

const choices = computed<Option[]>(() => [
  ...props.options,
  ...props.modelValue.filter(value => !props.options.some(option => option.value === value)).map(value => ({ value, label: String(value) })),
])

const filtered = computed(() => choices.value.filter(option => option.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const canCreate = computed(() => props.creatable && query.value.trim() && !props.options.some(o => o.label.toLocaleLowerCase() === query.value.trim().toLocaleLowerCase()) && !props.modelValue.includes(query.value.trim()))
const selectedLabel = (value: string | number) => props.options.find(option => option.value === value)?.label || String(value)
function toggle(value: string | number) { emit('update:modelValue', props.modelValue.includes(value) ? props.modelValue.filter(v => v !== value) : [...props.modelValue, value]) }
function create() { if (canCreate.value) { toggle(query.value.trim()); query.value = '' } }
async function show() {
  if (props.disabled)
    return
  query.value = ''
  isOpen.value = true
  popup.value?.showModal()
  await nextTick()
  measure()
  popup.value?.querySelector('input')?.focus()
}
function measure() {
  if (!trigger.value || !popup.value || !isOpen.value)
    return
  const anchor = trigger.value.getBoundingClientRect()

  style.value = { left: `${Math.max(8, Math.min(anchor.left, innerWidth - Math.max(300, anchor.width) - 8))}px`, top: `${Math.max(8, Math.min(anchor.bottom + 8, innerHeight - popup.value.offsetHeight - 8))}px`, width: `${Math.min(Math.max(300, anchor.width), innerWidth - 16)}px` }
}
function close() { popup.value?.close(); isOpen.value = false; trigger.value?.focus() }
function backdrop(e: MouseEvent) {
  if (!popup.value || e.target !== popup.value)
    return
  const box = popup.value.getBoundingClientRect()
  if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)
    close()
}
onMounted(() => window.addEventListener('resize', measure))
onBeforeUnmount(() => { window.removeEventListener('resize', measure); popup.value?.close() })
</script>

<template>
  <div class="multi-select">
    <button
      ref="trigger"
      type="button"
      class="control multi-select__trigger"
      :disabled="disabled"
      :aria-labelledby="field?.labelId"
      :aria-label="field?.labelId ? undefined : placeholder || t('Select')"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      @click="show"
    >
      <span
        v-if="!modelValue.length"
        class="is-placeholder"
      >{{ placeholder || t('Select') }}</span><span
        v-else
        class="multi-select__values"
      ><span
        v-for="value in modelValue"
        :key="value"
      >{{ selectedLabel(value) }}</span></span><DesignIcon
        name="chevdown"
        :size="16"
      />
    </button>
    <Teleport to="body">
      <dialog
        ref="popup"
        class="multi-select__popover"
        :style="style"
        :aria-label="field?.label.value || placeholder || t('Select')"
        @cancel.prevent.stop="close"
        @click="backdrop"
        @keydown.stop
      >
        <template v-if="isOpen">
          <header>
            <Input
              v-model="query"
              icon="search"
              :aria-label="t('Search')"
              :placeholder="t('Search')"
              @keydown.enter.prevent="create"
            /><button
              type="button"
              class="iconbtn"
              :aria-label="t('Close')"
              @click="close"
            >
              <DesignIcon
                name="close"
                :size="18"
              />
            </button>
          </header>
          <div class="multi-select__options">
            <label
              v-for="option in filtered"
              :key="option.value"
              :class="{ 'is-selected': modelValue.includes(option.value) }"
            ><Checkbox
              :model-value="modelValue.includes(option.value)"
              :disabled="option.disabled"
              :aria-label="option.label"
              @update:model-value="toggle(option.value)"
            /><span>{{ option.label }}</span></label>
            <p
              v-if="!filtered.length && !canCreate"
              class="secondary"
            >
              {{ t('No results') }}
            </p>
            <button
              v-if="canCreate"
              type="button"
              class="btn btn--ghost"
              @click="create"
            >
              <DesignIcon
                name="plus"
                :size="16"
              />{{ query.trim() }}
            </button>
          </div>
          <footer>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!modelValue.length"
              @click="emit('update:modelValue', [])"
            >
              {{ t('Clear') }}
            </button><button
              type="button"
              class="btn btn--primary btn--sm"
              @click="close"
            >
              <DesignIcon
                name="check"
                :size="16"
              />{{ t('Done') }}
            </button>
          </footer>
        </template>
      </dialog>
    </Teleport>
  </div>
</template>
