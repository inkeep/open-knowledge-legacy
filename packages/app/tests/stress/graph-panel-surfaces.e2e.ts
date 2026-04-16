import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

type GraphHarness = {
  clickDoc: (docName: string) => boolean;
  clickBackground: () => boolean;
  getNodeVisualState: (docName: string) => string | null;
};

async function createPage(path: string) {
  const res = await fetch(`${BASE}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  if (res.status === 409) {
    return;
  }

  if (!res.ok) {
    throw new Error(`create-page failed for ${path}: ${res.status}`);
  }
}

async function replaceDoc(docName: string, markdown: string) {
  const res = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, markdown, position: 'replace' }),
  });

  if (!res.ok) {
    throw new Error(`agent-write-md failed for ${docName}: ${res.status}`);
  }
}

async function seedGraphFixtures() {
  await fetch(`${BASE}/api/test-reset`, { method: 'POST' });

  for (const docName of ['alpha', 'beta', 'gamma', 'zeta']) {
    await createPage(`${docName}.md`);
  }

  await replaceDoc('alpha', '# Alpha\n\n[[beta#deep-link]]');
  await replaceDoc('beta', '# Beta');
  await replaceDoc('gamma', '# Gamma');
  await replaceDoc('zeta', '# Zeta\n\n[[beta]]');

  await expect
    .poll(
      async () => {
        const response = await fetch(`${BASE}/api/orphans?mode=both`);
        const data = (await response.json()) as {
          ok: boolean;
          orphans?: Array<{ docName: string }>;
        };
        const orphans = data.orphans?.map((entry) => entry.docName) ?? [];
        return (
          orphans.includes('gamma') &&
          !orphans.includes('alpha') &&
          !orphans.includes('beta') &&
          !orphans.includes('zeta')
        );
      },
      { timeout: 10_000, intervals: [200, 500, 1000] },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const response = await fetch(`${BASE}/api/hubs?limit=50`);
        const data = (await response.json()) as {
          ok: boolean;
          hubs?: Array<{ docName: string; count: number }>;
        };
        const topHub = data.hubs?.[0];
        return topHub ? `${topHub.docName}:${topHub.count}` : '';
      },
      { timeout: 10_000, intervals: [200, 500, 1000] },
    )
    .toBe('beta:2');
}

async function openGraph(
  page: Page,
  {
    docName = 'test-doc',
    fullscreen = false,
  }: {
    docName?: string;
    fullscreen?: boolean;
  } = {},
) {
  await page.goto(`${BASE}/#/${docName}`);
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as Window &
            typeof globalThis & {
              __graphHarness?: GraphHarness;
            }
        ).__graphHarness,
      ),
    { timeout: 10_000 },
  );

  if (fullscreen) {
    await page.getByLabel('Full screen').click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement), {
      timeout: 5_000,
    });
  }
}

async function waitForGraphNode(page: Page, docName: string) {
  await page.waitForFunction(
    (targetDoc) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.getNodeVisualState(targetDoc) !== null,
    docName,
    { timeout: 10_000 },
  );
}

async function clickGraphDoc(page: Page, docName: string) {
  return page.evaluate(
    (targetDoc) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.clickDoc(targetDoc) ?? false,
    docName,
  );
}

async function clickGraphBackground(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.clickBackground() ?? false,
  );
}

async function getGraphNodeVisualState(page: Page, docName: string) {
  return page.evaluate(
    (targetDoc) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.getNodeVisualState(targetDoc) ?? null,
    docName,
  );
}

test('fullscreen graph exposes Explore, Orphans, Hubs, and a visible orphan toggle', async ({
  page,
}) => {
  await seedGraphFixtures();
  await openGraph(page, { fullscreen: true });

  await expect(page.getByRole('radio', { name: 'Explore' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Orphans' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Hubs' })).toBeVisible();

  await page.getByRole('radio', { name: 'Orphans' }).click();

  const orphanPanel = page
    .locator('section')
    .filter({ has: page.getByText('Project-level disconnected pages') });

  await expect(page.getByRole('radio', { name: 'Both' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'No Incoming' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'No Outgoing' })).toBeVisible();

  await expect(orphanPanel.getByRole('button', { name: /gamma/i })).toBeVisible();
  await expect(orphanPanel.getByRole('button', { name: /alpha/i })).toHaveCount(0);
  await expect(orphanPanel.getByRole('button', { name: /beta/i })).toHaveCount(0);
  await expect(orphanPanel.getByRole('button', { name: /zeta/i })).toHaveCount(0);

  await page.getByRole('radio', { name: 'No Incoming' }).click();
  await expect(orphanPanel.getByRole('button', { name: /alpha/i })).toBeVisible();
  await expect(orphanPanel.getByRole('button', { name: /zeta/i })).toBeVisible();

  await page.getByRole('radio', { name: 'No Outgoing' }).click();
  await expect(orphanPanel.getByRole('button', { name: /beta/i })).toBeVisible();

  await orphanPanel.getByRole('button', { name: /gamma/i }).click();
  await expect(page).toHaveURL(/#\/gamma$/);

  const hubsResponse = page.waitForResponse(
    (response) => response.ok() && response.url().includes('/api/hubs?limit=50'),
  );
  await page.getByRole('radio', { name: 'Hubs' }).click();
  await hubsResponse;

  const hubsPanel = page.locator('section').filter({ has: page.getByText('Top linked pages') });
  await expect(hubsPanel.getByRole('button', { name: /beta/i })).toBeVisible();
  await hubsPanel.getByRole('button', { name: /beta/i }).click();
  await expect(page).toHaveURL(/#\/beta$/);
});

test('fullscreen graph selects a document before explicitly opening it', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'alpha');
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  await expect(page).toHaveURL(/#\/alpha$/);

  const selectedDoc = page.getByRole('status', { name: 'Selected graph document' });
  await expect(selectedDoc).toBeVisible();
  await expect(selectedDoc).toContainText('Beta');
  await expect(selectedDoc).toContainText('beta');
  expect(await getGraphNodeVisualState(page, 'alpha')).toBe('active');
  expect(await getGraphNodeVisualState(page, 'beta')).toBe('selected');

  await selectedDoc.getByRole('button', { name: 'Open' }).click();
  await page.waitForFunction(() => !document.fullscreenElement, {
    timeout: 5_000,
  });
  await expect(page).toHaveURL(/#\/beta\?anchor=deep-link$/);
});

test('fullscreen graph selecting the active document shows the already-open state', async ({
  page,
}) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'alpha');

  expect(await clickGraphDoc(page, 'alpha')).toBe(true);

  const selectedDoc = page.getByRole('status', { name: 'Selected graph document' });
  await expect(selectedDoc).toBeVisible();
  await expect(selectedDoc).toContainText('Already open');
  await expect(selectedDoc).toContainText('Alpha');
  expect(await getGraphNodeVisualState(page, 'alpha')).toBe('active-selected');

  await selectedDoc.getByRole('button', { name: 'Open' }).click();
  await page.waitForFunction(() => !document.fullscreenElement, {
    timeout: 5_000,
  });
  await expect(page).toHaveURL(/#\/alpha$/);
});

test('fullscreen graph background click clears selection', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  const selectedDoc = page.getByRole('status', { name: 'Selected graph document' });
  await expect(selectedDoc).toBeVisible();

  expect(await clickGraphBackground(page)).toBe(true);
  await expect(selectedDoc).toHaveCount(0);
});

test('fullscreen graph selection clears when switching modes', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  const selectedDoc = page.getByRole('status', { name: 'Selected graph document' });
  await expect(selectedDoc).toBeVisible();

  await page.getByRole('radio', { name: 'Orphans' }).click();
  await expect(selectedDoc).toHaveCount(0);

  await page.getByRole('radio', { name: 'Explore' }).click();
  await waitForGraphNode(page, 'beta');
  await expect(selectedDoc).toHaveCount(0);
});

test('fullscreen graph selection clears after exiting fullscreen', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  const selectedDoc = page.getByRole('status', { name: 'Selected graph document' });
  await expect(selectedDoc).toBeVisible();

  await page.getByLabel('Exit fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement, {
    timeout: 5_000,
  });

  await page.getByLabel('Full screen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), {
    timeout: 5_000,
  });
  await expect(selectedDoc).toHaveCount(0);
});

test('docked graph clicks still navigate immediately with anchor-preserving hashes', async ({
  page,
}) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha' });
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  await expect(page).toHaveURL(/#\/beta\?anchor=deep-link$/);
});
