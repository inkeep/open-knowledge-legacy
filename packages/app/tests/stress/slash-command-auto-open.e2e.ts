/**
 * Slash-command auto-open of the descriptor PropPanel.
 *
 * Two failure modes break in lockstep when the producer captures a position
 * that differs from the inserted node's actual `getPos()`:
 *
 *   1. `setNodeSelection(wrong)` rejects (interior pos has nodeAt === null) →
 *      consumer's `selected` never becomes `true`.
 *   2. `consumeAutoOpen(getPos())` looks up a different key than the producer's
 *      `setPendingAutoOpen(wrong)` wrote → returns `false` even if selection
 *      had landed.
 *
 * Either path silences the auto-open useEffect in `JsxComponentView`. Covers
 * img/video (self-closing leaves) and Callout (block children) — same producer,
 * different post-insert document shapes — so a shape-asymmetric regression
 * surfaces.
 */

import { expect, test, waitForActiveProviderSynced, waitForSlashMenuFirstOption } from './_helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROP_PANEL_TIMEOUT = 1_000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SLASH-AUTOOPEN-IMG: slash-inserting Image auto-opens its PropPanel', async ({
  page,
  api,
}) => {
  const docName = `slash-autoopen-img-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/image');
  await waitForSlashMenuFirstOption(page, 'image');
  await page.keyboard.press('Enter');

  // `[data-prop-panel]` is rendered only when the Popover's `open` state is true,
  // which the consumer toggles via the auto-open useEffect in JsxComponentView.
  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });
});

test('SLASH-AUTOOPEN-VIDEO: slash-inserting Video auto-opens its PropPanel', async ({
  page,
  api,
}) => {
  const docName = `slash-autoopen-video-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/video');
  await waitForSlashMenuFirstOption(page, 'video');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });
});

test('SLASH-AUTOOPEN-CALLOUT: slash-inserting Callout auto-opens its PropPanel', async ({
  page,
  api,
}) => {
  // Callout has children (paragraph slot) so its post-insert nodeSize and
  // boundary offset differ from self-closing leaves — guards against
  // shape-asymmetric position regressions.
  const docName = `slash-autoopen-callout-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/callout');
  await waitForSlashMenuFirstOption(page, 'callout');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });
});

test('SLASH-AUTOOPEN-IMG-MULTI: slash-inserting Image with a prior Image auto-opens the NEW one', async ({
  page,
  api,
}) => {
  // Multi-instance regression: cursor-relative heuristics ("last match before
  // cursor") misidentify which match is new when the cursor doesn't land past
  // the inserted node. Anchor the assertion on the actually-selected node
  // (NodeSelection) and on the prop input value — the new img has empty src
  // by default; the prior img has a recognizable marker.
  const docName = `slash-autoopen-img-multi-${Math.random().toString(36).slice(2, 10)}`;
  await api.seedDocs([{ name: docName, markdown: '<img src="prior-marker.png" />\n\n\n' }]);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);

  // Wait for the seeded img NodeView to mount.
  await expect(page.locator('[data-jsx-component]')).toHaveCount(1);

  // Land cursor at end of doc (in the trailing empty paragraph).
  await page.click('.ProseMirror');
  await page.keyboard.press('ControlOrMeta+End');

  await page.keyboard.type('/image');
  await waitForSlashMenuFirstOption(page, 'image');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-jsx-component]')).toHaveCount(2);
  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });

  // The selected (and thus auto-opened) node must be the NEW img — not the
  // pre-existing one. Read the PM NodeSelection's node attrs directly: the
  // new img has default props (empty src), the prior has 'prior-marker.png'.
  const selectedSrc = await page.evaluate(() => {
    const ed = (window as unknown as { __activeEditor?: { state: { selection: unknown } } })
      .__activeEditor;
    if (!ed) return null;
    const sel = ed.state.selection as {
      node?: { attrs: { componentName?: string; props?: Record<string, unknown> } };
    };
    if (!sel.node) return null;
    return {
      componentName: sel.node.attrs.componentName,
      src: sel.node.attrs.props?.src ?? null,
    };
  });

  expect(selectedSrc).not.toBeNull();
  expect(selectedSrc?.componentName).toBe('img');
  expect(selectedSrc?.src).not.toBe('prior-marker.png');
});

test('PLACEHOLDER-RENDERS-FRESH: slash-inserted img shows placeholder + auto-opens panel', async ({
  page,
  api,
}) => {
  // Empty src renders the dashed-border "Add an image" placeholder pill
  // anchored to the auto-opened PropPanel — replaces the previous
  // broken-image-icon UX. The placeholder coexists with the auto-open path
  // (placeholder is the popover anchor; PropPanel autoFocuses src input).
  const docName = `placeholder-renders-fresh-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/image');
  await waitForSlashMenuFirstOption(page, 'image');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-descriptor-placeholder]')).toBeVisible({
    timeout: PROP_PANEL_TIMEOUT,
  });
  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });
});
