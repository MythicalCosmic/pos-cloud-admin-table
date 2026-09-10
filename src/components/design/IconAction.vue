<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { cx } from './utils'

type Tone = 'warning' | 'danger' | 'success' | 'primary'

interface Props {
  icon: string
  tone?: Tone
  title?: string
  disabled?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
}>()

defineOptions({ inheritAttrs: false })

const klass = computed(() => cx('iconaction', props.tone && `is-${props.tone}`))

function onClick(ev: MouseEvent) {
  if (props.disabled)
    return
  emit('click', ev)
}
</script>

<template>
  <button
    type="button"
    :class="klass"
    :title="title"
    :disabled="disabled"
    v-bind="$attrs"
    @click="onClick"
  >
    <DesignIcon
      :name="icon"
      :size="17"
    />
  </button>
</template>
