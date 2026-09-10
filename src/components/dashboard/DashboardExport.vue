<script setup lang="ts">
import { toast } from 'vue-sonner'
import ProductReportExport from '@/components/reports/ProductReportExport.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { fmtDate } from '@/components/design/utils/format'
import { useDashboardData } from '@/composables/useDashboardData'
import { buildDateParams } from '@/composables/useBusinessDay'
import { dashboardSnapshotCsv } from '@/services/dashboardExport'
import { exportProductPerformance, reportRangeError } from '@/services/productPerformance'
import { PRODUCT_REPORT_FORMATS, type ProductReportFilters, type ProductReportFormat } from '@/types/productPerformance'
import { downloadBlob } from '@/utils/download'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { isAdministrator, isManager } = useUserAccess()
const { shared, range, resolvedRange, loading, error, lastFetchedAt } = useDashboardData()
const busy = reactive(new Set<ProductReportFormat>())
const canReport = computed(() => isAdministrator.value || isManager.value)
const formats = computed(() => canReport.value ? [...PRODUCT_REPORT_FORMATS] : [])
const bounds = computed(() => buildDateParams(range.value))
const exactTime = computed(() => !!bounds.value.from_at)

const reportDates = computed(() => ({
  from: (!exactTime.value && resolvedRange.value?.from) || range.value?.from || '',
  to: (!exactTime.value && resolvedRange.value?.to) || range.value?.to || '',
}))

const invalidRange = computed(() => reportRangeError(reportDates.value.from, reportDates.value.to))
const snapshotUnavailable = computed(() => loading.value || !!error.value || !shared.value)
const dateLabel = computed(() => [reportDates.value.from, reportDates.value.to].map(date => date ? fmtDate(`${date}T12:00:00`) : '—').join(' — '))

async function downloadReport(format: ProductReportFormat) {
  if (!canReport.value || invalidRange.value || busy.has(format))
    return

  // Freeze the applied business dates when clicked, even if filters change
  // while the server is preparing this particular format.
  const filters: ProductReportFilters = { preset: 'custom', ...reportDates.value, sort: 'highest_revenue' }

  busy.add(format)
  try {
    const file = await exportProductPerformance(filters, format)

    downloadBlob(file.blob, file.filename)
    toast.success(t('report_download_ready', { filename: file.filename }))
    if (file.costComplete === false)
      toast.warning(t('dash_export_cost_notice'), { description: t('report_cost_warning_body') })
  }
  catch (failure) {
    const status = (failure as { response?: { status?: number } })?.response?.status

    toast.error(t('dash_export_failed'), { description: status === 404 ? t('report_unavailable_body') : translate(failure) })
  }
  finally { busy.delete(format) }
}

function downloadSnapshot(close: (restore?: boolean) => void) {
  if (snapshotUnavailable.value || !shared.value)
    return
  try {
    const metadata = resolvedRange.value

    const csv = dashboardSnapshotCsv(shared.value, {
      from: range.value?.from ?? '',
      to: range.value?.to ?? '',
      startAt: metadata?.start_at ?? bounds.value.from_at,
      endAt: metadata?.end_at ?? bounds.value.to_at,
      timezone: metadata?.timezone ?? 'Asia/Tashkent',
      generatedAt: new Date().toISOString(),
      fetchedAt: lastFetchedAt.value ? new Date(lastFetchedAt.value).toISOString() : undefined,
    }, t)

    const interval = exactTime.value ? `-${range.value?.fromTime?.replace(':', '')}-${range.value?.toTime?.replace(':', '')}` : ''
    const filename = `dashboard-${range.value?.from}-${range.value?.to}${interval}.csv`

    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
    close(true)
    toast.success(t('report_download_ready', { filename }))
  }
  catch (failure) {
    toast.error(t('dash_export_failed'), { description: translate(failure) })
  }
}
</script>

<template>
  <ProductReportExport
    class="dashboard-export"
    :busy="busy"
    :formats="formats"
    :formats-disabled="!!invalidRange"
    @export="downloadReport"
  >
    <template #intro>
      <div
        class="dashboard-export__intro"
        role="none"
      >
        <strong>{{ t(canReport ? 'report_title' : 'dash_export_snapshot') }}</strong>
        <span class="dashboard-export__dates">{{ dateLabel }}</span>
        <template v-if="canReport">
          <span>{{ t('dash_export_report_scope') }}</span>
          <span>{{ t('report_business_window') }}</span>
        </template>
      </div>
      <p
        v-if="canReport && (exactTime || invalidRange)"
        class="dashboard-export__notice"
        role="status"
      >
        {{ invalidRange ? t(`report_error_${invalidRange}`) : t('dash_export_time_notice') }}
      </p>
    </template>
    <template #footer="{ close }">
      <div class="dashboard-export__snapshot">
        <button
          type="button"
          role="menuitem"
          :disabled="snapshotUnavailable"
          @click="downloadSnapshot(close)"
        >
          <DesignIcon
            name="dashboard"
            :size="17"
          />
          <span>{{ t('dash_export_snapshot') }} <small>CSV</small></span>
          <DesignIcon
            name="download"
            :size="15"
          />
        </button>
        <p>{{ t(snapshotUnavailable ? 'dash_export_snapshot_unavailable' : 'dash_export_snapshot_hint') }}</p>
      </div>
    </template>
  </ProductReportExport>
</template>

<style scoped>
.dashboard-export { --export-menu-width: 324px; }
.dashboard-export__intro { display: grid; gap: 5px; padding: 9px 10px 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.dashboard-export__intro strong { color: var(--text); font-size: 14px; font-weight: 650; }
.dashboard-export__dates { color: var(--text); font-variant-numeric: tabular-nums; }
.dashboard-export__notice { margin: 0 5px 7px; padding: 9px; border-radius: 6px; color: rgb(var(--v-theme-warning-strong)); background: rgb(var(--v-theme-warning-weak)); font-size: 12px; line-height: 1.5; }
.dashboard-export__snapshot { border-block-start: 1px solid var(--border); margin-block-start: 5px; padding-block-start: 5px; }
.dashboard-export__snapshot button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 8px 10px; border-radius: 7px; text-align: start; color: var(--text); font-size: 12px; }
.dashboard-export__snapshot button > svg { flex-shrink: 0; }
.dashboard-export__snapshot button > :last-child { margin-inline-start: auto; }
.dashboard-export__snapshot small { font: 500 10px var(--font-mono); color: var(--text-secondary); margin-inline-start: 4px; }
.dashboard-export__snapshot button:hover:not(:disabled), .dashboard-export__snapshot button:focus-visible { background: var(--primary-weak); color: var(--primary); outline: none; }
.dashboard-export__snapshot button:disabled { opacity: .6; }
.dashboard-export__snapshot p { margin: 0 10px 9px; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
</style>
