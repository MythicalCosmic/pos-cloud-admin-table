<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import { haptic } from '../services/native'
import { currentUser } from '../services/session'
import { requestRefresh } from '../state'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import Field from '@/components/design/Field.vue'
import Modal from '@/components/design/Modal.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import Textarea from '@/components/design/Textarea.vue'
import { fmtDate, fmtNum } from '@/components/design/utils/format'
import { approveExpense, getExpense, payExpense, rejectExpense } from '@/services/expenseControlApi'
import type { ExpenseRecord } from '@/types/expenseControl'

const props = defineProps<{ id: string }>()

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { notify } = useNotify()
const router = useRouter()

const expense = ref<ExpenseRecord | null>(null)
const error = ref('')
const busy = ref<'' | 'approve' | 'approve-pay' | 'pay' | 'reject'>('')
const confirmPay = ref<'' | 'pay' | 'approve-pay'>('')
const rejectOpen = ref(false)
const rejectReason = ref('')

const TONE: Record<string, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
  PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'error', CANCELED: 'neutral', VOIDED: 'neutral',
}

const ownRequest = computed(() => !!expense.value && expense.value.created_by?.id === currentUser()?.id)
const source = computed(() => expense.value?.requested_source ?? null)
const sourceLabel = computed(() => (source.value ? t(`supplier_source_${source.value}`) : '—'))
const notes = computed(() => String(expense.value?.notes ?? '').replace(/\[[^\]]+\]\s*/g, '').trim())

async function load() {
  error.value = ''
  try {
    expense.value = await getExpense(Number(props.id))
  }
  catch (e) {
    error.value = translate(e)
  }
}

function done(message: string) {
  haptic('success')
  notify(message, 'success')
  requestRefresh()
}

async function run(kind: 'approve' | 'approve-pay' | 'pay') {
  if (!expense.value || busy.value)
    return
  confirmPay.value = ''
  busy.value = kind
  try {
    if (kind !== 'pay')
      await approveExpense(expense.value.id)
    if (kind !== 'approve' && source.value)
      await payExpense(expense.value.id, { source_account: source.value })
    done(t(kind === 'approve' ? 'owner_app_approved' : 'owner_app_paid'))
    await router.replace('/approvals')
  }
  catch (e) {
    haptic('warning')
    notify(translate(e), 'error')
    await load()
  }
  finally {
    busy.value = ''
  }
}

async function reject() {
  if (!expense.value || busy.value)
    return
  if (!rejectReason.value.trim())
    return
  busy.value = 'reject'
  try {
    await rejectExpense(expense.value.id, rejectReason.value.trim())
    rejectOpen.value = false
    done(t('owner_app_rejected'))
    await router.replace('/approvals')
  }
  catch (e) {
    haptic('warning')
    notify(translate(e), 'error')
  }
  finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_expense')"
    back
    @refresh="load"
  >
    <p
      v-if="error"
      class="owner-error"
      role="alert"
    >
      {{ error }}
    </p>
    <Skeleton
      v-else-if="!expense"
      w="100%"
      :h="220"
      :r="16"
    />

    <template v-else>
      <Card class-name="owner-expense">
        <div class="owner-expense__top">
          <Badge :tone="TONE[expense.status] ?? 'neutral'">
            {{ t(`expense_status_${expense.status}`) }}
          </Badge>
          <span class="owner-expense__date">{{ fmtDate(expense.expense_date) }}</span>
        </div>
        <strong class="owner-expense__amount">{{ fmtNum(expense.amount_uzs) }} <small>UZS</small></strong>
        <p
          v-if="expense.description"
          class="owner-expense__desc"
        >
          {{ expense.description }}
        </p>
        <dl class="owner-expense__facts">
          <div>
            <dt>{{ t('Category') }}</dt>
            <dd>{{ expense.category?.path?.join(' › ') || expense.category?.name || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('pay_field_source_account') }}</dt>
            <dd>{{ sourceLabel }}</dd>
          </div>
          <div v-if="expense.supplier">
            <dt>{{ t('owner_app_supplier') }}</dt>
            <dd>
              <RouterLink :to="`/suppliers/${expense.supplier.id}`">
                {{ expense.supplier.name }}
              </RouterLink>
            </dd>
          </div>
          <div v-if="expense.created_by">
            <dt>{{ t('owner_app_requested_by') }}</dt>
            <dd>{{ expense.created_by.name }}</dd>
          </div>
          <div v-if="notes">
            <dt>{{ t('Notes') }}</dt>
            <dd class="owner-expense__notes">
              {{ notes }}
            </dd>
          </div>
        </dl>
      </Card>

      <div
        v-if="expense.status === 'PENDING' || expense.status === 'APPROVED'"
        class="owner-actions"
      >
        <p
          v-if="expense.status === 'PENDING' && ownRequest"
          class="owner-actions__note"
        >
          {{ t('owner_app_own_request') }}
        </p>
        <template v-if="expense.status === 'PENDING' && !ownRequest">
          <Button
            v-if="source"
            variant="primary"
            size="lg"
            icon="check"
            :loading="busy === 'approve-pay'"
            :disabled="!!busy"
            @click="confirmPay = 'approve-pay'"
          >
            {{ t('owner_app_approve_and_pay') }}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            :loading="busy === 'approve'"
            :disabled="!!busy"
            @click="run('approve')"
          >
            {{ t('owner_app_approve_only') }}
          </Button>
        </template>
        <Button
          v-if="expense.status === 'APPROVED' && source"
          variant="primary"
          size="lg"
          icon="wallet"
          :loading="busy === 'pay'"
          :disabled="!!busy"
          @click="confirmPay = 'pay'"
        >
          {{ t('owner_app_pay') }}
        </Button>
        <Button
          v-if="expense.status === 'PENDING'"
          variant="danger-soft"
          size="lg"
          :disabled="!!busy"
          @click="rejectOpen = true"
        >
          {{ t('owner_app_reject') }}
        </Button>
      </div>
    </template>

    <Modal
      :open="!!confirmPay"
      :title="t('owner_app_confirm_payment')"
      @close="confirmPay = ''"
    >
      <p class="owner-confirm">
        {{ t('owner_app_confirm_payment_body', { amount: fmtNum(expense?.amount_uzs ?? 0), source: sourceLabel }) }}
      </p>
      <template #footer>
        <Button
          variant="primary"
          size="lg"
          class="owner-confirm__btn"
          @click="run(confirmPay as 'pay' | 'approve-pay')"
        >
          {{ t('owner_app_confirm_pay_button', { amount: fmtNum(expense?.amount_uzs ?? 0) }) }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="rejectOpen"
      :title="t('owner_app_reject')"
      @close="rejectOpen = false"
    >
      <Field :label="t('owner_app_reject_reason')">
        <Textarea
          v-model="rejectReason"
          rows="3"
        />
      </Field>
      <template #footer>
        <Button
          variant="danger"
          size="lg"
          class="owner-confirm__btn"
          :loading="busy === 'reject'"
          :disabled="!rejectReason.trim() || (!!busy && busy !== 'reject')"
          @click="reject"
        >
          {{ t('owner_app_reject') }}
        </Button>
      </template>
    </Modal>
  </OwnerPage>
</template>

<style scoped>
.owner-expense { padding: 18px; display: grid; gap: 12px; }
.owner-expense__top { display: flex; align-items: center; justify-content: space-between; }
.owner-expense__date { color: var(--text-secondary); font-size: 14px; }
.owner-expense__amount { color: var(--text); font-size: 32px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.owner-expense__amount small { font-size: 14px; color: var(--text-secondary); }
.owner-expense__desc { margin: 0; color: var(--text); font-size: 16px; line-height: 1.45; }
.owner-expense__facts { display: grid; gap: 10px; margin: 4px 0 0; }
.owner-expense__facts > div { display: grid; gap: 2px; }
.owner-expense__facts dt { color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.owner-expense__facts dd { margin: 0; color: var(--text); font-size: 15px; }
.owner-expense__facts a { color: var(--primary); font-weight: 600; text-decoration: none; }
.owner-expense__notes { white-space: pre-wrap; color: var(--text-secondary); font-size: 14px !important; }
.owner-actions { display: grid; gap: 10px; margin-top: 16px; }
.owner-actions :deep(.btn) { width: 100%; justify-content: center; min-height: 50px; }
.owner-actions__note { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--info-weak); color: var(--info-strong); font-size: 14px; }
.owner-confirm { margin: 0; font-size: 16px; line-height: 1.5; }
.owner-confirm__btn { width: 100%; justify-content: center; min-height: 50px; }
</style>
