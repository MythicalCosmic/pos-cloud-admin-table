/** Keep endpoint labels while reserving enough room between adjacent ticks. */
export function labelTicks(labels: string[], width: number, minimumStep = 1, banded = false): Set<number> {
  const last = labels.length - 1
  if (last < 0)
    return new Set()
  if (last === 0)
    return new Set([0])
  const labelWidth = Math.max(56, ...labels.map(label => label.length * 8 + 20))
  const spacing = Math.max(1, width / (banded ? labels.length : last))
  const step = Math.max(minimumStep, Math.ceil(labelWidth / spacing))
  const indices = Array.from({ length: Math.floor(last / step) + 1 }, (_, i) => i * step)
  const previous = indices[indices.length - 1]
  if (previous < last) {
    if (previous > 0 && last - previous < step)
      indices.pop()
    indices.push(last)
  }
  return new Set(indices)
}
