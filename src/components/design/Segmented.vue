<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { cx } from './utils'

interface SegOption {
  value: string
  label: string
  icon?: string
  id?: string
  ariaControls?: string
}
type SegOptionLike = string | SegOption

interface Props {
  modelValue?: string | number | null
  options: SegOptionLike[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

const normalized = computed<SegOption[]>(() =>
  props.options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o,
  ),
)

const tabList = ref<HTMLElement | null>(null)

const selectedIndex = computed(() => normalized.value.findIndex(option =>
  String(option.value) === String(props.modelValue),
))

function isSelected(value: string): boolean {
  return String(value) === String(props.modelValue)
}

function tabIndexFor(index: number): 0 | -1 {
  return index === (selectedIndex.value >= 0 ? selectedIndex.value : 0) ? 0 : -1
}

function select(v: string) {
  emit('update:modelValue', v)
  emit('change', v)
}

function focusTab(index: number) {
  nextTick(() => {
    const tab = tabList.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]

    tab?.focus()
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

function onKeydown(event: KeyboardEvent, index: number) {
  const count = normalized.value.length
  if (!count)
    return

  let nextIndex: number | null = null
  if (event.key === 'ArrowRight')
    nextIndex = (index + 1) % count
  else if (event.key === 'ArrowLeft')
    nextIndex = (index - 1 + count) % count
  else if (event.key === 'Home')
    nextIndex = 0
  else if (event.key === 'End')
    nextIndex = count - 1

  if (nextIndex === null)
    return
  event.preventDefault()
  select(normalized.value[nextIndex].value)
  focusTab(nextIndex)
}
</script>

<template>
  <div
    ref="tabList"
    class="seg"
    role="tablist"
    aria-orientation="horizontal"
  >
    <button
      v-for="(o, index) in normalized"
      :id="o.id"
      :key="o.value"
      type="button"
      :class="cx('seg__btn', isSelected(o.value) && 'is-active')"
      role="tab"
      :aria-selected="isSelected(o.value)"
      :aria-controls="o.ariaControls"
      :tabindex="tabIndexFor(index)"
      @click="select(o.value)"
      @keydown="onKeydown($event, index)"
    >
      <DesignIcon
        v-if="o.icon"
        :name="o.icon"
        :size="15"
      />
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
}

.seg__btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.seg__btn:focus-visible {
  position: relative;
  z-index: 1;
  outline: none;
  box-shadow: var(--shadow-focus);
}
</style>
