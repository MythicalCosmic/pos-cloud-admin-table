<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import { designId } from '@/components/design/ids'

interface Section { id: string; labelKey: string; subtitleKey: string; icon: string }
const props = defineProps<{ sections: Section[]; current: string }>()
const emit = defineEmits<{ (e: 'select', id: string): void }>()
const { t } = useI18n({ useScope: 'global' })
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const nav = ref<HTMLElement>()
const open = ref(false)
const id = designId('dashboard-directory')
const active = computed(() => props.sections.find(section => section.id === props.current) || props.sections[0])

onClickOutside(root, () => { open.value = false })
function close() { open.value = false; trigger.value?.focus() }
async function openWithKeyboard() {
  open.value = true
  await nextTick()
  nav.value?.querySelector('a')?.focus()
}
function onKey(event: KeyboardEvent, index: number) {
  let next = index
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
    next = (index + 1) % props.sections.length
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
    next = (index - 1 + props.sections.length) % props.sections.length
  else if (event.key === 'Home')
    next = 0
  else if (event.key === 'End')
    next = props.sections.length - 1
  else return
  event.preventDefault()
  nav.value?.querySelectorAll('a')[next]?.focus()
}
function select(section: Section) { open.value = false; emit('select', section.id) }
function onFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget))
    open.value = false
}
</script>

<template>
  <div
    ref="root"
    class="dashboard-directory"
    @keydown.esc.stop.prevent="close"
    @focusout="onFocusOut"
  >
    <button
      ref="trigger"
      type="button"
      class="dashboard-directory__trigger"
      :aria-expanded="open"
      :aria-controls="id"
      :aria-label="t('dash_explore_sections')"
      @click="open = !open"
      @keydown.down.prevent="openWithKeyboard"
    >
      <span class="dashboard-directory__icon"><DesignIcon
        :name="active.icon"
        :size="18"
      /></span>
      <span><strong>{{ t(active.labelKey) }}</strong></span>
      <DesignIcon
        :name="open ? 'sortup' : 'chevdown'"
        :size="16"
      />
    </button>
    <Transition name="directory">
      <nav
        v-if="open"
        :id="id"
        ref="nav"
        class="dashboard-directory__panel"
        :aria-label="t('dash_sections')"
      >
        <div class="dashboard-directory__heading">
          {{ t('dash_sections') }}<span>01 — 05</span><button
            type="button"
            :aria-label="t('Dismiss')"
            @click="close"
          >
            <DesignIcon
              name="close"
              :size="16"
            />
          </button>
        </div>
        <a
          v-for="(section, i) in sections"
          :key="section.id"
          :href="`#dashboard-${section.id}`"
          :aria-current="current === section.id ? 'location' : undefined"
          @click.prevent="select(section)"
          @keydown="onKey($event, i)"
        >
          <span class="dashboard-directory__icon"><DesignIcon
            :name="section.icon"
            :size="18"
          /></span><span><strong>{{ t(section.labelKey) }}</strong><small>{{ t(section.subtitleKey) }}</small></span><kbd>{{ i + 1 }}</kbd>
        </a>
      </nav>
    </Transition>
  </div>
</template>

<style scoped>
.dashboard-directory { position: relative; min-width: 0; }
.dashboard-directory__trigger { display: flex; text-align: left; align-items: center; gap: 10px; padding: 8px 12px; min-height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); transition: background 160ms; }
.dashboard-directory__trigger:hover, .dashboard-directory__trigger[aria-expanded="true"] { background: var(--surface-2); }
.dashboard-directory__icon { flex-shrink: 0; display: grid; width: 28px; height: 28px; place-items: center; color: var(--primary); }
.dashboard-directory__trigger > span:nth-child(2) { display: grid; gap: 1px; }
.dashboard-directory__trigger strong { color: var(--text); font-weight: 600; font-size: 13px; }
.dashboard-directory__trigger small { color: var(--text-secondary); font-size: 10px; }
.dashboard-directory__trigger > svg { margin-left: 14px; color: var(--text-secondary); }
.dashboard-directory__panel { position: absolute; top: calc(100% + 8px); left: 0; width: 390px; max-width: calc(100vw - 40px); border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: 0 16px 40px #00000020; padding: 8px; max-height: 70dvh; overflow: auto; transform-origin: top left; }
.dashboard-directory__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 4px 2px 12px; color: var(--text-secondary); font-size: 11px; }
.dashboard-directory__heading button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 10px; }
.dashboard-directory__heading > span { margin-left: auto; font-family: var(--font-mono); font-size: 10px; }
.dashboard-directory__panel a { display: flex; align-items: center; gap: 12px; min-height: 70px; padding: 12px; border-radius: 11px; text-decoration: none; color: var(--text); }
.dashboard-directory__panel a:hover, .dashboard-directory__panel a[aria-current] { background: var(--primary-weak); }
.dashboard-directory__panel a > span:nth-child(2) { flex: 1; min-width: 0; display: grid; gap: 3px; }
.dashboard-directory__panel strong { font-size: 13px; font-weight: 600; }
.dashboard-directory__panel small { font-size: 11px; line-height: 1.45; color: var(--text-secondary); }
.dashboard-directory kbd { flex-shrink: 0; border: 1px solid var(--border); border-radius: 5px; padding: 2px 5px; font: 10px var(--font-mono); color: var(--text-secondary); }
.dashboard-directory button:focus-visible, .dashboard-directory a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.directory-enter-active, .directory-leave-active { transition: opacity 150ms, transform 150ms; }
.directory-enter-from, .directory-leave-to { opacity: 0; transform: translateY(-6px) scale(.98); }
@media (max-width: 600px) { .dashboard-directory__panel { position: fixed; top: auto; bottom: 80px; left: 12px; right: 12px; width: auto; max-width: none; max-height: calc(100dvh - 160px); transform-origin: bottom center; } .dashboard-directory__trigger { gap: 8px; padding-right: 8px; } .dashboard-directory__trigger strong { font-size: 12px; } .dashboard-directory__trigger > svg { margin-left: 2px; } .dashboard-directory__trigger small { font-size: 9px; } }
@media (prefers-reduced-motion: reduce) { .directory-enter-active, .directory-leave-active, .dashboard-directory__trigger { transition: none; } }
</style>
