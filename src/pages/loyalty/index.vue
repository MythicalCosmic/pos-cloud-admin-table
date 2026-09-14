<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import DataTable from '@/components/design/DataTable.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import StateFill from '@/components/design/StateFill.vue'
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormInput from '@/components/design/FormInput.vue'
import Switch from '@/components/design/Switch.vue'
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
  <WorkspacePage class="page customers-workspace">
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
    <Card class-name="loyalty-register workspace-register">
      <div class="card__head loyalty-register__head">
        <div>
          <h2 class="card__title">
            {{ t('Top Customers') }}
          </h2>
          <p class="card__sub">
            {{ t('Top 100 by stamp balance') }}
          </p>
        </div>
        <Button
          variant="secondary"
          icon="refresh"
          :loading="accountsLoading"
          @click="loadAccounts"
        >
          {{ t('Refresh') }}
        </Button>
      </div>

      <WorkspaceToolbar class="toolbar loyalty-tools">
        <Input
          v-model="search"
          class="grow"
          icon="search"
          inputmode="tel"
          :placeholder="t('Search or look up by phone')"
          @keyup.enter="doLookup"
        />
        <label class="loyalty-toggle">
          <span>{{ t('Only redeemable') }}</span>
          <Switch v-model="onlyRedeemable" />
        </label>
      </WorkspaceToolbar>

      <div
        v-if="showLookupPrompt || lookupLoading || lookupResult || lookupError"
        class="loyalty-lookup"
      >
        <Button
          v-if="showLookupPrompt"
          variant="secondary"
          icon="search"
          :loading="lookupLoading"
          @click="doLookup"
        >
          {{ t('Look up "{phone}" directly', { phone: search }) }}
        </Button>

        <div
          v-else-if="lookupError"
          class="loyalty-lookup__notice"
          role="alert"
        >
          <DesignIcon
            name="warning"
            :size="18"
          />
          <span>{{ lookupError }}</span>
          <IconAction
            icon="close"
            :title="t('Close')"
            @click="clearLookup"
          />
        </div>

        <article
          v-else-if="lookupResult"
          class="loyalty-lookup__result"
          :class="{ 'is-redeemable': canRedeem(lookupResult) }"
        >
          <div class="loyalty-lookup__symbol">
            <DesignIcon
              :name="canRedeem(lookupResult) ? 'gift' : 'users'"
              :size="21"
            />
          </div>
          <div class="loyalty-lookup__copy">
            <span>{{ t('Found via lookup') }}</span>
            <strong class="num-tabular">{{ lookupResult.phone_number }}</strong>
            <p class="num-tabular">
              {{ lookupResult.stamps_balance }} / {{ stampsForReward }} {{ t('stamps') }}
              <span v-if="!canRedeem(lookupResult)">· {{ t('{n} to go', { n: stampsToGo(lookupResult) }) }}</span>
            </p>
          </div>
          <Button
            variant="primary"
            icon="gift"
            :disabled="!canRedeem(lookupResult)"
            @click="openRedeem(lookupResult)"
          >
            {{ t('Redeem') }}
          </Button>
          <IconAction
            icon="close"
            :title="t('Close')"
            @click="clearLookup"
          />
        </article>
      </div>

      <StateFill
        v-if="accountsError && accounts.length === 0"
        error
        :title="t('Could not load customers')"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="refresh"
            @click="loadAccounts"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

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
          <span class="cell-strong num-tabular">{{ row.phone_number }}</span>
        </template>
        <template #cell.stamps_balance="{ row }">
          <div class="loyalty-balance">
            <div class="loyalty-balance__label">
              <span class="num-tabular">{{ row.stamps_balance }} / {{ stampsForReward }}</span>
              <DesignIcon
                v-if="canRedeem(row)"
                name="checkcircle"
                :size="15"
              />
            </div>
            <div
              class="loyalty-progress"
              role="progressbar"
              :aria-valuenow="progressPct(row)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span
                :class="{ 'is-complete': canRedeem(row) }"
                :style="{ width: `${progressPct(row)}%` }"
              />
            </div>
          </div>
        </template>
        <template #cell.stamps_earned_total="{ row }">
          <span class="num-tabular">{{ row.stamps_earned_total }}</span>
        </template>
        <template #cell.stamps_redeemed_total="{ row }">
          <span class="num-tabular">{{ row.stamps_redeemed_total }}</span>
        </template>
        <template #cell.updated_at="{ row }">
          <span class="cell-muted">{{ formatDate(row.updated_at) }}</span>
        </template>
        <template #cell.actions="{ row }">
          <Button
            size="sm"
            variant="secondary"
            icon="gift"
            :disabled="!canRedeem(row)"
            @click="openRedeem(row)"
          >
            {{ t('Redeem') }}
          </Button>
        </template>
      </DataTable>
    </Card>

    <Modal
      v-model:open="settingsOpen"
      :title="t('Loyalty Settings')"
      :width="520"
      :busy="settingsSaving"
    >
      <StateFill
        v-if="settingsError"
        error
        :title="t('Failed to load settings')"
      >
        <template #action>
          <Button
            variant="secondary"
            icon="refresh"
            @click="loadSettings"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>
      <div
        v-else-if="settingsLoading || !settings"
        class="loyalty-settings-skeleton"
        role="status"
        :aria-label="t('Loading')"
      >
        <div
          v-for="n in 4"
          :key="n"
        >
          <div class="sk-box loyalty-settings-skeleton__label" />
          <div class="sk-box loyalty-settings-skeleton__control" />
        </div>
      </div>
      <form
        v-else-if="settingsDraft"
        id="loyalty-settings-form"
        class="loyalty-settings"
        @submit.prevent="saveSettings"
      >
        <div
          class="loyalty-settings__status"
          :class="{ 'is-enabled': settingsDraft.is_enabled }"
        >
          <DesignIcon
            :name="settingsDraft.is_enabled ? 'checkcircle' : 'pause'"
            :size="20"
          />
          <span>{{ settingsDraft.is_enabled
            ? t('Loyalty program is active. Customers earn stamps on every completed paid order.')
            : t('Loyalty program is disabled. Stamps are not being awarded.') }}</span>
        </div>

        <FormSwitch
          v-model="settingsDraft.is_enabled"
          :disabled="settingsSaving"
          color="primary"
          :label="t('Enabled')"
          hide-details
          inset
        />

        <FormInput
          v-model.number="settingsDraft.stamps_per_completed_order"
          :disabled="settingsSaving"
          :label="t('Stamps per completed order')"
          type="number"
          min="1"
          :hint="t('Awarded automatically when an order moves to COMPLETED + paid')"
          persistent-hint
        />

        <FormInput
          v-model.number="settingsDraft.stamps_per_reward"
          :disabled="settingsSaving"
          :label="t('Stamps needed for one reward')"
          type="number"
          min="1"
          :hint="t('Cashier can redeem a reward once this threshold is reached')"
          persistent-hint
        />

        <FormInput
          v-model="settingsDraft.reward_description"
          :disabled="settingsSaving"
          :label="t('Reward description')"
          :hint="t('Shown to customers in the Telegram bot, e.g. \'Free coffee\'')"
          persistent-hint
        />
      </form>

      <template #footer>
        <Button
          type="submit"
          form="loyalty-settings-form"
          variant="primary"
          icon="save"
          :loading="settingsSaving"
          :disabled="!settings || !!settingsError"
        >
          {{ t('Save') }}
        </Button>
      </template>
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
  </WorkspacePage>
</template>

<style scoped>
.customers-program { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border: 1px solid var(--primary-border); border-radius: 14px; background: var(--work-soft); margin-bottom: 20px; }
.customers-program__icon { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid var(--primary-border); border-radius: 12px; color: var(--primary); background: var(--surface); flex-shrink: 0; box-shadow: var(--shadow-xs); }
.customers-program > div { flex: 1; min-width: 0; }
.customers-program strong { font-size: 15px; font-weight: 650; }
.customers-program p { margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.customers-program__status { padding: 5px 9px; border-radius: 6px; color: var(--success-strong); background: var(--success-weak); font-size: 11px; }
.customers-program__status.is-disabled { color: var(--text-secondary); background: var(--surface-inset); }

.loyalty-register__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.loyalty-register__head > div { min-inline-size: 0; }
.loyalty-register__head .card__sub { margin-block-start: 4px; }
.loyalty-tools :deep(.workspace-tools__fields) { flex-wrap: nowrap; }
.loyalty-tools :deep(.grow) { min-inline-size: 240px; }
.loyalty-toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-block-size: 46px; min-inline-size: 190px; padding-inline: 14px 7px; border: 1px solid var(--work-line); border-radius: var(--work-control); background: var(--surface); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; }

.loyalty-lookup { padding: 16px 20px; border-block-end: 1px solid var(--work-line); background: color-mix(in srgb, var(--surface) 96%, var(--primary)); }
.loyalty-lookup > .btn { inline-size: 100%; }
.loyalty-lookup__notice { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; min-block-size: 54px; padding: 8px 9px 8px 14px; border: 1px solid var(--warning-border); border-radius: 13px; background: var(--warning-weak); color: var(--warning-strong); font-size: 13px; }
.loyalty-lookup__result { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 15px; border: 1px solid var(--primary-border); border-radius: 15px; background: var(--surface); }
.loyalty-lookup__result.is-redeemable { border-color: var(--success-border); }
.loyalty-lookup__symbol { display: grid; place-items: center; inline-size: 44px; block-size: 44px; border-radius: 13px; background: var(--primary-weak); color: var(--primary); }
.loyalty-lookup__result.is-redeemable .loyalty-lookup__symbol { background: var(--success-weak); color: var(--success-strong); }
.loyalty-lookup__copy { min-inline-size: 0; }
.loyalty-lookup__copy > span { display: block; color: var(--text-secondary); font-size: 11px; }
.loyalty-lookup__copy strong { display: block; margin-block-start: 2px; font-size: 17px; overflow-wrap: anywhere; }
.loyalty-lookup__copy p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; }
.loyalty-lookup__copy p span { color: var(--text-tertiary); }

.loyalty-balance { inline-size: 100%; min-inline-size: 0; }
.loyalty-balance__label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-end: 7px; color: var(--text-secondary); font-size: 11px; }
.loyalty-balance__label :deep(.ic) { color: var(--success-strong); }
.loyalty-progress { overflow: hidden; block-size: 6px; border-radius: 99px; background: var(--work-soft-strong); }
.loyalty-progress > span { display: block; block-size: 100%; border-radius: inherit; background: var(--primary); transition: width 220ms var(--work-ease); }
.loyalty-progress > span.is-complete { background: var(--success); }

.loyalty-settings { display: grid; gap: 19px; }
.loyalty-settings__status { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; padding: 15px 16px; border: 1px solid var(--warning-border); border-radius: 14px; background: var(--warning-weak); color: var(--text); font-size: 13px; line-height: 1.55; }
.loyalty-settings__status :deep(.ic) { margin-block-start: 1px; color: var(--warning-strong); }
.loyalty-settings__status.is-enabled { border-color: var(--success-border); background: var(--success-weak); }
.loyalty-settings__status.is-enabled :deep(.ic) { color: var(--success-strong); }
.loyalty-settings-skeleton { display: grid; gap: 18px; }
.loyalty-settings-skeleton > div { display: grid; gap: 7px; }
.loyalty-settings-skeleton__label { inline-size: 120px; block-size: 12px; border-radius: 4px; }
.loyalty-settings-skeleton__control { inline-size: 100%; block-size: 48px; border-radius: 12px; }

.lty-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 960px) {
  .lty-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .lty-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .customers-program { align-items: flex-start; flex-wrap: wrap; }
  .customers-program__status { margin-inline-start: 56px; }
  .loyalty-register__head { align-items: flex-start; }
  .loyalty-register__head .btn { inline-size: 44px; padding-inline: 0; }
  .loyalty-register__head .btn :deep(.btn__label) { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .loyalty-tools :deep(.workspace-tools__fields) { flex-wrap: wrap; }
  .loyalty-tools :deep(.grow), .loyalty-toggle { inline-size: 100%; min-inline-size: 0; }
  .loyalty-lookup { padding: 12px; }
  .loyalty-lookup__result { grid-template-columns: auto minmax(0, 1fr) auto; }
  .loyalty-lookup__result > .btn { grid-column: 1 / -1; inline-size: 100%; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
