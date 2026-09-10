<script lang="ts" setup>
import NavBarI18n from '@core/components/I18n.vue'
import { useThemeConfig } from '@core/composable/useThemeConfig'
import type { I18nLanguage } from '@layouts/types'

const { isAppRtl } = useThemeConfig()

const i18nCompLanguages: I18nLanguage[] = [
  {
    label: 'O\'zbekcha',
    i18nLang: 'uz',
  },
  {
    label: 'Русский',
    i18nLang: 'ru',
  },
  {
    label: 'English',
    i18nLang: 'en',
  },
]

const handleLangChange = (_: string) => {
  isAppRtl.value = false
}
</script>

<template>
  <NavBarI18n
    :languages="i18nCompLanguages"
    @change="handleLangChange"
  />
</template>
