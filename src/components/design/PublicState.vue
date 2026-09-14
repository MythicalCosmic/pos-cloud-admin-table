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
  </main>
</template>

<style scoped>
.public-state { display: flex; flex-direction: column; min-block-size: 100dvh; padding: 32px; background: var(--bg); color: var(--text); }
.public-state__brand { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; }
.public-state__body { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; inline-size: min(620px, 100%); margin: auto; padding-block: 60px; }
.public-state__symbol { display: flex; align-items: center; gap: 20px; color: var(--primary); margin-block-end: 28px; }
.public-state__symbol .ic { inline-size: 32px; block-size: 32px; }
.public-state__symbol span { font-size: 80px; font-weight: 550; line-height: 1; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.public-state h1 { margin: 0; font-size: 34px; font-weight: 600; line-height: 1.2; letter-spacing: -.03em; text-wrap: balance; }
.public-state p { max-inline-size: 48ch; margin-block: 18px 30px; font-size: 15px; line-height: 1.7; color: var(--text-secondary); }
.public-state .btn { min-block-size: 44px; }
@media (width <= 600px) { .public-state { padding: 24px; } .public-state h1 { font-size: 27px; } .public-state p { font-size: 14px; } .public-state__symbol span { font-size: 64px; } }
</style>
