/**
 * Shared chart tooltip composable.
 * Port of useTip() in .tmp-handoff-v3/pos-admin-panel/project/app/charts2.jsx (lines 12-18).
 *
 * Returns a reactive tip state and {show, move, hide} handlers — wired into the
 * shared `<ChartTip>` component (see ./ChartTip.vue) which is keyed by
 * `tip.show + tip.x/y` and renders `{title, rows}` inside a fixed-position div.
 */
export interface TipRow {
  color?: string
  label: string
  value: string
}

export interface TipState {
  show: boolean
  x: number
  y: number
  title: string
  rows: TipRow[]
}

export function useTip() {
  const tip = ref<TipState>({ show: false, x: 0, y: 0, title: '', rows: [] })

  function show(e: MouseEvent, title: string, rows: TipRow[]) {
    tip.value = { show: true, x: e.clientX, y: e.clientY, title, rows }
  }
  function move(e: MouseEvent) {
    if (tip.value.show)
      tip.value = { ...tip.value, x: e.clientX, y: e.clientY }
  }
  function hide() {
    tip.value = { ...tip.value, show: false }
  }

  return { tip, show, move, hide }
}
