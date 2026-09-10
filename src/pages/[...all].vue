<script setup lang="ts">
import PublicState from '@/components/design/PublicState.vue'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <PublicState
    code="404"
    icon="search"
    :title="t('Page Not Found')"
    :description="t('The page you requested does not exist.')"
  />
</template>

<route lang="yaml">
meta:
  layout: blank
  action: read
  subject: Auth
</route>
