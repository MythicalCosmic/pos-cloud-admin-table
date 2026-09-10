interface StockApiReader {
  get: (url: string, config?: Record<string, unknown>) => Promise<any>
}

export interface StockLevelSnapshot {
  stock_item_id?: number | string | null
  location_id?: number | string | null
  quantity?: number | string | null
  reserved_quantity?: number | string | null
  available_quantity?: number | string | null
}

export async function fetchStockLevelSnapshot(
  api: StockApiReader,
  stockItemId: string | number,
  locationId: string | number,
): Promise<StockLevelSnapshot> {
  const response = await api.get(`/levels/item/${stockItemId}/`)
  const data = response?.data?.data ?? response?.data ?? {}
  const levels = Array.isArray(data?.levels) ? data.levels : []

  const level = levels.find((row: StockLevelSnapshot) =>
    String(row.location_id) === String(locationId),
  )

  return level ?? {
    stock_item_id: stockItemId,
    location_id: locationId,
    quantity: 0,
    reserved_quantity: 0,
    available_quantity: 0,
  }
}

export function availableStockQuantity(level: StockLevelSnapshot | null | undefined): number {
  const available = Number(level?.available_quantity ?? 0)

  return Number.isFinite(available) ? Math.max(0, available) : 0
}
