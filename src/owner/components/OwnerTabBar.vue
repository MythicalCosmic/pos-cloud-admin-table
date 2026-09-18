<script setup lang="ts">
import { haptic } from '../services/native'
import { ownerState } from '../state'
import DesignIcon from '@/components/design/DesignIcon.vue'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()

const tabs = [
  { to: '/', icon: 'dashboard', label: 'owner_app_tab_home' },
  { to: '/approvals', icon: 'checkcircle', label: 'owner_app_tab_approvals', badge: true },
  { to: '/money', icon: 'wallet', label: 'owner_app_tab_money' },
  { to: '/suppliers', icon: 'building', label: 'owner_app_tab_suppliers' },
  { to: '/more', icon: 'menu', label: 'owner_app_tab_more' },
]

function active(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <nav
    class="owner-tabs"
    :aria-label="t('owner_app_navigation')"
  >
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="owner-tabs__item"
      :class="{ 'is-active': active(tab.to) }"
      :aria-current="active(tab.to) ? 'page' : undefined"
      @click="haptic('light')"
    >
      <span class="owner-tabs__icon">
        <DesignIcon
          :name="tab.icon"
          :size="23"
          :weight="active(tab.to) ? 2.1 : 1.75"
        />
        <span
          v-if="tab.badge && ownerState.pendingApprovals"
          class="owner-tabs__badge"
        >{{ ownerState.pendingApprovals > 99 ? '99+' : ownerState.pendingApprovals }}</span>
      </span>
      <span class="owner-tabs__label">{{ t(tab.label) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.owner-tabs {
  position: fixed; inset: auto 0 0; z-index: 20;
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 6px 4px calc(env(safe-area-inset-bottom, 0px) + 6px);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: saturate(1.4) blur(14px);
  border-top: 1px solid var(--border);
}
.owner-tabs__item {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  min-height: 50px; padding-top: 4px;
  color: var(--text-tertiary); text-decoration: none; -webkit-tap-highlight-color: transparent;
}
.owner-tabs__item.is-active { color: var(--primary); }
.owner-tabs__icon { position: relative; display: grid; place-items: center; }
.owner-tabs__badge {
  position: absolute; top: -5px; right: -12px; min-width: 18px; height: 18px; padding: 0 5px;
  display: grid; place-items: center; border-radius: 9px;
  background: var(--error); color: #fff; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.owner-tabs__label { max-width: 100%; overflow: hidden; font-size: 11px; font-weight: 600; letter-spacing: 0.01em; text-overflow: ellipsis; white-space: nowrap; }
</style>
