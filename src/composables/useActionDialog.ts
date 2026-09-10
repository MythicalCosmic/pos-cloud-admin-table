interface DialogOptions {
  title: string
  message?: string
  confirmLabel: string
  inputLabel?: string
  danger?: boolean
}
interface DialogRequest extends DialogOptions { id: number }
const current = shallowRef<DialogRequest | null>(null)
let finish: ((value: string | null) => void) | null = null
let sequence = 0

function close(value: string | null = null) {
  const resolve = finish

  finish = null
  current.value = null
  resolve?.(value)
}
export function useActionDialog() {
  const scope = getCurrentScope()
  const owned = new Set<number>()
  async function promptAction(options: DialogOptions) {
    if (current.value)
      return null
    const id = ++sequence

    current.value = { ...options, id }

    const promise = new Promise<string | null>(resolve => { finish = resolve })

    owned.add(id)

    const result = await promise

    owned.delete(id)
    return result
  }
  async function confirmAction(options: DialogOptions) {
    return await promptAction(options) !== null
  }
  if (scope) {
    onScopeDispose(() => {
      if (current.value && owned.has(current.value.id))
        close()
    })
  }
  return { confirmAction, promptAction }
}

export function useActionDialogHost() {
  return { current: readonly(current), close }
}
