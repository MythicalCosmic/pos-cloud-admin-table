<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMediaQuery } from '@vueuse/core'
import SidebarLink from './SidebarLink.vue'
import Input from '@/components/design/Input.vue'
import BrandMark from '@/components/design/BrandMark.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { routeLabelForPath } from '@/navigation/routeLabels'
import { EXPENSE_REQUEST_PERMISSIONS } from '@/navigation/access'
import { useNavCountsStore } from '@/stores/navCounts'
import { useUserAccess } from '@/composables/useUserAccess'

// Navigation uses the established Alpha palette. Primary destinations stay
// visible; searchable domain groups keep the full route set within reach.

interface NavSection { type: 'section'; label: string }
interface NavItem {
  type: 'item'
  id: string
  label: string
  icon: string
  to: string
  badge?: string
  anyPermission?: string[]
  allPermissions?: string[]
  allowedRoles?: string[]
}
type NavEntry = NavSection | NavItem

const props = defineProps<{ collapsed?: boolean; open?: boolean }>()
const emit = defineEmits<{ (e: 'navGo'): void; (e: 'close'): void; (e: 'toggle'): void }>()

const WAREHOUSE_WORKSPACE_PERMISSIONS = [
  'stock.catalog.view',
  'stock.level.view',
  'stock.batch.view',
  'stock.supplier.view',
  'stock.purchase.view',
  'stock.receiving.create',
  'stock.receiving.update_draft',
  'stock.receiving.complete',
  'stock.purchase_invoice.view',
  'stock.purchase_invoice.receive',
  'stock.transfer.view',
  'stock.transfer.create',
  'stock.count.view',
  'stock.count.create',
  'stock.count.record',
  'stock.adjustment.request',
  'stock.adjustment.approve',
]

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const route = useRoute()
const { isWarehouse, role, hasAnyPermission, hasAllPermissions } = useUserAccess()
const isMobile = useMediaQuery('(max-width: 768px)')
const drawerHidden = computed(() => isMobile.value && !props.open)
const closeButton = ref<HTMLButtonElement | null>(null)

function focusClose() {
  closeButton.value?.focus()
}

defineExpose({ focusClose })

const navStore = useNavCountsStore()
const { counts } = storeToRefs(navStore)

onMounted(() => {
  if (!isWarehouse.value)
    navStore.start()
})
onBeforeUnmount(() => navStore.stop())

function badgeFor(id: string): string | undefined {
  if (id === 'shifts' && counts.value.shifts !== null && counts.value.shifts > 0)
    return String(counts.value.shifts)
  if (id === 'orders' && counts.value.orders !== null && counts.value.orders > 0)
    return String(counts.value.orders)
  return undefined
}

// Keep route identities and backend permissions independent of presentation.
const NAV: NavEntry[] = [
  { type: 'item', id: 'dashboard', label: 'Dashboard', icon: 'dashboard', to: '/' },
  { type: 'item', id: 'compare-periods', label: 'Product comparison', icon: 'exchange', to: '/analytics/compare' },
  { type: 'item', id: 'ai', label: 'AI Assistant', icon: 'ai', to: '/ai-assistant' },
  { type: 'item', id: 'shifts', label: 'Shifts', icon: 'clock', to: '/shifts-analytics' },
  { type: 'section', label: 'Management' },
  { type: 'item', id: 'users', label: 'Users', icon: 'users', to: '/users' },
  { type: 'item', id: 'categories', label: 'Categories', icon: 'grid', to: '/categories' },
  { type: 'item', id: 'products', label: 'Products', icon: 'box', to: '/products' },
  { type: 'item', id: 'orders', label: 'Orders', icon: 'receipt', to: '/orders' },
  { type: 'item', id: 'places', label: 'Places & Tables', icon: 'table', to: '/places' },
  { type: 'item', id: 'discounts', label: 'Discounts', icon: 'tag', to: '/discounts' },
  { type: 'item', id: 'secret-word-discounts', label: 'discount_secret_title', icon: 'lock', to: '/discounts/secret-word' },
  { type: 'item', id: 'loyalty', label: 'Loyalty', icon: 'gift', to: '/loyalty' },
  { type: 'section', label: 'Staff' },
  { type: 'item', id: 'hr-employees', label: 'Employees', icon: 'users', to: '/hr-employees', allowedRoles: ['ADMIN'] },
  { type: 'item', id: 'hr-salaries', label: 'Salaries', icon: 'wallet', to: '/hr-salaries', allowedRoles: ['ADMIN'] },
  { type: 'item', id: 'hr-departments', label: 'Departments', icon: 'building', to: '/hr-departments', allowedRoles: ['ADMIN'] },
  { type: 'section', label: 'Finance' },
  { type: 'item', id: 'cash', label: 'Cashbox Expense Categories', icon: 'register', to: '/cashbox/categories' },
  { type: 'item', id: 'hr-expenses', label: 'Expenses', icon: 'coins', to: '/hr-expenses', anyPermission: EXPENSE_REQUEST_PERMISSIONS },
  { type: 'item', id: 'money-control', label: 'Money Control', icon: 'wallet', to: '/money-control', anyPermission: ['money.control.view'] },
  { type: 'item', id: 'treasury', label: 'Treasury', icon: 'store', to: '/treasury', anyPermission: ['treasury.account.view'] },
  { type: 'section', label: 'Analytics' },
  { type: 'item', id: 'product-statistics', label: 'Product sales analytics', icon: 'trend', to: '/analytics/product-statistics' },
  { type: 'item', id: 'product-performance', label: 'report_title', icon: 'receipt', to: '/reports/product-performance', allowedRoles: ['ADMIN', 'MANAGER'] },
  { type: 'item', id: 'menu-engineering', label: 'Menu Engineering', icon: 'chart', to: '/analytics/menu-engineering' },
  { type: 'item', id: 'demand-forecast', label: 'Demand Forecast', icon: 'trend', to: '/forecast/tomorrow' },
  { type: 'section', label: 'Stock' },
  { type: 'item', id: 'warehouse', label: 'Warehouse operations', icon: 'package', to: '/warehouse', anyPermission: WAREHOUSE_WORKSPACE_PERMISSIONS },
  { type: 'item', id: 'stock-items', label: 'Stock Items', icon: 'box', to: '/stock/items', anyPermission: ['stock.catalog.view'] },
  { type: 'item', id: 'stock-levels', label: 'Stock Levels', icon: 'bars', to: '/stock/levels', anyPermission: ['stock.level.view'] },
  { type: 'item', id: 'stock-batches', label: 'Batches', icon: 'package', to: '/stock/batches', anyPermission: ['stock.batch.view'] },
  { type: 'item', id: 'stock-suppliers', label: 'Suppliers', icon: 'building', to: '/stock/suppliers', anyPermission: ['stock.supplier.view'] },
  { type: 'item', id: 'stock-purchase-invoices', label: 'Supplier invoices', icon: 'inbox', to: '/stock/purchase-invoices', anyPermission: ['stock.purchase_invoice.view', 'stock.purchase_invoice.receive'] },
  { type: 'item', id: 'stock-purchase-orders', label: 'Purchase Orders', icon: 'receipt', to: '/stock/purchase-orders', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-receiving', label: 'PO receiving', icon: 'inbox', to: '/stock/receiving', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-counts', label: 'Stock Counts', icon: 'list', to: '/stock/counts', anyPermission: ['stock.count.view'] },
  { type: 'item', id: 'stock-adjustment-requests', label: 'Stock adjustment requests', icon: 'sliders', to: '/stock/adjustment-requests', anyPermission: ['stock.adjustment.request'] },
  {
    type: 'item',
    id: 'stock-adjustments',
    label: 'Adjustments',
    icon: 'sliders',
    to: '/stock/adjustments',
    allPermissions: ['stock.adjustment.approve', 'stock.catalog.view'],
    anyPermission: ['stock.level.view', 'stock.inventory_control.view'],
  },
  { type: 'item', id: 'stock-transfers', label: 'Transfers', icon: 'share', to: '/stock/transfers', anyPermission: ['stock.transfer.view'] },
  { type: 'item', id: 'stock-alerts', label: 'Stock Alerts', icon: 'alert', to: '/stock/alerts' },
  { type: 'item', id: 'stock-reservations', label: 'Reservations', icon: 'lock', to: '/stock/reservations' },
  { type: 'item', id: 'stock-categories', label: 'Stock Categories', icon: 'grid', to: '/stock/categories' },
  { type: 'item', id: 'stock-locations', label: 'Stock Locations', icon: 'building', to: '/stock/locations', anyPermission: ['stock.level.view', 'stock.inventory_control.view'] },
  { type: 'item', id: 'stock-product-links', label: 'Product Stock Links', icon: 'share', to: '/stock/product-links' },
  { type: 'item', id: 'stock-production-orders', label: 'Production Orders', icon: 'gear', to: '/stock/production-orders' },
  { type: 'item', id: 'stock-recipes', label: 'Recipes', icon: 'list', to: '/stock/recipes' },
  { type: 'item', id: 'stock-settings', label: 'Stock Settings', icon: 'gear', to: '/stock/settings' },
  { type: 'item', id: 'stock-transactions', label: 'Stock Transactions', icon: 'clock', to: '/stock/transactions' },
  { type: 'item', id: 'stock-units', label: 'Units', icon: 'list', to: '/stock/units' },
  { type: 'item', id: 'stock-variance-codes', label: 'Variance Codes', icon: 'alert', to: '/stock/variance-codes' },
  { type: 'section', label: 'Settings' },
  { type: 'item', id: 'app-settings', label: 'App Settings', icon: 'gear', to: '/app-settings' },
  { type: 'item', id: 'roles', label: 'Roles & Permissions', icon: 'lock', to: '/settings/roles' },
  { type: 'section', label: 'Notifications' },
  { type: 'item', id: 'notifications', label: 'Notifications', icon: 'bell', to: '/notifications' },
  { type: 'item', id: 'notification-queue', label: 'Notification Queue', icon: 'inbox', to: '/notification-queue' },
  { type: 'item', id: 'notification-settings', label: 'Notification Settings', icon: 'sliders', to: '/notification-settings' },
  { type: 'item', id: 'notification-templates', label: 'Notification Templates', icon: 'copy', to: '/notification-templates' },
  { type: 'item', id: 'notification-types', label: 'Notification Types', icon: 'bell', to: '/notification-types' },
]

const WAREHOUSE_NAV: NavEntry[] = [
  { type: 'item', id: 'warehouse', label: 'Warehouse operations', icon: 'package', to: '/warehouse' },
  { type: 'section', label: 'Stock' },
  { type: 'item', id: 'stock-items', label: 'Stock Items', icon: 'box', to: '/stock/items', anyPermission: ['stock.catalog.view'] },
  { type: 'item', id: 'stock-levels', label: 'Stock Levels', icon: 'bars', to: '/stock/levels', anyPermission: ['stock.level.view'] },
  { type: 'item', id: 'stock-batches', label: 'Batches', icon: 'package', to: '/stock/batches', anyPermission: ['stock.batch.view'] },
  { type: 'item', id: 'stock-suppliers', label: 'Suppliers', icon: 'building', to: '/stock/suppliers', anyPermission: ['stock.supplier.view'] },
  { type: 'item', id: 'stock-purchase-invoices', label: 'Supplier invoices', icon: 'inbox', to: '/stock/purchase-invoices', anyPermission: ['stock.purchase_invoice.view', 'stock.purchase_invoice.receive'] },
  { type: 'item', id: 'stock-purchase-orders', label: 'Purchase Orders', icon: 'receipt', to: '/stock/purchase-orders', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-receiving', label: 'PO receiving', icon: 'inbox', to: '/stock/receiving', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-counts', label: 'Stock Counts', icon: 'list', to: '/stock/counts', anyPermission: ['stock.count.view'] },
  { type: 'item', id: 'stock-adjustment-requests', label: 'Stock adjustment requests', icon: 'sliders', to: '/stock/adjustment-requests', anyPermission: ['stock.adjustment.request'] },
  {
    type: 'item',
    id: 'stock-adjustments',
    label: 'Adjustments',
    icon: 'sliders',
    to: '/stock/adjustments',
    allPermissions: ['stock.adjustment.approve', 'stock.catalog.view'],
    anyPermission: ['stock.level.view', 'stock.inventory_control.view'],
  },
  { type: 'item', id: 'stock-transfers', label: 'Transfers', icon: 'share', to: '/stock/transfers', anyPermission: ['stock.transfer.view'] },
  { type: 'section', label: 'Finance' },
  { type: 'item', id: 'hr-expenses', label: 'Expenses', icon: 'coins', to: '/hr-expenses', anyPermission: EXPENSE_REQUEST_PERMISSIONS },
]

const visibleNav = computed<NavEntry[]>(() => {
  const source = isWarehouse.value ? WAREHOUSE_NAV : NAV

  const allowed = source.filter(entry => entry.type === 'section' || (
    (!entry.anyPermission?.length || hasAnyPermission(entry.anyPermission))
    && (!entry.allPermissions?.length || hasAllPermissions(entry.allPermissions))
    && (!entry.allowedRoles?.length || entry.allowedRoles.includes(role.value))
  ))

  return allowed.filter((entry, index) => {
    if (entry.type !== 'section')
      return true

    const next = allowed[index + 1]

    return !!next && next.type === 'item'
  })
})

interface NavGroup { label: string; items: NavItem[] }
const search = ref('')
const searchInput = ref<{ focus: () => void } | null>(null)
const collapsedGroups = ref<string[]>(['Stock', 'Settings', 'Notifications'])
const compact = computed(() => !!props.collapsed && !isMobile.value)
const sectionIcons: Record<string, string> = { Management: 'grid', Finance: 'wallet', Analytics: 'chart', Stock: 'package', Settings: 'gear', Notifications: 'bell' }

const activePath = computed(() => visibleNav.value
  .filter((entry): entry is NavItem => entry.type === 'item' && (route.path === entry.to || route.path.startsWith(`${entry.to}/`)))
  .sort((a, b) => b.to.length - a.to.length)[0]?.to)

function navLabel(item: NavItem): string { return routeLabelForPath(item.to) || item.label }
function isActive(item: NavItem): boolean { return activePath.value === item.to }

const groups = computed(() => {
  const result: NavGroup[] = [{ label: '', items: [] }]
  for (const entry of visibleNav.value) {
    if (entry.type === 'section')
      result.push({ label: entry.label, items: [] })
    else
      result[result.length - 1].items.push(entry)
  }
  const query = search.value.trim().toLocaleLowerCase()
  return result.map(group => ({ ...group, items: group.items.filter(item => !query || (group.label && t(group.label).toLocaleLowerCase().includes(query)) || t(navLabel(item)).toLocaleLowerCase().includes(query)) })).filter(group => group.items.length)
})

function groupOpen(label: string) { return !label || !!search.value.trim() || !collapsedGroups.value.includes(label) }
function toggleGroup(label: string) {
  collapsedGroups.value = collapsedGroups.value.includes(label) ? collapsedGroups.value.filter(key => key !== label) : [...collapsedGroups.value, label]
  try { localStorage.setItem('alphapos-nav-groups', JSON.stringify(collapsedGroups.value)) }
  catch { /* Navigation remains usable when storage is unavailable. */ }
}
function revealActiveGroup() {
  const group = groups.value.find(candidate => candidate.items.some(isActive))
  if (group)
    collapsedGroups.value = collapsedGroups.value.filter(label => label !== group.label)
}
function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault()
    event.stopPropagation()
    search.value = ''
  }
}
async function focusSearch(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, [contenteditable="true"], dialog, [role="dialog"]') || drawerHidden.value)
    return
  event.preventDefault()
  if (compact.value)
    emit('toggle')
  await nextTick()
  searchInput.value?.focus()
}
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('alphapos-nav-groups') || 'null')
    if (Array.isArray(saved) && saved.every(value => typeof value === 'string'))
      collapsedGroups.value = saved
  }
  catch { /* Keep the default groups. */ }
  revealActiveGroup()
  window.addEventListener('keydown', focusSearch)
})
onBeforeUnmount(() => window.removeEventListener('keydown', focusSearch))
watch(() => route.path, () => { search.value = ''; revealActiveGroup() })

function onNavClick(e: MouseEvent, item: NavItem) {
  // Honor modifier / middle clicks — let the browser open in new tab/window via the anchor's href.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1)
    return
  e.preventDefault()
  if (route.path !== item.to)
    router.push(item.to)
  emit('navGo')
}
</script>

<template>
  <aside
    id="primary-navigation"
    class="sidebar workspace-sidebar"
    :class="{ 'is-collapsed': compact, 'is-open': open }"
    :aria-hidden="drawerHidden ? 'true' : undefined"
    :inert="drawerHidden ? true : undefined"
  >
    <div class="sidebar__brand">
      <RouterLink
        class="sidebar__brand-link"
        to="/"
        :aria-label="t('Alpha POS')"
        @click="emit('navGo')"
      >
        <span class="sidebar__logo"><BrandMark /></span><span
          v-if="!compact"
          class="sidebar__identity"
        ><strong>Alpha POS</strong><small>{{ t('sidebar_workspace') }}</small></span>
      </RouterLink>
      <button
        ref="closeButton"
        type="button"
        class="sidebar__close"
        :aria-label="t('Close')"
        @click="emit('close')"
      >
        <DesignIcon
          name="close"
          :size="20"
        />
      </button>
      <button
        v-if="!compact"
        type="button"
        class="sidebar__compact-button"
        :aria-label="t('Collapse sidebar')"
        :title="t('Collapse sidebar')"
        @click="emit('toggle')"
      >
        <DesignIcon
          name="layout"
          :size="18"
        />
      </button>
    </div>
    <div
      v-if="!compact"
      class="sidebar__search"
    >
      <Input
        ref="searchInput"
        v-model="search"
        icon="search"
        :placeholder="t('sidebar_find_page')"
        :aria-label="t('sidebar_find_page')"
        autocomplete="off"
        @keydown="onSearchKey"
      /><button
        v-if="search"
        type="button"
        :aria-label="t('Clear')"
        @click="search = ''; searchInput?.focus()"
      >
        <DesignIcon
          name="close"
          :size="15"
        />
      </button><kbd
        v-else
        aria-hidden="true"
      >/</kbd>
    </div>
    <nav
      class="sidebar__nav"
      :aria-label="t('Navigation')"
    >
      <section
        v-for="group in groups"
        :key="group.label"
        class="sidebar-group"
        :class="{ 'sidebar-group--primary': !group.label }"
      >
        <button
          v-if="group.label && !compact"
          type="button"
          class="sidebar-group__heading"
          :aria-expanded="groupOpen(group.label)"
          :aria-controls="`sidebar-group-${group.label}`"
          @click="toggleGroup(group.label)"
        >
          <DesignIcon
            :name="sectionIcons[group.label] || 'grid'"
            :size="15"
          /><span>{{ t(group.label) }}</span><DesignIcon
            class="sidebar-group__chevron"
            name="chevdown"
            :size="14"
          />
        </button>
        <div
          v-show="compact || groupOpen(group.label)"
          :id="`sidebar-group-${group.label}`"
          class="sidebar-group__items"
        >
          <SidebarLink
            v-for="item in group.items"
            :key="item.id"
            :to="item.to"
            :label="t(navLabel(item))"
            :icon="item.icon"
            :active="isActive(item)"
            :compact="compact"
            :badge="badgeFor(item.id) || item.badge"
            @navigate="onNavClick($event, item)"
          />
        </div>
      </section>
      <p
        v-if="!groups.length"
        class="sidebar__empty"
      >
        {{ t('No results') }}
      </p>
    </nav>
    <div class="sidebar__footer">
      <button
        type="button"
        class="sidebar__toggle"
        :aria-label="t(compact ? 'Expand sidebar' : 'Collapse sidebar')"
        :title="t(compact ? 'Expand sidebar' : 'Collapse sidebar')"
        @click="emit('toggle')"
      >
        <DesignIcon
          :name="compact ? 'chevright' : 'chevleft'"
          :size="18"
        /><span v-if="!compact">{{ t('Collapse sidebar') }}</span>
      </button>
    </div>
  </aside>
</template>

<style src="@styles/design-sidebar.css" />
