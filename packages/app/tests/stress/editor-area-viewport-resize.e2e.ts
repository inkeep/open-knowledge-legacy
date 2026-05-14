import type { Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced } from './_helpers';

const PANEL_VIEWPORT = { width: 1200, height: 800 } as const;
const SHEET_VIEWPORT = { width: 800, height: 800 } as const;

const PANEL_WIDE_VIEWPORT = { width: 1300, height: 800 } as const;
const PANEL_NARROW_VIEWPORT = { width: 1000, height: 800 } as const;

const DOC_BODY = `# Aang Test Heading

This is the test body for the editor-area-viewport-resize regression test. It must
contain enough text to verify TipTap's ProseMirror DOM is fully rendered after each
viewport cycle. The bug under test loses this body content while preserving the
Properties panel.

Paragraph two with [[a wikilink]] and **bold** text and an _emphasized_ phrase.

## Second heading

Final paragraph.`;

const DOC_BODY_TEXT_MARKERS = [
  'Aang Test Heading',
  'Second heading',
  'editor-area-viewport-resize regression test',
] as const;

function frontmatterDoc(name: string): string {
  return `---
title: "${name} title"
description: "Test description"
born: 12 BG
tags:
  - characters
  - air-nomads
  - famous
---

${DOC_BODY}`;
}

async function waitForEditorReady(page: Page) {
  await page.waitForSelector('.ProseMirror', { state: 'attached', timeout: 15_000 });
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 10_000 });
}

async function assertBodyEditorRendersContent(page: Page) {
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible({ timeout: 10_000 });

  const editorText = (await editor.textContent()) ?? '';
  for (const marker of DOC_BODY_TEXT_MARKERS) {
    expect(editorText, `expected body editor to contain "${marker}"`).toContain(marker);
  }
}

async function assertPropertyPanelRenders(page: Page, expectedTitle: string) {
  await expect(page.getByText('Properties').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(expectedTitle).first()).toBeVisible({ timeout: 10_000 });
}

async function waitForLayoutMode(page: Page, expected: 'panel' | 'sheet') {
  const expectedHandleCount = expected === 'panel' ? 1 : 0;
  await expect
    .poll(() => page.locator('[data-slot="resizable-handle"]').count(), { timeout: 5_000 })
    .toBe(expectedHandleCount);
}

async function portalTargetGeneration(page: Page, docName: string): Promise<string> {
  return page.evaluate((dn) => {
    const el = document.querySelector(`[data-ok-editor-portal="${dn}"]`);
    if (!el) return 'absent';
    const probeKey = '__okEditorPortalGenProbe';
    const w = window as unknown as Record<string, unknown>;
    let wm = w[probeKey] as WeakMap<Element, string> | undefined;
    if (!wm) {
      wm = new WeakMap<Element, string>();
      w[probeKey] = wm;
    }
    let tag = wm.get(el);
    if (!tag) {
      tag = `gen-${Math.random().toString(36).slice(2, 10)}`;
      wm.set(el, tag);
    }
    return tag;
  }, docName);
}

test.describe('editor-area viewport resize — editor mount stability', () => {
  test('single shrink+expand cycle across 960px breakpoint preserves body editor', async ({
    page,
    api,
  }) => {
    const docName = `viewport-resize-single-${test.info().workerIndex}`;
    await api.seedDocs([{ name: docName, markdown: frontmatterDoc(docName) }]);
    await page.setViewportSize(PANEL_VIEWPORT);
    await page.goto(`/#/${docName}`);
    await waitForActiveProviderSynced(page);
    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);
    await assertPropertyPanelRenders(page, `${docName} title`);

    await page.setViewportSize(SHEET_VIEWPORT);
    await waitForLayoutMode(page, 'sheet');
    await page.setViewportSize(PANEL_VIEWPORT);
    await waitForLayoutMode(page, 'panel');

    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);
    await assertPropertyPanelRenders(page, `${docName} title`);
  });

  test('viewport flip across 960px does not unmount the editor subtree (structural)', async ({
    page,
    api,
  }) => {
    const docName = `viewport-resize-structural-${test.info().workerIndex}`;
    await api.seedDocs([{ name: docName, markdown: frontmatterDoc(docName) }]);
    await page.setViewportSize(PANEL_VIEWPORT);
    await page.goto(`/#/${docName}`);
    await waitForActiveProviderSynced(page);
    await waitForEditorReady(page);

    const genBefore = await portalTargetGeneration(page, docName);
    expect(genBefore).not.toBe('absent');

    expect(await portalTargetGeneration(page, docName)).toBe(genBefore);

    await page.setViewportSize(SHEET_VIEWPORT);
    await waitForLayoutMode(page, 'sheet');
    await page.setViewportSize(PANEL_VIEWPORT);
    await waitForLayoutMode(page, 'panel');
    await waitForEditorReady(page);

    const genAfterCycle1 = await portalTargetGeneration(page, docName);
    expect(
      genAfterCycle1,
      'portal target DOM identity must be stable across viewport flip — a new generation means EditorArea remounted the editor subtree, violating the mount-stability invariant',
    ).toBe(genBefore);

    await page.setViewportSize(SHEET_VIEWPORT);
    await waitForLayoutMode(page, 'sheet');
    await page.setViewportSize(PANEL_VIEWPORT);
    await waitForLayoutMode(page, 'panel');
    await waitForEditorReady(page);

    const genAfterCycle2 = await portalTargetGeneration(page, docName);
    expect(
      genAfterCycle2,
      'portal target DOM identity must remain stable across two viewport flips — any change means the editor subtree was unmounted at least once during cycles',
    ).toBe(genBefore);
  });

  test('two shrink+expand cycles across 960px preserve body editor (user-reported gold-standard)', async ({
    page,
    api,
  }) => {
    const docName = `viewport-resize-double-${test.info().workerIndex}`;
    await api.seedDocs([{ name: docName, markdown: frontmatterDoc(docName) }]);
    await page.setViewportSize(PANEL_VIEWPORT);
    await page.goto(`/#/${docName}`);
    await waitForActiveProviderSynced(page);
    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);
    await assertPropertyPanelRenders(page, `${docName} title`);

    await page.setViewportSize(SHEET_VIEWPORT);
    await waitForLayoutMode(page, 'sheet');
    await page.setViewportSize(PANEL_VIEWPORT);
    await waitForLayoutMode(page, 'panel');

    await page.setViewportSize(SHEET_VIEWPORT);
    await waitForLayoutMode(page, 'sheet');
    await page.setViewportSize(PANEL_VIEWPORT);
    await waitForLayoutMode(page, 'panel');

    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);
    await assertPropertyPanelRenders(page, `${docName} title`);
  });

  test('resize that crosses 1024px but NOT 960px does not remount editor', async ({
    page,
    api,
  }) => {
    const docName = `viewport-resize-1024-only-${test.info().workerIndex}`;
    await api.seedDocs([{ name: docName, markdown: frontmatterDoc(docName) }]);
    await page.setViewportSize(PANEL_WIDE_VIEWPORT);
    await page.goto(`/#/${docName}`);
    await waitForActiveProviderSynced(page);
    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);

    const genBefore = await portalTargetGeneration(page, docName);
    expect(genBefore).not.toBe('absent');

    for (let i = 0; i < 5; i++) {
      await page.setViewportSize(PANEL_NARROW_VIEWPORT);
      await waitForLayoutMode(page, 'panel');
      await page.setViewportSize(PANEL_WIDE_VIEWPORT);
      await waitForLayoutMode(page, 'panel');
    }

    await waitForEditorReady(page);
    await assertBodyEditorRendersContent(page);
    await assertPropertyPanelRenders(page, `${docName} title`);

    expect(
      await portalTargetGeneration(page, docName),
      'portal target DOM identity must be stable across 1024px-only cycles — the bug under fix is specific to the 960px breakpoint; any change here would indicate a remount at the wrong boundary',
    ).toBe(genBefore);
  });
});
