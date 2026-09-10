/** A rounded annular sector; angles still come from the actual share of the total. */
export function roundedSector(from: number, to: number, outer = 94, inner = 61, radius = 5): string {
  const span = Math.max(0, to - from)
  const corner = Math.min(radius, span * inner / 4, (outer - inner) / 2)
  const outerInset = corner / outer
  const innerInset = corner / inner
  const point = (angle: number, r: number) => `${(110 + Math.cos(angle) * r).toFixed(4)} ${(110 + Math.sin(angle) * r).toFixed(4)}`
  const outerLarge = span - 2 * outerInset > Math.PI ? 1 : 0
  const innerLarge = span - 2 * innerInset > Math.PI ? 1 : 0

  return [
    `M${point(from + outerInset, outer)}`,
    `A${outer} ${outer} 0 ${outerLarge} 1 ${point(to - outerInset, outer)}`,
    `Q${point(to, outer)} ${point(to, outer - corner)}`,
    `L${point(to, inner + corner)}`,
    `Q${point(to, inner)} ${point(to - innerInset, inner)}`,
    `A${inner} ${inner} 0 ${innerLarge} 0 ${point(from + innerInset, inner)}`,
    `Q${point(from, inner)} ${point(from, inner + corner)}`,
    `L${point(from, outer - corner)}`,
    `Q${point(from, outer)} ${point(from + outerInset, outer)} Z`,
  ].join(' ')
}
