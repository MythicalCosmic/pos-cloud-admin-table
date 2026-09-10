<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import FormInput from '@/components/design/FormInput.vue'
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

async function save() {
  if (saving.value) return
  if (!form.value.base_unit_id) {
    notify(t('Base unit is required'), 'error')

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

    if (props.mode === 'create')
      await axios.post('/items/', payload)
    else
      // Item detail route allows GET/PUT/DELETE (not PATCH).
      await axios.put(`/items/${props.item.id}/`, payload)
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
  <Modal :open="dialog" :title="mode === 'create' ? t('Add Stock Item') : t('Edit Stock Item')" :width="720" :busy="saving" @close="dialog = false"><VRow>
          <!-- Basic info -->
          <VCol cols="12">
            <p class="text-overline text-disabled mb-1">
              {{ t('Basic Information') }}
            </p>
          </VCol>
          <VCol
            cols="12"
            sm="6"
          >
            <FormInput
              v-model="form.name"
              :label="t('Name')"
              required
            />
          </VCol>
          <VCol
            cols="12"
            sm="3"
          >
            <FormInput
              v-model="form.sku"
              :label="t('SKU')"
            />
          </VCol>
          <VCol
            cols="12"
            sm="3"
          >
            <FormInput
              v-model="form.barcode"
              :label="t('Barcode')"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormSelect
              v-model="form.item_type"
              :items="itemTypes"
              :label="t('Type')"
              required
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormSelect
              v-model="form.category_id"
              :items="categoryOptions"
              :label="t('Category')"
              clearable
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormSelect
              v-model="form.base_unit_id"
              :items="unitOptions"
              :label="t('Base Unit *')"
            />
          </VCol>

          <!-- Stock thresholds -->
          <VCol
            cols="12"
            class="mt-2"
          >
            <p class="text-overline text-disabled mb-1">
              {{ t('Stock Levels') }}
            </p>
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormInput
              v-model.number="form.min_stock_level"
              :label="t('Min Level')"
              type="number"
              step="0.01"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormInput
              v-model.number="form.max_stock_level"
              :label="t('Max Level')"
              type="number"
              step="0.01"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <FormInput
              v-model.number="form.reorder_point"
              :label="t('Reorder Point')"
              type="number"
              step="0.01"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <AppPriceInput
              v-model="form.cost_price"
              :label="t('Cost Price')"
            />
          </VCol>

          <!-- Flags -->
          <VCol
            cols="12"
            class="mt-2"
          >
            <p class="text-overline text-disabled mb-1">
              {{ t('Flags') }}
            </p>
          </VCol>
          <VCol
            cols="6"
            sm="4"
          >
            <FormSwitch
              v-model="form.is_purchasable"
              :label="t('Purchasable')"
              color="primary"
              density="compact"
            />
          </VCol>
          <VCol
            cols="6"
            sm="4"
          >
            <FormSwitch
              v-model="form.is_sellable"
              :label="t('Sellable')"
              color="primary"
              density="compact"
            />
          </VCol>
          <VCol
            cols="6"
            sm="4"
          >
            <FormSwitch
              v-model="form.is_producible"
              :label="t('Producible')"
              color="primary"
              density="compact"
            />
          </VCol>
          <VCol
            cols="6"
            sm="4"
          >
            <FormSwitch
              v-model="form.track_batches"
              :label="t('Track Batches')"
              color="warning"
              density="compact"
            />
          </VCol>
          <VCol
            cols="6"
            sm="4"
          >
            <FormSwitch
              v-model="form.track_expiry"
              :label="t('Track Expiry')"
              color="warning"
              density="compact"
            />
          </VCol>

          <!-- Expiry / storage -->
          <template v-if="form.track_expiry">
            <VCol
              cols="12"
              sm="4"
            >
              <FormInput
                v-model.number="form.default_expiry_days"
                :label="t('Default Expiry (days)')"
                type="number"
                :min="1"
              />
            </VCol>
          </template>
          <VCol cols="12">
            <FormInput
              v-model="form.storage_conditions"
              :label="t('Storage Conditions')"
            />
          </VCol>
          <VCol cols="12">
            <FormSwitch
              v-if="mode === 'edit'"
              v-model="form.is_active"
              :label="t('Active')"
              color="success"
              density="compact"
            />
          </VCol>
        </VRow><template #footer><Button
          :loading="saving"
          @click="save"
        >
          {{ t('Save') }}
        </Button></template></Modal>

  <VSnackbar
    v-model="snackbar"
    :color="snackbarColor"
    :timeout="3000"
  >
    {{ snackbarMsg }}
  </VSnackbar>
</template>
