/** Keep order channels recognizable across charts, legends, and reporting rows. */
export function orderChannelColors(palette = {
  primary: 'var(--primary)',
  secondary: 'var(--c4)',
  expense: 'var(--c3)',
}) {
  return {
    hall: palette.primary,
    delivery: palette.secondary,
    pickup: palette.expense,
  }
}
