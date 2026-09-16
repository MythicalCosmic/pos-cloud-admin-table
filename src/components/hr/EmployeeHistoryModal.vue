<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'

/* Salary and payment history for one employee: every monthly salary record
   (earned, fines, net, status, notes with advances) and the Safe/Bank payments
   that reference those records. */
import Badge from '@/components/design/Badge.vue'
import DataTable from '@/components/design/DataTable.vue'
import Modal from '@/components/design/Modal.vue'
import { fmtDate, fmtNum } from '@/components/design/utils/format'
import { staffName } from '@/utils/staff'
import defaultAxios, { hrApi } from '@/plugins/axios'

const props = defineProps<{
  open: boolean
  employee: any | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n({ useScope: 'global' })
const { formatDate } = useFormatters()

const salaries = ref<any[]>([])
const payments = ref<any[]>([])
const loading = ref(false)
const failed = ref(false)
const paymentsHidden = ref(false)

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
}

const name = computed(() => staffName(props.employee?.user, props.employee?.position) || '—')

const paidTotal = computed(() => salaries.value
  .filter(s => s.status === 'PAID')
  .reduce((sum, s) => sum + Number(s.net_amount || 0), 0))

const fineTotal = computed(() => salaries.value.reduce((sum, s) => sum + Number(s.deduction || 0), 0))

const lastPaid = computed(() => salaries.value
  .map(s => s.paid_at)
  .filter(Boolean)
  .sort()
  .at(-1) ?? null)

function money(v: number | string | null | undefined) {
  return (v === null || v === undefined || v === '') ? '—' : fmtNum(Number(v))
}

// Imported and reconciled records carry a leading "[TAG]" audit marker.
function readable(text: string | null | undefined) {
  return String(text || '').replace(/^\[[^\]]+\]\s*/, '')
}

function period(s: any) {
  return `${String(s.period_month).padStart(2, '0')}.${s.period_year}`
}

const salaryColumns = computed<DataTableColumn[]>(() => [
  { key: 'period', label: t('Period'), width: 100 },
  { key: 'base_amount', label: t('employee_history_earned'), align: 'right', width: 130 },
  { key: 'deduction', label: t('employee_history_fines'), align: 'right', width: 120 },
  { key: 'net_amount', label: t('employee_history_net'), align: 'right', width: 130 },
  { key: 'status', label: t('Status'), width: 120 },
  { key: 'paid_at', label: t('employee_history_paid_on'), width: 120 },
])

const paymentColumns = computed<DataTableColumn[]>(() => [
  { key: 'created_at', label: t('Date'), width: 150 },
  { key: 'account', label: t('employee_history_account'), width: 90 },
  { key: 'delta', label: t('Amount'), align: 'right', width: 130 },
  { key: 'description', label: t('Description') },
])

async function load() {
  const employee = props.employee
  if (!employee)
    return
  loading.value = true
  failed.value = false
  paymentsHidden.value = false
  salaries.value = []
  payments.value = []
  try {
    const res = await hrApi.get('/salaries/', { params: { employee_id: employee.id, per_page: 100 } })
    const d = res.data?.data ?? res.data

    salaries.value = (d?.salaries ?? []).filter((s: any) => s.employee_id === employee.id).sort((a: any, b: any) =>
      (b.period_year - a.period_year) || (b.period_month - a.period_month))
  }
  catch {
    failed.value = true
    loading.value = false
    return
  }
  try {
    const batches = await Promise.all(salaries.value.map(s => defaultAxios.get('/treasury/history', {
      params: { reference_type: 'SalaryPayment', reference_id: s.id, per_page: 100 },
    })))

    payments.value = batches
      .flatMap(res => (res.data?.data ?? res.data)?.transactions ?? [])
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
  }
  catch (e: any) {
    // Safe & Bank history needs its own permission; the salary list still stands.
    paymentsHidden.value = true
    if (e?.response?.status !== 403)
      failed.value = true
  }
  finally {
    loading.value = false
  }
}

watch(() => [props.open, props.employee?.id], ([open]) => {
  if (open)
    load()
}, { immediate: true })
</script>

<template>
  <Modal
    :open="open"
    :title="name"
    :subtitle="t('employee_history_subtitle')"
    width="880px"
    @close="emit('close')"
  >
    <div
      v-if="employee"
      class="emp-history"
    >
      <dl class="emp-history__facts">
        <div>
          <dt>{{ t('Position') }}</dt>
          <dd>{{ employee.position || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('hr_employees_col_base_salary') }}</dt>
          <dd class="mono">
            {{ money(employee.base_salary) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('employee_history_paid_total') }}</dt>
          <dd class="mono">
            {{ money(paidTotal) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('employee_history_fines_total') }}</dt>
          <dd class="mono">
            {{ money(fineTotal) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('employee_history_last_paid') }}</dt>
          <dd>{{ lastPaid ? fmtDate(lastPaid) : '—' }}</dd>
        </div>
      </dl>

      <p
        v-if="failed"
        class="emp-history__error"
        role="alert"
      >
        {{ t('employee_history_load_failed') }}
      </p>

      <section>
        <h3 class="emp-history__title">
          {{ t('employee_history_salaries') }}
        </h3>
        <DataTable
          :columns="salaryColumns"
          :rows="salaries"
          row-key="id"
          :loading="loading"
          :per-page="12"
          hide-single-page
          expandable
          :empty-title="t('employee_history_no_salaries')"
          empty-icon="wallet"
        >
          <template #cell.period="{ row }">
            <span class="cell-strong mono">{{ period(row) }}</span>
          </template>
          <template #cell.base_amount="{ row }">
            <span class="mono">{{ money(row.base_amount) }}</span>
          </template>
          <template #cell.deduction="{ row }">
            <span class="mono cell-muted">{{ Number(row.deduction) ? money(row.deduction) : '—' }}</span>
          </template>
          <template #cell.net_amount="{ row }">
            <span class="mono cell-strong">{{ money(row.net_amount) }}</span>
          </template>
          <template #cell.status="{ row }">
            <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
              {{ t(`salary_status_${row.status}`) }}
            </Badge>
          </template>
          <template #cell.paid_at="{ row }">
            <span class="cell-muted">{{ row.paid_at ? fmtDate(row.paid_at) : '—' }}</span>
          </template>
          <template #expanded="{ row }">
            <p class="emp-history__notes">
              {{ readable(row.notes) || t('employee_history_no_notes') }}
            </p>
          </template>
        </DataTable>
      </section>

      <section v-if="!paymentsHidden">
        <h3 class="emp-history__title">
          {{ t('employee_history_payments') }}
        </h3>
        <DataTable
          :columns="paymentColumns"
          :rows="payments"
          row-key="id"
          :loading="loading"
          :per-page="10"
          hide-single-page
          :empty-title="t('employee_history_no_payments')"
          empty-icon="wallet"
        >
          <template #cell.created_at="{ row }">
            <span class="cell-muted">{{ formatDate(row.created_at) }}</span>
          </template>
          <template #cell.account="{ row }">
            <Badge tone="neutral">
              {{ row.account === 'BANK' ? t('owner_bank') : t('owner_safe') }}
            </Badge>
          </template>
          <template #cell.delta="{ row }">
            <span class="mono cell-strong">{{ money(Math.abs(Number(row.delta))) }}</span>
          </template>
          <template #cell.description="{ row }">
            <span class="emp-history__desc">{{ readable(row.description) || '—' }}</span>
          </template>
        </DataTable>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.emp-history { display: grid; gap: 18px; }
.emp-history__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0; }
.emp-history__facts > div { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2, var(--surface)); min-width: 0; }
.emp-history__facts dt { color: var(--text-muted); font-size: 12px; }
.emp-history__facts dd { margin: 2px 0 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.emp-history__title { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.emp-history__notes { margin: 0; white-space: pre-wrap; font-size: 13px; line-height: 1.5; color: var(--text-secondary, var(--text)); }
.emp-history__desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; }
.emp-history__error { margin: 0; padding: 10px 12px; border-radius: 10px; color: var(--danger-strong, var(--danger)); background: var(--danger-weak, transparent); font-size: 13px; }
</style>
