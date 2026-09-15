<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import DesignIcon from './DesignIcon.vue'
import { fieldContextKey } from './fieldContext'
import { designId } from './ids'
import { cx } from './utils'
import { workspaceContext } from './workspace/context'

interface Option {
  value: string
  label: string
  keywords?: string
  disabled?: boolean

  /** Visual nesting level for grouped option lists. */
  depth?: number

  /** Secondary line shown under the label. */
  description?: string

  /** Muted trailing value, such as a record count. */
  meta?: string

  /** Renders the option as a group heading. Combine with `disabled` for non-selectable groups. */
  group?: boolean

  /** Trigger text while this option is selected. Defaults to `label`. */
  selectedLabel?: string
}

interface Props {
  modelValue?: string | number | null
  options: Option[]
  placeholder?: string
  searchPlaceholder?: string
  icon?: string
  disabled?: boolean
  clearable?: boolean
  error?: boolean | string
}

const props = withDefaults(defineProps<Props>(), { modelValue: '', clearable: true })

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const field = inject(fieldContextKey, null)
const workspace = inject(workspaceContext, false)
const { t } = useI18n({ useScope: 'global' })
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const menuStyle = ref<Record<string, string>>({})
const id = designId('search-select')
const listboxId = `${id}-listbox`
const optionId = (index: number) => `${id}-option-${index}`

const describedBy = computed(() => {
  const ids = [attrs['aria-describedby'], field?.descriptionId.value]

  return ids.filter(Boolean).join(' ') || undefined
})

const selected = computed(() => props.options.find(option => String(option.value) === String(props.modelValue)))

const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle)
    return props.options

  return props.options.filter(option => `${option.label} ${option.keywords ?? ''}`.toLocaleLowerCase().includes(needle))
})

function firstEnabledIndex(): number {
  return Math.max(0, filtered.value.findIndex(option => !option.disabled))
}

function recalcMenu() {
  if (!root.value)
    return
  const rect = root.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(Math.max(rect.width, 260), viewportWidth - 16)
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
  const openUp = viewportHeight - rect.bottom < 320 && rect.top > viewportHeight - rect.bottom

  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${width}px`,
    [openUp ? 'bottom' : 'top']: openUp ? `${viewportHeight - rect.top + 4}px` : `${rect.bottom + 4}px`,
    zIndex: '1100',
  }
}

async function show() {
  if (props.disabled)
    return
  query.value = ''

  const selectedIndex = props.options.findIndex(option => String(option.value) === String(props.modelValue))

  activeIndex.value = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex()
  recalcMenu()
  open.value = true
  await nextTick()
  searchInput.value?.focus()
}

function hide(restoreFocus = false) {
  open.value = false
  if (restoreFocus)
    nextTick(() => root.value?.focus())
}

function choose(option: Option) {
  if (option.disabled)
    return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  hide(true)
}

function clear() {
  emit('update:modelValue', '')
  emit('change', '')
  hide(true)
}

function moveFocusFromTrigger(backwards: boolean) {
  const trigger = root.value
  if (!trigger)
    return
  const scope = trigger.closest<HTMLElement>('[role="dialog"]') ?? document.body

  const focusable = Array.from(scope.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(element => element.offsetParent !== null)

  const index = focusable.indexOf(trigger)
  const targetIndex = index + (backwards ? -1 : 1)

  const target = focusable[targetIndex]
    ?? (backwards ? focusable[focusable.length - 1] : focusable[0])

  target?.focus()
}

function scrollActiveIntoView() {
  menu.value
    ?.querySelector<HTMLElement>(`#${optionId(activeIndex.value)}`)
    ?.scrollIntoView({ block: 'nearest' })
}

function moveActive(delta: 1 | -1) {
  const options = filtered.value
  const length = options.length

  for (let step = 1; step <= length; step++) {
    const index = (activeIndex.value + delta * step + length * step) % length
    if (!options[index].disabled) {
      activeIndex.value = index
      break
    }
  }
}

function onTriggerKey(event: KeyboardEvent) {
  if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    show()
  }
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    hide(true)
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()

    const backwards = event.shiftKey

    hide(false)
    nextTick(() => moveFocusFromTrigger(backwards))
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!filtered.value.length)
      return
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
    nextTick(scrollActiveIntoView)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()

    const option = filtered.value[activeIndex.value]
    if (option)
      choose(option)
  }
}

watch(query, () => {
  activeIndex.value = firstEnabledIndex()
  nextTick(scrollActiveIntoView)
})
onClickOutside(root, () => hide(), { ignore: [menu] })

function onViewportChange() {
  if (open.value)
    recalcMenu()
}

onMounted(() => {
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div
    :id="id"
    ref="root"
    v-bind="$attrs"
    :class="cx('control', 'control--select', error && 'is-error', disabled && 'is-disabled', open && 'is-open')"
    :tabindex="disabled ? -1 : 0"
    role="combobox"
    :aria-expanded="open"
    aria-haspopup="listbox"
    :aria-controls="listboxId"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
    :aria-label="attrs['aria-label'] ? String(attrs['aria-label']) : field?.labelId ? undefined : placeholder"
    :aria-invalid="error || field?.invalid.value ? 'true' : undefined"
    :aria-describedby="describedBy"
    @click="show"
    @keydown="onTriggerKey"
  >
    <DesignIcon
      v-if="icon"
      :name="icon"
      :size="18"
    />
    <span
      class="search-select__label"
      :class="{ 'is-placeholder': !selected }"
    >
      {{ selected?.selectedLabel ?? selected?.label ?? placeholder ?? '' }}
    </span>
    <DesignIcon
      name="search"
      :size="16"
      class="search-select__chevron"
    />

    <Teleport to="body">
      <div
        v-if="open"
        ref="menu"
        class="search-select__menu"
        :class="{ 'workspace-popover': workspace }"
        :style="menuStyle"
        @click.stop
      >
        <div class="search-select__search">
          <DesignIcon
            name="search"
            :size="17"
          />
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            :placeholder="searchPlaceholder ?? t('Search')"
            :aria-controls="listboxId"
            :aria-activedescendant="filtered[activeIndex] ? optionId(activeIndex) : undefined"
            :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
            :aria-label="attrs['aria-label'] ? String(attrs['aria-label']) : field?.labelId ? undefined : searchPlaceholder ?? t('Search')"
            @keydown="onSearchKey"
          >
        </div>
        <button
          v-if="clearable && placeholder !== undefined && !query"
          type="button"
          class="search-select__option is-clear"
          :aria-selected="!selected"
          @click="clear"
        >
          {{ placeholder }}
        </button>
        <div
          :id="listboxId"
          class="search-select__options"
          role="listbox"
        >
          <button
            v-for="(option, index) in filtered"
            :id="optionId(index)"
            :key="option.value"
            :disabled="option.disabled"
            type="button"
            class="search-select__option"
            :class="{
              'is-active': String(option.value) === String(modelValue),
              'is-focused': index === activeIndex,
              'is-group': option.group,
              'is-nested': (option.depth ?? 0) > 0,
            }"
            :style="option.depth ? { paddingInlineStart: `${12 + option.depth * 22}px` } : undefined"
            role="option"
            :aria-selected="String(option.value) === String(modelValue)"
            @mouseenter="activeIndex = index"
            @click="choose(option)"
          >
            <span class="search-select__text">
              <span>{{ option.label }}</span>
              <small
                v-if="option.description"
                class="search-select__description"
              >{{ option.description }}</small>
            </span>
            <span
              v-if="option.meta"
              class="search-select__meta"
            >{{ option.meta }}</span>
            <DesignIcon
              v-if="String(option.value) === String(modelValue)"
              name="check"
              :size="16"
            />
          </button>
        </div>
        <div
          v-if="!filtered.length"
          class="search-select__empty"
          role="status"
        >
          {{ t('No results') }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.search-select__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-select__label.is-placeholder { color: rgb(var(--v-theme-text-tertiary)); }
.search-select__chevron { color: rgb(var(--v-theme-text-tertiary)); }
.control--select.is-open { border-color: rgb(var(--v-theme-primary)); box-shadow: var(--shadow-focus); }

.search-select__menu {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  max-height: min(360px, calc(100vh - 16px));
  padding: 6px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-lg);
}

.search-select__search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  padding: 8px 10px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-sm);
  color: rgb(var(--v-theme-text-secondary));
  background: rgb(var(--v-theme-surface));
}

.search-select__options {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.search-select__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
}

.search-select__option {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 38px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--r-sm);
  color: rgb(var(--v-theme-on-surface));
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.search-select__option.is-focused { background: rgb(var(--v-theme-surface-inset)); }
.search-select__option.is-active { color: rgb(var(--v-theme-primary)); font-weight: 600; }
.search-select__option.is-clear { color: rgb(var(--v-theme-text-secondary)); }
.search-select__option.is-group { margin-block-start: 2px; font-weight: 650; }
.search-select__option.is-group:disabled { color: rgb(var(--v-theme-text-secondary)); cursor: default; }
.search-select__option.is-nested::before { position: absolute; width: 1px; background: rgb(var(--v-theme-border)); content: ''; inset-block: 4px; inset-inline-start: 20px; }
.search-select__text { display: grid; flex: 1; min-width: 0; gap: 1px; overflow-wrap: anywhere; }
.search-select__description { color: rgb(var(--v-theme-text-tertiary)); font-size: 11px; font-weight: 500; line-height: 1.35; }
.search-select__meta { flex: 0 0 auto; color: rgb(var(--v-theme-text-tertiary)); font-family: var(--font-mono); font-size: 11px; font-variant-numeric: tabular-nums; font-weight: 500; }
.search-select__empty { padding: 20px 10px; text-align: center; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; }
</style>
