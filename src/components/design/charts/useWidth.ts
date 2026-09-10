import type { Ref } from 'vue'

/**
 * Observe an element's content-box width via ResizeObserver.
 * Returns [templateRef, widthRef]. Mirrors useWidth() in charts.jsx.
 *
 * Uses watch(elRef, ...) so the observer rebinds when the ref target swaps
 * (e.g. v-if loading -> chart div remount). onMounted-only would lock the
 * observer to the first mounted element and width would never update.
 */
export function useWidth(): [Ref<HTMLElement | null>, Ref<number>] {
  const elRef = ref<HTMLElement | null>(null)
  const w = ref(0)

  watch(elRef, (el, _, onCleanup) => {
    if (!el)
      return
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      if (e)
        w.value = e.contentRect.width
    })
    ro.observe(el)
    w.value = el.clientWidth
    onCleanup(() => ro.disconnect())
  }, { flush: 'post', immediate: true })

  return [elRef, w]
}
