import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([])
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

function region(page: Page) {
  return page.getByRole('region', { name: 'Lagring og personvern' })
}

function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test('forsiden viser teksten om lagring og personvern, som skjermlesere finner som en navngitt seksjon', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(region(page).getByRole('heading', { level: 2, name: 'Lagring og personvern' })).toBeVisible()
  await expect(region(page)).toContainText('lagres bare i denne nettleseren på denne enheten')
  await expect(region(page)).toContainText('Appen sender dem ikke noe sted.')
  await expect(region(page)).toContainText('i privat modus')
  await expect(region(page)).toContainText('tømmer nettleserdata')
  await expect(region(page)).toContainText('rydder bort data etter en periode uten bruk')
  await expect(region(page)).toContainText('Bruk eksport jevnlig som sikkerhetskopi.')
  await expect(region(page)).toContainText('Som vert behandler GitHub IP-adressen din og logger forespørsler')
  // Overskriften ligger i tilgjengelighetstreet, så skjermlesere kan hoppe til den med overskriftsnavigering.
  await expect(region(page)).toMatchAriaSnapshot(`
    - region "Lagring og personvern":
      - heading "Lagring og personvern" [level=2]
      - paragraph
      - paragraph
      - paragraph
  `)
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'personvern')
})

test('teksten nås med bare tastatur fra toppen av forsiden', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('./')
  const heading = region(page).getByRole('heading', { name: 'Lagring og personvern' })
  await expect(heading).not.toBeInViewport()

  // Statisk tekst får ikke fokus; tastaturbrukere ruller dit (End/Page Down) med fokus på siden.
  await page.locator('body').focus()
  await page.keyboard.press('End')
  await expect(heading).toBeInViewport()
  await expect(region(page).getByText('Bruk eksport jevnlig som sikkerhetskopi.')).toBeInViewport()
})

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('teksten gir ikke horisontal rulling, heller ikke med økt tekstavstand', async ({ page }, testInfo) => {
    await page.goto('./')
    await expect(region(page)).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await attachScreenshot(page, testInfo, 'personvern-320px')

    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        element.style.setProperty('line-height', '1.5', 'important')
        element.style.setProperty('letter-spacing', '0.12em', 'important')
        element.style.setProperty('word-spacing', '0.16em', 'important')
      }
    })
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expectNoAxeViolations(page)
  })
})
