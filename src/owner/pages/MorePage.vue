<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import { unregisterDevice } from '../services/mobileApi'
import { currentUser, signOut } from '../services/session'
import { ownerState } from '../state'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Button from '@/components/design/Button.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()

const user = computed(() => currentUser())
const name = computed(() => [user.value?.first_name, user.value?.last_name].filter(Boolean).join(' ') || user.value?.email || '')
const leaving = ref(false)

const links = computed(() => [
  { to: '/more/salaries', icon: 'users', label: t('owner_app_salaries') },
  { to: '/more/settings', icon: 'settings', label: t('owner_app_settings') },
])

async function logout() {
  if (leaving.value)
    return
  leaving.value = true

  // Stop pushes to this phone before the session ends.
  if (ownerState.pushToken)
    await unregisterDevice(ownerState.pushToken).catch(() => undefined)
  ownerState.device = null
  await signOut()
  leaving.value = false
  await router.replace('/login')
}
</script>

<template>
  <OwnerPage :title="t('owner_app_tab_more')">
    <div class="owner-more__who">
      <span class="owner-more__avatar">{{ name.slice(0, 1).toUpperCase() }}</span>
      <div class="owner-row__main">
        <strong class="owner-row__title">{{ name }}</strong>
        <span class="owner-row__sub">{{ user?.email }}</span>
      </div>
    </div>

    <ul class="owner-list">
      <li
        v-for="link in links"
        :key="link.to"
      >
        <RouterLink
          :to="link.to"
          class="owner-row"
        >
          <DesignIcon
            :name="link.icon"
            :size="20"
          />
          <span class="owner-row__main owner-row__title">{{ link.label }}</span>
          <DesignIcon
            name="chevright"
            :size="18"
            class="owner-more__chev"
          />
        </RouterLink>
      </li>
    </ul>

    <Button
      variant="danger-soft"
      size="lg"
      icon="logout"
      class="owner-more__logout"
      :loading="leaving"
      @click="logout"
    >
      {{ t('owner_app_sign_out') }}
    </Button>
  </OwnerPage>
</template>

<style scoped>
.owner-more__who { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.owner-more__avatar {
  display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%;
  background: var(--primary); color: var(--on-primary, #fff); font-size: 20px; font-weight: 700;
}
.owner-more__chev { color: var(--text-secondary); }
.owner-more__logout { width: 100%; justify-content: center; min-height: 50px; margin-top: 24px; }
</style>
