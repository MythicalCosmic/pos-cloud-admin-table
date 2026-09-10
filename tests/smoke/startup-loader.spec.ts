import { expect, test } from '@playwright/test'

for (const [locale, label] of [
  ['en', 'Opening your workspace'],
  ['ru', 'Открываем рабочее пространство'],
  ['uz', 'Ish maydoningiz ochilmoqda'],
]) {
  test(`startup loader appears before JavaScript and hands off cleanly in ${locale}`, async ({ page }) => {
    await page.addInitScript(initialLocale => {
      localStorage.setItem('appLocale', initialLocale)
      localStorage.setItem('alphapos-theme', 'dark')
    }, locale)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })

    await page.route('**/*.js', async route => { await gate; await route.continue() })
    await page.goto('/login', { waitUntil: 'commit' })
    await expect(page.getByRole('status')).toHaveText(label)
    await expect(page.locator('#app')).toHaveAttribute('inert', '')
    await expect(page.locator('#app-loader')).toHaveCSS('background-color', 'rgb(11, 18, 32)')
    await expect(page.getByRole('button')).toHaveCount(0)
    release()
    await expect(page.locator('.login-page')).toBeVisible()
    await expect(page.locator('#app-loader')).toHaveCount(0)
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '')
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('#login-email')).toBeEditable()
  })
}

test('startup loader uses system appearance and respects reduced motion before Vue starts', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })

  await page.route('**/*.js', async route => { await gate; await route.continue() })
  await page.goto('/login', { waitUntil: 'commit' })
  await expect(page.locator('#app-loader')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('.app-loader__outline-trace').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  expect(await page.locator('.app-loader__track span').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  release()
  await expect(page.locator('#app-loader')).toHaveCount(0)
})

test('startup script failures show recovery instead of an endless animation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('appLocale', 'en'))
  await page.route('**/*.js', route => route.abort('failed'))
  await page.goto('/login', { waitUntil: 'commit' })
  await expect(page.getByRole('status')).toHaveText('Your workspace couldn’t load.')
  await expect(page.getByText('Check your connection and try reloading.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible()
  await expect(page.locator('.app-loader__track')).toBeHidden()
  expect(await page.locator('.app-loader__outline-trace').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeFocused()
})

test('a slow startup offers a retry and can still finish without a forced delay', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('appLocale', 'en'))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })

  await page.route('**/*.js', async route => { await gate; await route.continue() })
  await page.goto('/login', { waitUntil: 'commit' })
  await expect(page.getByRole('status')).toHaveText('Taking a little longer than usual.', { timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible()
  release()
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await expect(page.locator('#login-email')).toBeEditable()
})
