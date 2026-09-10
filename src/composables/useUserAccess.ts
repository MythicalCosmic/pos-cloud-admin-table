import { getStoredUserData } from '@/utils/storage'

type StoredUser = Record<string, any>

function normalizeRole(user: StoredUser): string {
  return String(user?.role ?? user?.user?.role ?? '').trim().toUpperCase()
}

function normalizeUserId(user: StoredUser): string | number | null {
  return user?.id ?? user?.user_id ?? user?.user?.id ?? user?.user?.user_id ?? null
}

function normalizePermissions(user: StoredUser): Set<string> {
  const source = user?.permissions
    ?? user?.user?.permissions
    ?? user?.role_permissions
    ?? user?.user?.role_permissions
    ?? []

  if (Array.isArray(source)) {
    return new Set(source
      .map((permission: unknown) => {
        if (typeof permission === 'string')
          return permission
        if (!permission || typeof permission !== 'object')
          return ''

        const value = permission as Record<string, any>

        return String(value.code ?? value.codename ?? value.permission?.code ?? value.permission?.codename ?? '')
      })
      .filter(Boolean))
  }

  if (source && typeof source === 'object') {
    return new Set(Object.entries(source)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key))
  }

  return new Set()
}

export function readUserAccess() {
  const user = getStoredUserData<StoredUser>()
  const role = normalizeRole(user)
  const userId = normalizeUserId(user)
  const permissions = normalizePermissions(user)

  function has(permission: string): boolean {
    return role === 'ADMIN' || permissions.has('*') || permissions.has(permission)
  }

  function hasAny(required: string[]): boolean {
    return required.some(has)
  }

  function hasAll(required: string[]): boolean {
    return required.every(has)
  }

  return {
    user,
    userId,
    role,
    permissions,
    isWarehouse: role === 'WAREHOUSE',
    isAdministrator: role === 'ADMIN',
    isManager: role === 'MANAGER',
    has,
    hasAny,
    hasAll,
  }
}

export function useUserAccess() {
  const access = shallowRef(readUserAccess())

  function refresh() {
    access.value = readUserAccess()
  }

  function onStorage(event: StorageEvent) {
    if (!event.key || ['userData', 'userAbilities'].includes(event.key))
      refresh()
  }

  onMounted(() => window.addEventListener('storage', onStorage))
  onBeforeUnmount(() => window.removeEventListener('storage', onStorage))

  return {
    access: readonly(access),
    currentUserId: computed(() => access.value.userId),
    role: computed(() => access.value.role),
    permissions: computed(() => access.value.permissions),
    isWarehouse: computed(() => access.value.isWarehouse),
    isAdministrator: computed(() => access.value.isAdministrator),
    isManager: computed(() => access.value.isManager),
    hasPermission: (permission: string) => access.value.has(permission),
    hasAnyPermission: (required: string[]) => access.value.hasAny(required),
    hasAllPermissions: (required: string[]) => access.value.hasAll(required),
    refresh,
  }
}
