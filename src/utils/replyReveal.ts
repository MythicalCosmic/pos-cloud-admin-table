/** Keep revealed text a prefix of the actual answer; complete table rows and fences together. */
export function replyBoundary(content: string, requested: number): number {
  const position = Math.max(0, Math.min(content.length, Math.floor(requested)))
  if (position === content.length || position === 0)
    return position
  const start = content.lastIndexOf('\n', position - 1) + 1
  const end = content.indexOf('\n', position)
  const line = content.slice(start, end < 0 ? content.length : end)
  if (/^\s*\|/.test(line)) {
    if (/^[\s|:\-]+$/.test(line))
      return content.lastIndexOf('\n', Math.max(0, start - 2)) + 1
    return start
  }
  if (/^\s*```/.test(line))
    return start
  const nextBreak = content.slice(position).search(/\s/)
  return nextBreak < 0 ? content.length : position + nextBreak
}
