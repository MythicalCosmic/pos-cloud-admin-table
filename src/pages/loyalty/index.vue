<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import DataTable from '@/components/design/DataTable.vue'
import Kpi from '@/components/design/Kpi.vue'
import StateFill from '@/components/design/StateFill.vue'
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormInput from '@/components/design/FormInput.vue'
import { notificationsApi as axios } from '@/plugins/axios'

const { t } = useI18n({ useScope: 'global' })
const { formatDate } = useFormatters()
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// Settings
const settingsOpen = ref(false)
const settingsDraft = ref<any>(null)
const settings = ref<any>(null)
function openSettings() {
  settingsDraft.value = settings.value ? { ...settings.value } : null
  settingsOpen.value = true
}
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsError = ref(false)

// Accounts (top 100 by balance)
const accounts = ref<any[]>([])
const accountsLoading = ref(false)
const accountsError = ref(false)

// Search + filters (client-side over the loaded top list)
const search = ref('')
const onlyRedeemable = ref(false)

// Direct phone lookup (server) — lets a cashier serve any customer,
// not just the top-100 by balance.
const lookupResult = ref<any>(null)
const lookupLoading = ref(false)
const lookupError = ref('')

// Redeem dialog
const redeemDialog = ref(false)
const redeemPhone = ref('')
const redeeming = ref(false)

async function loadSettings() {
  settingsError.value = false
  settingsLoading.value = true
  try {
    const res = await axios.get('/loyalty/settings/')

    settings.value = res.data?.data ?? res.data
    if (settingsOpen.value)
      settingsDraft.value = { ...settings.value }
  }
  catch {
    settingsError.value = true
    notify(t('Failed to load settings'), 'error')
  }
  finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  if (settingsSaving.value || !settingsDraft.value)
    return

  // Backend rejects zero / negative thresholds (422) — guard client-side
  // so the operator gets an inline hint instead of a raw error.
  const perOrder = Number(settingsDraft.value?.stamps_per_completed_order)
  const perReward = Number(settingsDraft.value?.stamps_per_reward)
  if (!Number.isInteger(perOrder) || perOrder <= 0 || !Number.isInteger(perReward) || perReward <= 0) {
    notify(t('Stamps values must be positive whole numbers'), 'error')

    return
  }

  settingsSaving.value = true
  try {
    await axios.put('/loyalty/settings/', settingsDraft.value)
    notify(t('Settings saved'))
    await loadSettings()
    settingsOpen.value = false
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    settingsSaving.value = false
  }
}

async function loadAccounts() {
  accountsLoading.value = true
  accountsError.value = false
  try {
    const res = await axios.get('/loyalty/accounts/')
    const d = res.data?.data ?? res.data

    accounts.value = Array.isArray(d) ? d : (d?.accounts ?? d?.items ?? [])
  }
  catch {
    accountsError.value = true
    notify(t('Failed to load accounts'), 'error')
  }
  finally {
    accountsLoading.value = false
  }
}

async function lookupPhone(phone: string) {
  const p = (phone ?? '').trim()
  if (!p)
    return
  lookupLoading.value = true
  lookupError.value = ''
  lookupResult.value = null
  try {
    const res = await axios.get(`/loyalty/accounts/${encodeURIComponent(p)}/`)

    lookupResult.value = res.data?.data ?? res.data
  }
  catch (e: any) {
    if (e?.response?.status === 404)
      lookupError.value = t('No loyalty account for that phone')
    else
      lookupError.value = e?.response?.data?.message ?? t('Lookup failed')
  }
  finally {
    lookupLoading.value = false
  }
}

function doLookup() {
  lookupPhone(search.value)
}

function clearLookup() {
  lookupResult.value = null
  lookupError.value = ''
}

// Reset any prior server lookup when the query changes.
watch(search, () => {
  if (lookupResult.value || lookupError.value)
    clearLookup()
})

function openRedeem(account: any) {
  redeemPhone.value = account.phone_number
  redeemDialog.value = true
}

async function doRedeem() {
  if (redeeming.value)
    return
  redeeming.value = true
  try {
    await axios.post(`/loyalty/accounts/${encodeURIComponent(redeemPhone.value)}/redeem/`)
    notify(t('Reward redeemed'))
    redeemDialog.value = false
    await loadAccounts()

    // Keep an open lookup card in sync with the new balance.
    if (lookupResult.value?.phone_number)
      await lookupPhone(lookupResult.value.phone_number)
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Redeem failed'), 'error')
  }
  finally {
    redeeming.value = false
  }
}

onMounted(() => { loadSettings(); loadAccounts() })

const headers = computed(() => [
  { label: t('Phone'), key: 'phone_number', sortable: false },
  { label: t('Balance'), key: 'stamps_balance', sortable: true },
  { label: t('Earned (total)'), key: 'stamps_earned_total', sortable: true },
  { label: t('Redeemed (total)'), key: 'stamps_redeemed_total', sortable: true },
  { label: t('Last activity'), key: 'updated_at', sortable: true },
  { label: t('Actions'), key: 'actions', sortable: false, align: 'right' as const },
])

const stampsForReward = computed(() => settings.value?.stamps_per_reward ?? 10)
function canRedeem(a: any) {
  return !!settings.value?.is_enabled && Number(a?.stamps_balance) >= stampsForReward.value
}
function progressPct(a: any) {
  const bal = Number(a?.stamps_balance) || 0
  const thr = stampsForReward.value || 1

  return Math.max(0, Math.min(100, Math.round((bal / thr) * 100)))
}
function stampsToGo(a: any) {
  return Math.max(0, stampsForReward.value - (Number(a?.stamps_balance) || 0))
}

// Client-side search + filter over the loaded top list.
const digitsQuery = computed(() => (search.value ?? '').replace(/\D/g, ''))

const filteredAccounts = computed(() => {
  let list = accounts.value
  if (onlyRedeemable.value)
    list = list.filter(canRedeem)
  const q = digitsQuery.value
  if (q)
    list = list.filter(a => String(a.phone_number ?? '').replace(/\D/g, '').includes(q))

  return list
})

// Offer a server lookup when the typed phone matches nothing in the top list.
const showLookupPrompt = computed(() =>
  digitsQuery.value.length >= 4 && filteredAccounts.value.length === 0 && !lookupResult.value && !lookupError.value)

// KPI summary over the loaded top customers.
const kpiMembers = computed(() => accounts.value.length)
const kpiRedeemable = computed(() => accounts.value.filter(canRedeem).length)
const kpiOutstanding = computed(() => accounts.value.reduce((s, a) => s + (Number(a?.stamps_balance) || 0), 0))
const kpiRedeemed = computed(() => accounts.value.reduce((s, a) => s + (Number(a?.stamps_redeemed_total) || 0), 0))
const kpisLoading = computed(() => accountsLoading.value && accounts.value.length === 0)

const rewardLabel = computed(() => (settings.value?.reward_description || '').trim() || t('a reward'))
</script>

<template>
  <div class="page customers-workspace">
    <PageHeader
      :title="t('Loyalty')"
      :subtitle="t('Stamps program and top customers')"
    >
      <template #actions>
        <Button
          icon="sliders"
          variant="secondary"
          @click="openSettings"
        >
          {{ t('Loyalty Settings') }}
        </Button>
      </template>
    </PageHeader>

    <div class="lty-kpis mb-6">
      <Kpi :data="{ label: t('Members'), value: kpisLoading || accountsError ? null : kpiMembers, icon: 'users', sub: t('Top 100 by stamp balance') }" />
      <Kpi :data="{ label: t('Redeemable now'), value: kpisLoading || accountsError ? null : kpiRedeemable, icon: 'gift' }" />
      <Kpi :data="{ label: t('Stamps outstanding'), value: kpisLoading || accountsError ? null : kpiOutstanding, icon: 'tag' }" />
      <Kpi :data="{ label: t('Redeemed stamps'), value: kpisLoading || accountsError ? null : kpiRedeemed, icon: 'checkcircle' }" />
    </div>
    <div
      v-if="settings && !settingsError"
      class="customers-program"
    >
      <span class="customers-program__icon"><DesignIcon
        name="gift"
        :size="20"
      /></span>
      <div><strong>{{ rewardLabel }}</strong><p>{{ t('Stamps needed for one reward') }}: {{ stampsForReward }} · {{ t('Stamps per completed order') }}: {{ settings.stamps_per_completed_order }}</p></div>
      <span
        class="customers-program__status"
        :class="{ 'is-disabled': !settings.is_enabled }"
      >{{ t(settings.is_enabled ? 'Enabled' : 'Disabled') }}</span>
    </div>
    <VRow class="loyalty-layout">
      <VCol
        cols="12"
        md="12"
      >
        <VCard>
          <VCardText class="d-flex flex-wrap align-center gap-3">
            <div
              class="d-flex flex-column"
              style="min-width:0;"
            >
              <span class="text-h6">{{ t('Top Customers') }}</span>
              <span class="text-caption text-disabled">{{ t('Top 100 by stamp balance') }}</span>
            </div>
            <VSpacer />
            <FormInput
              v-model="search"
              :placeholder="t('Search or look up by phone')"
              prepend-inner-icon="bx-search"
              density="compact"
              hide-details
              clearable
              style="max-width:260px;"
              @keyup.enter="doLookup"
            />
            <VBtn
              variant="tonal"
              prepend-icon="bx-refresh"
              :loading="accountsLoading"
              @click="loadAccounts"
            >
              {{ t('Refresh') }}
            </VBtn>
          </VCardText>

          <div class="d-flex align-center px-4 pb-2">
            <FormSwitch
              v-model="onlyRedeemable"
              color="success"
              :label="t('Only redeemable')"
              density="compact"
              hide-details
              inset
            />
          </div>

          <!-- Direct phone lookup result / prompt -->
          <div
            v-if="showLookupPrompt || lookupLoading || lookupResult || lookupError"
            class="px-4 pb-3"
          >
            <VBtn
              v-if="showLookupPrompt"
              variant="tonal"
              color="primary"
              prepend-icon="bx-search-alt"
              :loading="lookupLoading"
              block
              @click="doLookup"
            >
              {{ t('Look up "{phone}" directly', { phone: search }) }}
            </VBtn>

            <VAlert
              v-else-if="lookupError"
              type="warning"
              variant="tonal"
              closable
              @click:close="clearLookup"
            >
              {{ lookupError }}
            </VAlert>

            <VCard
              v-else-if="lookupResult"
              variant="tonal"
              :color="canRedeem(lookupResult) ? 'success' : 'primary'"
            >
              <VCardText class="d-flex flex-wrap align-center gap-4">
                <div style="min-width:0;">
                  <div class="text-caption text-disabled">
                    {{ t('Found via lookup') }}
                  </div>
                  <div class="text-h6 num-tabular">
                    {{ lookupResult.phone_number }}
                  </div>
                  <div class="text-body-2 num-tabular">
                    {{ lookupResult.stamps_balance }} / {{ stampsForReward }} {{ t('stamps') }}
                    <span
                      v-if="!canRedeem(lookupResult)"
                      class="text-disabled"
                    >
                      · {{ t('{n} to go', { n: stampsToGo(lookupResult) }) }}
                    </span>
                  </div>
                </div>
                <VSpacer />
                <VBtn
                  color="success"
                  :disabled="!canRedeem(lookupResult)"
                  prepend-icon="bx-gift"
                  @click="openRedeem(lookupResult)"
                >
                  {{ t('Redeem') }}
                </VBtn>
                <VBtn
                  icon
                  variant="text"
                  size="small"
                  @click="clearLookup"
                >
                  <VIcon
                    icon="bx-x"
                    size="20"
                  />
                  <VTooltip
                    activator="parent"
                    location="top"
                  >
                    {{ t('Close') }}
                  </VTooltip>
                </VBtn>
              </VCardText>
            </VCard>
          </div>

          <!-- Error + retry -->
          <div
            v-if="accountsError && accounts.length === 0"
            class="d-flex flex-column align-center justify-center text-center pa-10"
          >
            <VIcon
              icon="bx-error-circle"
              size="40"
              class="text-disabled mb-3"
            />
            <div class="text-body-1 mb-1">
              {{ t('Could not load customers') }}
            </div>
            <VBtn
              variant="tonal"
              prepend-icon="bx-refresh"
              class="mt-3"
              @click="loadAccounts"
            >
              {{ t('Retry') }}
            </VBtn>
          </div>

          <DataTable
            v-else
            :columns="headers"
            :rows="filteredAccounts"
            :loading="accountsLoading"
            row-key="phone_number"
            :per-page="20"
            mobile-cards
            :per-page-options="[20, 50, 100]"
            :empty-title="digitsQuery || onlyRedeemable ? t('No customers match your search') : t('No customers yet')"
            :empty-sub="digitsQuery || onlyRedeemable ? t('Try a different phone or clear the filters.') : t('Customers appear here once they earn their first stamp.')"
          >
            <template #cell.phone_number="{ row }">
              <span class="font-weight-medium num-tabular">{{ row.phone_number }}</span>
            </template>
            <template #cell.stamps_balance="{ row }">
              <div style="min-width:0;">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-caption num-tabular">{{ row.stamps_balance }} / {{ stampsForReward }}</span>
                  <VIcon
                    v-if="canRedeem(row)"
                    icon="bx-check-circle"
                    size="14"
                    color="success"
                  />
                </div>
                <VProgressLinear
                  :model-value="progressPct(row)"
                  :color="canRedeem(row) ? 'success' : 'primary'"
                  height="6"
                  rounded
                  bg-opacity="0.12"
                />
              </div>
            </template>
            <template #cell.stamps_earned_total="{ row }">
              <span class="num-tabular">{{ row.stamps_earned_total }}</span>
            </template>
            <template #cell.stamps_redeemed_total="{ row }">
              <span class="num-tabular">{{ row.stamps_redeemed_total }}</span>
            </template>
            <template #cell.updated_at="{ row }">
              <span class="text-body-2 text-disabled">{{ formatDate(row.updated_at) }}</span>
            </template>
            <template #cell.actions="{ row }">
              <VBtn
                size="small"
                variant="tonal"
                color="success"
                prepend-icon="bx-gift"
                :disabled="!canRedeem(row)"
                @click="openRedeem(row)"
              >
                {{ t('Redeem') }}
              </VBtn>
            </template>
          </DataTable>
        </VCard>
      </VCol>
    </VRow>

    <Modal
      v-model:open="settingsOpen"
      :title="t('Loyalty Settings')"
      :width="520"
      :busy="settingsSaving"
    >
      <VCard class="loyalty-settings">
        <VCardText>
          <StateFill
            v-if="settingsError"
            error
            :title="t('Failed to load settings')"
          >
            <template #action>
              <Button
                variant="secondary"
                @click="loadSettings"
              >
                {{ t('Retry') }}
              </Button>
            </template>
          </StateFill>
          <template v-else-if="settingsLoading || !settings">
            <div
              v-for="n in 4"
              :key="n"
              class="mb-3"
            >
              <div
                class="sk-box mb-1"
                style="width:120px;height:14px;border-radius:4px;"
              />
              <div
                class="sk-box"
                style="width:100%;height:48px;border-radius:6px;"
              />
            </div>
          </template>
          <template v-else-if="settingsDraft">
            <VAlert
              :type="settingsDraft.is_enabled ? 'success' : 'warning'"
              variant="tonal"
              class="mb-4"
            >
              {{ settingsDraft.is_enabled
                ? t('Loyalty program is active. Customers earn stamps on every completed paid order.')
                : t('Loyalty program is disabled. Stamps are not being awarded.') }}
            </VAlert>

            <FormSwitch
              v-model="settingsDraft.is_enabled"
              :disabled="settingsSaving"
              color="primary"
              :label="t('Enabled')"
              hide-details
              inset
              class="mb-4"
            />

            <FormInput
              v-model.number="settingsDraft.stamps_per_completed_order"
              :disabled="settingsSaving"
              :label="t('Stamps per completed order')"
              type="number"
              min="1"
              :hint="t('Awarded automatically when an order moves to COMPLETED + paid')"
              persistent-hint
              class="mb-4"
            />

            <FormInput
              v-model.number="settingsDraft.stamps_per_reward"
              :disabled="settingsSaving"
              :label="t('Stamps needed for one reward')"
              type="number"
              min="1"
              :hint="t('Cashier can redeem a reward once this threshold is reached')"
              persistent-hint
              class="mb-4"
            />

            <FormInput
              v-model="settingsDraft.reward_description"
              :disabled="settingsSaving"
              :label="t('Reward description')"
              :hint="t('Shown to customers in the Telegram bot, e.g. \'Free coffee\'')"
              persistent-hint
            />
          </template>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn
            color="primary"
            :loading="settingsSaving"
            :disabled="!settings || settingsError"
            prepend-icon="bx-save"
            @click="saveSettings"
          >
            {{ t('Save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </Modal>

    <Modal
      :open="redeemDialog"
      :title="t('Redeem Reward')"
      :width="480"
      :busy="redeeming"
      @close="redeemDialog = false"
    >
      <p class="mb-2">
        {{ t('Redeem {reward} for {phone}?', { reward: rewardLabel, phone: redeemPhone }) }}
      </p><p class="text-caption text-disabled">
        {{ t("This will subtract {n} stamps from the customer's balance.", { n: stampsForReward }) }}
      </p><template #footer>
        <Button
          variant="primary"
          :loading="redeeming"
          @click="doRedeem"
        >
          {{ t('Redeem') }}
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
  </div>
</template>

<style scoped>
.customers-program { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); margin-bottom: 18px; }
.customers-program__icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; color: var(--primary); background: var(--primary-weak); flex-shrink: 0; }
.customers-program > div { flex: 1; min-width: 0; }
.customers-program strong { font-size: 14px; }
.customers-program p { margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.customers-program__status { padding: 5px 9px; border-radius: 6px; color: var(--success-strong); background: var(--success-weak); font-size: 11px; }
.customers-program__status.is-disabled { color: var(--text-secondary); background: var(--surface-inset); }
.loyalty-settings { box-shadow: none !important; background: transparent !important; }
@media (max-width: 700px) { .customers-program { flex-wrap: wrap; } .customers-workspace :deep(.lty-kpis) { gap: 10px; } }

.loyalty-layout :deep(.v-card) { border: 1px solid var(--border); box-shadow: none; border-radius: 16px; }
.loyalty-layout :deep(.v-card-title) { font-size: 18px; }
.loyalty-layout :deep(.v-card-item) { padding: 24px 24px 12px; }
.loyalty-settings :deep(.v-alert) { background: var(--surface-2) !important; color: var(--text-secondary) !important; font-size: 13px; }
.loyalty-settings :deep(.v-alert__prepend) { display: none; }

.lty-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.lty-kpi {
  padding: 18px 20px;
}

.lty-kpi__label {
  font-size: var(--fs-sm, 0.8125rem);
  color: rgb(var(--v-theme-text-secondary));
  font-weight: var(--fw-medium, 500);
  margin-block-end: 6px;
}

.lty-kpi__value {
  font-size: 1.75rem;
  line-height: 1.1;
  font-weight: var(--fw-bold, 700);
  color: rgb(var(--v-theme-on-surface));
  min-height: 30px;
  display: flex;
  align-items: center;
}

.lty-kpi__value--accent {
  color: rgb(var(--v-theme-success));
}

@media (max-width: 960px) {
  .lty-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .lty-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .lty-kpi { min-width: 0; padding: 12px 14px; }
  .lty-kpi__label { font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
  .lty-kpi__value { font-size: 25px; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
