import { expect, test } from '@playwright/test'

test('produksjonsbygget viser forsiden uten konsollfeil', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'Treningsdagbok' })).toBeVisible()
  expect(errors).toEqual([])
})

test('CSP-meta står før alle skript i head', async ({ page }) => {
  await page.goto('./')

  const tags = await page.evaluate(() =>
    Array.from(
      document.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"], script'),
      (element) => element.tagName.toLowerCase(),
    ),
  )
  expect(tags[0]).toBe('meta')
  expect(tags).toContain('script')

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("object-src 'none'")
})

test('CSP blokkerer inline-skript', async ({ page }) => {
  await page.goto('./')

  const inlineScriptRan = await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'document.body.dataset.cspBypass = "ja"'
    document.head.append(script)
    return document.body.dataset.cspBypass === 'ja'
  })
  expect(inlineScriptRan).toBe(false)
})
