<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { EmployeeRef, PreparationAudit, PreparationAuditCategory } from '@/types/operationsAudit'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Modal from '@/components/design/Modal.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Textarea from '@/components/design/Textarea.vue'
import { operationsAuditApi } from '@/services/operationsAuditApi'
import { useUserAccess } from '@/composables/useUserAccess'

interface Props {
  dateFrom: string
  dateTo: string
  employees: EmployeeRef[]
  refreshKey?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const { t, te, locale } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { hasPermission } = useUserAccess()

const page = ref(1)
const perPage = ref(20)
const rows = ref<PreparationAudit[]>([])
const total = ref(0)
const categories = ref<PreparationAuditCategory[]>([])
const loading = ref(false)
const categoriesLoading = ref(false)
const errorMessage = ref('')
const categoryError = ref('')
const performanceFilter = ref('')
const reviewFilter = ref('PENDING')
let loadRequestId = 0
let categoryRequestId = 0

const canReview = computed(() => hasPermission('prep.audit.review'))
const canReopen = computed(() => hasPermission('prep.audit.reopen'))

const performanceOptions = computed(() => ['ON_TIME', 'SLIGHTLY_LATE', 'VERY_LATE', 'UNTRACKED'].map(status => ({
  value: status,
  label: t(`opsAudit.preparationStatus.${status}`),
})))

const reviewOptions = computed(() => ['PENDING', 'COMPLETED', 'EXCUSED', 'NOT_REQUIRED'].map(status => ({
  value: status,
  label: t(`opsAudit.reviewStatus.${status}`),
})))

const categoryOptions = computed(() => categories.value.map(category => ({
  value: String(category.id),
  label: localizedCategoryLabel(category.code, category.label),
  keywords: category.code,
})))

const employeeOptions = computed(() => props.employees.map(employee => ({ value: String(employee.id), label: employee.name })))

function performanceTone(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ON_TIME')
    return 'success'
  if (status === 'SLIGHTLY_LATE')
    return 'warning'
  if (status === 'VERY_LATE')
    return 'error'

  return 'neutral'
}

function reviewTone(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (status === 'COMPLETED')
    return 'success'
  if (status === 'PENDING')
    return 'warning'
  if (status === 'EXCUSED')
    return 'info'

  return 'neutral'
}

function minutes(seconds: number): string {
  const value = Math.max(0, Number(seconds) || 0) / 60
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10

  return t('opsAudit.minutes', { count: rounded })
}

function formatDateTime(value?: string | null): string {
  if (!value)
    return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value

  return new Intl.DateTimeFormat(locale.value === 'uz' ? 'uz-UZ' : locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent',
  }).format(parsed)
}

function categoryLabel(code?: string | null): string {
  if (!code)
    return '—'
  const category = categories.value.find(item => item.code === code || String(item.id) === code)

  return localizedCategoryLabel(category?.code ?? code, category?.label)
}

function localizedCategoryLabel(code: string, fallback = ''): string {
  const key = `opsAudit.preparationCategory.${code}`

  return te(key) ? t(key) : (fallback || code)
}

async function loadCategories() {
  const requestId = ++categoryRequestId

  categoriesLoading.value = true
  categoryError.value = ''
  try {
    const result = await operationsAuditApi.preparationCategories()
    if (requestId === categoryRequestId)
      categories.value = result
  }
  catch (error) {
    if (requestId === categoryRequestId)
      categoryError.value = translate(error)
  }
  finally {
    if (requestId === categoryRequestId)
      categoriesLoading.value = false
  }
}

async function load() {
  const requestId = ++loadRequestId

  loading.value = true
  errorMessage.value = ''
  try {
    const result = await operationsAuditApi.preparationAudits({
      date_from: props.dateFrom,
      date_to: props.dateTo,
      performance_status: performanceFilter.value || undefined,
      review_status: reviewFilter.value || undefined,
      page: page.value,
      per_page: perPage.value,
    })

    if (requestId !== loadRequestId)
      return
    rows.value = result.items.map(row => ({
      ...row,
      responsibleEmployee: row.responsibleEmployee
        ? props.employees.find(employee => String(employee.id) === String(row.responsibleEmployee?.id)) ?? row.responsibleEmployee
        : null,
    }))
    total.value = result.total
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

onMounted(() => { loadCategories() })
watch(
  () => [props.dateFrom, props.dateTo, props.refreshKey, performanceFilter.value, reviewFilter.value, page.value, perPage.value],
  () => { load() },
  { immediate: true },
)
watch([performanceFilter, reviewFilter], () => { page.value = 1 })

const columns = computed<DataTableColumn<PreparationAudit>[]>(() => [
  { key: 'status', label: t('opsAudit.columns.preparationStatus'), width: 155 },
  { key: 'order', label: t('opsAudit.columns.order'), width: 115 },
  { key: 'readyAt', label: t('opsAudit.columns.readyAt'), width: 150 },
  { key: 'elapsed', label: t('opsAudit.columns.spent'), align: 'right', width: 110 },
  { key: 'target', label: t('opsAudit.columns.target'), align: 'right', width: 110 },
  { key: 'cashier', label: t('opsAudit.columns.cashier'), width: 170 },
  { key: 'review', label: t('opsAudit.columns.review'), width: 170 },
  { key: 'category', label: t('opsAudit.columns.category'), width: 180 },
])

const reviewOpen = ref(false)
const reviewSaving = ref(false)
const reviewTarget = ref<PreparationAudit | null>(null)
const reviewForm = ref({ category_id: '', comment: '', responsible_employee_id: '' })
const reviewErrors = ref<Record<string, string>>({})

function openReview(row: PreparationAudit) {
  reviewTarget.value = row
  reviewForm.value = { category_id: '', comment: '', responsible_employee_id: '' }
  reviewErrors.value = {}
  reviewOpen.value = true
  if (!categories.value.length && !categoriesLoading.value)
    loadCategories()
}

async function submitReview() {
  if (!reviewTarget.value)
    return
  const errors: Record<string, string> = {}
  if (!reviewForm.value.category_id)
    errors.category_id = t('opsAudit.validation.categoryRequired')
  const commentLength = reviewForm.value.comment.trim().length
  if (commentLength < 10 || commentLength > 1000)
    errors.comment = t('opsAudit.validation.commentLength')
  reviewErrors.value = errors
  if (Object.keys(errors).length)
    return

  reviewSaving.value = true
  try {
    await operationsAuditApi.reviewPreparationAudit(reviewTarget.value.id, {
      category_id: reviewForm.value.category_id,
      comment: reviewForm.value.comment.trim(),
      responsible_employee_id: reviewForm.value.responsible_employee_id || null,
      disciplinary_case_id: null,
    })
    notify(t('opsAudit.preparation.reviewSaved'))
    reviewOpen.value = false
    await load()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')

    // A duplicate/immutable 409 can mean another auditor completed the row.
    // Refresh immediately so the table shows the backend truth.
    await load()
  }
  finally {
    reviewSaving.value = false
  }
}

const reopenOpen = ref(false)
const reopenSaving = ref(false)
const reopenTarget = ref<PreparationAudit | null>(null)
const reopenReason = ref('')
const reopenError = ref('')

function openReopen(row: PreparationAudit) {
  reopenTarget.value = row
  reopenReason.value = ''
  reopenError.value = ''
  reopenOpen.value = true
}

async function submitReopen() {
  if (!reopenTarget.value)
    return
  if (!reopenReason.value.trim()) {
    reopenError.value = t('opsAudit.validation.explanationRequired')
    return
  }
  reopenSaving.value = true
  try {
    await operationsAuditApi.reopenPreparationAudit(reopenTarget.value.id, { reason: reopenReason.value.trim() })
    notify(t('opsAudit.preparation.reopened'))
    reopenOpen.value = false
    await load()
    emit('changed')
  }
  catch (error) {
    notify(translate(error), 'error')
  }
  finally {
    reopenSaving.value = false
  }
}
</script>

<template>
  <section class="audit-panel">
    <div class="attention-note">
      <div class="attention-note__mark">
        <span class="status-dot status-dot--yellow" /><span class="status-dot status-dot--red" />
      </div>
      <div>
        <strong>{{ t('opsAudit.preparation.attentionTitle') }}</strong>
        <p>{{ t('opsAudit.preparation.attentionSubtitle') }}</p>
      </div>
    </div>

    <Card>
      <div class="toolbar audit-filters">
        <Select
          v-model="performanceFilter"
          class="audit-filter"
          icon="clock"
          :options="performanceOptions"
          :placeholder="t('opsAudit.filters.allPreparationStatuses')"
        />
        <Select
          v-model="reviewFilter"
          class="audit-filter"
          icon="filter"
          :options="reviewOptions"
          :placeholder="t('opsAudit.filters.allReviewStatuses')"
        />
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          :disabled="loading"
          @click="load"
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
            @click="load"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else
        :columns="columns"
        :rows="rows"
        row-key="id"
        expandable
        :loading="loading"
        :pagination="{
          page,
          perPage,
          total,
          onPage: (value: number) => { page = value },
          onPerPage: (value: number) => { perPage = value; page = 1 },
        }"
        :empty-title="t('opsAudit.preparation.emptyTitle')"
        :empty-sub="reviewFilter === 'PENDING' ? t('opsAudit.preparation.noPendingSubtitle') : t('opsAudit.preparation.emptySubtitle')"
        empty-icon="checkcircle"
      >
        <template #cell.status="{ row }">
          <Badge
            :tone="performanceTone(row.performanceStatus)"
            dot
          >
            {{ t(`opsAudit.preparationStatus.${row.performanceStatus}`) }}
          </Badge>
        </template>
        <template #cell.order="{ row }">
          <strong class="mono">#{{ row.orderNumber }}</strong>
        </template>
        <template #cell.readyAt="{ row }">
          <span class="cell-muted">{{ formatDateTime(row.readyAt) }}</span>
        </template>
        <template #cell.elapsed="{ row }">
          <Badge
            :tone="performanceTone(row.performanceStatus)"
            class-name="duration-badge"
          >
            {{ minutes(row.elapsedSeconds) }}
          </Badge>
        </template>
        <template #cell.target="{ row }">
          <span class="mono cell-muted">{{ row.targetSeconds ? minutes(row.targetSeconds) : '—' }}</span>
        </template>
        <template #cell.cashier="{ row }">
          <span :title="row.cashierName">{{ row.cashierName || '—' }}</span>
        </template>
        <template #cell.review="{ row }">
          <Badge :tone="reviewTone(row.reviewStatus)">
            {{ t(`opsAudit.reviewStatus.${row.reviewStatus}`) }}
          </Badge>
        </template>
        <template #cell.category="{ row }">
          <span class="cell-muted">{{ categoryLabel(row.reviewCategory) }}</span>
        </template>
        <template #row-actions="{ row }">
          <Button
            v-if="canReview && row.reviewRequired && row.reviewStatus === 'PENDING' && ['SLIGHTLY_LATE', 'VERY_LATE'].includes(row.performanceStatus)"
            variant="primary"
            size="sm"
            icon="edit"
            @click="openReview(row)"
          >
            {{ t('opsAudit.preparation.review') }}
          </Button>
          <IconAction
            v-else-if="canReopen && ['COMPLETED', 'EXCUSED'].includes(row.reviewStatus)"
            icon="retry"
            :title="t('opsAudit.preparation.reopen')"
            @click="openReopen(row)"
          />
        </template>
        <template #expanded="{ row }">
          <div class="review-detail">
            <div><span>{{ t('opsAudit.columns.target') }}</span><p>{{ row.targetName || '—' }} · {{ row.targetSeconds ? minutes(row.targetSeconds) : '—' }}</p></div>
            <div><span>{{ t('opsAudit.columns.branch') }}</span><p>{{ row.branchName || '—' }}</p></div>
            <div><span>{{ t('opsAudit.columns.responsibleEmployee') }}</span><p>{{ row.responsibleEmployee?.name || '—' }}</p></div>
            <div><span>{{ t('opsAudit.reviewedBy') }}</span><p>{{ row.reviewedBy || '—' }}</p></div>
            <div class="review-detail__comment">
              <span>{{ t('opsAudit.comment') }}</span><p>{{ row.reviewComment || '—' }}</p>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <Modal
      :open="reviewOpen"
      :title="t('opsAudit.preparation.reviewTitle')"
      :subtitle="reviewTarget ? `${t('opsAudit.columns.order')} #${reviewTarget.orderNumber} · ${minutes(reviewTarget.elapsedSeconds)}` : ''"
      :width="640"
      :close-on-backdrop="!reviewSaving"
      :close-on-esc="!reviewSaving"
      @close="reviewOpen = false"
    >
      <div
        v-if="reviewTarget"
        class="review-summary"
        :class="`review-summary--${performanceTone(reviewTarget.performanceStatus)}`"
      >
        <Badge
          :tone="performanceTone(reviewTarget.performanceStatus)"
          dot
        >
          {{ t(`opsAudit.preparationStatus.${reviewTarget.performanceStatus}`) }}
        </Badge>
        <strong class="mono">{{ minutes(reviewTarget.elapsedSeconds) }}</strong>
        <span>{{ t('opsAudit.preparation.targetWas', { value: reviewTarget.targetSeconds ? minutes(reviewTarget.targetSeconds) : '—' }) }}</span>
      </div>

      <StateFill
        v-if="categoryError"
        icon="alert"
        :title="t('opsAudit.preparation.categoriesFailed')"
        :sub="categoryError"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadCategories"
          >
            {{ t('opsAudit.tryAgain') }}
          </Button>
        </template>
      </StateFill>
      <div
        v-else
        class="form-grid"
      >
        <Field
          :label="t('opsAudit.reasonCategory')"
          :error="reviewErrors.category_id"
        >
          <SearchSelect
            v-model="reviewForm.category_id"
            icon="list"
            :options="categoryOptions"
            :disabled="categoriesLoading"
            :placeholder="categoriesLoading ? t('opsAudit.preparation.loadingCategories') : t('opsAudit.selectReason')"
          />
        </Field>
        <Field
          :label="t('opsAudit.comment')"
          :error="reviewErrors.comment"
          :hint="t('opsAudit.preparation.commentHint')"
        >
          <Textarea
            v-model="reviewForm.comment"
            :rows="5"
            maxlength="1000"
            :placeholder="t('opsAudit.preparation.commentPlaceholder')"
          />
        </Field>
        <Field
          :label="t('opsAudit.columns.responsibleEmployee')"
          :hint="t('opsAudit.preparation.responsibleHint')"
        >
          <SearchSelect
            v-model="reviewForm.responsible_employee_id"
            icon="user"
            :options="employeeOptions"
            :placeholder="t('opsAudit.preparation.notAssigned')"
          />
        </Field>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="reviewSaving"
          :disabled="!!categoryError || categoriesLoading"
          @click="submitReview"
        >
          {{ t('opsAudit.preparation.completeReview') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="reopenOpen"
      :title="t('opsAudit.preparation.reopenTitle')"
      :subtitle="reopenTarget ? `${t('opsAudit.columns.order')} #${reopenTarget.orderNumber}` : ''"
      :width="520"
      :close-on-backdrop="!reopenSaving"
      :close-on-esc="!reopenSaving"
      @close="reopenOpen = false"
    >
      <Field
        :label="t('opsAudit.explanation')"
        :error="reopenError"
      >
        <Textarea
          v-model="reopenReason"
          :placeholder="t('opsAudit.preparation.reopenPlaceholder')"
        />
      </Field>
      <template #footer>
        <Button
          variant="danger"
          icon="retry"
          :loading="reopenSaving"
          @click="submitReopen"
        >
          {{ t('opsAudit.preparation.reopen') }}
        </Button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.audit-panel { display: flex; flex-direction: column; gap: 14px; }
.audit-filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.audit-filter { width: 220px; }
.attention-note { display: flex; align-items: flex-start; gap: 12px; padding: 13px 15px; border: 1px solid rgb(var(--v-theme-warning-border)); border-radius: var(--r-md); background: rgb(var(--v-theme-warning-weak)); }
.attention-note__mark { display: flex; align-items: center; gap: 4px; min-width: 42px; padding-top: 4px; }
.attention-note strong { color: rgb(var(--v-theme-on-surface)); }
.attention-note p { margin: 3px 0 0; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; }
.status-dot { width: 14px; height: 14px; border-radius: 50%; }
.status-dot--yellow { background: rgb(var(--v-theme-warning)); }
.status-dot--red { background: rgb(var(--v-theme-error)); }
.duration-badge { min-width: 72px; justify-content: center; font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.review-detail { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 22px; }
.review-detail span { color: rgb(var(--v-theme-text-secondary)); font-size: 12px; }
.review-detail p { margin: 4px 0 0; white-space: pre-wrap; color: rgb(var(--v-theme-on-surface)); }
.review-detail__comment { grid-column: 1 / -1; }
.review-summary { display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 16px; border-radius: var(--r-md); background: rgb(var(--v-theme-surface-inset)); }
.review-summary strong { font-size: 18px; }
.review-summary span:last-child { margin-left: auto; color: rgb(var(--v-theme-text-secondary)); }
.form-grid { display: grid; gap: 14px; }

@media (max-width: 800px) {
  .review-detail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .audit-filter { width: 100%; }
  .review-detail { grid-template-columns: 1fr; }
  .review-detail__comment { grid-column: auto; }
  .review-summary { align-items: flex-start; flex-wrap: wrap; }
  .review-summary span:last-child { width: 100%; margin-left: 0; }
}
</style>
