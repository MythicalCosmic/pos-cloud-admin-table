<script setup lang="ts">
import IconAction from '@/components/design/IconAction.vue'

defineProps<{ order: { status: string; is_paid: boolean }; busy?: boolean }>()
defineEmits<{ (event: 'ready' | 'pay' | 'reverse' | 'cancel'): void }>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="order-actions">
    <IconAction
      v-if="order.status === 'OPEN' || order.status === 'PREPARING'"
      icon="check"
      tone="warning"
      :title="t('Mark ready')"
      :disabled="busy"
      @click="$emit('ready')"
    />
    <IconAction
      v-if="!order.is_paid && order.status !== 'CANCELED'"
      icon="dollar"
      tone="success"
      :title="t('Pay')"
      :disabled="busy"
      @click="$emit('pay')"
    />
    <IconAction
      v-if="order.is_paid && order.status !== 'CANCELED'"
      icon="refresh"
      tone="primary"
      :title="t('Reverse payment')"
      :disabled="busy"
      @click="$emit('reverse')"
    />
    <IconAction
      v-if="order.status !== 'CANCELED' && order.status !== 'COMPLETED'"
      icon="close"
      tone="danger"
      :title="t('Cancel')"
      :disabled="busy"
      @click="$emit('cancel')"
    />
  </div>
</template>

<style scoped>
.order-actions { display: flex; align-items: center; gap: 5px; }
</style>
