import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

type GraphHarness = {
  clickDoc: (docName: string) => boolean;
  clickBackground: () => boolean;
  clickExternal: (url: string) => boolean;
  getNodeVisualState: (docName: string) => string | null;
  getNodeClickPoint: (nodeKey: string) => {
    x: number;
    y: number;
  } | null;
  getLayoutMetrics: () => {
    graphHeight: number;
    containerHeight: number;
    availableHeight: number;
  };
  getLinkClickPoint: (
    sourceDocName: string,
    targetDocName: string,
  ) => { x: number; y: number } | null;
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

  await replaceDoc(
    'alpha',
    '# Alpha\n\n[[beta#deep-link]]\n\n[Example Docs](https://example.com/docs)',
  );
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

function getGraphSurface(page: Page) {
  return page.getByRole('img', { name: 'Graph visualization of document links' });
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

async function clickGraphExternal(page: Page, url: string) {
  return page.evaluate(
    (targetUrl) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.clickExternal(targetUrl) ?? false,
    url,
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

async function getGraphNodeClickPoint(page: Page, nodeKey: string) {
  return page.evaluate(
    (targetNode) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.getNodeClickPoint(targetNode) ?? null,
    nodeKey,
  );
}

async function waitForGraphNodeClickPoint(page: Page, nodeKey: string) {
  await expect
    .poll(async () => Boolean(await getGraphNodeClickPoint(page, nodeKey)), {
      timeout: 10_000,
      intervals: [100, 250, 500],
    })
    .toBe(true);
}

async function getGraphLayoutMetrics(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.getLayoutMetrics() ?? {
        graphHeight: 0,
        containerHeight: 0,
        availableHeight: 0,
      },
  );
}

async function getGraphLinkClickPoint(page: Page, sourceDocName: string, targetDocName: string) {
  return page.evaluate(
    ({ source, target }) =>
      (
        window as Window &
          typeof globalThis & {
            __graphHarness?: GraphHarness;
          }
      ).__graphHarness?.getLinkClickPoint(source, target) ?? null,
    { source: sourceDocName, target: targetDocName },
  );
}

async function waitForGraphLinkClickPoint(
  page: Page,
  sourceDocName: string,
  targetDocName: string,
) {
  await expect
    .poll(async () => Boolean(await getGraphLinkClickPoint(page, sourceDocName, targetDocName)), {
      timeout: 10_000,
      intervals: [100, 250, 500],
    })
    .toBe(true);
}

async function expectGraphToFillAvailableHeight(page: Page) {
  const metrics = await getGraphLayoutMetrics(page);
  expect(metrics.graphHeight).toBeGreaterThan(0);
  expect(Math.abs(metrics.availableHeight - metrics.graphHeight)).toBeLessThanOrEqual(4);
  expect(Math.abs(metrics.containerHeight - metrics.graphHeight)).toBeLessThanOrEqual(4);
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

  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
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

  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
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
  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
  await expect(selectedDoc).toBeVisible();

  expect(await clickGraphBackground(page)).toBe(true);
  await expect(selectedDoc).toHaveCount(0);
});

test('graph canvas fills the available height in docked and fullscreen modes', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha' });
  await waitForGraphNode(page, 'alpha');
  await expectGraphToFillAvailableHeight(page);

  await page.getByLabel('Full screen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), {
    timeout: 5_000,
  });
  await waitForGraphNode(page, 'alpha');
  await expectGraphToFillAvailableHeight(page);
});

test('fullscreen graph edge clicks clear selection on the first try', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');
  await waitForGraphNodeClickPoint(page, 'beta');
  await waitForGraphLinkClickPoint(page, 'alpha', 'beta');

  const betaPoint = await getGraphNodeClickPoint(page, 'beta');
  expect(betaPoint).not.toBeNull();
  if (!betaPoint) {
    throw new Error('Expected beta click point to be available');
  }

  const linkPoint = await getGraphLinkClickPoint(page, 'alpha', 'beta');
  expect(linkPoint).not.toBeNull();
  if (!linkPoint) {
    throw new Error('Expected an edge click point to be available');
  }

  await getGraphSurface(page).click({
    position: { x: betaPoint.x, y: betaPoint.y },
    force: true,
  });

  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
  await expect(selectedDoc).toBeVisible();
  await expect(selectedDoc).toContainText('Beta');

  await getGraphSurface(page).click({
    position: { x: linkPoint.x, y: linkPoint.y },
    force: true,
  });
  await expect(selectedDoc).toHaveCount(0);
});

test('fullscreen graph clicking the selected node toggles selection off', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');
  await waitForGraphNodeClickPoint(page, 'beta');

  const betaPoint = await getGraphNodeClickPoint(page, 'beta');
  expect(betaPoint).not.toBeNull();
  if (!betaPoint) {
    throw new Error('Expected beta click point to be available');
  }

  await getGraphSurface(page).click({
    position: { x: betaPoint.x, y: betaPoint.y },
    force: true,
  });

  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
  await expect(selectedDoc).toBeVisible();

  await getGraphSurface(page).click({
    position: { x: betaPoint.x, y: betaPoint.y },
    force: true,
  });
  await expect(selectedDoc).toHaveCount(0);
});

test('fullscreen graph external nodes use the same selection affordance', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  expect(await clickGraphExternal(page, 'https://example.com/docs')).toBe(true);

  const selectedNode = page.getByRole('status', { name: 'Selected graph item' });
  await expect(selectedNode).toBeVisible();
  await expect(selectedNode).toContainText('Example Docs');
  await expect(selectedNode).toContainText('https://example.com/docs');
  await expect(selectedNode.getByRole('button', { name: 'Open link' })).toBeVisible();
});

test('fullscreen graph selection clears when switching modes', async ({ page }) => {
  await seedGraphFixtures();
  await openGraph(page, { docName: 'alpha', fullscreen: true });
  await waitForGraphNode(page, 'beta');

  expect(await clickGraphDoc(page, 'beta')).toBe(true);
  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
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
  const selectedDoc = page.getByRole('status', { name: 'Selected graph item' });
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
