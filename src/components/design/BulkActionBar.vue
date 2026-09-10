<script setup lang="ts">
/* ============================================================
   ALPHA POS — BulkActionBar
   Floating bottom-center bar that pops up when rows are selected.
   Renders "N selected" + action buttons + clear, slot-driven for
   custom buttons. Transitions in/out smoothly.
   ============================================================ */
import DesignIcon from './DesignIcon.vue'

interface Props {
  count: number
  /** Optional label override; defaults to "{n} selected". */
  label?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'clear'): void
}>()

const { t } = useI18n({ useScope: 'global' })

const shown = computed(() => props.count > 0)
const display = computed(() =>
  props.label || t('{n} selected', { n: props.count }),
)
</script>

<template>
  <Transition name="bulk">
    <div
      v-if="shown"
      class="bulkbar"
      role="region"
      :aria-label="t('Bulk actions')"
    >
      <div class="bulkbar__count">
        <span class="bulkbar__badge">{{ props.count }}</span>
        <span class="bulkbar__label">{{ display }}</span>
      </div>
      <div class="bulkbar__actions">
        <slot />
      </div>
      <button
        class="bulkbar__close"
        :title="t('Clear selection')"
        :aria-label="t('Clear selection')"
        @click="emit('clear')"
      >
        <DesignIcon name="close" :size="16" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.bulkbar {
  position: fixed;
  z-index: 90;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px 8px 14px;
  background: var(--text);
  color: var(--surface);
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  max-width: 92vw;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.bulkbar__count {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.bulkbar__badge {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  padding: 0 6px;
}
.bulkbar__label {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.92;
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bulkbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bulkbar__actions :deep(button) {
  background: rgba(255, 255, 255, 0.12);
  border: 0;
  color: var(--surface);
  padding: 6px 12px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background 0.12s ease;
}
.bulkbar__actions :deep(button:hover) {
  background: rgba(255, 255, 255, 0.22);
}
.bulkbar__actions :deep(button.is-danger) {
  background: rgba(244, 67, 54, 0.85);
}
.bulkbar__actions :deep(button.is-danger:hover) {
  background: rgba(244, 67, 54, 1);
}
.bulkbar__close {
  background: transparent;
  border: 0;
  color: inherit;
  opacity: 0.7;
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.bulkbar__close:hover {
  color: inherit;
  opacity: 1;
  background: rgba(255, 255, 255, 0.12);
}
[data-theme="dark"] .bulkbar {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
}
[data-theme="dark"] .bulkbar__badge {
  background: var(--surface-2);
}
[data-theme="dark"] .bulkbar__actions :deep(button) {
  background: var(--surface-2);
  color: var(--text);
}
[data-theme="dark"] .bulkbar__actions :deep(button:hover) {
  background: var(--surface-inset);
}
@media (max-width: 768px) {
  .bulkbar {
    bottom: calc(var(--tabbar-h, 62px) + env(safe-area-inset-bottom, 0px) + 12px);
    max-width: calc(100vw - 24px);
  }
  .bulkbar__label { max-width: 14ch; }
}
.bulk-enter-active,
.bulk-leave-active {
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1), opacity 0.2s ease;
}
.bulk-enter-from,
.bulk-leave-to {
  transform: translate(-50%, 24px);
  opacity: 0;
}
</style>
