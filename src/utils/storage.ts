// Tolerant localStorage readers. Returns the fallback on missing key, corrupt
// JSON, or any other parse failure — so a single bad localStorage entry can't
// crash every request via the axios interceptor or freeze the route guard.

export function safeJSON<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '')
    return fallback
  try {
    return JSON.parse(raw) as T
  }
  catch {
    return fallback
  }
}

export function getStoredToken(): string | null {
  const raw = localStorage.getItem('accessToken')

  return safeJSON<string | null>(raw, null)
}

export function getStoredUserData<T extends Record<string, any> = Record<string, any>>(): T {
  const raw = localStorage.getItem('userData')

  return safeJSON<T>(raw, {} as T)
}

export function getStoredAbilities<T = unknown>(): T | null {
  const raw = localStorage.getItem('userAbilities')

  return safeJSON<T | null>(raw, null)
}
