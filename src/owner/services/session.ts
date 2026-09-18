/**
 * Owner-app session: sign in (owners/admins only), keep an active owner signed
 * in by rotating the token daily, and sign out. The token lives in the same
 * localStorage keys as the admin panel, so every shared service and the axios
 * interceptor work unchanged; on phones `native.ts` mirrors it into the
 * Keychain/Keystore so a WebView storage purge cannot sign the owner out.
 */
import { forgetToken, persistToken } from './native'
import axiosIns from '@/plugins/axios'
import ability from '@/plugins/casl/ability'
import { hydrateBusinessSettings, setBusinessDayStart } from '@/composables/useBusinessDay'
import { getStoredToken, getStoredUserData } from '@/utils/storage'

const ISSUED_KEY = 'ownerTokenIssuedAt'
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export class OwnerLoginError extends Error {
  constructor(public reason: 'not_owner' | 'failed', message = reason) {
    super(message)
  }
}

function store(token: string, user: Record<string, any>) {
  localStorage.setItem('accessToken', JSON.stringify(token))
  localStorage.setItem('userData', JSON.stringify(user))
  localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  localStorage.setItem(ISSUED_KEY, String(Date.now()))
  ability.update([{ action: 'manage', subject: 'all' }])
  void persistToken(token)
}

export function clearSession() {
  for (const key of ['accessToken', 'userData', 'userAbilities', ISSUED_KEY])
    localStorage.removeItem(key)
  ability.update([])
  void forgetToken()
}

function storedUser() {
  const user = getStoredUserData()

  return (user && typeof user.id === 'number') ? user : null
}

export function isSignedIn() {
  return !!getStoredToken() && !!storedUser()
}

export function currentUser() {
  return storedUser() as Record<string, any> | null
}

async function loadBusinessDay() {
  try {
    const me = (await axiosIns.get('/auth-me'))?.data?.data ?? {}
    if (typeof me.business_day_start === 'string')
      setBusinessDayStart(me.business_day_start.slice(0, 5))
    localStorage.setItem('userData', JSON.stringify({ ...currentUser(), ...me }))
  }
  catch { /* keep the stored defaults */ }
  await hydrateBusinessSettings()
}

export async function signIn(email: string, password: string) {
  const response = await axiosIns.post('/auth-login', { email, password })
  const { token, user } = response.data?.data ?? {}
  if (!token || !user)
    throw new OwnerLoginError('failed')
  if (user.role !== 'ADMIN') {
    // Only owners/admins may use the owner app. Close the session we just opened.
    await axiosIns.post('/auth-logout', null, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
    throw new OwnerLoginError('not_owner')
  }
  store(token, user)
  await loadBusinessDay()

  return user
}

export async function signOut() {
  try {
    await axiosIns.post('/auth-logout')
  }
  catch { /* sign out locally even when offline */ }
  clearSession()
}

/** Rotate the token once a day while the app is used (keeps the 7-day session alive). */
export async function refreshIfStale(force = false) {
  if (!isSignedIn())
    return false
  const issued = Number(localStorage.getItem(ISSUED_KEY) || 0)
  if (!force && Date.now() - issued < REFRESH_AFTER_MS)
    return false
  try {
    const { token, user } = (await axiosIns.post('/auth-refresh'))?.data?.data ?? {}
    if (!token)
      return false
    store(token, { ...currentUser(), ...user })

    return true
  }
  catch {
    return false // a 401 is handled by the request interceptor; network errors retry next time
  }
}

/**
 * After the phone cleared WebView storage only the Keychain token is left:
 * reload the profile for it, and drop it unless it still belongs to an owner.
 */
export async function restoreProfile() {
  if (!getStoredToken() || storedUser())
    return
  try {
    const me = (await axiosIns.get('/auth-me'))?.data?.data
    if (me?.role === 'ADMIN')
      store(getStoredToken() as string, me)
    else
      clearSession()
  }
  catch { /* a 401 clears the session in the interceptor; offline keeps the token for next launch */ }
}

export async function restoreBusinessDay() {
  if (isSignedIn())
    await loadBusinessDay()
}
