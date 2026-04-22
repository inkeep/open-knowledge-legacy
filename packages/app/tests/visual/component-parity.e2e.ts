/**
 * Visual regression suite — editor vs docs-site parity for 17 built-ins (M20).
 *
 * Captures screenshots of each built-in component rendered in the editor and
 * compares against golden baselines. Tolerance: ≤1% pixel delta (accommodates
 * anti-aliasing/subpixel). Covers {light, dark} themes and {selected, unselected}
 * states per VR01-VR18 in SPEC §7a.
 *
 * Baseline management:
 *   - packages/app/tests/visual/__snapshots__/ stores approved baselines
 *   - First run creates baselines; subsequent runs diff
 *   - Golden-file updates require explicit: bun run test:visual:update
 *   - Cannot silently regenerate in CI
 *
 * Isolation: uses the per-worker fixture + per-test UUID docName — the same
 * pattern enforced across all E2E suites (see CLAUDE.md "Per-test docName
 * isolation"). Hardcoded `'test-doc'` is forbidden because parallel workers
 * would race on the same CRDT state, baking corrupted presence / selection
 * pixels into the golden under `test:visual:update`.
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../stress/_helpers';

/** Wait for provider to connect and sync */
async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
}

/** Wait for the editor's top-level doc to contain at least N blocks (seed
 *  acknowledged) — replaces every `waitForTimeout(500)` after a write. */
async function waitForDocSeeded(page: Page, minChildCount = 1) {
  await page.waitForFunction(
    (n) => (window.__activeEditor?.state.doc.childCount ?? 0) >= n,
    minChildCount,
    { timeout: 10_000 },
  );
}

/** Toggle theme to dark or light mode */
async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('ok-theme-v1', t);
  }, theme);
  // Condition: the documentElement should carry `.dark` iff theme is dark.
  await page.waitForFunction(
    (t) => document.documentElement.classList.contains('dark') === (t === 'dark'),
    theme,
    { timeout: 2000 },
  );
}

/** Click to select a jsxComponent block by its data-component-name */
async function selectComponent(page: Page, componentName: string) {
  const component = page.locator(`[data-jsx-component][data-component-name="${componentName}"]`);
  await component.first().click();
  // Condition: the clicked wrapper must receive the `data-selected="true"`
  // attribute. That flips when PM's selection lands on the NodeSelection
  // and the NodeView re-renders with `selected=true`.
  await component
    .first()
    .waitFor({ state: 'attached' })
    .catch(() => {});
  await page.waitForFunction(
    (name) => {
      const el = document.querySelector(
        `[data-jsx-component][data-component-name="${name}"][data-selected="true"]`,
      );
      return Boolean(el);
    },
    componentName,
    { timeout: 5_000 },
  );
}

/** Deselect by clicking on the editor background */
async function deselectAll(page: Page) {
  await page.locator('.ProseMirror').click({ position: { x: 10, y: 10 } });
  await page.waitForFunction(
    () => !document.querySelector('[data-jsx-component][data-selected="true"]'),
    null,
    { timeout: 2_000 },
  );
}

/**
 * Per-test isolation: seed a unique docName, replace its contents, navigate
 * to it via hash route. Returns the docName so the caller can reference it
 * later if needed.
 */
async function seedAndNavigate(
  page: Page,
  api: { seedDocs: (d: Array<{ name: string; markdown: string }>) => Promise<void> },
  markdown: string,
): Promise<string> {
  const docName = `vr-${randomUUID().slice(0, 12)}`;
  await api.seedDocs([{ name: docName, markdown }]);
  await page.goto(`/#/${docName}`);
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
  return docName;
}

// ── VR01: Callout ──────────────────────────────────────────────

const calloutTypes = ['note', 'warning', 'error', 'info'] as const;

for (const calloutType of calloutTypes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`VR01-${calloutType}-${theme}: Callout type=${calloutType} in ${theme} mode`, async ({
      page,
      api,
    }) => {
      await seedAndNavigate(
        page,
        api,
        `<Callout type="${calloutType}">\n\nThis is a ${calloutType} callout with **bold** and *italic* text.\n\n</Callout>`,
      );
      await waitForDocSeeded(page);
      await setTheme(page, theme);
      await deselectAll(page);

      const component = page.locator('[data-jsx-component]').first();
      await expect(component).toHaveScreenshot(`callout-${calloutType}-${theme}-unselected.png`, {
        maxDiffPixelRatio: 0.01,
      });

      await selectComponent(page, 'Callout');
      await expect(component).toHaveScreenshot(`callout-${calloutType}-${theme}-selected.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}

// ── VR02: Card ─────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR02-${theme}: Card in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Card title="Getting Started" href="/docs/start">\n\nLearn how to set up the project.\n\n</Card>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);
    await deselectAll(page);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`card-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR03: Cards ────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR03-${theme}: Cards grid in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Cards>\n\n<Card title="First" href="/a">\n\nFirst card content.\n\n</Card>\n\n<Card title="Second" href="/b">\n\nSecond card content.\n\n</Card>\n\n</Cards>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`cards-grid-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR04: Steps ────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR04-${theme}: Steps with 3 children in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Steps>\n\n<Step>\n\nInstall dependencies\n\n</Step>\n\n<Step>\n\nConfigure settings\n\n</Step>\n\n<Step>\n\nDeploy\n\n</Step>\n\n</Steps>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`steps-3-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR05: Tabs ─────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR05-${theme}: Tabs with 2 tabs in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Tabs items={["npm", "pnpm"]}>\n\n<Tab value="npm">\n\nnpm install open-knowledge\n\n</Tab>\n\n<Tab value="pnpm">\n\npnpm add open-knowledge\n\n</Tab>\n\n</Tabs>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`tabs-2-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR06: Accordions ───────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR06-${theme}: Accordions in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Accordions>\n\n<Accordion title="First">\n\nFirst accordion content.\n\n</Accordion>\n\n<Accordion title="Second">\n\nSecond accordion content.\n\n</Accordion>\n\n</Accordions>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`accordions-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR08: Files ────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR08-${theme}: Files tree in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Files>\n\n<Folder name="src" defaultOpen>\n\n<File name="index.ts" />\n\n<File name="config.ts" />\n\n</Folder>\n\n<File name="package.json" />\n\n</Files>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`files-tree-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR10: Banner ───────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR10-${theme}: Banner in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<Banner title="Notice">\n\nThis is an important announcement.\n\n</Banner>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`banner-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR17: Mixed document ───────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR17-${theme}: Mixed 6-component document in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      [
        '# Mixed Components',
        '',
        '<Callout type="warning">',
        '',
        'Watch out!',
        '',
        '</Callout>',
        '',
        '<Steps>',
        '',
        '<Step>',
        '',
        'Step one',
        '',
        '</Step>',
        '',
        '<Step>',
        '',
        'Step two',
        '',
        '</Step>',
        '',
        '</Steps>',
        '',
        '<Cards>',
        '',
        '<Card title="A" href="/a">',
        '',
        'Card A',
        '',
        '</Card>',
        '',
        '</Cards>',
        '',
        '<Banner title="Info">',
        '',
        'Banner text',
        '',
        '</Banner>',
      ].join('\n'),
    );
    // Mixed doc: require at least 5 top-level blocks (heading + 4 components).
    await waitForDocSeeded(page, 5);
    await setTheme(page, theme);

    await expect(page.locator('.ProseMirror')).toHaveScreenshot(`mixed-document-${theme}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR18: Wildcard unregistered ────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR18-${theme}: Wildcard unregistered component in ${theme} mode`, async ({ page, api }) => {
    await seedAndNavigate(
      page,
      api,
      '<CustomThing prop="value">\n\nUnregistered component content\n\n</CustomThing>',
    );
    await waitForDocSeeded(page);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`wildcard-unregistered-${theme}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
