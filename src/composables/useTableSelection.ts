import { computed, ref } from 'vue'

/**
 * Generic row-selection model for any list page (table or card grid).
 *
 * Maintains a Set<ID> of selected row keys plus helpers — usable independent
 * of the renderer (Vuetify VDataTable, Sneat <DataTable>, or hand-rolled cards
 * all share the same hook surface).
 *
 *   const sel = useTableSelection<number>(() => products.value.map(p => p.id))
 *   sel.toggle(id) | sel.clear() | sel.selectAll() | sel.isSelected(id)
 *   sel.count.value | sel.allSelected.value | sel.someSelected.value
 *
 * `selectRange(anchorId, targetId, ordered)` enables Shift+Click range select
 * when `ordered` is the currently-visible ID list (so the range follows the
 * user's sort/filter, not the underlying data order).
 */
export function useTableSelection<ID = number | string>(
  getAllIds: () => ID[],
) {
  const selected = ref<Set<ID>>(new Set()) as { value: Set<ID> }
  const lastClickedId = ref<ID | null>(null) as { value: ID | null }

  function isSelected(id: ID): boolean {
    return selected.value.has(id)
  }

  function toggle(id: ID, ev?: MouseEvent) {
    // Shift-click range select: from anchor to id in the current ordering.
    if (ev?.shiftKey && lastClickedId.value !== null) {
      const all = getAllIds()
      const a = all.indexOf(lastClickedId.value as ID)
      const b = all.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        const range = all.slice(lo, hi + 1)
        const next = new Set(selected.value)
        const turningOn = !isSelected(id)
        for (const rid of range) {
          if (turningOn) next.add(rid)
          else next.delete(rid)
        }
        selected.value = next
        lastClickedId.value = id
        return
      }
    }
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    lastClickedId.value = id
  }

  function selectAll() {
    selected.value = new Set(getAllIds())
  }

  function clear() {
    selected.value = new Set()
    lastClickedId.value = null
  }

  const count = computed(() => selected.value.size)
  const allSelected = computed(() => {
    const all = getAllIds()
    return all.length > 0 && all.every(id => selected.value.has(id))
  })
  const someSelected = computed(() => count.value > 0 && !allSelected.value)

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    clear,
    count,
    allSelected,
    someSelected,
  }
}
