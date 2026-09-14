<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   ALPHA POS — Discounts / Secret Word redemption
   Single-form page: enter a secret word + order id, redeem it,
   and keep a session log of recent attempts in a DataTable.
   ============================================================ */
import { discountsApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import StateFill from '@/components/design/StateFill.vue'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const router = useRouter()

/* ---------- responsive modal widths ---------- */
const { width: viewportWidth } = useWindowSize()
const modalWidthRedeem = computed(() => Math.min(520, viewportWidth.value - 32))
const modalWidthRetry = computed(() => Math.min(440, viewportWidth.value - 32))

/* ---------- result tone (badge) ---------- */
const RESULT_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  SUCCESS: 'success',
  INVALID_WORD: 'error',
  ORDER_NOT_FOUND: 'error',
  ORDER_PAID: 'warning',
  ORDER_CANCELED: 'error',
  USAGE_LIMIT_REACHED: 'warning',
  USER_LIMIT_REACHED: 'warning',
  MIN_AMOUNT_NOT_MET: 'warning',
  ALREADY_APPLIED: 'info',
  NOT_STACKABLE: 'warning',
  NO_EFFECT: 'neutral',
  ERROR: 'error',
}
function resultTone(s?: string) {
  if (!s) return 'neutral'
  return RESULT_TONE[s] ?? 'neutral'
}

/* Map BE prose error messages → symbolic status codes used by RESULT_TONE/i18n.
   BE only returns ServiceResponse {success, message} — no symbolic code field.
   String-match the canonical messages emitted by DiscountService. */
function deriveStatusFromMessage(msg?: string | null): string {
  if (!msg) return 'ERROR'
  const m = msg.toLowerCase()
  if (m.includes('invalid secret word')) return 'INVALID_WORD'
  if (m.includes('order not found')) return 'ORDER_NOT_FOUND'
  if (m.includes('paid order')) return 'ORDER_PAID'
  if (m.includes('cancelled order') || m.includes('canceled order')) return 'ORDER_CANCELED'
  if (m.includes('reached its usage limit')) return 'USAGE_LIMIT_REACHED'
  if (m.includes('usage limit for this discount')) return 'USER_LIMIT_REACHED'
  if (m.includes('minimum order amount')) return 'MIN_AMOUNT_NOT_MET'
  if (m.includes('already applied')) return 'ALREADY_APPLIED'
  if (m.includes('cannot be combined') || m.includes('non-stackable')) return 'NOT_STACKABLE'
  if (m.includes('does not apply')) return 'NO_EFFECT'
  if (m.includes('discount code not found')) return 'INVALID_WORD'
  return 'ERROR'
}

/* ---------- form state ---------- */
interface FormShape {
  word: string
  order_id: string
}
const form = ref<FormShape>({ word: '', order_id: '' })
const errors = ref<{ word?: string, order_id?: string }>({})
const submitting = ref(false)

/* ---------- filter state (filters per spec) ---------- */
const filterWord = ref('')
const filterOrderId = ref('')

/* ---------- attempts log (session) ---------- */
interface Attempt {
  id: string
  order_id: string | number
  discount_code: string | null
  discount_amount: number | null
  order_total: number | null
  order_discount_total: number | null
  status: string
  created_at: string
  // Echoes used by the Retry action
  request_word: string
  request_order_id: string
}
const attempts = ref<Attempt[]>([])
const loading = ref(false)

/* ---------- filtered attempts ---------- */
const filteredAttempts = computed<Attempt[]>(() => {
  const w = filterWord.value.trim().toLowerCase()
  const oid = filterOrderId.value.trim()
  if (!w && !oid) return attempts.value
  return attempts.value.filter((a) => {
    if (w && !a.request_word.toLowerCase().includes(w)) return false
    if (oid && !String(a.order_id).includes(oid)) return false
    return true
  })
})

const hasFilters = computed(() => !!(filterWord.value || filterOrderId.value))
function clearFilters() {
  filterWord.value = ''
  filterOrderId.value = ''
}

/* ---------- validation ---------- */
function validate(): boolean {
  errors.value = {}
  if (!form.value.word.trim())
    errors.value.word = t('discount_secret_validation_word')
  if (!String(form.value.order_id).trim())
    errors.value.order_id = t('discount_secret_validation_order')
  return Object.keys(errors.value).length === 0
}

/* ---------- redeem (POST /secret-word/) ---------- */
async function redeem(opts?: { word?: string, order_id?: string }) {
  const payloadWord = opts?.word ?? form.value.word.trim()
  const payloadOrderId = opts?.order_id ?? String(form.value.order_id).trim()
  if (!opts) {
    if (!validate()) return
  }
  if (!payloadWord || !payloadOrderId) return

  submitting.value = true
  let status = 'ERROR'
  let serverPayload: any = null
  let serverMsg: string | null = null
  try {
    const res = await discountsApi.post('/secret-word/', {
      word: payloadWord,
      order_id: Number(payloadOrderId),
    })
    // BE wraps as {success, message, data: {...}}; envelope is unwrapped by axios layer in some setups.
    const d = res.data?.data ?? res.data
    serverPayload = d ?? {}
    status = 'SUCCESS'
    notify(t('discount_secret_success_toast'))
  }
  catch (e: any) {
    const data = e?.response?.data
    serverPayload = data?.data ?? null
    serverMsg = data?.message ?? null
    // BE never returns a symbolic code — derive status from the prose message
    status = deriveStatusFromMessage(serverMsg)
    notify(serverMsg ?? t('discount_secret_error_toast'), 'error')
  }
  finally {
    submitting.value = false
  }

  const entry: Attempt = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    order_id: payloadOrderId,
    discount_code: serverPayload?.discount_code ?? null,
    discount_amount: numberOrNull(serverPayload?.discount_amount),
    order_total: numberOrNull(serverPayload?.order_total),
    order_discount_total: numberOrNull(serverPayload?.order_discount_total),
    status,
    created_at: new Date().toISOString(),
    request_word: payloadWord,
    request_order_id: payloadOrderId,
  }
  attempts.value = [entry, ...attempts.value]
}

function numberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clearForm() {
  form.value = { word: '', order_id: '' }
  errors.value = {}
}

/* ---------- row actions ---------- */
function copyResult(a: Attempt) {
  const lines = [
    `${t('discount_secret_col_order')}: #${a.order_id}`,
    `${t('discount_secret_col_status')}: ${t(`discount_secret_result_${a.status}`)}`,
    a.discount_code ? `${t('discount_secret_col_code')}: ${a.discount_code}` : null,
    a.discount_amount != null ? `${t('discount_secret_col_amount')}: ${formatCurrency(a.discount_amount)}` : null,
    a.order_total != null ? `${t('discount_secret_col_total')}: ${formatCurrency(a.order_total)}` : null,
    a.order_discount_total != null ? `${t('discount_secret_col_total_discount')}: ${formatCurrency(a.order_discount_total)}` : null,
    `${t('discount_secret_col_attempted_at')}: ${formatDate(a.created_at)}`,
  ].filter(Boolean).join('\n')
  try {
    navigator.clipboard?.writeText(lines)
    notify(t('discount_secret_action_copy'))
  }
  catch {
    notify(t('discount_secret_error_toast'), 'error')
  }
}

function openOrder(a: Attempt) {
  router.push(`/orders?id=${encodeURIComponent(String(a.order_id))}`)
}

/* ---------- retry confirm modal ---------- */
const retryTarget = ref<Attempt | null>(null)
function askRetry(a: Attempt) {
  retryTarget.value = a
}
async function confirmRetry() {
  const a = retryTarget.value
  retryTarget.value = null
  if (!a) return
  await redeem({ word: a.request_word, order_id: a.request_order_id })
}

/* ---------- create modal (alt entry path) ---------- */
const createOpen = ref(false)
function openCreate() {
  clearForm()
  createOpen.value = true
}
async function submitCreate() {
  if (!validate()) return
  await redeem()
  if (!Object.keys(errors.value).length)
    createOpen.value = false
}

/* ---------- DataTable columns ---------- */
const columns = computed<DataTableColumn<Attempt>[]>(() => [
  { key: 'order_id', label: t('discount_secret_col_order') },
  { key: 'discount_code', label: t('discount_secret_col_code') },
  { key: 'discount_amount', label: t('discount_secret_col_amount'), align: 'right' },
  { key: 'order_total', label: t('discount_secret_col_total'), align: 'right' },
  { key: 'order_discount_total', label: t('discount_secret_col_total_discount'), align: 'right' },
  { key: 'status', label: t('discount_secret_col_status') },
  { key: 'created_at', label: t('discount_secret_col_attempted_at'), align: 'right' },
])

function dash(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  return v
}
</script>

<template>
  <WorkspacePage class="page">
    <!-- Header -->
    <PageHeader
      :title="t('discount_secret_title')"
      :subtitle="t('discount_secret_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('discount_secret_action_redeem') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Redemption form card -->
    <div
      class="card"
      style="margin-bottom: var(--sp-5); padding: var(--sp-5);"
    >
      <div class="form-grid">
        <Field
          :label="t('discount_secret_field_word')"
          :error="errors.word"
          :hint="errors.word ? undefined : t('discount_secret_word_help')"
        >
          <Input
            v-model="form.word"
            icon="lock"
            :placeholder="t('discount_secret_word_ph')"
            :error="!!errors.word"
            @keyup.enter="redeem()"
          />
        </Field>

        <Field
          :label="t('discount_secret_field_order_id')"
          :error="errors.order_id"
          :hint="errors.order_id ? undefined : t('discount_secret_order_id_help')"
        >
          <Input
            v-model="form.order_id"
            icon="receipt"
            type="number"
            :placeholder="t('discount_secret_order_id_ph')"
            :error="!!errors.order_id"
            @keyup.enter="redeem()"
          />
        </Field>
      </div>

      <div
        class="row"
        style="gap: var(--sp-3); margin-top: var(--sp-4); justify-content: flex-end;"
      >
        <Button
          variant="ghost"
          icon="refresh"
          :disabled="submitting"
          @click="clearForm"
        >
          {{ t('discount_secret_action_clear') }}
        </Button>
        <Button
          variant="primary"
          icon="check"
          :loading="submitting"
          @click="redeem()"
        >
          {{ t('discount_secret_action_redeem') }}
        </Button>
      </div>
    </div>

    <!-- Recent attempts card -->
    <div class="card">
      <div
        class="card__head"
        style="padding: var(--sp-4) var(--sp-5); display: flex; align-items: center; justify-content: space-between;"
      >
        <h3 style="margin: 0; font-size: var(--fs-md); font-weight: var(--fw-semibold);">
          {{ t('discount_secret_recent_title') }}
        </h3>
      </div>

      <!-- Toolbar / filters -->
      <WorkspaceToolbar class="toolbar secret-toolbar">
        <div class="filter-word grow">
          <Input
            v-model="filterWord"
            icon="search"
            :placeholder="t('discount_secret_word_ph')"
            :aria-label="t('discount_secret_filter_word')"
          />
        </div>
        <div class="filter-order">
          <Input
            v-model="filterOrderId"
            icon="receipt"
            :placeholder="t('discount_secret_order_id_ph')"
            :aria-label="t('discount_secret_filter_order_id')"
          />
        </div>
        <div class="toolbar-spacer" />
        <Button
          v-if="hasFilters"
          variant="ghost"
          icon="close"
          @click="clearFilters"
        >
          {{ t('discount_secret_action_clear') }}
        </Button>
      </WorkspaceToolbar>

      <!-- Active filter chips -->
      <div
        v-if="hasFilters"
        class="row"
        style="gap: var(--sp-2); padding: 0 var(--sp-5) var(--sp-3); flex-wrap: wrap;"
      >
        <span
          v-if="filterWord"
          class="chip"
        >
          <DesignIcon
            name="lock"
            :size="13"
          />
          {{ filterWord }}
          <button
            type="button"
            class="chip__x"
            :aria-label="t('discount_secret_action_clear')"
            @click="filterWord = ''"
          >
            <DesignIcon
              name="close"
              :size="12"
            />
          </button>
        </span>
        <span
          v-if="filterOrderId"
          class="chip"
        >
          <DesignIcon
            name="receipt"
            :size="13"
          />
          {{ t('discount_secret_order_prefix', { id: filterOrderId }) }}
          <button
            type="button"
            class="chip__x"
            :aria-label="t('discount_secret_action_clear')"
            @click="filterOrderId = ''"
          >
            <DesignIcon
              name="close"
              :size="12"
            />
          </button>
        </span>
      </div>

      <DataTable
        :columns="columns"
        :rows="filteredAttempts"
        row-key="id"
        :loading="loading"
        :initial-sort="{ key: 'created_at', dir: 'desc' }"
        :empty-title="t('discount_secret_empty_title')"
        :empty-sub="t('discount_secret_empty_hint')"
        empty-icon="gift"
      >
        <template #cell.order_id="{ row }">
          <span class="mono">{{ t('discount_secret_order_prefix', { id: row.order_id }) }}</span>
        </template>

        <template #cell.discount_code="{ row }">
          <span class="mono">{{ dash(row.discount_code) }}</span>
        </template>

        <template #cell.discount_amount="{ row }">
          <span class="num">
            {{ row.discount_amount != null ? formatCurrency(row.discount_amount) : '—' }}
          </span>
        </template>

        <template #cell.order_total="{ row }">
          <span class="num">
            {{ row.order_total != null ? formatCurrency(row.order_total) : '—' }}
          </span>
        </template>

        <template #cell.order_discount_total="{ row }">
          <span class="num">
            {{ row.order_discount_total != null ? formatCurrency(row.order_discount_total) : '—' }}
          </span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="resultTone(row.status)">
            {{ t(`discount_secret_result_${row.status}`) }}
          </Badge>
        </template>

        <template #cell.created_at="{ row }">
          <span class="num">{{ formatDate(row.created_at) }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="copy"
            :title="t('discount_secret_action_copy')"
            @click="copyResult(row as Attempt)"
          />
          <IconAction
            icon="receipt"
            :title="t('discount_secret_action_open_order')"
            @click="openOrder(row as Attempt)"
          />
          <IconAction
            icon="retry"
            tone="warning"
            :title="t('discount_secret_action_retry')"
            @click="askRetry(row as Attempt)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="gift"
            :title="t('discount_secret_empty_title')"
            :sub="t('discount_secret_empty_hint')"
          />
        </template>
      </DataTable>
    </div>

    <!-- Create / Redeem modal -->
    <Modal
      :open="createOpen"
      :title="t('discount_secret_action_redeem')"
      :subtitle="t('discount_secret_subtitle')"
      :width="modalWidthRedeem"
      @close="createOpen = false"
    >
      <div class="form-grid">
        <Field
          :label="t('discount_secret_field_word')"
          :error="errors.word"
          :hint="errors.word ? undefined : t('discount_secret_word_help')"
        >
          <Input
            v-model="form.word"
            icon="lock"
            :placeholder="t('discount_secret_word_ph')"
            :error="!!errors.word"
          />
        </Field>
        <Field
          :label="t('discount_secret_field_order_id')"
          :error="errors.order_id"
          :hint="errors.order_id ? undefined : t('discount_secret_order_id_help')"
        >
          <Input
            v-model="form.order_id"
            icon="receipt"
            type="number"
            :placeholder="t('discount_secret_order_id_ph')"
            :error="!!errors.order_id"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="submitting"
          @click="submitCreate"
        >
          {{ t('discount_secret_action_redeem') }}
        </Button>
      </template>
    </Modal>

    <!-- Retry confirm modal -->
    <Modal
      :open="!!retryTarget"
      :title="t('discount_secret_action_retry')"
      :width="modalWidthRetry"
      @close="retryTarget = null"
    >
      <div v-if="retryTarget">
        <p style="margin: 0 0 var(--sp-3); color: rgb(var(--v-theme-text-secondary));">
          {{ t('discount_secret_subtitle') }}
        </p>
        <div
          class="row"
          style="gap: var(--sp-2); flex-wrap: wrap;"
        >
          <Badge tone="neutral">
            <DesignIcon
              name="lock"
              :size="13"
            />
            {{ retryTarget.request_word }}
          </Badge>
          <Badge tone="primary">
            <DesignIcon
              name="receipt"
              :size="13"
            />
            {{ t('discount_secret_order_prefix', { id: retryTarget.request_order_id }) }}
          </Badge>
        </div>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="retry"
          :loading="submitting"
          @click="confirmRetry"
        >
          {{ t('discount_secret_action_retry') }}
        </Button>
      </template>
    </Modal>
  </WorkspacePage>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
}
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
.secret-toolbar {
  flex-wrap: wrap;
  gap: var(--sp-3);
}
.filter-word {
  max-width: 280px;
  flex: 1 1 220px;
  min-width: 0;
}
.filter-order {
  width: 200px;
  flex: 0 1 200px;
  min-width: 0;
}
.toolbar-spacer {
  flex: 1;
}
@media (max-width: 768px) {
  .filter-word,
  .filter-order {
    max-width: none;
    width: 100%;
    flex: 1 1 100%;
  }
  .toolbar-spacer {
    display: none;
  }
}
.mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-feature-settings: "tnum" 1;
}
.num {
  font-variant-numeric: tabular-nums;
}
.row {
  display: flex;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(var(--v-theme-surface-inset));
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-label);
  border: 1px solid rgb(var(--v-theme-neutral-border));
}
.chip__x {
  background: transparent;
  border: 0;
  padding: 0;
  margin-inline-start: 2px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: inherit;
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
