import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const storageKey = 'Treningsdagbok:v1:okter'
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const first = { id: '00000000-0000-4000-8000-000000000001', dato: '2026-03-01', type: 'Løping', varighet: 45 }
const second = { id: '00000000-0000-4000-8000-000000000002', dato: '2026-02-01', type: 'Yoga', varighet: 30 }

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([])
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function storeRaw(page: Page, raw: string) {
  await page.goto('./')
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
  }, [storageKey, raw] as const)
  await page.reload()
  // Markøren forsvinner hvis siden lastes på nytt.
  await page.evaluate(() => Reflect.set(window, 'ingenOmlasting', true))
}

async function storedRaw(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}

function list(page: Page) {
  return page.getByRole('table', { name: 'Mine økter' })
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => Reflect.get(window, 'ingenOmlasting') === true)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await storeRaw(page, JSON.stringify({ versjon: 1, okter: [first, second] }))
})

test('redigerer en økt med bare tastatur, og endringen gjelder etter omlasting', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Rediger «Yoga» 1. feb. 2026' }).focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 2, name: 'Rediger økt' })).toBeVisible()
  await expect(page.getByLabel('Dato')).toBeFocused()
  await expect(page.getByLabel('Type')).toHaveValue('Yoga')
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'redigeringsmodus')

  const type = page.getByLabel('Type')
  for (let presses = 0; presses < 10 && !(await type.evaluate((element) => element === document.activeElement)); presses++) {
    await page.keyboard.press('Tab')
  }
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Pilates')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('status').filter({ hasText: 'oppdatert' })).toHaveText('«Pilates» er oppdatert.')
  await expect(list(page).getByRole('row').nth(2)).toBeFocused()
  await expect(list(page).getByRole('row').nth(2).getByRole('cell').nth(1)).toHaveText(/^Pilates/)
  await expect(page.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeVisible()
  await expectNoReload(page)

  await page.reload()
  await expect(list(page).getByRole('row').nth(2).getByRole('cell').nth(1)).toHaveText(/^Pilates/)
})

test('Avbryt redigering endrer ingenting og gir fokus tilbake til Rediger-knappen', async ({ page }) => {
  const before = await storedRaw(page)
  await page.getByRole('button', { name: 'Rediger «Løping» 1. mars 2026' }).click()
  await page.getByLabel('Type').fill('Ikke lagret')
  await page.getByRole('button', { name: 'Avbryt redigering' }).click()

  await expect(page.getByRole('button', { name: 'Rediger «Løping» 1. mars 2026' })).toBeFocused()
  await expect(page.getByRole('heading', { level: 2, name: 'Registrer økt' })).toBeVisible()
  expect(await storedRaw(page)).toBe(before)
})

test('sletting krever bekreftelse; Escape avbryter og gir fokus tilbake', async ({ page }, testInfo) => {
  const before = await storedRaw(page)
  const remove = page.getByRole('button', { name: 'Slett «Løping» 1. mars 2026' })
  await remove.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Slette økten?' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'slett-dialog')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(remove).toBeFocused()
  expect(await storedRaw(page)).toBe(before)
})

test('bekreftet sletting fjerner økten uten omlasting, også etter omlasting', async ({ page }) => {
  await page.getByRole('button', { name: 'Slett «Løping» 1. mars 2026' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Slett økten' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByText('«Løping» 1. mars 2026 er slettet.')).toBeFocused()
  await expect(list(page).getByRole('row')).toHaveCount(2)
  await expectNoReload(page)
  await expectNoAxeViolations(page)

  await page.reload()
  await expect(list(page).getByRole('row')).toHaveCount(2)
  await expect(list(page).getByRole('button', { name: /Løping/ })).toHaveCount(0)
})

test('sletting med ødelagte data spør om forkasting først', async ({ page }) => {
  await storeRaw(page, JSON.stringify({ versjon: 1, okter: [first, second, 'tull'] }))
  await page.getByRole('button', { name: 'Slett «Løping» 1. mars 2026' }).click()
  await page.getByRole('button', { name: 'Slett økten' }).click()
  await expect(page.getByRole('dialog', { name: 'Noen lagrede data er ødelagte' })).toBeVisible()
  await page.getByRole('button', { name: 'Fjern ødelagte data og slett' }).click()

  await expect(page.getByText('«Løping» 1. mars 2026 er slettet.')).toBeFocused()
  expect(JSON.parse((await storedRaw(page)) ?? 'null')).toEqual({ versjon: 1, okter: [second] })
})

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('handlingsknappene gir ikke horisontal rulling, heller ikke med økt tekstavstand', async ({ page }, testInfo) => {
    await storeRaw(
      page,
      JSON.stringify({ versjon: 1, okter: [{ ...first, type: 'x'.repeat(50), varighet: 1440, dato: '2026-12-31' }, second] }),
    )
    await expect(list(page).getByRole('row')).toHaveCount(3)
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await attachScreenshot(page, testInfo, 'handlinger-320px')

    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        element.style.setProperty('line-height', '1.5', 'important')
        element.style.setProperty('letter-spacing', '0.12em', 'important')
        element.style.setProperty('word-spacing', '0.16em', 'important')
      }
    })
    expect(await overflow()).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Rediger «Yoga» 1. feb. 2026' }).click()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await expectNoAxeViolations(page)
  })
})
