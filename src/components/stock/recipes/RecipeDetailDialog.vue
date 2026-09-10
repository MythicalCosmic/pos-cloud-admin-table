<script setup lang="ts">
/* ============================================================
   ALPHA POS — Recipe quick-view dialog
   Rebuilt on the shared design-system Modal to match the rest
   of the Recipes page. The list endpoint returns a *brief*
   serialization (no ingredients / cost), so on open we fetch
   the full recipe detail — otherwise the ingredient table can
   never populate. Also surfaces the estimated cost and an
   on-demand "can I make this now?" availability check, both of
   which are already exposed by the backend.
     GET /recipes/:id/?include_cost=true
     GET /recipes/:id/availability/?batch_multiplier=
   ============================================================ */
import { stockApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'

const props = defineProps<{
  modelValue: boolean
  recipe: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const { formatCurrency } = useFormatters()

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const typeTone: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  PRODUCTION: 'primary',
  ASSEMBLY: 'success',
  PREPARATION: 'warning',
  DISASSEMBLY: 'error',
}

/* ---------------- full-detail fetch ---------------- */
const detail = ref<any>(null)
const loading = ref(false)
const error = ref(false)

const ingredients = computed<any[]>(() => detail.value?.ingredients ?? [])
const estimatedCost = computed<number | null>(() => {
  const c = detail.value?.estimated_cost
  return c === null || c === undefined || c === '' ? null : Number(c)
})

async function loadDetail() {
  const id = props.recipe?.id
  if (!id)
    return
  loading.value = true
  error.value = false
  try {
    const res = await stockApi.get(`/recipes/${id}/`, { params: { include_cost: 'true' } })
    const d = res.data?.data ?? res.data
    detail.value = d?.recipe ?? d
  }
  catch {
    error.value = true
    detail.value = null
  }
  finally {
    loading.value = false
  }
}

/* ---------------- availability check ---------------- */
const batchMultiplier = ref<number>(1)
const availability = ref<any[]>([])
const loadingAvail = ref(false)
const availChecked = ref(false)

const allAvailable = computed(() =>
  availability.value.length > 0 && availability.value.every((r: any) => r.is_available),
)

async function checkAvailability() {
  const id = props.recipe?.id
  if (!id)
    return
  loadingAvail.value = true
  try {
    const res = await stockApi.get(`/recipes/${id}/availability/`, {
      params: { batch_multiplier: batchMultiplier.value || 1 },
    })
    const d = res.data?.data ?? res.data
    availability.value = d?.ingredients ?? []
    availChecked.value = true
  }
  catch {
    availability.value = []
    availChecked.value = true
  }
  finally {
    loadingAvail.value = false
  }
}

/* ---------------- lifecycle ---------------- */
// Reset transient state and (re)fetch whenever the dialog opens for a recipe.
watch(visible, (open) => {
  if (open) {
    detail.value = null
    availability.value = []
    availChecked.value = false
    batchMultiplier.value = 1
    loadDetail()
  }
})

function openFull() {
  const id = props.recipe?.id
  visible.value = false
  if (id)
    router.push(`/stock/recipes/${id}`)
}

function fmtQty(val: any): string {
  if (val === null || val === undefined || val === '')
    return '—'
  const n = Number(val)
  if (!Number.isFinite(n))
    return String(val)
  return n.toFixed(4).replace(/\.?0+$/, '')
}
</script>

<template>
  <Modal
    :open="visible"
    :width="600"
    :title="(detail?.name ?? recipe?.name) || t('recipe_drill_title')"
    :subtitle="t('recipe_quick_view')"
    @close="visible = false"
  >
    <!-- Loading skeleton -->
    <div v-if="loading" class="rq-skeleton">
      <div class="sk-box" style="width:120px; height:22px;" />
      <div class="sk-box" style="width:70%; height:16px; margin-top:12px;" />
      <div class="sk-box" style="width:100%; height:52px; margin-top:16px;" />
      <div class="sk-box" style="width:100%; height:120px; margin-top:12px;" />
    </div>

    <!-- Error + retry -->
    <div v-else-if="error" class="rq-error">
      <DesignIcon name="alert" :size="28" class="t-error" />
      <p>{{ t('recipe_load_failed') }}</p>
      <Button variant="ghost" icon="retry" @click="loadDetail">
        {{ t('Retry') }}
      </Button>
    </div>

    <template v-else-if="detail">
      <!-- Badges -->
      <div class="rq-badges">
        <Badge :tone="typeTone[detail.recipe_type] ?? 'neutral'">
          {{ t(`recipe_type_${detail.recipe_type}`) }}
        </Badge>
        <Badge v-if="detail.version" tone="neutral">
          v{{ detail.version }}
        </Badge>
        <Badge :tone="detail.is_active ? 'success' : 'neutral'" dot>
          {{ detail.is_active ? t('Active') : t('Inactive') }}
        </Badge>
      </div>

      <!-- Output line -->
      <div class="rq-output">
        <span class="cell-muted">{{ t('Output') }}:&nbsp;</span>
        <strong>
          <span class="num-tabular">{{ fmtQty(detail.output_quantity) }}</span>
          {{ detail.output_unit ?? '' }}
          {{ detail.output_item?.name ?? detail.output_item_name ?? '' }}
        </strong>
      </div>

      <!-- Quick facts -->
      <div class="rq-facts">
        <div class="rq-fact">
          <span class="rq-fact__label">{{ t('recipe_total_cost') }}</span>
          <span class="rq-fact__value">{{ estimatedCost === null ? '—' : formatCurrency(estimatedCost) }}</span>
        </div>
        <div class="rq-fact">
          <span class="rq-fact__label">{{ t('recipe_difficulty_level') }}</span>
          <span class="rq-fact__value">{{ detail.difficulty_level ?? '—' }}<span class="cell-muted">/5</span></span>
        </div>
        <div class="rq-fact">
          <span class="rq-fact__label">{{ t('recipe_estimated_time') }}</span>
          <span class="rq-fact__value">
            {{ detail.estimated_time_minutes ?? '—' }}
            <span v-if="detail.estimated_time_minutes" class="cell-muted">{{ t('recipe_estimated_time_minutes') }}</span>
          </span>
        </div>
      </div>

      <!-- Ingredients -->
      <p class="rq-section-title">
        {{ t('recipe_ingredients') }}
        <span class="cell-muted">({{ ingredients.length }})</span>
      </p>
      <div class="rq-table-wrap">
        <table class="rq-table">
          <thead>
            <tr>
              <th>{{ t('recipe_ingredient_item') }}</th>
              <th class="ta-right">{{ t('recipe_ingredient_quantity') }}</th>
              <th>{{ t('recipe_ingredient_unit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ing in ingredients" :key="ing.id">
              <td>
                {{ ing.stock_item?.name ?? '—' }}
                <Badge v-if="ing.is_optional" tone="neutral" class="rq-inline-badge">
                  {{ t('recipe_ingredient_is_optional') }}
                </Badge>
                <Badge v-if="Number(ing.waste_percentage) > 0" tone="warning" class="rq-inline-badge">
                  {{ t('recipe_ingredient_waste_percentage') }} {{ fmtQty(ing.waste_percentage) }}%
                </Badge>
              </td>
              <td class="ta-right num-tabular">{{ fmtQty(ing.quantity) }}</td>
              <td>{{ ing.unit ?? '—' }}</td>
            </tr>
            <tr v-if="!ingredients.length">
              <td colspan="3" class="rq-empty">{{ t('recipe_no_ingredients') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Availability check -->
      <div v-if="ingredients.length" class="rq-avail">
        <div class="rq-avail__head">
          <p class="rq-section-title" style="margin:0;">
            {{ t('recipe_availability') }}
          </p>
          <div class="rq-avail__controls">
            <label class="rq-bm">
              <span class="cell-muted">{{ t('recipe_batch_multiplier') }}</span>
              <div class="rq-bm__input">
                <Input
                  v-model.number="batchMultiplier"
                  type="number"
                  step="0.5"
                  min="0.5"
                />
              </div>
            </label>
            <Button
              variant="secondary"
              icon="check"
              :loading="loadingAvail"
              :disabled="loadingAvail"
              @click="checkAvailability"
            >
              {{ t('recipe_check_availability') }}
            </Button>
          </div>
        </div>

        <div v-if="availChecked && availability.length" class="rq-avail__body">
          <Badge :tone="allAvailable ? 'success' : 'warning'" dot class="rq-avail__verdict">
            {{ allAvailable ? t('recipe_availability_all_available') : t('recipe_availability_some_missing') }}
          </Badge>
          <div class="rq-table-wrap" style="margin-top:10px;">
            <table class="rq-table">
              <thead>
                <tr>
                  <th>{{ t('recipe_ingredient_item') }}</th>
                  <th class="ta-right">{{ t('recipe_availability_required') }}</th>
                  <th class="ta-right">{{ t('recipe_availability_available') }}</th>
                  <th>{{ t('Status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in availability" :key="row.stock_item_id">
                  <td>{{ row.stock_item_name ?? '—' }}</td>
                  <td class="ta-right num-tabular">{{ fmtQty(row.required_quantity) }} {{ row.unit }}</td>
                  <td class="ta-right num-tabular">{{ fmtQty(row.available_stock) }} {{ row.unit }}</td>
                  <td>
                    <Badge :tone="row.is_available ? 'success' : 'error'" dot>
                      {{ row.is_available ? t('recipe_availability_available') : t('recipe_availability_unavailable') }}
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <Button variant="ghost" @click="visible = false">
        {{ t('Close') }}
      </Button>
      <Button
        variant="primary"
        icon="chevright"
        :disabled="!recipe?.id"
        @click="openFull"
      >
        {{ t('recipe_open_full') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.rq-skeleton {
  padding: 4px 0;
}
.sk-box {
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 6px;
  animation: sk-pulse 1.5s ease-in-out infinite;
}
@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.rq-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 0;
  text-align: center;
  color: var(--text-secondary);
}

.rq-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.rq-output {
  font-size: 14px;
  margin-bottom: 16px;
  overflow-wrap: anywhere;
}

.rq-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.rq-fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-neutral-border));
  border-radius: var(--r-sm);
  background: rgb(var(--v-theme-neutral-weak));
}
.rq-fact__label {
  font-size: var(--fs-label);
  color: var(--text-secondary);
}
.rq-fact__value {
  font-size: 16px;
  font-weight: var(--fw-semibold);
}

.rq-section-title {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

.rq-table-wrap {
  overflow-x: auto;
  border: 1px solid rgb(var(--v-theme-neutral-border));
  border-radius: var(--r-sm);
}
.rq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rq-table th,
.rq-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid rgb(var(--v-theme-neutral-border));
  white-space: nowrap;
}
.rq-table thead th {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-secondary);
  background: rgb(var(--v-theme-neutral-weak));
}
.rq-table tbody tr:last-child td {
  border-bottom: none;
}
.rq-table td:first-child {
  white-space: normal;
}
.ta-right {
  text-align: right !important;
}
.rq-empty {
  text-align: center !important;
  color: var(--text-secondary);
  padding: 18px 12px !important;
}
.rq-inline-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.rq-avail {
  margin-top: 18px;
}
.rq-avail__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.rq-avail__controls {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.rq-bm {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-label);
}
.rq-bm__input {
  width: 96px;
}
.rq-bm__input :deep(.control) {
  width: 100%;
}
.rq-avail__verdict {
  margin-bottom: 2px;
}

@media (max-width: 560px) {
  .rq-facts {
    grid-template-columns: 1fr;
  }
  .rq-avail__head {
    align-items: stretch;
  }
}
</style>
