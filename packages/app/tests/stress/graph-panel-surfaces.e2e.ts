import { expect, type Page, test } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

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

  await replaceDoc('alpha', '# Alpha\n\n[[beta]]');
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

async function openFullscreenGraph(page: Page) {
  await page.goto(BASE);
  await page.getByText('test-doc.md').click({ timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), {
    timeout: 15_000,
  });
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.getByLabel('Full screen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), {
    timeout: 5_000,
  });
}

test('fullscreen graph exposes Explore, Orphans, Hubs, and a visible orphan toggle', async ({
  page,
}) => {
  await seedGraphFixtures();
  await openFullscreenGraph(page);

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
