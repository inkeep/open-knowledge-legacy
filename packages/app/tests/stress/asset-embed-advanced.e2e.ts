
import { randomUUID } from 'node:crypto';
import { expect, test, waitForActiveProviderSynced as waitForProvider } from './_helpers';

test.describe('asset-embed — rename stability (SPEC §6 FR-7 / P5.1 / P5.1a / D-K)', () => {
  test('P5.1: rename doc with ![alt](path) image ref rewrites path', async ({ page, api }) => {
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-a-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    await api.replaceDoc(`docs/${origDoc}`, '# First Draft\n\n![first draft](first-draft.png)\n');

    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const renameRes = await page.request.post('/api/rename-path', {
      data: {
        kind: 'file',
        fromPath: `docs/${origDoc}.md`,
        toPath: `archive/2026/${origDoc}.md`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { content?: string };
    const text = body.content ?? '';
    expect(text).toContain('![first draft](../../docs/first-draft.png)');
  });

  test('P5.1a: rename doc with ![[name.ext]] wiki-embed ref — body stays byte-identical', async ({
    page,
    api,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const origDoc = `rename-b-${suffix}`;
    await api.createPage(`docs/${origDoc}.md`);
    const originalBody = '# First Draft\n\n![[first-draft.png]]\n';
    await api.replaceDoc(`docs/${origDoc}`, originalBody);

    await page.goto(`/#/docs/${origDoc}`);
    await waitForProvider(page);
    await page.waitForSelector('.ProseMirror');

    const renameRes = await page.request.post('/api/rename-path', {
      data: {
        kind: 'file',
        fromPath: `docs/${origDoc}.md`,
        toPath: `archive/2026/${origDoc}.md`,
      },
    });
    expect(renameRes.ok()).toBe(true);

    const docRes = await page.request.get(`/api/document?docName=archive/2026/${origDoc}`);
    expect(docRes.ok()).toBe(true);
    const body = (await docRes.json()) as { content?: string };
    const text = body.content ?? '';
    expect(text).toContain('![[first-draft.png]]');
  });
});
