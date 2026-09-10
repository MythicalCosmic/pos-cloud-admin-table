<script setup lang="ts">
/* Per-method payment breakdown.
   Port of v3 PaymentBreakdown — used inside the Orders expanded row.
   Props:
     methods: Array<{ type: string, amount: number }>
     total:   number
*/

interface Method {
  type: string
  amount: number | string
}
interface Props {
  methods: Method[]
  total: number
}

const props = defineProps<Props>()

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()

const TONE: Record<string, string> = {
  Cash: 'var(--c2)',
  CASH: 'var(--c2)',
  Uzcard: 'var(--c1)',
  UZCARD: 'var(--c1)',
  Humo: 'var(--c4)',
  HUMO: 'var(--c4)',
  Payme: 'var(--c3)',
  PAYME: 'var(--c3)',
  Click: 'var(--c5)',
  CLICK: 'var(--c5)',
  Card: 'var(--c1)',
  CARD: 'var(--c1)',
}

function colorFor(type: string) {
  return TONE[type] ?? TONE[type?.toUpperCase()] ?? 'var(--c5)'
}

function nameFor(type: string) {
  if (!type) return ''
  const key = type.toUpperCase()
  // Reuse existing payment_method_* keys where possible
  const mapped: Record<string, string> = {
    CASH: t('Cash'),
    UZCARD: t('Uzcard'),
    HUMO: t('Humo'),
    PAYME: t('Payme'),
    CLICK: t('Click'),
    CARD: t('Card'),
  }
  return mapped[key] ?? type
}

// Customer-facing reporting treats every physical/card-network tender as one
// Card total. Keep Payme, Click, and other distinct methods separate.
const methods = computed<Method[]>(() => {
  const grouped = new Map<string, number>()

  for (const method of props.methods ?? []) {
    const rawType = String(method.type ?? '').toUpperCase()
    const type = ['CARD', 'HUMO', 'UZCARD'].includes(rawType) ? 'CARD' : rawType
    const amount = Number(method.amount) || 0
    if (!type || amount <= 0)
      continue
    grouped.set(type, (grouped.get(type) ?? 0) + amount)
  }

  return Array.from(grouped, ([type, amount]) => ({ type, amount }))
})

const safeTotal = computed(() => {
  const n = Number(props.total) || 0
  if (n > 0) return n
  return methods.value.reduce((a, m) => a + (Number(m.amount) || 0), 0) || 1
})

const mixed = computed(() => methods.value.length > 1)

function pct(amount: number | string) {
  const n = Number(amount) || 0
  return Math.round((n / safeTotal.value) * 100)
}
</script>

<template>
  <div class="paybreak">
    <div class="row between" style="margin-bottom: 10px;">
      <span class="kpi__label">
        {{ t('Payment') }}
        <span v-if="mixed" class="badge t-primary" style="margin-left: 6px;">
          {{ t('Mixed') }} · {{ methods.length }}
        </span>
      </span>
      <span class="mono cell-strong" style="font-size: 13px;">
        {{ formatCurrency(safeTotal) }}
      </span>
    </div>

    <div class="paybreak__bar">
      <div
        v-for="(m, i) in methods"
        :key="i"
        class="paybreak__seg"
        :title="nameFor(m.type)"
        :style="{
          width: `${(Number(m.amount) || 0) / safeTotal * 100}%`,
          background: colorFor(m.type),
        }"
      />
    </div>

    <div class="paybreak__list">
      <div v-for="(m, i) in methods" :key="`row-${i}`" class="row between">
        <span class="legend-item">
          <span class="legend-swatch" :style="{ background: colorFor(m.type) }" />
          {{ nameFor(m.type) }}
        </span>
        <span class="row" style="gap: 8px;">
          <span class="mono cell-strong" style="font-size: 13px;">
            {{ formatCurrency(m.amount) }}
          </span>
          <span class="tertiary mono" style="font-size: 11px; width: 34px; text-align: right;">
            {{ pct(m.amount) }}%
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}
.row.between {
  justify-content: space-between;
}
.paybreak__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
</style>
