<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import DesignIcon from './DesignIcon.vue'
import AppearanceDialog from './AppearanceDialog.vue'
import { designId } from './ids'
import { useSessionLogout } from '@/composables/useSessionLogout'
import { getStoredUserData } from '@/utils/storage'

interface StoredUser {
  first_name?: string
  last_name?: string
  fullName?: string
  username?: string
  email?: string
  role?: string
}

const { t, te } = useI18n({ useScope: 'global' })
const { logout } = useSessionLogout()
const userData = getStoredUserData<StoredUser>()
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const logoutRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const appearanceOpen = ref(false)
const appearanceRef = ref<HTMLButtonElement | null>(null)
const menuId = designId('account-menu')

const displayName = computed(() => {
  const fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim()

  return fullName || userData.fullName || userData.username || userData.email || t('Account menu')
})

const initials = computed(() => {
  const first = (userData.first_name || '').charAt(0)
  const last = (userData.last_name || '').charAt(0)
  if (first || last)
    return `${first}${last}`.toUpperCase()

  const fallback = displayName.value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')

  return fallback.toUpperCase() || '?'
})

const roleLabel = computed(() => {
  if (!userData.role)
    return ''

  const roleKey = `role_${userData.role}`

  return te(roleKey) ? t(roleKey) : (te(userData.role) ? t(userData.role) : userData.role)
})

async function toggleMenu() {
  if (open.value) {
    open.value = false

    return
  }

  open.value = true
  await nextTick()
  appearanceRef.value?.focus()
}

async function showAppearance() {
  closeMenu(true)
  await nextTick()
  appearanceOpen.value = true
}

function navigateMenu(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()

  const first = appearanceRef.value
  const last = logoutRef.value
  if (event.key === 'Home' || (event.key !== 'End' && document.activeElement === last))
    first?.focus()
  else
    last?.focus()
}

function closeMenu(restoreFocus = false) {
  if (!open.value)
    return

  open.value = false
  if (restoreFocus)
    nextTick(() => triggerRef.value?.focus())
}

function onFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as Node | null
  if (nextTarget && rootRef.value && !rootRef.value.contains(nextTarget))
    open.value = false
}

function handleLogout() {
  open.value = false
  logout()
}

onClickOutside(rootRef, () => closeMenu())
</script>

<template>
  <div
    ref="rootRef"
    class="profile-menu"
    @focusout="onFocusOut"
  >
    <button
      ref="triggerRef"
      type="button"
      class="avatar profile-menu__trigger"
      :title="t('Account menu')"
      :aria-label="t('Account menu')"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="toggleMenu"
      @keydown.esc.prevent.stop="closeMenu(true)"
    >
      {{ initials }}
    </button>

    <Transition name="profile-menu-fade">
      <div
        v-if="open"
        :id="menuId"
        class="profile-menu__panel"
        role="menu"
        :aria-label="t('Account menu')"
        @keydown.esc.prevent.stop="closeMenu(true)"
        @keydown="navigateMenu"
      >
        <div
          class="profile-menu__identity"
          role="none"
        >
          <span
            class="avatar avatar--sm"
            aria-hidden="true"
          >{{ initials }}</span>
          <span class="profile-menu__identity-copy">
            <strong :title="displayName">{{ displayName }}</strong>
            <span v-if="roleLabel">{{ roleLabel }}</span>
          </span>
        </div>

        <div
          v-if="userData.email && userData.email !== displayName"
          class="profile-menu__email"
          role="none"
          :title="userData.email"
        >
          {{ userData.email }}
        </div>

        <div
          class="profile-menu__divider"
          role="separator"
        />

        <button
          ref="appearanceRef"
          type="button"
          class="profile-menu__appearance"
          role="menuitem"
          @click="showAppearance"
        >
          <DesignIcon
            name="sliders"
            :size="17"
          />
          <span>{{ t('appearance_title') }}</span>
        </button>
        <button
          ref="logoutRef"
          type="button"
          class="profile-menu__logout"
          role="menuitem"
          @click="handleLogout"
        >
          <DesignIcon
            name="logout"
            :size="17"
          />
          <span>{{ t('Logout') }}</span>
        </button>
      </div>
    </Transition>
    <AppearanceDialog v-model:open="appearanceOpen" />
  </div>
</template>

<style scoped>
.profile-menu {
  position: relative;
  flex: 0 0 auto;
}

.profile-menu__appearance { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 8px; color: var(--text); font-size: 13px; text-align: left; }
.profile-menu__appearance:hover { background: var(--surface-2); }
.profile-menu__appearance:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }

.profile-menu__trigger {
  padding: 0;
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
  transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
}

.profile-menu__trigger:hover,
.profile-menu__trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--primary) 34%, transparent);
  background: var(--primary-weak-2);
}

.profile-menu__trigger:focus-visible,
.profile-menu__logout:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primary) 24%, transparent);
  outline-offset: 2px;
}

.profile-menu__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 130;
  width: 260px;
  max-width: calc(100vw - 24px);
  max-height: min(420px, calc(100vh - var(--topbar-h) - 24px));
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.profile-menu__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
}

.profile-menu__identity-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.profile-menu__identity-copy strong,
.profile-menu__identity-copy span,
.profile-menu__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-menu__identity-copy strong {
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}

.profile-menu__identity-copy span,
.profile-menu__email {
  color: var(--text-tertiary);
  font-size: var(--fs-label);
}

.profile-menu__email {
  padding: 2px 8px 8px 46px;
}

.profile-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}

.profile-menu__logout {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--error);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  text-align: left;
}

.profile-menu__logout:hover {
  background: color-mix(in srgb, var(--error) 9%, transparent);
}

.profile-menu-fade-enter-active,
.profile-menu-fade-leave-active {
  transition: opacity .14s ease, transform .14s ease;
}

.profile-menu-fade-enter-from,
.profile-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
