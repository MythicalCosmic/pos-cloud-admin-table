import { type Page, expect, test } from '@playwright/test'

const answer = '## A clearer picture\n\nRevenue is **1,250,000 UZS**.\n\n| Method | Amount |\n|---|---:|\n| Cash | 750,000 |\n| Card | 500,000 |\n\n```chart\n{"type":"bar","title":"Payments","data":[{"label":"Cash","value":750000},{"label":"Card","value":500000}]}\n```\n\nYour busiest service was lunch.'
const history = [{ id: 7, title: 'September review', updated_at: '2026-09-08T11:00:00Z', message_count: 2, preview: 'Revenue review' }]

interface State {
  reply?: string
  fail?: boolean
  failList?: boolean
  failDetail?: boolean
  failMutation?: boolean
  gate?: Promise<void>
  populated?: boolean
}

async function setup(page: Page, state: State = {}, locale = 'en', theme = 'light') {
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('accessToken', JSON.stringify('ai-workspace-test-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Design review', role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  const calls: { path: string, method: string, body: any }[] = []
  let title = history[0].title
  let deleted = false
  page.on('pageerror', error => { throw error })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    calls.push({ path, method: request.method(), body: request.postDataJSON() })
    if (path.endsWith('/ai/chats/') && request.method() === 'GET') {
      await route.fulfill({ status: state.failList ? 500 : 200, json: { chats: state.populated && !deleted ? [{ ...history[0], title }] : [] } })
    }
    else if (path.endsWith('/ai/chats/') && request.method() === 'POST') {
      await route.fulfill({ json: { success: true, chat: { id: 55 } } })
    }
    else if (path.endsWith('/ai/chats/7/')) {
      await route.fulfill({ status: state.failDetail ? 500 : 200, json: { success: true, chat: { id: 7, title, messages: [{ id: 1, role: 'user', content: 'Review September revenue', ts: 1788879000000 }, { id: 2, role: 'assistant', content: answer, ts: 1788879020000 }] } } })
    }
    else if (path.endsWith('/rename/')) {
      if (!state.failMutation) title = request.postDataJSON().title
      await route.fulfill({ status: state.failMutation ? 500 : 200, json: { success: !state.failMutation } })
    }
    else if (path.endsWith('/delete/')) {
      if (!state.failMutation) deleted = true
      await route.fulfill({ status: state.failMutation ? 500 : 200, json: { success: !state.failMutation } })
    }
    else if (path.endsWith('/ai/query/')) {
      if (state.gate) await state.gate
      await route.fulfill({ status: state.fail ? 429 : 200, json: state.fail ? { success: false, error: 'rate_limited' } : { success: true, response: state.reply ?? answer } }).catch(() => {})
    }
    else await route.fulfill({ json: { data: { items: [], total: 0 }, suggestions: [], actions: [] } })
  })
  return calls
}
const composer = (page: Page) => page.locator('#assistant-message-input')
async function noOverflow(page: Page) {
  const clippedRegions = await page.locator('.ai-workspace').evaluate(workspace => {
    const bounds = workspace.getBoundingClientRect()
    return [...workspace.querySelectorAll('.assistant-header, .assistant-scroll, .assistant-compose, .assistant-composer, .assistant-send')].filter(el => {
      const rect = el.getBoundingClientRect()
      return rect.right > bounds.right + 1 || rect.left < bounds.left - 1
    }).map(el => el.className)
  })
  expect(clippedRegions).toEqual([])
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    compose: document.querySelector('.assistant-compose')!.getBoundingClientRect().bottom,
    thread: document.querySelector('.ai-workspace')!.getBoundingClientRect().bottom,
    height: window.innerHeight,
    clips: [...document.querySelectorAll<HTMLElement>('.assistant-header__actions, .assistant-composer__toolbar, .assistant-prompt, .assistant-message__notice')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
  }))
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.compose).toBeLessThanOrEqual(geometry.thread + 1)
  expect(geometry.thread).toBeLessThanOrEqual(geometry.height + 1)
  expect(geometry.clips).toEqual([])
}

test('AI sends one request with date context, renders tables and charts, and exports the answer', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/ai-assistant')
  await page.getByRole('button', { name: 'Understand sales Revenue, orders and what changed.' }).click()
  await expect(composer(page)).toHaveValue('How were sales today?')
  expect(calls.filter(call => call.path.endsWith('/ai/query/'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Set a period', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Send', exact: true }).dblclick()
  await expect(page.locator('.assistant-message__answer')).toContainText('A clearer picture')
  await expect(page.locator('.assistant-message__answer table')).toBeVisible()
  await expect(page.locator('.aichart')).toBeVisible()
  const requests = calls.filter(call => call.path.endsWith('/ai/query/'))
  expect(requests).toHaveLength(1)
  expect(requests[0].body).toMatchObject({ conversation_id: 55, locale: 'en', query: 'How were sales today?', context: { route: '/ai-assistant' } })
  expect(requests[0].body.context.range_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(composer(page)).toHaveValue('')
  await page.getByRole('button', { name: 'Show this as a table', exact: true }).click()
  await expect(composer(page)).toHaveValue('Show this as a table')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export chat', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/^alpha-pos-.*\.md$/)
  await noOverflow(page)
})

test('pending answers can be stopped and cannot consume a draft in another conversation', async ({ page }) => {
  let release!: () => void
  const state: State = { gate: new Promise<void>(resolve => { release = resolve }) }
  const calls = await setup(page, state)
  await page.goto('/ai-assistant')
  await composer(page).fill('Review my sales')
  await composer(page).press('Enter')
  await expect(page.getByText('Working on your answer', { exact: true })).toBeVisible()
  await expect.poll(() => calls.filter(call => call.path.endsWith('/ai/query/')).length).toBe(1)
  await page.getByRole('button', { name: 'New chat', exact: true }).click()
  await composer(page).fill('Keep this draft safe')
  await composer(page).press('Enter')
  await expect(composer(page)).toHaveValue('Keep this draft safe')
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click()
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click()
  await expect(page.locator('.assistant-message.is-stopped')).toContainText('Request stopped')
  release()
  await expect(page.locator('.assistant-message__answer')).toHaveCount(0)
  expect(calls.filter(call => call.path.endsWith('/ai/query/'))).toHaveLength(1)
  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  await expect(composer(page)).toHaveValue('Keep this draft safe')
})

test('failed answers show a clear error and support retry', async ({ page }) => {
  const state: State = { fail: true }
  await setup(page, state)
  await page.goto('/ai-assistant')
  await composer(page).fill('Review my sales')
  await composer(page).press('Enter')
  await expect(page.locator('.assistant-message.is-error [role="alert"]')).toContainText('Too many AI requests')
  state.fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.assistant-message__answer')).toContainText('A clearer picture')
})

test('history supports hydration, message search, pinned chats, and honest rename/delete failures', async ({ page }) => {
  const state: State = { populated: true, failDetail: true, failMutation: true }
  const calls = await setup(page, state)
  await page.goto('/ai-assistant')
  await page.getByRole('button', { name: 'September review', exact: true }).click()
  await expect(page.getByText('This conversation could not be opened')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  state.failDetail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.assistant-message__answer')).toContainText('Your busiest service was lunch.')
  await expect(page.locator('.progressive-reply')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.assistant-reveal-control')).toHaveCount(0)
  await page.getByRole('searchbox').fill('busiest')
  await expect(page.getByRole('button', { name: 'September review', exact: true })).toBeVisible()
  await page.getByRole('searchbox').fill('')
  await page.getByRole('button', { name: 'Pin conversation', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Pinned', exact: true })).toBeVisible()
  await page.locator('.assistant-header').getByRole('button', { name: 'Rename chat', exact: true }).click()
  await page.getByRole('textbox', { name: 'Conversation name' }).fill('Weekly overview')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('The name could not be saved')
  state.failMutation = false
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Weekly overview', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Pinned', exact: true })).toBeVisible()
  state.failMutation = true
  await page.getByRole('button', { name: 'Delete chat', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Delete chat', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Could not delete chat')
  state.failMutation = false
  await page.getByRole('dialog').getByRole('button', { name: 'Delete chat', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Weekly overview', exact: true })).toHaveCount(0)
  expect(calls.filter(call => call.path.endsWith('/rename/')).every(call => call.method === 'POST')).toBeTruthy()
  expect(calls.filter(call => call.path.endsWith('/delete/')).every(call => call.method === 'POST')).toBeTruthy()
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`AI workspace is responsive and readable in ${locale} ${theme}`, async ({ page }) => {
      let release!: () => void
      await setup(page, { gate: new Promise<void>(resolve => { release = resolve }) }, locale, theme)
      await page.goto('/ai-assistant')
      await expect(page.locator('.assistant-welcome')).toBeVisible()
      await expect(page.locator('#app-loader')).toHaveCount(0)
      for (const width of [1440, 1100, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width > 768 ? 900 : 844 })
        await noOverflow(page)
        await expect(page.locator('.ai-workspace')).not.toContainText('ai_workspace_')
        if ([1440, 390].includes(width)) await page.screenshot({ path: `/tmp/smart-pos-ai-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      }
      await page.locator('.assistant-header__identity button').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.assistant-header__identity button')).toBeFocused()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(await page.locator('.assistant-welcome').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
      await page.getByRole('combobox').click()
      await page.getByRole('option').nth(2).click()
      await composer(page).fill('Review the next service')
      await composer(page).press('Enter')
      await expect(page.locator('.assistant-pending')).toBeVisible()
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        await noOverflow(page)
        const clipped = await page.locator('.assistant-composer__context > button:first-child > span, .assistant-answer-style .select__label').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent))
        expect(clipped).toEqual([])
        await expect(page.locator('.assistant-send.is-stop')).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: `/tmp/alpha-ai-pending-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      }
      release()
      await expect(page.locator('.assistant-message__answer')).toContainText('A clearer picture')
      await expect(page.locator('.progressive-reply')).toHaveAttribute('aria-busy', 'false')
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await noOverflow(page)
        await page.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0 })
        if ((locale === 'en' && theme === 'dark') || (locale === 'ru' && theme === 'light')) await page.screenshot({ path: `/tmp/alpha-ai-answer-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      }
    })
  }
}


test('malformed chart responses expose their data without a permanent loader or fabricated zeros', async ({ page }) => {
  await setup(page, { reply: 'A result.\n\n```chart\n{"type":"bar","data":[{"label":"Cash","value":null}]}\n```\n\n```chart\n{broken' })
  await page.goto('/ai-assistant')
  await composer(page).fill('Show payments')
  await composer(page).press('Enter')
  await expect(page.locator('.md-chart-fallback')).toHaveCount(2)
  await expect(page.getByText('Generating chart…')).toHaveCount(0)
  await page.locator('.md-chart-fallback').first().locator('summary').click()
  await expect(page.locator('.md-chart-fallback').first().locator('pre')).toContainText('null')
})


test('new replies reveal progressively, follow the latest text, and respect scrolling up or showing the full answer', async ({ page }) => {
  let release!: () => void
  const state: State = { gate: new Promise(resolve => { release = resolve }), reply: '## Start here\n\n' + Array.from({ length: 45 }, (_, i) => `Step ${i + 1}: Review the real report before changing service.\n\n`).join('') }
  const calls = await setup(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ai-assistant')
  await page.getByRole('combobox', { name: 'Answer style', exact: true }).click()
  await page.getByRole('option', { name: 'Actions', exact: true }).click()
  await composer(page).fill('Plan tomorrow')
  await composer(page).press('Enter')
  await expect(page.locator('.assistant-pending')).toBeVisible()
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-ai-pending-phone.png', animations: 'disabled' })
  release()
  await expect(page.locator('.progressive-reply')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.assistant-message__answer')).not.toContainText('Step 45:')
  await expect(page.locator('.assistant-message__question')).toHaveText('Plan tomorrow')
  const sent = calls.find(call => call.path.endsWith('/ai/query/'))
  expect(sent?.body.query).toContain('prioritized action plan')
  expect(sent?.body.query).toContain('Plan tomorrow')
  await expect.poll(() => page.locator('.assistant-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(160)
  const textLength = await page.locator('.assistant-message__answer').innerText()
  expect(textLength.length).toBeLessThan(state.reply!.length)
  await page.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
  await expect(page.getByRole('button', { name: 'Jump to latest', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show full answer', exact: true }).click()
  await expect(page.locator('.progressive-reply')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.assistant-message__answer')).toContainText('Step 45:')
  expect(await page.locator('.assistant-scroll').evaluate(el => el.scrollTop)).toBeLessThan(20)
  await page.getByRole('button', { name: 'Jump to latest', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Jump to latest', exact: true })).toHaveCount(0)
  await noOverflow(page)
})

test('ranked answer tables use the available width and preserve all server quantities', async ({ page }) => {
  const rows = Array.from({ length: 10 }, (_, i) => `| ${i + 1} | Product ${i + 1} with a descriptive menu name | ${822 - i * 37} pcs |`).join('\n')
  await setup(page, { reply: `## Top items this month\n\nQuantity sold from paid sales, with refunds deducted.\n\n| Rank | Item | Quantity sold |\n|---:|---|---:|\n${rows}` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/ai-assistant')
  await composer(page).fill('Top items this month')
  await composer(page).press('Enter')
  await expect(page.locator('.md tbody tr')).toHaveCount(10)
  await expect(page.locator('.md tbody tr').first().locator('td').last()).toHaveText('822 pcs')
  await expect(page.locator('.md tbody tr').last().locator('td').last()).toHaveText('489 pcs')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await page.locator('.md-table-wrap').evaluate(el => ({ wrap: el.clientWidth, table: el.querySelector('table')!.getBoundingClientRect().width }))
    expect(dimensions.table).toBeGreaterThanOrEqual(dimensions.wrap - 1)
    expect(dimensions.table).toBeLessThanOrEqual(dimensions.wrap + 1)
    await noOverflow(page)
    await page.locator('.assistant-scroll').evaluate(el => { el.scrollTop = 130 })
    await page.screenshot({ path: `/tmp/alpha-ai-ranked-table-${width}.png`, animations: 'disabled' })
  }
})

test('thinking level is a keyboard-accessible preview and does not alter the AI request', async ({ page }) => {
  const calls = await setup(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/ai-assistant')
  const slider = page.getByRole('slider', { name: 'Thinking level', exact: true })
  await expect(slider).toHaveAttribute('aria-valuetext', 'Low')
  await slider.focus()
  await page.keyboard.press('End')
  await expect(slider).toHaveAttribute('aria-valuetext', 'Max')
  await expect(page.locator('.thinking-level')).toContainText('Not connected yet')
  await composer(page).fill('Review sales')
  await composer(page).press('Enter')
  await expect(page.locator('.assistant-message__answer')).toContainText('A clearer picture')
  const query = calls.find(call => call.path.endsWith('/ai/query/'))!.body
  expect(query.query).toBe('Review sales')
  expect(Object.keys(query).some(key => /reasoning|effort|thinking/i.test(key))).toBe(false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Thinking level', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute('aria-valuetext', 'Max')
  await page.getByRole('button', { name: 'Medium', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute('aria-valuetext', 'Medium')
  await page.screenshot({ path: '/tmp/alpha-ai-thinking-phone.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toBeFocused()
  await noOverflow(page)
})

test('AI chart cards retain all values and series while supporting ranked and ring selection', async ({ page }) => {
  const charts = [
    { type: 'hbar', title: 'Top products by revenue', subtitle: 'from /sales_report', data: [{ label: 'Lavash katta', value: 540000 }, { label: 'Non burger standard', value: 504000 }, { label: 'Tandir Lavash', value: 494000 }, { label: 'Hot Dog Kanada', value: 435000 }, { label: 'Hot Dog mini', value: 420000 }] },
    { type: 'line', title: 'Order channels', categories: ['Monday', 'Tuesday', 'Wednesday'], series: [{ label: 'Hall', data: [100, 120, 130] }, { label: 'Delivery', data: [30, 40, 25] }, { label: 'Pickup', data: [15, 24, 30] }] },
    { type: 'donut', title: 'Payment mix', data: [{ label: 'Cash', value: 750000 }, { label: 'Card', value: 500000 }, { label: 'Payme', value: 200000 }] },
  ]
  await setup(page, { reply: '## Sales review\n\n' + charts.map(chart => '```chart\n' + JSON.stringify(chart) + '\n```').join('\n\n') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/ai-assistant')
  await composer(page).fill('Show my charts')
  await composer(page).press('Enter')
  await expect(page.locator('.aichart')).toHaveCount(3)
  const ranking = page.locator('.aichart').first()
  await ranking.locator('.ai-ranking > button').nth(2).click()
  await expect(ranking.locator('.ai-ranking__readout')).toContainText('Tandir Lavash')
  await ranking.locator('.aichart__data summary').click()
  await expect(ranking.locator('tbody tr')).toHaveCount(5)
  const series = page.locator('.aichart').nth(1)
  await series.locator('.aichart__data summary').click()
  await expect(series.locator('thead')).toContainText('Pickup')
  await expect(series.locator('tbody tr').first()).toContainText('100')
  const ring = page.locator('.aichart').last()
  await ring.locator('.distribution__row').nth(1).click()
  await expect(ring.locator('.distribution__summary')).toContainText('Card')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
    await ranking.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `/tmp/alpha-ai-rich-ranking-${width}.png`, animations: 'disabled' })
    await ring.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `/tmp/alpha-ai-rich-ring-${width}.png`, animations: 'disabled' })
  }
})
