<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import DesignIcon from './DesignIcon.vue'
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'
import { cx } from './utils'

interface OptionObj {
  value: string
  label: string
}
type OptionLike = string | OptionObj

interface Props {
  modelValue?: string | number | null
  options: OptionLike[]
  placeholder?: string
  icon?: string
  disabled?: boolean
  error?: boolean | string
  size?: 'sm'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)
const { t } = useI18n({ useScope: 'global' })
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const menuStyle = ref<Record<string, string>>({})

const id = designId('select')
const listboxId = `${id}-listbox`
const optionId = (index: number) => `${id}-option-${index}`
const errorId = `${id}-error`

const klass = computed(() =>
  cx(
    'control control--select',
    props.size === 'sm' && 'control--sm',
    props.error && 'is-error',
    props.disabled && 'is-disabled',
    open.value && 'is-open',
  ),
)

const normalized = computed<OptionObj[]>(() =>
  props.options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o,
  ),
)

const currentLabel = computed(() => {
  const v = props.modelValue
  if (v === '' || v === null || v === undefined)
    return props.placeholder ?? ''
  const hit = normalized.value.find(o => String(o.value) === String(v))
  return hit ? hit.label : String(v)
})

const hasValue = computed(() =>
  props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined,
)

const keyboardOptions = computed(() => [
  ...(props.placeholder !== undefined
    ? [{ value: '', label: props.placeholder ?? '', isPlaceholder: true }]
    : []),
  ...normalized.value.map(o => ({ ...o, isPlaceholder: false })),
])

const selectedIndex = computed(() => {
  const idx = keyboardOptions.value.findIndex(o =>
    o.isPlaceholder ? !hasValue.value : String(o.value) === String(props.modelValue),
  )
  return idx >= 0 ? idx : 0
})

const describedBy = computed(() => {
  const ids = [attrs['aria-describedby'], field?.descriptionId.value]
  if (typeof props.error === 'string' && props.error && !field?.descriptionId.value)
    ids.push(errorId)
  return ids.filter(Boolean).join(' ') || undefined
})

const invalid = computed(() => !!props.error || !!field?.invalid.value)
const accessibleLabel = computed(() => {
  if (attrs['aria-label']) return String(attrs['aria-label'])
  if (field?.labelId) return undefined
  return props.placeholder || currentLabel.value || t('Select')
})

function recalcMenu() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const vw = window.innerWidth
  const below = vh - r.bottom
  const above = r.top
  const wantUp = below < 240 && above > below
  const width = Math.min(r.width, Math.max(120, vw - 16))
  const left = Math.max(8, Math.min(r.left, vw - width - 8))
  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${width}px`,
    [wantUp ? 'bottom' : 'top']: wantUp ? `${vh - r.top + 4}px` : `${r.bottom + 4}px`,
    zIndex: '1100',
  }
}

function toggle() {
  if (props.disabled) return
  if (!open.value) {
    recalcMenu()
    activeIndex.value = selectedIndex.value
    open.value = true
    nextTick(scrollActiveIntoView)
  }
  else {
    open.value = false
  }
}

function pick(v: string) {
  emit('update:modelValue', v)
  emit('change', v)
  open.value = false
}

function clearVal() {
  emit('update:modelValue', '')
  emit('change', '')
  open.value = false
}

function onKey(ev: KeyboardEvent) {
  if (props.disabled) return

  if (ev.key === 'Escape') {
    if (open.value) ev.preventDefault()
    open.value = false
    return
  }
  if (ev.key === 'Tab') {
    open.value = false
    return
  }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault()
    if (!open.value) {
      recalcMenu()
      open.value = true
      activeIndex.value = selectedIndex.value
    }
    const count = keyboardOptions.value.length
    if (count) {
      const delta = ev.key === 'ArrowDown' ? 1 : -1
      activeIndex.value = (activeIndex.value + delta + count) % count
      nextTick(scrollActiveIntoView)
    }
    return
  }
  if (ev.key === 'Home' || ev.key === 'End') {
    if (!open.value) return
    ev.preventDefault()
    activeIndex.value = ev.key === 'Home' ? 0 : keyboardOptions.value.length - 1
    nextTick(scrollActiveIntoView)
    return
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault()
    if (!open.value) {
      toggle()
      return
    }
    const option = keyboardOptions.value[activeIndex.value]
    if (!option) return
    if (option.isPlaceholder) clearVal()
    else pick(option.value)
  }
}

function scrollActiveIntoView() {
  menu.value
    ?.querySelector<HTMLElement>(`#${optionId(activeIndex.value)}`)
    ?.scrollIntoView({ block: 'nearest' })
}

function onScroll() {
  if (open.value) recalcMenu()
}

function onResize() {
  if (open.value) recalcMenu()
}

onClickOutside(root, () => { open.value = false }, { ignore: [menu] })

onMounted(() => {
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div
    ref="root"
    v-bind="$attrs"
    :class="klass"
    :tabindex="disabled ? -1 : 0"
    role="combobox"
    :aria-expanded="open"
    aria-haspopup="listbox"
    :aria-controls="listboxId"
    :aria-activedescendant="open && keyboardOptions.length && activeIndex >= 0 ? optionId(activeIndex) : undefined"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-label="accessibleLabel"
    :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
    :aria-describedby="describedBy"
    @click="toggle"
    @keydown="onKey"
  >
    <DesignIcon
      v-if="icon"
      :name="icon"
      :size="18"
      class="ic"
    />
    <span
      class="select__label"
      :style="{ color: hasValue ? 'var(--text)' : 'var(--text-tertiary)' }"
    >
      {{ currentLabel }}
    </span>
    <DesignIcon
      name="chevdown"
      :size="18"
      class="chev"
      :style="{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }"
    />
    <span
      v-if="typeof error === 'string' && error && !field?.descriptionId.value"
      :id="errorId"
      class="visually-hidden"
    >{{ error }}</span>

    <Teleport to="body">
      <div
        v-if="open"
        :id="listboxId"
        ref="menu"
        class="select__menu"
        role="listbox"
        :style="menuStyle"
        @click.stop
      >
        <div
          v-if="placeholder !== undefined"
          :id="optionId(0)"
          class="select__opt"
          :class="{ 'is-active': !hasValue, 'is-focused': activeIndex === 0 }"
          role="option"
          :aria-selected="!hasValue"
          @mouseenter="activeIndex = 0"
          @click="clearVal"
        >
          <span>{{ placeholder }}</span>
        </div>
        <div
          v-for="(o, oi) in normalized"
          :key="o.value"
          :id="optionId((placeholder !== undefined ? 1 : 0) + oi)"
          class="select__opt"
          :class="{
            'is-active': String(o.value) === String(modelValue),
            'is-focused': activeIndex === (placeholder !== undefined ? 1 : 0) + oi,
          }"
          role="option"
          :aria-selected="String(o.value) === String(modelValue)"
          @mouseenter="activeIndex = (placeholder !== undefined ? 1 : 0) + oi"
          @click="pick(o.value)"
        >
          <span>{{ o.label }}</span>
          <DesignIcon
            v-if="String(o.value) === String(modelValue)"
            name="check"
            :size="16"
            class="select__opt-check"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.select__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-body);
}
.control--select.is-open { border-color: var(--primary); box-shadow: var(--shadow-focus); }
.control--select:focus { outline: none; }
.control--select:focus-visible { box-shadow: var(--shadow-focus); }
</style>
