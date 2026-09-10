/** Choose a readable foreground on solid or translucent palette colours. */
export function chartTextColor(background: string, surface?: string, opacity = 1): string {
  const channels = (color: string) => {
    const hex = color.trim().replace(/^#/, '')
    return /^[\da-f]{6}$/i.test(hex) ? [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) : null
  }

  const foreground = channels(background)
  if (!foreground)
    return '#FFFFFF'
  const behind = surface ? channels(surface) : null
  const alpha = Math.min(1, Math.max(0, opacity))
  const mixed = behind ? foreground.map((value, index) => value * alpha + behind[index] * (1 - alpha)) : foreground

  const luminance = (values: number[]) => values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)

  const lightness = luminance(mixed)
  const darkContrast = (lightness + 0.05) / (luminance([11 / 255, 18 / 255, 32 / 255]) + 0.05)
  const whiteContrast = 1.05 / (lightness + 0.05)
  if (Math.max(darkContrast, whiteContrast) < 4.5)
    return '#000000'
  return darkContrast >= whiteContrast ? '#0B1220' : '#FFFFFF'
}
