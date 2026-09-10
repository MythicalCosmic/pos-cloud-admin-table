import { type Page, expect, test } from '@playwright/test'

const account = { id: 7, email: 'login@example.test', name: 'Login test', role: 'ADMIN', permissions: ['*'] }
const password = 'local-fixture-password'

async function setup(page: Page, locale = 'en', theme = 'light') {
  await page.addInitScript(initial => {
    if (!localStorage.getItem('appLocale'))
      localStorage.setItem('appLocale', initial.locale)
    if (!localStorage.getItem('alphapos-theme'))
      localStorage.setItem('alphapos-theme', initial.theme)
  }, { locale, theme })
}

async function fillLogin(page: Page) {
  await page.locator('#login-email').fill(account.email)
  await page.locator('#login-password').fill(password)
}

async function mockSession(page: Page, options: { role?: string; reject?: boolean; gate?: Promise<void>; offline?: boolean } = {}) {
  const requests: Array<{ path: string; body: unknown }> = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    requests.push({ path, body: request.postDataJSON() })
    if (path.endsWith('/auth-login')) {
      if (options.gate)
        await options.gate
      if (options.offline) {
        await route.abort('internetdisconnected')
        return
      }
      if (options.reject) {
        await route.fulfill({ status: 401, json: { message: 'Invalid credentials' } })
        return
      }
      await route.fulfill({ json: { data: { token: 'login-design-fixture', user: { ...account, role: options.role ?? 'ADMIN' } } } })
      return
    }
    if (path.endsWith('/auth-me')) {
      await route.fulfill({ json: { data: { role: options.role ?? 'ADMIN', business_day_start: '04:00', permissions: ['stock.catalog.view', 'stock.level.view'] } } })
      return
    }
    if (path.endsWith('/app-settings')) {
      await route.fulfill({ json: { data: { settings: { business_day_start: '04:00', business_open: '10:00', business_close: '23:00' } } } })
      return
    }
    await route.fulfill({ json: { data: { items: [], sessions: [], levels: [], total: 0 } } })
  })
  return requests
}

test('login validates fields, keeps the keyboard path usable, and reveals passwords without submitting', async ({ page }) => {
  await setup(page)

  const requests = await mockSession(page)

  await page.goto('/login')
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await expect(page.locator('.login-field__error')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.locator('#login-email')).toBeFocused()
  await expect(page.getByText('Enter your email address.', { exact: true })).toBeVisible()
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible()
  await page.locator('#login-email').fill('invalid')
  await page.locator('#login-email').press('Tab')
  await expect(page.locator('#login-password')).toBeFocused()
  await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible()
  await fillLogin(page)
  await page.locator('#login-password').press('Tab')
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text')
  await expect(page.locator('#login-password')).toHaveValue(password)
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'password')
  expect(requests.filter(r => r.path.endsWith('/auth-login'))).toHaveLength(0)
})

test('login preserves credentials after a rejection and retries successfully', async ({ page }) => {
  await setup(page)

  const state = { reject: true }

  await mockSession(page, state)
  await page.goto('/login?to=/sessions')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  const alert = page.getByRole('alert')

  await expect(alert).toBeVisible()
  await expect(alert).toBeFocused()
  await expect(alert).toContainText('Unable to sign in')
  await expect(page.locator('#login-password')).toHaveValue(password)
  await expect(page.locator('#login-email')).toHaveValue(account.email)
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  state.reject = false
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/sessions$/)
})

for (const role of ['ADMIN', 'WAREHOUSE']) {
  test(`login blocks duplicate submission and preserves ${role} session rules`, async ({ page }) => {
    await setup(page)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const requests = await mockSession(page, { role, gate })
    const destination = role === 'WAREHOUSE' ? '/warehouse' : '/sessions'

    await page.goto(`/login?to=${destination}`)
    await fillLogin(page)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Signing you in…' })).toBeDisabled()
    await expect(page.locator('#login-email')).toBeDisabled()
    await expect(page.locator('#login-password')).toBeDisabled()

    // Exercise the handler guard as well as the disabled submit control.
    await page.locator('form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(requests.filter(r => r.path.endsWith('/auth-login'))).toHaveLength(1)
    expect(requests.find(r => r.path.endsWith('/auth-login'))?.body).toEqual({ email: account.email, password })
    release()
    await expect(page).toHaveURL(new RegExp(`${destination}$`))

    const session = await page.evaluate(() => ({
      token: JSON.parse(localStorage.getItem('accessToken') || 'null'),
      user: JSON.parse(localStorage.getItem('userData') || 'null'),
      abilities: JSON.parse(localStorage.getItem('userAbilities') || 'null'),
    }))

    expect(session.token).toBe('login-design-fixture')
    expect(session.user.role).toBe(role)
    expect(session.user.business_day_start).toBe('04:00')
    expect(session.abilities).toEqual(role === 'WAREHOUSE' ? [{ action: 'read', subject: 'Auth' }] : [{ action: 'manage', subject: 'all' }])
    expect(requests.some(r => r.path.endsWith('/auth-me'))).toBe(true)
    expect(requests.some(r => r.path.endsWith('/app-settings'))).toBe(role !== 'WAREHOUSE')
  })
}

test('offline login has actionable feedback that follows the selected language', async ({ page }) => {
  await setup(page)
  await mockSession(page, { offline: true })
  await page.goto('/login')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not reach the server.')
  await page.getByRole('combobox', { name: 'Switch language' }).click()
  await page.getByRole('option', { name: 'Русский', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Нет связи с сервером.')
  await expect(page.locator('#login-password')).toHaveValue(password)
})

test('connection settings validate addresses, test connectivity, and return focus on Escape', async ({ page }) => {
  await setup(page)
  await page.route('**/healthz', route => route.fulfill({ status: 200, body: 'ok' }))
  await page.goto('/login')

  const trigger = page.getByRole('button', { name: 'Connection settings' })

  await trigger.click()

  const dialog = page.getByRole('dialog')
  const address = dialog.getByRole('textbox', { name: 'Base URL' })

  await expect(address).toBeFocused()
  await address.fill('javascript:alert(1)')
  await expect(dialog.getByRole('button', { name: 'Save & reload' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Test', exact: true })).toBeDisabled()
  await address.fill('http://127.0.0.1:8891')
  await dialog.getByRole('button', { name: 'Test', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Reached')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`login fits desktop, tablet and mobile in ${locale} / ${theme}`, async ({ page }) => {
      await setup(page, locale, theme)
      await page.goto('/login')
      await expect(page.locator('#app-loader')).toHaveCount(0)
      for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        await page.setViewportSize(viewport)
        await expect(page.locator('#login-email')).toBeVisible()
        await expect(page.locator('h1')).toBeVisible()

        const metrics = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.theme,
          inputHeight: document.querySelector('#login-email')?.getBoundingClientRect().height ?? 0,
          overflow: [...document.querySelectorAll('.login-panel h1, .login-field label, .login-access-hint, .login-panel__footer')].some(el => el.scrollWidth > el.clientWidth + 1),
        }))

        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width)
        expect(metrics.overflow).toBe(false)
        expect(metrics.inputHeight).toBeGreaterThanOrEqual(44)
        expect(metrics.theme).toBe(theme)
      }
    })
  }
}

test('login honors reduced motion and keeps theme controls synchronized', async ({ page }) => {
  await setup(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pause illustration animation' })).toHaveCount(0)
  expect(await page.locator('.login-scene__table-float').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(page.locator('.login-page')).toHaveAttribute('data-login-theme', 'dark')
  await expect(page.locator('.v-application')).toHaveClass(/v-theme--dark/)
  await page.reload()
  await expect(page.locator('.login-page')).toHaveAttribute('data-login-theme', 'dark')
})

test('login decorative motion can be paused without affecting the form', async ({ page }) => {
  await setup(page)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Pause illustration animation' }).click()
  expect(await page.locator('.login-scene__table-float').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Play illustration animation' }).click()
  expect(await page.locator('.login-scene__table-float').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('running')
  await expect(page.locator('#login-password')).toHaveValue(password)
})

test('login remains retryable when session hydration rejects the issued token', async ({ page }) => {
  await setup(page)
  await mockSession(page)
  await page.route('**/auth-me', route => route.fulfill({ status: 401, json: { message: 'Invalid token' } }))
  await page.goto('/login?to=/sessions')
  await fillLogin(page)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?to=/)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  await expect(page.locator('#login-password')).toHaveValue(password)
})
