<script setup lang="ts">
import { useTheme } from 'vuetify'
import { storeToRefs } from 'pinia'
import AnomalyBell from '@/components/design/AnomalyBell.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import ProfileMenu from '@/components/design/ProfileMenu.vue'
import SettingsMenu from '@/components/design/SettingsMenu.vue'
import NavBarI18n from '@/layouts/components/NavBarI18n.vue'
import { useAlphaTheme } from '@/composables/useAlphaTheme'
import { routeLabelForPath } from '@/navigation/routeLabels'
import { useAIAssistantStore } from '@/stores/aiAssistant'
import { useUserAccess } from '@/composables/useUserAccess'

/* ============================================================
   Alpha POS — Design Topbar (v3, decision #5)
   - DateRange hard-locked off (showDate = false)
   - SettingsMenu rendered between (where) DateRange (would be)
     and the theme toggle iconbtn
   - Global language switcher
   - Account menu keeps the compact initials avatar and exposes logout.
   ============================================================ */

withDefaults(
  defineProps<{ dateRange?: string }>(),
  { dateRange: '14d' },
)

defineEmits<{
  (e: 'toggleSidebar'): void
  (e: 'update:dateRange', value: string): void
}>()

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n({ useScope: 'global' })
const { isWarehouse, hasPermission } = useUserAccess()
const showAiTools = computed(() => !isWarehouse.value || hasPermission('reports.view'))
const showSettings = computed(() => !isWarehouse.value)

/* ---------- AI thinking pill (cross-page indicator) ---------- */
const aiStore = useAIAssistantStore()
const { generating: aiGenerating } = storeToRefs(aiStore)
const showAiPill = computed(() => !!aiGenerating.value && !route.path.startsWith('/ai-assistant'))
function goAi() {
  router.push('/ai-assistant')
}

/* ---------- Breadcrumb and browser-title label ---------- */
const currentNavLabel = computed(() => routeLabelForPath(route.path))

watch([currentNavLabel, locale], ([routeLabel]) => {
  const appName = t('Alpha POS')
  const pageName = routeLabel ? t(routeLabel) : ''

  document.title = pageName ? `${pageName} · ${appName}` : appName
}, { immediate: true })

/* ---------- showDate hard-locked off (decision #5 v3) ---------- */
const showDate = computed(() => false)

/* ---------- Theme (mirrors source onToggleTheme) ---------- */
const vuetifyTheme = useTheme()
const { theme, toggleTheme } = useAlphaTheme(vuetifyTheme)
</script>

<template>
  <header class="topbar">
    <button
      class="iconbtn"
      :title="t('Toggle sidebar')"
      @click="$emit('toggleSidebar')"
    >
      <DesignIcon
        name="layout"
        :size="18"
      />
    </button>

    <div class="topbar__crumbs">
      <span>{{ t('Alpha POS') }}</span>
      <DesignIcon
        name="chevright"
        :size="14"
      />
      <b>{{ currentNavLabel ? t(currentNavLabel) : '' }}</b>
    </div>

    <div class="topbar__spacer" />

    <!-- AI thinking pill (shown when generation is running on another page) -->
    <button
      v-if="showAiPill && showAiTools"
      class="ai-pill"
      :title="t('AI is generating a reply — click to view')"
      @click="goAi"
    >
      <span class="typing"><span /><span /><span /></span>
      {{ t('AI is thinking…') }}
    </button>

    <!-- DateRange would render here when showDate === true (currently hard-locked off) -->
    <template v-if="showDate" />

    <!-- Anomaly bell — polls /ai/anomalies, opens dropdown w/ ack buttons. -->
    <AnomalyBell v-if="showAiTools" />

    <!-- Settings menu (gear popover) — decision #5 v3 -->
    <SettingsMenu v-if="showSettings" />

    <NavBarI18n />

    <!-- Theme toggle (sun when dark, moon when light) -->
    <button
      class="iconbtn"
      :title="t('Toggle theme')"
      @click="toggleTheme"
    >
      <DesignIcon
        :name="theme === 'dark' ? 'sun' : 'moon'"
        :size="18"
      />
    </button>

    <!-- Compact account menu -->
    <ProfileMenu />
  </header>
</template>
