<script setup lang="ts">
import PageHeader from '@/components/design/PageHeader.vue'
import Switch from '@/components/design/Switch.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import StateFill from '@/components/design/StateFill.vue'
import axios from '@/plugins/axios'
import { type NumberFormatMode, useFormatMode } from '@/components/design/utils/format'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()

const { mode: numberFormat, setMode: setNumberFormat } = useFormatMode()
function chooseNumberFormat(v: NumberFormatMode) {
  setNumberFormat(v)
  notify(t('Number format updated'))
}

const settings = ref<any>({ hr_enabled: false, waiter_enabled: false, stock_enabled: false })
const loading = ref(false)
const saving = ref(false)
const loadError = ref(false)
const saved = ref('')
const dirty = computed(() => !!saved.value && JSON.stringify(settings.value) !== saved.value)

async function load() {
  if (loading.value)
    return
  loading.value = true
  loadError.value = false
  try {
    const res = await axios.get('/app-settings')
    const d = res.data?.data ?? res.data
    if (d?.settings)
      settings.value = { ...settings.value, ...d.settings }
    saved.value = JSON.stringify(settings.value)
  }
  catch {
    loadError.value = true
    notify(t('Failed to load settings'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value || loading.value || loadError.value || !dirty.value)
    return
  saving.value = true
  try {
    const payload = { ...settings.value }

    await axios.put('/app-settings', payload)
    saved.value = JSON.stringify(payload)
    notify(t('Settings saved'))
    load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)

const modules = computed(() => [
  { key: 'hr_enabled', icon: 'bx-group', label: 'app_module_hr', description: 'app_module_hr_hint' },
  { key: 'stock_enabled', icon: 'bx-package', label: 'app_module_stock', description: 'app_module_stock_hint' },
  { key: 'waiter_enabled', icon: 'bx-restaurant', label: 'app_module_waiter', description: 'app_module_waiter_hint' },
])
</script>

<template>
  <div class="page app-settings-page">
    <PageHeader
      :title="t('App Settings')"
      :subtitle="t('Toggle modules on or off across the entire system')"
    >
      <template #actions>
        <Button
          icon="retry"
          :disabled="loading || saving"
          @click="load"
        >
          {{ t('Reset') }}
        </Button><Button
          icon="save"
          variant="primary"
          :loading="saving"
          :disabled="loading || loadError || !dirty"
          @click="save"
        >
          {{ t('Save') }}
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
          @click="load"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>
    <section
      v-else
      class="module-workspace"
      :aria-busy="loading"
    >
      <div class="workspace-section-head">
        <div><h2>{{ t('App Modules') }}</h2><p>{{ t('Toggle modules on or off across the entire system') }}</p></div><span
          v-if="dirty"
          class="badge t-warning"
        >{{ t('workspace_unsaved_changes') }}</span>
      </div>
      <div
        v-if="loading"
        class="module-options"
      >
        <div
          v-for="n in 3"
          :key="n"
          class="module-option"
        >
          <div
            class="sk-box"
            style="height:40px;width:40px"
          /><div
            class="sk-box"
            style="height:20px;margin-top:24px"
          /><div
            class="sk-box"
            style="height:38px;margin-top:14px"
          />
        </div>
      </div>
      <div
        v-else
        class="module-options"
      >
        <label
          v-for="m in modules"
          :key="m.key"
          class="module-option"
          :class="{ 'is-enabled': settings[m.key] }"
        ><div class="module-option__head"><span class="module-option__icon"><DesignIcon
          :name="m.icon"
          :size="24"
        /></span><Switch
          v-model="settings[m.key]"
          :disabled="saving"
          :aria-label="t(m.label)"
        /></div><h3>{{ t(m.label) }}</h3><p>{{ t(m.description) }}</p><span class="module-option__status"><span />{{ t(settings[m.key] ? 'Enabled' : 'Disabled') }}</span></label>
      </div>
      <div class="workspace-note">
        <DesignIcon
          name="info"
          :size="18"
        /><span>{{ t('Disabling a module hides its endpoints and navigation. Settings persist across logins.') }}</span>
      </div>
    </section>
    <section class="appearance-workspace">
      <div class="workspace-section-head">
        <div><h2>{{ t('Number format') }}</h2><p>{{ t('Choose how numbers and prices are displayed') }}</p></div>
      </div><div class="number-format-options">
        <label :class="{ 'is-selected': numberFormat === 'full' }"><input
          type="radio"
          name="numFormat"
          :checked="numberFormat === 'full'"
          @change="chooseNumberFormat('full')"
        ><div><strong>{{ t('Full (1 000 000)') }}</strong><span>{{ t('Group thousands with a space') }}</span></div></label>
        <label :class="{ 'is-selected': numberFormat === 'short' }"><input
          type="radio"
          name="numFormat"
          :checked="numberFormat === 'short'"
          @change="chooseNumberFormat('short')"
        ><div><strong>{{ t('Short (1M / 1K)') }}</strong><span>{{ t('Abbreviate big numbers') }}</span></div></label>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
