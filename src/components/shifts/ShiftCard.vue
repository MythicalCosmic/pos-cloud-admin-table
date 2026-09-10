<script setup lang="ts">
import { useShiftPresentation } from '@/composables/useShiftPresentation'
import { fmtMoney, fmtNum } from '@/components/design/utils/format'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Button from '@/components/design/Button.vue'

const props = defineProps<{ shift: Record<string, any> }>()

const emit = defineEmits<{
  (e: 'receive'): void
  (e: 'report'): void
  (e: 'end'): void
}>()

const { t } = useI18n({ useScope: 'global' })
const { fullName, initialsOf, shiftState, fmtDateTime, fmtDuration, fmtPrep, fmtPeak, expectedSettlement, confirmedSettlement, reportedCash, reportedBy, varianceOf, paymentMixRows, cardPayments, avgTicket, netOf } = useShiftPresentation()
const state = computed(() => shiftState(props.shift))
const mixOpen = ref(false)
const variance = computed(() => varianceOf(props.shift))

const settlementLabel = computed(() => {
  if (state.value === 'reconciled')
    return t(confirmedSettlement(props.shift) !== null ? 'Settlement confirmed' : 'Cash received')
  if (state.value === 'active' && expectedSettlement(props.shift) !== null)
    return t('shifts_workspace_current_settlement')
  return t(state.value === 'awaiting' ? 'Settlement to receive' : 'Settlement unavailable')
})

const settlement = computed(() => {
  if (state.value === 'closed')
    return null
  return state.value === 'reconciled' ? (confirmedSettlement(props.shift) ?? reportedCash(props.shift)) : expectedSettlement(props.shift)
})
</script>

<template>
  <article
    class="shift-record"
    :class="`is-${state}`"
    :aria-label="`${t('Shift')} #${shift.id} · ${fullName(shift.user)}`"
  >
    <header class="shift-record__head">
      <div class="shift-record__identity">
        <span class="shift-record__avatar">{{ initialsOf(undefined, undefined, undefined, fullName(shift.user)) }}</span>
        <div><h3>{{ fullName(shift.user) }}</h3><p>{{ t('Shift') }} #{{ shift.id }}<span v-if="shift.shift_template?.name"> · {{ shift.shift_template.name }}</span></p></div>
      </div>
      <span
        class="shift-record__status"
        :class="`is-${state}`"
      ><span />{{ t(state === 'awaiting' ? 'shift_status_AWAITING_CASH' : `shift_status_${shift.status === 'OPEN' ? 'ACTIVE' : shift.status}`) }}</span>
    </header>

    <div class="shift-record__body">
      <div class="shift-record__sales">
        <span class="shift-record__label">{{ t('Gross') }}</span>
        <div class="shift-record__amount">
          {{ fmtMoney(shift.total_revenue === undefined ? null : Number(shift.total_revenue)) }}<small>UZS</small>
        </div>
        <dl class="shift-record__numbers">
          <div><dt>{{ t('Orders') }}</dt><dd>{{ fmtNum(shift.total_orders) }}</dd></div><div><dt>{{ t('Net') }}</dt><dd>{{ fmtMoney(netOf(shift)) }}</dd></div>
        </dl>
      </div>
      <div class="shift-record__settlement">
        <span class="shift-record__label">{{ settlementLabel }}</span>
        <div class="shift-record__amount">
          {{ fmtMoney(settlement) }}<small>UZS</small>
        </div>
        <span
          v-if="state === 'reconciled'"
          class="shift-record__variance"
          :class="{ 'is-short': variance < 0, 'is-over': variance > 0 }"
        ><DesignIcon
          :name="variance === 0 ? 'checkcircle' : 'alert'"
          :size="14"
        />{{ variance === 0 ? t('Exact') : `${t(variance > 0 ? 'Over' : 'Short')} ${variance > 0 ? '+' : '−'}${fmtMoney(Math.abs(variance))}` }}</span>
        <span
          v-else
          class="shift-record__settlement-hint"
        >{{ t(state === 'awaiting' ? 'shifts_workspace_ready' : state === 'active' ? 'shifts_workspace_running_hint' : 'shifts_workspace_closed_hint') }}</span>
      </div>
      <dl class="shift-record__payments">
        <div>
          <dt>
            <DesignIcon
              name="wallet"
              :size="16"
            />{{ t('Cash sales') }}
          </dt><dd>{{ fmtMoney(shift.cash_collected === undefined ? null : Number(shift.cash_collected)) }}</dd>
        </div>
        <div>
          <dt>
            <DesignIcon
              name="register"
              :size="16"
            />{{ t('Card / digital') }}
          </dt><dd>{{ fmtMoney(shift.total_revenue === undefined && !shift.payment_mix ? null : cardPayments(shift)) }}</dd>
        </div>
        <div v-if="shift.expenses_total !== undefined">
          <dt>
            <DesignIcon
              name="receipt"
              :size="16"
            />{{ t('Expenses') }}
          </dt><dd>{{ fmtMoney(Number(shift.expenses_total)) }}</dd>
        </div>
        <div v-if="shift.cancelled_orders_count !== undefined">
          <dt>
            <DesignIcon
              name="close"
              :size="16"
            />{{ t('Cancelled') }} · {{ fmtNum(shift.cancelled_orders_count) }}
          </dt><dd>{{ fmtMoney(shift.cancelled_orders_value === undefined ? null : Number(shift.cancelled_orders_value)) }}</dd>
        </div>
      </dl>
    </div>

    <div class="shift-record__timeline">
      <span><DesignIcon
        name="calendar"
        :size="14"
      /><time>{{ fmtDateTime(shift.start_time) }}</time><DesignIcon
        name="arrowright"
        :size="14"
      /><time :class="{ 'is-running': state === 'active' }">{{ shift.end_time ? fmtDateTime(shift.end_time) : t('running') }}</time></span><span><DesignIcon
        name="clock"
        :size="14"
      />{{ fmtDuration(shift.duration_minutes) }}</span>
    </div>
    <dl class="shift-record__details">
      <div><dt>{{ t('Avg ticket') }}</dt><dd>{{ fmtMoney(shift.total_orders === undefined ? null : avgTicket(shift)) }}</dd></div><div><dt>{{ t('Items') }}</dt><dd>{{ fmtNum(shift.units_sold) }}</dd></div><div><dt>{{ t('Avg prep') }}</dt><dd>{{ fmtPrep(shift.avg_prep_seconds) }}</dd></div><div><dt>{{ t('Peak') }}</dt><dd>{{ fmtPeak(shift.peak_hour) }}</dd></div>
    </dl>

    <div
      v-if="paymentMixRows(shift).length"
      class="shift-record__breakdown"
    >
      <button
        type="button"
        :aria-expanded="mixOpen"
        @click="mixOpen = !mixOpen"
      >
        {{ t(mixOpen ? 'Hide per-method breakdown' : 'Show per-method breakdown') }}<DesignIcon
          :name="mixOpen ? 'sortup' : 'chevdown'"
          :size="15"
        />
      </button><dl v-if="mixOpen">
        <div
          v-for="item in paymentMixRows(shift)"
          :key="item.method"
        >
          <dt>{{ t(`payment_method_${item.method}`) }}</dt><dd>{{ fmtMoney(item.amount) }}</dd>
        </div>
      </dl>
    </div>
    <div
      v-if="state === 'reconciled'"
      class="shift-record__audit"
    >
      <DesignIcon
        name="checkcircle"
        :size="16"
      /><div>
        <p>{{ t('Counted') }} {{ fmtMoney(reportedCash(shift)) }} · {{ t('received by') }} {{ reportedBy(shift) }}</p><p v-if="shift.reconciliation?.created_at">
          {{ t('Reconciled at') }} {{ fmtDateTime(shift.reconciliation.created_at) }}
        </p><p v-if="shift.reconciliation?.notes">
          {{ t('Reconciliation notes') }}: {{ shift.reconciliation.notes }}
        </p>
      </div>
    </div>
    <footer class="shift-record__actions">
      <span><DesignIcon
        :name="state === 'reconciled' ? 'checkcircle' : state === 'active' ? 'clock' : 'inbox'"
        :size="15"
      />{{ t(state === 'reconciled' ? 'Handover complete' : state === 'active' ? 'live shifts' : state === 'awaiting' ? 'shifts_workspace_ready' : 'Settlement unavailable') }}</span>
      <Button
        v-if="state === 'active'"
        variant="ghost"
        icon="stop"
        @click="emit('end')"
      >
        {{ t('End shift') }}
      </Button>
      <Button
        :variant="state === 'awaiting' ? 'secondary' : 'ghost'"
        icon="chart"
        @click="emit('report')"
      >
        {{ t(state === 'active' ? 'Live report' : 'Report') }}
      </Button>
      <Button
        v-if="state === 'awaiting'"
        variant="primary"
        icon="wallet"
        @click="emit('receive')"
      >
        {{ t('Receive money') }}
      </Button>
    </footer>
  </article>
</template>
