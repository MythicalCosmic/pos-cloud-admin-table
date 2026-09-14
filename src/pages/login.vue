<script setup lang="ts">
import { isAxiosError } from 'axios'
import { toast } from 'vue-sonner'
import { useTheme } from 'vuetify'
import SearchSelect from '@/components/design/SearchSelect.vue'
import BrandMark from '@/components/design/BrandMark.vue'
import LoginScene from '@/components/auth/LoginScene.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import ConnectionSettings from '@/components/auth/ConnectionSettings.vue'
import axiosIns from '@/plugins/axios'
import ability from '@/plugins/casl/ability'
import { useAlphaTheme } from '@/composables/useAlphaTheme'
import { useApiError } from '@/composables/useApiError'
import { hydrateBusinessSettings, setBusinessDayStart } from '@/composables/useBusinessDay'
import { getStoredToken } from '@/utils/storage'

const { t, locale } = useI18n({ useScope: 'global' })
const { translate } = useApiError()
const { theme, toggleTheme } = useAlphaTheme(useTheme())
const router = useRouter()
const route = useRoute()

const form = ref({ email: '', password: '' })
const emailInput = ref<HTMLInputElement | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)
const errorPanel = ref<HTMLElement | null>(null)
const isPasswordVisible = ref(false)
const isLoading = ref(false)
const loginComplete = ref(false)
const loginError = shallowRef<unknown>(null)
const submitted = ref(false)
const touched = reactive({ email: false, password: false })
const capsLock = ref(false)
const motionPaused = ref(false)
const reducedMotion = usePreferredReducedMotion()

const languages = computed(() => [
  { code: 'uz', label: t('lang_native_uz') },
  { code: 'ru', label: t('lang_native_ru') },
  { code: 'en', label: t('lang_native_en') },
])

const emailError = computed(() => {
  if (!submitted.value && !touched.email)
    return ''
  if (!form.value.email.trim())
    return t('login_email_required')
  return /^[^\s@]+@[^\s@]+$/.test(form.value.email.trim()) ? '' : t('login_email_invalid')
})

const passwordError = computed(() =>
  ((submitted.value || touched.password) && !form.value.password) ? t('login_password_required') : '',
)

const errorMsg = computed(() => {
  if (!loginError.value)
    return ''
  if (isAxiosError(loginError.value) && !loginError.value.response)
    return t('login_network_error')
  return translate(loginError.value) || t('login_error')
})

function checkCapsLock(event: KeyboardEvent) {
  capsLock.value = event.getModifierState('CapsLock')
}

function dismissError() {
  loginError.value = null
  emailInput.value?.focus()
}

async function refreshSessionUser(user: Record<string, any>) {
  let sessionUser = user

  // Per-restaurant overnight-shift boundary (default 03:00). BE exposes it
  // on /auth-me (top-level) and /app-settings (under data.settings). The
  // /auth-login response does NOT carry it, so we fan out to /auth-me after
  // login. Best-effort: failure here is non-fatal — useBusinessDay falls
  // back to its 03:00 default.
  try {
    const meRes = await axiosIns.get('/auth-me')
    const me = meRes?.data?.data ?? {}

    const bds: unknown = me?.business_day_start
      ?? me?.user?.business_day_start
      ?? me?.restaurant?.business_day_start

    if (typeof bds === 'string' && /^\d{1,2}:\d{2}/.test(bds))
      setBusinessDayStart(bds.slice(0, 5))

    // Refresh cached userData with the fuller /auth-me payload so other
    // pages that read userData see the new field too.
    if (me && typeof me === 'object') {
      sessionUser = { ...user, ...me }
      localStorage.setItem('userData', JSON.stringify(sessionUser))
    }
  }
  catch { /* noop — keep prior default */ }

  return sessionUser
}

const login = async () => {
  if (isLoading.value || loginComplete.value)
    return

  submitted.value = true
  if (emailError.value || passwordError.value) {
    await nextTick()
    ;(emailError.value ? emailInput.value : passwordInput.value)?.focus()
    return
  }

  isLoading.value = true
  loginError.value = null

  try {
    const { data } = await axiosIns.post('/auth-login', {
      email: form.value.email.trim(),
      password: form.value.password,
    })

    const { token, user } = data.data

    localStorage.setItem('accessToken', JSON.stringify(token))
    localStorage.setItem('userData', JSON.stringify(user))

    const sessionUser = await refreshSessionUser(user)

    // A 401 during hydration clears the token in the shared interceptor.
    // Stop before restoring abilities for a session the server rejected.
    if (!getStoredToken())
      throw new Error('Authentication required')

    // Pull operating-hours settings (day-start + working open/close) from
    // /app-settings so the picker's "Working hours" filter is correct.
    // Warehouse is the first back-office role with a deliberately restricted
    // surface. Its route/action visibility is driven by backend permissions;
    // do not persist the legacy manage-all ability for this account.
    const normalizedRole = String(sessionUser?.role ?? sessionUser?.user?.role ?? '').toUpperCase()
    if (normalizedRole !== 'WAREHOUSE')
      hydrateBusinessSettings()

    const userAbilities = normalizedRole === 'WAREHOUSE'
      ? [{ action: 'read', subject: 'Auth' }]
      : [{ action: 'manage', subject: 'all' }]

    localStorage.setItem('userAbilities', JSON.stringify(userAbilities))
    ability.update(userAbilities)

    const redirectTo = route.query.to ? String(route.query.to) : '/'

    loginComplete.value = true
    toast.dismiss('login-error')
    await router.replace(redirectTo)
  }
  catch (err: unknown) {
    loginError.value = err
    toast.error(t('login_error_title'), {
      id: 'login-error',
      description: errorMsg.value,
      duration: 7000,
    })
    loginComplete.value = false
    await nextTick()
    errorPanel.value?.focus()
  }
  finally {
    isLoading.value = false
    loginComplete.value = false
  }
}
</script>

<template>
  <main
    class="login-page"
    :data-login-theme="theme"
  >
    <a
      class="login-skip"
      href="#login-email"
    >{{ t('login_skip') }}</a>

    <section
      class="login-story"
      aria-labelledby="login-story-title"
    >
      <div class="login-brand login-enter">
        <span
          class="login-brand__mark"
          aria-hidden="true"
        >
          <BrandMark />
        </span>
        <span>{{ t('Alpha POS') }}</span>
      </div>

      <div class="login-story__intro login-enter">
        <h2 id="login-story-title">
          {{ t('login_story_title') }}
          <span>{{ t('login_story_accent') }}</span>
        </h2>
        <p class="login-story__description">
          {{ t('login_story_body') }}
        </p>
      </div>

      <LoginScene :paused="motionPaused || isLoading" />

      <div class="login-story__footer login-enter">
        <span>{{ t('login_story_footer') }}</span>
        <button
          v-if="reducedMotion !== 'reduce'"
          class="login-motion"
          type="button"
          :aria-label="t(motionPaused ? 'login_motion_play' : 'login_motion_pause')"
          :title="t(motionPaused ? 'login_motion_play' : 'login_motion_pause')"
          :aria-pressed="motionPaused"
          @click="motionPaused = !motionPaused"
        >
          <DesignIcon
            :name="motionPaused ? 'play' : 'pause'"
            :size="16"
          />
        </button>
      </div>
    </section>

    <section
      class="login-panel"
      aria-labelledby="login-title"
    >
      <div class="login-toolbar">
        <div class="login-language">
          <SearchSelect
            :model-value="String(locale)"
            :aria-label="t('switch_language')"
            icon="translate"
            :options="languages.map(lang => ({ value: lang.code, label: lang.label }))"
            @update:model-value="locale = $event"
          />
        </div>
        <span
          class="login-toolbar__divider"
          aria-hidden="true"
        />
        <button
          class="login-icon-button login-theme"
          type="button"
          :aria-label="t('Toggle theme')"
          :title="t('Toggle theme')"
          @click="toggleTheme"
        >
          <span
            class="login-icon-swap"
            :class="{ 'is-swapped': theme === 'dark' }"
            aria-hidden="true"
          >
            <DesignIcon
              class="login-icon-swap__first"
              name="moon"
              :size="19"
            />
            <DesignIcon
              class="login-icon-swap__second"
              name="sun"
              :size="19"
            />
          </span>
        </button>
      </div>

      <div class="login-form-wrap">
        <div class="login-heading login-enter">
          <span
            class="login-workspace-icon"
            aria-hidden="true"
          ><DesignIcon
            name="ws-settings"
            :size="24"
            :weight="1.6"
          /></span>
          <h1 id="login-title">
            {{ t('login_welcome') }}
          </h1>
          <p class="login-heading__hint">
            {{ t('login_hint') }}
          </p>
        </div>

        <form
          class="login-form login-enter"
          novalidate
          :aria-busy="isLoading"
          @submit.prevent="login"
        >
          <Transition name="login-feedback">
            <div
              v-if="errorMsg"
              ref="errorPanel"
              class="login-error"
              role="alert"
              tabindex="-1"
            >
              <DesignIcon
                name="alert"
                :size="18"
              />
              <div>
                <strong>{{ t('login_error_title') }}</strong>
                <p>{{ errorMsg }}</p>
              </div>
              <button
                class="login-error__dismiss"
                type="button"
                :aria-label="t('Close')"
                @click="dismissError"
              >
                <DesignIcon
                  name="close"
                  :size="16"
                />
              </button>
            </div>
          </Transition>

          <div class="login-field">
            <label for="login-email">{{ t('Email') }}</label>
            <div
              class="login-input"
              :class="{ 'is-invalid': emailError }"
            >
              <DesignIcon
                name="mail"
                :size="19"
              />
              <input
                id="login-email"
                ref="emailInput"
                v-model="form.email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="username"
                autocapitalize="none"
                :spellcheck="false"
                :placeholder="t('login_email_placeholder')"
                :disabled="isLoading || loginComplete"
                :aria-invalid="emailError ? 'true' : undefined"
                :aria-describedby="emailError ? 'login-email-error' : undefined"
                required
                @blur="touched.email = true"
              >
            </div>
            <p
              v-if="emailError"
              id="login-email-error"
              class="login-field__error"
            >
              {{ emailError }}
            </p>
          </div>

          <div class="login-field">
            <label for="login-password">{{ t('Password') }}</label>
            <div
              class="login-input"
              :class="{ 'is-invalid': passwordError }"
            >
              <DesignIcon
                name="lock"
                :size="19"
              />
              <input
                id="login-password"
                ref="passwordInput"
                v-model="form.password"
                name="password"
                :type="isPasswordVisible ? 'text' : 'password'"
                autocomplete="current-password"
                :placeholder="t('login_password_placeholder')"
                :disabled="isLoading || loginComplete"
                :aria-invalid="passwordError ? 'true' : undefined"
                :aria-describedby="passwordError ? 'login-password-error' : capsLock ? 'login-caps-lock' : undefined"
                required
                @blur="touched.password = true; capsLock = false"
                @keydown="checkCapsLock"
                @keyup="checkCapsLock"
              >
              <button
                class="login-password-toggle"
                type="button"
                :aria-label="t(isPasswordVisible ? 'login_hide_password' : 'login_show_password')"
                :aria-pressed="isPasswordVisible"
                :disabled="isLoading || loginComplete"
                @click="isPasswordVisible = !isPasswordVisible"
              >
                <span
                  class="login-icon-swap"
                  :class="{ 'is-swapped': isPasswordVisible }"
                  aria-hidden="true"
                >
                  <DesignIcon
                    class="login-icon-swap__first"
                    name="eye"
                    :size="19"
                  />
                  <DesignIcon
                    class="login-icon-swap__second"
                    name="eyeoff"
                    :size="19"
                  />
                </span>
              </button>
            </div>
            <p
              v-if="passwordError"
              id="login-password-error"
              class="login-field__error"
            >
              {{ passwordError }}
            </p>
            <p
              v-else-if="capsLock"
              id="login-caps-lock"
              class="login-field__caps"
              role="status"
            >
              {{ t('login_caps_lock') }}
            </p>
          </div>

          <Button
            class="login-submit"
            type="submit"
            variant="primary"
            :loading="isLoading"
            :disabled="loginComplete"
          >
            <span aria-live="polite">{{ t(loginComplete ? 'login_submit_success' : isLoading ? 'login_submit_pending' : 'login_btn') }}</span>
            <DesignIcon
              v-if="!isLoading"
              :name="loginComplete ? 'check' : 'arrowright'"
              :size="19"
            />
          </Button>
        </form>

        <p class="login-access-hint login-enter">
          <DesignIcon
            name="info"
            :size="16"
          />
          <span>{{ t('login_access_hint') }}</span>
        </p>
      </div>

      <footer class="login-panel__footer">
        <span>{{ t('Alpha POS') }} <span aria-hidden="true">©</span> {{ new Date().getFullYear() }}</span>
        <ConnectionSettings>
          <template #activator="{ open }">
            <button
              class="login-connection"
              type="button"
              @click="open"
            >
              <DesignIcon
                name="sliders"
                :size="15"
              />
              {{ t('login_connection') }}
            </button>
          </template>
        </ConnectionSettings>
      </footer>
    </section>
  </main>
</template>

<style src="@styles/pages/login.css" />

<route lang="yaml">
meta:
  layout: blank
  action: read
  subject: Auth
  redirectIfLoggedIn: true
</route>
