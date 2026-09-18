<script setup lang="ts">
import { unlockWithBiometry } from '../services/native'
import { ownerState } from '../state'
import OwnerLogo from './OwnerLogo.vue'
import Button from '@/components/design/Button.vue'

const { t } = useI18n({ useScope: 'global' })
const busy = ref(false)

async function unlock() {
  busy.value = true

  const ok = await unlockWithBiometry(t('owner_app_unlock_reason'), t('Cancel'))

  busy.value = false
  if (ok)
    ownerState.locked = false
}

onMounted(unlock)
</script>

<template>
  <div
    class="owner-lock"
    role="dialog"
    aria-modal="true"
    :aria-label="t('owner_app_locked')"
  >
    <OwnerLogo :size="72" />
    <p class="owner-lock__title">
      {{ t('owner_app_locked') }}
    </p>
    <Button
      variant="primary"
      icon="lock"
      :loading="busy"
      @click="unlock"
    >
      {{ t('owner_app_unlock') }}
    </Button>
  </div>
</template>

<style scoped>
.owner-lock {
  position: fixed; inset: 0; z-index: 100;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: 24px; background: var(--bg);
}
.owner-lock__title { margin: 0; font-size: 17px; font-weight: 600; color: var(--text); }
</style>
