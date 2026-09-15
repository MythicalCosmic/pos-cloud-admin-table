<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
import type { ExpenseCategory, ExpenseCategoryPayload, ExpenseCostBehavior, ExpenseSource } from '@/types/expenseControl'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'
import { fmtNum } from '@/components/design/utils/format'
import {
  createExpenseCategory,
  deactivateExpenseCategory,
  listAllExpenseCategories,
  updateExpenseCategory,
} from '@/services/expenseControlApi'
import { useUserAccess } from '@/composables/useUserAccess'
import {
  EXPENSE_COST_BEHAVIORS,
  EXPENSE_REPORTING_GROUPS,
  expenseCategoryExpenseCount,
  expenseCategoryTree,
  expenseCostBehavior,
  isSelectableExpenseCategory,
} from '@/utils/expenseCategories'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency } = useFormatters()
const { hasPermission } = useUserAccess()

const canView = computed(() => hasPermission('expense.category.view'))
const canManage = computed(() => hasPermission('expense.category.manage'))

const EXPANDED_STORAGE_KEY = 'alphapos-expense-category-expanded'
const SOURCE_OPTIONS: ExpenseSource[] = ['DRAWER', 'SAFE', 'BANK']

const items = ref<ExpenseCategory[]>([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
const includeInactive = ref(false)
const costBehaviorFilter = ref<ExpenseCostBehavior | ''>('')
const editing = ref<ExpenseCategory | null>(null)
const expanded = ref<Set<number>>(readExpanded())

function readExpanded(): Set<number> {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) || '[]')

    return new Set(Array.isArray(saved) ? saved.map(Number).filter(Number.isInteger) : [])
  }
  catch {
    return new Set()
  }
}

function writeExpanded(value: Set<number>) {
  expanded.value = value
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...value]))
  }
  catch {
    // The tree still works without a persisted preference.
  }
}

const reportingGroupOptions = computed(() => EXPENSE_REPORTING_GROUPS.map(value => ({
  value,
  label: t(`expense_reporting_group_${value}`),
})))

const costBehaviorOptions = computed(() => EXPENSE_COST_BEHAVIORS.map(value => ({
  value,
  label: t(`expense_cost_behavior_${value}`),
})))

// The Select placeholder is the "all" choice, so it is not repeated as an option.
const costBehaviorFilterOptions = computed(() => costBehaviorOptions.value)

const tree = computed(() => expenseCategoryTree(items.value))
const filtersActive = computed(() => !!search.value.trim() || !!costBehaviorFilter.value)

const summary = computed(() => ({
  topLevel: tree.value.length,
  subcategories: tree.value.reduce((sum, group) => sum + group.children.length, 0),
  selectable: items.value.filter(isSelectableExpenseCategory).length,
  expenses: tree.value.reduce((sum, group) => sum + expenseCategoryExpenseCount(group.category, group.children.length > 0), 0),
}))

type RowKind = 'group' | 'root' | 'child'

interface TreeRow {
  category: ExpenseCategory
  kind: RowKind
  childCount: number
  childIds: string
  expanded: boolean
}

function rowId(category: ExpenseCategory) {
  return `expense-category-${category.id}`
}

const visibleRows = computed<TreeRow[]>(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  const behavior = costBehaviorFilter.value
  const textMatch = (category: ExpenseCategory) => !needle || `${category.name} ${category.code} ${category.description ?? ''}`.toLocaleLowerCase().includes(needle)
  const behaviorMatch = (category: ExpenseCategory) => !behavior || expenseCostBehavior(category) === behavior

  return tree.value.flatMap(({ category, children }) => {
    const parentText = textMatch(category)
    const shownChildren = children.filter(child => behaviorMatch(child) && (parentText || textMatch(child)))
    if (!(parentText && behaviorMatch(category)) && !shownChildren.length)
      return []

    const isOpen = filtersActive.value || expanded.value.has(category.id)

    const parentRow: TreeRow = {
      category,
      kind: children.length ? 'group' : 'root',
      childCount: children.length,
      childIds: shownChildren.map(rowId).join(' '),
      expanded: isOpen,
    }

    if (!isOpen)
      return [parentRow]

    return [parentRow, ...shownChildren.map(child => ({
      category: child,
      kind: 'child' as const,
      childCount: 0,
      childIds: '',
      expanded: false,
    }))]
  })
})

const allExpanded = computed(() => tree.value.every(group => !group.children.length || expanded.value.has(group.category.id)))

function toggleGroup(id: number) {
  const next = new Set(expanded.value)

  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  writeExpanded(next)
}

function toggleAll() {
  writeExpanded(allExpanded.value
    ? new Set()
    : new Set(tree.value.filter(group => group.children.length).map(group => group.category.id)))
}

function clearFilters() {
  search.value = ''
  costBehaviorFilter.value = ''
}

const parentOptions = computed(() => tree.value
  .filter(({ category }) => category.is_active !== false && !category.parent_id && category.id !== editing.value?.id)
  .map(({ category }) => ({ value: String(category.id), label: category.name })))

const parentLocked = computed(() => !!editing.value && Number(editing.value.child_count ?? 0) > 0)
const deactivationLocked = computed(() => Number(editing.value?.active_child_count ?? 0) > 0)

function apiError(error: any): string {
  const body = error?.response?.data

  const fieldErrors = (body?.errors && typeof body.errors === 'object')
    ? Object.values(body.errors).flat().filter(Boolean).join(' ')
    : ''

  return String(fieldErrors || body?.message || body?.detail || t('Error'))
}

async function load() {
  if (!canView.value)
    return
  loading.value = true
  loadError.value = ''
  try {
    items.value = await listAllExpenseCategories({
      include_inactive: (canManage.value && includeInactive.value) ? true : undefined,
    })
  }
  catch (error: any) {
    loadError.value = apiError(error)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)
watch(includeInactive, load)

interface CategoryForm {
  code: string
  name: string
  description: string
  budget_limit: number | null
  reporting_group: string
  sort_order: string
  allowed_sources: ExpenseSource[]
  requires_receipt: boolean
  requires_description: boolean
  is_active: boolean
  parent_id: string
  cost_behavior: ExpenseCostBehavior
}

function blankForm(parent?: ExpenseCategory): CategoryForm {
  return {
    code: '',
    name: '',
    description: '',
    budget_limit: null,
    reporting_group: parent?.reporting_group || 'REVIEW',
    sort_order: '0',
    allowed_sources: parent?.allowed_sources?.length ? [...parent.allowed_sources] : ['DRAWER', 'SAFE', 'BANK'],
    requires_receipt: false,
    requires_description: false,
    is_active: true,
    parent_id: parent ? String(parent.id) : '',
    cost_behavior: parent ? expenseCostBehavior(parent) : 'UNCLASSIFIED',
  }
}

const formOpen = ref(false)
const saving = ref(false)
const form = ref<CategoryForm>(blankForm())
const errors = ref<Record<string, string>>({})

function openCategoryForm(parent?: ExpenseCategory) {
  editing.value = null
  form.value = blankForm(parent)
  errors.value = {}
  formOpen.value = true
}

function openCreate() {
  openCategoryForm()
}

function openCreateSubcategory(parent: ExpenseCategory) {
  openCategoryForm(parent)
}

function openEdit(row: ExpenseCategory) {
  editing.value = row
  form.value = {
    code: row.code ?? '',
    name: row.name ?? '',
    description: row.description ?? '',
    budget_limit: (row.budget_limit == null || row.budget_limit === '') ? null : Number(row.budget_limit),
    reporting_group: row.reporting_group || 'REVIEW',
    sort_order: String(row.sort_order ?? 0),
    allowed_sources: [...(row.allowed_sources ?? [])],
    requires_receipt: !!row.requires_receipt,
    requires_description: !!row.requires_description,
    is_active: !!row.is_active,
    parent_id: row.parent_id == null ? '' : String(row.parent_id),
    cost_behavior: expenseCostBehavior(row),
  }
  errors.value = {}
  formOpen.value = true
}

function closeForm() {
  if (!saving.value) {
    formOpen.value = false
    editing.value = null
  }
}

function sourceEnabled(source: ExpenseSource) {
  return form.value.allowed_sources.includes(source)
}

function toggleSource(source: ExpenseSource, enabled: boolean) {
  if (enabled && !form.value.allowed_sources.includes(source))
    form.value.allowed_sources = [...form.value.allowed_sources, source]
  else if (!enabled)
    form.value.allowed_sources = form.value.allowed_sources.filter(value => value !== source)
}

function validate() {
  const next: Record<string, string> = {}
  const sortOrder = Number(form.value.sort_order)
  if (!form.value.name.trim())
    next.name = t('expcat_error_name_required')
  if (form.value.name.trim().length > 100)
    next.name = t('Too long')
  if (form.value.code && !/^[A-Z][A-Z0-9_]{1,63}$/.test(form.value.code.trim().toUpperCase()))
    next.code = t('expense_category_code_invalid')
  if (!Number.isInteger(sortOrder) || sortOrder < 0)
    next.sort_order = t('expense_sort_order_invalid')
  if (form.value.budget_limit !== null && (!Number.isInteger(form.value.budget_limit) || form.value.budget_limit < 0))
    next.budget_limit = t('expense_budget_invalid')
  if (!form.value.allowed_sources.length)
    next.allowed_sources = t('expense_allowed_sources_required')
  errors.value = next

  return Object.keys(next).length === 0
}

async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload: ExpenseCategoryPayload = {
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      budget_limit: form.value.budget_limit,
      reporting_group: form.value.reporting_group,
      is_active: form.value.is_active,
      sort_order: Number(form.value.sort_order),
      allowed_sources: form.value.allowed_sources,
      requires_receipt: form.value.requires_receipt,
      requires_description: form.value.requires_description,
      parent_id: form.value.parent_id ? Number(form.value.parent_id) : null,
      cost_behavior: form.value.cost_behavior,
      ...((!editing.value && form.value.code.trim()) ? { code: form.value.code.trim().toUpperCase() } : {}),
    }

    if (editing.value) {
      await updateExpenseCategory(editing.value.id, payload)
      notify(t('expcat_toast_updated'))
    }
    else {
      await createExpenseCategory(payload)
      notify(t('expcat_toast_created'))
    }
    formOpen.value = false
    editing.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    saving.value = false
  }
}

const confirmOpen = ref(false)
const confirmRow = ref<ExpenseCategory | null>(null)
const deactivating = ref(false)

function askDeactivate(row: ExpenseCategory) {
  confirmRow.value = row
  confirmOpen.value = true
}

function closeConfirm() {
  if (!deactivating.value) {
    confirmOpen.value = false
    confirmRow.value = null
  }
}

async function doDeactivate() {
  if (!confirmRow.value)
    return
  deactivating.value = true
  try {
    await deactivateExpenseCategory(confirmRow.value.id)
    notify(t('expcat_toast_deleted'))
    confirmOpen.value = false
    confirmRow.value = null
    await load()
  }
  catch (error: any) {
    notify(apiError(error), 'error')
  }
  finally {
    deactivating.value = false
  }
}

function sourceLabel(source: ExpenseSource) {
  return t(`supplier_source_${source}`)
}

function rowExpenseCount(row: TreeRow) {
  return expenseCategoryExpenseCount(row.category, row.kind === 'group')
}

function costBehaviorTone(value: ExpenseCostBehavior): 'neutral' | 'info' | 'primary' | 'warning' {
  if (value === 'FIXED')
    return 'info'
  if (value === 'VARIABLE')
    return 'primary'
  if (value === 'MIXED' || value === 'ONE_TIME')
    return 'warning'

  return 'neutral'
}
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('expcat_page_title')"
      :subtitle="t('expcat_page_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="loading || !canView"
          @click="load"
        >
          {{ t('expcat_action_refresh') }}
        </Button>
        <Button
          v-if="canManage"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('expcat_action_create') }}
        </Button>
      </template>
    </PageHeader>

    <Card
      v-if="!canView"
      class="permission-state"
    >
      <div class="statefill">
        <div class="statefill__icon">
          <DesignIcon
            name="lock"
            :size="24"
          />
        </div>
        <div class="statefill__title">
          {{ t('expense_permission_denied_title') }}
        </div>
        <div class="statefill__sub">
          {{ t('expense_category_permission_denied_body') }}
        </div>
      </div>
    </Card>

    <template v-else>
      <div class="kpi-grid category-kpis">
        <Kpi :data="{ label: t('expcat_kpi_top_level'), value: loading && !items.length ? null : summary.topLevel, icon: 'folder', tone: 'primary' }" />
        <Kpi :data="{ label: t('expcat_kpi_subcategories'), value: loading && !items.length ? null : summary.subcategories, icon: 'tag', tone: 'info' }" />
        <Kpi :data="{ label: t('expcat_kpi_selectable'), value: loading && !items.length ? null : summary.selectable, icon: 'check', tone: 'success' }" />
        <Kpi :data="{ label: t('expcat_kpi_expenses'), value: loading && !items.length ? null : summary.expenses, icon: 'receipt', tone: 'warning' }" />
      </div>

      <Card class="category-register">
        <WorkspaceToolbar class="toolbar toolbar--wrap">
          <div class="tb-search">
            <Input
              v-model="search"
              icon="search"
              :placeholder="t('expcat_search_ph')"
            />
          </div>
          <div class="tb-filter">
            <Select
              v-model="costBehaviorFilter"
              :options="costBehaviorFilterOptions"
              :placeholder="t('expense_cost_behavior_all')"
              :aria-label="t('expense_cost_behavior')"
            />
          </div>
          <label
            v-if="canManage"
            class="include-inactive"
          >
            <Switch v-model="includeInactive" />
            <span>{{ t('filter_include_inactive') }}</span>
          </label>
          <Button
            v-if="!filtersActive && summary.subcategories"
            class="tree-toggle-all"
            variant="ghost"
            :icon="allExpanded ? 'chevup' : 'chevdown'"
            @click="toggleAll"
          >
            {{ t(allExpanded ? 'expcat_collapse_all' : 'expcat_expand_all') }}
          </Button>
        </WorkspaceToolbar>

        <div class="hierarchy-note">
          <DesignIcon
            name="info"
            :size="16"
          />
          <span><strong>{{ t('expense_hierarchy_title') }}.</strong> {{ t('expense_hierarchy_body') }}</span>
        </div>

        <div
          v-if="loadError"
          class="error-banner"
          role="alert"
        >
          <span>{{ loadError }}</span>
          <Button
            variant="ghost"
            icon="retry"
            @click="load"
          >
            {{ t('Retry') }}
          </Button>
        </div>

        <div
          v-if="loading && !items.length"
          class="category-tree__loading"
          role="status"
          :aria-label="t('Loading')"
        >
          <span
            v-for="index in 6"
            :key="index"
          />
        </div>

        <div
          v-else-if="!items.length && !loadError"
          class="statefill"
        >
          <div class="statefill__icon">
            <DesignIcon
              name="folder"
              :size="24"
            />
          </div>
          <div class="statefill__title">
            {{ t('expcat_empty_title') }}
          </div>
          <div class="statefill__sub">
            {{ t('expcat_empty_subtitle') }}
          </div>
          <Button
            v-if="canManage"
            class="empty-action"
            variant="primary"
            icon="plus"
            @click="openCreate"
          >
            {{ t('expcat_action_create') }}
          </Button>
        </div>

        <div
          v-else-if="items.length && !visibleRows.length"
          class="statefill"
        >
          <div class="statefill__icon">
            <DesignIcon
              name="search"
              :size="24"
            />
          </div>
          <div class="statefill__title">
            {{ t('expcat_no_matches_title') }}
          </div>
          <div class="statefill__sub">
            {{ t('expcat_no_matches_body') }}
          </div>
          <Button
            class="empty-action"
            icon="close"
            @click="clearFilters"
          >
            {{ t('Clear filters') }}
          </Button>
        </div>

        <div
          v-else-if="visibleRows.length"
          class="category-tree"
          :class="{ 'is-refreshing': loading }"
        >
          <div
            class="category-tree__head"
            aria-hidden="true"
          >
            <span>{{ t('Category') }}</span>
            <span>{{ t('expcat_col_classification') }}</span>
            <span>{{ t('expcat_col_rules') }}</span>
            <span class="is-end">{{ t('expcat_col_expense_count') }}</span>
            <span>{{ t('expcat_col_status') }}</span>
            <span />
          </div>

          <ul class="category-tree__list">
            <li
              v-for="row in visibleRows"
              :id="rowId(row.category)"
              :key="row.category.id"
              class="category-row"
              :class="[`category-row--${row.kind}`, { 'is-inactive': row.category.is_active === false }]"
              :data-category-code="row.category.code"
            >
              <div class="category-row__main">
                <button
                  v-if="row.kind === 'group'"
                  type="button"
                  class="category-row__toggle"
                  :aria-expanded="row.expanded"
                  :aria-controls="row.childIds || undefined"
                  :aria-label="row.expanded ? t('expcat_hide_subcategories') : t('expcat_show_subcategories')"
                  :title="row.expanded ? t('expcat_hide_subcategories') : t('expcat_show_subcategories')"
                  :disabled="filtersActive"
                  @click="toggleGroup(row.category.id)"
                >
                  <DesignIcon
                    :name="row.expanded ? 'chevdown' : 'chevright'"
                    :size="16"
                  />
                </button>
                <span
                  v-else-if="row.kind === 'root'"
                  class="category-row__spacer"
                  aria-hidden="true"
                />
                <span
                  class="category-row__icon"
                  aria-hidden="true"
                >
                  <DesignIcon
                    :name="row.kind === 'group' ? 'folder' : 'tag'"
                    :size="16"
                  />
                </span>
                <div class="category-row__identity">
                  <div class="category-row__title">
                    <strong>{{ row.category.name }}</strong>
                    <span class="mono category-row__code">{{ row.category.code }}</span>
                  </div>
                  <p class="category-row__sub">
                    <span v-if="row.kind === 'group'">{{ t('expcat_subcategory_count', { count: row.childCount }) }}</span>
                    <span v-else-if="row.kind === 'root'">{{ t('expcat_no_subcategories') }}</span>
                    <span v-if="row.category.description">{{ row.category.description }}</span>
                  </p>
                </div>
              </div>

              <div
                class="category-row__cell category-row__classification"
                :data-label="t('expcat_col_classification')"
              >
                <Badge :tone="costBehaviorTone(expenseCostBehavior(row.category))">
                  {{ t(`expense_cost_behavior_${expenseCostBehavior(row.category)}`) }}
                </Badge>
                <span class="cell-muted">{{ t(`expense_reporting_group_${row.category.reporting_group}`) }}</span>
              </div>

              <div
                class="category-row__cell category-row__rules"
                :data-label="t('expcat_col_rules')"
              >
                <div class="source-badges">
                  <Badge
                    v-for="source in row.category.allowed_sources"
                    :key="source"
                    tone="neutral"
                  >
                    {{ sourceLabel(source) }}
                  </Badge>
                </div>
                <span class="cell-muted">
                  {{ t('expcat_budget_label') }}: {{ row.category.budget_limit == null ? t('expcat_budget_unlimited') : formatCurrency(row.category.budget_limit) }}
                </span>
                <span
                  v-if="row.category.requires_receipt || row.category.requires_description"
                  class="category-row__requirements"
                >
                  <span v-if="row.category.requires_receipt">
                    <DesignIcon
                      name="receipt"
                      :size="12"
                    />{{ t('expcat_receipt_required') }}
                  </span>
                  <span v-if="row.category.requires_description">
                    <DesignIcon
                      name="document"
                      :size="12"
                    />{{ t('expcat_description_required') }}
                  </span>
                </span>
              </div>

              <div
                class="category-row__cell category-row__count"
                :data-label="t('expcat_col_expense_count')"
              >
                <strong class="mono">{{ fmtNum(rowExpenseCount(row)) }}</strong>
                <span class="cell-muted">{{ t(row.kind === 'group' ? 'expense_count_subtree' : 'expense_count_direct') }}</span>
              </div>

              <div
                class="category-row__cell"
                :data-label="t('expcat_col_status')"
              >
                <Badge :tone="row.category.is_active ? 'success' : 'neutral'">
                  {{ t(`expcat_status_${row.category.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
                </Badge>
              </div>

              <div class="category-row__actions">
                <IconAction
                  v-if="canManage && row.kind !== 'child' && row.category.is_active"
                  icon="plus"
                  :title="t('expcat_action_add_subcategory')"
                  @click="openCreateSubcategory(row.category)"
                />
                <IconAction
                  v-if="canManage"
                  icon="pencil"
                  :title="t('expcat_action_edit')"
                  @click="openEdit(row.category)"
                />
                <IconAction
                  v-if="canManage && row.category.is_active"
                  icon="trash"
                  tone="danger"
                  :disabled="Number(row.category.active_child_count ?? 0) > 0"
                  :title="Number(row.category.active_child_count ?? 0) > 0 ? t('expense_category_active_children_block') : t('expcat_action_delete')"
                  @click="askDeactivate(row.category)"
                />
              </div>
            </li>
          </ul>
        </div>
      </Card>
    </template>

    <Modal
      :open="formOpen"
      :title="editing ? t('expcat_modal_edit_title') : t('expcat_modal_create_title')"
      :subtitle="editing ? editing.name : t('expense_category_configuration_hint')"
      :width="720"
      @close="closeForm"
    >
      <form @submit.prevent="submit">
        <div class="form-grid">
          <Field
            :label="t('Code')"
            :error="errors.code"
            :hint="editing ? t('expense_category_code_immutable') : t('expense_category_code_hint')"
          >
            <Input
              v-model="form.code"
              :disabled="!!editing"
              :error="!!errors.code"
              placeholder="UTILITIES"
              maxlength="64"
            />
          </Field>
          <Field
            :label="t('expcat_field_name')"
            :error="errors.name"
          >
            <Input
              v-model="form.name"
              :error="!!errors.name"
              :placeholder="t('expense_cat_name_placeholder')"
              maxlength="100"
              autofocus
            />
          </Field>
          <Field
            :label="t('expense_parent_category')"
            :hint="parentLocked ? t('expense_parent_locked_children') : t('expense_parent_category_hint')"
          >
            <Select
              v-model="form.parent_id"
              :options="parentOptions"
              :placeholder="t('expense_top_level_category')"
              :disabled="parentLocked"
            />
          </Field>
          <Field :label="t('expense_cost_behavior')">
            <Select
              v-model="form.cost_behavior"
              :options="costBehaviorOptions"
            />
          </Field>
          <Field :label="t('expense_reporting_group')">
            <Select
              v-model="form.reporting_group"
              :options="reportingGroupOptions"
            />
          </Field>
          <Field
            :label="t('Sort order')"
            :error="errors.sort_order"
          >
            <Input
              v-model="form.sort_order"
              type="number"
              min="0"
              step="1"
              :error="!!errors.sort_order"
            />
          </Field>
          <Field
            :label="t('expcat_field_description')"
            class="span-2"
          >
            <Textarea
              v-model="form.description"
              class="input textarea"
              rows="3"
              :placeholder="t('expense_cat_desc_placeholder')"
            />
          </Field>
          <Field
            :label="t('expcat_field_budget_limit')"
            class="span-2"
            :error="errors.budget_limit"
            :hint="t('expcat_field_budget_hint')"
          >
            <MoneyInput
              v-model="form.budget_limit"
              icon="dollar"
              nullable
              :error="!!errors.budget_limit"
              :placeholder="t('expense_amount_placeholder')"
            />
          </Field>
          <Field
            :label="t('expense_allowed_sources')"
            class="span-2"
            :error="errors.allowed_sources"
            :hint="t('expense_allowed_sources_hint')"
          >
            <div class="source-grid">
              <label
                v-for="source in SOURCE_OPTIONS"
                :key="source"
                class="toggle-card"
              >
                <Switch
                  :model-value="sourceEnabled(source)"
                  @update:model-value="toggleSource(source, $event)"
                />
                <span>{{ sourceLabel(source) }}</span>
              </label>
            </div>
          </Field>
          <Field
            :label="t('expense_category_rules')"
            class="span-2"
            :hint="deactivationLocked ? t('expense_category_active_children_block') : ''"
          >
            <div class="policy-grid">
              <label class="toggle-card">
                <Switch v-model="form.requires_receipt" />
                <span>{{ t('expense_requires_receipt') }}</span>
              </label>
              <label class="toggle-card">
                <Switch v-model="form.requires_description" />
                <span>{{ t('expense_requires_description') }}</span>
              </label>
              <label class="toggle-card">
                <Switch
                  v-model="form.is_active"
                  :disabled="deactivationLocked"
                />
                <span>{{ t('expcat_field_is_active') }}</span>
              </label>
            </div>
          </Field>
        </div>
      </form>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="saving"
          :disabled="saving"
          @click="submit"
        >
          {{ t('expcat_save') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="confirmOpen"
      :title="t('expcat_action_delete')"
      :subtitle="confirmRow?.name || ''"
      :width="460"
      @close="closeConfirm"
    >
      <p class="confirm-copy">
        {{ t('expcat_confirm_delete') }}
      </p>
      <p class="cell-muted confirm-note">
        {{ t('expense_category_deactivate_note') }}
      </p>
      <template #footer>
        <Button
          variant="danger"
          icon="trash"
          :loading="deactivating"
          :disabled="deactivating"
          @click="doDeactivate"
        >
          {{ t('expcat_action_delete') }}
        </Button>
      </template>
    </Modal>

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </WorkspacePage>
</template>

<style scoped>
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-block-end: 16px; }
.toolbar--wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.tb-search { flex: 1 1 260px; max-width: 380px; }
.tb-filter { width: 210px; }
.tree-toggle-all { margin-inline-start: auto; }
.include-inactive { display: inline-flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 14px; cursor: pointer; }
.hierarchy-note { display: flex; align-items: flex-start; gap: 9px; margin: 0 18px 12px; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.hierarchy-note > svg { flex: 0 0 auto; margin-block-start: 2px; color: var(--primary); }
.hierarchy-note strong { color: var(--text); font-weight: 650; }
.error-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 16px 12px; padding: 10px 12px; border: 1px solid var(--error-border); border-radius: 8px; background: var(--error-weak); color: var(--error-strong); }
.empty-action { margin-block-start: 12px; }

.category-tree { border-block-start: 1px solid var(--border); transition: opacity 150ms ease; }
.category-tree.is-refreshing { opacity: .6; }
.category-tree__list { margin: 0; padding: 0; list-style: none; }
.category-tree__head,
.category-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 190px) minmax(170px, 220px) 92px 92px 124px; align-items: center; gap: 14px; padding: 12px 18px; }
.category-tree__head { padding-block: 9px; background: var(--surface-2); color: var(--text-tertiary); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.category-tree__head .is-end,
.category-row__count { justify-items: end; text-align: end; }
.category-tree__loading { display: grid; gap: 10px; padding: 16px 18px 20px; }
.category-tree__loading span { display: block; height: 46px; border-radius: 12px; background: var(--surface-2); animation: category-pulse 1.4s ease-in-out infinite; }

.category-row { position: relative; border-block-start: 1px solid var(--border); }
.category-row--group,
.category-row--root { background: color-mix(in srgb, var(--primary) 3%, var(--surface)); }
.category-row--child { background: var(--surface); }
.category-row.is-inactive .category-row__identity,
.category-row.is-inactive .category-row__icon { opacity: .6; }
.category-row__main { display: flex; align-items: center; min-width: 0; gap: 10px; }
.category-row--child .category-row__main { position: relative; padding-inline-start: 40px; }
.category-row--child .category-row__main::before { position: absolute; width: 1px; background: var(--border-strong); content: ''; inset-block: -13px; inset-inline-start: 13px; }
.category-row--child .category-row__main::after { position: absolute; width: 16px; height: 1px; background: var(--border-strong); content: ''; inset-block-start: 50%; inset-inline-start: 13px; }
.category-row__toggle,
.category-row__spacer { display: grid; flex: 0 0 28px; width: 28px; height: 28px; place-items: center; }
.category-row__toggle { padding: 0; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-secondary); cursor: pointer; transition: background 160ms ease, color 160ms ease; }
.category-row__toggle:hover:not(:disabled) { background: var(--primary-weak); color: var(--primary); }
.category-row__toggle:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.category-row__toggle:disabled { cursor: default; opacity: .55; }
.category-row__icon { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; border-radius: 10px; background: var(--primary-weak); color: var(--primary); }
.category-row--child .category-row__icon { flex-basis: 28px; width: 28px; height: 28px; border-radius: 8px; background: var(--surface-2); color: var(--text-secondary); }
.category-row__identity { display: grid; min-width: 0; gap: 2px; }
.category-row__title { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; gap: 4px 8px; }
.category-row__title strong { min-width: 0; color: var(--text); font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.category-row--child .category-row__title strong { font-weight: 560; }
.category-row__code { color: var(--text-tertiary); font-size: 11px; }
.category-row__sub { display: flex; flex-wrap: wrap; margin: 0; gap: 2px 10px; color: var(--text-secondary); font-size: 12px; line-height: 1.4; }
.category-row__sub span { min-width: 0; overflow-wrap: anywhere; }
.category-row__cell { display: grid; justify-items: start; min-width: 0; gap: 4px; font-size: 12px; }
.category-row__cell .cell-muted { overflow-wrap: anywhere; }
.category-row__count strong { color: var(--text); font-size: 14px; font-variant-numeric: tabular-nums; }
.category-row__requirements { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--warning-strong); font-size: 11px; }
.category-row__requirements > span { display: inline-flex; align-items: center; gap: 4px; }
.category-row__actions { display: flex; justify-content: flex-end; gap: 2px; }
.source-badges { display: flex; flex-wrap: wrap; gap: 4px; }

.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.span-2 { grid-column: span 2; }
.textarea { width: 100%; min-height: 82px; resize: vertical; font-family: inherit; }
.source-grid,
.policy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.toggle-card { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.toggle-card span { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.confirm-copy { margin: 0; }
.confirm-note { margin: 8px 0 0; font-size: 12px; }

@keyframes category-pulse { 50% { opacity: .45; } }

@media (max-width: 1100px) {
  .category-tree__head,
  .category-row { grid-template-columns: minmax(0, 1fr) minmax(140px, 170px) minmax(150px, 190px) 80px 84px 116px; gap: 10px; }
}

@media (max-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .category-tree__head { display: none; }
  .category-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; padding: 12px 14px; }
  .category-row__main { grid-column: 1 / -1; grid-row: 1; align-items: flex-start; padding-inline-end: 136px; }
  .category-row__actions { position: absolute; inset-block-start: 8px; inset-inline-end: 8px; }
  .category-row__cell { align-content: start; }
  .category-row__cell::before { color: var(--text-tertiary); content: attr(data-label); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .category-row__count { justify-items: start; text-align: start; }
  .category-row--child { padding-inline-start: 26px; }
  .category-row--child .category-row__main { padding-inline-start: 22px; }
  .category-row--child .category-row__main::before { inset-inline-start: 4px; }
  .category-row--child .category-row__main::after { width: 12px; inset-inline-start: 4px; }
  .tb-search { max-width: none; flex-basis: 100%; }
  .tb-filter { width: 100%; flex: 1 1 100%; }
  .tree-toggle-all { margin-inline-start: 0; }
}

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .source-grid,
  .policy-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .hierarchy-note { margin-inline: 12px; }
  .error-banner { align-items: flex-start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  .category-tree__loading span { animation: none; }
  .category-tree,
  .category-row__toggle { transition: none; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
