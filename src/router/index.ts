import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHistory } from 'vue-router'
import { isUserLoggedIn } from './utils'
import routes from '~pages'
import { canNavigate } from '@layouts/plugins/casl'
import { armMotion, replayMotion } from '@/composables/useAlphaMotion'
import axiosIns from '@/plugins/axios'
import { hydrateBusinessSettings, setBusinessDayStart } from '@/composables/useBusinessDay'
import { getStoredUserData } from '@/utils/storage'
import { readUserAccess } from '@/composables/useUserAccess'
import { warehousePathAllowed } from '@/navigation/access'

// Hydrate business_day_start from /auth-me at app boot for users who logged
// in BEFORE the BE started exposing the field. Cached userData from those
// sessions has no business_day_start, so date presets would silently use the
// 03:00 default and could be off-by-one for tenants on a custom cutover.
// Only runs when logged in; one-shot per page load; failures are non-fatal.
function hydrateBusinessDayStart() {
  if (!isUserLoggedIn())
    return

  // Operating-hours settings (day-start + working open/close) are owned by the
  // backend at /app-settings; pull all three on every authenticated boot so the
  // working-hours window reflects the server, not just the cached day-start.
  if (!readUserAccess().isWarehouse)
    void hydrateBusinessSettings()

  // Skip if we already have a cached value to avoid a request on every reload.
  // Login + Settings update keep this localStorage key fresh.
  try {
    const cached = localStorage.getItem('businessDayStart')
    if (cached && /^\d{1,2}:\d{2}$/.test(cached))
      return
  }
  catch { /* noop */ }

  axiosIns.get('/auth-me').then(res => {
    const me = res?.data?.data ?? {}

    const bds: unknown = me?.business_day_start
      ?? me?.user?.business_day_start
      ?? me?.restaurant?.business_day_start

    if (typeof bds === 'string' && /^\d{1,2}:\d{2}/.test(bds))
      setBusinessDayStart(bds.slice(0, 5))

    // Merge into cached userData so other consumers see the field too.
    if (me && typeof me === 'object') {
      try {
        const prev = getStoredUserData()

        localStorage.setItem('userData', JSON.stringify({ ...prev, ...me }))
      }
      catch { /* noop */ }
    }
  }).catch(() => { /* noop — non-fatal */ })
}

hydrateBusinessDayStart()

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Logged-out → /login. Logged-in → render the index.vue Dashboards hub.
    // (per v3 design decision #7).
    {
      path: '/',
      redirect: to => isUserLoggedIn()
        ? (readUserAccess().isWarehouse
          ? { path: '/warehouse', query: to.query }
          : { name: 'index', query: to.query })
        : { name: 'login', query: to.query },
    },

    // Keep the legacy dashboard URL and route name pointing to the hub.
    { path: '/dashboard', name: 'dashboard', redirect: '/' },

    // One canonical shift-money reconciliation surface. The read-only handover
    // report remains a separate file-based route; it does not post settlement.
    {
      path: '/shifts',
      name: 'shifts',
      redirect: to => ({ path: '/shifts-analytics', query: to.query, hash: to.hash }),
    },
    {
      path: '/shift-analytics',
      name: 'shift-analytics',
      redirect: to => ({ path: '/shifts-analytics', query: to.query, hash: to.hash }),
    },
    {
      path: '/hr-attendance',
      name: 'hr-attendance',
      redirect: to => ({ path: '/audit', query: { ...to.query, tab: 'attendance' }, hash: to.hash }),
    },
    ...setupLayouts(routes),
  ],
})

// Arm the page-entrance motion as early as possible (bundle parity:
// `armMotion` adds html.anim then html.anim.rin after 1200ms; transitions
// resolve to the visible state even in hidden tabs).
armMotion()

// Replay the page-level entrance on every route change so KPI cards +
// chart cards re-stagger their reveal — mirrors shell.jsx useEffect.
router.afterEach(() => {
  replayMotion()
})

router.beforeEach(to => {
  const isLoggedIn = isUserLoggedIn()

  if (isLoggedIn) {
    const access = readUserAccess()
    const allowedRoles = Array.isArray(to.meta.allowedRoles) ? to.meta.allowedRoles.map(String) : []
    if (allowedRoles.length && !allowedRoles.includes(access.role))
      return { name: 'not-authorized' }

    const required = Array.isArray(to.meta.anyPermission)
      ? to.meta.anyPermission.map(String)
      : []

    const requiredAll = Array.isArray(to.meta.allPermissions)
      ? to.meta.allPermissions.map(String)
      : []

    if ((required.length && !access.hasAny(required)) || (requiredAll.length && !access.hasAll(requiredAll)))
      return { name: 'not-authorized' }

    // Warehouse routes intentionally bypass the legacy manage/all CASL meta;
    // their allowed surface is permission-mapped here and secured again by BE.
    if (access.isWarehouse) {
      if (warehousePathAllowed(to.path, access))
        return true

      return { name: 'not-authorized' }
    }
  }

  if (canNavigate(to)) {
    if (to.meta.redirectIfLoggedIn && isLoggedIn)
      return '/'
  }
  else {
    if (isLoggedIn)
      return { name: 'not-authorized' }
    else
      return { name: 'login', query: { to: to.name !== 'index' ? to.fullPath : undefined } }
  }
})

export default router
