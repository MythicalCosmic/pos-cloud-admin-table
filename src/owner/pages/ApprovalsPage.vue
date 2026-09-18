<script setup lang="ts">
import ExpenseRow from '../components/ExpenseRow.vue'
import OwnerPage from '../components/OwnerPage.vue'
import { getWaitingExpenses } from '../services/ownerApi'
import { REFRESH_EVENT, ownerState } from '../state'
import type { ExpenseRecord } from '@/types/expenseControl'
import StateFill from '@/components/design/StateFill.vue'
import Skeleton from '@/components/design/Skeleton.vue'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()

const pending = ref<ExpenseRecord[]>([])
const approved = ref<ExpenseRecord[]>([])
const loaded = ref(false)
const error = ref('')
const refreshing = ref(false)

async function load() {
  error.value = ''
  try {
    const waiting = await getWaitingExpenses()

    pending.value = waiting.pending
    approved.value = waiting.approved
    ownerState.pendingApprovals = waiting.pending.length + waiting.approved.length
  }
  catch (e) {
    error.value = translate(e)
  }
  finally {
    loaded.value = true
  }
}

async function refresh() {
  refreshing.value = true
  await load()
  refreshing.value = false
}

onMounted(load)
useEventListener(window, REFRESH_EVENT, refresh)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_tab_approvals')"
    :refreshing="refreshing"
    @refresh="refresh"
  >
    <p
      v-if="error"
      class="owner-error"
      role="alert"
    >
      {{ error }}
    </p>

    <div
      v-if="!loaded"
      class="owner-list"
    >
      <Skeleton
        v-for="n in 4"
        :key="n"
        w="100%"
        h="64"
        r="14"
      />
    </div>

    <template v-else-if="pending.length || approved.length">
      <template v-if="pending.length">
        <h2 class="owner-section-title">
          {{ t('owner_app_waiting_approval') }} · {{ pending.length }}
        </h2>
        <div class="owner-list">
          <ExpenseRow
            v-for="expense in pending"
            :key="expense.id"
            :expense="expense"
          />
        </div>
      </template>
      <template v-if="approved.length">
        <h2 class="owner-section-title">
          {{ t('owner_app_waiting_payment') }} · {{ approved.length }}
        </h2>
        <div class="owner-list">
          <ExpenseRow
            v-for="expense in approved"
            :key="expense.id"
            :expense="expense"
          />
        </div>
      </template>
    </template>

    <StateFill
      v-else-if="!error"
      icon="checkcircle"
      :title="t('owner_app_nothing_waiting')"
      :sub="t('owner_app_nothing_waiting_sub')"
    />
  </OwnerPage>
</template>
