<script setup lang="ts">
import { useTheme } from 'vuetify'
import Modal from './Modal.vue'
import DesignIcon from './DesignIcon.vue'
import { useAlphaTheme } from '@/composables/useAlphaTheme'
import { alphaPaletteIds, alphaPaletteTokens } from '@/config/palettes'
import type { AlphaPalette } from '@/config/palettes'

defineProps<{ open: boolean }>()
defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { t } = useI18n({ useScope: 'global' })
const { theme, palette, setTheme, setPalette } = useAlphaTheme(useTheme())

function previewStyle(option: AlphaPalette) {
  const tokens = alphaPaletteTokens(option, theme.value)

  return Object.fromEntries(['bg', 'surface', 'primary', 'primary-weak', 'on-primary'].map(key => [`--${key}`, tokens[key]]))
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('appearance_title')"
    :width="600"
    @update:open="$emit('update:open', $event)"
  >
    <div class="appearance">
      <p>{{ t('appearance_hint') }}</p>
      <div
        class="appearance__modes"
        role="group"
        :aria-label="t('appearance_mode')"
      >
        <button
          v-for="mode in (['light', 'dark'] as const)"
          :key="mode"
          type="button"
          :aria-pressed="theme === mode"
          @click="setTheme(mode)"
        >
          <DesignIcon
            :name="mode === 'light' ? 'sun' : 'moon'"
            :size="18"
          />{{ t(`appearance_${mode}`) }}
        </button>
      </div>
      <div
        class="appearance__palettes"
        role="group"
        :aria-label="t('appearance_palette')"
      >
        <button
          v-for="option in alphaPaletteIds"
          :key="option"
          type="button"
          class="appearance__choice"
          :aria-pressed="palette === option"
          @click="setPalette(option)"
        >
          <span
            class="appearance__preview"
            :data-palette="option"
            :data-theme="theme"
            :style="previewStyle(option)"
            aria-hidden="true"
          >
            <span class="appearance__sidebar"><i /><i /><i /></span>
            <span class="appearance__canvas"><i /><span><i /><i /></span><svg
              viewBox="0 0 120 36"
              fill="none"
            ><path
              d="M0 31 14 24 28 27 43 12 59 20 76 7 91 14 120 2"
              stroke="currentColor"
              stroke-width="3"
            /></svg></span>
            <DesignIcon
              class="appearance__check"
              name="check"
              :size="20"
              :style="{ opacity: palette === option ? 1 : 0 }"
            />
          </span>
          <span class="appearance__label">{{ t(`appearance_${option}`) }}</span>
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.appearance { display: grid; gap: 20px; padding: 4px 0 0; }
.appearance > p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.appearance__palettes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.appearance__choice { min-width: 0; padding: 6px; border: 1px solid var(--border); border-radius: 13px; text-align: left; background: var(--surface); transition: border-color 150ms, background 150ms; }
.appearance__choice[aria-pressed="true"] { border-color: var(--primary); background: var(--primary-weak); }
.appearance__preview { position: relative; display: flex; height: 84px; padding: 9px; gap: 8px; border-radius: 7px; background: var(--bg); color: var(--primary); overflow: hidden; }
.appearance__check { position: absolute; top: 6px; right: 6px; padding: 3px; border-radius: var(--r-pill); background: var(--primary); color: var(--on-primary); }
.appearance__sidebar { display: grid; align-content: start; gap: 7px; width: 21%; padding: 8px 4px; border-radius: 3px; background: var(--surface); }
.appearance__sidebar i { height: 3px; background: var(--primary-weak); border-radius: 2px; }
.appearance__sidebar i:first-child { background: var(--primary); }
.appearance__canvas { display: grid; flex: 1; min-width: 0; gap: 8px; }
.appearance__canvas > i { width: 50%; height: 4px; background: var(--primary); border-radius: 2px; }
.appearance__canvas > span { display: flex; gap: 5px; }
.appearance__canvas > span > i { flex: 1; height: 18px; background: var(--surface); border-radius: 3px; }
.appearance__canvas > svg { width: 100%; height: 36px; }
.appearance__label { display: grid; align-content: center; min-height: 44px; padding: 4px 6px; font-size: 13px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.appearance__modes { display: flex; padding: 4px; gap: 4px; border-radius: 12px; background: var(--surface-inset); }
.appearance__modes button { display: flex; align-items: center; justify-content: center; flex: 1; gap: 8px; min-height: 44px; border-radius: 8px; color: var(--text-secondary); font-size: 13px; }
.appearance__modes button[aria-pressed="true"] { background: var(--surface); box-shadow: var(--shadow-xs); color: var(--text); }
.appearance button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .appearance__choice { transition: none; } }
@media (max-width: 520px) {
  .appearance { padding-inline: 0; gap: 14px; }
  .appearance__palettes { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .appearance__preview { height: 70px; }
}
</style>
