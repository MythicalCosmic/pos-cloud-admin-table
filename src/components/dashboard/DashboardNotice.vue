<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { useApiError } from '@/composables/useApiError'

defineProps<{ error?: unknown; loading?: boolean; stale?: boolean; partial?: boolean; empty?: string }>()
defineEmits<{ (event: 'retry'): void }>()

const { t } = useI18n()
const { translate } = useApiError()
</script>

<template>
  <div
    class="dashboard-notice"
    :class="{ 'is-error': error, 'is-stale': stale }"
    :role="error ? 'alert' : 'status'"
  >
    <span class="dashboard-notice__icon"><DesignIcon
      :name="error ? 'alert' : 'bars'"
      :size="22"
    /></span>
    <div>
      <strong>{{ error ? t(partial ? 'dash_partial_refresh' : 'dash_section_unavailable') : empty || t('No data for this range') }}</strong>
      <p>{{ error ? partial ? t('dash_partial_refresh_body') : stale ? t('Showing the last values we had. Check your connection and try again.') : translate(error) : t('Try a different date range.') }}</p>
    </div>
    <Button
      v-if="error"
      variant="secondary"
      icon="retry"
      :loading="loading"
      @click="$emit('retry')"
    >
      {{ t('Retry') }}
    </Button>
  </div>
</template>
