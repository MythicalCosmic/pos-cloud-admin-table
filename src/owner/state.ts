/** Shared, app-wide owner-app state (not persisted except where noted). */
import { reactive } from 'vue'
import type { OwnerDevice } from './services/mobileApi'

export const ownerState = reactive({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingApprovals: null as number | null,
  locked: false,
  device: null as OwnerDevice | null,
  pushToken: '' as string,
  pushPermission: 'unknown' as 'unknown' | 'granted' | 'denied' | 'unavailable',
})

export const BIOMETRIC_KEY = 'ownerBiometricLock'

export function biometricLockEnabled() {
  try {
    return localStorage.getItem(BIOMETRIC_KEY) === '1'
  }
  catch {
    return false
  }
}

/** Screens listen for this to reload after the app returns to the foreground. */
export const REFRESH_EVENT = 'owner:refresh'

export function requestRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}
