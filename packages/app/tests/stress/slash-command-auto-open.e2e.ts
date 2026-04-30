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

test('PLACEHOLDER-CLICK-OPENS-PANEL: clicking placeholder NodeSelects + reopens PropPanel', async ({
  page,
  api,
}) => {
  // Dismiss the auto-opened panel via Escape (without filling src), then
  // click the placeholder pill to verify the click handler is wired:
  // setNodeSelection on the img + setPopoverOpen(true).
  const docName = `placeholder-click-opens-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/image');
  await waitForSlashMenuFirstOption(page, 'image');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-prop-panel]')).toBeHidden({ timeout: PROP_PANEL_TIMEOUT });
  await expect(page.locator('[data-descriptor-placeholder]')).toBeVisible();

  await page.locator('[data-descriptor-placeholder]').click();
  await expect(page.locator('[data-prop-panel]')).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });

  // Verify PM selection is now a NodeSelection on the img specifically.
  const selected = await page.evaluate(() => {
    const ed = (window as unknown as { __activeEditor?: { state: { selection: unknown } } })
      .__activeEditor;
    if (!ed) return null;
    const sel = ed.state.selection as {
      node?: { attrs: { componentName?: string } };
    };
    return sel.node?.attrs.componentName ?? null;
  });
  expect(selected).toBe('img');
});

test('PLACEHOLDER-FILL-DISMISSES: filling src dismisses placeholder, real img renders', async ({
  page,
  api,
}) => {
  // After typing a src value into the autofocused input, the descriptor
  // re-renders with a non-empty src — `shouldRenderPlaceholder` returns
  // false and the real <img> takes over from the placeholder pill.
  const docName = `placeholder-fill-dismisses-${Math.random().toString(36).slice(2, 10)}`;
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
  // The autofocused input is the src field (htmlImgProps[0] has autoFocus: true).
  const autofocusedInput = page.locator('[data-prop-autofocus]');
  await expect(autofocusedInput).toBeVisible();

  await autofocusedInput.fill('/test.png');
  // Tab away to commit the value (PropPanel onChange fires per keystroke,
  // but the wrapper data-attrs only update after a re-render with the new
  // props — Tab forces a flush of any pending events).
  await page.keyboard.press('Tab');

  await expect(page.locator('[data-descriptor-placeholder]')).toHaveCount(0);
  await expect(
    page.locator('.jsx-component-wrapper[data-component-type="img"] img'),
  ).toHaveAttribute('src', '/test.png');
});

test('PLACEHOLDER-CONTAINER-EXCLUDED: slash-inserting /callout does NOT show placeholder', async ({
  page,
  api,
}) => {
  // hasChildren=true descriptors (Callout, Accordion) are excluded from the
  // placeholder — `shouldRenderPlaceholder`'s first guard short-circuits on
  // descriptor.hasChildren. Verifies the predicate gating, not just the
  // resolver.
  const docName = `placeholder-container-excluded-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/callout');
  await waitForSlashMenuFirstOption(page, 'callout');
  await page.keyboard.press('Enter');

  // Wait for the Callout NodeView to mount before asserting placeholder absence
  // — without this, the assertion races the slash-insert dispatch.
  await expect(page.locator('[data-jsx-component][data-component-type="callout"]')).toBeVisible({
    timeout: PROP_PANEL_TIMEOUT,
  });
  await expect(page.locator('[data-descriptor-placeholder]')).toHaveCount(0);
});

test('PLACEHOLDER-CHROME-VISIBLE: chrome bar (gear, delete) renders alongside the placeholder pill', async ({
  page,
  api,
}) => {
  // Regression for the "gear should be persistent in placeholder mode" polish.
  // Before: chrome bar was gated by `{!showPlaceholder && ...}` — placeholder
  // mode hid every chrome control. After: chrome bar always renders, so the
  // gear-hint UX (driven by `data-needs-config`) applies to fresh slash inserts
  // the same way it applies to a configured `<img alt="">`.
  const docName = `placeholder-chrome-visible-${Math.random().toString(36).slice(2, 10)}`;
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

  // Close the auto-opened panel so the chrome bar's gear button isn't hidden by
  // the popover overlay during the assertion.
  await page.keyboard.press('Escape');

  // Chrome bar exists inside the same wrapper as the placeholder.
  const wrapper = page.locator('[data-jsx-component]').first();
  await expect(wrapper.locator('.jsx-component-chrome')).toBeAttached();
  await expect(wrapper.locator('button[aria-label*="properties"]')).toBeAttached();
  await expect(wrapper.locator('button[aria-label*="Delete"]')).toBeAttached();
});

test('PLACEHOLDER-DOM-SHAPE: placeholder is a div (not button) and is full-width', async ({
  page,
  api,
}) => {
  // Regression for the drag-reorder fix. A native `<button>` element captures
  // mousedown for activation and breaks the wrapper's HTML5 drag-handle
  // (`data-drag-handle="" draggable="true"`). Switching to `<div role="button">`
  // lets mousedown propagate to the wrapper so drag works through the pill the
  // same way it works through a configured <img>. We assert the structural fix
  // here (tagName + role + w-full) rather than simulating real HTML5 drag,
  // which is unreliable in headless Chromium.
  const docName = `placeholder-dom-shape-${Math.random().toString(36).slice(2, 10)}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await page.waitForSelector('.ProseMirror');
  await waitForActiveProviderSynced(page);
  await page.click('.ProseMirror');

  await page.keyboard.type('/image');
  await waitForSlashMenuFirstOption(page, 'image');
  await page.keyboard.press('Enter');

  const placeholder = page.locator('[data-descriptor-placeholder]');
  await expect(placeholder).toBeVisible({ timeout: PROP_PANEL_TIMEOUT });

  const shape = await placeholder.evaluate((el) => {
    const wrapper = el.closest('[data-jsx-component]');
    return {
      tagName: el.tagName,
      role: el.getAttribute('role'),
      placeholderWidth: el.getBoundingClientRect().width,
      // `.tiptap` is the ProseMirror editor root — descriptor wrappers
      // size relative to its content area.
      editorWidth: wrapper?.parentElement?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(shape.tagName).toBe('DIV');
  expect(shape.role).toBe('button');
  // Full-width: pill spans the same width as the wrapper's parent (the editor
  // content column). A small tolerance handles sub-pixel rounding.
  expect(shape.placeholderWidth).toBeGreaterThanOrEqual(shape.editorWidth - 2);
});
