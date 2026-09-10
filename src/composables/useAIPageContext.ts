import { ref } from 'vue'

/**
 * Page-context singleton consumed by the AI assistant store.
 *
 * Each page that wants the LLM to know "the user is currently looking at X with
 * filters Y over date range Z" calls `useAIPageContext().set({...})` on mount and
 * `.clear()` on unmount. The aiAssistant store forwards the current value as the
 * `context` field on every /ai/query call. BE folds it into the prompt as a
 * "CURRENT VIEW:" preamble (see core caa6845).
 */
export interface AIPageContext {
  route?: string
  route_label?: string
  range_from?: string
  range_to?: string
  filters?: Record<string, any>
  visible_data_keys?: string[]
  /** Optional extra free-form context. */
  note?: string
}

const current = ref<AIPageContext | null>(null)

export function useAIPageContext() {
  return {
    current,
    set(ctx: AIPageContext) {
      current.value = { ...ctx }
    },
    patch(ctx: Partial<AIPageContext>) {
      current.value = { ...(current.value || {}), ...ctx }
    },
    clear() {
      current.value = null
    },
    snapshot(): AIPageContext | null {
      return current.value ? { ...current.value } : null
    },
  }
}
