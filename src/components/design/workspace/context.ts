import type { InjectionKey } from 'vue'

// Explicit opt-in keeps the approved Dashboard, Orders and AI surfaces unchanged.
export const workspaceContext: InjectionKey<boolean> = Symbol('operations-workspace')
