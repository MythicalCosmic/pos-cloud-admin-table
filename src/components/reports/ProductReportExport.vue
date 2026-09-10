<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import { designId } from '@/components/design/ids'
import { PRODUCT_REPORT_FORMATS, type ProductReportFormat } from '@/types/productPerformance'

const props = defineProps<{ disabled?: boolean; formatsDisabled?: boolean; busy: Set<ProductReportFormat>; formats?: ProductReportFormat[] }>()
const emit = defineEmits<{ (event: 'export', format: ProductReportFormat): void }>()
const { t } = useI18n({ useScope: 'global' })
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const opensAbove = ref(false)
const maxHeight = ref<string>()
const id = designId('report-export')
const labels = { xlsx: 'Excel', pdf: 'PDF', csv: 'CSV' }
const formats = computed(() => props.formats ?? [...PRODUCT_REPORT_FORMATS])

function fitPanel() {
  if (!open.value || !trigger.value)
    return
  const anchor = trigger.value.getBoundingClientRect()
  const viewport = window.visualViewport?.height ?? window.innerHeight
  const tabbar = document.querySelector('.mobile-tabbar')?.getBoundingClientRect()
  const bottom = tabbar?.width ? Math.min(viewport, tabbar.top) : viewport
  const below = bottom - anchor.bottom - 15
  const above = anchor.top - 15

  opensAbove.value = below < 240 && above > below
  maxHeight.value = `${Math.max(0, opensAbove.value ? above : below)}px`
}

function focusItem(target: HTMLElement | null) {
  target?.focus({ preventScroll: true })
  if (!target || !panel.value || target === panel.value)
    return
  const item = target.getBoundingClientRect()
  const menu = panel.value.getBoundingClientRect()

  if (item.top < menu.top)
    panel.value.scrollTop -= menu.top - item.top
  else if (item.bottom > menu.bottom)
    panel.value.scrollTop += item.bottom - menu.bottom
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    fitPanel()

    const target = panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? panel.value

    focusItem(target)
  }
}
function close(restore = false) {
  open.value = false
  if (restore)
    trigger.value?.focus({ preventScroll: true })
}
async function requestExport(format: ProductReportFormat) {
  if (props.formatsDisabled || props.busy.has(format))
    return
  const focused = document.activeElement

  emit('export', format)
  await nextTick()
  if (open.value && focused instanceof HTMLButtonElement && focused.disabled && (document.activeElement === focused || document.activeElement === document.body))
    focusItem(panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? panel.value)
}
function navigate(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()

  const items = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
  if (!items.length)
    return
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length

  focusItem(items[next] ?? null)
}
function focusOut(event: FocusEvent) {
  if (event.relatedTarget && !root.value?.contains(event.relatedTarget as Node))
    close()
}
onClickOutside(root, () => close(), { ignore: ['[data-report-download]'] })
useEventListener(window, 'resize', fitPanel)
</script>

<template>
  <div
    ref="root"
    class="report-export"
    @focusout="focusOut"
  >
    <button
      ref="trigger"
      class="btn btn--primary"
      type="button"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="id"
      @click="toggle"
      @keydown.esc.prevent="close(true)"
    >
      <DesignIcon
        name="download"
        :size="17"
      />{{ t('Export') }}<DesignIcon
        name="chevdown"
        :size="14"
      />
    </button>
    <Transition name="report-menu">
      <div
        v-if="open"
        :id="id"
        ref="panel"
        class="report-export__menu"
        :class="{ 'report-export__menu--above': opensAbove }"
        :style="{ maxHeight }"
        role="menu"
        tabindex="-1"
        :aria-label="t('Export')"
        @keydown="navigate"
      >
        <slot name="intro">
          <p role="none">
            {{ t('report_export_scope') }}
          </p>
        </slot>
        <button
          v-for="format in formats"
          :key="format"
          role="menuitem"
          type="button"
          :disabled="formatsDisabled || busy.has(format)"
          :aria-busy="busy.has(format) || undefined"
          @click="requestExport(format)"
        >
          <span class="report-export__format">{{ format.toUpperCase() }}</span><span>{{ labels[format] }}</span><span
            v-if="busy.has(format)"
            class="button-spinner"
            aria-hidden="true"
          /><DesignIcon
            v-else
            name="download"
            :size="15"
          />
        </button>
        <slot
          name="footer"
          :close="close"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.report-export { position: relative; }
.report-export > button { width: 100%; }
.report-export__menu { position: absolute; inset-inline-end: 0; top: calc(100% + 7px); z-index: 30; width: min(var(--export-menu-width, 268px), calc(100vw - 40px)); max-height: calc(100dvh - 100px); overflow-y: auto; overscroll-behavior: contain; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 6px; box-shadow: var(--shadow-lg); transform-origin: top right; }
.report-export__menu--above { top: auto; bottom: calc(100% + 7px); transform-origin: bottom right; }
.report-export__menu p { margin: 6px 9px 9px; font-size: 11px; line-height: 1.5; color: var(--text-secondary); }
.report-export__menu button { width: 100%; min-height: 46px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; color: var(--text); border-radius: 7px; font-size: 12px; }
.report-export__menu button > :last-child { margin-inline-start: auto; }
.report-export__menu button:hover:not(:disabled), .report-export__menu button:focus-visible { background: var(--primary-weak); color: var(--primary); outline: none; }
.report-export__menu button:disabled { opacity: .6; }
.report-export__format { width: 38px; font: 500 9px var(--font-mono); letter-spacing: .04em; padding: 5px 0; text-align: center; border: 1px solid var(--border); border-radius: 4px; }
.report-menu-enter-active, .report-menu-leave-active { transition: opacity 160ms ease-out, transform 160ms ease-out; }
.report-menu-enter-from, .report-menu-leave-to { opacity: 0; transform: translateY(-5px) scale(.98); }
@media (prefers-reduced-motion: reduce) { .report-menu-enter-active, .report-menu-leave-active { transition: none; } }
</style>
