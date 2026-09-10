<script setup lang="ts">
import { cx } from './utils'

interface Props {
  className?: string
}

const props = defineProps<Props>()

const klass = computed(() => cx('card', props.className))
</script>

<template>
  <div :class="klass">
    <slot />
  </div>
</template>
