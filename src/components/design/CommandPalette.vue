<script setup lang="ts">
import { useTheme } from 'vuetify'
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'
import dashboardNav from '@/navigation/vertical/dashboard'
import managementNav from '@/navigation/vertical/management'
import stockNav from '@/navigation/vertical/stock'
import systemNav from '@/navigation/vertical/system'
import analyticsNav from '@/navigation/vertical/analytics'
import { useAlphaTheme } from '@/composables/useAlphaTheme'
import { readUserAccess } from '@/composables/useUserAccess'
import { useSessionLogout } from '@/composables/useSessionLogout'
import { warehousePathAllowed } from '@/navigation/access'

const { t, locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const vuetifyTheme = useTheme()

interface NavItem {
  title: string
  to?: string
  icon?: { icon: string } | string
  action?: string
  subject?: string
  anyPermission?: string[]
  allPermissions?: string[]
  allowedRoles?: string[]
}

interface CmdItem {
  id: string
  title: string
  group: string
  to?: string
  action?: () => void
  icon?: string
  searchKey: string
  anyPermission?: string[]
  allPermissions?: string[]
  allowedRoles?: string[]
}

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const listboxId = designId('command-listbox')
let previouslyFocused: HTMLElement | null = null
const { toggleTheme } = useAlphaTheme(vuetifyTheme)
const { logout } = useSessionLogout()

function flattenNav(group: string, nav: any[]): CmdItem[] {
  const out: CmdItem[] = []
  for (const item of nav) {
    if (item.heading)
      continue
    if (item.children && Array.isArray(item.children)) {
      for (const c of item.children) {
        if (c.to)
          out.push(buildItem(group, c))
      }
    }
    else if (item.to) {
      out.push(buildItem(group, item))
    }
  }
  return out
}

function buildItem(group: string, n: NavItem): CmdItem {
  const iconName = typeof n.icon === 'string' ? n.icon : n.icon?.icon
  const title = t(n.title) || n.title
  return {
    id: `route:${group}:${n.to || title}`,
    title,
    group,
    to: n.to || '',
    icon: iconName,
    anyPermission: n.anyPermission,
    allPermissions: n.allPermissions,
    allowedRoles: n.allowedRoles,
    searchKey: `${title} ${group} ${n.to ?? ''}`.toLowerCase(),
  }
}

// Action commands — non-route commands the palette can fire (theme, lang, logout).
function setLocale(code: string) {
  locale.value = code as any
  localStorage.setItem('appLocale', code)
}

function actionsGroup(): CmdItem[] {
  const group = t('Actions')

  const mkActionItem = (id: string, title: string, icon: string, action: () => void): CmdItem => ({
    id,
    title,
    group,
    icon,
    action,
    searchKey: `${title} ${group}`.toLowerCase(),
  })

  return [
    mkActionItem('action:theme', t('Toggle dark mode'), 'moon', toggleTheme),
    mkActionItem('action:locale:uz', t('Switch to O\'zbek'), 'translate', () => setLocale('uz')),
    mkActionItem('action:locale:ru', t('Switch to Русский'), 'translate', () => setLocale('ru')),
    mkActionItem('action:locale:en', t('Switch to English'), 'translate', () => setLocale('en')),
    mkActionItem('action:logout', t('Sign out'), 'logout', logout),
  ]
}

const items = computed<CmdItem[]>(() => {
  const actions = actionsGroup()

  const routes = [
    ...flattenNav(t('Dashboard'), dashboardNav as any),
    ...flattenNav(t('Management'), managementNav as any),
    ...flattenNav(t('Stock'), stockNav as any),
    ...flattenNav(t('Analytics'), analyticsNav as any),
    ...flattenNav(t('Settings'), systemNav as any),
  ]

  const access = readUserAccess()

  const permittedRoutes = routes.filter(item =>
    (!item.anyPermission?.length || access.hasAny(item.anyPermission))
    && (!item.allPermissions?.length || access.hasAll(item.allPermissions))
    && (!item.allowedRoles?.length || item.allowedRoles.includes(access.role)),
  )

  if (!access.isWarehouse)
    return [...actions, ...permittedRoutes]

  const allowedRoutes = permittedRoutes.filter(item => {
    if (!item.to)
      return false
    try {
      const path = router.resolve({ name: item.to }).path

      return warehousePathAllowed(path, access)
    }
    catch {
      return false
    }
  })

  return [...actions, ...allowedRoutes]
})

const filtered = computed<CmdItem[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return items.value.slice(0, 14)
  return items.value
    .filter(it => it.searchKey.includes(q))
    .sort((a, b) => {
      // Prefer prefix matches in title.
      const aPrefix = a.title.toLowerCase().startsWith(q) ? 0 : 1
      const bPrefix = b.title.toLowerCase().startsWith(q) ? 0 : 1
      return aPrefix - bPrefix
    })
    .slice(0, 30)
})

watch(query, () => { activeIndex.value = 0 })
watch(open, async v => {
  if (v) {
    previouslyFocused = document.activeElement as HTMLElement | null
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  }
  else if (previouslyFocused) {
    previouslyFocused.focus()
    previouslyFocused = null
  }
})

watch(activeIndex, async () => {
  await nextTick()
  dialogRef.value
    ?.querySelector<HTMLElement>(`#${listboxId}-option-${activeIndex.value}`)
    ?.scrollIntoView({ block: 'nearest' })
})

function close() {
  open.value = false
}

function focusableIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(node => node.offsetParent !== null)
}

function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !dialogRef.value)
    return
  const focusable = focusableIn(dialogRef.value)
  if (!focusable.length) {
    e.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
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

function go(it: CmdItem) {
  open.value = false
  if (it.action) {
    it.action()
    return
  }
  if (it.to)
    router.push({ name: it.to }).catch(() => { /* Navigation guards own denied destinations. */ })
}

function onGlobalKey(e: KeyboardEvent) {
  const isCmd = e.metaKey || e.ctrlKey
  if (isCmd && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()

    // A page modal owns focus and interaction until it closes. Do not open a
    // second global dialog behind that higher modal stack.
    if (!open.value && document.querySelector('.overlay [role="dialog"]'))
      return
    open.value = !open.value
    return
  }
  if (!open.value)
    return
  if (e.key === 'Escape') { close(); return }
  if (e.key === 'Tab') { trapTab(e); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = Math.min(filtered.value.length - 1, activeIndex.value + 1); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = Math.max(0, activeIndex.value - 1); return }
  if (e.key === 'Enter') {
    e.preventDefault()

    const it = filtered.value[activeIndex.value]; if (it)
      go(it)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  if (previouslyFocused)
    previouslyFocused.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cmdk">
      <div
        v-if="open"
        class="cmdk-backdrop"
        @mousedown.self="close"
      >
        <div
          ref="dialogRef"
          class="cmdk"
          role="dialog"
          aria-modal="true"
          :aria-label="t('Command palette')"
        >
          <div class="cmdk__head">
            <DesignIcon
              name="search"
              :size="18"
            />
            <input
              ref="inputRef"
              v-model="query"
              :placeholder="t('Jump to anywhere…')"
              class="cmdk__input"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-controls="listboxId"
              :aria-activedescendant="filtered.length ? `${listboxId}-option-${activeIndex}` : undefined"
            >
            <span class="cmdk__hint">Esc</span>
          </div>
          <div
            :id="listboxId"
            class="cmdk__list"
            role="listbox"
            :aria-label="t('Command palette')"
          >
            <div
              v-if="!filtered.length"
              class="cmdk__empty"
            >
              {{ t('No matches') }}
            </div>
            <button
              v-for="(it, i) in filtered"
              :id="`${listboxId}-option-${i}`"
              :key="it.id"
              type="button"
              class="cmdk__row"
              :class="{ 'is-active': i === activeIndex }"
              role="option"
              :aria-selected="i === activeIndex"
              tabindex="-1"
              @mousemove="activeIndex = i"
              @focus="activeIndex = i"
              @click="go(it)"
            >
              <span class="cmdk__icon">
                <DesignIcon
                  v-if="it.icon"
                  :name="it.icon"
                  :size="15"
                />
              </span>
              <span class="cmdk__title">{{ it.title }}</span>
              <span class="cmdk__group">{{ it.group }}</span>
            </button>
          </div>
          <div class="cmdk__foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('navigate') }}</span>
            <span><kbd>↵</kbd> {{ t('open') }}</span>
            <span><kbd>Esc</kbd> {{ t('close') }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmdk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--overlay);
  display: grid;
  place-items: start center;
  padding-top: 12vh;
}
.cmdk {
  width: min(640px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cmdk__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}
.cmdk__input {
  flex: 1;
  border: 0;
  background: transparent;
  font-size: 15px;
  color: var(--text);
  outline: none;
}
.cmdk__hint {
  font-size: 11px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
.cmdk__list {
  max-height: 52vh;
  overflow-y: auto;
  padding: 6px;
}
.cmdk__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.cmdk__row {
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text);
  font-size: 14px;
  transition: background .08s ease;
}
.cmdk__row.is-active {
  background: var(--surface-2);
}
.cmdk__icon {
  width: 22px;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}
.cmdk__title {
  flex: 1;
  font-weight: 500;
}
.cmdk__group {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cmdk__foot {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-tertiary);
}
.cmdk__foot kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  margin-right: 4px;
  color: var(--text-secondary);
}
.cmdk-enter-active,
.cmdk-leave-active {
  transition: opacity .14s ease;
}
.cmdk-enter-from,
.cmdk-leave-to {
  opacity: 0;
}
</style>
