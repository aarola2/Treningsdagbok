import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const storageKey = 'Treningsdagbok:v1:okter'
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

interface StoredWorkout {
  id: string
  dato: string
  type: string
  varighet: number
}

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

async function storeRaw(page: Page, raw: string) {
  await page.goto('./')
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
  }, [storageKey, raw] as const)
  await page.reload()
}

async function store(page: Page, okter: unknown[]) {
  await storeRaw(page, JSON.stringify({ versjon: 1, okter }))
}

function list(page: Page) {
  return page.getByRole('table', { name: 'Mine økter' })
}

test('viser lagrede økter sortert med nyeste først, og ny økt uten omlasting', async ({ page }, testInfo) => {
  await store(page, [
    { id: id(1), dato: '2026-01-10', type: 'Eldst', varighet: 30 },
    { id: id(2), dato: '2026-03-01', type: 'Nyest først registrert', varighet: 45 },
    { id: id(3), dato: '2026-03-01', type: 'Nyest sist registrert', varighet: 60 },
  ])
  const rows = list(page).getByRole('row')
  await expect(rows).toHaveCount(4)
  // Type-cellen inneholder også knappene Rediger/Slett.
  await expect(rows.nth(1).getByRole('cell')).toHaveText(['1. mars 2026', /^Nyest sist registrert/, '60 min'])
  await expect(rows.nth(2).getByRole('cell').nth(1)).toHaveText(/^Nyest først registrert/)
  await expect(rows.nth(3).getByRole('cell').nth(1)).toHaveText(/^Eldst/)

  // Markøren forsvinner hvis siden lastes på nytt.
  await page.evaluate(() => Reflect.set(window, 'ingenOmlasting', true))
  await page.getByLabel('Dato').fill('2026-02-01')
  await page.getByLabel('Type').fill('Ny i midten')
  await page.getByLabel('Varighet (minutter)').fill('25')
  await page.getByRole('button', { name: 'Lagre økt' }).click()

  await expect(rows).toHaveCount(5)
  await expect(rows.nth(3).getByRole('cell').nth(1)).toHaveText(/^Ny i midten/)
  expect(await page.evaluate(() => Reflect.get(window, 'ingenOmlasting') === true)).toBe(true)
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'liste')
})

test('viser tomtilstand når det ikke finnes økter', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(page.getByText('Du har ingen lagrede økter ennå. Registrer den første økten i skjemaet «Registrer økt».')).toBeVisible()
  await expect(list(page)).toHaveCount(0)
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'tomtilstand')
})

test('viser feilmelding og gyldige økter ved ødelagte data', async ({ page }, testInfo) => {
  await store(page, [{ id: id(1), dato: '2026-01-10', type: 'Gyldig', varighet: 30 }, { id: 'ødelagt' }])
  await expect(page.getByText('Noen lagrede data kan ikke leses. Bare gyldige økter vises.')).toBeVisible()
  await expect(list(page).getByRole('cell', { name: /^Gyldig/ })).toBeVisible()
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'odelagte-data')
})

test('viser HTML og skript i type som ren tekst uten å kjøre det', async ({ page }) => {
  const dialogs: string[] = []
  const errors: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const payload = '<img src=x onerror=alert(1)>'
  await store(page, [{ id: id(1), dato: '2026-01-10', type: payload, varighet: 30 }])
  await expect(list(page).getByText(payload, { exact: true })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
  expect(dialogs).toEqual([])
  expect(errors).toEqual([])
})

// Verste tilfelle er tekst som er dyr å forme og bryte: 4 siffer + 46 kodepunkter (50 er maks) av hver variant,
// i bred og smal visning. Devanagari med konsonantklynger uten mellomrom er tregest målt i smal visning.
const worstCaseTypes = {
  emoji: '\u{1F3C3}'.repeat(46),
  'ZWJ-emoji': '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'.repeat(9) + '\u{1F468}',
  devanagari: '\u0915\u094D\u0937'.repeat(15) + '\u0915',
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 320, height: 800 },
]) {
  for (const [variant, text] of Object.entries(worstCaseTypes)) {
    test.describe(`${String(viewport.width)} px bredde, ${variant}`, () => {
      test.use({ viewport })

      // «Listen vises» = første side er synlig (godkjent av eier i #7 ved paginering).
      test('viser første side av 5 000 økter med maksimal feltlengde innen 1 sekund etter omlasting', async ({ page }, testInfo) => {
        const okter: StoredWorkout[] = Array.from({ length: 5000 }, (_, n) => ({
          id: id(n),
          dato: `20${String(10 + (n % 16))}-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}`,
          type: `${String(n).padStart(4, '0')}${text}`,
          varighet: 1440,
        }))
        expect(Array.from(okter[0]?.type ?? '')).toHaveLength(50)
        await store(page, okter)
        await expect(list(page).getByRole('row')).toHaveCount(101)

        const start = Date.now()
        await page.reload()
        await expect(list(page).getByRole('row').nth(100)).toBeVisible()
        const elapsed = Date.now() - start

        testInfo.annotations.push({ type: 'ytelse', description: `Første side av 5 000 økter synlig etter ${String(elapsed)} ms` })
        expect(elapsed).toBeLessThan(1000)
        await expect(page.getByRole('status').filter({ hasText: 'Viser' })).toHaveText('Viser 100 av 5 000 økter.')
      })
    })
  }
}

test('«Vis flere økter» viser neste side og kan brukes med tastatur', async ({ page }, testInfo) => {
  await store(
    page,
    Array.from({ length: 150 }, (_, n) => ({ id: id(n), dato: '2026-01-01', type: `Økt ${String(n)}`, varighet: 30 })),
  )
  const rows = list(page).getByRole('row')
  await expect(rows).toHaveCount(101)
  const more = page.getByRole('button', { name: 'Vis flere økter' })
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(151)
  await expect(page.getByRole('status').filter({ hasText: 'Viser' })).toHaveText('Viser 150 av 150 økter.')
  await expect(more).toHaveCount(0)
  // Fokus går ikke tapt når knappen forsvinner, men står på første nye rad.
  await expect(rows.nth(101)).toBeFocused()
  await expectNoAxeViolations(page)
  await attachScreenshot(page, testInfo, 'vis-flere')
})

for (const timezoneId of ['Pacific/Honolulu', 'Pacific/Kiritimati']) {
  test.describe(`tidssone ${timezoneId}`, () => {
    test.use({ timezoneId })

    test('viser lagret dato uten forskyvning', async ({ page }) => {
      await store(page, [{ id: id(1), dato: '2026-03-01', type: 'Løping', varighet: 30 }])
      await expect(list(page).getByRole('cell').first()).toHaveText('1. mars 2026')
    })
  })
}

test.describe('320 px bredde', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('listen med lengst mulig innhold gir ikke horisontal rulling', async ({ page }, testInfo) => {
    await store(page, [
      { id: id(1), dato: '2026-12-31', type: 'x'.repeat(50), varighet: 1440 },
      { id: id(2), dato: '2026-11-05', type: 'Langdistanseløping i terreng', varighet: 90 },
    ])
    await expect(list(page).getByRole('row')).toHaveCount(3)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoAxeViolations(page)
    await attachScreenshot(page, testInfo, 'liste-320px')
  })

  test('tåler økt tekstavstand (WCAG 1.4.12) uten horisontal rulling eller klemt type', async ({ page }, testInfo) => {
    await store(page, [
      { id: id(1), dato: '2026-12-31', type: 'x'.repeat(50), varighet: 1440 },
      { id: id(2), dato: '2026-11-05', type: 'Langdistanseløping i terreng', varighet: 90 },
    ])
    await expect(list(page).getByRole('row')).toHaveCount(3)
    // CSP-en blokkerer et innsatt stilark (bypassCSP skal ikke brukes), så avstandene settes per element via CSSOM.
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        element.style.setProperty('line-height', '1.5', 'important')
        element.style.setProperty('letter-spacing', '0.12em', 'important')
        element.style.setProperty('word-spacing', '0.16em', 'important')
        if (element.tagName === 'P') element.style.setProperty('margin-bottom', '2em', 'important')
      }
    })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const typeCell = list(page).getByRole('cell', { name: /^Langdistanseløping i terreng/ })
    const box = await typeCell.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(80)
    await attachScreenshot(page, testInfo, 'liste-320px-tekstavstand')
  })
})
