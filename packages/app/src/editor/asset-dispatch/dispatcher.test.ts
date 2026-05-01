import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { dispatchAssetClick } from './dispatcher.ts';
import { AssetViewerRegistry, assetViewerRegistry } from './registry.ts';
import type { AssetClickContext } from './types.ts';

function ctx(overrides: Partial<AssetClickContext> = {}): AssetClickContext {
  return {
    url: './meeting.pdf',
    projectRelPath: 'notes/meeting.pdf',
    ext: 'pdf',
    title: 'meeting.pdf',
    forceOsDelegation: false,
    ...overrides,
  };
}

describe('dispatchAssetClick', () => {
  beforeEach(() => {
    assetViewerRegistry.clearForTests();
  });

  test('empty registry + no desktop bridge → web fallback fires with url', async () => {
    const openUrl = mock((_: string) => {});
    await dispatchAssetClick(ctx({ url: './meeting.pdf' }), {
      desktopBridge: undefined,
      openUrl,
    });
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith('./meeting.pdf');
  });

  test('registered viewer for ext fires with the context', async () => {
    const openUrl = mock((_: string) => {});
    const viewer = { exts: ['pdf'] as const, render: mock(() => {}) };
    const r = new AssetViewerRegistry();
    r.register(viewer);

    const context = ctx();
    await dispatchAssetClick(context, { registry: r, desktopBridge: undefined, openUrl });

    expect(viewer.render).toHaveBeenCalledTimes(1);
    expect(viewer.render).toHaveBeenCalledWith(context);
    expect(openUrl).not.toHaveBeenCalled();
  });

  test('Cmd/Ctrl+click bypasses a registered viewer (D-A6)', async () => {
    const openUrl = mock((_: string) => {});
    const viewer = { exts: ['pdf'] as const, render: mock(() => {}) };
    const r = new AssetViewerRegistry();
    r.register(viewer);

    await dispatchAssetClick(ctx({ forceOsDelegation: true }), {
      registry: r,
      desktopBridge: undefined,
      openUrl,
    });

    expect(viewer.render).not.toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  test('desktop bridge present → openAsset fires with projectRelPath', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);
    const openUrl = mock((_: string) => {});
    const desktopBridge = {
      shell: { openAsset },
    } as unknown as NonNullable<typeof window.okDesktop>;

    await dispatchAssetClick(ctx({ projectRelPath: 'notes/meeting.pdf' }), {
      desktopBridge,
      openUrl,
    });

    expect(openAsset).toHaveBeenCalledTimes(1);
    expect(openAsset).toHaveBeenCalledWith('notes/meeting.pdf');
    expect(openUrl).not.toHaveBeenCalled();
  });

  test('Cmd+click with desktop bridge present → openAsset still fires (Cmd only skips registry)', async () => {
    const openAsset = mock(async (_: string) => ({ ok: true }) as const);
    const viewer = { exts: ['pdf'] as const, render: mock(() => {}) };
    const r = new AssetViewerRegistry();
    r.register(viewer);
    const desktopBridge = {
      shell: { openAsset },
    } as unknown as NonNullable<typeof window.okDesktop>;

    await dispatchAssetClick(ctx({ forceOsDelegation: true }), {
      registry: r,
      desktopBridge,
    });

    expect(viewer.render).not.toHaveBeenCalled();
    expect(openAsset).toHaveBeenCalledTimes(1);
  });

  test('openAsset refusal is logged but does not throw or fall through to web', async () => {
    const openAsset = mock(
      async (_: string) =>
        ({
          ok: false,
          reason: 'extension-blocked',
        }) as const,
    );
    const openUrl = mock((_: string) => {});
    const desktopBridge = {
      shell: { openAsset },
    } as unknown as NonNullable<typeof window.okDesktop>;

    const consoleWarn = mock((..._args: unknown[]) => {});
    const origWarn = console.warn;
    console.warn = consoleWarn as unknown as typeof console.warn;
    try {
      await dispatchAssetClick(ctx({ ext: 'sh', projectRelPath: 'notes/setup.sh' }), {
        desktopBridge,
        openUrl,
      });
    } finally {
      console.warn = origWarn;
    }

    expect(openAsset).toHaveBeenCalledTimes(1);
    expect(openUrl).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalled();
  });

  test('dispatcher uses the module-level singleton registry when no deps passed', async () => {
    const viewer = { exts: ['pdf'] as const, render: mock(() => {}) };
    assetViewerRegistry.register(viewer);

    const openUrl = mock((_: string) => {});
    await dispatchAssetClick(ctx(), { desktopBridge: undefined, openUrl });

    expect(viewer.render).toHaveBeenCalledTimes(1);
    expect(openUrl).not.toHaveBeenCalled();
  });
});
