<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { ExpenseCategory, ExpenseCategoryPayload, ExpenseSource } from '@/types/expenseControl'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'
import {
  createExpenseCategory,
  deactivateExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from '@/services/expenseControlApi'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency } = useFormatters()
const { hasPermission } = useUserAccess()

const canView = computed(() => hasPermission('expense.category.view'))
const canManage = computed(() => hasPermission('expense.category.manage'))

const items = ref<ExpenseCategory[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const itemsPerPage = ref(20)
const search = ref('')
const includeInactive = ref(false)

const SOURCE_OPTIONS: ExpenseSource[] = ['DRAWER', 'SAFE', 'BANK']

const REPORTING_GROUPS = [
  'INVENTORY_PURCHASE',
  'PAYROLL',
  'RENT',
  'UTILITIES',
  'OPERATING',
  'WASTE_SPOILAGE',
  'FINANCE_FEES',
  'DEPRECIATION',
  'TAXES',
  'CAPITAL_EXPENDITURE',
  'OWNER_DRAW',
  'NON_BUSINESS',
  'REVIEW',
] as const

const reportingGroupOptions = computed(() => REPORTING_GROUPS.map(value => ({
  value,
  label: t(`expense_reporting_group_${value}`),
})))

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
    const result = await listExpenseCategories({
      page: page.value,
      per_page: itemsPerPage.value,
      search: search.value.trim() || undefined,
      include_inactive: (canManage.value && includeInactive.value) ? true : undefined,
    })

    items.value = result.categories
    total.value = Number(result.pagination.total ?? result.categories.length)
  }
  catch (error: any) {
    loadError.value = apiError(error)
    items.value = []
    total.value = 0
  }
  finally {
    loading.value = false
  }
}

onMounted(load)
watch([page, itemsPerPage], load)
watch(includeInactive, () => {
  page.value = 1
  load()
})

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  load()
}, 350)

watch(search, debouncedSearch)

const columns: DataTableColumn<ExpenseCategory>[] = [
  { key: 'code', label: t('Code'), width: 150 },
  { key: 'name', label: t('expcat_col_name') },
  { key: 'reporting_group', label: t('expense_reporting_group'), width: 180 },
  { key: 'allowed_sources', label: t('expense_allowed_sources'), width: 210 },
  { key: 'budget_limit', label: t('expcat_col_budget_limit'), align: 'right', width: 160 },
  { key: 'expense_count', label: t('expcat_col_expense_count'), align: 'right', width: 100 },
  { key: 'is_active', label: t('expcat_col_status'), width: 110 },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (value: number) => { page.value = value },
  onPerPage: (value: number) => { itemsPerPage.value = value; page.value = 1 },
}))

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
}

function blankForm(): CategoryForm {
  return {
    code: '',
    name: '',
    description: '',
    budget_limit: null,
    reporting_group: 'REVIEW',
    sort_order: '0',
    allowed_sources: ['DRAWER', 'SAFE', 'BANK'],
    requires_receipt: false,
    requires_description: false,
    is_active: true,
  }
}

const formOpen = ref(false)
const editing = ref<ExpenseCategory | null>(null)
const saving = ref(false)
const form = ref<CategoryForm>(blankForm())
const errors = ref<Record<string, string>>({})

function openCreate() {
  editing.value = null
  form.value = blankForm()
  errors.value = {}
  formOpen.value = true
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

    <Card v-else>
      <WorkspaceToolbar class="toolbar toolbar--wrap">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('expcat_search_ph')"
          />
        </div>
        <label
          v-if="canManage"
          class="include-inactive"
        >
          <Switch v-model="includeInactive" />
          <span>{{ t('filter_include_inactive') }}</span>
        </label>
      </WorkspaceToolbar>

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

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="tablePagination"
        :empty-title="t('expcat_empty_title')"
        :empty-sub="t('expcat_empty_subtitle')"
      >
        <template #cell.code="{ row }">
          <span class="mono cell-muted">{{ row.code }}</span>
        </template>
        <template #cell.name="{ row }">
          <div class="cell-stack">
            <span class="cell-strong">{{ row.name }}</span>
            <span
              v-if="row.description"
              class="cell-muted truncate"
            >{{ row.description }}</span>
          </div>
        </template>
        <template #cell.reporting_group="{ row }">
          {{ t(`expense_reporting_group_${row.reporting_group}`) }}
        </template>
        <template #cell.allowed_sources="{ row }">
          <div class="source-badges">
            <Badge
              v-for="source in row.allowed_sources"
              :key="source"
              tone="neutral"
            >
              {{ sourceLabel(source) }}
            </Badge>
          </div>
        </template>
        <template #cell.budget_limit="{ row }">
          <span
            v-if="row.budget_limit == null"
            class="cell-muted"
          >{{ t('expcat_budget_unlimited') }}</span>
          <span
            v-else
            class="mono"
          >{{ formatCurrency(row.budget_limit) }}</span>
        </template>
        <template #cell.expense_count="{ row }">
          <span class="mono">{{ row.expense_count ?? 0 }}</span>
        </template>
        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'">
            {{ t(`expcat_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>
        <template #row-actions="{ row }">
          <IconAction
            v-if="canManage"
            icon="pencil"
            :title="t('expcat_action_edit')"
            @click="openEdit(row)"
          />
          <IconAction
            v-if="canManage && row.is_active"
            icon="trash"
            tone="danger"
            :title="t('expcat_action_delete')"
            @click="askDeactivate(row)"
          />
        </template>
        <template #empty>
          <div class="statefill">
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
        </template>
      </DataTable>
    </Card>

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
                <Switch v-model="form.is_active" />
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
.toolbar--wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.tb-search { flex: 1 1 260px; max-width: 380px; }
.include-inactive { display: inline-flex; align-items: center; gap: 10px; color: rgb(var(--v-theme-text-secondary)); font-size: 14px; cursor: pointer; }
.error-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 16px 12px; padding: 10px 12px; border: 1px solid rgba(var(--v-theme-error), .3); border-radius: 8px; background: rgba(var(--v-theme-error), .08); color: rgb(var(--v-theme-error)); }
.cell-stack { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.truncate { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.empty-action { margin-block-start: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.span-2 { grid-column: span 2; }
.textarea { width: 100%; min-height: 82px; resize: vertical; font-family: inherit; }
.source-grid,
.policy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.toggle-card { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px; border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: 8px; cursor: pointer; }
.toggle-card span { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.confirm-copy { margin: 0; }
.confirm-note { margin: 8px 0 0; font-size: 12px; }

@media (max-width: 768px) {
  .tb-search { max-width: none; flex-basis: 100%; }
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .source-grid,
  .policy-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .error-banner { align-items: flex-start; flex-direction: column; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
