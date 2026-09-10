import axios from 'axios'
import { getStoredToken } from '@/utils/storage'

const API_TIMEOUT_MS = 30_000

function normalizeHost(host: string): string | null {
  const value = (host ?? '').trim()
  if (!value)
    return ''

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol))
      return null
    if (url.username || url.password || url.search || url.hash)
      return null
    if (url.pathname !== '/' && url.pathname !== '')
      return null

    return url.origin
  }
  catch {
    return null
  }
}

const BUILD_HOST = normalizeHost(import.meta.env.VITE_API_HOST ?? '') ?? ''

const CONFIGURED_HOSTS = String(import.meta.env.VITE_ALLOWED_API_HOSTS ?? '')
  .split(',')
  .map(normalizeHost)
  .filter((host): host is string => !!host)

const ALLOWED_API_HOSTS = new Set([BUILD_HOST, ...CONFIGURED_HOSTS].filter(Boolean))

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
}

/**
 * Runtime API hosts are restricted because credentials and bearer tokens are
 * sent to the selected origin. Extra production origins must be explicitly
 * baked into VITE_ALLOWED_API_HOSTS as a comma-separated list.
 */
export function validateApiHost(host: string): { valid: boolean; normalized: string } {
  const normalized = normalizeHost(host)
  if (normalized === null)
    return { valid: false, normalized: '' }
  if (!normalized)
    return { valid: true, normalized: '' }

  const url = new URL(normalized)
  const sameOrigin = typeof window !== 'undefined' && url.origin === window.location.origin

  const localDevelopmentPair = typeof window !== 'undefined'
    && isLoopbackHost(window.location.hostname)
    && isLoopbackHost(url.hostname)

  const allowed = sameOrigin
    || localDevelopmentPair
    || ALLOWED_API_HOSTS.has(url.origin)
    || import.meta.env.DEV

  return { valid: allowed, normalized: allowed ? url.origin : '' }
}

// Runtime override > build-time VITE_API_HOST > empty (dev proxy / relative).
function readRuntimeHost(): string {
  try {
    const result = validateApiHost(localStorage.getItem('apiHost') ?? '')

    return result.valid ? result.normalized : ''
  }
  catch {
    return ''
  }
}

const API_HOST = readRuntimeHost() || BUILD_HOST

export function getCurrentApiHost(): string {
  return readRuntimeHost() || BUILD_HOST
}

export function setApiHost(host: string) {
  const result = validateApiHost(host)
  if (!result.valid)
    throw new TypeError('Untrusted API host')

  if (result.normalized)
    localStorage.setItem('apiHost', result.normalized)
  else
    localStorage.removeItem('apiHost')
}

// Endpoints that the backend dedupes via `Idempotency-Key`. Concurrent
// duplicate requests and retries after an ambiguous network failure reuse the
// same key. A completed operation releases it so a later intentional action
// with the same payload is treated as new.
interface IdempotentRoute {
  method: 'POST' | 'PATCH'
  path: RegExp
}

const IDEMPOTENT_ROUTES: IdempotentRoute[] = [
  { method: 'POST', path: /^\/orders\/?$/ },
  { method: 'POST', path: /^\/orders\/\d+\/(?:pay|unpay|cancel)$/ },
  { method: 'PATCH', path: /^\/orders\/\d+\/status$/ },
  { method: 'POST', path: /^\/treasury\/(?:transfer|expense)$/ },
  { method: 'POST', path: /^\/expenses\/\d+\/(?:pay|void)\/?$/ },
  { method: 'POST', path: /^\/shifts\/\d+\/reconcile\/?$/ },
  { method: 'POST', path: /^\/suppliers\/\d+\/(?:pay|payments)\/?$/ },
  { method: 'POST', path: /^\/suppliers\/\d+\/payments\/\d+\/reverse\/?$/ },
  { method: 'POST', path: /^\/receiving\/[^/]+\/complete\/?$/ },
  { method: 'POST', path: /^\/purchase-invoices\/receive\/?$/ },
  { method: 'POST', path: /^\/adjust\/?$/ },
  { method: 'POST', path: /^\/adjust\/[^/]+\/reverse\/?$/ },
  { method: 'POST', path: /^\/loyalty\/accounts\/[^/]+\/redeem\/?$/ },
  { method: 'POST', path: /^\/attendance\/manual-entry\/?$/ },
  { method: 'POST', path: /^\/attendance\/[^/]+\/(?:adjustment-requests|excuses)\/?$/ },
  { method: 'POST', path: /^\/discipline-(?:cases|rules)\/?$/ },
  { method: 'PATCH', path: /^\/(?:discipline-rules|work-schedules)\/[^/]+\/?$/ },
  { method: 'POST', path: /^\/discipline-cases\/[^/]+\/(?:approve|reject|void)\/?$/ },
  { method: 'POST', path: /^\/preparation-audits\/[^/]+\/(?:review|reopen)\/?$/ },
]

function isIdempotentPath(method: string | undefined, url: string | undefined): boolean {
  if (!url)
    return false

  const normalizedMethod = (method || '').toUpperCase()

  return IDEMPOTENT_ROUTES.some(route => route.method === normalizedMethod && route.path.test(url))
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  // Fallback for older browsers — not crypto-strong but unique enough for dedup.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

interface PendingIdempotencyKey {
  key: string
  expiresAt: number
}

const IDEMPOTENCY_RETRY_WINDOW_MS = 10 * 60_000
const pendingIdempotencyKeys = new Map<string, PendingIdempotencyKey>()

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`

  const object = value as Record<string, unknown>

  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(',')}}`
}

function idempotencySignature(config: any): string {
  return [
    String(config.method || '').toUpperCase(),
    String(config.baseURL || ''),
    String(config.url || ''),
    stableSerialize(config.data),
  ].join('|')
}

function pruneIdempotencyKeys(now = Date.now()) {
  for (const [signature, entry] of pendingIdempotencyKeys) {
    if (entry.expiresAt <= now)
      pendingIdempotencyKeys.delete(signature)
  }
}

function headerValue(headers: any, name: string): string | undefined {
  const value = typeof headers?.get === 'function' ? headers.get(name) : headers?.[name]

  return value ? String(value) : undefined
}

function setHeader(headers: any, name: string, value: string) {
  if (typeof headers?.set === 'function')
    headers.set(name, value)
  else
    headers[name] = value
}

function releaseIdempotencyKey(config: any) {
  const signature = config?.__idempotencySignature as string | undefined
  const key = config?.__idempotencyKey as string | undefined
  if (!signature || !key)
    return

  const pending = pendingIdempotencyKeys.get(signature)
  if (pending?.key === key)
    pendingIdempotencyKeys.delete(signature)
}

// Each axios instance is created once with the baseURL known at boot. To let
// the operator swap hosts at runtime we tag the instance with its trailing
// "/api/..." suffix and rewrite baseURL per-request from the current host.
function attachInterceptors(instance: ReturnType<typeof axios.create>, suffix = '') {
  instance.interceptors.request.use(config => {
    if (suffix) {
      const host = getCurrentApiHost()

      config.baseURL = `${host}${suffix}`
    }

    const token = getStoredToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }

    // Auto-attach Idempotency-Key on admin endpoints that honor it.
    // Caller can override by setting their own header.
    if (isIdempotentPath(config.method, config.url)) {
      config.headers = config.headers || {}
      if (!headerValue(config.headers, 'Idempotency-Key')) {
        pruneIdempotencyKeys()

        const signature = idempotencySignature(config)
        const pending = pendingIdempotencyKeys.get(signature)
        const key = pending?.key ?? newIdempotencyKey()

        pendingIdempotencyKeys.set(signature, {
          key,
          expiresAt: Date.now() + IDEMPOTENCY_RETRY_WINDOW_MS,
        })
        setHeader(config.headers, 'Idempotency-Key', key)
        ;(config as any).__idempotencySignature = signature
        ;(config as any).__idempotencyKey = key
      }
    }

    return config
  })

  instance.interceptors.response.use(
    response => {
      releaseIdempotencyKey(response.config)

      return response
    },
    error => {
      const status = error.response?.status

      // Preserve the key after an ambiguous network/timeout/server failure so
      // a retry replays the original operation. A definite 4xx rejection can
      // safely start a new operation on the next attempt.
      if (status && status < 500 && ![408, 409].includes(status))
        releaseIdempotencyKey(error.config)

      if (error.response?.status === 401) {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('userData')
        localStorage.removeItem('userAbilities')
        if (window.location.pathname !== '/login')
          window.location.href = '/login'
      }

      // License kill switch — backend returns 503 with a `code` like
      // `license_unregistered` / `license_suspended` / `license_expired` on
      // EVERY business endpoint until /api/licensing/setup runs. Route the
      // user to the setup wizard so they can recover without bouncing
      // through "something went wrong" toasts on every page.
      const code: string | undefined = error.response?.data?.code
      if (error.response?.status === 503 && code && code.startsWith('license_')) {
        const onLicensingPage = window.location.pathname.startsWith('/licensing')
        if (!onLicensingPage)
          window.location.href = '/licensing/setup'
      }

      return Promise.reject(error)
    },
  )

  return instance
}

const axiosIns = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins`, timeout: API_TIMEOUT_MS }), '/api/admins')

export const stockApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins/stock`, timeout: API_TIMEOUT_MS }), '/api/admins/stock')

export const hrApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins/hr`, timeout: API_TIMEOUT_MS }), '/api/admins/hr')

export const discountsApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins/discounts`, timeout: API_TIMEOUT_MS }), '/api/admins/discounts')

export const notificationsApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins/notifications`, timeout: API_TIMEOUT_MS }), '/api/admins/notifications')

export const cashboxApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/admins/cashbox`, timeout: API_TIMEOUT_MS }), '/api/admins/cashbox')

export const fiscalApi = attachInterceptors(axios.create({ baseURL: `${API_HOST}/api/fiscalization`, timeout: API_TIMEOUT_MS }), '/api/fiscalization')

// Licensing endpoints are allowlisted past the kill switch and don't
// require auth. No Bearer token, no idempotency. Plain axios so the
// 503 redirect doesn't loop while on the licensing pages themselves.
export const licensingApi = axios.create({ baseURL: `${API_HOST}/api/licensing`, timeout: API_TIMEOUT_MS })

export default axiosIns
