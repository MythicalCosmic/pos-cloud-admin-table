<script setup lang="ts">
import OwnerLogo from '../components/OwnerLogo.vue'
import { haptic } from '../services/native'
import { OwnerLoginError, signIn } from '../services/session'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Segmented from '@/components/design/Segmented.vue'

const { t, locale } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

const languages = [
  { value: 'uz', label: 'O‘zbek' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]

async function submit() {
  if (busy.value)
    return
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = t('owner_app_login_required')

    return
  }
  busy.value = true
  try {
    await signIn(email.value.trim(), password.value)
    haptic('success')

    const target = (typeof route.query.to === 'string' && route.query.to.startsWith('/')) ? route.query.to : '/'

    await router.replace(target)
  }
  catch (e) {
    haptic('warning')
    error.value = (e instanceof OwnerLoginError && e.reason === 'not_owner')
      ? t('owner_app_only_owners')
      : translate(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="owner-login">
    <div class="owner-login__brand">
      <OwnerLogo :size="76" />
      <h1>Alpha POS</h1>
      <p>{{ t('owner_app_login_sub') }}</p>
    </div>

    <form
      class="owner-login__form"
      novalidate
      @submit.prevent="submit"
    >
      <Field :label="t('Email')">
        <Input
          v-model="email"
          type="email"
          icon="mail"
          autocomplete="username"
          inputmode="email"
          autocapitalize="off"
        />
      </Field>
      <Field :label="t('Password')">
        <div class="owner-login__password">
          <Input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            icon="lock"
            autocomplete="current-password"
          />
          <button
            type="button"
            class="owner-login__eye"
            :aria-label="t(showPassword ? 'owner_app_hide_password' : 'owner_app_show_password')"
            @click="showPassword = !showPassword"
          >
            <DesignIcon
              :name="showPassword ? 'eyeoff' : 'eye'"
              :size="18"
            />
          </button>
        </div>
      </Field>

      <p
        v-if="error"
        class="owner-login__error"
        role="alert"
      >
        {{ error }}
      </p>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        :loading="busy"
        class="owner-login__submit"
      >
        {{ t('owner_app_sign_in') }}
      </Button>
    </form>

    <div class="owner-login__lang">
      <Segmented
        :model-value="String(locale)"
        :options="languages"
        @update:model-value="value => locale = String(value)"
      />
    </div>
  </div>
</template>

<style scoped>
.owner-login {
  min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 28px;
  padding: calc(env(safe-area-inset-top, 0px) + 24px) 22px calc(env(safe-area-inset-bottom, 0px) + 24px);
  max-width: 440px; margin: 0 auto;
}
.owner-login__brand { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.owner-login__brand h1 { margin: 6px 0 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
.owner-login__brand p { margin: 0; color: var(--text-secondary); font-size: 15px; }
.owner-login__form { display: grid; gap: 14px; }
.owner-login__password { position: relative; }
.owner-login__eye {
  position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
  display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 10px;
  background: transparent; color: var(--text-secondary); cursor: pointer;
}
.owner-login__error { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--error-weak); color: var(--error-strong); font-size: 14px; }
.owner-login__submit { width: 100%; justify-content: center; min-height: 50px; }
.owner-login__lang { display: flex; justify-content: center; }
</style>
