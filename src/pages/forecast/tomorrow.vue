<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import axios from '@/plugins/axios'
import PageHeader from '@/components/design/PageHeader.vue'
import Button from '@/components/design/Button.vue'
import Input from '@/components/design/Input.vue'
import Select from '@/components/design/Select.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'
import { buildCsv } from '@/utils/csv'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()

const loading = ref(false)
interface ForecastItem {
  product_id: string | number
  product_name: string
  suggested_qty?: number
  predicted_quantity?: number
  reason?: string
}
interface ForecastData {
  tomorrow?: string
  reason?: string
  predictions?: ForecastItem[]
}
const data = ref<ForecastData | null>(null)
const error = ref<string>('')

async function load() {
  if (loading.value)
    return
  loading.value = true
  error.value = ''
  try {
    const res = await axios.get('/forecast/tomorrow')

    data.value = res.data?.data ?? res.data
  }
  catch (e: any) {
    const msg = e?.response?.data?.message ?? t('Forecast unavailable')

    error.value = msg
    notify(msg, 'error')
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

const predictions = computed<ForecastItem[]>(() => data.value?.predictions ?? [])
const reason = computed(() => data.value?.reason)
const search = ref('')
const sort = ref('quantity')

const quantity = (item: ForecastItem) => {
  const value = item.suggested_qty ?? item.predicted_quantity
  return (value == null || !Number.isFinite(Number(value))) ? null : Number(value)
}

const maxQty = computed(() => Math.max(...predictions.value.map(item => quantity(item) ?? 0), 1))
const visible = computed(() => predictions.value.filter(item => item.product_name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())).sort((a, b) => sort.value === 'name' ? a.product_name.localeCompare(b.product_name) : (quantity(b) ?? -1) - (quantity(a) ?? -1)))
const totalQuantity = computed(() => (predictions.value.length && predictions.value.every(item => quantity(item) !== null)) ? predictions.value.reduce((sum, item) => sum + (quantity(item) ?? 0), 0) : null)
function exportForecast() {
  const csv = buildCsv([[t('Product'), t('Quantity'), t('Reason')], ...visible.value.map(item => [item.product_name, quantity(item) ?? '', item.reason ?? ''])])
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')

  link.href = url
  link.download = `forecast-${data.value?.tomorrow || 'tomorrow'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <WorkspacePage class="page forecast-workspace">
    <PageHeader
      :title="t('Demand Forecast')"
      :subtitle="t('What to prep tomorrow morning, based on last 30 days')"
    >
      <template #actions>
        <Button
          icon="download"
          :disabled="loading || !visible.length"
          @click="exportForecast"
        >
          {{ t('Export') }}
        </Button><Button
          icon="refresh"
          variant="primary"
          :loading="loading"
          @click="load"
        >
          {{ t('Recalculate') }}
        </Button>
      </template>
    </PageHeader>
    <div class="forecast-summary">
      <div>
        <span class="forecast-summary__label"><DesignIcon
          name="sparkle"
          :size="17"
        />{{ t('workspace_forecast_plan') }}</span><h2>{{ data?.tomorrow ? t('Forecast for {date}', { date: data.tomorrow }) : t('Demand Forecast') }}</h2><p>{{ t('workspace_forecast_hint') }}</p>
      </div><div class="forecast-summary__metric">
        <span>{{ t('Products') }}</span><strong>{{ loading || error ? '—' : fmtNum(predictions.length) }}</strong>
      </div><div class="forecast-summary__metric">
        <span>{{ t('units') }}</span><strong>{{ loading || error ? '—' : fmtNum(totalQuantity) }}</strong>
      </div>
    </div>
    <div class="card forecast-plan">
      <WorkspaceToolbar class="toolbar">
        <Input
          v-model="search"
          icon="search"
          :placeholder="t('Search products')"
        /><Select
          v-model="sort"
          icon="sort"
          :aria-label="t('Sort')"
          :options="[{ value: 'quantity', label: t('workspace_forecast_quantity') }, { value: 'name', label: t('Name') }]"
        />
      </WorkspaceToolbar>
      <div
        v-if="loading"
        class="forecast-plan__loading"
        role="status"
        :aria-label="t('Loading...')"
      >
        <div
          v-for="n in 6"
          :key="n"
          class="forecast-plan__skeleton"
        >
          <span class="sk-box" /><span class="sk-box" /><span class="sk-box" />
        </div>
      </div>
      <StateFill
        v-else-if="error"
        error
        icon="alert"
        :title="t('Forecast unavailable')"
        :sub="error"
      >
        <template #action>
          <Button
            icon="retry"
            @click="load"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>
      <StateFill
        v-else-if="reason === 'no_history'"
        icon="hourglass"
        :title="t('No forecast available')"
        :sub="t('Not enough order history yet. Forecast will appear once you have ~30 days of orders.')"
      />
      <StateFill
        v-else-if="!visible.length"
        icon="search"
        :title="t(search ? 'No results' : 'No forecast available')"
      />
      <ol
        v-else
        class="forecast-plan__list"
      >
        <li
          v-for="(item, index) in visible"
          :key="item.product_id"
        >
          <span class="forecast-plan__rank">{{ String(index + 1).padStart(2, '0') }}</span><div class="forecast-plan__product">
            <strong>{{ item.product_name }}</strong><span v-if="item.reason">{{ t('Reason') }}: {{ item.reason }}</span>
          </div><div
            class="forecast-plan__bar"
            aria-hidden="true"
          >
            <span :style="{ width: `${Math.max(0, (quantity(item) ?? 0) / maxQty) * 100}%` }" />
          </div><div class="forecast-plan__quantity">
            <strong>{{ fmtNum(quantity(item)) }}</strong><span>{{ t('units') }}</span>
          </div>
        </li>
      </ol>
    </div>
  </WorkspacePage>
</template>

<style scoped>
.forecast-summary { display: grid; grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)); align-items: center; gap: 28px; padding: 32px; margin-block-end: 24px; border-radius: 20px; background: var(--surface); color: var(--text); }
.forecast-summary__label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: var(--primary); }
.forecast-summary h2 { font-size: clamp(24px, 3vw, 32px); margin-block: 14px 10px; letter-spacing: -.035em; line-height: 1.15; }
.forecast-summary p { max-inline-size: 440px; font-size: 12px; line-height: 1.7; color: var(--text-secondary); margin: 0; }
.forecast-summary__metric { display: flex; flex-direction: column; gap: 14px; padding-inline-start: 28px; border-inline-start: 1px solid var(--border); }
.forecast-summary__metric span { color: var(--text-secondary); font-size: 12px; }
.forecast-summary__metric strong { font-family: var(--font-mono); font-size: clamp(24px, 3vw, 38px); overflow-wrap: anywhere; }
.forecast-plan { overflow: hidden; }
.forecast-plan .toolbar { justify-content: space-between; border-block-end: 1px solid var(--border); }
.forecast-plan .toolbar > .control:first-child { flex: 1; max-inline-size: 400px; }
.forecast-plan .toolbar > .control--select { min-inline-size: 200px; }
.forecast-plan__list { margin: 0; padding: 0 24px; list-style: none; }
.forecast-plan__list li { display: grid; grid-template-columns: 28px minmax(0, 1.5fr) minmax(100px, 1fr) 80px; align-items: center; gap: 22px; padding-block: 24px; border-block-end: 1px solid var(--border); }
.forecast-plan__list li:last-child { border-block-end: 0; }
.forecast-plan__rank { font-family: var(--font-mono); color: var(--text-tertiary); font-size: 11px; }
.forecast-plan__product, .forecast-plan__quantity { display: flex; flex-direction: column; gap: 5px; min-inline-size: 0; }
.forecast-plan__product strong { font-size: 15px; font-weight: 600; }
.forecast-plan__product span { color: var(--text-secondary); font-size: 12px; }
.forecast-plan__quantity { align-items: flex-end; }
.forecast-plan__quantity strong { font-family: var(--font-mono); font-size: 20px; }
.forecast-plan__quantity span { color: var(--text-tertiary); font-size: 11px; }
.forecast-plan__bar { block-size: 10px; overflow: hidden; border-radius: 5px; background: var(--surface-inset); }
.forecast-plan__bar span { display: block; block-size: 100%; border-radius: inherit; background: var(--primary); }
.forecast-plan__loading { padding: 24px; }
.forecast-plan__skeleton { display: grid; grid-template-columns: 2fr 1fr 50px; gap: 24px; padding-block: 24px; }
.forecast-plan__skeleton span { block-size: 20px; border-radius: 6px; }
@media (width <= 700px) {
  .forecast-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 24px; gap: 24px; }
  .forecast-summary > div:first-child { grid-column: 1 / -1; }
  .forecast-summary__metric { padding: 0; border: 0; }
  .forecast-plan__list { padding-inline: 16px; }
  .forecast-plan__list li { grid-template-columns: 20px minmax(0, 1fr) 70px; gap: 14px; }
  .forecast-plan__bar { grid-column: 2 / -1; grid-row: 2; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
