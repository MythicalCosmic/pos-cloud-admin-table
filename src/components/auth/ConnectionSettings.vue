<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import { getCurrentApiHost, setApiHost, validateApiHost } from '@/plugins/axios'

const { t } = useI18n({ useScope: 'global' })

const dialog = ref(false)
const input = ref('')
const probing = ref(false)
const probeResult = ref<'ok' | 'fail' | null>(null)
const probeMessage = ref('')

const current = computed(() => getCurrentApiHost() || t('(relative — vite proxy / nginx)'))
const hostValidation = computed(() => validateApiHost(input.value))
const hostInvalid = computed(() => !hostValidation.value.valid)
let activeProbe: AbortController | null = null

function cancelProbe() {
  activeProbe?.abort()
  activeProbe = null
  probing.value = false
}

watch(dialog, value => {
  if (!value)
    cancelProbe()
})
onBeforeUnmount(cancelProbe)

watch(input, () => {
  cancelProbe()
  probeResult.value = null
  probeMessage.value = ''
})

function open() {
  input.value = getCurrentApiHost()
  probeResult.value = null
  probeMessage.value = ''
  dialog.value = true
}

function clear() {
  input.value = ''
}

async function probe() {
  if (probing.value)
    return

  if (hostInvalid.value) {
    probeResult.value = 'fail'
    probeMessage.value = t('Error')

    return
  }

  probing.value = true
  probeResult.value = null
  probeMessage.value = ''

  const controller = new AbortController()

  activeProbe = controller

  const timer = window.setTimeout(() => controller.abort(), 10_000)

  try {
    const host = hostValidation.value.normalized
    const url = `${host || ''}/healthz`
    const res = await fetch(url, { method: 'GET', signal: controller.signal })

    if (activeProbe !== controller)
      return

    if (res.ok) {
      probeResult.value = 'ok'
      probeMessage.value = `${res.status} ${res.statusText}`
    }
    else {
      probeResult.value = 'fail'
      probeMessage.value = `${res.status} ${res.statusText}`
    }
  }
  catch (e: unknown) {
    if (activeProbe !== controller)
      return
    probeResult.value = 'fail'
    probeMessage.value = (e instanceof Error && e.name !== 'AbortError') ? e.message : t('Error')
  }
  finally {
    window.clearTimeout(timer)
    if (activeProbe === controller) {
      probing.value = false
      activeProbe = null
    }
  }
}

function save() {
  if (hostInvalid.value || probing.value)
    return

  setApiHost(hostValidation.value.normalized)

  // Full reload so every module re-reads localStorage and axios picks up
  // the new baseURL on first request, not after lazy interceptor fire.
  window.location.reload()
}

function quickPreset(host: string) {
  input.value = host
}
</script>

<template>
  <div>
    <slot
      name="activator"
      :open="open"
    >
      <Button
        icon="sliders"
        variant="ghost"
        @click="open"
      >
        {{ t('login_connection') }}
      </Button>
    </slot>

    <Modal
      v-model:open="dialog"
      :title="t('login_connection')"
      :subtitle="t('login_connection_hint')"
      :width="520"
    >
      <div class="connection-settings">
        <p class="connection-settings__current">
          {{ t('Currently') }}
          <code>{{ current }}</code>
        </p>
        <Field
          :label="t('Base URL')"
          :error="hostInvalid ? t('login_server_invalid') : undefined"
          :hint="t('No trailing slash. Leave empty to fall back to the build default / vite proxy.')"
        >
          <Input
            v-model="input"
            type="url"
            placeholder="http://127.0.0.1:8000"
            autocomplete="off"
            :spellcheck="false"
            autofocus
          />
        </Field>
        <div class="connection-settings__presets">
          <Button
            size="sm"
            @click="quickPreset('http://127.0.0.1:8000')"
          >
            {{ t('Local') }} · 127.0.0.1
          </Button>
          <Button
            size="sm"
            @click="quickPreset('http://localhost:8000')"
          >
            localhost
          </Button>
          <Button
            size="sm"
            variant="ghost"
            @click="clear"
          >
            {{ t('Clear / default') }}
          </Button>
        </div>
        <div
          v-if="probeResult"
          class="connection-settings__result"
          :class="{ 'is-error': probeResult === 'fail' }"
          role="status"
        >
          <DesignIcon
            :name="probeResult === 'ok' ? 'checkcircle' : 'alert'"
            :size="18"
          />
          <span>{{ t(probeResult === 'ok' ? 'Reached' : 'Could not reach') }} <code>/healthz</code> · {{ probeMessage }}</span>
        </div>
        <p class="connection-settings__note">
          {{ t('Saving reloads the page so every axios instance picks up the new URL.') }}
        </p>
      </div>
      <template #footer>
        <div class="connection-settings__actions">
          <Button
            icon="refresh"
            :loading="probing"
            :disabled="hostInvalid"
            @click="probe"
          >
            {{ t('Test') }}
          </Button>
          <Button
            variant="primary"
            :disabled="hostInvalid || probing"
            @click="save"
          >
            {{ t('Save & reload') }}
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.connection-settings {
  display: grid;
  gap: 20px;
}

.connection-settings__current {
  display: grid;
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  gap: 6px;
}

.connection-settings__current code {
  color: var(--text);
  overflow-wrap: anywhere;
}

.connection-settings__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.connection-settings__result {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--success-border);
  border-radius: 8px;
  background: var(--success-weak);
  color: var(--success-strong);
  font-size: 13px;
  gap: 9px;
  overflow-wrap: anywhere;
}

.connection-settings__result > svg {
  flex-shrink: 0;
}

.connection-settings__result.is-error {
  border-color: var(--error-border);
  background: var(--error-weak);
  color: var(--error-strong);
}

.connection-settings__note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.connection-settings__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  inline-size: 100%;
}

@media (max-width: 600px) {
  .connection-settings__presets > .btn,
  .connection-settings__actions > .btn {
    min-block-size: 44px;
  }
}
</style>
