<script setup lang="ts">
import BrandMark from './BrandMark.vue'
import DesignIcon from './DesignIcon.vue'

defineProps<{ code: string; title: string; description: string; icon: string }>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <main class="public-state">
    <div class="public-state__brand">
      <BrandMark :size="32" /><span>Alpha POS</span>
    </div>
    <div class="public-state__body">
      <div class="public-state__symbol">
        <DesignIcon
          :name="icon"
          :size="32"
        /><span>{{ code }}</span>
      </div>
      <h1>{{ title }}</h1><p>{{ description }}</p>
      <RouterLink
        to="/"
        class="btn btn--primary"
      >
        <DesignIcon
          name="arrowleft"
          :size="18"
        />{{ t('Back to Home') }}
      </RouterLink>
    </div>
    <div
      class="public-state__decoration"
      aria-hidden="true"
    >
      <span /><span /><span />
    </div>
  </main>
</template>

<style scoped>
.public-state { display: flex; min-block-size: 100dvh; flex-direction: column; padding: 36px; background: var(--bg); color: var(--text); position: relative; overflow: hidden; }
.public-state__brand { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
.public-state__body { position: relative; z-index: 1; display: flex; align-items: flex-start; flex-direction: column; justify-content: center; flex: 1; inline-size: min(640px, 100%); margin-inline: auto; padding-block: 64px; }
.public-state__symbol { display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-block-end: 28px; border: 1px solid var(--primary-border); border-radius: 18px; background: var(--primary-weak); color: var(--primary); }
.public-state__symbol span { font-family: var(--font-mono); font-size: 18px; }
.public-state h1 { font-size: clamp(34px, 5vw, 62px); line-height: 1.08; letter-spacing: -.045em; text-wrap: balance; }
.public-state p { max-inline-size: 430px; margin-block: 20px 30px; font-size: 16px; line-height: 1.6; color: var(--text-secondary); }
.public-state__decoration { position: absolute; inset-inline-end: -150px; inset-block-end: -200px; display: grid; place-items: center; inline-size: 650px; block-size: 650px; opacity: .55; pointer-events: none; }
.public-state__decoration span { position: absolute; inline-size: 100%; block-size: 100%; border: 1px solid var(--border); border-radius: 50%; }
.public-state__decoration span:nth-child(2) { inline-size: 80%; block-size: 80%; }
.public-state__decoration span:nth-child(3) { inline-size: 60%; block-size: 60%; background: var(--surface-2); }
@media (width <= 600px) { .public-state { padding: 24px; } .public-state p { font-size: 14px; } }
</style>
