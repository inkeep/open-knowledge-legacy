/**
 * Unit tests for the main-process asset safety net (SPEC 2026-04-23
 * amendment FR-A7 / D-A10). Covers the two-handler intercept pattern
 * (`setWindowOpenHandler` + `will-navigate`) and the URL-matching logic
 * that distinguishes asset URLs from app / Vite-HMR / external URLs.
 */

import { describe, expect, mock, test } from 'bun:test';
import { attachAssetSafetyNet, matchAssetUrl } from '../../src/main/asset-safety-net.ts';

const ORIGIN = 'http://localhost:5173';

describe('matchAssetUrl', () => {
  test('same-origin asset URL → project-relative path', () => {
    expect(matchAssetUrl('http://localhost:5173/notes/meeting.pdf', ORIGIN)).toBe(
      'notes/meeting.pdf',
    );
  });

  test('nested subdir asset → full relative path', () => {
    expect(matchAssetUrl('http://localhost:5173/docs/assets/photo.png', ORIGIN)).toBe(
      'docs/assets/photo.png',
    );
  });

  test('different origin (https external) → null', () => {
    expect(matchAssetUrl('https://example.com/notes/meeting.pdf', ORIGIN)).toBeNull();
  });

  test('app bundle (index.html) → null', () => {
    expect(matchAssetUrl('http://localhost:5173/index.html', ORIGIN)).toBeNull();
  });

  test('app bundle without explicit path → null', () => {
    expect(matchAssetUrl('http://localhost:5173/', ORIGIN)).toBeNull();
  });

  test('Vite HMR client (/@vite/client) → null', () => {
    expect(matchAssetUrl('http://localhost:5173/@vite/client', ORIGIN)).toBeNull();
  });

  test('extensionless path → null', () => {
    expect(matchAssetUrl('http://localhost:5173/api/document', ORIGIN)).toBeNull();
  });

  test('non-asset extension (.ts, .js, .css) → null', () => {
    // .js is in EXECUTABLE_BLOCKLIST_EXTENSIONS but NOT in ASSET_EXTENSIONS.
    // The safety net delegates to the main-process handler for ASSET_EXTENSIONS
    // only; anything else stays on the default nav path where additional
    // handlers (Vite HMR, app-bundle fetch) claim it.
    expect(matchAssetUrl('http://localhost:5173/src/main.ts', ORIGIN)).toBeNull();
    expect(matchAssetUrl('http://localhost:5173/styles.css', ORIGIN)).toBeNull();
  });

  test('bogus URL → null (no throw)', () => {
    expect(matchAssetUrl('not a url', ORIGIN)).toBeNull();
  });

  test('PDF via alternate localhost port still matches if origin matches', () => {
    expect(matchAssetUrl('http://localhost:9999/notes/meeting.pdf', 'http://localhost:9999')).toBe(
      'notes/meeting.pdf',
    );
  });
});

describe('attachAssetSafetyNet — setWindowOpenHandler', () => {
  test('asset URL new-window request → denied + openAsset fires', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);
    const log = mock((_: unknown) => {});

    let installedHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null =
      null;
    const webContents = {
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }) {
        installedHandler = handler;
      },
      on: () => {},
    };

    attachAssetSafetyNet(webContents, { openAsset, editorOrigin: ORIGIN, log });

    const result = installedHandler?.({
      url: 'http://localhost:5173/notes/meeting.pdf',
    });
    expect(result).toEqual({ action: 'deny' });

    // Allow the async openAsset to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(openAsset).toHaveBeenCalledWith('notes/meeting.pdf');
    expect(log).not.toHaveBeenCalled();
  });

  test('non-asset new-window request → denied with no openAsset call', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);

    let installedHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null =
      null;
    const webContents = {
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }) {
        installedHandler = handler;
      },
      on: () => {},
    };

    attachAssetSafetyNet(webContents, { openAsset, editorOrigin: ORIGIN });

    // External-origin URL from a pasted link's target="_blank"
    const result = installedHandler?.({ url: 'https://example.com/' });
    expect(result).toEqual({ action: 'deny' });
    await Promise.resolve();
    expect(openAsset).not.toHaveBeenCalled();
  });

  test('openAsset refusal (path-escape on pdf) is logged', async () => {
    const openAsset = mock(async (_: string) => ({ ok: false, reason: 'path-escape' }) as const);
    const logEvents: unknown[] = [];
    const log = (evt: unknown) => {
      logEvents.push(evt);
    };

    let installedHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null =
      null;
    const webContents = {
      setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }) {
        installedHandler = handler;
      },
      on: () => {},
    };

    attachAssetSafetyNet(webContents, { openAsset, editorOrigin: ORIGIN, log });

    installedHandler?.({ url: 'http://localhost:5173/notes/meeting.pdf' });
    await Promise.resolve();
    await Promise.resolve();
    expect(logEvents).toHaveLength(1);
    expect(logEvents[0]).toMatchObject({
      level: 'warn',
      data: { reason: 'path-escape' },
    });
  });
});

describe('attachAssetSafetyNet — will-navigate', () => {
  test('asset URL navigation → preventDefault + openAsset fires', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);

    let installedHandler: ((event: { preventDefault: () => void }, url: string) => void) | null =
      null;
    const webContents = {
      setWindowOpenHandler: () => {},
      on(
        event: 'will-navigate',
        handler: (event: { preventDefault: () => void }, url: string) => void,
      ) {
        if (event === 'will-navigate') installedHandler = handler;
      },
    };

    attachAssetSafetyNet(webContents, { openAsset, editorOrigin: ORIGIN });

    const preventDefault = mock(() => {});
    installedHandler?.({ preventDefault }, 'http://localhost:5173/notes/meeting.pdf');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(openAsset).toHaveBeenCalledWith('notes/meeting.pdf');
  });

  test('non-asset navigation → no preventDefault, no openAsset', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);

    let installedHandler: ((event: { preventDefault: () => void }, url: string) => void) | null =
      null;
    const webContents = {
      setWindowOpenHandler: () => {},
      on(
        event: 'will-navigate',
        handler: (event: { preventDefault: () => void }, url: string) => void,
      ) {
        if (event === 'will-navigate') installedHandler = handler;
      },
    };

    attachAssetSafetyNet(webContents, { openAsset, editorOrigin: ORIGIN });

    const preventDefault = mock(() => {});
    installedHandler?.({ preventDefault }, 'http://localhost:5173/');
    expect(preventDefault).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(openAsset).not.toHaveBeenCalled();
  });
});
