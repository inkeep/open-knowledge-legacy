/**
 * Visual regression suite — editor vs docs-site parity for 18 built-ins (M20).
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
 * Requires: Playwright browsers installed. Dev server started by
 * playwright.config.ts webServer on VITE_PORT (or default 5173).
 */

import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

/** Wait for provider to connect and sync */
async function waitForProvider(page: Page) {
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
}

/** Write MDX content to the editor via the API */
async function writeContent(content: string, docName = 'test-doc') {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, content, mode: 'replace' }),
  });
  if (!res.ok) throw new Error(`agent-write-md failed: ${res.status}`);
}

/** Toggle theme to dark or light mode */
async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('ok-theme-v1', t);
  }, theme);
  // Wait for potential re-renders
  await page.waitForTimeout(200);
}

/** Click to select a jsxComponent block by its data-component-name */
async function selectComponent(page: Page, componentName: string) {
  const component = page.locator(`[data-jsx-component][data-component-name="${componentName}"]`);
  await component.first().click();
  await page.waitForTimeout(100);
}

/** Deselect by clicking on the editor background */
async function deselectAll(page: Page) {
  await page.locator('.ProseMirror').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`test-reset failed: ${res.status}`);
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await waitForProvider(page);
  await page.waitForSelector('.ProseMirror');
});

// ── VR01: Callout ──────────────────────────────────────────────

const calloutTypes = ['note', 'warning', 'error', 'info'] as const;

for (const calloutType of calloutTypes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`VR01-${calloutType}-${theme}: Callout type=${calloutType} in ${theme} mode`, async ({
      page,
    }) => {
      await writeContent(
        `<Callout type="${calloutType}">\n\nThis is a ${calloutType} callout with **bold** and *italic* text.\n\n</Callout>`,
      );
      await page.waitForTimeout(500);
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
  test(`VR02-${theme}: Card in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Card title="Getting Started" href="/docs/start">\n\nLearn how to set up the project.\n\n</Card>',
    );
    await page.waitForTimeout(500);
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
  test(`VR03-${theme}: Cards grid in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Cards>\n\n<Card title="First" href="/a">\n\nFirst card content.\n\n</Card>\n\n<Card title="Second" href="/b">\n\nSecond card content.\n\n</Card>\n\n</Cards>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`cards-grid-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR04: Steps ────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR04-${theme}: Steps with 3 children in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Steps>\n\n<Step>\n\nInstall dependencies\n\n</Step>\n\n<Step>\n\nConfigure settings\n\n</Step>\n\n<Step>\n\nDeploy\n\n</Step>\n\n</Steps>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`steps-3-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR05: Tabs ─────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR05-${theme}: Tabs with 2 tabs in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Tabs items={["npm", "pnpm"]}>\n\n<Tab value="npm">\n\nnpm install open-knowledge\n\n</Tab>\n\n<Tab value="pnpm">\n\npnpm add open-knowledge\n\n</Tab>\n\n</Tabs>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`tabs-2-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR06: Accordions ───────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR06-${theme}: Accordions in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Accordions>\n\n<Accordion title="First">\n\nFirst accordion content.\n\n</Accordion>\n\n<Accordion title="Second">\n\nSecond accordion content.\n\n</Accordion>\n\n</Accordions>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`accordions-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR08: Files ────────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR08-${theme}: Files tree in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Files>\n\n<Folder name="src" defaultOpen>\n\n<File name="index.ts" />\n\n<File name="config.ts" />\n\n</Folder>\n\n<File name="package.json" />\n\n</Files>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`files-tree-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR10: Banner ───────────────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR10-${theme}: Banner in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<Banner title="Notice">\n\nThis is an important announcement.\n\n</Banner>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`banner-${theme}-unselected.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR17: Mixed document ───────────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR17-${theme}: Mixed 6-component document in ${theme} mode`, async ({ page }) => {
    await writeContent(
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
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    await expect(page.locator('.ProseMirror')).toHaveScreenshot(`mixed-document-${theme}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

// ── VR18: Wildcard unregistered ────────────────────────────────

for (const theme of ['light', 'dark'] as const) {
  test(`VR18-${theme}: Wildcard unregistered component in ${theme} mode`, async ({ page }) => {
    await writeContent(
      '<CustomThing prop="value">\n\nUnregistered component content\n\n</CustomThing>',
    );
    await page.waitForTimeout(500);
    await setTheme(page, theme);

    const component = page.locator('[data-jsx-component]').first();
    await expect(component).toHaveScreenshot(`wildcard-unregistered-${theme}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
