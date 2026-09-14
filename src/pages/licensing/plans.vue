<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   LICENSING — PLANS
   Subscription plans browser w/ change-request flow. Extends the
   existing licensing/status.vue by rendering the current license
   state as a top status card, then a plans tab below where the
   user can pick a plan + submit a vendor-approval request.
   Plain HTML + design primitives, no Vuetify.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { licensingApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Segmented from '@/components/design/Segmented.vue'
import Select from '@/components/design/Select.vue'
import { fmtNum, NB } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDate } = useFormatters()

// ============================================================
// State
// ============================================================
const plans = ref<any[]>([])
const totalPlans = ref(0)
const loadingPlans = ref(false)
const plansUnreachable = ref(false)

const licenseState = ref<any>(null)
const loadingStatus = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const periodFilter = ref<string>('')

const tab = ref<'plans' | 'status'>('plans')

// Plan-change modal state
const changeOpen = ref(false)
const changeBusy = ref(false)
const changeTarget = ref<any>(null)
const changeNote = ref('')
const changeErrors = ref<Record<string, string>>({})

const PERIOD_VALUES = ['monthly', 'yearly', 'quarterly', 'lifetime']

// Map BE `period_days` integer → categorical period label.
// BE serializes `period_days` (int) on plans; map to a category so
// existing i18n keys (`plan_period_monthly` etc.) keep working.
function periodCategoryFromDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return ''
  const n = Number(days)
  if (!Number.isFinite(n)) return ''
  if (n <= 31) return 'monthly'
  if (n <= 95) return 'quarterly'
  if (n <= 370) return 'yearly'

  return 'lifetime'
}

// ============================================================
// Enum -> tone maps (mirror STATUS_TONE convention)
// ============================================================
const STATUS_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  DEPRECATED: 'warning',
  DRAFT: 'info',
}

const CURRENT_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  CURRENT: 'success',
  PENDING: 'warning',
  AVAILABLE: 'neutral',
}

const PERIOD_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  monthly: 'primary',
  yearly: 'success',
  quarterly: 'info',
  lifetime: 'warning',
}

const LICENSE_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success',
  UNREGISTERED: 'warning',
  SUSPENDED: 'error',
  EXPIRED: 'error',
}

// ============================================================
// Formatters
// ============================================================
function fmtMoney(n: number | string | null | undefined, currency?: string): string {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
    return '—'
  const s = fmtNum(Number(n))
  if (s === '—')
    return s

  return `${s}${currency ? `${NB}${currency}` : ''}`
}

// ============================================================
// API
// ============================================================
async function loadStatus() {
  loadingStatus.value = true
  try {
    const res = await licensingApi.get('/status')
    licenseState.value = res.data?.data ?? res.data
  }
  catch {
    licenseState.value = null
  }
  finally {
    loadingStatus.value = false
  }
}

async function loadPlans() {
  loadingPlans.value = true
  plansUnreachable.value = false
  try {
    // BE /api/v1/plans always returns is_active=True plans server-side and
    // SubscriptionPlan has no `currency` or categorical `period` columns —
    // currency / is_active filters are no-ops, and period is filtered
    // client-side from period_days. Only forward search + pagination.
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value

    const res = await licensingApi.get('/plans', { params })
    const d = res.data?.data ?? res.data
    const rawRows = d?.plans ?? d?.results ?? d?.items ?? (Array.isArray(d) ? d : [])
    const rows = periodFilter.value
      ? rawRows.filter((r: any) => periodCategoryFromDays(r.period_days) === periodFilter.value)
      : rawRows

    plans.value = rows
    totalPlans.value = periodFilter.value
      ? rows.length
      : (d?.pagination?.total_items ?? d?.count ?? d?.total ?? rows.length)
  }
  catch {
    plans.value = []
    totalPlans.value = 0
    plansUnreachable.value = true
    notify(t('license_plans_unreachable'), 'error')
  }
  finally {
    loadingPlans.value = false
  }
}

onMounted(() => {
  loadStatus()
  loadPlans()
})

watch([page, itemsPerPage], loadPlans)
const debouncedSearch = useDebounceFn(() => { page.value = 1; loadPlans() }, 400)

watch(search, debouncedSearch)
watch([periodFilter], () => { page.value = 1; loadPlans() })

// ============================================================
// Plan-change request
// ============================================================
function openChange(row: any) {
  // Guards: can't switch to current, can't open while pending (BE returns
  // PLAN_CHANGE_ALREADY_PENDING code on submit if a request is in-flight —
  // /status doesn't expose pending_plan_change, so we can't pre-check here).
  if (isCurrentPlan(row))
    return
  if (licenseState.value?.status === 'UNREGISTERED') {
    notify(t('plan_change_unregistered'), 'error')

    return
  }
  changeTarget.value = row
  changeNote.value = ''
  changeErrors.value = {}
  changeOpen.value = true
}

function closeChange() {
  if (changeBusy.value) return
  changeOpen.value = false
  changeTarget.value = null
  changeNote.value = ''
  changeErrors.value = {}
}

async function submitChange() {
  if (!changeTarget.value) return
  const errs: Record<string, string> = {}

  if (!changeTarget.value.id)
    errs.plan_id = t('plan_name')
  changeErrors.value = errs
  if (Object.keys(errs).length > 0)
    return

  changeBusy.value = true
  try {
    await licensingApi.post('/plan-change', {
      plan_id: changeTarget.value.id,
      note: changeNote.value || '',
    })
    notify(t('plan_change_success'))
    changeOpen.value = false
    changeTarget.value = null
    changeNote.value = ''
    await loadStatus()
    await loadPlans()
  }
  catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 'PLAN_CHANGE_ALREADY_PENDING')
      notify(t('plan_change_already_pending'), 'error')
    else if (code === 'UNREGISTERED')
      notify(t('plan_change_unregistered'), 'error')
    else
      notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    changeBusy.value = false
  }
}

// ============================================================
// Derived
// ============================================================
function planRowFlag(_row: any): 'CURRENT' | 'PENDING' | 'AVAILABLE' {
  // BE /status doesn't expose current_plan_id or pending_plan_change, so we
  // can't derive CURRENT/PENDING per-row from the status payload. The page
  // still keeps the column / Badge so the table layout matches; everything
  // resolves to AVAILABLE until BE adds those fields.
  return 'AVAILABLE'
}

function isCurrentPlan(row: any): boolean {
  return planRowFlag(row) === 'CURRENT'
}

function isPendingPlan(row: any): boolean {
  return planRowFlag(row) === 'PENDING'
}

const currentPlan = computed(() =>
  plans.value.find(p => planRowFlag(p) === 'CURRENT') ?? null,
)

const pendingPlan = computed(() =>
  plans.value.find(p => planRowFlag(p) === 'PENDING') ?? null,
)

// ============================================================
// Filter chips
// ============================================================
const activeFilters = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (search.value)
    out.push({ k: 'q', label: t('Search'), val: search.value, clear: () => { search.value = '' } })
  if (periodFilter.value)
    out.push({ k: 'p', label: t('license_filter_period'), val: t(`plan_period_${periodFilter.value}`), clear: () => { periodFilter.value = '' } })

  return out
})

function clearAllFilters() {
  search.value = ''
  periodFilter.value = ''
}

// ============================================================
// Filter options
// ============================================================
const periodOptions = computed(() =>
  PERIOD_VALUES.map(v => ({ value: v, label: t(`plan_period_${v}`) })),
)

// ============================================================
// KPI strip — license summary
// ============================================================
const kpiStatus = computed(() => ({
  label: t('license_status_label'),
  value: licenseState.value?.status ? t(`license_status_${licenseState.value.status}`) : null,
  icon: 'lock',
  tone: (LICENSE_TONE[licenseState.value?.status] ?? 'neutral') as any,
  // BE /status intentionally omits tenant identity (org_name/email) — see
  // docstring. Leave blank rather than reaching for a missing nested object.
  sub: '',
}))

const kpiCurrent = computed(() => {
  // BE serializes `period_days` (int), not categorical `period`. Map to a
  // category client-side so the existing i18n keys still resolve.
  const cat = periodCategoryFromDays(currentPlan.value?.period_days)

  return {
    label: t('license_current_plan'),
    // BE /status doesn't expose current_plan — derive from plans list only.
    value: currentPlan.value?.name ?? null,
    icon: 'star',
    tone: 'primary' as const,
    sub: cat ? t(`plan_period_${cat}`) : '',
  }
})

const kpiBalance = computed(() => ({
  label: t('license_balance'),
  value: licenseState.value ? (licenseState.value.balance ?? 0) : null,
  icon: 'wallet',
  tone: 'success' as const,
  money: true,
  // BE returns balance as a bare string — no currency field on /status.
  sub: '',
}))

const kpiExpires = computed(() => ({
  label: t('license_days_remaining'),
  value: licenseState.value?.days_remaining ?? null,
  icon: 'calendar',
  tone: 'info' as const,
  sub: licenseState.value?.expires_at ? formatDate(licenseState.value.expires_at) : '',
}))

// BE /status exposes a `warn` boolean — show the low-balance callout when it's set.
const showLowBalance = computed(() => !!licenseState.value?.warn)

// ============================================================
// DataTable columns
// ============================================================
// BE _serialize_plan exposes: id, name, description, price, period_days, is_active.
// No `currency`, `features`, or categorical `status` fields — those columns
// were dropped. `period_days` is mapped to a category client-side.
const columns: DataTableColumn<any>[] = [
  { key: 'name', label: t('plan_name'), sortable: true },
  { key: 'description', label: t('plan_description'), sortable: false },
  { key: 'price', label: t('plan_price'), sortable: true, align: 'right' },
  { key: 'period_days', label: t('plan_period_label'), sortable: true },
  { key: 'status', label: t('Status'), sortable: true },
  { key: 'is_current', label: t('license_current_status'), sortable: false },
]

const tablePagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalPlans.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// ============================================================
// Tabs
// ============================================================
const tabOptions = computed(() => [
  { value: 'plans', label: t('license_plans_title'), icon: 'package' },
  { value: 'status', label: t('license_status_label'), icon: 'lock' },
])

// ESC handler — close modal first
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (changeOpen.value) {
    closeChange()
    e.preventDefault()
  }
}
onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <WorkspacePage class="page">
    <!-- Header -->
    <PageHeader
      :title="t('license_plans_title')"
      :subtitle="t('license_plans_subtitle')"
    >
      <template #actions>
        <Button
          variant="ghost"
          icon="refresh"
          :loading="loadingPlans || loadingStatus"
          @click="() => { loadStatus(); loadPlans() }"
        >
          {{ t('license_action_refresh') }}
        </Button>
        <Button
          variant="secondary"
          icon="lock"
          @click="tab = 'status'"
        >
          {{ t('license_action_view_status') }}
        </Button>
      </template>
    </PageHeader>

    <!-- License summary strip -->
    <div
      class="grid cols-4 kpi-strip"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiStatus" />
      <Kpi :data="kpiCurrent" />
      <Kpi :data="kpiBalance" />
      <Kpi :data="kpiExpires" />
    </div>

    <!-- Low-balance warning -->
    <div
      v-if="showLowBalance"
      class="callout callout--warning"
      style="margin-bottom: var(--sp-4); display:flex; gap:10px; align-items:center; padding:12px 14px; border-radius:10px; background: rgba(var(--v-theme-warning, 245 158 11) / 0.08); border:1px solid rgba(var(--v-theme-warning, 245 158 11) / 0.28);"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span>{{ t('license_top_up_warn') }}</span>
    </div>

    <!-- Pending-change notice (BE /status doesn't expose pending_plan_change) -->
    <div
      v-if="pendingPlan"
      class="callout callout--info"
      style="margin-bottom: var(--sp-4); display:flex; gap:10px; align-items:center; padding:12px 14px; border-radius:10px; background: rgba(var(--v-theme-info, 14 165 233) / 0.08); border:1px solid rgba(var(--v-theme-info, 14 165 233) / 0.28);"
    >
      <DesignIcon
        name="clock"
        :size="18"
      />
      <span>
        {{ t('license_pending_change') }}
        <strong v-if="pendingPlan">
          — {{ pendingPlan.name }}
        </strong>
      </span>
    </div>

    <!-- Tabs -->
    <div style="margin-bottom: var(--sp-3);">
      <Segmented
        v-model="tab"
        :options="tabOptions as any"
      />
    </div>

    <!-- ============================================================
         PLANS TAB
         ============================================================ -->
    <Card v-if="tab === 'plans'">
      <!-- Toolbar -->
      <WorkspaceToolbar class="toolbar plans-toolbar">
        <Input
          v-model="search"
          class="plans-toolbar__search"
          icon="search"
          :placeholder="t('Search')"
        />
        <Select
          v-model="periodFilter"
          class="plans-toolbar__select plans-toolbar__select--lg"
          icon="filter"
          :placeholder="t('license_filter_period')"
          :options="periodOptions"
        />
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

      <!-- Table -->
      <DataTable
        :columns="columns"
        :rows="plans"
        row-key="id"
        :loading="loadingPlans"
        :pagination="tablePagination"
        :initial-sort="{ key: 'price', dir: 'asc' }"
      >
        <template #cell.name="{ row }">
          <div
            class="row"
            style="gap:8px; align-items:center;"
          >
            <span class="cell-strong nowrap">{{ row.name }}</span>
            <Badge
              v-if="isCurrentPlan(row)"
              tone="success"
              dot
            >
              {{ t('license_current_plan') }}
            </Badge>
          </div>
        </template>

        <template #cell.description="{ row }">
          <span class="cell-muted">{{ row.description || '—' }}</span>
        </template>

        <template #cell.price="{ row }">
          <span class="mono cell-strong">{{ fmtMoney(row.price) }}</span>
        </template>

        <template #cell.period_days="{ row }">
          <!-- BE returns `period_days` int. Derive a category client-side so
               existing i18n keys (`plan_period_monthly` etc.) resolve. -->
          <Badge :tone="PERIOD_TONE[periodCategoryFromDays(row.period_days)] || 'neutral'">
            {{ periodCategoryFromDays(row.period_days)
              ? t(`plan_period_${periodCategoryFromDays(row.period_days)}`)
              : '—' }}
          </Badge>
        </template>

        <template #cell.status="{ row }">
          <!-- BE plan has no categorical `status` — only `is_active: bool`. -->
          <Badge
            :tone="STATUS_TONE[row.is_active ? 'ACTIVE' : 'INACTIVE'] || 'neutral'"
          >
            {{ t(`plan_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>

        <template #cell.is_current="{ row }">
          <Badge
            :tone="CURRENT_TONE[planRowFlag(row)] || 'neutral'"
            dot
          >
            {{ t(`plan_current_${planRowFlag(row)}`) }}
          </Badge>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            v-if="!isCurrentPlan(row) && !isPendingPlan(row)"
            icon="send"
            tone="primary"
            :title="t('plan_choose_action')"
            @click="openChange(row)"
          />
          <IconAction
            v-else-if="isPendingPlan(row)"
            icon="clock"
            tone="warning"
            :title="t('license_pending_change')"
            :disabled="true"
          />
          <IconAction
            v-else
            icon="check"
            tone="success"
            :title="t('license_current_plan')"
            :disabled="true"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                :name="plansUnreachable ? 'alert' : 'package'"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ plansUnreachable ? t('license_plans_unreachable') : t('license_plans_empty') }}
            </div>
            <div style="margin-top:12px;">
              <Button
                variant="secondary"
                icon="refresh"
                @click="loadPlans"
              >
                {{ t('license_action_refresh') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- ============================================================
         STATUS TAB — mirrors licensing/status.vue using design system
         ============================================================ -->
    <Card v-else>
      <div style="padding: var(--sp-4);">
        <div
          v-if="loadingStatus && !licenseState"
          class="row"
          style="gap:12px; align-items:center;"
        >
          <div
            class="sk-box"
            style="width:120px;height:24px;border-radius:12px;"
          />
          <div
            class="sk-box"
            style="width:200px;height:14px;border-radius:4px;"
          />
        </div>

        <div v-else-if="licenseState">
          <div
            class="row"
            style="gap:14px; align-items:center; margin-bottom: var(--sp-3);"
          >
            <Badge
              :tone="LICENSE_TONE[licenseState.status] || 'neutral'"
            >
              {{ t(`license_status_${licenseState.status}`) }}
            </Badge>
            <Badge
              v-if="licenseState.is_blocked"
              tone="error"
              dot
            >
              {{ t('license_kill_switch_active') }}
            </Badge>
          </div>

          <div
            class="form-grid"
            style="gap: var(--sp-3);"
          >
            <!-- BE /status intentionally omits tenant identity (org_name/email).
                 Authenticated callers must use the admin tenant endpoints instead. -->
            <Field :label="t('license_expires_at')">
              <div class="cell-strong">
                {{ licenseState.expires_at ? formatDate(licenseState.expires_at) : '—' }}
              </div>
            </Field>
            <Field :label="t('license_balance')">
              <div class="mono cell-strong">
                {{ fmtMoney(licenseState.balance) }}
              </div>
            </Field>
            <Field :label="t('license_current_plan')">
              <div class="cell-strong">
                {{ currentPlan?.name ?? '—' }}
              </div>
            </Field>
            <Field :label="t('license_days_remaining')">
              <div class="mono cell-strong">
                {{ licenseState.days_remaining ?? '—' }}
              </div>
            </Field>
            <Field
              v-if="licenseState.last_heartbeat_at"
              :label="t('license_last_heartbeat')"
            >
              <div class="cell-strong">
                {{ formatDate(licenseState.last_heartbeat_at) }}
              </div>
            </Field>
            <Field
              v-if="licenseState.grace_until"
              :label="t('license_grace_until')"
            >
              <div class="cell-strong">
                {{ formatDate(licenseState.grace_until) }}
              </div>
            </Field>
          </div>

          <div
            v-if="licenseState.message"
            style="margin-top: var(--sp-4); padding: 12px 14px; border-radius: 10px; background: rgba(var(--v-theme-info, 14 165 233) / 0.08); border:1px solid rgba(var(--v-theme-info, 14 165 233) / 0.28);"
          >
            {{ licenseState.message }}
          </div>

          <div
            v-if="licenseState.status === 'UNREGISTERED'"
            style="margin-top: var(--sp-4); display:flex; gap:8px;"
          >
            <Button
              variant="primary"
              icon="lock"
              @click="$router.push('/licensing/setup')"
            >
              {{ t('license_run_setup') }}
            </Button>
          </div>
        </div>

        <div
          v-else
          class="statefill"
        >
          <div class="statefill__icon">
            <DesignIcon
              name="alert"
              :size="24"
            />
          </div>
          <div class="statefill__title">
            {{ t('license_plans_unreachable') }}
          </div>
          <div style="margin-top:12px;">
            <Button
              variant="secondary"
              icon="refresh"
              @click="loadStatus"
            >
              {{ t('license_action_refresh') }}
            </Button>
          </div>
        </div>
      </div>
    </Card>

    <!-- ============================================================
         CHANGE-REQUEST MODAL
         ============================================================ -->
    <Modal
      :open="changeOpen"
      :title="t('plan_change_request_title')"
      :subtitle="changeTarget ? changeTarget.name : ''"
      :width="520"
      @close="closeChange"
    >
      <form @submit.prevent="submitChange">
        <div class="form-grid">
          <Field
            :label="t('plan_name')"
            class="span-2"
          >
            <Input
              class="is-disabled"
              icon="package"
              :model-value="changeTarget?.name ?? ''"
              disabled
            />
          </Field>

          <Field :label="t('plan_price')">
            <div class="mono cell-strong">
              <!-- BE _serialize_plan exposes no currency — drop the suffix. -->
              {{ fmtMoney(changeTarget?.price) }}
            </div>
          </Field>

          <Field :label="t('plan_period_label')">
            <!-- BE returns period_days (int) — map to category for i18n key. -->
            <Badge :tone="PERIOD_TONE[periodCategoryFromDays(changeTarget?.period_days)] || 'neutral'">
              {{ periodCategoryFromDays(changeTarget?.period_days)
                ? t(`plan_period_${periodCategoryFromDays(changeTarget?.period_days)}`)
                : '—' }}
            </Badge>
          </Field>

          <Field
            :label="t('plan_change_note_label')"
            class="span-2"
            :error="changeErrors.note"
          >
            <Textarea
              v-model="changeNote"
              class="control control--textarea"
              rows="3"
              :placeholder="t('plan_change_note_label')"
              style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border, rgba(255,255,255,0.12)); background: var(--surface-2, transparent); color: var(--text-primary); font: inherit; resize: vertical;"
            />
          </Field>

          <div
            class="span-2"
            style="display:flex; gap:10px; padding:10px 12px; border-radius:8px; background: rgba(var(--v-theme-info, 14 165 233) / 0.06); border:1px solid rgba(var(--v-theme-info, 14 165 233) / 0.2);"
          >
            <DesignIcon
              name="info"
              :size="16"
            />
            <span style="font-size:13px;">
              {{ t('license_plans_subtitle') }}
            </span>
          </div>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="send"
          :loading="changeBusy"
          :disabled="changeBusy"
          @click="submitChange"
        >
          {{ t('plan_change_submit') }}
        </Button>
      </template>
    </Modal>

    <!-- Notify snackbar (Vuetify, project-wide pattern preserved) -->
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
.plans-toolbar {
  flex-wrap: wrap;
}
.plans-toolbar__search {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}
.plans-toolbar__select--md {
  width: 180px;
}
.plans-toolbar__select--lg {
  width: 200px;
}

/* Canonical 1024px tablet — KPI 4-up may compact */
@media (max-width: 1024px) {
  .kpi-strip {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}

/* Canonical 768px phone — KPI stays 2-up, toolbar stacks, modal collapses */
@media (max-width: 768px) {
  .kpi-strip {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .plans-toolbar__search,
  .plans-toolbar__select--md,
  .plans-toolbar__select--lg,
  .plans-toolbar__switch {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
  }
}

/* Canonical 420px small phone — KPI collapses to single column */
@media (max-width: 420px) {
  .kpi-strip {
    grid-template-columns: 1fr !important;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
