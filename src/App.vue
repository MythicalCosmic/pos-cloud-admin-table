<script setup lang="ts">
import { useTheme } from 'vuetify'
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'
import '@styles/design-toasts.css'
import DesignIcon from '@/components/design/DesignIcon.vue'
import ActionDialog from '@/components/design/ActionDialog.vue'
import CommandPalette from '@/components/design/CommandPalette.vue'
import ShortcutHelp from '@/components/design/ShortcutHelp.vue'
import ScrollToTop from '@core/components/ScrollToTop.vue'
import { useThemeConfig } from '@core/composable/useThemeConfig'
import { hexToRgb } from '@layouts/utils'

const { syncInitialLoaderTheme, syncVuetifyThemeWithTheme: syncConfigThemeWithVuetifyTheme, isAppRtl, handleSkinChanges } = useThemeConfig()

const { global } = useTheme()
const { t } = useI18n({ useScope: 'global' })

// ℹ️ Sync current theme with initial loader theme
syncInitialLoaderTheme()
syncConfigThemeWithVuetifyTheme()
handleSkinChanges()

// Tell vue-sonner whether we're in dark/light so its CSS vars flip with the rest of the app.
const sonnerTheme = computed<'dark' | 'light'>(() => global.current.value.dark ? 'dark' : 'light')
</script>

<template>
  <VLocaleProvider :rtl="isAppRtl">
    <!-- ℹ️ This is required to set the background color of active nav link based on currently active global theme's primary -->
    <VApp :style="`--v-global-theme-primary: ${hexToRgb(global.current.value.colors.primary)}`">
      <RouterView />
      <ScrollToTop />
      <!-- Global Cmd/Ctrl+K command palette (mount-once; listens at the window level). -->
      <CommandPalette />
      <ActionDialog />
      <!-- Global "?" key opens keyboard-shortcut reference. -->
      <ShortcutHelp />
      <!-- vue-sonner: replaces the per-page VSnackbar plumbing. useNotify() now dispatches to toast(). -->
      <Toaster
        :theme="sonnerTheme"
        close-button
        expand
        position="top-right"
        close-button-position="top-right"
        class="alpha-toaster"
        :duration="4500"
        :gap="12"
        :offset="24"
        :mobile-offset="12"
        :visible-toasts="3"
        :container-aria-label="t('Notifications')"
        :toast-options="{ closeButtonAriaLabel: t('Dismiss'), class: 'alpha-toast' }"
      >
        <template #close-icon>
          <DesignIcon
            name="close"
            :size="16"
          />
        </template>
      </Toaster>
    </VApp>
  </VLocaleProvider>
</template>
