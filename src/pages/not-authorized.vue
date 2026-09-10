<script setup lang="ts">
import PublicState from '@/components/design/PublicState.vue'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <PublicState
    code="401"
    icon="lock"
    :title="t('You are not authorized')"
    :description="t('You don\'t have permission to access this page.')"
  />
</template>

<route lang="yaml">
meta:
  layout: blank
  action: read
  subject: Auth
</route>
