import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('forsiden har ingen automatisk påviselige WCAG A/AA-brudd', async ({ page }) => {
  await page.goto('./')

  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze()

  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([])
})
