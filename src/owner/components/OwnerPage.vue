<script setup lang="ts">
import { haptic } from '../services/native'
import { ownerState } from '../state'
import DesignIcon from '@/components/design/DesignIcon.vue'

/* Owner-app screen frame: safe-area header with an optional back button,
   an offline banner, and a scroll area with pull-to-refresh. */
const props = defineProps<{
  title: string
  back?: boolean
  refreshing?: boolean
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()

const scroller = ref<HTMLElement | null>(null)
const pull = ref(0)
let startY: number | null = null
const THRESHOLD = 72

function onTouchStart(event: TouchEvent) {
  startY = (scroller.value?.scrollTop ?? 0) <= 0 ? event.touches[0].clientY : null
}

function onTouchMove(event: TouchEvent) {
  if (startY === null || props.refreshing)
    return
  const distance = event.touches[0].clientY - startY

  pull.value = distance > 0 ? Math.min(distance * 0.5, THRESHOLD + 24) : 0
}

function onTouchEnd() {
  if (pull.value >= THRESHOLD) {
    haptic('light')
    emit('refresh')
  }
  pull.value = 0
  startY = null
}

function goBack() {
  if (window.history.length > 1)
    router.back()
  else
    router.replace('/')
}
</script>

<template>
  <div class="owner-page">
    <header class="owner-page__header">
      <button
        v-if="back"
        type="button"
        class="owner-page__icon-btn"
        :aria-label="t('Back')"
        @click="goBack"
      >
        <DesignIcon
          name="chevleft"
          :size="22"
        />
      </button>
      <h1 class="owner-page__title">
        {{ title }}
      </h1>
      <div class="owner-page__actions">
        <slot name="actions" />
      </div>
    </header>

    <div
      v-if="!ownerState.online"
      class="owner-page__offline"
      role="status"
    >
      <DesignIcon
        name="alert"
        :size="15"
      />
      {{ t('owner_app_offline') }}
    </div>

    <main
      ref="scroller"
      class="owner-page__body"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div
        class="owner-page__pull"
        :class="{ 'is-active': pull > 0 || refreshing }"
        :style="{ height: `${refreshing ? 44 : pull}px` }"
        aria-hidden="true"
      >
        <DesignIcon
          name="refresh"
          :size="18"
          :class="[refreshing && 'owner-spin', pull >= 72 && 'owner-ready'].filter(Boolean).join(' ')"
        />
      </div>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.owner-page { display: flex; flex-direction: column; min-height: 100%; }
.owner-page__header {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 6px;
  min-height: 56px;
  padding: calc(env(safe-area-inset-top, 0px) + 6px) 16px 6px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: saturate(1.4) blur(12px);
  border-bottom: 1px solid var(--border);
}
.owner-page__title { flex: 1; min-width: 0; margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.owner-page__actions { display: flex; gap: 4px; }
.owner-page__icon-btn, .owner-page__actions :deep(button.owner-icon) {
  display: inline-grid; place-items: center; width: 44px; height: 44px; margin-left: -10px;
  border: 0; border-radius: 12px; background: transparent; color: var(--text); cursor: pointer;
}
.owner-page__actions :deep(button.owner-icon) { margin-left: 0; margin-right: -10px; }
.owner-page__icon-btn:active { background: var(--surface-2); }
.owner-page__offline {
  display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  background: var(--warning-weak); color: var(--warning-strong); font-size: 13px; font-weight: 600;
}
.owner-page__body { flex: 1; padding: 12px 16px calc(var(--owner-tabbar-h, 0px) + env(safe-area-inset-bottom, 0px) + 20px); }
.owner-page__pull { display: grid; place-items: center; height: 0; overflow: hidden; color: var(--text-secondary); transition: height 0.18s ease; }
.owner-page__pull:not(.is-active) { transition: height 0.25s ease; }
.owner-ready { color: var(--primary); }
.owner-spin { animation: owner-spin 0.9s linear infinite; }
@keyframes owner-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .owner-spin { animation: none; } }
</style>
