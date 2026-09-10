/* ============================================================
   Shared helpers for AI-generated notifications (morning briefing +
   anomaly alerts). Used by AIBriefingCard and the topbar notifications bell.
   ============================================================ */

// The AI emits its own icon vocabulary (revenue/stock/staff/…) that mostly
// doesn't match DesignIcon's names, so bullets rendered blank. Map to real
// icons; fall back to a sparkle for anything unknown.
const ICON_ALIAS: Record<string, string> = {
  revenue: 'wallet', sales: 'wallet', money: 'coins',
  trend: 'trend', growth: 'trend', mover: 'trend',
  stock: 'box', inventory: 'box', product: 'box', products: 'box',
  staff: 'users', shift: 'clock', shifts: 'clock',
  menu: 'menu', category: 'tag', order: 'receipt', orders: 'receipt',
  alert: 'alert', warning: 'alert', anomaly: 'alert',
}
const KNOWN_ICONS = new Set([
  'dashboard', 'ai', 'clock', 'users', 'grid', 'box', 'receipt', 'table', 'tag',
  'register', 'gift', 'employee', 'building', 'coins', 'chart', 'wallet', 'trend',
  'package', 'menu', 'alert', 'info', 'bell', 'sparkle', 'star', 'flag', 'store',
])

export function notifyIcon(name?: string): string {
  if (!name) return 'sparkle'
  const mapped = ICON_ALIAS[name] || name
  return KNOWN_ICONS.has(mapped) ? mapped : 'sparkle'
}

// The AI's deep_link uses semantic paths that aren't real admin-panel routes
// (/menu, /stock, /staff, /dashboard). Remap to the real page so "Open" works.
// Any query string (product_id, shift_id, …) is kept in case the target page
// grows to read it.
const ROUTE_ALIAS: Record<string, string> = {
  '/menu': '/products',
  '/stock': '/stock/alerts',
  '/staff': '/shifts-analytics',
  '/dashboard': '/',
}

export function resolveNotifyLink(dl?: string): string | null {
  if (!dl) return null
  const [path, query] = dl.split('?')
  const real = ROUTE_ALIAS[path] ?? path
  return query ? `${real}?${query}` : real
}

// Text fields may arrive as a plain string (English-only, today) or as a
// localized object { uz, ru, en } once the BE ships translations. Resolve to
// the active locale with graceful fallbacks so both shapes render.
export function localizeNotify(v: unknown, locale: string): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const o = v as Record<string, string>
    return o[locale] || o.uz || o.en || o.ru || Object.values(o)[0] || ''
  }
  return String(v)
}
