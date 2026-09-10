import { defineStore } from 'pinia'
import axios from '@/plugins/axios'

export interface NavCounts {
  shifts: number | null
  orders: number | null
  todayRevenue: number | null
  revenueSeries: number[]
}

/**
 * Synthesised flat-ish 12-point fallback when BE doesn't expose hourly_revenue.
 * NOT random — deterministic so the sparkline doesn't twitch between polls.
 * Scaled to whatever todayRevenue we have so the curve sits at a realistic level.
 */
function synthSeries(total: number | null): number[] {
  const base = (total ?? 0) / 12
  if (!base || !Number.isFinite(base) || base <= 0)
    return [8, 9, 8.5, 10, 9.5, 11, 10.5, 12, 11.5, 13, 12.5, 14]
  // gentle ascending curve (~0.85x → ~1.15x of mean) — no Math.random
  const shape = [0.85, 0.9, 0.88, 0.95, 0.93, 1.0, 0.98, 1.05, 1.02, 1.1, 1.08, 1.15]
  return shape.map(k => base * k)
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export const useNavCountsStore = defineStore('navCounts', () => {
  const counts = ref<NavCounts>({ shifts: null, orders: null, todayRevenue: null, revenueSeries: [] })
  const refreshing = ref(false)
  let timer: number | null = null

  async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    try {
      // Single-call sidebar counters — BE shape: { success, data: { active_shifts, today_orders, today_revenue } }
      // Replaces the previous two polls (/shifts/active + /orders/stats).
      const res = await axios.get('/sidebar-counts')
      const d = res?.data?.data ?? res?.data ?? {}

      const shifts = toNum(d.active_shifts)
      counts.value.shifts = shifts ?? 0

      const orders = toNum(d.today_orders)
      counts.value.orders = orders ?? 0

      // BE returns today_revenue as an integer-so'm string (e.g. "150000").
      const todayRev = toNum(d.today_revenue)
      counts.value.todayRevenue = todayRev

      // BE may later expose hourly_revenue / revenue_series / series — honour it if
      // present, else synth a deterministic curve scaled to todayRevenue.
      const series = d.hourly_revenue ?? d.revenue_series ?? d.series
      if (Array.isArray(series) && series.length >= 2) {
        counts.value.revenueSeries = series
          .map((v: any) => Number(v))
          .filter((v: number) => Number.isFinite(v))
      }
      else {
        counts.value.revenueSeries = synthSeries(todayRev)
      }
    }
    catch {
      // Fail-soft: leave previous values in place so the sidebar doesn't flicker.
    }
    finally {
      refreshing.value = false
    }
  }

  function start() {
    refresh()
    if (timer !== null) return
    timer = window.setInterval(refresh, 90_000)
    document.addEventListener('visibilitychange', onVis)
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    document.removeEventListener('visibilitychange', onVis)
  }

  function onVis() {
    if (!document.hidden) refresh()
  }

  return { counts, refreshing, refresh, start, stop }
})
