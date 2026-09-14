<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import FormInput from '@/components/design/FormInput.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { stockApi as axios } from '@/plugins/axios'

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  item?: any
  categoryOptions: { title: string; value: number }[]
  unitOptions: { title: string; value: number }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

const dialog = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const saving = ref(false)
const baseUnitError = ref('')

const itemTypes = ['RAW', 'SEMI', 'FINISHED', 'PACKAGING']

const defaultForm = () => ({
  name: '',
  sku: '',
  barcode: '',
  item_type: 'RAW',
  category_id: null as number | null,
  base_unit_id: null as number | null,
  min_stock_level: 0,
  max_stock_level: 0,
  reorder_point: 0,
  cost_price: 0,
  is_purchasable: true,
  is_sellable: false,
  is_producible: false,
  track_batches: false,
  track_expiry: false,
  default_expiry_days: null as number | null,
  storage_conditions: '',
  is_active: true,
})

const form = ref(defaultForm())

// eslint-disable-next-line sonarjs/cognitive-complexity
watch(() => props.modelValue, open => {
  if (!open)
    return
  baseUnitError.value = ''
  if (props.mode === 'edit' && props.item) {
    const it = props.item

    form.value = {
      name: it.name ?? '',
      sku: it.sku ?? '',
      barcode: it.barcode ?? '',
      item_type: it.item_type ?? 'RAW',
      category_id: it.category_id ?? null,
      base_unit_id: it.base_unit_id ?? null,
      min_stock_level: it.min_stock_level ?? 0,
      max_stock_level: it.max_stock_level ?? 0,
      reorder_point: it.reorder_point ?? 0,
      cost_price: it.cost_price ?? 0,
      is_purchasable: it.is_purchasable ?? true,
      is_sellable: it.is_sellable ?? false,
      is_producible: it.is_producible ?? false,
      track_batches: it.track_batches ?? false,
      track_expiry: it.track_expiry ?? false,
      default_expiry_days: it.default_expiry_days ?? null,
      storage_conditions: it.storage_conditions ?? '',
      is_active: it.is_active ?? true,
    }
  }
  else {
    form.value = defaultForm()
  }
})

watch(() => form.value.base_unit_id, value => {
  if (value)
    baseUnitError.value = ''
})

async function save() {
  if (saving.value)
    return
  if (!form.value.base_unit_id) {
    baseUnitError.value = t('Base unit is required')
    notify(baseUnitError.value, 'error')

    return
  }
  saving.value = true
  try {
    const payload: any = { ...form.value }
    if (!payload.category_id)
      delete payload.category_id
    if (!payload.default_expiry_days)
      delete payload.default_expiry_days
    if (!payload.barcode)
      delete payload.barcode
    if (!payload.storage_conditions)
      delete payload.storage_conditions

    if (props.mode === 'create') {
      await axios.post('/items/', payload)
    }
    else {
      // Item detail route allows GET/PUT/DELETE (not PATCH).
      await axios.put(`/items/${props.item.id}/`, payload)
    }
    notify(props.mode === 'create' ? t('Item created') : t('Item updated'))
    dialog.value = false
    emit('saved')
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving item'), 'error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="dialog"
    :title="mode === 'create' ? t('Add Stock Item') : t('Edit Stock Item')"
    :width="780"
    :busy="saving"
    @close="dialog = false"
  >
    <form
      id="stock-item-form"
      class="stock-item-form"
      @submit.prevent="save"
    >
      <section class="stock-item-form__section">
        <header class="stock-item-form__section-head">
          <span><DesignIcon
            name="box"
            :size="18"
          /></span>
          <h3>{{ t('Basic Information') }}</h3>
        </header>
        <div class="stock-item-form__grid stock-item-form__grid--identity">
          <FormInput
            v-model="form.name"
            class="stock-item-form__identity-name"
            :label="t('Name')"
            required
          />
          <FormInput
            v-model="form.sku"
            class="stock-item-form__identity-code"
            :label="t('SKU')"
          />
          <FormInput
            v-model="form.barcode"
            class="stock-item-form__identity-code"
            :label="t('Barcode')"
          />
          <FormSelect
            v-model="form.item_type"
            class="stock-item-form__identity-select"
            :items="itemTypes"
            :label="t('Type')"
            required
          />
          <FormSelect
            v-model="form.category_id"
            class="stock-item-form__identity-select"
            :items="categoryOptions"
            :label="t('Category')"
            clearable
          />
          <FormSelect
            v-model="form.base_unit_id"
            class="stock-item-form__identity-select"
            :items="unitOptions"
            :label="t('Base Unit *')"
            :error-messages="baseUnitError"
          />
        </div>
      </section>

      <section class="stock-item-form__section">
        <header class="stock-item-form__section-head">
          <span><DesignIcon
            name="chart"
            :size="18"
          /></span>
          <h3>{{ t('Stock Levels') }}</h3>
        </header>
        <div class="stock-item-form__grid stock-item-form__grid--levels">
          <FormInput
            v-model.number="form.min_stock_level"
            :label="t('Min Level')"
            type="number"
            step="0.01"
          />
          <FormInput
            v-model.number="form.max_stock_level"
            :label="t('Max Level')"
            type="number"
            step="0.01"
          />
          <FormInput
            v-model.number="form.reorder_point"
            :label="t('Reorder Point')"
            type="number"
            step="0.01"
          />
          <AppPriceInput
            v-model="form.cost_price"
            :label="t('Cost Price')"
          />
        </div>
      </section>

      <section class="stock-item-form__section">
        <header class="stock-item-form__section-head">
          <span><DesignIcon
            name="sliders"
            :size="18"
          /></span>
          <h3>{{ t('Flags') }}</h3>
        </header>
        <div class="stock-item-form__toggles">
          <FormSwitch
            v-model="form.is_purchasable"
            :label="t('Purchasable')"
          />
          <FormSwitch
            v-model="form.is_sellable"
            :label="t('Sellable')"
          />
          <FormSwitch
            v-model="form.is_producible"
            :label="t('Producible')"
          />
          <FormSwitch
            v-model="form.track_batches"
            :label="t('Track Batches')"
          />
          <FormSwitch
            v-model="form.track_expiry"
            :label="t('Track Expiry')"
          />
          <FormSwitch
            v-if="mode === 'edit'"
            v-model="form.is_active"
            :label="t('Active')"
          />
        </div>
      </section>

      <section class="stock-item-form__section">
        <header class="stock-item-form__section-head">
          <span><DesignIcon
            name="package"
            :size="18"
          /></span>
          <h3>{{ t('Storage Conditions') }}</h3>
        </header>
        <div class="stock-item-form__grid stock-item-form__grid--storage">
          <FormInput
            v-if="form.track_expiry"
            v-model.number="form.default_expiry_days"
            :label="t('Default Expiry (days)')"
            type="number"
            :min="1"
          />
          <FormInput
            v-model="form.storage_conditions"
            :class="{ 'stock-item-form__wide': !form.track_expiry }"
            :label="t('Storage Conditions')"
          />
        </div>
      </section>
    </form>

    <template #footer>
      <Button
        type="submit"
        form="stock-item-form"
        icon="save"
        :loading="saving"
      >
        {{ t('Save') }}
      </Button>
    </template>
  </Modal>

  <VSnackbar
    v-model="snackbar"
    :color="snackbarColor"
    :timeout="3000"
  >
    {{ snackbarMsg }}
  </VSnackbar>
</template>

<style scoped>
.stock-item-form { display: grid; gap: 18px; }
.stock-item-form__section { overflow: hidden; border: 1px solid var(--work-line); border-radius: 17px; background: var(--surface); }
.stock-item-form__section-head { display: flex; align-items: center; gap: 11px; padding: 13px 16px; border-block-end: 1px solid var(--work-line); background: var(--work-soft); }
.stock-item-form__section-head > span { display: grid; place-items: center; inline-size: 32px; block-size: 32px; border: 1px solid var(--primary-border); border-radius: 10px; background: var(--surface); color: var(--primary); }
.stock-item-form__section-head h3 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: -.01em; }
.stock-item-form__grid { display: grid; gap: 17px 15px; padding: 18px 16px 20px; }
.stock-item-form__grid--identity { grid-template-columns: repeat(12, minmax(0, 1fr)); }
.stock-item-form__identity-name { grid-column: span 6; }
.stock-item-form__identity-code { grid-column: span 3; }
.stock-item-form__identity-select { grid-column: span 4; }
.stock-item-form__grid--levels { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stock-item-form__grid--storage { grid-template-columns: minmax(170px, .45fr) minmax(0, 1fr); }
.stock-item-form__wide { grid-column: span 2; }
.stock-item-form__toggles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 16px; }
.stock-item-form__toggles :deep(.form-switch) { min-block-size: 58px; margin: 0; }

@media (max-width: 700px) {
  .stock-item-form { gap: 14px; }
  .stock-item-form__grid--identity,
  .stock-item-form__grid--levels,
  .stock-item-form__grid--storage { grid-template-columns: minmax(0, 1fr); }
  .stock-item-form__identity-name,
  .stock-item-form__identity-code,
  .stock-item-form__identity-select { grid-column: auto; }
  .stock-item-form__wide { grid-column: auto; }
  .stock-item-form__toggles { grid-template-columns: minmax(0, 1fr); }
}
</style>
