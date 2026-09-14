<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   SETTINGS — Roles & Permissions
   Editor matrix mapping roles -> permission catalog. ADMIN row
   is wildcard-locked. All other roles are toggleable via the
   inline switch grid + edit modal w/ permissions tree picker.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import axios from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import Checkbox from '@/components/design/Checkbox.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import SwitchEl from '@/components/design/Switch.vue'

const { t, te } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

interface PermissionDef { key: string; label: string; group: string }
interface RoleRow { name: string; permissions: string[] }

// ============================================================
// Role / group constants
// ============================================================
const ROLES = ['ADMIN', 'MANAGER', 'WAREHOUSE', 'CASHIER', 'WAITER', 'CHEF', 'USER'] as const
type RoleName = typeof ROLES[number]

const FALLBACK_GROUPS = [
  'Orders',
  'Menu',
  'Stock',
  'Warehouse',
  'Warehouse approvals',
  'Money control',
  'Operational audit',
  'Operational audit approvals',
  'Expense requests',
  'Expense request approvals',
  'HR',
  'Reports',
  'Administration',
]

// The roles API currently exposes PATCH only, so the frontend must carry the
// intended reset template. Backend creation defaults must be kept in parity too.
const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'order.create', 'order.update', 'order.pay', 'order.cancel', 'order.stats',
    'discount.apply',
    'product.create', 'product.update', 'product.delete',
    'category.create', 'category.update', 'category.delete',
    'stock.view', 'stock.manage', 'stock.catalog.view',
    'hr.view',
    'reports.view', 'inkassa.manage',
    'money.control.view', 'money.control.reconcile',
    'stock.inventory_control.view', 'stock.supplier.view',
    'stock.supplier.balance.view', 'stock.supplier.pay',
    'stock.purchase.view', 'expense.category.view',
    'expense.category.manage', 'expense.request.create',
    'expense.request.view_own', 'expense.request.view_all',
    'expense.request.approve', 'expense.request.pay',
    'treasury.account.view', 'treasury.transfer',
  ],
  WAREHOUSE: [
    'stock.catalog.view', 'stock.level.view', 'stock.batch.view',
    'stock.supplier.view', 'stock.supplier.balance.view', 'stock.purchase.view',
    'stock.receiving.create', 'stock.receiving.update_draft', 'stock.receiving.complete',
    'stock.transfer.view', 'stock.transfer.create',
    'stock.count.view', 'stock.count.create', 'stock.count.record',
    'stock.adjustment.request',
  ],
  CASHIER: ['order.create', 'order.update', 'order.pay', 'discount.apply'],
  WAITER: ['order.create', 'order.update'],
  CHEF: [],
  USER: [],
}

const GROUP_TONE: Record<string, 'primary' | 'info' | 'success' | 'warning' | 'error' | 'neutral'> = {
  Orders: 'primary',
  Menu: 'info',
  Stock: 'success',
  Warehouse: 'success',
  'Warehouse approvals': 'warning',
  'Money control': 'primary',
  'Operational audit': 'info',
  'Operational audit approvals': 'warning',
  'Expense requests': 'info',
  'Expense request approvals': 'warning',
  HR: 'warning',
  Reports: 'info',
  Administration: 'error',
}

const ROLE_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  ADMIN: 'error',
  MANAGER: 'primary',
  WAREHOUSE: 'success',
  CASHIER: 'warning',
  WAITER: 'info',
  CHEF: 'neutral',
  USER: 'neutral',
}

// ============================================================
// State
// ============================================================
const permissions = ref<PermissionDef[]>([])
const roles = ref<RoleRow[]>([])
const loading = ref(false)
const savingRole = ref<string | null>(null)

// Client-side filters
const search = ref('')
const groupFilter = ref('')
const roleFilter = ref<RoleName>('MANAGER')

// Edit modal
const dialogOpen = ref(false)
const dialogLoading = ref(false)
const editingRole = ref<RoleName | null>(null)
const draftPerms = ref<Set<string>>(new Set())
const draftSearch = ref('')

// Reset confirm modal
const resetDialog = ref(false)
const resetTarget = ref<RoleName | null>(null)
const resetBusy = ref(false)

// ============================================================
// Load
// ============================================================
async function loadAll() {
  loading.value = true
  try {
    const [pRes, rRes] = await Promise.all([
      axios.get('/permissions'),
      axios.get('/roles'),
    ])
    const pd = pRes.data?.data ?? pRes.data
    const rd = rRes.data?.data ?? rRes.data

    permissions.value = pd?.permissions ?? []
    roles.value = rd?.roles ?? []

    // Ensure every role in the spec is represented in the matrix even if BE
    // hasn't seeded them yet — guarantees the toggle switches render.
    for (const name of ROLES) {
      if (!roles.value.find(r => r.name === name))
        roles.value.push({ name, permissions: [] })
    }
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('perm_load_failed'), 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadAll)

// ============================================================
// Helpers
// ============================================================
function roleOf(name: string): RoleRow | undefined {
  return roles.value.find(r => r.name === name)
}

function isWildcard(name: string): boolean {
  return roleOf(name)?.permissions?.includes('*') ?? false
}

function hasPerm(name: string, key: string): boolean {
  const r = roleOf(name)
  if (!r) return false
  if (r.permissions.includes('*')) return true
  return r.permissions.includes(key)
}

function labelOf(p: PermissionDef): string {
  const i18nKey = `perm_label_${p.key.replace(/\./g, '_')}`

  return te(i18nKey) ? t(i18nKey) : (p.label || p.key)
}

function groupLabel(group: string): string {
  const i18nKey = `perm_group_${group.replace(/[^\p{L}\p{N}]+/gu, '_')}`

  return te(i18nKey) ? t(i18nKey) : group
}

// ============================================================
// Catalog views (filtered)
// ============================================================
const filteredPermissions = computed<PermissionDef[]>(() => {
  const q = search.value.trim().toLowerCase()
  return permissions.value.filter((p) => {
    if (groupFilter.value && p.group !== groupFilter.value)
      return false
    if (!q) return true
    const lbl = labelOf(p).toLowerCase()
    const key = p.key.toLowerCase()
    return lbl.includes(q) || key.includes(q)
  })
})

// Group counts (used in chips / KPI)
const grantedCount = computed(() => {
  const r = roleOf(roleFilter.value)
  if (!r) return 0
  if (r.permissions.includes('*')) return permissions.value.length
  return r.permissions.length
})

const totalCount = computed(() => permissions.value.length)
const groups = computed(() => {
  const fromBackend = Array.from(new Set(permissions.value.map(permission => permission.group).filter(Boolean)))

  return fromBackend.length ? fromBackend : FALLBACK_GROUPS
})

// ============================================================
// Inline switch toggles (row-level)
// ============================================================
async function toggleCell(name: string, key: string) {
  if (name === 'ADMIN') {
    notify(t('perm_admin_locked'), 'warning')
    return
  }
  const r = roleOf(name)
  if (!r) return
  if (r.permissions.includes('*')) {
    notify(t('perm_wildcard_hint'), 'warning')
    return
  }
  const next = new Set(r.permissions)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  await patchRole(name, Array.from(next))
}

async function patchRole(name: string, perms: string[]) {
  savingRole.value = name
  try {
    const res = await axios.patch(`/roles/${name}`, { permissions: perms })
    const d = res.data?.data ?? res.data
    const target = roleOf(name)
    if (target)
      target.permissions = d?.permissions ?? perms
    notify(t('perm_saved'))
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('perm_save_failed'), 'error')
  }
  finally {
    savingRole.value = null
  }
}

// ============================================================
// Group bulk toggle (client-merge then PATCH)
// ============================================================
async function toggleGroup(group: string, on: boolean) {
  const name = roleFilter.value
  if (name === 'ADMIN') {
    notify(t('perm_admin_locked'), 'warning')
    return
  }
  const r = roleOf(name)
  if (!r || r.permissions.includes('*')) {
    notify(t('perm_wildcard_hint'), 'warning')
    return
  }
  const keys = permissions.value.filter(p => p.group === group).map(p => p.key)
  const next = new Set(r.permissions)
  if (on) keys.forEach(k => next.add(k))
  else keys.forEach(k => next.delete(k))
  await patchRole(name, Array.from(next))
}

function groupAllOn(group: string): boolean {
  const r = roleOf(roleFilter.value)
  if (!r) return false
  if (r.permissions.includes('*')) return true
  const keys = permissions.value.filter(p => p.group === group).map(p => p.key)
  return keys.length > 0 && keys.every(k => r.permissions.includes(k))
}

// ============================================================
// Edit modal — permissions tree picker
// ============================================================
function openEdit(name: RoleName) {
  editingRole.value = name
  const r = roleOf(name)
  draftPerms.value = new Set(r?.permissions ?? [])
  draftSearch.value = ''
  dialogOpen.value = true
}

function closeDialog() {
  if (dialogLoading.value) return
  dialogOpen.value = false
  editingRole.value = null
}

const draftIsWildcard = computed(() => draftPerms.value.has('*'))

function toggleDraft(key: string) {
  if (editingRole.value === 'ADMIN') return
  if (draftIsWildcard.value && key !== '*') return
  const next = new Set(draftPerms.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  draftPerms.value = next
}

function toggleDraftWildcard() {
  const next = new Set(draftPerms.value)
  if (next.has('*'))
    next.delete('*')
  else
    next.add('*')
  draftPerms.value = next
}

function toggleDraftGroup(group: string, on: boolean) {
  if (draftIsWildcard.value) return
  const keys = permissions.value.filter(p => p.group === group).map(p => p.key)
  const next = new Set(draftPerms.value)
  if (on) keys.forEach(k => next.add(k))
  else keys.forEach(k => next.delete(k))
  draftPerms.value = next
}

function draftGroupAllOn(group: string): boolean {
  if (draftIsWildcard.value) return true
  const keys = permissions.value.filter(p => p.group === group).map(p => p.key)
  return keys.length > 0 && keys.every(k => draftPerms.value.has(k))
}

// Tree filtered for the modal — independent search input.
const draftFilteredByGroup = computed<Record<string, PermissionDef[]>>(() => {
  const out: Record<string, PermissionDef[]> = {}
  const q = draftSearch.value.trim().toLowerCase()
  for (const p of permissions.value) {
    if (q) {
      const lbl = labelOf(p).toLowerCase()
      const key = p.key.toLowerCase()
      if (!lbl.includes(q) && !key.includes(q)) continue
    }
    const g = p.group || 'Other'
    if (!out[g]) out[g] = []
    out[g].push(p)
  }
  return out
})

// Compare original vs draft to surface "unsaved changes" badge.
const isDirty = computed(() => {
  const r = editingRole.value ? roleOf(editingRole.value) : null
  if (!r) return false
  const orig = new Set(r.permissions)
  if (orig.size !== draftPerms.value.size) return true
  for (const k of orig) {
    if (!draftPerms.value.has(k)) return true
  }
  return false
})

async function saveDraft() {
  if (!editingRole.value) return
  // Validate against catalog — flag unknown keys client-side before PATCH.
  const known = new Set(permissions.value.map(p => p.key))
  const unknown = Array.from(draftPerms.value).filter(k => k !== '*' && !known.has(k))
  if (unknown.length > 0)
    notify(`${t('perm_unknown_keys')}: ${unknown.join(', ')}`, 'warning')

  dialogLoading.value = true
  try {
    await patchRole(editingRole.value, Array.from(draftPerms.value))
    dialogOpen.value = false
    editingRole.value = null
  }
  finally {
    dialogLoading.value = false
  }
}

// ============================================================
// Reset confirm
// ============================================================
function confirmReset(name: RoleName) {
  resetTarget.value = name
  resetDialog.value = true
}

async function doReset() {
  if (!resetTarget.value) return
  resetBusy.value = true
  try {
    const defaults = DEFAULT_ROLE_PERMISSIONS[resetTarget.value] ?? []
    await patchRole(resetTarget.value, [...defaults])
    resetDialog.value = false
    resetTarget.value = null
  }
  finally {
    resetBusy.value = false
  }
}

function closeReset() {
  if (resetBusy.value) return
  resetDialog.value = false
  resetTarget.value = null
}

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('perm_search'), val: search.value, clear: () => { search.value = '' } })
  if (groupFilter.value)
    out.push({ k: 'g', label: t('perm_group'), val: groupLabel(groupFilter.value), clear: () => { groupFilter.value = '' } })
  if (roleFilter.value && roleFilter.value !== 'MANAGER')
    out.push({ k: 'r', label: t('perm_role'), val: t(`role_${roleFilter.value}`), clear: () => { roleFilter.value = 'MANAGER' } })
  return out
})

function clearAllFilters() {
  search.value = ''
  groupFilter.value = ''
  roleFilter.value = 'MANAGER'
}

// ============================================================
// Select option sources
// ============================================================
const groupOptions = computed(() => groups.value.map(g => ({ value: g, label: groupLabel(g) })))
const roleOptions = computed(() => ROLES.map(r => ({ value: r, label: t(`role_${r}`) })))

// ============================================================
// DataTable column defs
// ============================================================
const columns: DataTableColumn<PermissionDef>[] = [
  { key: 'group', label: t('perm_col_group'), sortable: true, width: 160 },
  { key: 'key', label: t('perm_col_key'), sortable: true, width: 220 },
  { key: 'label', label: t('perm_col_label'), sortable: true },
  { key: 'ADMIN', label: t('role_ADMIN'), align: 'center', width: 90 },
  { key: 'MANAGER', label: t('role_MANAGER'), align: 'center', width: 110 },
  { key: 'WAREHOUSE', label: t('role_WAREHOUSE'), align: 'center', width: 120 },
  { key: 'CASHIER', label: t('role_CASHIER'), align: 'center', width: 100 },
  { key: 'WAITER', label: t('role_WAITER'), align: 'center', width: 100 },
  { key: 'USER', label: t('role_USER'), align: 'center', width: 100 },
]

// ESC closes modals.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (resetDialog.value) {
    closeReset()
    e.preventDefault()
    return
  }
  if (dialogOpen.value) {
    closeDialog()
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('perm_page_title')"
      :subtitle="t('perm_page_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          @click="loadAll"
        >
          {{ t('Refresh') }}
        </Button>
        <Button
          variant="primary"
          icon="edit"
          @click="openEdit(roleFilter)"
        >
          {{ t('perm_field_role') }}: {{ t(`role_${roleFilter}`) }}
        </Button>
      </template>
    </PageHeader>

    <!-- Editor pane summary -->
    <Card style="margin-bottom: var(--sp-5);">
      <div
        class="toolbar"
        style="gap: var(--sp-4); flex-wrap: wrap; align-items: center;"
      >
        <Badge :tone="ROLE_TONE[roleFilter] || 'neutral'">
          {{ t(`role_${roleFilter}`) }}
        </Badge>
        <div>
          <div style="font-weight: 600; font-size: 14px;">
            {{ t('perm_field_permissions') }}
          </div>
          <div
            class="num"
            style="font-size: 13px; color: var(--text-secondary);"
          >
            <template v-if="isWildcard(roleFilter)">
              {{ t('perm_wildcard_hint') }}
            </template>
            <template v-else>
              {{ grantedCount }} / {{ totalCount }}
            </template>
          </div>
        </div>
        <div style="flex: 1;" />
        <Button
          v-if="roleFilter !== 'ADMIN'"
          variant="ghost"
          icon="retry"
          @click="confirmReset(roleFilter)"
        >
          {{ t('perm_reset_defaults') }}
        </Button>
        <Button
          variant="primary"
          icon="edit"
          @click="openEdit(roleFilter)"
        >
          {{ t('perm_save') }}
        </Button>
      </div>
    </Card>

    <!-- Toolbar + matrix table -->
    <Card>
      <WorkspaceToolbar class="toolbar">
        <!-- Search -->
        <div style="flex:1;max-width:300px;">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('perm_search')"
          />
        </div>

        <!-- Group -->
        <div style="width:200px;">
          <Select
            v-model="groupFilter"
            icon="filter"
            :placeholder="t('perm_group')"
            :options="groupOptions"
          />
        </div>

        <!-- Role (editor pane switch) -->
        <div style="width:200px;">
          <Select
            v-model="roleFilter"
            icon="lock"
            :placeholder="t('perm_role')"
            :options="roleOptions"
          />
        </div>
      </WorkspaceToolbar>

      <!-- Filter chips -->
      <div
        v-if="activeFilters.length > 0"
        class="toolbar"
        style="padding-top:0;"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size:13px;margin-right:2px;"
          >{{ t('Filters') }}:</span>
          <span
            v-for="f in activeFilters"
            :key="f.k"
            class="chip"
          >
            <span>{{ f.label }}: <b>{{ f.val }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="f.clear()"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <button
            class="chip--clear"
            @click="clearAllFilters"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- Group quick-toggle bar (per-group select-all / clear-all for the
           currently-edited role). Inline above the matrix. -->
      <div
        v-if="!loading && permissions.length > 0"
        class="toolbar"
        style="padding-top: var(--sp-3); gap: var(--sp-2); flex-wrap: wrap;"
      >
        <span
          class="tertiary"
          style="font-size:13px;margin-right:4px;"
        >{{ t('perm_select_all_group') }}:</span>
        <button
          v-for="g in groups"
          :key="g"
          class="chip"
          :disabled="roleFilter === 'ADMIN' || isWildcard(roleFilter)"
          :style="{
            opacity: (roleFilter === 'ADMIN' || isWildcard(roleFilter)) ? 0.5 : 1,
            cursor: (roleFilter === 'ADMIN' || isWildcard(roleFilter)) ? 'not-allowed' : 'pointer',
          }"
          @click="toggleGroup(g, !groupAllOn(g))"
        >
          <DesignIcon
            :name="groupAllOn(g) ? 'checkcircle' : 'plus'"
            :size="13"
          />
          <span>{{ groupLabel(g) }}</span>
        </button>
      </div>

      <!-- Permission matrix table -->
      <DataTable
        :columns="columns"
        :rows="filteredPermissions"
        row-key="key"
        :loading="loading"
        :initial-sort="{ key: 'group', dir: 'asc' }"
        :empty-title="t('No results')"
        :empty-sub="t('Nothing matches your filters.')"
        empty-icon="lock"
      >
        <!-- Group cell -->
        <template #cell.group="{ row }">
          <Badge :tone="GROUP_TONE[row.group] || 'neutral'">
            {{ groupLabel(row.group) }}
          </Badge>
        </template>

        <!-- Key cell (mono) -->
        <template #cell.key="{ row }">
          <span class="mono cell-muted">{{ row.key }}</span>
        </template>

        <!-- Label cell -->
        <template #cell.label="{ row }">
          <span class="cell-strong">{{ labelOf(row) }}</span>
        </template>

        <!-- Role switch cells -->
        <template #cell.ADMIN="{ row }">
          <div
            class="row"
            style="justify-content:center;"
            :title="t('perm_admin_locked')"
          >
            <SwitchEl
              :model-value="hasPerm('ADMIN', row.key)"
              disabled
            />
          </div>
        </template>

        <template #cell.MANAGER="{ row }">
          <div
            class="row"
            style="justify-content:center;"
          >
            <SwitchEl
              :model-value="hasPerm('MANAGER', row.key)"
              :disabled="savingRole === 'MANAGER' || isWildcard('MANAGER')"
              @update:model-value="toggleCell('MANAGER', row.key)"
            />
          </div>
        </template>

        <template #cell.WAREHOUSE="{ row }">
          <div
            class="row"
            style="justify-content:center;"
          >
            <SwitchEl
              :model-value="hasPerm('WAREHOUSE', row.key)"
              :disabled="savingRole === 'WAREHOUSE' || isWildcard('WAREHOUSE')"
              @update:model-value="toggleCell('WAREHOUSE', row.key)"
            />
          </div>
        </template>

        <template #cell.CASHIER="{ row }">
          <div
            class="row"
            style="justify-content:center;"
          >
            <SwitchEl
              :model-value="hasPerm('CASHIER', row.key)"
              :disabled="savingRole === 'CASHIER' || isWildcard('CASHIER')"
              @update:model-value="toggleCell('CASHIER', row.key)"
            />
          </div>
        </template>

        <template #cell.WAITER="{ row }">
          <div
            class="row"
            style="justify-content:center;"
          >
            <SwitchEl
              :model-value="hasPerm('WAITER', row.key)"
              :disabled="savingRole === 'WAITER' || isWildcard('WAITER')"
              @update:model-value="toggleCell('WAITER', row.key)"
            />
          </div>
        </template>

        <template #cell.USER="{ row }">
          <div
            class="row"
            style="justify-content:center;"
          >
            <SwitchEl
              :model-value="hasPerm('USER', row.key)"
              :disabled="savingRole === 'USER' || isWildcard('USER')"
              @update:model-value="toggleCell('USER', row.key)"
            />
          </div>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="edit"
            tone="primary"
            :title="t('perm_field_role')"
            @click="openEdit(roleFilter)"
          />
          <IconAction
            icon="retry"
            tone="warning"
            :title="t('perm_reset_defaults')"
            :disabled="roleFilter === 'ADMIN'"
            @click="confirmReset(roleFilter)"
          />
        </template>

        <!-- Empty state -->
        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="lock"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('perm_empty_role') }}
            </div>
            <div style="margin-top:12px;">
              <Button
                variant="secondary"
                @click="clearAllFilters"
              >
                {{ t('Clear all') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Edit modal — permissions tree picker -->
    <Modal
      :open="dialogOpen"
      :title="editingRole ? `${t('perm_field_role')}: ${t(`role_${editingRole}`)}` : t('perm_field_role')"
      :subtitle="t('perm_field_permissions')"
      :width="760"
      @close="closeDialog"
    >
      <div
        v-if="editingRole"
        class="form-grid"
      >
        <!-- Role (read-only) -->
        <Field
          :label="t('perm_field_role')"
          class="span-2"
          :hint="t('Role name is the identifier; not editable')"
        >
          <Input
            class="is-disabled"
            icon="lock"
            :model-value="t(`role_${editingRole}`)"
            disabled
          />
        </Field>

        <!-- Dirty indicator + wildcard control -->
        <Field
          :label="t('perm_dirty')"
          class="span-2"
        >
          <div
            class="row"
            style="gap: var(--sp-3); align-items: center; flex-wrap: wrap;"
          >
            <Badge :tone="isDirty ? 'warning' : 'neutral'">
              <DesignIcon
                :name="isDirty ? 'alert' : 'check'"
                :size="13"
              />
              {{ isDirty ? t('perm_dirty') : t('No changes') }}
            </Badge>

            <div style="flex: 1;" />

            <div
              class="row"
              style="gap: 8px; align-items: center;"
              :title="t('perm_wildcard_hint')"
            >
              <SwitchEl
                :model-value="draftIsWildcard"
                :disabled="editingRole !== 'ADMIN'"
                @update:model-value="toggleDraftWildcard"
              />
              <span style="font-size: 13px; color: var(--text-secondary);">
                {{ t('perm_wildcard_hint') }}
              </span>
            </div>
          </div>
        </Field>

        <!-- Search inside picker -->
        <Field
          :label="t('perm_search')"
          class="span-2"
        >
          <Input
            v-model="draftSearch"
            icon="search"
            :placeholder="t('perm_search')"
          />
        </Field>

        <!-- Tree -->
        <div
          class="span-2"
          style="max-height: 380px; overflow: auto; border: 1px solid var(--border); border-radius: var(--r-md);"
        >
          <template
            v-for="(perms, group) in draftFilteredByGroup"
            :key="group"
          >
            <div
              class="row"
              style="
                padding: var(--sp-2) var(--sp-3);
                background: var(--surface-inset);
                border-bottom: 1px solid var(--border);
                gap: var(--sp-2);
                align-items: center;
              "
            >
              <Badge :tone="GROUP_TONE[group] || 'neutral'">
                {{ groupLabel(String(group)) }}
              </Badge>
              <span
                class="num"
                style="font-size: 12px; color: var(--text-secondary);"
              >
                {{ perms.filter(p => draftPerms.has(p.key)).length }} / {{ perms.length }}
              </span>
              <div style="flex: 1;" />
              <button
                class="chip"
                :disabled="draftIsWildcard"
                :style="{ opacity: draftIsWildcard ? 0.5 : 1 }"
                @click="toggleDraftGroup(group, true)"
              >
                <DesignIcon
                  name="check"
                  :size="12"
                />
                <span>{{ t('perm_select_all_group') }}</span>
              </button>
              <button
                class="chip"
                :disabled="draftIsWildcard"
                :style="{ opacity: draftIsWildcard ? 0.5 : 1 }"
                @click="toggleDraftGroup(group, false)"
              >
                <DesignIcon
                  name="close"
                  :size="12"
                />
                <span>{{ t('perm_clear_all_group') }}</span>
              </button>
            </div>

            <div
              v-for="p in perms"
              :key="p.key"
              class="row"
              style="
                padding: var(--sp-2) var(--sp-3);
                gap: var(--sp-3);
                align-items: center;
                border-bottom: 1px solid var(--border-soft);
                cursor: pointer;
              "
              role="button"
              :tabindex="draftIsWildcard ? -1 : 0"
              :aria-pressed="draftPerms.has(p.key) || draftIsWildcard"
              @click="toggleDraft(p.key)"
              @keydown.enter.self="toggleDraft(p.key)"
              @keydown.space.self.prevent="toggleDraft(p.key)"
            >
              <Checkbox
                :model-value="draftPerms.has(p.key) || draftIsWildcard"
                :disabled="draftIsWildcard"
                :aria-label="labelOf(p)"
                @update:model-value="toggleDraft(p.key)"
              />
              <div style="flex: 1; min-width: 0;">
                <div
                  class="cell-strong"
                  style="font-size: 13px;"
                >
                  {{ labelOf(p) }}
                </div>
                <div
                  class="mono"
                  style="font-size: 11px; color: var(--text-tertiary);"
                >
                  {{ p.key }}
                </div>
              </div>
              <SwitchEl
                :model-value="draftPerms.has(p.key) || draftIsWildcard"
                :disabled="draftIsWildcard"
                @update:model-value="toggleDraft(p.key)"
              />
            </div>
          </template>

          <div
            v-if="Object.keys(draftFilteredByGroup).length === 0"
            class="statefill"
          >
            <div class="statefill__icon">
              <DesignIcon
                name="lock"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('perm_empty_role') }}
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="dialogLoading"
          :disabled="dialogLoading || !isDirty"
          @click="saveDraft"
        >
          {{ t('perm_save') }}
        </Button>
      </template>
    </Modal>

    <!-- Reset confirm modal -->
    <Modal
      :open="resetDialog"
      :title="t('perm_reset_defaults')"
      :subtitle="t('perm_reset_confirm')"
      :width="440"
      @close="closeReset"
    >
      <div
        v-if="resetTarget"
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-warning"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ t(`role_${resetTarget}`) }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t('perm_reset_confirm') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="retry"
          :loading="resetBusy"
          :disabled="resetBusy"
          @click="doReset"
        >
          {{ t('perm_reset_defaults') }}
        </Button>
      </template>
    </Modal>

    <!-- Toast -->
    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </WorkspacePage>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
