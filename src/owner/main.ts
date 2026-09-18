/* eslint-disable import/order */
import '@/@iconify/icons-bundle'
import OwnerApp from './OwnerApp.vue'
import ability from '@/plugins/casl/ability'
import i18n from '@/plugins/i18n'
import vuetify from '@/plugins/vuetify'
import { setRequestFailureHandlers } from '@/plugins/axios'
import { abilitiesPlugin } from '@casl/vue'
import '@core/scss/template/index.scss'
import '@styles/styles.scss'
import './owner.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import router from './router'
import { hideSplash, initNative, restoreToken } from './services/native'
import { clearSession, refreshIfStale, restoreBusinessDay, restoreProfile } from './services/session'

async function start() {
  // A phone OS may clear WebView storage; the Keychain/Keystore copy restores the session.
  if (!localStorage.getItem('accessToken')) {
    const token = await restoreToken()
    if (token)
      localStorage.setItem('accessToken', JSON.stringify(token))
  }

  setRequestFailureHandlers({
    unauthorized: () => {
      clearSession()
      if (router.currentRoute.value.path !== '/login')
        void router.replace('/login')
    },
    license: () => { /* the owner app shows the server error message on each screen */ },
  })

  const app = createApp(OwnerApp)

  app.use(vuetify)
  app.use(createPinia())
  app.use(router)
  app.use(i18n)
  app.use(abilitiesPlugin, ability, { useGlobalProperties: true })

  await restoreProfile()
  await initNative(router, () => String(i18n.global.locale.value))
  await router.isReady()
  app.mount('#app')
  void hideSplash()
  void refreshIfStale()
  void restoreBusinessDay()
}

start().catch((error: unknown) => {
  console.error('Owner app startup failed:', error instanceof Error ? error.message : error)
  void hideSplash()
})
