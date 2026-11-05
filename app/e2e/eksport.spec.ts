import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const storageKey = 'Treningsdagbok:v1:okter'
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

function id(n: number) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(violations.map(({ id: rule, nodes }) => ({ rule, targets: nodes.map((node) => node.target) }))).toEqual([])
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function store(page: Page, okter: unknown[]) {
  await page.goto('./')
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
  }, [storageKey, JSON.stringify({ versjon: 1, okter })] as const)
  await page.reload()
}

// Alt som ikke er appens egen origin eller dens egne blob:-URL-er, regnes som nettverkskall ut.
function watchForeignRequests(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin
  const foreign: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith(`blob:${origin}/`)) foreign.push(url)
  })
  return foreign
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}

test('laster ned alle gyldige økter som JSON uten nettverkskall og uten CSP-brudd', async ({ page, baseURL }, testInfo) => {
  const okter = [
    { id: id(1), dato: '2026-01-10', type: '<img src=x onerror=alert(1)>', varighet: 30 },
    { id: id(2), dato: '2026-03-01', type: 'Løping 🏃', varighet: 45 },
  ]
  await store(page, [...okter, 'ødelagt'])
  const foreign = watchForeignRequests(page, baseURL ?? '')
  const errors = watchErrors(page)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Eksporter økter' }).click()])
  const today = await page.evaluate(() => {
    const now = new Date()
    return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  expect(download.suggestedFilename()).toBe(`treningsdagbok-${today}.json`)

  const content = JSON.parse(await readFile(await download.path(), 'utf8')) as { versjon: number; eksportert: string; okter: unknown[] }
  expect(content.versjon).toBe(1)
  expect(Number.isNaN(Date.parse(content.eksportert))).toBe(false)
  expect(content.okter).toEqual(okter)

  await expect(page.getByRole('status').filter({ hasText: 'Eksporterte' })).toHaveText(
    `Eksporterte 2 økter til treningsdagbok-${today}.json.`,
  )
  expect(foreign).toEqual([])
  expect(errors).toEqual([])
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'eksport')
})

test('kan eksporteres med bare tastatur', async ({ page }) => {
  await store(page, [{ id: id(1), dato: '2026-01-10', type: 'Yoga', varighet: 30 }])
  await page.getByRole('button', { name: 'Eksporter økter' }).focus()
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
  expect(download.suggestedFilename()).toMatch(/^treningsdagbok-\d{4}-\d{2}-\d{2}\.json$/)
})

test('uten økter kan man ikke eksportere, og en norsk melding forklarer hvorfor', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(page.getByText('Det finnes ingen økter å eksportere ennå.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eksporter økter' })).toHaveCount(0)
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'eksport-tom')
})

// Verste tilfelle: 5 000 økter med 50 kodepunkter i typen (emoji gir mest UTF-8, devanagari dyrest tekst) og
// varighet 1440. Måles fra klikk til filen er ferdig lagret.
for (const [variant, text] of [
  ['emoji', '\u{1F3C3}'.repeat(46)],
  ['devanagari', 'क्ष'.repeat(15) + 'क'],
] as const) {
  test(`5 000 økter (${variant}) er ferdig nedlastet innen 2 sekunder`, async ({ page }, testInfo) => {
    const okter = Array.from({ length: 5000 }, (_, n) => ({
      id: id(n),
      dato: `20${String(10 + (n % 16))}-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}`,
      type: `${String(n).padStart(4, '0')}${text}`,
      varighet: 1440,
    }))
    await store(page, okter)
    const button = page.getByRole('button', { name: 'Eksporter økter' })
    await expect(button).toBeVisible()

    const start = Date.now()
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
    const path = await download.path()
    const elapsed = Date.now() - start

    const content = JSON.parse(await readFile(path, 'utf8')) as { okter: unknown[] }
    expect(content.okter).toHaveLength(5000)
    testInfo.annotations.push({ type: 'ytelse', description: `5 000 økter eksportert på ${String(elapsed)} ms` })
    expect(elapsed).toBeLessThan(2000)
  })
}

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('eksportseksjonen gir ikke horisontal rulling', async ({ page }, testInfo) => {
    await store(page, [{ id: id(1), dato: '2026-01-10', type: 'Yoga', varighet: 30 }])
    await page.getByRole('button', { name: 'Eksporter økter' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Eksporterte' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await attachScreenshot(page, testInfo, 'eksport-320px')
  })
})
