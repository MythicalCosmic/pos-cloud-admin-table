<script setup lang="ts">
import BrandMark from '@/components/design/BrandMark.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import StateFill from '@/components/design/StateFill.vue'
import { licensingApi } from '@/plugins/axios'
import '@styles/pages/licensing.css'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const { notify } = useNotify()
const state = ref<any>(null)
const loadingState = ref(true)
const stateError = ref('')
const form = reactive({ email: '', plan_id: null as number | null })
const plans = ref<any[]>([])
const loadingPlans = ref(false)
const plansError = ref(false)
const submitting = ref(false)
const complete = ref(false)
const error = ref('')
const redirectTimer = ref<ReturnType<typeof setTimeout>>()
const planOptions = computed(() => plans.value.map(plan => ({ value: String(plan.id), label: plan.name || `${t('Plan')} #${plan.id}` })))
const canActivate = computed(() => !loadingState.value && state.value?.status === 'UNREGISTERED' && !submitting.value && !complete.value)

async function loadPlans() {
  loadingPlans.value = true
  plansError.value = false
  try {
    const res = await licensingApi.get('/plans')
    const data = res.data?.data ?? res.data

    plans.value = Array.isArray(data) ? data : (data?.plans ?? data?.items ?? [])
  }
  catch {
    plansError.value = true
  }
  finally {
    loadingPlans.value = false
  }
}

async function loadState() {
  loadingState.value = true
  stateError.value = ''
  try {
    const res = await licensingApi.get('/status')

    state.value = res.data?.data ?? res.data
    if (!state.value?.status)
      throw new Error('Missing license status')
    if (state.value.status !== 'UNREGISTERED')
      await router.replace('/licensing/status')
  }
  catch (e: any) {
    stateError.value = e?.response?.data?.message ?? t('Could not reach licensing server')
  }
  finally {
    loadingState.value = false
  }
}

async function submit() {
  if (!canActivate.value)
    return
  error.value = ''
  if (!form.email.trim()) {
    error.value = t('Email is required')
    return
  }
  submitting.value = true
  try {
    const payload: { email: string; plan_id?: number } = { email: form.email.trim() }
    if (form.plan_id !== null)
      payload.plan_id = form.plan_id
    await licensingApi.post('/setup', payload)
    complete.value = true
    notify(t('Setup complete — redirecting to login'))

    // The licensing service needs a moment to publish the active state.
    redirectTimer.value = setTimeout(() => { window.location.href = '/login' }, 800)
  }
  catch (e: any) {
    error.value = e?.response?.data?.message ?? t('Setup failed')
  }
  finally {
    submitting.value = false
  }
}

onMounted(() => { loadState(); loadPlans() })
onBeforeUnmount(() => clearTimeout(redirectTimer.value))
</script>

<template>
  <main class="license-setup">
    <div class="license-setup__brand">
      <BrandMark style="width: 36px; height: 36px;" /><span>Alpha POS</span>
    </div>
    <div class="license-setup__layout">
      <section class="license-setup__intro">
        <h1>{{ t('license_welcome_title') }}</h1>
        <p>{{ t('license_welcome_subtitle') }}</p>
        <div class="license-setup__steps">
          <span class="is-current"><b>01</b>{{ t('Activate') }}</span>
          <span><b>02</b>{{ t('Sign in') }}</span>
          <span><b>03</b>{{ t('Dashboard') }}</span>
        </div>
        <div
          class="license-setup__art"
          aria-hidden="true"
        >
          <span /><span /><span /><DesignIcon
            name="store"
            :size="76"
          />
        </div>
      </section>
      <section class="license-setup__form">
        <div class="license-emblem">
          <DesignIcon
            name="key"
            :size="26"
          />
        </div>
        <h2>{{ t('Activate this POS install') }}</h2>
        <p class="secondary">
          {{ t('license_setup_details') }}
        </p>
        <div
          v-if="loadingState"
          class="license-skeleton"
          role="status"
          :aria-label="t('Checking license status...')"
        >
          <span class="sk-box" /><span class="sk-box" /><span class="sk-box" />
        </div>
        <StateFill
          v-else-if="stateError"
          icon="alert"
          error
          :title="stateError"
        >
          <template #action>
            <Button
              variant="secondary"
              icon="refresh"
              @click="loadState"
            >
              {{ t('Retry') }}
            </Button>
          </template>
        </StateFill>
        <form
          v-else
          class="license-form"
          @submit.prevent="submit"
        >
          <Field :label="t('Email')">
            <Input
              v-model="form.email"
              type="email"
              autocomplete="email"
              required
              icon="mail"
              :disabled="submitting || complete"
            />
          </Field>
          <Field
            v-if="plans.length"
            :label="t('Plan')"
            :hint="t('Optional — vendor sets default when omitted')"
          >
            <SearchSelect
              :model-value="form.plan_id"
              :options="planOptions"
              :disabled="submitting || complete"
              :placeholder="t('Select')"
              @update:model-value="form.plan_id = $event ? Number($event) : null"
            />
          </Field>
          <div
            v-else-if="loadingPlans"
            class="sk-box license-plan-skeleton"
            :aria-label="t('Loading')"
            role="status"
          />
          <div
            v-if="plansError"
            class="license-note"
          >
            <p>{{ t('license_plans_unavailable') }}</p><Button
              variant="ghost"
              size="sm"
              icon="refresh"
              @click="loadPlans"
            >
              {{ t('Retry') }}
            </Button>
          </div>
          <p
            v-if="error"
            class="license-error"
            role="alert"
          >
            {{ error }}
          </p>
          <Button
            type="submit"
            icon="arrowright"
            :loading="submitting"
            :disabled="!canActivate"
          >
            {{ complete ? t('Setup complete — redirecting to login') : t('Activate') }}
          </Button>
        </form>
      </section>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: blank
  action: read
  subject: Auth
</route>
