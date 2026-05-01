
import { describe, expect, mock, test } from 'bun:test';
import { openExternal } from './open-external.ts';

function makeElectron(openImpl: (url: string) => Promise<void>) {
  return {
    shell: { openExternal: mock(openImpl) },
  };
}

describe('openExternal — Electron host', () => {
  test('forwards URL to okDesktop.shell.openExternal and resolves ok:true', async () => {
    const okDesktop = makeElectron(async () => {});
    const result = await openExternal('claude://cowork/new?q=x', { okDesktop });
    expect(result).toEqual({ ok: true });
    expect(okDesktop.shell.openExternal).toHaveBeenCalledTimes(1);
    expect(okDesktop.shell.openExternal).toHaveBeenCalledWith('claude://cowork/new?q=x');
  });

  test('maps a rejected Electron promise to dispatch-error with error.message', async () => {
    const okDesktop = makeElectron(async () => {
      throw new Error('scheme-not-allowed');
    });
    const result = await openExternal('file:///etc/passwd', { okDesktop });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
    expect(result.detail).toContain('scheme-not-allowed');
  });

  test('serializes non-Error throws into detail', async () => {
    const okDesktop = makeElectron(async () => {
      throw 'plain-string-rejection';
    });
    const result = await openExternal('claude://cowork/new', { okDesktop });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toBe('plain-string-rejection');
  });
});

describe('openExternal — web host (anchor-click)', () => {
  function makeFakeDoc(): Document {
    const body: { appendChild: ReturnType<typeof mock> } = { appendChild: mock(() => {}) };
    const anchor = {
      href: '',
      rel: '',
      click: mock(() => {}),
      remove: mock(() => {}),
    };
    const doc = {
      createElement: mock((_tag: string) => anchor),
      body,
      __anchor: anchor,
    };
    return doc as unknown as Document;
  }

  test('creates an anchor with the URL and calls click()', async () => {
    const doc = makeFakeDoc();
    const result = await openExternal('cursor://anysphere.cursor-deeplink/prompt?text=x', { doc });
    expect(result).toEqual({ ok: true });
    const anchor = (doc as any).__anchor;
    expect(anchor.href).toBe('cursor://anysphere.cursor-deeplink/prompt?text=x');
    expect(anchor.rel).toBe('noopener noreferrer');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });

  test('maps a click() throw to dispatch-error', async () => {
    const anchor = {
      href: '',
      rel: '',
      click: mock(() => {
        throw new Error('browser-blocked');
      }),
      remove: mock(() => {}),
    };
    const doc = {
      createElement: () => anchor,
      body: { appendChild: () => {} },
    } as unknown as Document;
    const result = await openExternal('claude://cowork/new', { doc });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
    expect(result.detail).toContain('browser-blocked');
  });
});

describe('openExternal — host selection', () => {
  test('Electron path takes precedence when okDesktop is provided (doc is ignored)', async () => {
    const okDesktop = makeElectron(async () => {});
    const doc = {
      createElement: mock(() => {
        throw new Error('should-not-be-called');
      }),
      body: { appendChild: () => {} },
    } as unknown as Document;
    const result = await openExternal('claude://cowork/new', { okDesktop, doc });
    expect(result).toEqual({ ok: true });
    expect(okDesktop.shell.openExternal).toHaveBeenCalledTimes(1);
    expect((doc as any).createElement).not.toHaveBeenCalled();
  });
});
