export type PreparationStatus = 'ON_TIME' | 'SLIGHTLY_LATE' | 'VERY_LATE' | 'UNTRACKED'
export type PreparationTone = 'success' | 'warning' | 'error' | 'neutral'

export interface PreparationTarget {
  maximumSeconds: number
  displayFromMinutes: number
  displayToMinutes: number
}

export interface OrderPreparation {
  elapsedSeconds: number
  elapsedMinutes: number
  status: PreparationStatus
  tone: PreparationTone
  target: PreparationTarget | null
}

interface PreparationOrderInput {
  created_at?: unknown
  ready_at?: unknown
  items?: Array<{ product__name?: unknown }> | null
}

function createTarget(maximumMinutes: number, displayFromMinutes = maximumMinutes, displayToMinutes = maximumMinutes): PreparationTarget {
  return {
    maximumSeconds: maximumMinutes * 60,
    displayFromMinutes,
    displayToMinutes,
  }
}

interface PreparationTargetRule {
  matches: (name: string) => boolean
  maximumMinutes: number
  displayFromMinutes?: number
  displayToMinutes?: number
}

function matchesExact(...names: string[]) {
  return (name: string) => names.includes(name)
}

function matchesPrefix(...prefixes: string[]) {
  return (name: string) => prefixes.some(prefix => name.startsWith(prefix))
}

const preparationTargetRules: PreparationTargetRule[] = [
  { matches: matchesExact('hot dog mini', 'xodok mini'), maximumMinutes: 3 },
  { matches: matchesExact('hot dog dabl', 'dabl hot dog', 'double hot dog', 'dabl xodok'), maximumMinutes: 4 },
  { matches: matchesExact('hot dog karalevskiy', 'hot dog korolevskiy', 'qora lavash', 'kora lavash'), maximumMinutes: 4 },
  { matches: matchesPrefix('non burger'), maximumMinutes: 6 },
  { matches: matchesPrefix('longer', 'toster', 'nostar'), maximumMinutes: 5 },
  {
    matches: name => name.startsWith('chicken burger')
      || (name.startsWith('chicken ') && name.endsWith(' burger'))
      || name.startsWith('burger chikin'),
    maximumMinutes: 8,
  },
  { matches: matchesPrefix('burger donarli', 'donar burger'), maximumMinutes: 8 },
  { matches: matchesExact('burger', 'burger chiz', 'dabl burger', 'dabl burger chiz', 'smart burger'), maximumMinutes: 20 },
  { matches: name => name.includes('pitsa') || name.includes('pizza'), maximumMinutes: 20, displayFromMinutes: 15, displayToMinutes: 20 },
  { matches: matchesExact('kartoshka fri', 'fri'), maximumMinutes: 3 },
  { matches: matchesPrefix('smart strips'), maximumMinutes: 8, displayFromMinutes: 7, displayToMinutes: 8 },
  { matches: matchesPrefix('qanotcha', 'qanot'), maximumMinutes: 9, displayFromMinutes: 8, displayToMinutes: 9 },
  { matches: matchesPrefix('strips'), maximumMinutes: 8, displayFromMinutes: 7, displayToMinutes: 8 },
  { matches: matchesPrefix('naggetsi', 'nuggets'), maximumMinutes: 6, displayFromMinutes: 5, displayToMinutes: 6 },
  { matches: name => name === 'file' || name.startsWith('file '), maximumMinutes: 8, displayFromMinutes: 7, displayToMinutes: 8 },
  { matches: matchesExact('chicken big', 'chikin big'), maximumMinutes: 11, displayFromMinutes: 10, displayToMinutes: 11 },
]

/**
 * Mirrors alpha_pos_core/notifications/preparation.py (commit 804a0b9).
 * The Orders list currently exposes item product names but not the backend's
 * derived target/status fields, so this keeps the admin table aligned with the
 * same published notification rules until the API includes those fields.
 */
export function normalizePreparationProductName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[ʻ’\x60]/g, '\'')
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function preparationTargetForProduct(productName: unknown): PreparationTarget | null {
  const name = normalizePreparationProductName(productName)
  const rule = preparationTargetRules.find(currentRule => currentRule.matches(name))

  if (rule)
    return createTarget(rule.maximumMinutes, rule.displayFromMinutes, rule.displayToMinutes)

  return null
}

export function preparationTargetForOrder(productNames: Iterable<unknown>): PreparationTarget | null {
  let slowestTarget: PreparationTarget | null = null
  for (const productName of productNames) {
    const currentTarget = preparationTargetForProduct(productName)
    if (currentTarget && (!slowestTarget || currentTarget.maximumSeconds > slowestTarget.maximumSeconds))
      slowestTarget = currentTarget
  }
  return slowestTarget
}

export function classifyPreparation(elapsedSeconds: number, preparationTarget: PreparationTarget | null): Pick<OrderPreparation, 'status' | 'tone'> {
  if (!preparationTarget)
    return { status: 'UNTRACKED', tone: 'neutral' }
  if (elapsedSeconds <= preparationTarget.maximumSeconds)
    return { status: 'ON_TIME', tone: 'success' }
  if (elapsedSeconds * 2 <= preparationTarget.maximumSeconds * 3)
    return { status: 'SLIGHTLY_LATE', tone: 'warning' }
  return { status: 'VERY_LATE', tone: 'error' }
}

export function getOrderPreparation(order: PreparationOrderInput): OrderPreparation | null {
  if (!order.created_at || !order.ready_at)
    return null

  const createdAt = Date.parse(String(order.created_at))
  const readyAt = Date.parse(String(order.ready_at))
  if (!Number.isFinite(createdAt) || !Number.isFinite(readyAt))
    return null

  // The backend defensively clamps cross-branch clock skew to zero.
  const elapsedSeconds = Math.max(0, Math.floor((readyAt - createdAt) / 1000))
  const preparationTarget = preparationTargetForOrder(order.items?.map(item => item.product__name) ?? [])
  const classification = classifyPreparation(elapsedSeconds, preparationTarget)

  return {
    elapsedSeconds,
    elapsedMinutes: Math.ceil(elapsedSeconds / 60),
    target: preparationTarget,
    ...classification,
  }
}

export function formatPreparationTarget(preparationTarget: PreparationTarget, minuteLabel: string): string {
  const range = preparationTarget.displayFromMinutes === preparationTarget.displayToMinutes
    ? String(preparationTarget.displayToMinutes)
    : `${preparationTarget.displayFromMinutes}–${preparationTarget.displayToMinutes}`

  return `${range} ${minuteLabel}`
}
