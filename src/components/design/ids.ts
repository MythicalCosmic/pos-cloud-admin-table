let nextDesignId = 0

export function designId(prefix: string): string {
  nextDesignId += 1
  return `${prefix}-${nextDesignId}`
}
