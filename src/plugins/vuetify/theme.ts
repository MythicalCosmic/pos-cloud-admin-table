import type { VuetifyOptions } from 'vuetify'
import { resolveVuetifyTheme } from '@core/utils/vuetify'
import { alphaPaletteTokens, isAlphaPalette } from '@/config/palettes'
import type { AlphaPalette, AlphaTheme } from '@/config/palettes'

// Retained framework aliases use the same colors as the active Alpha palette.
const legacyGreys = {
  light: {
    'grey-50': '#FAFAFA',
    'grey-100': '#EBEEF0',
    'grey-200': '#EEEEEE',
    'grey-300': '#E0E0E0',
    'grey-400': '#BDBDBD',
    'grey-500': '#9E9E9E',
    'grey-600': '#757575',
    'grey-700': '#616161',
    'grey-800': '#424242',
    'grey-900': '#212121',
  },
  dark: {
    'grey-50': '#2A2E42',
    'grey-100': '#444463',
    'grey-200': '#4A5072',
    'grey-300': '#5E6692',
    'grey-400': '#7983BB',
    'grey-500': '#8692D0',
    'grey-600': '#AAB3DE',
    'grey-700': '#B6BEE3',
    'grey-800': '#CFD3EC',
    'grey-900': '#E7E9F6',
  },
}

const legacyVariables = {
  light: {
  // Sneat-era misc (kept until shell restyle replaces them)
    'code-color': '#d400ff',
    'overlay-scrim-background': '#0F1722',
    'overlay-scrim-opacity': 0.42,
    'border-color': '#E4E7EC',
    'snackbar-background': '#0F1722',
    'snackbar-color': '#FFFFFF',
    'tooltip-background': '#0F1722',
    'tooltip-opacity': 0.95,

    'shadow-key-umbra-opacity': 'rgba(16, 24, 40, 0.07)',
    'shadow-key-penumbra-opacity': 'rgba(16, 24, 40, 0.05)',
    'shadow-key-ambient-opacity': 'rgba(16, 24, 40, 0.04)',
  },
  dark: {
    'code-color': '#d400ff',
    'overlay-scrim-background': '#03060C',
    'overlay-scrim-opacity': 0.6,
    'border-color': '#262E3B',
    'snackbar-background': '#E8EBF1',
    'snackbar-color': '#233728',
    'tooltip-background': '#1E2B22',
    'tooltip-opacity': 0.95,

    'shadow-key-umbra-opacity': 'rgba(0, 0, 0, 0.5)',
    'shadow-key-penumbra-opacity': 'rgba(0, 0, 0, 0.4)',
    'shadow-key-ambient-opacity': 'rgba(0, 0, 0, 0.4)',
  },
}

export function alphaThemeColors(palette: AlphaPalette, mode: AlphaTheme): Record<string, string> {
  const tokens = alphaPaletteTokens(palette, mode)
  const colors = Object.fromEntries(Object.entries(tokens).filter(([, value]) => /^#[a-f\d]{3,6}$/i.test(value)))
  return {
    ...legacyGreys[mode],
    ...colors,
    'background': tokens.bg,
    'on-background': tokens.text,
    'on-surface': tokens.text,
    'secondary': tokens['text-secondary'],
    'on-secondary': mode === 'light' ? '#FFFFFF' : tokens.bg,
    'on-success': mode === 'light' ? '#FFFFFF' : tokens.bg,
    'on-error': mode === 'light' ? '#FFFFFF' : tokens.bg,
    'on-info': mode === 'light' ? '#FFFFFF' : tokens.bg,
    'on-warning': mode === 'light' ? '#FFFFFF' : tokens.bg,
    'perfect-scrollbar-thumb': tokens['border-strong'],
    'skin-bordered-background': tokens.bg,
    'skin-bordered-surface': tokens.surface,
    'skin-default-background': tokens.bg,
    'skin-default-surface': tokens.surface,
  }
}

let initialPalette: AlphaPalette = 'blue'
try {
  const stored = localStorage.getItem('alphapos-palette')
  if (isAlphaPalette(stored))
    initialPalette = stored
}
catch { /* storage may be blocked */ }

const theme: VuetifyOptions['theme'] = {
  defaultTheme: resolveVuetifyTheme(),
  themes: Object.fromEntries((['light', 'dark'] as const).map(mode => [mode, {
    dark: mode === 'dark',
    colors: alphaThemeColors(initialPalette, mode),
    variables: legacyVariables[mode],
  }])),
}

export default theme
