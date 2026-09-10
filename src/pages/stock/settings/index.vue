<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import StateFill from '@/components/design/StateFill.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import FormInput from '@/components/design/FormInput.vue'
import { stockApi as axios } from '@/plugins/axios'

const { t } = useI18n({ useScope: 'global' })

const loading = ref(false)
const saving = ref(false)
const loadError = ref(false)
const saved = ref('')

const { notify } = useNotify()

const form = ref({
  // General
  stock_enabled: true,
  multi_location_enabled: false,
  allow_negative_stock: true,

  // Tracking
  track_cost: true,
  track_batches: true,
  track_expiry: false,
  track_serial_numbers: false,
  costing_method: 'FIFO',

  // Auto Actions
  auto_deduct_on_sale: true,
  deduct_on_order_status: 'PREPARING',
  reserve_on_order_create: false,
  auto_create_production: false,

  // Modules
  production_enabled: false,
  purchasing_enabled: false,

  // Alerts
  low_stock_alert_enabled: true,
  expiry_alert_enabled: true,
  expiry_alert_days: 7,
  negative_stock_alert: true,

  // Approvals
  require_po_approval: false,
  require_transfer_approval: false,
  require_adjustment_approval: false,
  require_count_approval: true,

  // Extra
  include_waste_in_cost: true,
})

const dirty = computed(() => !!saved.value && JSON.stringify(form.value) !== saved.value)

const costingMethods = computed(() => [
  { title: t('costing_FIFO'), value: 'FIFO' },
  { title: t('costing_LIFO'), value: 'LIFO' },
  { title: t('costing_AVERAGE'), value: 'AVERAGE' },
  { title: t('costing_SPECIFIC'), value: 'SPECIFIC' },
])

const orderStatuses = computed(() => [
  { title: t('deduct_on_CREATED'), value: 'CREATED' },
  { title: t('deduct_on_PREPARING'), value: 'PREPARING' },
  { title: t('deduct_on_READY'), value: 'READY' },
  { title: t('deduct_on_PAID'), value: 'PAID' },
])

async function loadSettings() {
  if (loading.value || saving.value)
    return
  loading.value = true
  loadError.value = false
  try {
    const res = await axios.get('/settings/')
    const d = res.data?.data ?? res.data

    Object.keys(form.value).forEach(key => {
      if (d[key] !== undefined)
        (form.value as any)[key] = d[key]
    })
    saved.value = JSON.stringify(form.value)
  }
  catch {
    loadError.value = true
    notify(t('Failed to load settings'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function saveSettings() {
  if (saving.value || loading.value || loadError.value || !dirty.value)
    return
  saving.value = true
  try {
    const payload = { ...form.value }

    await axios.put('/settings/', payload)
    saved.value = JSON.stringify(payload)
    notify(t('Settings saved'))
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error saving settings'), 'error')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="page settings-page">
    <PageHeader
      :title="t('Stock Settings')"
      :subtitle="t('Configure stock tracking, alerts, modules, and approvals')"
    >
      <template #actions>
        <Button
          icon="save"
          variant="primary"
          :loading="saving"
          :disabled="loading || loadError || !dirty"
          @click="saveSettings"
        >
          {{ t('Save Settings') }}
        </Button>
      </template>
    </PageHeader>
    <StateFill
      v-if="loadError"
      error
      icon="alert"
      :title="t('Failed to load settings')"
    >
      <template #action>
        <Button
          icon="retry"
          @click="loadSettings"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>
    <div
      v-else
      class="settings-workspace"
    >
      <nav
        class="settings-directory"
        :aria-label="t('Stock Settings')"
      >
        <a href="#stock-setting-0"><DesignIcon
          name="sliders"
          :size="17"
        /><span>{{ t('General') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
        <a href="#stock-setting-1"><DesignIcon
          name="package"
          :size="17"
        /><span>{{ t('Tracking') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
        <a href="#stock-setting-2"><DesignIcon
          name="refresh"
          :size="17"
        /><span>{{ t('Auto Actions') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
        <a href="#stock-setting-3"><DesignIcon
          name="grid"
          :size="17"
        /><span>{{ t('Modules') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
        <a href="#stock-setting-4"><DesignIcon
          name="bell"
          :size="17"
        /><span>{{ t('Alerts') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
        <a href="#stock-setting-5"><DesignIcon
          name="shield"
          :size="17"
        /><span>{{ t('Approvals') }}</span><DesignIcon
          name="chevright"
          :size="14"
        /></a>
      </nav>
      <div class="settings-sections">
        <section
          id="stock-setting-0"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="sliders"
              :size="21"
            /></span><h2>{{ t('General') }}</h2><span class="settings-section__index">01</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.stock_enabled"
              :disabled="saving"
              :label="t('Stock Enabled')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.multi_location_enabled"
              :disabled="saving"
              :label="t('Multi Location')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.allow_negative_stock"
              :disabled="saving"
              :label="t('Allow Negative Stock')"
              color="primary"
            />
          </fieldset>
        </section>
        <section
          id="stock-setting-1"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="package"
              :size="21"
            /></span><h2>{{ t('Tracking') }}</h2><span class="settings-section__index">02</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.track_cost"
              :disabled="saving"
              :label="t('Track Cost')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.track_batches"
              :disabled="saving"
              :label="t('Track Batches')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.track_expiry"
              :disabled="saving"
              :label="t('Track Expiry')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.track_serial_numbers"
              :disabled="saving"
              :label="t('Track Serial Numbers')"
              color="primary"
              class="mb-2"
            /><FormSelect
              v-model="form.costing_method"
              :disabled="saving"
              :items="costingMethods"
              :label="t('Costing Method')"
              density="compact"
              class="mt-2"
            /><FormSwitch
              v-model="form.include_waste_in_cost"
              :disabled="saving"
              :label="t('Include Waste in Cost')"
              color="primary"
            />
          </fieldset>
        </section>
        <section
          id="stock-setting-2"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="refresh"
              :size="21"
            /></span><h2>{{ t('Auto Actions') }}</h2><span class="settings-section__index">03</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.auto_deduct_on_sale"
              :disabled="saving"
              :label="t('Auto Deduct on Sale')"
              color="primary"
              class="mb-2"
            /><FormSelect
              v-model="form.deduct_on_order_status"
              :disabled="saving"
              :items="orderStatuses"
              :label="t('Deduct on Order Status')"
              density="compact"
              class="mb-2"
            /><FormSwitch
              v-model="form.reserve_on_order_create"
              :disabled="saving"
              :label="t('Reserve on Order Create')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.auto_create_production"
              :disabled="saving"
              :label="t('Auto Create Production')"
              color="primary"
            />
          </fieldset>
        </section>
        <section
          id="stock-setting-3"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="grid"
              :size="21"
            /></span><h2>{{ t('Modules') }}</h2><span class="settings-section__index">04</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.production_enabled"
              :disabled="saving"
              :label="t('Production Enabled')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.purchasing_enabled"
              :disabled="saving"
              :label="t('Purchasing Enabled')"
              color="primary"
            />
          </fieldset>
        </section>
        <section
          id="stock-setting-4"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="bell"
              :size="21"
            /></span><h2>{{ t('Alerts') }}</h2><span class="settings-section__index">05</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.low_stock_alert_enabled"
              :disabled="saving"
              :label="t('Low Stock Alert')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.expiry_alert_enabled"
              :disabled="saving"
              :label="t('Expiry Alert')"
              color="primary"
              class="mb-2"
            /><FormInput
              v-model.number="form.expiry_alert_days"
              :disabled="saving"
              :label="t('Expiry Alert Days')"
              type="number"
              :min="1"
              density="compact"
              class="mb-2"
            /><FormSwitch
              v-model="form.negative_stock_alert"
              :disabled="saving"
              :label="t('Negative Stock Alert')"
              color="primary"
            />
          </fieldset>
        </section>
        <section
          id="stock-setting-5"
          class="settings-section"
          :aria-busy="loading"
        >
          <div class="settings-section__heading">
            <span class="settings-section__icon"><DesignIcon
              name="shield"
              :size="21"
            /></span><h2>{{ t('Approvals') }}</h2><span class="settings-section__index">06</span>
          </div><div
            v-if="loading"
            class="settings-section__skeleton"
            role="status"
            :aria-label="t('Loading...')"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="sk-box"
            />
          </div><fieldset
            v-else
            :disabled="saving"
            class="settings-section__fields"
          >
            <FormSwitch
              v-model="form.require_po_approval"
              :disabled="saving"
              :label="t('Require PO Approval')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.require_transfer_approval"
              :disabled="saving"
              :label="t('Require Transfer Approval')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.require_adjustment_approval"
              :disabled="saving"
              :label="t('Require Adjustment Approval')"
              color="primary"
              class="mb-2"
            /><FormSwitch
              v-model="form.require_count_approval"
              :disabled="saving"
              :label="t('Require Count Approval')"
              color="primary"
            />
          </fieldset>
        </section>
        <div class="settings-savebar">
          <span><DesignIcon
            :name="dirty ? 'edit' : 'checkcircle'"
            :size="17"
          />{{ t(dirty ? 'workspace_unsaved_changes' : 'workspace_settings_up_to_date') }}</span><Button
            icon="save"
            variant="primary"
            :loading="saving"
            :disabled="!dirty"
            @click="saveSettings"
          >
            {{ t('Save Settings') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
name: stock-settings
meta:
  action: manage
  subject: all
</route>
