/* ============================================================
   ALPHA POS — motion composables (Vue port of
   .tmp-alpha-design/alpha-design-source/motion.js)

   Robustness: uses setTimeout (fires in hidden/background tabs)
   rather than requestAnimationFrame (paused when hidden) to arm
   and trigger transition-based reveals, so content is never
   stranded invisible.

   Resting state (no `html.anim`) is fully visible. Adding `.anim`
   arms the hidden state; `.anim.rin` reveals it via the CSS
   transitions declared in alpha-design-system.css. Transitions
   (NOT keyframes) resolve to their END state even in hidden tabs.
   ============================================================ */
import type { Ref } from 'vue'

// Cache the reduce-motion match so multiple components don't each query it.
let _reducedCached: boolean | null = null

/**
 * Returns true when the user has opted into reduced motion. Cached after
 * the first call so each component doesn't re-query matchMedia.
 */
export function getPrefersReduced(): boolean {
  if (_reducedCached !== null)
    return _reducedCached
  try {
    _reducedCached = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }
  catch {
    _reducedCached = false
  }

  return _reducedCached
}

/**
 * Arms the page-entrance animation. Adds `.anim` immediately + `.rin` after
 * 1200ms (matches motion.js bootstrap IIFE). Call once at app boot.
 * No-op if prefers-reduced-motion is set.
 */
export function armMotion() {
  if (typeof document === 'undefined')
    return
  if (getPrefersReduced())
    return
  document.documentElement.classList.add('anim')
  // 1200ms delay before reveal. Reveals via CSS transition means content
  // reaches the visible state even if the tab is hidden when the timer fires.
  setTimeout(() => document.documentElement.classList.add('rin'), 1200)
}

/**
 * Replays the page-level entrance: clears `.rin` (hides), then re-adds it on
 * the next tick. Mirrors motion.js::replayMotion. Wire to router.afterEach so
 * every route change re-fires the stagger.
 */
export function replayMotion() {
  if (typeof document === 'undefined')
    return
  const html = document.documentElement
  if (!html.classList.contains('anim'))
    return
  html.classList.remove('rin')
  // Two timeouts force a style flush between hide and show so the
  // transition fires from the start.
  setTimeout(() => {
    setTimeout(() => html.classList.add('rin'), 20)
  }, 0)
}

/**
 * Returns a reactive ref that flips true after `delay` ms post-mount. Used by
 * charts to gate their entrance transition (line draw, bar rise, donut sweep).
 * setTimeout (not rAF) so it still fires in hidden tabs.
 * Mirrors motion.js::useShown.
 */
export function useShown(delay = 30): Ref<boolean> {
  const shown = ref(false)
  let timer: number | null = null
  onMounted(() => {
    timer = window.setTimeout(() => { shown.value = true }, delay)
  })
  onBeforeUnmount(() => {
    if (timer !== null)
      clearTimeout(timer)
  })

  return shown
}

/**
 * Counts a number from previous → target with ease-out-cubic over `duration` ms.
 * Mirrors motion.js::useCountUp.
 *
 * Hidden-tab guard: if document.hidden when the count starts, snaps to target
 * so a KPI never gets stuck reading 0 because requestAnimationFrame is paused.
 */
export function useCountUp(
  target: Ref<number> | (() => number),
  opts?: { duration?: number },
): Ref<number> {
  const duration = opts?.duration ?? 900
  const val = ref(0)
  const prev = { current: 0 }
  const reduced = getPrefersReduced()
  const getter: () => number
    = typeof target === 'function'
      ? (target as () => number)
      : () => (target as Ref<number>).value

  let rafId: number | null = null

  function cancel(): boolean {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    return false
  }

  function start() {
    const t = getter()
    if (cancel())
      return
    if (
      reduced
      || typeof t !== 'number'
      || !Number.isFinite(t)
      || (typeof document !== 'undefined' && document.hidden)
    ) {
      val.value = Number.isFinite(t) ? t : 0
      prev.current = Number.isFinite(t) ? t : 0

      return
    }
    const from = prev.current || 0
    val.value = from
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const e = 1 - (1 - p) ** 3
      val.value = from + (t - from) * e
      if (p < 1) {
        rafId = requestAnimationFrame(tick)
      }
      else {
        prev.current = t
        val.value = t
        rafId = null
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  watch(() => getter(), () => start(), { immediate: false })
  onMounted(start)
  onBeforeUnmount(cancel)

  return val
}
