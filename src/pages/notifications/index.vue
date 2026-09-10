<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSwitch from '@/components/design/FormSwitch.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import FormInput from '@/components/design/FormInput.vue'
import { notificationsApi as axios } from '@/plugins/axios'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Segmented from '@/components/design/Segmented.vue'
import StateFill from '@/components/design/StateFill.vue'

const { t, te } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatDate } = useFormatters()

const tab = ref('settings')

const tabs = computed(() => [
  { value: 'settings', label: t('Settings'), icon: 'gear' },
  { value: 'templates', label: t('Templates'), icon: 'file' },
  { value: 'logs', label: t('Logs'), icon: 'history' },
].map(item => ({ ...item, id: `notification-tab-${item.value}`, ariaControls: `notification-panel-${item.value}` })))

// Settings
const settings = ref<any>(null)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const status = ref<any>(null)
const settingsError = ref('')
const templateError = ref(false)
const logsError = ref(false)
const testSending = ref(false)
const queueProcessing = ref(false)
const toggling = ref(new Set<number>())

// Templates
const templates = ref<any[]>([])
const templatesLoading = ref(false)

// Logs
const logs = ref<any[]>([])
const logsTotal = ref(0)
const logsLoading = ref(false)
const logsPage = ref(1)
const logsPerPage = ref(20)

const logHeaders = computed(() => [
  { label: t('Date'), key: 'created_at', sortable: false },
  { label: t('Type'), key: 'notification_type', sortable: false },
  { label: t('Recipient'), key: 'recipient', sortable: false },
  { label: t('Status'), key: 'status', sortable: false },
  { label: t('Message'), key: 'message', sortable: false },
])

async function loadSettings() {
  settingsLoading.value = true
  settingsError.value = ''
  try {
    const [s, st] = await Promise.allSettled([
      axios.get('/settings/'),
      axios.get('/settings/status/'),
    ])

    if (s.status === 'fulfilled')
      settings.value = s.value.data?.data ?? s.value.data
    else
      settingsError.value = s.reason?.response?.data?.message || t('Failed to load settings')
    if (st.status === 'fulfilled')
      status.value = st.value.data?.data ?? st.value.data
  }
  finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  if (settingsSaving.value || !settings.value)
    return
  settingsSaving.value = true
  try {
    const payload: any = {
      brand_name: settings.value.brand_name,
      is_enabled: settings.value.is_enabled,
      timeout: settings.value.timeout,
      chat_ids: Array.isArray(settings.value.chat_ids) ? settings.value.chat_ids : [],
    }

    if (settings.value.bot_token)
      payload.bot_token = settings.value.bot_token
    await axios.put('/settings/', payload)
    notify(t('Settings saved'))
    loadSettings()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    settingsSaving.value = false
  }
}

async function testSettings() {
  if (testSending.value)
    return
  testSending.value = true
  try {
    await axios.post('/settings/test/')
    notify(t('Test notification sent'))
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { testSending.value = false }
}

async function loadTemplates() {
  templateError.value = false
  templatesLoading.value = true
  try {
    const res = await axios.get('/templates/')
    const d = res.data?.data ?? res.data

    templates.value = Array.isArray(d) ? d : (d?.templates ?? d?.items ?? [])
  }
  catch {
    templateError.value = true
    notify(t('Failed to load templates'), 'error')
  }
  finally {
    templatesLoading.value = false
  }
}

// -------- template editor + preview --------
const tplDialog = ref(false)
const tplEditing = ref<any>(null)
const tplForm = ref({ name: '', template_text: '', description: '', language: 'uz', is_enabled: true })
const tplSaving = ref(false)
const tplPreviewContext = ref('{}')
const tplPreviewResult = ref<string>('')
const tplPreviewLoading = ref(false)

const templateLanguageItems = computed(() => ['uz', 'ru', 'en'].map(value => ({
  value,
  title: t(`ntpl_lang_${value}`),
})))

function templateLanguageLabel(value: string): string {
  const key = `ntpl_lang_${value}`
  return te(key) ? t(key) : value
}

function openTemplateEditor(tpl: any) {
  tplEditing.value = tpl
  tplForm.value = {
    name: tpl.name ?? '',
    template_text: tpl.template_text ?? '',
    description: tpl.description ?? '',
    language: tpl.language ?? 'uz',
    is_enabled: tpl.is_enabled ?? true,
  }
  tplPreviewContext.value = '{}'
  tplPreviewResult.value = ''
  tplDialog.value = true
}

async function saveTemplate() {
  if (tplSaving.value)
    return
  if (!tplEditing.value)
    return
  tplSaving.value = true
  try {
    await axios.put(`/templates/${tplEditing.value.id}/`, tplForm.value)
    notify(t('Template saved'))
    tplDialog.value = false
    await loadTemplates()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    tplSaving.value = false
  }
}

async function previewTemplate() {
  if (tplPreviewLoading.value)
    return
  if (!tplEditing.value)
    return
  let ctx: any = {}
  try {
    ctx = JSON.parse(tplPreviewContext.value || '{}')
  }
  catch {
    notify(t('Context must be valid JSON'), 'error')

    return
  }
  tplPreviewLoading.value = true
  try {
    const res = await axios.post(`/templates/${tplEditing.value.id}/preview/`, {
      context: ctx,
      template_text: tplForm.value.template_text,
    })

    const d = res.data?.data ?? res.data

    tplPreviewResult.value = d?.rendered ?? d?.text ?? d?.result ?? JSON.stringify(d)
  }
  catch (e: any) {
    tplPreviewResult.value = ''
    notify(e?.response?.data?.message ?? t('Preview failed'), 'error')
  }
  finally {
    tplPreviewLoading.value = false
  }
}

async function toggleTemplate(tpl: any) {
  if (toggling.value.has(tpl.id))
    return
  toggling.value.add(tpl.id)
  try {
    await axios.put(`/types/${tpl.notification_type}/`, { is_enabled: !tpl.is_enabled })
    notify(t('Updated'))
    await loadTemplates()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { toggling.value.delete(tpl.id) }
}

async function loadLogs() {
  logsError.value = false
  logsLoading.value = true
  try {
    const res = await axios.get('/logs/', { params: { page: logsPage.value, per_page: logsPerPage.value } })
    const d = res.data?.data

    logs.value = Array.isArray(d) ? d : (d?.logs ?? d?.items ?? [])

    const pag = res.data?.pagination

    logsTotal.value = pag?.total_items ?? pag?.total ?? logs.value.length
  }
  catch {
    logsError.value = true
    notify(t('Failed to load logs'), 'error')
  }
  finally {
    logsLoading.value = false
  }
}

async function processQueue() {
  if (queueProcessing.value)
    return
  queueProcessing.value = true
  try {
    await axios.post('/queue/process/')
    notify(t('Queue processed'))
    await loadLogs()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { queueProcessing.value = false }
}

onMounted(loadSettings)
watch(tab, val => {
  if (val === 'templates' && templates.value.length === 0)
    loadTemplates()
  if (val === 'logs' && logs.value.length === 0)
    loadLogs()
})
watch([logsPage, logsPerPage], loadLogs)

const statusColor: Record<string, string> = {
  SENT: 'success',
  FAILED: 'error',
  PENDING: 'warning',
  QUEUED: 'info',
}
</script>

<template>
  <div class="page notifications-workspace">
    <PageHeader
      :title="t('Notifications')"
      :subtitle="t('Telegram settings, templates and delivery log')"
    />
    <Segmented
      v-model="tab"
      :options="tabs"
      :aria-label="t('Notifications')"
      class="notifications-workspace__tabs"
    />
    <section
      v-if="tab === 'settings'"
      id="notification-panel-settings"
      role="tabpanel"
      aria-labelledby="notification-tab-settings"
      class="settings-section"
    >
      <header class="settings-section__heading">
        <h2>{{ t('Settings') }}</h2><p>{{ t('notification_settings_hint') }}</p><span
          v-if="status"
          class="badge"
          :class="status.is_configured ? 't-success' : 't-neutral'"
        ><DesignIcon
          :name="status.is_configured ? 'checkcircle' : 'gear'"
          :size="14"
        />{{ status.is_configured ? t('Notifications are configured') : t('Notifications need configuration') }}</span>
      </header>
      <div class="settings-section__fields">
        <div
          v-if="settingsLoading && !settings"
          class="license-skeleton"
          role="status"
          :aria-label="t('Loading')"
        >
          <div
            v-for="n in 4"
            :key="n"
            class="sk-box"
            style="height: 44px; margin-bottom: 20px;"
          />
        </div>
        <StateFill
          v-else-if="settingsError"
          error
          :title="settingsError"
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
        <form
          v-else-if="settings"
          class="notification-form"
          @submit.prevent="saveSettings"
        >
          <FormInput
            v-model="settings.brand_name"
            :label="t('Brand Name')"
            :disabled="settingsSaving"
          />
          <FormInput
            v-model="settings.bot_token"
            :label="t('Bot Token')"
            type="password"
            autocomplete="new-password"
            :placeholder="settings.bot_configured ? t('(configured — enter to replace)') : ''"
            :disabled="settingsSaving"
          />
          <FormInput
            v-model.number="settings.timeout"
            :label="t('Timeout (sec)')"
            type="number"
            min="1"
            :disabled="settingsSaving"
          />
          <FormSelect
            v-model="settings.chat_ids"
            creatable
            multiple
            :label="t('Chat IDs')"
            :placeholder="t('Type a chat ID and press Enter')"
            :disabled="settingsSaving"
          />
          <FormSwitch
            v-model="settings.is_enabled"
            :label="t('Enabled')"
            :disabled="settingsSaving"
          />
          <div class="notification-form__actions">
            <Button
              type="submit"
              variant="primary"
              icon="save"
              :loading="settingsSaving"
            >
              {{ t('Save') }}
            </Button><Button
              variant="secondary"
              icon="send"
              :loading="testSending"
              :disabled="settingsSaving"
              @click="testSettings"
            >
              {{ t('Send Test') }}
            </Button>
          </div>
        </form>
      </div>
    </section>
    <section
      v-else-if="tab === 'templates'"
      id="notification-panel-templates"
      role="tabpanel"
      aria-labelledby="notification-tab-templates"
      class="card"
    >
      <div class="toolbar">
        <h2 class="notification-panel-title">
          {{ t('Templates') }}
        </h2><Button
          variant="secondary"
          icon="refresh"
          :loading="templatesLoading"
          @click="loadTemplates"
        >
          {{ t('Refresh') }}
        </Button>
      </div>
      <div
        v-if="templatesLoading && !templates.length"
        class="pa-6"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="sk-box mb-4"
          style="height: 64px;"
        />
      </div>
      <StateFill
        v-else-if="templateError"
        error
        :title="t('Failed to load templates')"
      >
        <template #action>
          <Button
            variant="secondary"
            @click="loadTemplates"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>
      <StateFill
        v-else-if="!templates.length"
        icon="file"
        :title="t('No templates yet')"
      />
      <div
        v-else
        class="notification-templates"
      >
        <article
          v-for="tpl in templates"
          :key="tpl.id"
        >
          <DesignIcon
            name="file"
            :size="22"
          /><div><h3>{{ tpl.name }}</h3><p>{{ te(`notif_type_${tpl.notification_type}`) ? t(`notif_type_${tpl.notification_type}`) : tpl.notification_type }} · {{ templateLanguageLabel(tpl.language) }}</p></div><Button
            variant="secondary"
            icon="edit"
            size="sm"
            @click="openTemplateEditor(tpl)"
          >
            {{ t('Edit') }}
          </Button><FormSwitch
            :model-value="tpl.is_enabled"
            :aria-label="`${t('Enabled')}: ${tpl.name}`"
            :disabled="toggling.has(tpl.id)"
            @update:model-value="toggleTemplate(tpl)"
          />
        </article>
      </div>
    </section>
    <section
      v-else
      id="notification-panel-logs"
      role="tabpanel"
      aria-labelledby="notification-tab-logs"
      class="card"
    >
      <div class="toolbar">
        <h2 class="notification-panel-title">
          {{ t('Logs') }}
        </h2><Button
          variant="secondary"
          icon="refresh"
          :loading="logsLoading"
          @click="loadLogs"
        >
          {{ t('Refresh') }}
        </Button><Button
          icon="play"
          :loading="queueProcessing"
          @click="processQueue"
        >
          {{ t('Process Queue') }}
        </Button>
      </div>
      <StateFill
        v-if="logsError"
        error
        :title="t('Failed to load logs')"
      >
        <template #action>
          <Button
            variant="secondary"
            @click="loadLogs"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>
      <DataTable
        v-else
        :columns="logHeaders"
        :rows="logs"
        :loading="logsLoading"
        :pagination="{ page: logsPage, perPage: logsPerPage, total: logsTotal }"
        @page="logsPage = $event"
        @per-page="logsPerPage = $event; logsPage = 1"
      >
        <template #cell.created_at="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
        <template #cell.status="{ row }">
          <span
            class="badge"
            :class="`t-${statusColor[row.status] || 'neutral'}`"
          >{{ te(`notif_log_status_${row.status}`) ? t(`notif_log_status_${row.status}`) : row.status }}</span>
        </template>
        <template #cell.message="{ row }">
          <span class="notification-log-message">{{ row.message ?? row.error ?? '—' }}</span>
        </template>
      </DataTable>
    </section>
    <!-- Template editor + preview -->
    <Modal
      :open="tplDialog"
      :title="t('Edit notification template')"
      :width="980"
      :busy="tplSaving"
      @close="tplDialog = false"
    >
      <div
        v-if="tplEditing"
        class="text-caption text-disabled mb-3"
      >
        {{ tplEditing.notification_type }} · {{ templateLanguageLabel(tplEditing.language) }}
      </div><VRow>
        <VCol
          cols="12"
          md="6"
        >
          <FormInput
            v-model="tplForm.name"
            :label="t('Name')"
            density="compact"
          />
          <FormInput
            v-model="tplForm.description"
            :label="t('Description')"
            density="compact"
            class="mt-2"
          />
          <FormInput
            v-model="tplForm.template_text"
            multiline
            :label="t('Body (supports {variable} placeholders)')"
            rows="10"
            class="mt-2"
            :hint="t('Use {first_name}, {order_id}, etc. Variables are namespaced — no dots / brackets allowed.')"
            persistent-hint
          />
          <VRow class="mt-2">
            <VCol cols="6">
              <FormSelect
                v-model="tplForm.language"
                :items="templateLanguageItems"
                item-title="title"
                item-value="value"
                :label="t('Language')"
                density="compact"
              />
            </VCol>
            <VCol cols="6">
              <FormSwitch
                v-model="tplForm.is_enabled"
                :label="t('Enabled')"
                color="primary"
                density="compact"
                hide-details
              />
            </VCol>
          </VRow>
        </VCol>
        <VCol
          cols="12"
          md="6"
        >
          <div class="text-subtitle-2 mb-2">
            {{ t('Preview') }}
          </div>
          <FormInput
            v-model="tplPreviewContext"
            multiline
            :label="t('Sample context (JSON)')"
            rows="6"
            placeholder="{&quot;first_name&quot;:&quot;Ali&quot;,&quot;order_id&quot;:&quot;123&quot;}"
          />
          <VBtn
            color="primary"
            :loading="tplPreviewLoading"
            prepend-icon="bx-play"
            class="mt-2"
            @click="previewTemplate"
          >
            {{ t('Render preview') }}
          </VBtn>
          <VCard
            v-if="tplPreviewResult"
            class="mt-3"
            variant="outlined"
          >
            <VCardText>
              <div class="text-caption text-disabled mb-1">
                {{ t('Rendered output') }}
              </div>
              <pre
                class="text-body-2"
                style="white-space:pre-wrap;"
              >{{ tplPreviewResult }}</pre>
            </VCardText>
          </VCard>
        </VCol>
      </VRow><template #footer>
        <Button
          variant="primary"
          :loading="tplSaving"
          @click="saveTemplate"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.notifications-workspace .settings-section__heading { flex-direction: column; align-items: flex-start; min-width: 0; }
.notifications-workspace .settings-section__heading .badge { white-space: normal; line-height: 1.5; }
.notification-form > :nth-child(n+4) { grid-column: 1 / -1; }
.notification-form :deep(.form-input) { margin-block: 0; }

.notifications-workspace__tabs { margin-bottom: 24px; width: fit-content; }
.notification-form {
  grid-template-columns: repeat(2, minmax(0, 1fr)); display: grid; gap: 24px; }
.notification-form__actions { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 8px; }
.notification-panel-title { font-size: 18px; margin: 0 auto 0 0; }
.notification-templates article { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding: 24px; border-top: 1px solid var(--border); }
.notification-templates article > div:nth-child(2) { flex: 1 1 220px; min-width: 0; }
.notification-templates h3 { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.notification-templates p { color: var(--text-secondary); font-size: 12px; margin: 6px 0 0; }
.notification-log-message { display: block; min-width: 220px; max-width: 500px; white-space: normal; overflow-wrap: anywhere; }
@media (max-width: 680px) { .notification-form { grid-template-columns: minmax(0, 1fr); } }
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
