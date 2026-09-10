<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import MarkdownMessage from '@/components/design/MarkdownMessage.vue'
import { replyBoundary } from '@/utils/replyReveal'

// Presentation only: the store retains the complete server response throughout.
const props = defineProps<{ content: string; animate?: boolean }>()
const emit = defineEmits<{ (event: 'start' | 'finish' | 'progress'): void }>()
const reducedMotion = usePreferredReducedMotion()
const displayed = ref('')
const running = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function finish() {
  clearTimeout(timer)

  const wasRunning = running.value

  displayed.value = props.content
  running.value = false
  if (wasRunning) {
    emit('progress')
    emit('finish')
  }
}
function reveal() {
  clearTimeout(timer)
  if (!props.animate || reducedMotion.value === 'reduce' || document.hidden || props.content.length > 60000) {
    const skipped = props.animate && !running.value

    finish()
    if (skipped)
      emit('finish')
    return
  }
  displayed.value = ''
  running.value = true
  emit('start')

  const started = performance.now()
  const duration = Math.max(650, Math.min(6000, props.content.length / 240 * 1000))
  function advance() {
    const progress = Math.min(1, (performance.now() - started) / duration)
    const end = progress >= 1 ? props.content.length : replyBoundary(props.content, Math.max(18, progress * props.content.length))
    if (end > displayed.value.length) {
      displayed.value = props.content.slice(0, end)
      emit('progress')
    }
    if (progress >= 1)
      finish()
    else timer = setTimeout(advance, 40)
  }
  advance()
}
function onVisibility() {
  if (document.hidden)
    finish()
}
watch(() => [props.content, props.animate, reducedMotion.value], reveal, { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div
    class="progressive-reply"
    :aria-busy="running"
  >
    <MarkdownMessage
      :content="displayed"
      :streaming="running"
    />
    <span
      v-if="running"
      class="progressive-reply__cursor"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.progressive-reply { min-width: 0; }
.progressive-reply__cursor { display: inline-block; width: 6px; height: 17px; margin: 2px 0; border-radius: 2px; background: var(--primary); vertical-align: text-bottom; }
@media (prefers-reduced-motion: no-preference) { .progressive-reply__cursor { animation: reply-cursor 900ms ease-in-out infinite; } }
@keyframes reply-cursor { 50% { opacity: .3; } }
</style>
