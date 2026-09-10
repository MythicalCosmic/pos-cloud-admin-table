<script setup lang="ts">
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import type { AttendanceSummaryRow, AuditDashboard, EmployeeRef } from '@/types/operationsAudit'
import AttendanceAuditPanel from '@/components/audit/AttendanceAuditPanel.vue'
import DisciplineAuditPanel from '@/components/audit/DisciplineAuditPanel.vue'
import PreparationAuditPanel from '@/components/audit/PreparationAuditPanel.vue'
import Button from '@/components/design/Button.vue'
import DateRangePicker from '@/components/design/DateRangePicker.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Kpi from '@/components/design/Kpi.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Segmented from '@/components/design/Segmented.vue'
import StateFill from '@/components/design/StateFill.vue'
import { businessToday } from '@/composables/useBusinessDay'
import { operationsAuditApi } from '@/services/operationsAuditApi'
import { useUserAccess } from '@/composables/useUserAccess'

type AuditTab = 'attendance' | 'discipline' | 'preparation'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const { translate } = useApiError()
const { hasAnyPermission, hasPermission } = useUserAccess()

function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function initialRange(): DateRangeValue {
  const end = businessToday()
  const start = new Date(end)

  start.setDate(start.getDate() - 6)

  return { from: ymd(start), to: ymd(end), preset: '7d', mode: 'date' }
}

const range = ref<DateRangeValue>(initialRange())
const dashboard = ref<AuditDashboard | null>(null)
const dashboardError = ref('')
const employees = ref<EmployeeRef[]>([])
const attendanceSummaryRows = ref<AttendanceSummaryRow[]>([])
const employeeError = ref('')
const loadingSummary = ref(false)
const loadingEmployees = ref(false)
const employeeSummaryReady = ref(false)
const refreshKey = ref(0)
let dashboardRequestId = 0
let employeeRequestId = 0

const availableTabs = computed(() => {
  const tabs: { value: AuditTab; label: string; icon: string; id: string; ariaControls: string }[] = []
  if (hasPermission('attendance.view'))
    tabs.push({ value: 'attendance', label: t('opsAudit.tabs.attendance'), icon: 'calendar', id: 'audit-attendance-tab', ariaControls: 'audit-attendance-panel' })
  if (hasAnyPermission(['discipline.case.view', 'discipline.rule.view']))
    tabs.push({ value: 'discipline', label: t('opsAudit.tabs.discipline'), icon: 'flag', id: 'audit-discipline-tab', ariaControls: 'audit-discipline-panel' })
  if (hasPermission('prep.audit.view'))
    tabs.push({ value: 'preparation', label: t('opsAudit.tabs.preparation'), icon: 'hourglass', id: 'audit-preparation-tab', ariaControls: 'audit-preparation-panel' })

  return tabs
})

const requestedTab = String(route.query.tab ?? '') as AuditTab
const activeTab = ref<AuditTab>(['attendance', 'discipline', 'preparation'].includes(requestedTab) ? requestedTab : 'attendance')

function ensureAvailableTab() {
  if (!availableTabs.value.some(tab => tab.value === activeTab.value))
    activeTab.value = availableTabs.value[0]?.value ?? 'attendance'
}

watch(availableTabs, ensureAvailableTab, { immediate: true })
watch(() => route.query.tab, value => {
  if (['attendance', 'discipline', 'preparation'].includes(String(value))) {
    activeTab.value = String(value) as AuditTab
    ensureAvailableTab()
  }
})
watch(activeTab, value => {
  if (route.query.tab !== value)
    router.replace({ query: { ...route.query, tab: value } })
})

async function loadDashboard() {
  const requestId = ++dashboardRequestId

  dashboardError.value = ''
  if (!hasAnyPermission(['attendance.view', 'prep.audit.view'])) {
    dashboard.value = null
    loadingSummary.value = false
    return
  }
  loadingSummary.value = true
  try {
    const result = await operationsAuditApi.dashboard({ date_from: range.value.from, date_to: range.value.to })
    if (requestId === dashboardRequestId)
      dashboard.value = result
  }
  catch (error) {
    if (requestId === dashboardRequestId) {
      dashboard.value = null
      dashboardError.value = translate(error)
    }
  }
  finally {
    if (requestId === dashboardRequestId)
      loadingSummary.value = false
  }
}

async function loadEmployees() {
  const requestId = ++employeeRequestId

  employeeError.value = ''
  employeeSummaryReady.value = false
  if (!hasPermission('attendance.view')) {
    employees.value = []
    attendanceSummaryRows.value = []
    loadingEmployees.value = false
    return
  }
  loadingEmployees.value = true
  try {
    const rows = await operationsAuditApi.attendanceSummaryAll({
      date_from: range.value.from,
      date_to: range.value.to,
    })

    if (requestId === employeeRequestId) {
      attendanceSummaryRows.value = rows
      employees.value = rows.map(row => row.employee)
      employeeSummaryReady.value = true
    }
  }
  catch (error) {
    if (requestId === employeeRequestId) {
      employees.value = []
      attendanceSummaryRows.value = []
      employeeError.value = translate(error)
    }
  }
  finally {
    if (requestId === employeeRequestId)
      loadingEmployees.value = false
  }
}

async function refreshAll() {
  refreshKey.value += 1
  await Promise.all([loadDashboard(), loadEmployees()])
}

function onRangeChange(value: DateRangeValue) {
  range.value = value
  Promise.all([loadDashboard(), loadEmployees()])
}

function onChildChanged() {
  refreshKey.value += 1
  Promise.all([loadDashboard(), loadEmployees()])
}

onMounted(() => { Promise.all([loadDashboard(), loadEmployees()]) })

const periodMetrics = computed(() => employeeSummaryReady.value
  ? attendanceSummaryRows.value.reduce((totals, row) => {
    const penalties = row.raw?.penalties ?? {}

    totals.workedMinutes += row.workedMinutes
    totals.overtimeMinutes += row.overtimeMinutes
    totals.lateMinutes += row.lateMinutes
    totals.absentDays += row.absentDays
    totals.pendingCases += ['DRAFT', 'SUBMITTED', 'APPROVED_PENDING_PAYROLL']
      .reduce((count, status) => count + Number(penalties[status] ?? 0), 0)
    totals.pendingPenaltyUzs += row.pendingPenaltyUzs
    totals.approvedPenaltyUzs += row.approvedPenaltyUzs

    return totals
  }, {
    workedMinutes: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
    absentDays: 0,
    pendingCases: 0,
    pendingPenaltyUzs: 0,
    approvedPenaltyUzs: 0,
  })
  : null)

// Each tab exposes a different metric vocabulary while retaining a single KPI
// row for stable layout and loading behavior.
// eslint-disable-next-line sonarjs/cognitive-complexity
const kpis = computed(() => {
  if (activeTab.value === 'preparation') {
    return [
      { label: t('opsAudit.kpi.green'), value: dashboard.value?.preparationGreen ?? null, icon: 'check', tone: 'success' as const },
      { label: t('opsAudit.kpi.yellow'), value: dashboard.value?.preparationYellow ?? null, icon: 'clock', tone: 'warning' as const },
      { label: t('opsAudit.kpi.red'), value: dashboard.value?.preparationRed ?? null, icon: 'alert', tone: 'error' as const },
      {
        label: t('opsAudit.kpi.pendingReviews'),
        value: (dashboard.value === null || dashboard.value.preparationPendingYellow === null || dashboard.value.preparationPendingRed === null)
          ? null
          : dashboard.value.preparationPendingYellow + dashboard.value.preparationPendingRed,
        icon: 'edit',
        tone: 'warning' as const,
      },
    ]
  }
  if (activeTab.value === 'discipline') {
    return [
      { label: t('opsAudit.kpi.pendingCases'), value: periodMetrics.value?.pendingCases ?? null, icon: 'flag', tone: 'warning' as const },
      { label: t('opsAudit.kpi.pendingAmount'), value: periodMetrics.value?.pendingPenaltyUzs ?? null, icon: 'coins', tone: 'warning' as const, money: true },
      { label: t('opsAudit.kpi.approvedAmount'), value: periodMetrics.value?.approvedPenaltyUzs ?? null, icon: 'check', tone: 'error' as const, money: true },
      { label: t('opsAudit.kpi.absenceDays'), value: periodMetrics.value?.absentDays ?? null, icon: 'user', tone: 'neutral' as const },
    ]
  }

  return [
    { label: t('opsAudit.kpi.workedMinutes'), value: periodMetrics.value?.workedMinutes ?? null, icon: 'check', tone: 'success' as const },
    { label: t('opsAudit.kpi.lateMinutes'), value: periodMetrics.value?.lateMinutes ?? null, icon: 'clock', tone: 'warning' as const },
    { label: t('opsAudit.kpi.overtimeMinutes'), value: periodMetrics.value?.overtimeMinutes ?? null, icon: 'sparkle', tone: 'primary' as const },
    { label: t('opsAudit.kpi.absenceDays'), value: periodMetrics.value?.absentDays ?? null, icon: 'user', tone: 'error' as const },
  ]
})
</script>

<template>
  <div class="page audit-page">
    <PageHeader
      :title="t('opsAudit.title')"
      :subtitle="t('opsAudit.subtitle')"
    >
      <template #actions>
        <DateRangePicker
          v-model="range"
          :enable-time="false"
          :include-all="false"
          align="right"
          @change="onRangeChange"
        />
        <Button
          variant="secondary"
          icon="refresh"
          :loading="loadingSummary || loadingEmployees"
          @click="refreshAll"
        >
          {{ t('opsAudit.refresh') }}
        </Button>
      </template>
    </PageHeader>

    <StateFill
      v-if="availableTabs.length === 0"
      icon="lock"
      :title="t('opsAudit.noAccessTitle')"
      :sub="t('opsAudit.noAccessSubtitle')"
      error
    />

    <template v-else>
      <div class="audit-tabs">
        <Segmented
          v-model="activeTab"
          :options="availableTabs"
        />
      </div>

      <div
        class="audit-kpis"
        :aria-busy="loadingSummary || loadingEmployees"
      >
        <Kpi
          v-for="item in kpis"
          :key="item.label"
          :data="item"
        />
      </div>

      <div
        v-if="dashboardError"
        class="inline-alert"
        role="alert"
      >
        <DesignIcon
          name="alert"
          :size="18"
        />
        <span><strong>{{ t('opsAudit.summaryUnavailable') }}</strong> {{ dashboardError }}</span>
        <Button
          variant="ghost"
          size="sm"
          icon="retry"
          @click="loadDashboard"
        >
          {{ t('opsAudit.tryAgain') }}
        </Button>
      </div>
      <div
        v-if="employeeError"
        class="inline-alert"
        role="alert"
      >
        <DesignIcon
          name="alert"
          :size="18"
        />
        <span><strong>{{ t('opsAudit.employeesUnavailable') }}</strong> {{ employeeError }}</span>
        <Button
          variant="ghost"
          size="sm"
          icon="retry"
          @click="loadEmployees"
        >
          {{ t('opsAudit.tryAgain') }}
        </Button>
      </div>

      <AttendanceAuditPanel
        v-if="activeTab === 'attendance'"
        id="audit-attendance-panel"
        role="tabpanel"
        aria-labelledby="audit-attendance-tab"
        :date-from="range.from"
        :date-to="range.to"
        :employees="employees"
        :refresh-key="refreshKey"
        @changed="onChildChanged"
      />
      <DisciplineAuditPanel
        v-else-if="activeTab === 'discipline'"
        id="audit-discipline-panel"
        role="tabpanel"
        aria-labelledby="audit-discipline-tab"
        :date-from="range.from"
        :date-to="range.to"
        :employees="employees"
        :refresh-key="refreshKey"
        @changed="onChildChanged"
      />
      <PreparationAuditPanel
        v-else
        id="audit-preparation-panel"
        role="tabpanel"
        aria-labelledby="audit-preparation-tab"
        :date-from="range.from"
        :date-to="range.to"
        :employees="employees"
        :refresh-key="refreshKey"
        @changed="onChildChanged"
      />
    </template>
  </div>
</template>

<style scoped>
.audit-page { max-width: none; }
.audit-tabs { display: flex; margin-bottom: 14px; overflow-x: auto; scrollbar-width: thin; }
.audit-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.inline-alert { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid rgb(var(--v-theme-error-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-error-strong)); background: rgb(var(--v-theme-error-weak)); font-size: 13px; }
.inline-alert span { flex: 1; min-width: 0; }

@media (max-width: 1000px) {
  .audit-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .audit-kpis { grid-template-columns: 1fr; }
  .inline-alert { align-items: flex-start; flex-wrap: wrap; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  anyPermission:
    - attendance.view
    - discipline.case.view
    - discipline.rule.view
    - prep.audit.view
</route>
