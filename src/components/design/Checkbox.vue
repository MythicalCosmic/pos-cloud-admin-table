<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { cx } from './utils'

interface Props {
  modelValue?: boolean
  indeterminate?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  indeterminate: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()

const klass = computed(() =>
  cx(
    'checkbox',
    props.modelValue && 'is-checked',
    props.indeterminate && 'is-indeterminate',
    props.disabled && 'is-disabled',
  ),
)

function toggle(ev?: Event) {
  ev?.stopPropagation()
  if (props.disabled)
    return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}

// Make `<label>Checkbox + text</label>` work like a native input+label pair.
// The Checkbox root is a div (not a real <input>), so browsers don't associate
// it with a wrapping <label>. Wire the click ourselves so clicking anywhere in
// the label (e.g. the label text span) also toggles the checkbox.
const rootEl = ref<HTMLElement | null>(null)
let labelEl: HTMLLabelElement | null = null

function onLabelClick(e: MouseEvent) {
  const target = e.target as Node | null
  if (rootEl.value && target && rootEl.value.contains(target)) return
  toggle(e)
}

onMounted(() => {
  labelEl = rootEl.value?.closest('label') as HTMLLabelElement | null
  labelEl?.addEventListener('click', onLabelClick)
})
onBeforeUnmount(() => {
  labelEl?.removeEventListener('click', onLabelClick)
  labelEl = null
})
</script>

<template>
  <div
    ref="rootEl"
    :class="klass"
    role="checkbox"
    :aria-checked="indeterminate ? 'mixed' : modelValue"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @click="toggle"
    @keydown.space.prevent="toggle"
    @keydown.enter.prevent="toggle"
  >
    <span
      v-if="indeterminate"
      class="checkbox__bar"
    />
    <DesignIcon
      v-else-if="modelValue"
      name="check"
      :size="13"
      :weight="2.4"
    />
  </div>
</template>

<style scoped>
.checkbox__bar {
  display: block;
  width: 9px;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
}
</style>
