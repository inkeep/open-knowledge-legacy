/**
 * Layer C (Tier 2): Playwright E2E for block-selection-indicator.
 *
 * 8 scenarios from SPEC §6.4 covering the correctness floor:
 *   S1. Keyboard arrow-nav selects blocks with keyboard origin
 *   S2. Pointer selection with pointer origin (via focus + click)
 *   S3. Nested Card-in-Cards — innermost wins (store-enforced)
 *   S4. Drag suppresses the halo
 *   S5. Windows High Contrast Mode — halo visible via outline fallback
 *   S6. prefers-reduced-motion disables the halo fade transition
 *   S7. Breadcrumb renders ancestry and navigates on click
 *   S8. aria-live region announces selection changes
 *
 * Selection dispatch: we use `page.evaluate` + `editor.chain().setNodeSelection()`
 * for deterministic node-selection. This exercises the state → DOM pipeline
 * (plugin apply → notify → useBlockSelection → data-* attrs → CSS halo)
 * without fighting TipTap's nuanced click-to-select UX (handleBodyClick
 * only auto-selects self-closing or childless blocks). The click-to-select
 * UX is tested separately at the UX layer — this suite is about the
 * selection plugin + rendering pipeline.
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), { timeout: 15_000 });
}

async function seedMarkdown(markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, mode: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

/** Programmatically NodeSelect a jsxComponent by componentName (first match).
 *  Uses window.__activeEditor — exposed by TiptapEditor for E2E observability. */
async function selectFirstJsxComponent(page: Page, componentName: string) {
  await page.waitForFunction(() => Boolean(window.__activeEditor), { timeout: 5_000 });
  return await page.evaluate((name) => {
    const editor = window.__activeEditor;
    if (!editor) return false;
    let foundPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (foundPos !== -1) return false;
      if (node.type.name === 'jsxComponent' && (node.attrs.componentName as string) === name) {
        foundPos = pos;
        return false;
      }
      return true;
    });
    if (foundPos === -1) return false;
    editor.chain().focus().setNodeSelection(foundPos).run();
    return true;
  }, componentName);
}

test.beforeEach(async ({ page }) => {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

// ── S1: Keyboard arrow-nav selects blocks with keyboard origin ───────────

test('S1: ArrowDown selects next block with data-selection-origin=keyboard', async ({ page }) => {
  await seedMarkdown('# Title\n\n<Card title="Hello" />\n\n<Card title="World" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  await page.locator('.ProseMirror').focus();
  await page.keyboard.press('Home');

  // Arrow down repeatedly until something becomes selected via keyboard.
  let iterations = 0;
  while (iterations++ < 15) {
    await page.keyboard.press('ArrowDown');
    const count = await page.locator('.jsx-component-wrapper[data-selected="true"]').count();
    if (count > 0) break;
  }

  const selectedWrapper = page.locator('.jsx-component-wrapper[data-selected="true"]').first();
  await expect(selectedWrapper).toBeAttached({ timeout: 5_000 });
  await expect(selectedWrapper).toHaveAttribute('data-selection-origin', 'keyboard');
});

// ── S2: Pointer selection — programmatic NodeSelection + data-attr flow ──

test('S2: NodeSelection on a Card emits data-selected=true on its wrapper', async ({ page }) => {
  await seedMarkdown('<Card title="Clickable" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  // Dispatch a pointerdown event to populate pendingOrigin='pointer', then
  // trigger the node selection via the editor API. This mirrors the
  // production code path: DOM event classification → plugin apply.
  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await card.dispatchEvent('pointerdown');
  await selectFirstJsxComponent(page, 'Card');

  await expect(card).toHaveAttribute('data-selected', 'true', { timeout: 5_000 });
  await expect(card).toHaveAttribute('data-selection-origin', 'pointer');
});

// ── S3: Nested innermost-wins ────────────────────────────────────────────

test('S3: nested Cards<Card> — only innermost paints halo', async ({ page }) => {
  await seedMarkdown('<Cards>\n  <Card title="Inner" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  await selectFirstJsxComponent(page, 'Card');

  const innerCard = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  const cardsContainer = page
    .locator('.jsx-component-wrapper[data-component-type="cards"]')
    .first();

  await expect(innerCard).toHaveAttribute('data-selected', 'true', { timeout: 5_000 });
  await expect(cardsContainer).toHaveAttribute('data-has-child-selected', 'true');
  // Cards does NOT get data-selected (innermost-wins, store-enforced).
  const cardsDataSelected = await cardsContainer.getAttribute('data-selected');
  expect(cardsDataSelected).toBeNull();

  // Exactly one wrapper in the subtree has data-selected="true".
  const selectedCount = await page.locator('[data-selected="true"]').count();
  expect(selectedCount).toBe(1);
});

// ── S4: Drag suppresses the halo ─────────────────────────────────────────

test('S4: dragstart/dragend toggles data-dragging', async ({ page }) => {
  await seedMarkdown('<Card title="Draggable" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  await selectFirstJsxComponent(page, 'Card');
  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await expect(card).toHaveAttribute('data-selected', 'true');

  // Simulate drag lifecycle — the plugin listens to dragstart/dragend on
  // view.dom and toggles isDragging via a deferred refresh transaction.
  await card.dispatchEvent('dragstart');
  await expect(card).toHaveAttribute('data-dragging', 'true', { timeout: 2_000 });

  await card.dispatchEvent('dragend');
  // After dragend, data-dragging is absent (undefined → null per Playwright).
  await expect(card).not.toHaveAttribute('data-dragging', 'true', { timeout: 2_000 });
});

// ── S5: Forced-colors — halo visible via outline fallback ────────────────

test('S5: forced-colors emulation shows non-transparent halo border', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await seedMarkdown('<Card title="WHCM" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  await selectFirstJsxComponent(page, 'Card');
  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await expect(card).toHaveAttribute('data-selected', 'true', { timeout: 5_000 });

  // Read the ::after pseudo-element's computed border-color. In forced-colors
  // the UA substitutes CanvasText for our explicit color — the halo must
  // NOT be transparent.
  const borderColor = await card.evaluate((el) => {
    const computed = window.getComputedStyle(el, '::after');
    return computed.borderColor || computed.borderTopColor;
  });
  expect(borderColor).not.toBe('transparent');
  expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
});

// ── S6: reduced-motion disables halo transition ──────────────────────────

test('S6: prefers-reduced-motion:reduce → halo transition-duration is 0s', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedMarkdown('<Card title="Motion" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  const transitionDuration = await card.evaluate((el) => {
    return window.getComputedStyle(el, '::after').transitionDuration;
  });
  // Under reduced-motion, the @media (prefers-reduced-motion: no-preference)
  // block never matches — the default (no transition applied) resolves to 0s.
  expect(transitionDuration === '0s' || transitionDuration === '').toBe(true);
});

// ── S7: Breadcrumb renders ancestry and navigates on click ───────────────

test('S7: Breadcrumb shows ancestry; clicking ancestor flips selection', async ({ page }) => {
  await seedMarkdown('<Cards>\n  <Card title="Inner" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  await selectFirstJsxComponent(page, 'Card');

  const breadcrumb = page.getByRole('navigation', { name: 'Block ancestor navigation' });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText('Document');
  await expect(breadcrumb).toContainText('Cards');
  await expect(breadcrumb).toContainText('Card');

  // Click the Cards segment — selection flips to Cards container.
  await breadcrumb.getByRole('button', { name: 'Cards' }).click();

  const cardsContainer = page
    .locator('.jsx-component-wrapper[data-component-type="cards"]')
    .first();
  await expect(cardsContainer).toHaveAttribute('data-selected', 'true', { timeout: 2_000 });
  const innerCard = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  const innerAttr = await innerCard.getAttribute('data-selected');
  expect(innerAttr).toBeNull();
});

// ── S8: aria-live region announces selection changes ────────────────────

test('S8: aria-live textContent announces the selected block', async ({ page }) => {
  await seedMarkdown('<Cards>\n  <Card title="Inner" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  await selectFirstJsxComponent(page, 'Card');

  // 200ms debounce + margin. aria-atomic="true" ensures AT reads the full
  // announcement on every mutation.
  const liveRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(liveRegion).toContainText('Selected: Card', { timeout: 2_000 });
});
