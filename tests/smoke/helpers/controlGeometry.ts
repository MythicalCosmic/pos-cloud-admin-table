import { expect, type Page } from '@playwright/test'

// Check the rendered contents, not just the document's scroll width: a parent
// with overflow:hidden can conceal broken controls while the page still fits.
export async function expectControlsToFit(page: Page) {
  const problems = await page.evaluate(() => {
    const results: string[] = []
    for (const trigger of document.querySelectorAll<HTMLElement>('.date-input__trigger')) {
      const box = trigger.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const value = trigger.querySelector<HTMLElement>(':scope > span')
      if (!value) continue
      const text = value.textContent?.trim() || ''
      const rect = value.getBoundingClientRect()
      if (rect.height > box.height || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)
        results.push(`Date/time value escapes its control: ${text}`)
      if (/^\d{1,2}:\d{2}$/.test(text) && value.scrollWidth > value.clientWidth + 1)
        results.push(`Time is clipped: ${text}`)
    }
    for (const control of document.querySelectorAll<HTMLElement>('.control > .control, .control > .date-input, .control > .control-container')) {
      if (control.getBoundingClientRect().width && control.getBoundingClientRect().height)
        results.push(`Duplicate control surface: ${control.className}`)
    }
    for (const state of document.querySelectorAll<HTMLElement>('.data-table .statefill')) {
      const rect = state.getBoundingClientRect()
      const table = state.closest('.data-table')!.getBoundingClientRect()
      if (rect.width && rect.height && (rect.left < Math.max(0, table.left) - 1 || rect.right > Math.min(innerWidth, table.right) + 1))
        results.push(`Table state is clipped: ${state.textContent?.trim()}`)
    }
    return [...new Set(results)]
  })
  expect(problems).toEqual([])
}
