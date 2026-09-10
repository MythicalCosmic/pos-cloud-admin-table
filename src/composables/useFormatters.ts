import { fmtAbbr, fmtDateTime, fmtNum, useFormatMode } from '@/components/design/utils/format'

export function useFormatters() {
  const { mode } = useFormatMode()
  const { locale } = useI18n({ useScope: 'global' })

  const dateLocale = computed(() => {
    if (locale.value === 'ru')
      return 'ru-RU'
    if (locale.value === 'uz')
      return 'uz-UZ'
    return 'en-GB'
  })

  function formatCurrency(val: number | string): string {
    const n = Math.round(Number(val) || 0)
    if (mode.value === 'short' && Math.abs(n) >= 10000)
      return fmtAbbr(n)
    return fmtNum(n)
  }

  function formatDate(val: string): string {
    if (!val)
      return '—'

    return fmtDateTime(val)
  }

  function formatDateShort(val: string): string {
    if (!val)
      return '—'

    return new Date(val).toLocaleDateString(dateLocale.value)
  }

  return { formatCurrency, formatDate, formatDateShort }
}
