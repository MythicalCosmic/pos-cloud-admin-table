<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import { REFRESH_EVENT } from '../state'
import Card from '@/components/design/Card.vue'
import Segmented from '@/components/design/Segmented.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'
import type { TreasuryAccount, TreasuryAccountKind, TreasuryTransaction } from '@/services/treasuryApi'
import { getTreasuryAccounts, getTreasuryHistory } from '@/services/treasuryApi'

const PER_PAGE = 30

const { t, te } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { formatDate } = useFormatters()

const accounts = ref<Partial<Record<TreasuryAccountKind, TreasuryAccount>>>({})
const rows = ref<TreasuryTransaction[]>([])
const total = ref(0)
const page = ref(0)
const account = ref<'ALL' | TreasuryAccountKind>('ALL')
const loading = ref(false)
const loaded = ref(false)
const refreshing = ref(false)
const error = ref('')
const sentinel = ref<HTMLElement | null>(null)

const filterOptions = computed(() => [
  { value: 'ALL', label: t('owner_app_all') },
  { value: 'SAFE', label: t('owner_safe') },
  { value: 'BANK', label: t('owner_bank') },
])

const hasMore = computed(() => rows.value.length < total.value)

function balance(kind: TreasuryAccountKind) {
  const acc = accounts.value[kind]

  return acc ? fmtNum(Number(acc.balance_uzs ?? acc.balance)) : '—'
}

function typeLabel(type: string) {
  const key = `treasury_txn_${type}`

  return te(key) ? t(key) : type
}

// Imported and reconciled rows carry "[TAG]" audit markers.
function readable(text: string) {
  return String(text || '').replace(/\[[^\]]+\]\s*/g, '').trim()
}

async function loadPage(reset: boolean) {
  if (loading.value)
    return
  loading.value = true
  error.value = ''
  try {
    const next = reset ? 1 : page.value + 1

    const result = await getTreasuryHistory({
      page: next,
      per_page: PER_PAGE,
      ...(account.value === 'ALL' ? {} : { account: account.value }),
    })

    rows.value = reset ? result.transactions : [...rows.value, ...result.transactions]
    total.value = result.total
    page.value = next
  }
  catch (e) {
    error.value = translate(e)
  }
  finally {
    loading.value = false
    loaded.value = true
  }
}

async function loadAccounts() {
  try {
    accounts.value = await getTreasuryAccounts()
  }
  catch (e) {
    error.value = translate(e)
  }
}

async function refresh() {
  refreshing.value = true
  await Promise.all([loadAccounts(), loadPage(true)])
  refreshing.value = false
}

watch(account, () => loadPage(true))

useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && hasMore.value && !error.value)
    loadPage(false)
}, { rootMargin: '240px' })

onMounted(refresh)
useEventListener(window, REFRESH_EVENT, refresh)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_tab_money')"
    :refreshing="refreshing"
    @refresh="refresh"
  >
    <div class="owner-balances">
      <Card
        v-for="kind in (['SAFE', 'BANK'] as const)"
        :key="kind"
        class-name="owner-balance"
      >
        <span class="owner-eyebrow">{{ kind === 'SAFE' ? t('owner_safe') : t('owner_bank') }}</span>
        <strong class="owner-balance__value">{{ balance(kind) }}</strong>
        <span class="owner-balance__unit">UZS</span>
      </Card>
    </div>

    <Segmented
      v-model="account"
      :options="filterOptions"
      class="owner-money__filter"
    />

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
        v-for="i in 6"
        :key="i"
        :h="58"
        :r="12"
      />
    </div>
    <StateFill
      v-else-if="!rows.length && !error"
      icon="wallet"
      :title="t('owner_app_no_history')"
    />
    <ul
      v-else
      class="owner-list"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="owner-row"
      >
        <div class="owner-row__main">
          <span class="owner-row__title">{{ readable(row.description) || typeLabel(row.type) }}</span>
          <span class="owner-row__sub">
            {{ typeLabel(row.type) }} · {{ row.account === 'BANK' ? t('owner_bank') : t('owner_safe') }} · {{ formatDate(row.created_at) }}
          </span>
        </div>
        <span
          class="owner-row__amount"
          :class="Number(row.delta_uzs ?? row.delta) >= 0 ? 'is-in' : 'is-out'"
        >
          {{ Number(row.delta_uzs ?? row.delta) >= 0 ? '+' : '−' }}{{ fmtNum(Math.abs(Number(row.delta_uzs ?? row.delta))) }}
        </span>
      </li>
    </ul>
    <div
      ref="sentinel"
      class="owner-sentinel"
    >
      <Skeleton
        v-if="loading && loaded"
        :h="58"
        :r="12"
      />
    </div>
  </OwnerPage>
</template>

<style scoped>
.owner-balances { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.owner-balance { padding: 14px; display: grid; gap: 4px; }
.owner-balance__value { color: var(--text); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.owner-balance__unit { color: var(--text-secondary); font-size: 12px; }
.owner-money__filter { margin-bottom: 12px; width: 100%; }
.owner-sentinel { min-height: 1px; margin-top: 8px; }
.is-in { color: var(--success-strong, var(--success)); }
.is-out { color: var(--text); }
</style>
