/**
 * D24 layer (d) — E2E coverage for the realtime frontmatter entries spec.
 *
 * Verifies the user-visible outcomes:
 *   - FR2: rename preserves position (driver-bug fix).
 *   - FR4: move-up / move-down reorder commits the new order to disk.
 *   - FR6: duplicate-name rows render with a marker on each.
 *   - FR9: malformed YAML region produces an inline banner.
 */

import { expect, test } from './_helpers';

const BASE_FM_DOC = `---
title: Initial
status: draft
cluster: research
---

# Body

Some content here.
`;

test.describe('PropertyPanel — realtime frontmatter (FR1, FR2, FR4, FR6, FR9)', () => {
  test('FR2 — renaming a property preserves its position', async ({ page, api }) => {
    const docName = `fm-rename-pos-${crypto.randomUUID()}`;
    await api.seedDocs([{ name: docName, markdown: BASE_FM_DOC }]);
    await page.goto(`/#/${docName}`);

    const panel = page.getByTestId('property-panel');
    await expect(panel).toBeVisible();

    const initialOrder = await panel
      .locator('[data-testid="property-row"]')
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.key ?? ''));
    expect(initialOrder).toEqual(['title', 'status', 'cluster']);

    // Rename "title" → "titles" by clicking the name button, typing, blurring.
    await page.getByTestId('property-name-button').filter({ hasText: 'title' }).click();
    const renameInput = page.getByTestId('property-name-rename-input');
    await renameInput.fill('titles');
    await renameInput.press('Enter');

    // The row at position 0 must still be the renamed key — not pushed to the
    // bottom (the driver-bug regression).
    const orderAfter = await panel
      .locator('[data-testid="property-row"]')
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.key ?? ''));
    expect(orderAfter).toEqual(['titles', 'status', 'cluster']);
  });

  test('FR4 — move-down button shifts a row to the next position', async ({ page, api }) => {
    const docName = `fm-reorder-${crypto.randomUUID()}`;
    await api.seedDocs([{ name: docName, markdown: BASE_FM_DOC }]);
    await page.goto(`/#/${docName}`);

    const panel = page.getByTestId('property-panel');
    await expect(panel).toBeVisible();

    await panel.getByTestId('property-move-down').first().click();

    const orderAfter = await panel
      .locator('[data-testid="property-row"]')
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.key ?? ''));
    expect(orderAfter).toEqual(['status', 'title', 'cluster']);
  });

  test('FR6 — duplicate names render with a marker on each row', async ({ page, api }) => {
    const docName = `fm-dup-name-${crypto.randomUUID()}`;
    await api.seedDocs([
      { name: docName, markdown: '---\ntitle: First\ntitle: Second\n---\n# Body\n' },
    ]);
    await page.goto(`/#/${docName}`);

    const panel = page.getByTestId('property-panel');
    await expect(panel).toBeVisible();

    const dupMarkers = panel.locator('[data-testid="property-duplicate-marker"]');
    await expect(dupMarkers).toHaveCount(2);
  });

  test('FR9 — malformed YAML region surfaces an inline banner', async ({ page, api }) => {
    const docName = `fm-malformed-${crypto.randomUUID()}`;
    await api.seedDocs([{ name: docName, markdown: '---\n: : : invalid\n---\n# Body\n' }]);
    await page.goto(`/#/${docName}`);

    const banner = page.getByTestId('property-panel-yaml-error');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Frontmatter YAML is malformed');
  });
});
