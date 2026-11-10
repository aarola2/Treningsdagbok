import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const storageKey = 'Treningsdagbok:v1:okter'
const foreignKey = 'annen-app:innstilling'
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const emptyState = /Du har ingen lagrede økter ennå/

const first = { id: '00000000-0000-4000-8000-000000000001', dato: '2026-03-01', type: 'Løping', varighet: 45 }
const second = { id: '00000000-0000-4000-8000-000000000002', dato: '2026-02-01', type: 'Yoga', varighet: 30 }

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

// Lagrer rådata under øktnøkkelen, en fremtidig versjonsnøkkel og en fremmed nøkkel som ikke skal røres.
async function storeRaw(page: Page, raw: string) {
  await page.goto('./')
  await page.evaluate(
    ([key, value, foreign]) => {
      localStorage.setItem(key, value)
      localStorage.setItem('Treningsdagbok:v2:fremtidig', 'x')
      localStorage.setItem(foreign, 'beholdes')
    },
    [storageKey, raw, foreignKey] as const,
  )
  await page.reload()
  // Markøren forsvinner hvis siden lastes på nytt.
  await page.evaluate(() => Reflect.set(window, 'ingenOmlasting', true))
}

function storageSnapshot(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])))
}

async function expectOnlyForeignKeyLeft(page: Page) {
  expect(await storageSnapshot(page)).toEqual({ [foreignKey]: 'beholdes' })
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => Reflect.get(window, 'ingenOmlasting') === true)).toBe(true)
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'Slette alle data?' })
}

function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

// Alt som ikke er appens egen origin, regnes som nettverkskall ut.
function watchForeignRequests(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin
  const foreign: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) foreign.push(request.url())
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

test('dialogen forklarer konsekvensen; Avbryt og Escape endrer ingenting', async ({ page }, testInfo) => {
  await storeRaw(page, JSON.stringify({ versjon: 1, okter: [first, second] }))
  const before = await storageSnapshot(page)
  const button = page.getByRole('button', { name: 'Slett alle data' })
  await expect(page.getByRole('heading', { level: 2, name: 'Slett alle data' })).toBeVisible()
  await attachScreenshot(page, testInfo, 'slett-alle-seksjon')

  await button.click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText('Dette kan ikke angres.')
  await expect(dialog(page)).toContainText('Eksporter øktene først hvis du vil ta vare på dem.')
  await expect(dialog(page).getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'slett-alle-dialog')

  await dialog(page).getByRole('button', { name: 'Avbryt' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(button).toBeFocused()
  expect(await storageSnapshot(page)).toEqual(before)

  await button.click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(button).toBeFocused()
  expect(await storageSnapshot(page)).toEqual(before)
  await expect(page.getByRole('table', { name: 'Mine økter' }).getByRole('row')).toHaveCount(3)
})

test('sletter alle appens data med bare tastatur, uten omlasting og uten nettverkskall', async ({ page, baseURL }, testInfo) => {
  await storeRaw(page, JSON.stringify({ versjon: 1, okter: [first, second] }))
  const foreign = watchForeignRequests(page, baseURL ?? '')
  const errors = watchErrors(page)
  const button = page.getByRole('button', { name: 'Slett alle data' })

  // Tab fra toppen til knappen.
  await page.locator('body').focus()
  for (let presses = 0; presses < 40 && !(await button.evaluate((element) => element === document.activeElement)); presses++) {
    await page.keyboard.press('Tab')
  }
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page).getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog(page).getByRole('button', { name: 'Slett alle data' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByText('Alle data er slettet.')).toBeFocused()
  await expect(page.getByText(emptyState)).toBeVisible()
  await expect(page.getByRole('table', { name: 'Mine økter' })).toHaveCount(0)
  await expectOnlyForeignKeyLeft(page)
  await expectNoReload(page)
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'slett-alle-etter')
  expect(foreign).toEqual([])
  expect(errors).toEqual([])

  await page.reload()
  await expect(page.getByText(emptyState)).toBeVisible()
  await expectOnlyForeignKeyLeft(page)
})

for (const [variant, raw] of [
  ['ødelagte data', '{ikke json'],
  ['ukjent versjon', JSON.stringify({ versjon: 99, okter: [first] })],
] as const) {
  test(`sletter også ${variant}`, async ({ page }) => {
    await storeRaw(page, raw)
    await expect(page.getByText(emptyState)).toHaveCount(0)
    await page.getByRole('button', { name: 'Slett alle data' }).click()
    await dialog(page).getByRole('button', { name: 'Slett alle data' }).click()

    await expect(page.getByText('Alle data er slettet.')).toBeFocused()
    await expect(page.getByText(emptyState)).toBeVisible()
    await expectOnlyForeignKeyLeft(page)
    await page.reload()
    await expect(page.getByText(emptyState)).toBeVisible()
  })
}

test('knappen vises ikke når appen er rammet inn i en annen side', async ({ page, context, baseURL }, testInfo) => {
  // Rammesiden har en annen origin enn appen (localhost mot 127.0.0.1). Den er rutet uten ekte server, så Chromiums
  // Local Network Access-sjekk ville ellers stoppe rammen før appen lastes.
  await context.grantPermissions(['local-network-access'])
  const framer = 'http://localhost:4173/ramme-test'
  await page.route(framer, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Ramme</title><iframe title="Innrammet app" src="${baseURL ?? ''}" width="600" height="2000"></iframe>`,
    }),
  )
  await page.goto(framer)
  const framed = page.frameLocator('iframe[title="Innrammet app"]')
  await expect(framed.getByRole('heading', { level: 2, name: 'Slett alle data' })).toBeVisible()
  await expect(
    framed.getByText('Sletting er bare tilgjengelig når appen åpnes direkte, ikke inne i en annen side.'),
  ).toBeVisible()
  await expect(framed.getByRole('button', { name: 'Slett alle data' })).toHaveCount(0)
  await attachScreenshot(page, testInfo, 'slett-alle-innrammet')

  // Kontroll: åpnet direkte finnes knappen.
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Slett alle data' })).toBeVisible()
  await expect(page.getByText(/Sletting er bare tilgjengelig/)).toHaveCount(0)
})

// Verste tilfelle: 5 000 økter med 50 tegn i typen (største tillatte data). Måles fra bekreftelse til tomtilstand.
test('5 000 økter er slettet og listen tom innen 2 sekunder', async ({ page }, testInfo) => {
  const okter = Array.from({ length: 5000 }, (_, n) => ({
    id: id(n),
    dato: `20${String(10 + (n % 16))}-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}`,
    type: `${String(n).padStart(4, '0')}${'\u{1F3C3}'.repeat(46)}`,
    varighet: 1440,
  }))
  await storeRaw(page, JSON.stringify({ versjon: 1, okter }))
  await expect(page.getByRole('table', { name: 'Mine økter' })).toBeVisible()
  await page.getByRole('button', { name: 'Slett alle data' }).click()
  const confirm = dialog(page).getByRole('button', { name: 'Slett alle data' })
  await expect(confirm).toBeVisible()

  const start = Date.now()
  await confirm.click()
  await expect(page.getByText(emptyState)).toBeVisible()
  const elapsed = Date.now() - start

  await expectOnlyForeignKeyLeft(page)
  testInfo.annotations.push({ type: 'ytelse', description: `5 000 økter slettet på ${String(elapsed)} ms` })
  expect(elapsed).toBeLessThan(2000)
})

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('seksjonen og dialogen gir ikke horisontal rulling, heller ikke med økt tekstavstand', async ({ page }, testInfo) => {
    await storeRaw(page, JSON.stringify({ versjon: 1, okter: [first] }))
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        element.style.setProperty('line-height', '1.5', 'important')
        element.style.setProperty('letter-spacing', '0.12em', 'important')
        element.style.setProperty('word-spacing', '0.16em', 'important')
      }
    })
    expect(await overflow(page)).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Slett alle data' }).click()
    await expect(dialog(page)).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await attachScreenshot(page, testInfo, 'slett-alle-dialog-320px')

    await dialog(page).getByRole('button', { name: 'Slett alle data' }).click()
    await expect(page.getByText('Alle data er slettet.')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expectNoAxeViolations(page)
    await attachScreenshot(page, testInfo, 'slett-alle-320px')
  })
})
