<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'
import '@styles/design-toasts.css'
import { useTheme } from 'vuetify'
import LockScreen from './components/LockScreen.vue'
import OwnerTabBar from './components/OwnerTabBar.vue'
import { updateDevice } from './services/mobileApi'
import { setStatusBarTheme } from './services/native'
import { ownerState } from './state'

const route = useRoute()
const vuetifyTheme = useTheme()
const { global } = vuetifyTheme
const { locale } = useI18n({ useScope: 'global' })

// Restores the saved light/dark choice and keeps it in sync app-wide.
useAlphaTheme(vuetifyTheme)

const dark = computed(() => global.current.value.dark)

watch(dark, value => { setStatusBarTheme(value) }, { immediate: true })

// Push texts are written in the phone's language on the server.
watch(locale, value => {
  if (ownerState.device)
    updateDevice(ownerState.device.id, { locale: String(value) }).then(d => { ownerState.device = d }).catch(() => undefined)
})
</script>

<template>
  <VApp class="owner-app">
    <RouterView v-slot="{ Component }">
      <Component :is="Component" />
    </RouterView>
    <OwnerTabBar v-if="route.meta.tab" />
    <LockScreen v-if="ownerState.locked && route.path !== '/login'" />
    <Toaster
      position="top-center"
      :theme="dark ? 'dark' : 'light'"
      offset="calc(env(safe-area-inset-top, 0px) + 12px)"
      rich-colors
    />
  </VApp>
</template>

<style>
.owner-app { --owner-tabbar-h: 64px; background: var(--bg); min-height: 100dvh; }
.owner-app .v-application__wrap { min-height: 100dvh; }
html, body { overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
body { -webkit-user-select: none; user-select: none; }
input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }
</style>
