<script setup lang="ts">
import { useTheme } from 'vuetify'
import OwnerPage from '../components/OwnerPage.vue'
import type { PushKind } from '../services/mobileApi'
import { updateDevice } from '../services/mobileApi'
import { PUSH_READY, appVersion, biometryAvailable, enablePush, haptic, isNative, unlockWithBiometry } from '../services/native'
import { BIOMETRIC_KEY, biometricLockEnabled, ownerState } from '../state'
import Switch from '@/components/design/Switch.vue'
import Segmented from '@/components/design/Segmented.vue'
import Button from '@/components/design/Button.vue'

const { t, locale } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { theme, setTheme } = useAlphaTheme(useTheme())

const languages = [
  { value: 'uz', label: 'Oʻzbekcha' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]

const themes = computed(() => [
  { value: 'light', label: t('owner_app_theme_light') },
  { value: 'dark', label: t('owner_app_theme_dark') },
])

const kinds = computed<Array<{ kind: PushKind; label: string; sub: string }>>(() => [
  { kind: 'expense_pending', label: t('owner_app_push_expense'), sub: t('owner_app_push_expense_sub') },
  { kind: 'shift_closed', label: t('owner_app_push_shift'), sub: t('owner_app_push_shift_sub') },
  { kind: 'daily_summary', label: t('owner_app_push_daily'), sub: t('owner_app_push_daily_sub') },
])

const biometric = ref(biometricLockEnabled())
const canBiometric = ref(false)
const enabling = ref(false)
const version = ref('')

async function setBiometric(on: boolean) {
  // Prove the owner can unlock before turning the lock on.
  if (on && !(await unlockWithBiometry(t('owner_app_unlock_reason'), t('Cancel'))))
    return
  try {
    if (on)
      localStorage.setItem(BIOMETRIC_KEY, '1')
    else
      localStorage.removeItem(BIOMETRIC_KEY)
  }
  catch { /* storage unavailable */ }
  biometric.value = on
  haptic('light')
}

async function turnOnPush() {
  enabling.value = true
  try {
    if (!(await enablePush(String(locale.value))))
      notify(t('owner_app_push_denied'), 'warning')
  }
  finally {
    enabling.value = false
  }
}

async function setPref(kind: PushKind, value: boolean) {
  const device = ownerState.device
  if (!device)
    return
  const before = device.prefs[kind]

  device.prefs[kind] = value
  try {
    ownerState.device = await updateDevice(device.id, { prefs: { [kind]: value } })
  }
  catch (e) {
    device.prefs[kind] = before
    notify(translate(e), 'error')
  }
}

onMounted(async () => {
  canBiometric.value = await biometryAvailable()
  version.value = await appVersion()
})
</script>

<template>
  <OwnerPage
    :title="t('owner_app_settings')"
    back
  >
    <h2 class="owner-section-title">
      {{ t('owner_app_language') }}
    </h2>
    <Segmented
      :model-value="String(locale)"
      :options="languages"
      class="owner-settings__seg"
      @update:model-value="value => locale = String(value)"
    />

    <h2 class="owner-section-title">
      {{ t('owner_app_theme') }}
    </h2>
    <Segmented
      :model-value="theme"
      :options="themes"
      class="owner-settings__seg"
      @update:model-value="value => setTheme(value as 'light' | 'dark')"
    />

    <template v-if="isNative()">
      <h2 class="owner-section-title">
        {{ t('owner_app_security') }}
      </h2>
      <div class="owner-row">
        <div class="owner-row__main">
          <span class="owner-row__title">{{ t('owner_app_biometric_lock') }}</span>
          <span class="owner-settings__sub">{{ canBiometric ? t('owner_app_biometric_lock_sub') : t('owner_app_biometric_unavailable') }}</span>
        </div>
        <Switch
          :model-value="biometric"
          :disabled="!canBiometric"
          :aria-label="t('owner_app_biometric_lock')"
          @update:model-value="setBiometric"
        />
      </div>

      <h2 class="owner-section-title">
        {{ t('owner_app_notifications') }}
      </h2>
      <div
        v-if="ownerState.device"
        class="owner-list"
      >
        <div
          v-for="item in kinds"
          :key="item.kind"
          class="owner-row"
        >
          <div class="owner-row__main">
            <span class="owner-row__title">{{ item.label }}</span>
            <span class="owner-settings__sub">{{ item.sub }}</span>
          </div>
          <Switch
            :model-value="ownerState.device.prefs[item.kind]"
            :aria-label="item.label"
            @update:model-value="value => setPref(item.kind, value)"
          />
        </div>
      </div>
      <div
        v-else
        class="owner-settings__push"
      >
        <p class="owner-settings__sub">
          {{ ownerState.pushPermission === 'denied' ? t('owner_app_push_denied') : PUSH_READY ? t('owner_app_push_off') : t('owner_app_push_unavailable') }}
        </p>
        <Button
          v-if="PUSH_READY"
          variant="primary"
          size="lg"
          icon="bell"
          :loading="enabling"
          @click="turnOnPush"
        >
          {{ t('owner_app_push_enable') }}
        </Button>
      </div>
    </template>

    <p class="owner-settings__about">
      Alpha POS<template v-if="version">
        · {{ t('owner_app_version', { v: version }) }}
      </template>
    </p>
  </OwnerPage>
</template>

<style scoped>
.owner-settings__seg { width: 100%; }
.owner-settings__sub { color: var(--text-secondary); font-size: 13px; line-height: 1.4; white-space: normal; }
.owner-settings__push { display: grid; gap: 10px; }
.owner-settings__push :deep(.btn) { width: 100%; justify-content: center; min-height: 50px; }
.owner-settings__about { margin: 32px 0 0; text-align: center; color: var(--text-secondary); font-size: 13px; }
</style>
