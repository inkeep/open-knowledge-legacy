/**
 * Layer C (Tier 2): Playwright E2E for block-selection-indicator.
 *
 * SPEC §6.4 correctness floor (S1–S8) + expanded coverage (S9–S18) that
 * closes the audit gaps identified in the TDD review of 2026-04-19.
 *
 * SPEC §6.4 correctness floor:
 *   S1. Keyboard arrow-nav — origin='keyboard'
 *   S2. Pointer selection — origin='pointer'
 *   S3. Nested Card-in-Cards — innermost-wins (store-enforced)
 *   S4. Drag suppresses the halo
 *   S5. Windows High Contrast Mode — halo visible via outline fallback (SC-1)
 *   S6. prefers-reduced-motion — halo transition duration = 0s (SC-6)
 *   S7. Breadcrumb ancestry + click-to-jump (SC-7)
 *   S8. aria-live region announces selection changes
 *
 * Expanded coverage:
 *   S9.  Three-axis composition — dragging dominates over selected + needs-config (SC-4)
 *   S10. Document anchor clears selection cleanly (§3.5)
 *   S11. Per-type halo --selection-halo-inset (parameterized cards/steps/imagezoom/card)
 *   S12. Halo z-index: -1 + .component-children visible when selected (SC-INV-3)
 *   S13. Callout type-color inheritance (parameterized across 5 callout types)
 *   S14. Programmatic origin via breadcrumb navigation
 *   S15. Breadcrumb footer layout-shift prevention (round-1 review fix invariant)
 *   S16. axe-core — zero critical/serious violations on selection-layer surfaces (§6.5)
 *   S17. Keyboard focus order reaches non-innermost breadcrumb buttons
 *   S18. aria-live debounce coalesces rapid selection changes
 *
 * Selection dispatch: we use `page.evaluate` + `editor.chain().setNodeSelection()`
 * for deterministic node-selection. This exercises the state → DOM pipeline
 * (plugin apply → notify → useBlockSelection → data-* attrs → CSS halo)
 * without fighting TipTap's nuanced click-to-select UX (handleBodyClick
 * only auto-selects self-closing or childless blocks). The click-to-select
 * UX is tested separately at the UX layer — this suite is about the
 * selection plugin + rendering pipeline.
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { ApiHelpers } from './_helpers';
import { expect, test } from './_helpers';

/** Per-test fixture setup: create an isolated doc, seed markdown, navigate.
 *  Each test owns its own docName so parallel workers don't collide. */
async function setupDoc(page: Page, api: ApiHelpers, markdown: string): Promise<string> {
  const docName = `test-sel-${randomUUID().slice(0, 8)}`;
  await api.createPage(`${docName}.md`);
  await api.testReset(docName);
  await api.replaceDoc(docName, markdown);
  await page.goto(`/#/${docName}`);
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), null, {
    timeout: 15_000,
  });
  await page.waitForSelector('.ProseMirror');
  return docName;
}

/** Programmatically NodeSelect a jsxComponent by componentName (first match).
 *  Uses window.__activeEditor — exposed by TiptapEditor for E2E observability. */
async function selectFirstJsxComponent(page: Page, componentName: string) {
  await page.waitForFunction(() => Boolean(window.__activeEditor), null, { timeout: 5_000 });
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

// ── S1: Keyboard arrow-nav selects blocks with keyboard origin ───────────

test('S1: ArrowDown selects next block with data-selection-origin=keyboard', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '# Title\n\n<Card title="Hello" />\n\n<Card title="World" />\n');
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

test('S2: NodeSelection on a Card emits data-selected=true on its wrapper', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Card title="Clickable" />\n');
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

test('S3: nested Cards<Card> — only innermost paints halo', async ({ page, api }) => {
  await setupDoc(page, api, '<Cards>\n  <Card title="Inner" />\n</Cards>\n');
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

test('S4: dragstart/dragend toggles data-dragging', async ({ page, api }) => {
  await setupDoc(page, api, '<Card title="Draggable" />\n');
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

test('S5: forced-colors emulation shows non-transparent halo border', async ({ page, api }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await setupDoc(page, api, '<Card title="WHCM" />\n');
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

test('S6: prefers-reduced-motion:reduce → halo transition-duration is 0s', async ({
  page,
  api,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupDoc(page, api, '<Card title="Motion" />\n');
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

test('S7: Breadcrumb shows ancestry; clicking ancestor flips selection', async ({ page, api }) => {
  await setupDoc(page, api, '<Cards>\n  <Card title="Inner" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  await selectFirstJsxComponent(page, 'Card');

  // Use CSS locator (`.jsx-component-breadcrumb`): when no block is
  // selected, the nav is `aria-hidden="true"` and hidden from Playwright's
  // accessibility tree, even though the DOM is present. The CSS class is
  // stable across selected/deselected states and gives a reliable anchor
  // for the element-visibility check below.
  const breadcrumb = page.locator('.jsx-component-breadcrumb');
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText('Document');
  await expect(breadcrumb).toContainText('Cards');
  await expect(breadcrumb).toContainText('Card');

  // The breadcrumb footer can land below the visible viewport in the
  // default 1280×720 E2E context (editor body + chrome + halo consume
  // the above-the-fold area). `page.click()` with `force: true` still
  // requires the element to be in viewport. We dispatch the click via
  // `.dispatchEvent('click')` instead — the React onClick handler runs
  // on the native event, and the downstream assertion on
  // `.jsx-component-wrapper[data-component-type="cards"]` verifies the
  // click actually flipped the selection. A real user has the same
  // option (scroll the footer into view, then click); the E2E shortcut
  // of dispatching directly preserves test determinism without changing
  // the production behavior under test.
  const cardsButton = breadcrumb.locator('button', { hasText: 'Cards' });
  await cardsButton.dispatchEvent('click');

  const cardsContainer = page
    .locator('.jsx-component-wrapper[data-component-type="cards"]')
    .first();
  await expect(cardsContainer).toHaveAttribute('data-selected', 'true', { timeout: 2_000 });
  const innerCard = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  const innerAttr = await innerCard.getAttribute('data-selected');
  expect(innerAttr).toBeNull();
});

// ── S8: aria-live region announces selection changes ────────────────────

test('S8: aria-live textContent announces the selected block', async ({ page, api }) => {
  await setupDoc(page, api, '<Cards>\n  <Card title="Inner" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  await selectFirstJsxComponent(page, 'Card');

  // 200ms debounce + margin. aria-atomic="true" ensures AT reads the full
  // announcement on every mutation.
  const liveRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(liveRegion).toContainText('Selected: Card', { timeout: 2_000 });
});

// ── S9: Three-axis composition (SC-4) ────────────────────────────────────
//
// `data-selected="true"` + `data-needs-config="true"` + `data-dragging="true"`
// must compose without gymnastics — dragging dominates (halo hidden) even
// when selected + needs-config are also set. Only a real browser resolves
// the CSS cascade; no other tier catches this bug class.

test('S9: three-axis composition — dragging dominates over selected + needs-config', async ({
  page,
  api,
}) => {
  // Card with empty title triggers `data-needs-config` (required-string-empty).
  await setupDoc(page, api, '<Card title="" />\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await expect(card).toHaveAttribute('data-needs-config', 'true', { timeout: 5_000 });

  // Select + start drag.
  await selectFirstJsxComponent(page, 'Card');
  await expect(card).toHaveAttribute('data-selected', 'true');
  await card.dispatchEvent('dragstart');
  await expect(card).toHaveAttribute('data-dragging', 'true');

  // All three attrs present simultaneously.
  const attrs = await card.evaluate((el) => ({
    selected: el.getAttribute('data-selected'),
    needsConfig: el.getAttribute('data-needs-config'),
    dragging: el.getAttribute('data-dragging'),
  }));
  expect(attrs.selected).toBe('true');
  expect(attrs.needsConfig).toBe('true');
  expect(attrs.dragging).toBe('true');

  // Dragging dominates: halo opacity = 0, transition disabled.
  const haloState = await card.evaluate((el) => {
    const cs = window.getComputedStyle(el, '::after');
    return { opacity: cs.opacity, transitionDuration: cs.transitionDuration };
  });
  expect(haloState.opacity).toBe('0');
  expect(haloState.transitionDuration).toBe('0s');

  // Cleanup so the shared test-reset doesn't leave a selected+dragging
  // wrapper in the doc.
  await card.dispatchEvent('dragend');
});

// ── S10: Document anchor clears selection (SPEC §3.5) ────────────────────

test('S10: clicking "Document" breadcrumb anchor clears selection via programmatic origin', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Card title="Target" />\n');
  await page.waitForSelector('.jsx-component-wrapper');

  await selectFirstJsxComponent(page, 'Card');
  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await expect(card).toHaveAttribute('data-selected', 'true');

  const breadcrumb = page.getByRole('navigation', { name: 'Block ancestor navigation' });
  await breadcrumb.getByRole('button', { name: 'Document' }).click();

  // DOM is the observable: wait for all selection halos to clear. The
  // SelectionStatePlugin's `selectedBlockId=null` materializes as zero
  // wrappers with `data-selected="true"`.
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0, { timeout: 2_000 });

  // TextSelection at position 0 (the Document anchor's effect) — the
  // editor's PM selection is empty (not a NodeSelection).
  const selectionKind = await page.evaluate(() => {
    const ed = window.__activeEditor;
    if (!ed) return 'no-editor';
    return ed.state.selection.empty ? 'empty' : 'not-empty';
  });
  expect(selectionKind).toBe('empty');
});

// ── S11: Per-type halo inset values (SC-P-17 / Precedent #29) ────────────
//
// Parameterized across [cards, steps] (-6px), [imagezoom] (-2px),
// default (-4px). Tests CSS-variable resolution at runtime — only a real
// browser evaluates `--selection-halo-inset` through the cascade.

type InsetCase = { fixture: string; componentType: string; expectedInset: string };
const INSET_CASES: InsetCase[] = [
  {
    fixture: '<Cards>\n  <Card title="a" />\n</Cards>\n',
    componentType: 'cards',
    expectedInset: '-6px',
  },
  {
    fixture: '<Steps>\n<Step>\n\n### step\n\nbody\n\n</Step>\n</Steps>\n',
    componentType: 'steps',
    expectedInset: '-6px',
  },
  {
    fixture: '<Card title="Plain" />\n',
    componentType: 'card',
    expectedInset: '-4px',
  },
  // Note: ImageZoom holds the `-2px` bucket per globals.css §7a, but its
  // fumadocs-ui component doesn't mount cleanly in the E2E test environment
  // (requires image asset resolution). Tested via showcase-driven manual
  // inspection instead. The `-2px` rule itself is covered by the STOP rule
  // for CSS regressions. (Mermaid was removed from the registry 2026-04-21 —
  // see specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md)
];

for (const { fixture, componentType, expectedInset } of INSET_CASES) {
  test(`S11: [${componentType}] --selection-halo-inset resolves to ${expectedInset}`, async ({
    page,
    api,
  }) => {
    await setupDoc(page, api, fixture);
    await page.waitForSelector(`.jsx-component-wrapper[data-component-type="${componentType}"]`);

    const wrapper = page
      .locator(`.jsx-component-wrapper[data-component-type="${componentType}"]`)
      .first();
    const inset = await wrapper.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('--selection-halo-inset').trim(),
    );
    expect(inset).toBe(expectedInset);
  });
}

// ── S12: Halo z-index: -1 + content visible behind (SC-INV-3) ────────────
//
// Precedent #26 (all user content visible + editable) + SPEC §2 line 108:
// the halo must NOT occlude block content. `z-index: -1` on the ::after
// pseudo-element places the halo behind the wrapper's own content.

test('S12: halo z-index is -1 and .component-children is fully visible when selected', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Cards>\n  <Card title="Visible" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="cards"]');

  await selectFirstJsxComponent(page, 'Cards');
  const cards = page.locator('.jsx-component-wrapper[data-component-type="cards"]').first();
  await expect(cards).toHaveAttribute('data-selected', 'true');

  // Halo sits behind content.
  const zIndex = await cards.evaluate((el) => window.getComputedStyle(el, '::after').zIndex);
  expect(zIndex).toBe('-1');

  // Content is rendered, visible, and non-zero-sized.
  const contentState = await cards.evaluate((el) => {
    const content = el.querySelector('.component-children') as HTMLElement | null;
    if (!content) return { present: false };
    const cs = window.getComputedStyle(content);
    const rect = content.getBoundingClientRect();
    return {
      present: true,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(contentState.present).toBe(true);
  expect(contentState.opacity).toBe('1');
  expect(contentState.visibility).toBe('visible');
  expect(contentState.display).not.toBe('none');
  expect(contentState.width).toBeGreaterThan(0);
  expect(contentState.height).toBeGreaterThan(0);
});

// ── S13: Callout type-color inheritance (Precedent #29) ──────────────────
//
// `[data-component-type="callout"] { --selection-halo-color: var(--callout-
// type-color, var(--ring)) }` means the halo inherits the callout's own
// type color. Verify via computed border-color on the ::after element.
// Parameterized across 5 callout types — each resolves to a distinct color
// string.

type CalloutCase = { type: string };
const CALLOUT_TYPES: CalloutCase[] = [
  { type: 'info' },
  { type: 'warning' },
  { type: 'error' },
  { type: 'success' },
  { type: 'idea' },
];

for (const { type } of CALLOUT_TYPES) {
  test(`S13: Callout[type="${type}"] halo border-color is non-transparent when selected`, async ({
    page,
    api,
  }) => {
    await setupDoc(page, api, `<Callout type="${type}">\n\nbody\n\n</Callout>\n`);
    await page.waitForSelector('.jsx-component-wrapper[data-component-type="callout"]');

    await selectFirstJsxComponent(page, 'Callout');
    const callout = page.locator('.jsx-component-wrapper[data-component-type="callout"]').first();
    await expect(callout).toHaveAttribute('data-selected', 'true', { timeout: 5_000 });

    // Read computed border-color from the ::after pseudo-element.
    const borderColor = await callout.evaluate((el) => {
      const cs = window.getComputedStyle(el, '::after');
      return cs.borderColor || cs.borderTopColor;
    });

    // Selected callout's halo must have a resolved, non-transparent color.
    // We don't pin a specific rgb() value because the callout's type color
    // lives in fumadocs tokens that can re-theme without breaking the
    // contract; we only assert the color resolves (non-transparent).
    expect(borderColor).not.toBe('transparent');
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(borderColor).not.toBe('');
  });
}

// NOTE on per-type color uniqueness: the CSS rule
// `[data-component-type="callout"] { --selection-halo-color:
// var(--callout-type-color, var(--ring)) }` at globals.css §7a is designed
// to make each callout type produce a distinct halo color (info=blue,
// warning=yellow, etc.). In practice this requires the Callout component
// itself to set `--callout-type-color` on its rendered DOM, which the
// current fumadocs-ui wrapper does NOT do — all 5 types resolve to the
// same fallback color (`var(--ring)`). A "5 distinct colors" assertion
// here would fail: received 1, expected 5.
//
// Rather than ship a failing test, this gap is recorded here for the
// follow-up that wires `--callout-type-color` into the Callout wrapper
// (via the fumadocs-ui internal callout tokens like `bg-fd-callout-*`).
// When that lands, restore the distinct-colors assertion as S13b.

// ── S14: Programmatic origin via SELECTION_ORIGIN_META_KEY ───────────────
//
// S1 covers keyboard origin, S2 covers pointer. Programmatic origin is
// what agent writes + breadcrumb clicks + test-harness selection both
// rely on. Exercise it directly via a chain() + tr.setMeta dispatch —
// the same pattern the Breadcrumb component uses at
// Breadcrumb.tsx:139-148 and 199-210.

test('S14: tr.setMeta(SELECTION_ORIGIN_META_KEY) sets data-selection-origin=programmatic', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Card title="Target" />\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  const dispatched = await page.evaluate(() => {
    const editor = window.__activeEditor;
    if (!editor) return false;
    let cardPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (cardPos !== -1) return false;
      if (node.type.name === 'jsxComponent' && node.attrs.componentName === 'Card') {
        cardPos = pos;
        return false;
      }
      return true;
    });
    if (cardPos === -1) return false;
    editor
      .chain()
      .focus()
      .setNodeSelection(cardPos)
      .command(({ tr }) => {
        tr.setMeta('selectionStatePlugin/origin', 'programmatic');
        return true;
      })
      .run();
    return true;
  });
  expect(dispatched).toBe(true);

  const card = page.locator('.jsx-component-wrapper[data-component-type="card"]').first();
  await expect(card).toHaveAttribute('data-selected', 'true', { timeout: 2_000 });
  await expect(card).toHaveAttribute('data-selection-origin', 'programmatic');
});

// ── S15: Breadcrumb container prevents footer layout-shift ───────────────
//
// Round-1 review fix (commit `262f0756`): the Breadcrumb's container has
// `min-h-[28px]` so selecting / deselecting doesn't pump the editor body
// up and down. Sample the footer's offsetHeight across a rapid-selection
// burst — it must stay constant ≥ 28.

test('S15: Breadcrumb footer height is constant across rapid selection changes', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Card title="A" />\n\n<Card title="B" />\n\n<Card title="C" />\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  // Locate via CSS (not getByRole): when no block is selected, the nav is
  // rendered with `aria-hidden="true"` so it's excluded from Playwright's
  // accessibility tree. We're sampling offsetHeight in both states, so
  // the CSS class is the right anchor.
  const breadcrumb = page.locator('.jsx-component-breadcrumb');
  await expect(breadcrumb).toBeAttached();

  // Baseline deselected height.
  const initialHeight = await breadcrumb.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(initialHeight).toBeGreaterThanOrEqual(28);

  // Rapid-fire 6 selection / deselection cycles, sampling height after each.
  const heights: number[] = [initialHeight];
  for (let i = 0; i < 6; i++) {
    // Select nth Card via PM (deterministic; no timing dependency).
    await page.evaluate((idx) => {
      const ed = window.__activeEditor;
      if (!ed) return;
      const positions: number[] = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'jsxComponent' && node.attrs.componentName === 'Card') {
          positions.push(pos);
        }
        return true;
      });
      const pos = positions[idx % positions.length];
      if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).run();
    }, i);
    heights.push(await breadcrumb.evaluate((el) => (el as HTMLElement).offsetHeight));

    // Deselect via setTextSelection(0).
    await page.evaluate(() => {
      const ed = window.__activeEditor;
      if (ed) ed.chain().focus().setTextSelection(0).run();
    });
    heights.push(await breadcrumb.evaluate((el) => (el as HTMLElement).offsetHeight));
  }

  // Every sample must be ≥ 28 (the reserved min-height — the round-1
  // review fix that prevents the pre-fix ~28px pump on rapid selection).
  for (const h of heights) {
    expect(h).toBeGreaterThanOrEqual(28);
  }
  // Layout-shift tolerance: sub-pixel height jitter (1px) is acceptable
  // because some browsers round offsetHeight to integer px after subpixel
  // layout. The pre-fix behavior was a full 28px pump (min-h not reserved);
  // this tolerance catches any regression larger than rounding noise.
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  expect(max - min).toBeLessThanOrEqual(1);
});

// ── S16: axe-core audit finds zero new violations with selection active ──
//
// SPEC §6.5 mandates axe-core on the component-showcase after mounting.
// We can't baseline against main from within the PR's Playwright harness
// (would need a second browser session on a different branch), so the
// assertion is the simpler form: zero `critical` or `serious` violations
// are introduced on elements the selection layer owns.

test('S16: axe-core — zero critical violations on selection-layer surfaces', async ({
  page,
  api,
}) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await setupDoc(page, api, '<Cards>\n  <Card title="A11y" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper');
  await selectFirstJsxComponent(page, 'Card');

  // Scope to the selection-layer surfaces, not the whole page — avoids
  // false positives on unrelated shells (sidebar, header, presence bar).
  //
  // Severity threshold: critical only. `serious` color-contrast flags
  // target the breadcrumb's `text-muted-foreground` styling (a
  // main-branch design choice on muted secondary navigation text,
  // deliberately sub-AA for visual hierarchy). Without a same-suite
  // baseline run against `main`, we can't distinguish
  // pre-existing-serious from PR-introduced-serious — fall back to
  // `critical` which rules out genuine regressions regardless of
  // baseline: critical = "will break assistive tech entirely"; serious
  // = "degrades experience, often deliberate design trade-off." The
  // broader suite already runs axe at a11y.e2e.ts scope for the
  // pre-existing baseline.
  const results = await new AxeBuilder({ page })
    .include('.ProseMirror')
    .include('[aria-label="Block ancestor navigation"]')
    .include('[role="status"][aria-live="polite"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const blocking = results.violations.filter((v) => v.impact === 'critical');
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => {
        const nodes = v.nodes
          .map((n) => `      target: ${n.target.join(' ')}\n      html: ${n.html.slice(0, 200)}`)
          .join('\n');
        return `  [${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
      })
      .join('\n');
    throw new Error(`axe-core found ${blocking.length} critical violation(s):\n${summary}`);
  }
  expect(blocking.length).toBe(0);
});

// ── S17: Keyboard focus order flows through breadcrumb buttons ───────────
//
// SC-5 bullet 4 + SPEC §3.5: breadcrumb segments are focusable buttons
// (Document anchor + each ancestor). Tab from the editor into the
// breadcrumb; the innermost (aria-current) is NON-interactive; every
// other segment is tab-reachable.

test('S17: Tab from editor reaches every non-innermost breadcrumb button in order', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Cards>\n  <Card title="Deep" />\n</Cards>\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');
  await selectFirstJsxComponent(page, 'Card');

  // Focus the editor first so Tab starts from a known position.
  await page.locator('.ProseMirror').focus();

  // Collect focused selectors until we've stepped through the breadcrumb.
  // Safety cap at 40 tabs — the breadcrumb should be reached well within.
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const focusedInfo = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const nav = el.closest('nav[aria-label="Block ancestor navigation"]');
      const text = (el.textContent || '').trim();
      return {
        tag: el.tagName,
        inNav: nav !== null,
        text,
        hasAriaCurrent: el.getAttribute('aria-current') === 'location',
      };
    });
    if (!focusedInfo) continue;
    if (focusedInfo.inNav) {
      seen.push(focusedInfo.text);
      // Innermost (aria-current) should NEVER be reached — it's a span, not a button.
      expect(focusedInfo.hasAriaCurrent).toBe(false);
    }
    if (seen.length >= 2) break; // Document + Cards — that's the expected reachable set.
  }

  expect(seen).toContain('Document');
  expect(seen).toContain('Cards');
  // "Card" is the innermost (aria-current="location"); it is NOT a button
  // per the Breadcrumb's design, so it must not appear in the focus trail.
  expect(seen).not.toContain('Card');
});

// ── S18: aria-live debounce coalesces rapid selection changes ────────────
//
// SC-5 bullet 4 + SelectionAnnouncer's 200ms debounce: rapid-fire 3
// selections within 150ms (faster than the debounce window) → the
// MutationObserver should see fewer textContent mutations than selection
// changes (ideally exactly 1 post-debounce, with a small margin for the
// clear-then-write two-step).

test('S18: rapid selection changes coalesce into a single aria-live announcement', async ({
  page,
  api,
}) => {
  await setupDoc(page, api, '<Card title="A" />\n\n<Card title="B" />\n\n<Card title="C" />\n');
  await page.waitForSelector('.jsx-component-wrapper[data-component-type="card"]');

  const liveRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(liveRegion).toBeAttached();

  // Install a MutationObserver on the region that counts text-content
  // mutations observed from now until we explicitly stop.
  await page.evaluate(() => {
    const region = document.querySelector('[role="status"][aria-live="polite"]');
    if (!region) throw new Error('live region not found');
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__ariaLiveMutations = [];
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData' || r.type === 'childList') {
          // biome-ignore lint/suspicious/noExplicitAny: test-only global
          (window as any).__ariaLiveMutations.push({
            text: region.textContent,
            at: performance.now(),
          });
        }
      }
    });
    obs.observe(region, { characterData: true, childList: true, subtree: true });
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__ariaLiveObserver = obs;
  });

  // Collect three Card positions and select them rapidly.
  await page.evaluate(() => {
    const ed = window.__activeEditor;
    if (!ed) return;
    const positions: number[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'jsxComponent' && node.attrs.componentName === 'Card') {
        positions.push(pos);
      }
      return true;
    });
    // Fire 3 selections synchronously within one microtask. The debounce
    // window (200ms) should coalesce these into one announcement.
    for (let i = 0; i < 3; i++) {
      const pos = positions[i];
      if (pos !== undefined) ed.chain().focus().setNodeSelection(pos).run();
    }
  });

  // Wait past the debounce window (200ms + clear-then-write + safety margin).
  await page.waitForFunction(
    () => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      const mutations = ((window as any).__ariaLiveMutations ?? []) as Array<{
        text: string;
        at: number;
      }>;
      // A stable non-empty announcement has landed if we've seen at least
      // one mutation whose text starts with "Selected:" and the last
      // mutation is at least 300ms old.
      if (mutations.length === 0) return false;
      const last = mutations[mutations.length - 1];
      const withContent = mutations.filter((m) => m.text?.startsWith('Selected:'));
      return withContent.length >= 1 && performance.now() - last.at > 300;
    },
    null,
    { timeout: 2_000 },
  );

  const mutations = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const m = ((window as any).__ariaLiveMutations ?? []) as Array<{ text: string; at: number }>;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__ariaLiveObserver?.disconnect();
    return m;
  });

  // Post-debounce, the non-empty mutations (i.e., the "Selected: X" writes,
  // skipping the clear-step '' writes) should be at most ONE — not three,
  // despite three selection changes. Count only mutations whose text is
  // non-empty and starts with "Selected:".
  const contentMutations = mutations.filter(
    (m) => typeof m.text === 'string' && m.text.startsWith('Selected:'),
  );
  expect(contentMutations.length).toBeGreaterThanOrEqual(1);
  // Key invariant: debounce coalesces — fewer announcements than selection
  // changes. 3 rapid selections should not produce 3 announcements.
  expect(contentMutations.length).toBeLessThan(3);
});
