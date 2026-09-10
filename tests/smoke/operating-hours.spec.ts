import { expect, type Page, test } from '@playwright/test'
import { expectControlsToFit } from './helpers/controlGeometry'

interface State { fail?: boolean; gate?: Promise<void> }
async function setup(page: Page, locale = 'en', theme = 'dark', palette = 'blue', state: State = {}) {
  const writes: any[] = []
  await page.addInitScript(({ locale, theme, palette }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('alphapos-palette', palette)
    localStorage.setItem('businessOpen', '07:00')
    localStorage.setItem('businessClose', '03:00')
    localStorage.setItem('accessToken', JSON.stringify('operating-hours-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme, palette })
  await page.route('**/api/**', async route => {
    const req = route.request()
    if (req.method() === 'PUT') {
      writes.push(req.postDataJSON())
      if (state.gate) await state.gate
      await route.fulfill({ status: state.fail ? 422 : 200, json: state.fail ? { message: 'Working hours could not be saved.' } : { data: {} } })
      return
    }
    await route.fulfill({ json: { data: { items: [], sessions: [], total: 0 } } })
  })
  await page.goto('/sessions')
  await expect(page.locator('#app-loader')).toHaveCount(0)
  return writes
}

for (const locale of ['en', 'ru', 'uz']) for (const palette of ['blue', 'forest']) for (const theme of ['light', 'dark']) {
  test(`operating hours controls fit ${locale}/${palette}/${theme}`, async ({ page }) => {
    await setup(page, locale, theme, palette)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.locator('button[aria-controls^="operating-hours-"]').click()
      const panel = page.locator('.setmenu')
      await expect(panel).toBeVisible()
      await expectControlsToFit(page)
      const rect = await panel.boundingBox()
      expect(rect!.x).toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
      if ([1440, 320].includes(width)) await page.screenshot({ path: `/tmp/alpha-hours-${locale}-${palette}-${theme}-${width}.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await expect(page.locator('button[aria-controls^="operating-hours-"]')).toBeFocused()
    }
  })
}

test('a nested time picker saves once, shows server errors, and restores focus to each layer', async ({ page }) => {
  const state: State = { fail: true }
  const writes = await setup(page, 'en', 'dark', 'blue', state)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByRole('button', { name: 'Operating hours', exact: true }).click()
  const panel = page.locator('.setmenu')
  const start = panel.getByRole('button', { name: 'Working hours From', exact: true })
  // A native modal makes the page inert while still allowing browser-chrome
  // focus. Assert field traversal rather than forbidding that platform behavior.
  expect(await panel.evaluate(node => node.matches(':modal'))).toBe(true)
  await panel.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(start).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: 'Working hours To', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(start).toBeFocused()
  await start.click()
  const clock = page.locator('dialog.calendar-popover[open]')
  await expect(clock).toBeVisible()
  await clock.getByRole('textbox', { name: 'Hours', exact: true }).fill('09')
  await clock.getByRole('textbox', { name: 'Minutes', exact: true }).fill('30')
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await clock.getByRole('button', { name: 'Apply', exact: true }).dblclick()
  await expect(panel).toBeVisible()
  expect(writes).toEqual([{ business_open: '09:30', business_close: '03:00' }])
  await expect(start).toBeDisabled()
  await expect(panel.getByRole('status')).toHaveText('Saving changes…')
  release()
  await expect(panel.getByRole('alert')).toHaveText('Working hours could not be saved.')
  await expect(panel.getByRole('alert')).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-hours-save-error-mobile.png', animations: 'disabled' })
  await expect(start).toContainText('07:00')
  state.fail = false
  state.gate = undefined
  await start.click()
  await clock.getByRole('textbox', { name: 'Hours', exact: true }).fill('09')
  await clock.getByRole('textbox', { name: 'Minutes', exact: true }).fill('30')
  await clock.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(start).toContainText('09:30')
  await expect(start).toBeEnabled()
  await expect(panel.getByRole('status')).toHaveText('Settings saved')
  await start.click()
  await page.keyboard.press('Escape')
  await expect(clock).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(start).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.getByRole('button', { name: 'Operating hours', exact: true })).toBeFocused()
  await expectControlsToFit(page)
})
