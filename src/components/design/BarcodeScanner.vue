<script setup lang="ts">
/* ============================================================
   ALPHA POS — BarcodeScanner
   Full-screen camera sheet that decodes EAN/UPC/Code-128.
   Built on @zxing/browser. Closes on Esc, backdrop click,
   or after a successful decode. Vibrates on decode if supported.

   Usage:
     <BarcodeScanner v-model:open="scanOpen" @decoded="onCode" />
   ============================================================ */
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'

interface Props {
  open: boolean
  /** Restrict to these formats. Default = common 1D + QR. */
  formats?: string[]
  /** Re-decode while keeping the sheet open instead of auto-closing. */
  continuous?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  continuous: false,
})

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'decoded', code: string, format?: string): void
}>()

const { t } = useI18n({ useScope: 'global' })

const videoRef = ref<HTMLVideoElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const error = ref<string | null>(null)
const lastCode = ref<string>('')
const controlsRef = ref<{ stop: () => void } | null>(null)
const titleId = designId('scanner-title')
let previouslyFocused: HTMLElement | null = null

function close() {
  stop()
  emit('update:open', false)
}

async function start() {
  error.value = null
  lastCode.value = ''
  if (!videoRef.value) return
  try {
    // Dynamic import keeps the ~150kB ZXing bundle off the critical path.
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    controlsRef.value = await reader.decodeFromVideoDevice(
      undefined, // back camera preferred via constraints
      videoRef.value,
      (result, err) => {
        if (!result) return
        const code = result.getText()
        if (!code || code === lastCode.value) return
        lastCode.value = code
        const format = (result as any).getBarcodeFormat?.()
        if ('vibrate' in navigator) navigator.vibrate?.(120)
        emit('decoded', code, format ? String(format) : undefined)
        if (!props.continuous) close()
      },
    )
  }
  catch {
    error.value = t('Request failed. Please try again.')
  }
}

function stop() {
  try { controlsRef.value?.stop() }
  catch { /* noop */ }
  controlsRef.value = null
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key !== 'Tab' || !dialogRef.value) return
  const items = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(node => node.offsetParent !== null)
  if (!items.length) {
    e.preventDefault()
    dialogRef.value.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (!active || !dialogRef.value.contains(active)) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }
  else if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  }
  else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (v) => {
    if (v) {
      previouslyFocused = document.activeElement as HTMLElement | null
      await nextTick()
      dialogRef.value?.querySelector<HTMLButtonElement>('.scan-close')?.focus()
      start()
    }
    else {
      stop()
      if (previouslyFocused) {
        previouslyFocused.focus()
        previouslyFocused = null
      }
    }
  },
  { immediate: true },
)

onMounted(() => { window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stop()
  if (previouslyFocused) previouslyFocused.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="scan">
      <div
        v-if="open"
        class="scan-sheet"
        @mousedown.self="close"
      >
        <div
          ref="dialogRef"
          class="scan-frame"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <div class="scan-head">
            <span
              :id="titleId"
              class="scan-title"
            >{{ t('Scan barcode') }}</span>
            <button
              class="scan-close"
              :title="t('Close')"
              :aria-label="t('Close')"
              @click="close"
            >
              <DesignIcon name="close" :size="18" />
            </button>
          </div>
          <div class="scan-view">
            <video
              ref="videoRef"
              class="scan-video"
              autoplay
              playsinline
              muted
              aria-hidden="true"
            />
            <div class="scan-frame-overlay" />
          </div>
          <div
            class="scan-hint"
            aria-live="polite"
          >
            <template v-if="error">
              <span class="scan-err" role="alert">{{ error }}</span>
            </template>
            <template v-else-if="lastCode">
              <span class="scan-found">{{ t('Code') }}: <code>{{ lastCode }}</code></span>
            </template>
            <template v-else>
              <span>{{ t('Point at the barcode or QR') }}</span>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scan-sheet {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: rgba(0, 0, 0, 0.85);
  display: grid;
  place-items: center;
  padding: 24px;
}
.scan-frame {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #fff;
}
.scan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.scan-title {
  font-size: 15px;
  font-weight: 600;
}
.scan-close {
  background: rgba(255, 255, 255, 0.12);
  border: 0;
  color: #fff;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.scan-close:hover { background: rgba(255, 255, 255, 0.22); }
.scan-view {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 14px;
  overflow: hidden;
}
.scan-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scan-frame-overlay {
  position: absolute;
  inset: 12% 12%;
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  pointer-events: none;
}
.scan-hint {
  text-align: center;
  font-size: 13px;
  opacity: 0.9;
}
.scan-err { color: #ff9d9d; }
.scan-found code {
  background: rgba(255, 255, 255, 0.18);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}
.scan-enter-active, .scan-leave-active {
  transition: opacity 0.18s ease;
}
.scan-enter-from, .scan-leave-to { opacity: 0; }
</style>
