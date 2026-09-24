import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { alphaPaletteIds, alphaPaletteTokens } from '../../src/config/palettes'
import { expectControlsToFit } from './helpers/controlGeometry'

const copies = Object.fromEntries(['en', 'ru', 'uz'].map(locale => [locale, JSON.parse(fs.readFileSync(`src/plugins/i18n/locales/${locale}.json`, 'utf8'))]))
const sessions = [
  { id: 'front-desk-session', ip_address: '10.0.0.18', user_agent: 'Chrome — Front desk / Основная касса / Bosh kassa', is_current: true, last_activity: '2026-09-10T08:30:00Z' },
  { id: 'floor-tablet-session', ip_address: '10.0.0.21', user_agent: 'Android tablet — Restaurant floor', is_current: false, last_activity: '2026-09-10T08:24:00Z' },
]
interface State { failSessions?: boolean; gate?: Promise<void> }
async function setup(page: Page, locale = 'en', palette = 'blue', mode = 'light', state: State = {}) {
  await page.addInitScript(({ locale, palette, mode }) => {
    if (!localStorage.getItem('polish-initialized')) {
      localStorage.setItem('appLocale', locale)
      localStorage.setItem('alphapos-palette', palette)
      localStorage.setItem('alphapos-theme', mode)
      localStorage.setItem('polish-initialized', '1')
    }
    localStorage.setItem('accessToken', JSON.stringify('appearance-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, palette, mode })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth-sessions')) {
      if (state.gate) await state.gate
      await route.fulfill({ status: state.failSessions ? 503 : 200, json: state.failSessions ? { message: 'Session service unavailable' } : { data: { sessions } } })
      return
    }
    const collections = Object.fromEntries(['items', 'users', 'employees', 'departments', 'events', 'goals', 'documents', 'reviews', 'products', 'categories', 'sessions', 'notifications', 'roles', 'permissions'].map(key => [key, []]))
    await route.fulfill({ json: { data: { ...collections, total: 0, settings: { hr_enabled: true, stock_enabled: true, waiter_enabled: true }, role: 'ADMIN' } } })
  })
}

async function appearance(page: Page, locale: string) {
  const copy = copies[locale]
  await page.getByRole('button', { name: copy['Account menu'], exact: true }).click()
  await page.getByRole('menuitem', { name: copy.appearance_title, exact: true }).click()
  return page.getByRole('dialog', { name: copy.appearance_title, exact: true })
}

function rgb(hex: string) {
  let value = hex.slice(1)
  if (value.length === 3) value = value.split('').map(c => c + c).join('')
  return value.match(/../g)!.map(c => parseInt(c, 16))
}
function contrast(a: string, b: string) {
  const luminance = (hex: string) => rgb(hex).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('every palette keeps body, placeholder and button text readable on its tinted surfaces', () => {
  for (const palette of alphaPaletteIds) for (const mode of ['light', 'dark'] as const) {
    const tokens = alphaPaletteTokens(palette, mode)
    for (const foreground of ['text', 'text-secondary', 'text-tertiary']) for (const background of ['bg', 'surface', 'surface-2', 'surface-inset', 'primary-weak'])
      expect(contrast(tokens[foreground], tokens[background]), `${palette}/${mode}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
    for (const background of ['primary', 'primary-hover', 'primary-active'])
      expect(contrast(tokens['on-primary'], tokens[background]), `${palette}/${mode}: button ${background}`).toBeGreaterThanOrEqual(4.5)
  }
})

for (const [index, palette] of alphaPaletteIds.entries()) for (const mode of ['light', 'dark'] as const) {
  const locale = ['en', 'ru', 'uz'][index % 3]
  test(`${palette}/${mode} previews, controls, phone layout and persistence agree in ${locale}`, async ({ page }) => {
    await setup(page, locale)
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto('/sessions')
    const panel = await appearance(page, locale)
    await panel.getByRole('button', { name: copies[locale][`appearance_${palette}`], exact: true }).click()
    await panel.getByRole('button', { name: copies[locale][`appearance_${mode}`], exact: true }).click()
    for (const option of alphaPaletteIds) {
      const preview = panel.getByRole('button', { name: copies[locale][`appearance_${option}`], exact: true }).locator('.appearance__preview')
      await expect(preview).toHaveCSS('background-color', `rgb(${rgb(alphaPaletteTokens(option, mode).bg).join(', ')})`)
    }
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 820 })
      const box = await panel.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      if ([1440, 320].includes(width)) await page.screenshot({ path: `/tmp/alpha-theme-pass/appearance-${palette}-${mode}-${width}.png`, animations: 'disabled' })
    }
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-palette', palette)
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    const tokens = alphaPaletteTokens(palette, mode)
    // The glass finish paints the palette background (under its ambient washes)
    // on body; Vuetify's root is transparent but must still mirror the token.
    await expect(page.locator('body')).toHaveCSS('background-color', `rgb(${rgb(tokens.bg).join(', ')})`)
    expect(await page.locator('.v-application').evaluate(el => getComputedStyle(el).getPropertyValue('--v-theme-background').replace(/\s/g, ''))).toBe(rgb(tokens.bg).join(','))
    const colors = await page.locator('.v-application').evaluate(el => ({ raw: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(), mirrored: getComputedStyle(el).getPropertyValue('--v-theme-primary').replace(/\s/g, '') }))
    expect(colors).toEqual({ raw: tokens.primary, mirrored: rgb(tokens.primary).join(',') })
    await expect(page.locator('.mobile-record')).toHaveCount(2)
    await expectControlsToFit(page)
    await page.screenshot({ path: `/tmp/alpha-theme-pass/sessions-${palette}-${mode}-320.png`, animations: 'disabled' })
  })
}

for (const mode of ['light', 'dark'] as const) test(`saved palette paints the startup loader before Vue loads in ${mode}`, async ({ page }) => {
  await setup(page, 'en', 'amber', mode)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/src/main.ts', async route => { await gate; await route.continue() })
  await page.goto('/sessions', { waitUntil: 'commit' })
  await expect(page.locator('#app-loader')).toHaveCSS('background-color', `rgb(${rgb(alphaPaletteTokens('amber', mode).bg).join(', ')})`)
  release()
  await page.waitForLoadState('load')
  await expect(page.locator('#app-loader')).toHaveCount(0)
})

test('unknown saved palette safely falls back to Blue', async ({ page }) => {
  await setup(page, 'en', 'retired-palette')
  await page.goto('/sessions')
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'blue')
  await expect(page.getByRole('button', { name: copies.en.Language, exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: copies.en.sessions_current_only, exact: true })).toBeVisible()
  await expect(page.locator('.data-table')).toContainText('10.0.0.18')
})

test('phone session filters can be removed with a named keyboard button without losing record details', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 320, height: 820 })
  await page.goto('/sessions')
  await page.getByRole('button', { name: 'Search & filters', exact: true }).click()
  const search = page.getByRole('textbox', { name: copies.en.sessions_search_placeholder, exact: true })
  await search.fill('Front desk')
  await expect(page.locator('.mobile-record')).toHaveCount(1)
  const remove = page.locator('.chips').getByRole('button', { name: copies.en.Remove, exact: true })
  const box = await remove.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await remove.focus()
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('')
  await expect(page.locator('.mobile-record')).toHaveCount(2)
  await page.locator('.mobile-record').first().getByRole('button', { name: copies.en.Details, exact: true }).click()
  await expect(page.locator('.mobile-record').first()).toContainText(sessions[0].id)
  await expect(page.locator('.mobile-record').first()).toContainText(sessions[0].user_agent)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: '/tmp/alpha-theme-pass/session-expanded-320.png', animations: 'disabled' })
})

test('a failed refresh retains sessions, displays the themed error and never announces success', async ({ page }) => {
  const state: State = {}
  await setup(page, 'en', 'violet', 'dark', state)
  await page.goto('/sessions')
  await expect(page.locator('.data-table')).toContainText('10.0.0.18')
  state.failSessions = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.sessions-error')).toHaveText(copies.en.sessions_load_error)
  const toast = page.locator('.alpha-toast[data-type="error"]')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveCSS('background-color', `rgb(${rgb(alphaPaletteTokens('violet', 'dark').surface).join(', ')})`)
  await expect(page.locator('.alpha-toast[data-type="success"]')).toHaveCount(0)
  await expect(page.locator('.data-table')).toContainText('10.0.0.18')
  await page.screenshot({ path: '/tmp/alpha-theme-pass/session-error-violet.png', animations: 'disabled' })
  state.failSessions = false
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.sessions-error')).toHaveCount(0)
})

const formCases = [
  ['/hr-events', 'hr_event_action_log'],
  ['/hr-goals', 'hr_goals_new'],
  ['/hr-documents', 'hr_documents_new'],
  ['/hr-reviews', 'New Review'],
  ['/hr-departments', 'New Department'],
] as const
for (const [route, action] of formCases) test(`${route} dialog preserves sizing, long text and accessible controls`, async ({ page }) => {
  await setup(page, 'ru', 'teal', 'light')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(route)
  await page.getByRole('button', { name: copies.ru[action], exact: true }).first().click()
  const panel = page.locator('.modal[role="dialog"]')
  await expect(panel).toBeVisible()
  if (route === '/hr-events') {
    await expect(page.locator('.overlay.hr-events-modal--lg')).toBeVisible()
    await expect(panel).toHaveCSS('max-width', '640px')
    await panel.getByRole('button', { name: copies.ru[action], exact: true }).click()
    const firstInvalid = panel.locator('[aria-invalid="true"]').first()
    await expect(firstInvalid).toBeVisible()
    await expect(firstInvalid).toBeFocused()
    await expect(page.locator('.alpha-toast')).toHaveCount(0)
  }
  const textarea = panel.locator('textarea:not([disabled]):not([readonly])').first()
  if (await textarea.count()) await textarea.fill('Подробное описание для проверки длинных значений, переноса строк и доступности элементов формы.')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 820 })
    await expectControlsToFit(page)
    const escaped = await panel.evaluate(node => {
      const box = node.getBoundingClientRect()
      return [...node.querySelectorAll<HTMLElement>('.control')].filter(el => {
        const rect = el.getBoundingClientRect()
        return rect.width && rect.height && (rect.left < box.left - 1 || rect.right > box.right + 1)
      }).length
    })
    expect(escaped).toBe(0)
    if ([1440, 320].includes(width)) await page.screenshot({ path: `/tmp/alpha-theme-pass/form-${route.slice(1)}-${width}.png`, animations: 'disabled' })
  }
  expect(errors).toEqual([])
})

test('session loading failures offer retry and revoke actions guard duplicate requests and keep server errors visible', async ({ page }) => {
  const state: State = { failSessions: true }
  await setup(page, 'en', 'rose', 'light', state)
  const writes: { method: string; body: unknown }[] = []
  let release!: () => void
  let gate: Promise<void>
  await page.route('**/api/admins/auth-*', async route => {
    if (!['DELETE', 'POST'].includes(route.request().method())) return route.fallback()
    writes.push({ method: route.request().method(), body: route.request().postDataJSON() })
    await gate
    await route.fulfill({ status: 503, json: { message: route.request().method() === 'DELETE' ? 'Could not revoke this session. Try again.' : 'Could not sign out other sessions. Try again.' } })
  })
  await page.goto('/sessions')
  await expect(page.locator('.data-table')).toContainText(copies.en.sessions_load_error)
  state.failSessions = false
  await page.locator('.data-table').getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.data-table')).toContainText('10.0.0.21')
  for (const [action, title, method] of [
    ['sessions_action_revoke', 'sessions_confirm_revoke_title', 'DELETE'],
    ['sessions_action_logout_all', 'sessions_confirm_logout_all_title', 'POST'],
  ]) {
    gate = new Promise<void>(resolve => { release = resolve })
    await page.getByRole('button', { name: copies.en[action], exact: true }).click()
    const dialog = page.getByRole('dialog', { name: copies.en[title], exact: true })
    const submit = dialog.getByRole('button', { name: copies.en[action], exact: true })
    await submit.dblclick()
    await expect(submit).toBeDisabled()
    await expect.poll(() => writes.filter(write => write.method === method).length).toBe(1)
    release()
    const message = method === 'DELETE' ? 'Could not revoke this session. Try again.' : 'Could not sign out other sessions. Try again.'
    await expect(page.locator('.alpha-toast[data-type="error"]').filter({ hasText: message })).toBeVisible()
    await expect(submit).toBeEnabled()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  expect(writes).toEqual([
    { method: 'DELETE', body: { session_id: 'floor-tablet-session' } },
    { method: 'POST', body: null },
  ])
})
