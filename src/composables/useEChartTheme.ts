/* ============================================================
   ECharts theming from the app's CSS tokens. Resolves the design
   variables to concrete values ECharts needs (it can't read CSS vars),
   and re-reads them when the light/dark theme flips.
   ============================================================ */
import { onBeforeUnmount, onMounted, ref } from 'vue'

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined')
    return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export interface EChartTokens {
  periodA: string
  periodB: string
  positive: string
  negative: string
  expense: string
  primary: string
  secondary: string
  text: string
  textSecondary: string
  textTertiary: string
  surface: string
  surface2: string
  border: string
  grid: string
  axis: string
  track: string
  fontUI: string
  fontMono: string
}

function read(): EChartTokens {
  return {
    periodA: readVar('--color-period-a', '#3A5BDB'),
    periodB: readVar('--color-period-b', '#9AA3B2'),
    positive: readVar('--color-positive', '#15935A'),
    negative: readVar('--color-negative', '#C8372A'),
    expense: readVar('--c3', '#A2683C'),
    primary: readVar('--primary', '#3A5BDB'),
    secondary: readVar('--c4', '#A56CE8'),
    text: readVar('--text', '#0F1722'),
    textSecondary: readVar('--text-secondary', '#586172'),
    textTertiary: readVar('--text-tertiary', '#8A929E'),
    surface: readVar('--surface', '#FFFFFF'),
    surface2: readVar('--surface-2', '#F8FAFB'),
    border: readVar('--border', '#E4E7EC'),
    grid: readVar('--chart-grid', '#EAEDF1'),
    axis: readVar('--chart-axis', '#9AA2AE'),
    track: readVar('--chart-track', '#EEF1F5'),
    fontUI: readVar('--font-sans', '\'Hanken Grotesk\', sans-serif'),
    fontMono: readVar('--font-mono', '\'JetBrains Mono\', monospace'),
  }
}

export function useEChartTheme() {
  const tokens = ref<EChartTokens>(read())
  let mo: MutationObserver | null = null

  onMounted(() => {
    // Re-read when the theme toggle stamps class / data-theme on <html>.
    mo = new MutationObserver(() => { tokens.value = read() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-palette'] })
  })
  onBeforeUnmount(() => { mo?.disconnect() })

  // ---- shared option pieces so every chart looks the same ----
  const baseGrid = () => ({ left: 6, right: 14, top: 26, bottom: 6, containLabel: true })

  const axisLabel = () => ({ color: tokens.value.textTertiary, fontFamily: tokens.value.fontMono, fontSize: 11 })
  const axisLine = () => ({ lineStyle: { color: tokens.value.border } })
  const splitLine = () => ({ lineStyle: { color: tokens.value.grid, type: 'dashed' as const } })

  const tooltip = (extra: Record<string, unknown> = {}) => ({
    backgroundColor: tokens.value.surface,
    borderColor: tokens.value.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: tokens.value.text, fontFamily: tokens.value.fontUI, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 24px rgba(16,24,40,.16); border-radius: 10px;',
    ...extra,
  })

  const legend = () => ({
    top: 0,
    right: 0,
    icon: 'roundRect' as const,
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { color: tokens.value.textSecondary, fontFamily: tokens.value.fontUI, fontSize: 12 },
  })

  return { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend }
}
