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
const ITEMS: NavItem[] = [
  { type: 'item', id: 'dashboard', label: 'Dashboard', icon: 'dashboard', to: '/' },
  { type: 'item', id: 'orders', label: 'Orders', icon: 'receipt', to: '/orders' },
  { type: 'item', id: 'shifts', label: 'Shifts', icon: 'clock', to: '/shifts-analytics' },
  { type: 'item', id: 'hr-expenses', label: 'Expenses', icon: 'coins', to: '/hr-expenses', anyPermission: EXPENSE_REQUEST_PERMISSIONS },
  { type: 'item', id: 'money-control', label: 'Money Control', icon: 'wallet', to: '/money-control', anyPermission: ['money.control.view'] },
  { type: 'item', id: 'treasury', label: 'Treasury', icon: 'store', to: '/treasury', anyPermission: ['treasury.account.view'] },
  { type: 'item', id: 'products', label: 'Products', icon: 'box', to: '/products' },
  { type: 'item', id: 'categories', label: 'Categories', icon: 'grid', to: '/categories' },
  { type: 'item', id: 'places', label: 'Places & Tables', icon: 'table', to: '/places' },
  { type: 'item', id: 'discounts', label: 'Discounts', icon: 'tag', to: '/discounts' },
  { type: 'item', id: 'secret-word-discounts', label: 'discount_secret_title', icon: 'lock', to: '/discounts/secret-word' },
  { type: 'item', id: 'loyalty', label: 'Loyalty', icon: 'gift', to: '/loyalty' },
  { type: 'item', id: 'cash', label: 'Cashbox Expense Categories', icon: 'register', to: '/cashbox/categories' },
  { type: 'item', id: 'users', label: 'Users', icon: 'users', to: '/users' },
  { type: 'item', id: 'hr-employees', label: 'Employees', icon: 'users', to: '/hr-employees', allowedRoles: ['ADMIN'] },
  { type: 'item', id: 'hr-salaries', label: 'Salaries', icon: 'wallet', to: '/hr-salaries', allowedRoles: ['ADMIN'] },
  { type: 'item', id: 'hr-departments', label: 'Departments', icon: 'building', to: '/hr-departments', allowedRoles: ['ADMIN'] },
  { type: 'item', id: 'compare-periods', label: 'Product comparison', icon: 'exchange', to: '/analytics/compare' },
  { type: 'item', id: 'product-statistics', label: 'Product sales analytics', icon: 'trend', to: '/analytics/product-statistics' },
  { type: 'item', id: 'product-performance', label: 'report_title', icon: 'receipt', to: '/reports/product-performance', allowedRoles: ['ADMIN', 'MANAGER'] },
  { type: 'item', id: 'menu-engineering', label: 'Menu Engineering', icon: 'chart', to: '/analytics/menu-engineering' },
  { type: 'item', id: 'demand-forecast', label: 'Demand Forecast', icon: 'trend', to: '/forecast/tomorrow' },
  { type: 'item', id: 'ai', label: 'AI Assistant', icon: 'ai', to: '/ai-assistant' },
  { type: 'item', id: 'warehouse', label: 'Warehouse operations', icon: 'package', to: '/warehouse', anyPermission: WAREHOUSE_WORKSPACE_PERMISSIONS },
  { type: 'item', id: 'stock-levels', label: 'Stock Levels', icon: 'bars', to: '/stock/levels', anyPermission: ['stock.level.view'] },
  { type: 'item', id: 'stock-purchase-invoices', label: 'Supplier invoices', icon: 'inbox', to: '/stock/purchase-invoices', anyPermission: ['stock.purchase_invoice.view', 'stock.purchase_invoice.receive'] },
  { type: 'item', id: 'stock-suppliers', label: 'Suppliers', icon: 'building', to: '/stock/suppliers', anyPermission: ['stock.supplier.view'] },
  { type: 'item', id: 'stock-purchase-orders', label: 'Purchase Orders', icon: 'receipt', to: '/stock/purchase-orders', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-receiving', label: 'PO receiving', icon: 'inbox', to: '/stock/receiving', anyPermission: ['stock.purchase.view'] },
  { type: 'item', id: 'stock-transfers', label: 'Transfers', icon: 'share', to: '/stock/transfers', anyPermission: ['stock.transfer.view'] },
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
  { type: 'item', id: 'stock-items', label: 'Stock Items', icon: 'box', to: '/stock/items', anyPermission: ['stock.catalog.view'] },
  { type: 'item', id: 'stock-categories', label: 'Stock Categories', icon: 'grid', to: '/stock/categories' },
  { type: 'item', id: 'stock-units', label: 'Units', icon: 'list', to: '/stock/units' },
  { type: 'item', id: 'stock-locations', label: 'Stock Locations', icon: 'building', to: '/stock/locations', anyPermission: ['stock.level.view', 'stock.inventory_control.view'] },
  { type: 'item', id: 'stock-recipes', label: 'Recipes', icon: 'list', to: '/stock/recipes' },
  { type: 'item', id: 'stock-product-links', label: 'Product Stock Links', icon: 'share', to: '/stock/product-links' },
  { type: 'item', id: 'stock-production-orders', label: 'Production Orders', icon: 'gear', to: '/stock/production-orders' },
  { type: 'item', id: 'stock-batches', label: 'Batches', icon: 'package', to: '/stock/batches', anyPermission: ['stock.batch.view'] },
  { type: 'item', id: 'stock-alerts', label: 'Stock Alerts', icon: 'alert', to: '/stock/alerts' },
  { type: 'item', id: 'stock-reservations', label: 'Reservations', icon: 'lock', to: '/stock/reservations' },
  { type: 'item', id: 'stock-transactions', label: 'Stock Transactions', icon: 'clock', to: '/stock/transactions' },
  { type: 'item', id: 'stock-variance-codes', label: 'Variance Codes', icon: 'alert', to: '/stock/variance-codes' },
  { type: 'item', id: 'stock-settings', label: 'Stock Settings', icon: 'gear', to: '/stock/settings' },
  { type: 'item', id: 'app-settings', label: 'App Settings', icon: 'gear', to: '/app-settings' },
  { type: 'item', id: 'roles', label: 'Roles & Permissions', icon: 'lock', to: '/settings/roles' },
  { type: 'item', id: 'notifications', label: 'Notifications', icon: 'bell', to: '/notifications' },
  { type: 'item', id: 'notification-queue', label: 'Notification Queue', icon: 'inbox', to: '/notification-queue' },
  { type: 'item', id: 'notification-settings', label: 'Notification Settings', icon: 'sliders', to: '/notification-settings' },
  { type: 'item', id: 'notification-templates', label: 'Notification Templates', icon: 'copy', to: '/notification-templates' },
  { type: 'item', id: 'notification-types', label: 'Notification Types', icon: 'bell', to: '/notification-types' },
]

const ITEM_BY_ID = new Map(ITEMS.map(item => [item.id, item]))

interface GroupDef { id: string; label: string; icon: string; items: string[] }
interface Layout { pinned: string[]; groups: GroupDef[] }

// The everyday pages sit on top and never hide; everything else lives in a
// handful of task-named groups, and only one group is open at a time.
const ADMIN_LAYOUT: Layout = {
  pinned: ['dashboard', 'orders', 'shifts', 'hr-expenses', 'money-control', 'treasury'],
  groups: [
    { id: 'sales', label: 'nav_group_sales', icon: 'receipt', items: ['products', 'categories', 'places', 'discounts', 'secret-word-discounts', 'loyalty'] },
    { id: 'finance', label: 'Finance', icon: 'wallet', items: ['cash'] },
    { id: 'staff', label: 'Staff', icon: 'users', items: ['users', 'hr-employees', 'hr-salaries', 'hr-departments'] },
    { id: 'reports', label: 'nav_group_reports', icon: 'chart', items: ['compare-periods', 'product-statistics', 'product-performance', 'menu-engineering', 'demand-forecast', 'ai'] },
    { id: 'stock-daily', label: 'nav_group_stock_daily', icon: 'package', items: ['warehouse', 'stock-levels', 'stock-purchase-invoices', 'stock-suppliers', 'stock-purchase-orders', 'stock-receiving', 'stock-transfers', 'stock-counts', 'stock-adjustment-requests', 'stock-adjustments'] },
    { id: 'stock-setup', label: 'nav_group_stock_setup', icon: 'box', items: ['stock-items', 'stock-categories', 'stock-units', 'stock-locations', 'stock-recipes', 'stock-product-links', 'stock-production-orders', 'stock-batches', 'stock-alerts', 'stock-reservations', 'stock-transactions', 'stock-variance-codes', 'stock-settings'] },
    { id: 'settings', label: 'Settings', icon: 'gear', items: ['app-settings', 'roles', 'notifications', 'notification-queue', 'notification-settings', 'notification-templates', 'notification-types'] },
  ],
}

const WAREHOUSE_LAYOUT: Layout = {
  pinned: ['warehouse', 'hr-expenses'],
  groups: [
    { id: 'stock-daily', label: 'nav_group_stock_daily', icon: 'package', items: ['stock-levels', 'stock-purchase-invoices', 'stock-suppliers', 'stock-purchase-orders', 'stock-receiving', 'stock-transfers', 'stock-counts', 'stock-adjustment-requests', 'stock-adjustments'] },
    { id: 'stock-setup', label: 'nav_group_stock_setup', icon: 'box', items: ['stock-items', 'stock-batches'] },
  ],
}

function allowed(item: NavItem | undefined): item is NavItem {
  if (!item)
    return false
  if (isWarehouse.value && item.id === 'warehouse')
    return true

  return (!item.anyPermission?.length || hasAnyPermission(item.anyPermission))
    && (!item.allPermissions?.length || hasAllPermissions(item.allPermissions))
    && (!item.allowedRoles?.length || item.allowedRoles.includes(role.value))
}

const layout = computed(() => isWarehouse.value ? WAREHOUSE_LAYOUT : ADMIN_LAYOUT)
const pinned = computed(() => layout.value.pinned.map(id => ITEM_BY_ID.get(id)).filter(allowed))

interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

const groups = computed<NavGroup[]>(() => layout.value.groups
  .map(group => ({ ...group, items: group.items.map(id => ITEM_BY_ID.get(id)).filter(allowed) }))
  .filter(group => group.items.length))

const visibleItems = computed(() => [...pinned.value, ...groups.value.flatMap(group => group.items)])

const search = ref('')
const searchInput = ref<{ focus: () => void } | null>(null)
const compact = computed(() => !!props.collapsed && !isMobile.value)

function navLabel(item: NavItem): string { return routeLabelForPath(item.to) || item.label }

const activePath = computed(() => visibleItems.value
  .filter(item => route.path === item.to || route.path.startsWith(`${item.to}/`) || (item.to === '/' && route.path === '/'))
  .filter(item => item.to !== '/' || route.path === '/')
  .sort((a, b) => b.to.length - a.to.length)[0]?.to)

function isActive(item: NavItem): boolean { return activePath.value === item.to }

const activeGroupId = computed(() => groups.value.find(group => group.items.some(isActive))?.id ?? null)
const openGroup = ref<string | null>(null)

function groupOpen(id: string) { return openGroup.value === id }
function toggleGroup(id: string) {
  openGroup.value = openGroup.value === id ? null : id
}
async function openFromRail(id: string) {
  openGroup.value = id
  emit('toggle')
}

const searchResults = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query)
    return []

  return [
    ...pinned.value.map(item => ({ item, group: '' })),
    ...groups.value.flatMap(group => group.items.map(item => ({ item, group: group.label }))),
  ].filter(({ item, group }) => t(navLabel(item)).toLocaleLowerCase().includes(query)
    || (group && t(group).toLocaleLowerCase().includes(query)))
    .map(({ item }) => item)
})

// Recently opened pages, so the second visit is one click from the top.
const RECENT_KEY = 'alphapos-nav-recent'
const recentIds = ref<string[]>([])

const recent = computed(() => recentIds.value
  .map(id => ITEM_BY_ID.get(id))
  .filter((item): item is NavItem => allowed(item) && visibleItems.value.includes(item) && !pinned.value.includes(item) && !isActive(item))
  .slice(0, 4))

function rememberActive() {
  const item = visibleItems.value.find(isActive)
  if (!item || pinned.value.includes(item))
    return
  recentIds.value = [item.id, ...recentIds.value.filter(id => id !== item.id)].slice(0, 6)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value)) }
  catch { /* Navigation stays usable without storage. */ }
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault()
    event.stopPropagation()
    search.value = ''
  }
  if (event.key === 'Enter' && searchResults.value.length) {
    event.preventDefault()

    const first = searchResults.value[0]

    search.value = ''
    if (route.path !== first.to)
      router.push(first.to)
    emit('navGo')
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
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null')
    if (Array.isArray(saved) && saved.every(value => typeof value === 'string'))
      recentIds.value = saved
  }
  catch { /* Start with no recent pages. */ }
  openGroup.value = activeGroupId.value
  rememberActive()
  window.addEventListener('keydown', focusSearch)
})
onBeforeUnmount(() => window.removeEventListener('keydown', focusSearch))
watch(() => route.path, () => {
  search.value = ''
  if (activeGroupId.value)
    openGroup.value = activeGroupId.value
  rememberActive()
})

function onNavClick(e: MouseEvent, item: NavItem) {
  // Honor modifier / middle clicks — let the browser open in new tab/window via the anchor's href.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1)
    return
  e.preventDefault()
  search.value = ''
  if (route.fullPath !== item.to)
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
      <template v-if="search.trim() && !compact">
        <div class="sidebar-group__items sidebar-results">
          <SidebarLink
            v-for="item in searchResults"
            :key="item.id"
            :to="item.to"
            :label="t(navLabel(item))"
            :icon="item.icon"
            :active="isActive(item)"
            :compact="false"
            :badge="badgeFor(item.id) || item.badge"
            @navigate="onNavClick($event, item)"
          />
        </div>
        <p
          v-if="!searchResults.length"
          class="sidebar__empty"
        >
          {{ t('No results') }}
        </p>
      </template>
      <template v-else>
        <section class="sidebar-group sidebar-group--primary">
          <div class="sidebar-group__items">
            <SidebarLink
              v-for="item in pinned"
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
        <section
          v-if="recent.length && !compact"
          class="sidebar-group sidebar-recent"
        >
          <p class="sidebar-recent__title">
            {{ t('nav_recent') }}
          </p>
          <div class="sidebar-group__items">
            <SidebarLink
              v-for="item in recent"
              :key="`recent-${item.id}`"
              :to="item.to"
              :label="t(navLabel(item))"
              :icon="item.icon"
              :active="false"
              :compact="false"
              data-recent
              @navigate="onNavClick($event, item)"
            />
          </div>
        </section>
        <section
          v-for="group in groups"
          :key="group.id"
          class="sidebar-group"
          :class="{ 'has-active': group.id === activeGroupId }"
        >
          <button
            v-if="compact"
            type="button"
            class="sidebar-group__rail"
            :class="{ 'is-active': group.id === activeGroupId }"
            :title="t(group.label)"
            :aria-label="t(group.label)"
            @click="openFromRail(group.id)"
          >
            <DesignIcon
              :name="group.icon"
              :size="19"
            />
          </button>
          <template v-else>
            <button
              type="button"
              class="sidebar-group__heading"
              :aria-expanded="groupOpen(group.id)"
              :aria-controls="`sidebar-group-${group.id}`"
              @click="toggleGroup(group.id)"
            >
              <DesignIcon
                :name="group.icon"
                :size="15"
              /><span>{{ t(group.label) }}</span><small class="sidebar-group__count">{{ group.items.length }}</small><DesignIcon
                class="sidebar-group__chevron"
                name="chevdown"
                :size="14"
              />
            </button>
            <div
              v-show="groupOpen(group.id)"
              :id="`sidebar-group-${group.id}`"
              class="sidebar-group__items"
            >
              <SidebarLink
                v-for="item in group.items"
                :key="item.id"
                :to="item.to"
                :label="t(navLabel(item))"
                :icon="item.icon"
                :active="isActive(item)"
                :compact="false"
                :badge="badgeFor(item.id) || item.badge"
                @navigate="onNavClick($event, item)"
              />
            </div>
          </template>
        </section>
      </template>
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
