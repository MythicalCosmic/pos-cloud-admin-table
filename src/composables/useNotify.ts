import { toast } from 'vue-sonner'

/**
 * Toast composable backed by vue-sonner.
 *
 * Historical shape: returns `{ snackbar, snackbarMsg, snackbarColor, notify }`.
 * Hundreds of call sites either destructure all four (and render their own
 * <VSnackbar> bound to the refs) or just pull `notify`. To avoid touching every
 * page in one go, this composable keeps the same return shape:
 *
 *   - `notify(msg, color?)` now fires a sonner toast (success | error | warning |
 *     info | default). The toast renders globally via <Toaster /> mounted in
 *     App.vue, so the per-page <VSnackbar> markup becomes a no-op (the bound
 *     refs simply never flip to true). Those <VSnackbar>s can be deleted as
 *     pages are touched.
 *   - The three refs are kept as inert back-compat exports.
 *
 * Color mapping:
 *   success → toast.success
 *   error   → toast.error
 *   warning → toast.warning
 *   info    → toast.info
 *   anything else falls through to the default toast() (no color flair).
 */
export function useNotify() {
  const { t } = useI18n({ useScope: 'global' })
  const snackbar = ref(false)
  const snackbarMsg = ref('')
  const snackbarColor = ref('success')

  function notify(msg: string, color = 'success') {
    // Preserve old reactive refs so legacy <VSnackbar> bindings stay typesafe
    // even though the actual visible toast comes from sonner.
    snackbarMsg.value = msg
    snackbarColor.value = color

    switch (color) {
      case 'success':
        toast.success(msg)
        break
      case 'error':
        toast.error(t('toast_error_title'), { description: msg, duration: 6500 })
        break
      case 'warning':
      case 'warn':
        toast.warning(msg)
        break
      case 'info':
        toast.info(msg)
        break
      default:
        toast(msg)
    }
  }

  return { snackbar, snackbarMsg, snackbarColor, notify }
}
