/** Display helpers for staff (employee) records. */

interface StaffUser {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

/**
 * Staff profiles imported from payroll sheets store the job title as the last
 * name, so "Otabek dastavchik" repeats the position shown next to it. Drop a
 * last name that only repeats the position.
 */
export function staffName(user: StaffUser | null | undefined, position?: string | null): string {
  const first = String(user?.first_name ?? '').trim()
  const last = String(user?.last_name ?? '').trim()
  const repeatsPosition = !!last && (last.toLocaleLowerCase() === String(position ?? '').trim().toLocaleLowerCase())

  return [first, (repeatsPosition ? '' : last)].filter(Boolean).join(' ')
}

/** Accounts created without a real mailbox use a generated `...@local` address. */
export function realEmail(email: string | null | undefined): string {
  const value = String(email ?? '').trim()

  if (!value || value.toLowerCase().endsWith('@local'))
    return ''

  return value
}
