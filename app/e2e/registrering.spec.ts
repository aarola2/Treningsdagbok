import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const storageKey = 'Treningsdagbok:v1:okter'
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const validId = '00000000-0000-4000-8000-000000000001'

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([])
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function storedData(page: Page): Promise<unknown> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  return raw === null ? null : JSON.parse(raw)
}

test('registrerer en økt som fortsatt er lagret etter omlasting', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  await page.goto('./')
  await page.getByLabel('Dato').fill('2026-01-15')
  await page.getByLabel('Type').fill('Løping')
  await page.getByLabel('Varighet (minutter)').fill('45')
  await page.getByRole('button', { name: 'Lagre økt' }).click()

  await expect(page.getByRole('status')).toHaveText('«Løping» er lagret.')
  await expect(page.getByLabel('Type')).toHaveValue('')
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'lagret')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Treningsdagbok' })).toBeVisible()
  expect(await storedData(page)).toEqual({
    versjon: 1,
    okter: [{ id: expect.any(String), dato: '2026-01-15', type: 'Løping', varighet: 45 }],
  })
  expect(errors).toEqual([])
})

test('viser feilmeldinger ved feltene og flytter fokus til første feil', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Lagre økt' }).click()

  const type = page.getByLabel('Type')
  await expect(type).toBeFocused()
  await expect(type).toHaveAttribute('aria-invalid', 'true')
  await expect(type).toHaveAccessibleDescription('Oppgi type trening.')
  await expect(page.getByLabel('Varighet (minutter)')).toHaveAccessibleDescription(
    'Oppgi varighet som et helt antall minutter fra 1 til 1440.',
  )
  expect(await storedData(page)).toBeNull()
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'feilmeldinger')
})

test('hele registreringen kan gjøres med bare tastatur', async ({ page }) => {
  await page.goto('./')
  const type = page.getByLabel('Type')
  // Datofeltet kan ha flere tabulatorstopp (dag, måned, år) avhengig av nettleser.
  for (let presses = 0; presses < 10 && !(await type.evaluate((element) => element === document.activeElement)); presses++) {
    await page.keyboard.press('Tab')
  }
  await expect(type).toBeFocused()

  await page.keyboard.type('Styrke')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Varighet (minutter)')).toBeFocused()
  await page.keyboard.type('30')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Lagre økt' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('status')).toHaveText('«Styrke» er lagret.')
})

test.describe('ødelagte lagrede data', () => {
  const valid = { id: validId, dato: '2026-01-01', type: 'Gammel', varighet: 20 }
  const corrupt = JSON.stringify({ versjon: 1, okter: [valid, { ...valid, id: 'ødelagt' }] })

  test.beforeEach(async ({ page }) => {
    await page.goto('./')
    await page.evaluate(([key, value]) => {
      localStorage.setItem(key, value)
    }, [storageKey, corrupt] as const)
    await page.reload()
    await page.getByLabel('Type').fill('Svømming')
    await page.getByLabel('Varighet (minutter)').fill('60')
    await page.getByRole('button', { name: 'Lagre økt' }).click()
  })

  test('Escape lukker dialogen uten endringer og gir fokus tilbake', async ({ page }, testInfo) => {
    const dialog = page.getByRole('dialog', { name: 'Noen lagrede data er ødelagte' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await expectNoAxeViolations(page)
    await attachScreenshot(page, testInfo, 'dialog-odelagte-data')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Lagre økt' })).toBeFocused()
    await expect(page.getByLabel('Type')).toHaveValue('Svømming')
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(corrupt)
  })

  test('bekreftelse med tastatur lagrer gyldige økter pluss den nye', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: 'Fjern ødelagte data og lagre' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('status')).toHaveText('«Svømming» er lagret.')
    await expect(page.getByRole('button', { name: 'Lagre økt' })).toBeFocused()
    expect(await storedData(page)).toEqual({
      versjon: 1,
      okter: [valid, { id: expect.any(String), dato: expect.any(String), type: 'Svømming', varighet: 60 }],
    })

    // En gjentatt Enter på knappen lagrer ikke økten en gang til og gir ingen feltfeil.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('«Svømming» er lagret.')
    await expect(page.getByRole('button', { name: 'Lagre økt' })).toBeFocused()
    await expect(page.getByLabel('Type')).not.toHaveAttribute('aria-invalid')
    expect(await storedData(page)).toMatchObject({ okter: [valid, { type: 'Svømming' }] })
  })

  test('klikk på Avbryt gir fokus tilbake til Lagre økt', async ({ page }) => {
    await page.getByRole('button', { name: 'Avbryt' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Lagre økt' })).toBeFocused()
  })
})

test('viser en lesbar feilmelding når grensen på 5 000 økter er nådd', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.evaluate((key) => {
    const okter = Array.from({ length: 5000 }, (_, n) => ({
      id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
      dato: '2026-01-01',
      type: 'Syntetisk',
      varighet: 30,
    }))
    localStorage.setItem(key, JSON.stringify({ versjon: 1, okter }))
  }, storageKey)
  await page.reload()
  await page.getByLabel('Type').fill('Løping')
  await page.getByLabel('Varighet (minutter)').fill('45')
  await page.getByRole('button', { name: 'Lagre økt' }).click()

  await expect(page.getByRole('alert')).toHaveText('Du har nådd grensen på 5 000 økter. Økten ble ikke lagret.')
  await expect(page.getByLabel('Type')).toHaveValue('Løping')
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'grense-nadd')
})

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }

  test('feilmeldinger gir ikke horisontal rulling', async ({ page }, testInfo) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Lagre økt' }).click()
    await expect(page.getByLabel('Type')).toBeFocused()
    await expectNoHorizontalScroll(page)
    await attachScreenshot(page, testInfo, 'smal-320px')
  })

  test('statusmelding med 50 tegn uten mellomrom gir ikke horisontal rulling', async ({ page }) => {
    await page.goto('./')
    await page.getByLabel('Type').fill('x'.repeat(50))
    await page.getByLabel('Varighet (minutter)').fill('10')
    await page.getByRole('button', { name: 'Lagre økt' }).click()
    await expect(page.getByRole('status')).toContainText('er lagret.')
    await expectNoHorizontalScroll(page)
  })

  test('dialogen gir ikke horisontal rulling', async ({ page }, testInfo) => {
    await page.goto('./')
    await page.evaluate((key) => {
      localStorage.setItem(key, '{')
    }, storageKey)
    await page.reload()
    await page.getByLabel('Type').fill('Løping')
    await page.getByLabel('Varighet (minutter)').fill('45')
    await page.getByRole('button', { name: 'Lagre økt' }).click()
    await expect(page.getByRole('dialog', { name: 'De lagrede dataene kan ikke leses' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectNoAxeViolations(page)
    await attachScreenshot(page, testInfo, 'smal-320px-dialog')
  })
})
