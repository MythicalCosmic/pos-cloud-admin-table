const UNKNOWN_PRICE_NOTE_MARKER = 'temporary unknown-price placeholder'

export function supplierItemHasKnownPrice(row: any): boolean {
  const explicitPrice = row?.price_is_known
  const rawPrice = row?.suggested_unit_price_uzs ?? row?.price

  const hasPriceValue = rawPrice !== null
    && rawPrice !== undefined
    && String(rawPrice).trim() !== ''

  const price = Number(rawPrice)
  const notes = String(row?.notes ?? '').toLocaleLowerCase('en-US')

  if (typeof explicitPrice === 'boolean')
    return explicitPrice && hasPriceValue && Number.isFinite(price)

  return hasPriceValue && Number.isFinite(price) && !notes.includes(UNKNOWN_PRICE_NOTE_MARKER)
}
