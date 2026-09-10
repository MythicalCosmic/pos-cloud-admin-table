<script setup lang="ts">
/* ============================================================
   ALPHA POS — Shortcut Help
   Press "?" anywhere outside a text field to open a quick
   reference card listing the global keyboard shortcuts. Closes
   on Esc or backdrop click.
   ============================================================ */
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'

const { t } = useI18n({ useScope: 'global' })

const open = ref(false)
const dialogRef = ref<HTMLElement | null>(null)
const titleId = designId('shortcut-title')
let previouslyFocused: HTMLElement | null = null

interface Shortcut {
  keys: string[]
  label: string
}

const isMac = computed(() =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
)
const meta = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

const groups = computed<{ title: string; items: Shortcut[] }[]>(() => [
  {
    title: t('Navigation'),
    items: [
      { keys: [meta.value, 'K'], label: t('Open command palette') },
      { keys: ['?'], label: t('Show this help') },
      { keys: ['Esc'], label: t('Close overlay / dialog') },
    ],
  },
  {
    title: t('Tables & filters'),
    items: [
      { keys: ['Tab'], label: t('Cycle through controls') },
      { keys: ['Enter'], label: t('Activate selected') },
      { keys: ['Space'], label: t('Toggle checkbox / switch') },
    ],
  },
])

function isEditable(el: Element | null): boolean {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}

function close() {
  open.value = false
}

function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !dialogRef.value) return
  const items = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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

watch(open, async (value) => {
  if (value) {
    previouslyFocused = document.activeElement as HTMLElement | null
    await nextTick()
    dialogRef.value?.querySelector<HTMLButtonElement>('.shk__close')?.focus()
  }
  else if (previouslyFocused) {
    previouslyFocused.focus()
    previouslyFocused = null
  }
})

function onKey(e: KeyboardEvent) {
  // "?" key — depending on layout this comes through as `e.key === '?'` or as
  // `e.key === '/'` with shiftKey true. Accept both. Guard against opening
  // while typing inside an input / textarea / contenteditable.
  const wantsHelp = (e.key === '?' || (e.key === '/' && e.shiftKey))
  if (wantsHelp && !isEditable(document.activeElement)) {
    e.preventDefault()
    if (open.value) close()
    else open.value = true
    return
  }
  if (open.value && e.key === 'Escape') {
    close()
    return
  }
  if (open.value && e.key === 'Tab') trapTab(e)
}

onMounted(() => { window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (previouslyFocused) previouslyFocused.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="shk-backdrop"
        @mousedown.self="close"
      >
        <div
          ref="dialogRef"
          class="shk"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <div class="shk__head">
            <h3
              :id="titleId"
              class="shk__title"
            >
              {{ t('Keyboard shortcuts') }}
            </h3>
            <button
              class="shk__close"
              :title="t('Close')"
              :aria-label="t('Close')"
              @click="close"
            >
              <DesignIcon name="close" :size="16" />
            </button>
          </div>
          <div class="shk__body">
            <section
              v-for="g in groups"
              :key="g.title"
              class="shk__group"
            >
              <h4 class="shk__group-title">
                {{ g.title }}
              </h4>
              <ul class="shk__list">
                <li
                  v-for="item in g.items"
                  :key="item.label"
                  class="shk__row"
                >
                  <span class="shk__label">{{ item.label }}</span>
                  <span class="shk__keys">
                    <kbd
                      v-for="(k, i) in item.keys"
                      :key="`${item.label}-${i}`"
                      class="shk__kbd"
                    >{{ k }}</kbd>
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--overlay);
  display: grid;
  place-items: center;
  padding: 4vh;
}
.shk {
  width: min(480px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.shk__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.shk__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.shk__close {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 6px;
  border-radius: 6px;
}
.shk__close:hover {
  background: var(--surface-2);
  color: var(--text);
}
.shk__body {
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.shk__group-title {
  margin: 0 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  font-weight: 600;
}
.shk__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.shk__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: var(--text);
}
.shk__label {
  flex: 1;
  min-width: 0;
}
.shk__keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.shk__kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-secondary);
  min-width: 20px;
  text-align: center;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.14s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
