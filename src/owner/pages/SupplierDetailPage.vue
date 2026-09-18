<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import Card from '@/components/design/Card.vue'
import Segmented from '@/components/design/Segmented.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'
import SupplierPurchasesPanel from '@/components/stock/suppliers/SupplierPurchasesPanel.vue'
import type { SupplierLedgerRow, SupplierSummary } from '@/services/supplierApi'
import { getSupplier, getSupplierLedger } from '@/services/supplierApi'

const props = defineProps<{ id: string }>()

const PER_PAGE = 30

const { t, te } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { formatDate } = useFormatters()

const supplier = ref<(SupplierSummary & Record<string, any>) | null>(null)
const rows = ref<SupplierLedgerRow[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const tab = ref<'ledger' | 'purchases'>('ledger')
const sentinel = ref<HTMLElement | null>(null)

const tabs = computed(() => [
  { value: 'ledger', label: t('owner_app_ledger') },
  { value: 'purchases', label: t('owner_app_paid_purchases') },
])

const debt = computed(() => Number(supplier.value?.current_balance_uzs ?? 0))
const hasMore = computed(() => rows.value.length < total.value)

function typeLabel(type: string) {
  const key = `supplier_txn_type_${type}`

  return te(key) ? t(key) : type
}

function readable(text: string) {
  return String(text || '').replace(/\[[^\]]+\]\s*/g, '').trim()
}

async function loadLedger(reset: boolean) {
  if (loading.value)
    return
  loading.value = true
  try {
    const next = reset ? 1 : page.value + 1
    const result = await getSupplierLedger(props.id, { page: next, per_page: PER_PAGE })

    rows.value = reset ? result.rows : [...rows.value, ...result.rows]
    total.value = result.total
    page.value = next
  }
  catch (e) {
    error.value = translate(e)
  }
  finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  error.value = ''
  try {
    supplier.value = await getSupplier(props.id)
  }
  catch (e) {
    error.value = translate(e)
  }
  await loadLedger(true)
  refreshing.value = false
}

useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && tab.value === 'ledger' && hasMore.value && !error.value)
    loadLedger(false)
}, { rootMargin: '240px' })

onMounted(refresh)
</script>

<template>
  <OwnerPage
    :title="supplier?.name || t('owner_app_supplier')"
    back
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

    <Card class-name="owner-supplier">
      <span class="owner-eyebrow">{{ debt > 0 ? t('owner_app_we_owe') : t('owner_app_balance') }}</span>
      <Skeleton
        v-if="!supplier && !error"
        :w="180"
        :h="34"
      />
      <strong
        v-else
        class="owner-supplier__debt"
      >{{ fmtNum(debt) }} <small>UZS</small></strong>
      <span
        v-if="supplier?.phone || supplier?.contact_person"
        class="owner-supplier__contact"
      >
        {{ [supplier?.contact_person, supplier?.phone].filter(Boolean).join(' · ') }}
      </span>
    </Card>

    <Segmented
      v-model="tab"
      :options="tabs"
      class="owner-supplier__tabs"
    />

    <template v-if="tab === 'ledger'">
      <div
        v-if="loading && !rows.length"
        class="owner-list"
      >
        <Skeleton
          v-for="i in 5"
          :key="i"
          :h="58"
          :r="12"
        />
      </div>
      <StateFill
        v-else-if="!rows.length"
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
            <span class="owner-row__title">{{ readable(row.note) || typeLabel(row.type) }}</span>
            <span class="owner-row__sub">
              {{ typeLabel(row.type) }}<template v-if="row.source_account"> · {{ t(`supplier_source_${row.source_account}`) }}</template> · {{ formatDate(row.created_at) }}
            </span>
          </div>
          <span class="owner-row__amount">
            {{ row.change_uzs > 0 ? '+' : row.change_uzs < 0 ? '−' : '' }}{{ fmtNum(Math.abs(row.change_uzs)) }}
          </span>
        </li>
      </ul>
      <div
        ref="sentinel"
        class="owner-sentinel"
      >
        <Skeleton
          v-if="loading && rows.length"
          :h="58"
          :r="12"
        />
      </div>
    </template>
    <div
      v-else
      class="owner-supplier__purchases"
    >
      <SupplierPurchasesPanel :supplier-id="id" />
    </div>
  </OwnerPage>
</template>

<style scoped>
.owner-supplier { padding: 16px; display: grid; gap: 6px; margin-bottom: 14px; }
.owner-supplier__debt { color: var(--text); font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.owner-supplier__debt small { font-size: 13px; color: var(--text-secondary); }
.owner-supplier__contact { color: var(--text-secondary); font-size: 14px; }
.owner-supplier__tabs { margin-bottom: 12px; width: 100%; }
.owner-supplier__purchases { overflow-x: auto; }
.owner-sentinel { min-height: 1px; margin-top: 8px; }
</style>
