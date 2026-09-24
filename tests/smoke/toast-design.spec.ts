import { expect, test } from '@playwright/test'

const translations = [
  { locale: 'en', title: 'Unable to sign in', description: 'Email or password is incorrect' },
  { locale: 'ru', title: 'Не удалось войти', description: 'Неверный email или пароль' },
  { locale: 'uz', title: 'Hisobga kirib boʻlmadi', description: 'Email yoki parol notoʻgʻri' },
]

for (const copy of translations) {
  for (const theme of ['light', 'dark']) {
    test(`login error toast is readable and dismissible in ${copy.locale}/${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: theme === 'light' ? 1440 : 390, height: 900 })
      await page.addInitScript(initial => {
        localStorage.setItem('appLocale', initial.locale)
        localStorage.setItem('alphapos-theme', initial.theme)
      }, { locale: copy.locale, theme })
      await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'Invalid credentials' } }))
      await page.goto('/login')
      await page.locator('#login-email').fill('toast@example.test')
      await page.locator('#login-password').fill('toast-test-password')
      await page.locator('button[type="submit"]').click()

      const toast = page.locator('.alpha-toast[data-type="error"]')

      await expect(toast).toHaveCount(1)
      await expect(toast).toHaveCSS('opacity', '1')
      await expect(toast.locator('[data-title]')).toHaveText(copy.title)
      await expect(toast.locator('[data-description]')).toHaveText(copy.description)
      await expect(page.locator('.alpha-toaster')).toHaveAttribute('data-sonner-theme', theme)

      const layout = await toast.evaluate(el => {
        const rect = el.getBoundingClientRect()
        const content = el.querySelector<HTMLElement>('[data-content]')
        const style = getComputedStyle(el)

        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          viewport: window.innerWidth,
          duration: style.transitionDuration,
          contentFits: !!content && content.scrollWidth <= content.clientWidth,
        }
      })

      expect(layout.left).toBeGreaterThanOrEqual(10)
      expect(layout.right).toBeLessThanOrEqual(layout.viewport - 10)
      expect(layout.top).toBeLessThan(50)
      expect(layout.duration).not.toBe('0s')
      expect(layout.contentFits).toBe(true)
      await page.screenshot({ path: `/tmp/smart-pos-toast-${copy.locale}-${theme}.png` })
      if (copy.locale === 'en' && theme === 'dark') {
        await page.mouse.move(layout.left + 80, layout.top + 36)
        await page.mouse.down()
        await page.mouse.move(layout.left + 300, layout.top + 36, { steps: 4 })
        await expect(toast).toHaveCSS('transition-duration', '0s')
        await page.mouse.up()
      }
      else {
        await toast.getByRole('button').focus()
        await page.keyboard.press('Enter')
      }
      await expect(toast).toHaveCount(0)
      await expect(page.locator('#login-password')).toHaveValue('toast-test-password')
    })
  }
}

test('server failures show a recovery message instead of a status code or HTML', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('appLocale', 'en'))
  await page.route('**/api/**', route => route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }))
  await page.goto('/login')
  await page.locator('#login-email').fill('toast@example.test')
  await page.locator('#login-password').fill('toast-test-password')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('.alpha-toast [data-description]')).toHaveText('The server is temporarily unavailable. Please try again shortly.')
  await expect(page.getByRole('alert')).toContainText('The server is temporarily unavailable.')
  await expect(page.locator('button[type="submit"]')).toBeEnabled()
})
