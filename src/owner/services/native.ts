/**
 * Native (Capacitor) capabilities for the owner app. On the web build every
 * function degrades to a harmless no-op, so the same screens run in a browser
 * for development and tests.
 */
import type { Router } from 'vue-router'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Network } from '@capacitor/network'
import { PushNotifications } from '@capacitor/push-notifications'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { biometricLockEnabled, ownerState, requestRefresh } from '../state'
import { registerDevice } from './mobileApi'

const TOKEN_KEY = 'owner-session-token'

// Optional native niceties must never break the flow that called them.
function ignore() {
  return undefined
}
const LOCK_AFTER_MS = 60 * 1000

/**
 * Push needs the Firebase config baked into the native project
 * (google-services.json / GoogleService-Info.plist). Without it Android
 * crashes on register(), so builds without Firebase keep push off.
 */
export const PUSH_READY = import.meta.env.VITE_OWNER_PUSH === '1'

export function isNative() {
  return Capacitor.isNativePlatform()
}

export function platform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

/** Mirror the session token into the Keychain / Android Keystore. */
export async function persistToken(token: string) {
  if (isNative())
    await SecureStorage.set(TOKEN_KEY, token, false, false).catch(ignore)
}

export async function forgetToken() {
  if (isNative())
    await SecureStorage.remove(TOKEN_KEY, false).catch(() => false)
}

/** Token from the Keychain when the WebView's storage was cleared by the OS. */
export async function restoreToken(): Promise<string | null> {
  if (!isNative())
    return null
  try {
    const value = await SecureStorage.get(TOKEN_KEY, false, false)

    return (typeof value === 'string' && value) ? value : null
  }
  catch {
    return null
  }
}

export async function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (!isNative())
    return
  try {
    if (kind === 'light')
      await Haptics.impact({ style: ImpactStyle.Light })
    else
      await Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning })
  }
  catch { /* haptics are a nicety */ }
}

export async function biometryAvailable() {
  if (!isNative())
    return false
  try {
    return (await BiometricAuth.checkBiometry()).isAvailable
  }
  catch {
    return false
  }
}

export async function unlockWithBiometry(reason: string, cancelTitle: string) {
  if (!isNative())
    return true
  try {
    await BiometricAuth.authenticate({ reason, cancelTitle, allowDeviceCredential: true, androidTitle: 'Alpha POS' })

    return true
  }
  catch {
    return false
  }
}

export async function setStatusBarTheme(dark: boolean) {
  if (!isNative())
    return
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(ignore)
}

export async function appVersion() {
  try {
    return (await App.getInfo()).version
  }
  catch {
    return ''
  }
}

/** Ask for notification permission and register this phone for pushes. */
export async function enablePush(locale: string) {
  if (!isNative() || !PUSH_READY) {
    ownerState.pushPermission = 'unavailable'

    return false
  }
  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale')
    permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') {
    ownerState.pushPermission = 'denied'

    return false
  }
  ownerState.pushPermission = 'granted'
  if (platform() === 'android')
    await PushNotifications.createChannel({ id: 'owner', name: 'Alpha POS', importance: 4, visibility: 1 }).catch(ignore)
  await PushNotifications.register()
  if (ownerState.pushToken)
    await syncDevice(locale)

  return true
}

export async function syncDevice(locale: string) {
  const os = platform()
  if (!ownerState.pushToken || os === 'web')
    return
  try {
    ownerState.device = await registerDevice({ token: ownerState.pushToken, platform: os, app_version: await appVersion(), locale })
  }
  catch { /* retried on the next resume */ }
}

let lastBackgroundAt = 0

/** Wire app lifecycle, back button, network and push listeners once at startup. */
export async function initNative(router: Router, locale: () => string) {
  const updateOnline = (online: boolean) => { ownerState.online = online }

  window.addEventListener('online', () => updateOnline(true))
  window.addEventListener('offline', () => updateOnline(false))
  if (!isNative())
    return

  document.documentElement.classList.add('owner-native', `owner-${platform()}`)
  updateOnline((await Network.getStatus()).connected)
  await Network.addListener('networkStatusChange', status => updateOnline(status.connected))

  await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      lastBackgroundAt = Date.now()

      return
    }
    if (biometricLockEnabled() && lastBackgroundAt && Date.now() - lastBackgroundAt > LOCK_AFTER_MS)
      ownerState.locked = true
    requestRefresh()
  })
  await App.addListener('backButton', ({ canGoBack }) => {
    const topLevel = ['/', '/approvals', '/money', '/suppliers', '/more', '/login'].includes(router.currentRoute.value.path)
    if (canGoBack && !topLevel)
      router.back()
    else
      void App.minimizeApp()
  })

  if (biometricLockEnabled())
    ownerState.locked = true
  await initPush(router, locale)
}

/** Push listeners, and re-register a phone that already granted permission. */
async function initPush(router: Router, locale: () => string) {
  if (!PUSH_READY) {
    ownerState.pushPermission = 'unavailable'

    return
  }
  await PushNotifications.addListener('registration', token => {
    ownerState.pushToken = token.value
    void syncDevice(locale())
  })
  await PushNotifications.addListener('registrationError', () => { ownerState.pushPermission = 'unavailable' })
  await PushNotifications.addListener('pushNotificationReceived', () => requestRefresh())
  await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const route = action.notification?.data?.route
    if (typeof route === 'string' && route.startsWith('/'))
      void router.push(route)
  })

  const permission = await PushNotifications.checkPermissions().catch(() => null)
  if (permission?.receive === 'granted') {
    ownerState.pushPermission = 'granted'
    await PushNotifications.register().catch(ignore)
  }
}

export async function hideSplash() {
  if (isNative())
    await SplashScreen.hide().catch(ignore)
}
