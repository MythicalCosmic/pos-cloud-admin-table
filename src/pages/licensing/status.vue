<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import StateFill from '@/components/design/StateFill.vue'
import { licensingApi } from '@/plugins/axios'
import '@styles/pages/licensing.css'

const { t, te } = useI18n({ useScope: 'global' })
const { formatDate } = useFormatters()
const state = ref<any>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await licensingApi.get('/status')

    state.value = res.data?.data ?? res.data
    if (!state.value?.status)
      throw new Error('Missing license status')
  }
  catch (e: any) {
    error.value = e?.response?.data?.message ?? t('Could not reach licensing server')
  }
  finally {
    loading.value = false
  }
}

const descriptions: Record<string, string> = {
  ACTIVE: 'license_active_detail',
  UNREGISTERED: 'license_unregistered_detail',
  SUSPENDED: 'License has been suspended by the vendor. Contact your POS vendor to restore service.',
  EXPIRED: 'Subscription has expired. Contact your POS vendor to renew.',
  GRACE: 'license_grace_detail',
}

const details = computed(() => [
  { label: 'Organization', value: state.value?.tenant?.org_name, icon: 'store' },
  { label: 'Contact email', value: state.value?.tenant?.email, icon: 'mail' },
  { label: 'Expires at', value: state.value?.expires_at ? formatDate(state.value.expires_at) : null, icon: 'calendar' },
  { label: 'Last heartbeat', value: state.value?.last_heartbeat_at ? formatDate(state.value.last_heartbeat_at) : null, icon: 'refresh' },
  ...(state.value?.grace_until ? [{ label: 'Grace until', value: formatDate(state.value.grace_until), icon: 'clock' }] : []),
  ...(state.value?.reason ? [{ label: 'Reason', value: state.value.reason, icon: 'alert' }] : []),
])

const statusLabel = computed(() => te(`license_status_${state.value?.status}`) ? t(`license_status_${state.value.status}`) : state.value?.status)

onMounted(load)
</script>

<template>
  <WorkspacePage class="page license-status">
    <PageHeader
      :title="t('License Status')"
      :subtitle="t('license_status_subtitle')"
    >
      <template #actions>
        <Button
          variant="secondary"
          icon="refresh"
          :loading="loading"
          @click="load"
        >
          {{ t('Refresh') }}
        </Button>
      </template>
    </PageHeader>
    <div
      v-if="loading"
      class="card license-skeleton"
      role="status"
      :aria-label="t('Loading')"
    >
      <span class="sk-box" /><span class="sk-box" /><span class="sk-box" />
    </div>
    <StateFill
      v-else-if="error"
      class="card"
      error
      icon="alert"
      :title="error"
    >
      <template #action>
        <Button
          variant="secondary"
          icon="refresh"
          @click="load"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>
    <template v-else-if="state">
      <section
        class="license-status__hero"
        :class="{ 'is-blocked': state.is_blocked }"
      >
        <div class="license-emblem">
          <DesignIcon
            :name="state.is_blocked ? 'lock' : 'shield'"
            :size="32"
          />
        </div>
        <div><h2>{{ statusLabel }}</h2><p>{{ t(descriptions[state.status] || 'Unknown license state.') }}</p></div>
        <span
          v-if="state.is_blocked"
          class="license-status__blocked"
        >{{ t('Kill switch active') }}</span>
        <RouterLink
          v-if="state.status === 'UNREGISTERED'"
          class="btn btn--primary"
          to="/licensing/setup"
        >
          <DesignIcon
            name="key"
            :size="18"
          />{{ t('Run setup') }}
        </RouterLink>
      </section>
      <dl class="license-status__details">
        <div
          v-for="detail in details"
          :key="detail.label"
        >
          <dt>
            <DesignIcon
              :name="detail.icon"
              :size="18"
            />{{ t(detail.label) }}
          </dt><dd>{{ detail.value || '—' }}</dd>
        </div>
      </dl>
      <div
        v-if="state.message"
        class="license-note"
        role="status"
      >
        <DesignIcon
          name="info"
          :size="20"
        /><p>{{ state.message }}</p>
      </div>
    </template>
  </WorkspacePage>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
