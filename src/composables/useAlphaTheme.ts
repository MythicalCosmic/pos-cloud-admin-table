import { computed, onScopeDispose, ref, watch } from 'vue'
import { alphaThemeColors } from '@/plugins/vuetify/theme'
import { isAlphaPalette } from '@/config/palettes'
import type { AlphaPalette, AlphaTheme } from '@/config/palettes'

export type { AlphaPalette, AlphaTheme } from '@/config/palettes'

interface VuetifyThemeController {
  themes: { value: Record<string, { colors: Record<string, string> }> }
  global: {
    name: { value: string }
    current: { value: { dark: boolean } }
  }
}

const sharedTheme = ref<AlphaTheme>('light')
const sharedPalette = ref<AlphaPalette>('blue')
let resolved = false

function storedTheme(): AlphaTheme | null {
  if (typeof window === 'undefined')
    return null

  try {
    const stored = localStorage.getItem('alphapos-theme')

    if (stored === 'light' || stored === 'dark')
      return stored
  }
  catch { /* storage may be blocked */ }
  const attr = document.documentElement.getAttribute('data-theme')

  return (attr === 'light' || attr === 'dark') ? attr : null
}

function syncAppearance(controller: VuetifyThemeController, value: AlphaTheme, palette: AlphaPalette) {
  for (const mode of ['light', 'dark'] as const)
    Object.assign(controller.themes.value[mode].colors, alphaThemeColors(palette, mode))
  controller.global.name.value = value

  if (typeof window === 'undefined')
    return

  document.documentElement.setAttribute('data-theme', value)
  document.documentElement.setAttribute('data-palette', palette)
  document.documentElement.style.colorScheme = value

  const chromeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (chromeColor)
    chromeColor.content = controller.themes.value[value].colors.background
  try {
    localStorage.setItem('alphapos-theme', value)
    localStorage.setItem('alphapos-palette', palette)
  }
  catch { /* storage may be blocked */ }
}

/** Keep raw CSS tokens, Vuetify, and persistence on one shared theme value. */
export function useAlphaTheme(controller: VuetifyThemeController) {
  if (!resolved) {
    sharedTheme.value = storedTheme() ?? (controller.global.current.value.dark ? 'dark' : 'light')

    const initialPalette = document.documentElement.getAttribute('data-palette')

    sharedPalette.value = isAlphaPalette(initialPalette) ? initialPalette : 'blue'
    resolved = true
  }

  const stop = watch([sharedTheme, sharedPalette], ([value, palette]) => syncAppearance(controller, value, palette), { immediate: true })

  onScopeDispose(stop)

  function setTheme(value: AlphaTheme) {
    sharedTheme.value = value
  }

  function toggleTheme() {
    setTheme(sharedTheme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme: computed(() => sharedTheme.value),
    palette: computed(() => sharedPalette.value),
    setPalette: (value: AlphaPalette) => { sharedPalette.value = value },
    setTheme,
    toggleTheme,
  }
}
