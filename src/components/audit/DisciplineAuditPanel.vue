<script setup lang="ts">
import Checkbox from '@/components/design/Checkbox.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { DisciplinaryCase, DisciplinaryRule, EmployeeRef } from '@/types/operationsAudit'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import Segmented from '@/components/design/Segmented.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Textarea from '@/components/design/Textarea.vue'
import TimeField from '@/components/design/TimeField.vue'
import { operationsAuditApi, tashkentDateTime } from '@/services/operationsAuditApi'
import { useUserAccess } from '@/composables/useUserAccess'

interface Props {
  dateFrom: string
  dateTo: string
  employees: EmployeeRef[]
  refreshKey?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { formatCurrency, formatDateShort } = useFormatters()
const { hasPermission, currentUserId } = useUserAccess()

const view = ref<'cases' | 'rules'>('cases')
const page = ref(1)
const perPage = ref(20)
const rulesPage = ref(1)
const employeeFilter = ref('')
const statusFilter = ref('')
const cases = ref<DisciplinaryCase[]>([])
const rules = ref<DisciplinaryRule[]>([])
const ruleCatalog = ref<DisciplinaryRule[]>([])
const casesTotal = ref(0)
const rulesTotal = ref(0)
const loading = ref(false)
const errorMessage = ref('')
const caseForm = ref({ employee_id: '', date: '', time: '', rule_id: '', amount_uzs: 0, evidence: '', comment: '', excuse_text: '' })
let loadRequestId = 0

const canViewCases = computed(() => hasPermission('discipline.case.view'))
const canViewRules = computed(() => hasPermission('discipline.rule.view'))
const canCreateCase = computed(() => hasPermission('discipline.case.create'))
const canApproveCase = computed(() => hasPermission('discipline.case.approve'))
const canVoidCase = computed(() => hasPermission('discipline.case.void'))
const canManageRules = computed(() => hasPermission('discipline.rule.manage'))

const canCreateCaseWithDependencies = computed(() => canCreateCase.value
  && canViewRules.value
  && hasPermission('attendance.view')
  && props.employees.length > 0)

const caseCreationBlocked = computed(() => canCreateCase.value && !canCreateCaseWithDependencies.value)
const selectedRule = computed(() => ruleCatalog.value.find(item => String(item.id) === String(caseForm.value.rule_id)) ?? null)

function isOwnCase(row: DisciplinaryCase): boolean {
  return currentUserId.value != null
    && row.createdById != null
    && String(currentUserId.value) === String(row.createdById)
}

const views = computed(() => {
  const options: { value: 'cases' | 'rules'; label: string; icon: string; id: string; ariaControls: string }[] = []

  if (canViewCases.value)
    options.push({ value: 'cases', label: t('opsAudit.discipline.cases'), icon: 'flag', id: 'discipline-cases-tab', ariaControls: 'discipline-cases-panel' })
  if (canViewRules.value)
    options.push({ value: 'rules', label: t('opsAudit.discipline.rules'), icon: 'list', id: 'discipline-rules-tab', ariaControls: 'discipline-rules-panel' })

  return options
})

const employeeOptions = computed(() => props.employees.map(employee => ({ value: String(employee.id), label: employee.name })))

const statusOptions = computed(() => ['DRAFT', 'SUBMITTED', 'EXCUSED', 'APPROVED', 'REJECTED', 'VOIDED', 'APPROVED_PENDING_PAYROLL'].map(status => ({
  value: status,
  label: t(`opsAudit.caseStatus.${status}`),
})))

function tashkentTodayYmd(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))

  return `${value.year}-${value.month}-${value.day}`
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))

  return date.toISOString().slice(0, 10)
}

function isRuleEffectiveOn(rule: DisciplinaryRule, date: string): boolean {
  return rule.active
    && (!rule.effectiveFrom || rule.effectiveFrom <= date)
    && (!rule.effectiveTo || rule.effectiveTo >= date)
}

function canEditRule(row: DisciplinaryRule): boolean {
  return canManageRules.value
    && !!row.effectiveFrom
    && row.effectiveFrom > tashkentTodayYmd()
}

const ruleOptions = computed(() => ruleCatalog.value.filter(rule => isRuleEffectiveOn(rule, caseForm.value.date || props.dateTo)).map(rule => ({
  value: String(rule.id),
  label: `${rule.code} · ${rule.title}`,
  keywords: `${rule.category} ${rule.description ?? ''}`,
})))

const ruleCategories = computed(() => ['ATTENDANCE', 'CONDUCT', 'QUALITY', 'PREPARATION_TIME', 'OTHER'].map(category => ({
  value: category,
  label: t(`opsAudit.ruleCategory.${category}`),
})))

function caseTone(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (status === 'APPROVED')
    return 'success'
  if (['SUBMITTED', 'APPROVED_PENDING_PAYROLL'].includes(status))
    return 'warning'
  if (['REJECTED', 'VOIDED'].includes(status))
    return 'error'
  if (status === 'EXCUSED')
    return 'info'

  return 'neutral'
}

async function loadRuleCatalog() {
  if (!canViewRules.value) {
    ruleCatalog.value = []
    return
  }

  ruleCatalog.value = await operationsAuditApi.disciplineRulesAll()
}

async function loadCasesView(requestId: number) {
  if (!canViewCases.value) {
    cases.value = []
    casesTotal.value = 0
    return
  }

  const catalogRequest = (!canViewRules.value || ruleCatalog.value.length)
    ? Promise.resolve()
    : loadRuleCatalog()

  const [result] = await Promise.all([
    operationsAuditApi.disciplineCases({
      date_from: props.dateFrom,
      date_to: props.dateTo,
      employee_id: employeeFilter.value || undefined,
      status: statusFilter.value || undefined,
      page: page.value,
      per_page: perPage.value,
    }),
    catalogRequest,
  ])

  if (requestId !== loadRequestId)
    return
  cases.value = result.items
  casesTotal.value = result.total
}

async function loadRulesView(requestId: number) {
  if (!canViewRules.value) {
    rules.value = []
    rulesTotal.value = 0
    return
  }

  const result = await operationsAuditApi.disciplineRules({ page: rulesPage.value, per_page: perPage.value })
  if (requestId !== loadRequestId)
    return
  rules.value = result.items
  rulesTotal.value = result.total
}

async function loadCurrent() {
  const requestId = ++loadRequestId

  loading.value = true
  errorMessage.value = ''
  try {
    if (view.value === 'cases')
      await loadCasesView(requestId)
    else
      await loadRulesView(requestId)
  }
  catch (error) {
    if (requestId === loadRequestId)
      errorMessage.value = translate(error)
  }
  finally {
    if (requestId === loadRequestId)
      loading.value = false
  }
}

watch(views, options => {
  if (!options.some(option => option.value === view.value))
    view.value = options[0]?.value ?? 'cases'
}, { immediate: true })

watch(
  () => [props.dateFrom, props.dateTo, props.refreshKey, view.value, page.value, rulesPage.value, perPage.value, employeeFilter.value, statusFilter.value],
  () => { loadCurrent() },
  { immediate: true },
)

watch([employeeFilter, statusFilter], () => { page.value = 1 })

const caseColumns = computed<DataTableColumn<DisciplinaryCase>[]>(() => [
  { key: 'businessDate', label: t('opsAudit.columns.date'), width: 120 },
  { key: 'employee', label: t('opsAudit.columns.employee'), width: 190 },
  { key: 'rule', label: t('opsAudit.columns.rule'), width: 240 },
  { key: 'category', label: t('opsAudit.columns.category'), width: 150 },
  { key: 'amount', label: t('opsAudit.columns.amount'), align: 'right', width: 150 },
  { key: 'status', label: t('opsAudit.columns.status'), width: 170 },
  { key: 'payroll', label: t('opsAudit.columns.payroll'), width: 140 },
])

const ruleColumns = computed<DataTableColumn<DisciplinaryRule>[]>(() => [
  { key: 'code', label: t('opsAudit.columns.code'), width: 130 },
  { key: 'title', label: t('opsAudit.columns.rule'), width: 280 },
  { key: 'category', label: t('opsAudit.columns.category'), width: 170 },
  { key: 'amount', label: t('opsAudit.columns.defaultAmount'), align: 'right', width: 160 },
  { key: 'effective', label: t('opsAudit.columns.effectivePeriod'), width: 210 },
  { key: 'status', label: t('opsAudit.columns.status'), width: 110 },
])

const caseOpen = ref(false)
const caseSaving = ref(false)
const caseErrors = ref<Record<string, string>>({})

function openCase() {
  if (!canCreateCaseWithDependencies.value) {
    notify(t('opsAudit.discipline.caseDependenciesMissing'), 'error')
    return
  }

  caseForm.value = {
    employee_id: employeeFilter.value,
    date: props.dateTo,
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' }).format(new Date()),
    rule_id: '',
    amount_uzs: 0,
    evidence: '',
    comment: '',
    excuse_text: '',
  }
  caseErrors.value = {}
  caseOpen.value = true
}

function onRuleSelected(value: string) {
  const rule = ruleCatalog.value.find(item => String(item.id) === String(value))
  if (rule)
    caseForm.value.amount_uzs = rule.defaultAmountUzs
}

async function createCase() {
  if (!canCreateCaseWithDependencies.value || caseSaving.value)
    return

  const errors: Record<string, string> = {}
  if (!caseForm.value.employee_id)
    errors.employee_id = t('opsAudit.validation.employeeRequired')
  if (!caseForm.value.rule_id)
    errors.rule_id = t('opsAudit.validation.ruleRequired')
  else if (!selectedRule.value || !isRuleEffectiveOn(selectedRule.value, caseForm.value.date))
    errors.rule_id = t('opsAudit.validation.ruleNotEffective')
  if (!caseForm.value.date || !caseForm.value.time)
    errors.date = t('opsAudit.validation.dateTimeRequired')
  if (selectedRule.value?.requiresEvidence && !caseForm.value.evidence.trim())
    errors.evidence = t('opsAudit.validation.explanationRequired')
  if (selectedRule.value?.requiresComment && !caseForm.value.comment.trim())
    errors.comment = t('opsAudit.validation.explanationRequired')
  caseErrors.value = errors
  if (Object.keys(errors).length)
    return

  caseSaving.value = true
  try {
    await operationsAuditApi.createDisciplineCase({
      employee_id: caseForm.value.employee_id,
      business_date: caseForm.value.date,
      occurred_at: tashkentDateTime(caseForm.value.date, caseForm.value.time),
      rule_id: caseForm.value.rule_id,
      amount_uzs: Math.round(caseForm.value.amount_uzs),
      evidence: caseForm.value.evidence.trim(),
      comment: caseForm.value.comment.trim(),
      excuse_text: caseForm.value.excuse_text.trim() || undefined,
      status: 'SUBMITTED',
    })
    notify(t('opsAudit.discipline.caseSubmitted'))
    caseOpen.value = false
    await Promise.all([loadCurrent(), loadRuleCatalog()])
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    caseSaving.value = false
  }
}

const transitionOpen = ref(false)
const transitionSaving = ref(false)
const transitionTarget = ref<DisciplinaryCase | null>(null)
const transitionAction = ref<'approve' | 'reject' | 'void'>('approve')
const transitionNote = ref('')
const transitionError = ref('')

function openTransition(row: DisciplinaryCase, action: 'approve' | 'reject' | 'void') {
  transitionTarget.value = row
  transitionAction.value = action
  transitionNote.value = ''
  transitionError.value = ''
  transitionOpen.value = true
}

async function submitTransition() {
  if (!transitionTarget.value || transitionSaving.value)
    return
  if (transitionAction.value !== 'approve' && !transitionNote.value.trim()) {
    transitionError.value = t('opsAudit.validation.explanationRequired')
    return
  }
  transitionSaving.value = true
  try {
    await operationsAuditApi.transitionDisciplineCase(transitionTarget.value.id, transitionAction.value, {
      review_note: transitionNote.value.trim() || undefined,
      reason: transitionNote.value.trim() || undefined,
    })
    notify(t(`opsAudit.discipline.transitionSuccess.${transitionAction.value}`))
    transitionOpen.value = false
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    transitionSaving.value = false
  }
}

const ruleOpen = ref(false)
const ruleSaving = ref(false)
const ruleStateSavingId = ref<string | number | null>(null)
const editingRule = ref<DisciplinaryRule | null>(null)
const ruleErrors = ref<Record<string, string>>({})
const ruleForm = ref({ code: '', category: 'ATTENDANCE', title: '', description: '', amount_uzs: 0, effective_from: '', effective_to: '', requires_evidence: true, requires_comment: true, is_active: true })

function openRule(row?: DisciplinaryRule) {
  if (row && !canEditRule(row)) {
    notify(t('opsAudit.discipline.historicalRuleLocked'), 'error')
    return
  }

  const today = tashkentTodayYmd()
  const prospectiveStart = addDays(today, 1)

  editingRule.value = row ?? null
  ruleForm.value = row
    ? {
      code: row.code,
      category: row.category,
      title: row.title,
      description: row.description ?? '',
      amount_uzs: row.defaultAmountUzs,
      effective_from: row.effectiveFrom ?? prospectiveStart,
      effective_to: row.effectiveTo ?? '',
      requires_evidence: row.requiresEvidence,
      requires_comment: row.requiresComment,
      is_active: row.active,
    }
    : { code: '', category: 'ATTENDANCE', title: '', description: '', amount_uzs: 0, effective_from: prospectiveStart, effective_to: '', requires_evidence: true, requires_comment: true, is_active: true }
  ruleErrors.value = {}
  ruleOpen.value = true
}

// Rule validation and minimal PATCH diffing intentionally live together so
// the modal submits only fields that actually changed.
// eslint-disable-next-line sonarjs/cognitive-complexity
async function saveRule() {
  if (ruleSaving.value)
    return

  const errors: Record<string, string> = {}
  if (!ruleForm.value.code.trim())
    errors.code = t('opsAudit.validation.codeRequired')
  if (!ruleForm.value.title.trim())
    errors.title = t('opsAudit.validation.titleRequired')
  if (!ruleForm.value.category)
    errors.category = t('opsAudit.validation.categoryRequired')
  if (!ruleForm.value.description.trim())
    errors.description = t('opsAudit.validation.explanationRequired')
  if (!ruleForm.value.effective_from)
    errors.effective_from = t('opsAudit.validation.dateRequired')
  else if (editingRule.value && ruleForm.value.effective_from <= tashkentTodayYmd())
    errors.effective_from = t('opsAudit.validation.futureEffectiveDate')
  if (ruleForm.value.effective_to && ruleForm.value.effective_to < ruleForm.value.effective_from)
    errors.effective_to = t('opsAudit.validation.effectiveDateOrder')
  ruleErrors.value = errors
  if (Object.keys(errors).length)
    return

  const fullPayload = {
    code: ruleForm.value.code.trim().toUpperCase(),
    category: ruleForm.value.category,
    title: ruleForm.value.title.trim(),
    description: ruleForm.value.description.trim(),
    default_amount_uzs: Math.round(ruleForm.value.amount_uzs),
    effective_from: ruleForm.value.effective_from,
    effective_to: ruleForm.value.effective_to || null,
    requires_evidence: ruleForm.value.requires_evidence,
    requires_comment: ruleForm.value.requires_comment,
    is_active: ruleForm.value.is_active,
  }

  const payload: Record<string, unknown> = editingRule.value
    ? Object.fromEntries(Object.entries(fullPayload).filter(([key, value]) => {
      const original: Record<string, unknown> = {
        code: editingRule.value?.code,
        category: editingRule.value?.category,
        title: editingRule.value?.title,
        description: editingRule.value?.description ?? '',
        default_amount_uzs: editingRule.value?.defaultAmountUzs,
        effective_from: editingRule.value?.effectiveFrom ?? '',
        effective_to: editingRule.value?.effectiveTo ?? null,
        requires_evidence: editingRule.value?.requiresEvidence,
        requires_comment: editingRule.value?.requiresComment,
        is_active: editingRule.value?.active,
      }

      return value !== original[key]
    }))
    : fullPayload

  if (editingRule.value && Object.keys(payload).length === 0) {
    ruleOpen.value = false
    return
  }
  ruleSaving.value = true
  try {
    if (editingRule.value)
      await operationsAuditApi.updateDisciplineRule(editingRule.value.id, payload)
    else
      await operationsAuditApi.createDisciplineRule(payload)
    notify(t(editingRule.value ? 'opsAudit.discipline.ruleUpdated' : 'opsAudit.discipline.ruleCreated'))
    ruleOpen.value = false
    ruleCatalog.value = []
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    ruleSaving.value = false
  }
}

async function toggleRuleActive(row: DisciplinaryRule) {
  if (!canManageRules.value || ruleStateSavingId.value !== null)
    return

  ruleStateSavingId.value = row.id
  try {
    await operationsAuditApi.updateDisciplineRule(row.id, { is_active: !row.active })
    notify(t(row.active ? 'opsAudit.discipline.ruleDeactivated' : 'opsAudit.discipline.ruleActivated'))
    ruleCatalog.value = []
    await loadCurrent()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    ruleStateSavingId.value = null
  }
}
</script>

<template>
  <section class="audit-panel">
    <div class="audit-panel__toolbar">
      <Segmented
        v-model="view"
        :options="views"
      />
      <Button
        v-if="view === 'cases' && canCreateCase"
        variant="primary"
        icon="plus"
        :disabled="!canCreateCaseWithDependencies"
        :title="caseCreationBlocked ? t('opsAudit.discipline.caseDependenciesMissing') : undefined"
        @click="openCase"
      >
        {{ t('opsAudit.discipline.newCase') }}
      </Button>
      <Button
        v-if="view === 'rules' && canManageRules"
        variant="primary"
        icon="plus"
        @click="() => openRule()"
      >
        {{ t('opsAudit.discipline.newRule') }}
      </Button>
    </div>

    <div
      v-if="view === 'cases' && caseCreationBlocked"
      class="dependency-note"
      role="status"
    >
      {{ t('opsAudit.discipline.caseDependenciesMissing') }}
    </div>

    <Card
      :id="`discipline-${view}-panel`"
      role="tabpanel"
      :aria-labelledby="`discipline-${view}-tab`"
    >
      <div class="toolbar audit-filters">
        <SearchSelect
          v-if="view === 'cases'"
          v-model="employeeFilter"
          class="audit-filter audit-filter--employee"
          icon="user"
          :options="employeeOptions"
          :placeholder="t('opsAudit.filters.allEmployees')"
        />
        <Select
          v-if="view === 'cases'"
          v-model="statusFilter"
          class="audit-filter"
          icon="filter"
          :options="statusOptions"
          :placeholder="t('opsAudit.filters.allStatuses')"
        />
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          :disabled="loading"
          @click="loadCurrent"
        >
          {{ t('opsAudit.refresh') }}
        </Button>
      </div>

      <StateFill
        v-if="errorMessage"
        icon="alert"
        :title="t('opsAudit.loadFailed')"
        :sub="errorMessage"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadCurrent"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else-if="view === 'cases'"
        :columns="caseColumns"
        :rows="cases"
        row-key="id"
        expandable
        :loading="loading"
        :pagination="{
          page,
          perPage,
          total: casesTotal,
          onPage: (value: number) => { page = value },
          onPerPage: (value: number) => { perPage = value; page = 1 },
        }"
        :empty-title="t('opsAudit.discipline.emptyTitle')"
        :empty-sub="t('opsAudit.discipline.emptySubtitle')"
        empty-icon="flag"
      >
        <template #cell.businessDate="{ row }">
          <span class="cell-strong">{{ formatDateShort(row.businessDate) }}</span>
        </template>
        <template #cell.employee="{ row }">
          <span class="cell-strong ellipsis">{{ row.employee.name }}</span>
        </template>
        <template #cell.rule="{ row }">
          <div class="rule-cell">
            <span class="mono rule-code">{{ row.ruleCode }}</span><strong>{{ row.ruleTitle }}</strong>
          </div>
        </template>
        <template #cell.category="{ row }">
          <Badge tone="neutral">
            {{ t(`opsAudit.ruleCategory.${row.ruleCategory}`) }}
          </Badge>
        </template>
        <template #cell.amount="{ row }">
          <strong class="mono">{{ formatCurrency(row.amountUzs) }} UZS</strong>
        </template>
        <template #cell.status="{ row }">
          <Badge
            :tone="caseTone(row.status)"
            dot
          >
            {{ t(`opsAudit.caseStatus.${row.status}`) }}
          </Badge>
        </template>
        <template #cell.payroll="{ row }">
          <span class="cell-muted">{{ row.payrollPeriod || '—' }}</span>
        </template>
        <template #row-actions="{ row }">
          <IconAction
            v-if="canApproveCase && row.status === 'SUBMITTED' && !isOwnCase(row)"
            icon="check"
            tone="success"
            :title="t('opsAudit.approve')"
            @click="openTransition(row, 'approve')"
          />
          <IconAction
            v-if="canApproveCase && row.status === 'SUBMITTED' && !isOwnCase(row)"
            icon="close"
            tone="danger"
            :title="t('opsAudit.reject')"
            @click="openTransition(row, 'reject')"
          />
          <IconAction
            v-if="canVoidCase && ['APPROVED', 'APPROVED_PENDING_PAYROLL'].includes(row.status) && !isOwnCase(row)"
            icon="stop"
            tone="danger"
            :title="t('opsAudit.void')"
            @click="openTransition(row, 'void')"
          />
        </template>
        <template #expanded="{ row }">
          <div class="case-detail-grid">
            <div><span>{{ t('opsAudit.evidence') }}</span><p>{{ row.evidence || '—' }}</p></div>
            <div><span>{{ t('opsAudit.comment') }}</span><p>{{ row.comment || '—' }}</p></div>
            <div><span>{{ t('opsAudit.excuse') }}</span><p>{{ row.excuse || '—' }}</p></div>
            <div><span>{{ t('opsAudit.createdBy') }}</span><p>{{ row.createdBy || '—' }}</p></div>
            <div><span>{{ t('opsAudit.reviewedBy') }}</span><p>{{ row.reviewedBy || '—' }}</p></div>
          </div>
        </template>
      </DataTable>

      <DataTable
        v-else
        :columns="ruleColumns"
        :rows="rules"
        row-key="id"
        :loading="loading"
        :pagination="{
          page: rulesPage,
          perPage,
          total: rulesTotal,
          onPage: (value: number) => { rulesPage = value },
          onPerPage: (value: number) => { perPage = value; rulesPage = 1 },
        }"
        :empty-title="t('opsAudit.discipline.rulesEmptyTitle')"
        :empty-sub="t('opsAudit.discipline.rulesEmptySubtitle')"
        empty-icon="list"
      >
        <template #cell.code="{ row }">
          <span class="mono rule-code">{{ row.code }}</span>
        </template>
        <template #cell.title="{ row }">
          <div class="rule-cell">
            <strong>{{ row.title }}</strong><small>{{ row.description }}</small>
          </div>
        </template>
        <template #cell.category="{ row }">
          <Badge tone="neutral">
            {{ t(`opsAudit.ruleCategory.${row.category}`) }}
          </Badge>
        </template>
        <template #cell.amount="{ row }">
          <span class="mono">{{ formatCurrency(row.defaultAmountUzs) }} UZS</span>
        </template>
        <template #cell.effective="{ row }">
          {{ row.effectiveFrom ? formatDateShort(row.effectiveFrom) : '—' }} – {{ row.effectiveTo ? formatDateShort(row.effectiveTo) : t('opsAudit.openEnded') }}
        </template>
        <template #cell.status="{ row }">
          <Badge :tone="row.active ? 'success' : 'neutral'">
            {{ row.active ? t('opsAudit.active') : t('opsAudit.inactive') }}
          </Badge>
        </template>
        <template #row-actions="{ row }">
          <IconAction
            v-if="canManageRules"
            icon="edit"
            :title="canEditRule(row) ? t('opsAudit.edit') : t('opsAudit.discipline.historicalRuleLocked')"
            :disabled="!canEditRule(row)"
            @click="openRule(row)"
          />
          <IconAction
            v-if="canManageRules"
            :icon="row.active ? 'stop' : 'play'"
            :tone="row.active ? 'danger' : 'success'"
            :title="t(row.active ? 'opsAudit.discipline.deactivateRule' : 'opsAudit.discipline.activateRule')"
            :disabled="ruleStateSavingId !== null"
            @click="toggleRuleActive(row)"
          />
        </template>
      </DataTable>
    </Card>

    <Modal
      :open="caseOpen"
      :title="t('opsAudit.discipline.newCase')"
      :subtitle="t('opsAudit.discipline.caseSubtitle')"
      :width="700"
      @close="caseOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          :label="t('opsAudit.columns.employee')"
          :error="caseErrors.employee_id"
        >
          <SearchSelect
            v-model="caseForm.employee_id"
            icon="user"
            :options="employeeOptions"
            :placeholder="t('opsAudit.filters.selectEmployee')"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.rule')"
          :error="caseErrors.rule_id"
        >
          <SearchSelect
            v-model="caseForm.rule_id"
            icon="list"
            :options="ruleOptions"
            :placeholder="t('opsAudit.discipline.selectRule')"
            @change="onRuleSelected"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.date')"
          :error="caseErrors.date"
        >
          <Input
            v-model="caseForm.date"
            type="date"
            icon="calendar"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.time')"
          :error="caseErrors.date"
        >
          <TimeField
            v-model:value="caseForm.time"
            icon="clock"
            :step="60"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.columns.amount')"
        >
          <MoneyInput
            v-model="caseForm.amount_uzs"
            icon="coins"
            :placeholder="t('opsAudit.amountUzs')"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.evidence')"
          :error="caseErrors.evidence"
        >
          <Textarea
            v-model="caseForm.evidence"
            :placeholder="t('opsAudit.discipline.evidencePlaceholder')"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.comment')"
          :error="caseErrors.comment"
        >
          <Textarea
            v-model="caseForm.comment"
            :placeholder="t('opsAudit.discipline.commentPlaceholder')"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.excuse')"
          :hint="t('opsAudit.optional')"
        >
          <Textarea
            v-model="caseForm.excuse_text"
            :placeholder="t('opsAudit.discipline.excusePlaceholder')"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="caseSaving"
          @click="createCase"
        >
          {{ t('opsAudit.submitForApproval') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="transitionOpen"
      :title="t(`opsAudit.discipline.transitionTitle.${transitionAction}`)"
      :subtitle="transitionTarget ? `${transitionTarget.employee.name} · ${transitionTarget.ruleCode}` : ''"
      :width="520"
      @close="transitionOpen = false"
    >
      <Field
        :label="t('opsAudit.reviewNote')"
        :error="transitionError"
        :hint="transitionAction === 'approve' ? t('opsAudit.optional') : undefined"
      >
        <Textarea
          v-model="transitionNote"
          :placeholder="t('opsAudit.discipline.reviewNotePlaceholder')"
        />
      </Field>
      <template #footer>
        <Button
          :variant="transitionAction === 'approve' ? 'primary' : 'danger'"
          :icon="transitionAction === 'approve' ? 'check' : 'close'"
          :loading="transitionSaving"
          @click="submitTransition"
        >
          {{ t(`opsAudit.${transitionAction}`) }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="ruleOpen"
      :title="editingRule ? t('opsAudit.discipline.editRule') : t('opsAudit.discipline.newRule')"
      :subtitle="t('opsAudit.discipline.ruleSubtitle')"
      :width="720"
      @close="ruleOpen = false"
    >
      <div class="form-grid form-grid--two">
        <Field
          :label="t('opsAudit.columns.code')"
          :error="ruleErrors.code"
        >
          <Input
            v-model="ruleForm.code"
            :disabled="!!editingRule"
            placeholder="ATT-LATE-01"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.category')"
          :error="ruleErrors.category"
        >
          <Select
            v-model="ruleForm.category"
            :options="ruleCategories"
          />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.ruleTitle')"
          :error="ruleErrors.title"
        >
          <Input v-model="ruleForm.title" />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.ruleDescription')"
          :error="ruleErrors.description"
        >
          <Textarea v-model="ruleForm.description" />
        </Field>
        <Field
          class="span-two"
          :label="t('opsAudit.columns.defaultAmount')"
        >
          <MoneyInput
            v-model="ruleForm.amount_uzs"
            icon="coins"
          />
        </Field>
        <Field
          :label="t('opsAudit.effectiveFrom')"
          :error="ruleErrors.effective_from"
        >
          <Input
            v-model="ruleForm.effective_from"
            type="date"
            icon="calendar"
          />
        </Field>
        <Field
          :label="t('opsAudit.effectiveTo')"
          :error="ruleErrors.effective_to"
          :hint="t('opsAudit.optional')"
        >
          <Input
            v-model="ruleForm.effective_to"
            type="date"
            icon="calendar"
          />
        </Field>
        <div class="span-two check-grid">
          <label><Checkbox v-model="ruleForm.requires_evidence" />{{ t('opsAudit.discipline.requiresEvidence') }}</label>
          <label><Checkbox v-model="ruleForm.requires_comment" />{{ t('opsAudit.discipline.requiresComment') }}</label>
          <label><Checkbox v-model="ruleForm.is_active" />{{ t('opsAudit.active') }}</label>
        </div>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="ruleSaving"
          @click="saveRule"
        >
          {{ t('opsAudit.saveRule') }}
        </Button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.audit-panel, .rule-cell { display: flex; flex-direction: column; }
.audit-panel { gap: 14px; }
.audit-panel__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dependency-note { padding: 10px 12px; border: 1px solid rgb(var(--v-theme-warning-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-warning-strong)); background: rgb(var(--v-theme-warning-weak)); font-size: 13px; }
.audit-filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.audit-filter { width: 190px; }
.audit-filter--employee { width: min(280px, 100%); }
.rule-cell { gap: 3px; min-width: 0; }
.rule-cell strong, .rule-cell small, .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-cell small { color: rgb(var(--v-theme-text-secondary)); max-width: 280px; }
.rule-code { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 700; }
.case-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }
.case-detail-grid span { color: rgb(var(--v-theme-text-secondary)); font-size: 12px; }
.case-detail-grid p { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface)); white-space: pre-wrap; }
.form-grid { display: grid; gap: 14px; }
.form-grid--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.span-two { grid-column: 1 / -1; }
.check-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.check-grid label { display: flex; align-items: center; gap: 8px; min-height: 42px; }
.check-grid input { width: 17px; height: 17px; accent-color: rgb(var(--v-theme-primary)); }

@media (max-width: 700px) {
  .audit-panel__toolbar, .audit-filter, .audit-filter--employee { width: 100%; }
  .form-grid--two, .case-detail-grid, .check-grid { grid-template-columns: 1fr; }
  .span-two { grid-column: auto; }
}
</style>
