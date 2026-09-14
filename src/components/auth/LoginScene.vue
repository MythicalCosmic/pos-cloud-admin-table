<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'

defineProps<{ paused: boolean }>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div
    class="login-scene"
    :class="{ 'is-paused': paused }"
    aria-hidden="true"
  >
    <div class="login-scene__hub">
      <DesignIcon
        name="ws-menu"
        :size="32"
        :weight="1.5"
      /><span>Alpha POS</span>
    </div>
    <div class="login-scene__stations">
      <div>
        <DesignIcon
          name="receipt"
          :size="22"
        /><span>{{ t('login_scene_orders') }}</span>
      </div>
      <div>
        <DesignIcon
          name="ws-team"
          :size="22"
        /><span>{{ t('login_scene_team') }}</span>
      </div>
      <div>
        <DesignIcon
          name="ws-analytics"
          :size="22"
        /><span>{{ t('login_scene_overview') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-scene { display: grid; grid-template-columns: 1fr; justify-items: start; align-content: center; gap: 0; flex: 1; inline-size: 100%; max-inline-size: 440px; min-block-size: 280px; margin-block: 20px; }
.login-scene__hub { display: flex; align-items: center; gap: 16px; padding: 20px 24px; border: 1px solid var(--primary-border); border-radius: 14px; background: var(--primary-weak); color: var(--primary); animation: station-breathe 6s ease-in-out infinite; }
.login-scene__hub span { font-size: 22px; font-weight: 600; letter-spacing: -.03em; }
.login-scene__stations { display: grid; gap: 10px; inline-size: 100%; padding: 22px 0 0 34px; }
.login-scene__stations > div { position: relative; display: flex; align-items: center; gap: 13px; min-block-size: 54px; padding: 13px 18px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 13px; }
.login-scene__stations > div::before { position: absolute; content: ''; inline-size: 20px; block-size: 42px; inset-inline-start: -20px; inset-block-end: 50%; border-inline-start: 1px solid var(--primary-border); border-block-end: 1px solid var(--primary-border); border-end-start-radius: 8px; }
.login-scene__stations .ic { color: var(--primary); }
.is-paused .login-scene__hub { animation-play-state: paused; }
@keyframes station-breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .login-scene__hub { animation: none; } }
</style>
