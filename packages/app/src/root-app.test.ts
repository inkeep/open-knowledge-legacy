import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

describe('RootApp navigator lazy boundary', () => {
  test('does not import NavigatorApp until the lazy loader runs', async () => {
    let navigatorModuleLoads = 0;

    mock.module('./App', () => ({
      App: () => null,
    }));

    mock.module('@/components/NavigatorApp', () => {
      navigatorModuleLoads += 1;
      return {
        NavigatorApp: () => null,
      };
    });

    const mod = await import('./root-app');

    expect(typeof mod.RootApp).toBe('function');
    expect(navigatorModuleLoads).toBe(0);

    const bridge = {
      config: {
        collabUrl: '',
        apiOrigin: '',
        projectPath: '',
        projectName: 'Navigator',
        mode: 'navigator',
      },
      onProjectSwitched: () => () => {},
      onMenuAction: () => () => {},
      dialog: {
        openFolder: async () => null,
        createFolder: async () => null,
      },
      shell: {
        openExternal: async () => {},
      },
      clipboard: {
        writeText: async () => {},
      },
      project: {
        listRecent: async () => [],
        open: async () => {},
        close: async () => {},
      },
      platform: 'darwin',
      appVersion: '0.0.0',
    } satisfies OkDesktopBridge;

    expect(mod.isNavigatorDesktopBridge(bridge)).toBe(true);
    expect(mod.isNavigatorDesktopBridge(null)).toBe(false);

    const navigatorModule = await mod.loadNavigatorAppModule();
    expect(typeof navigatorModule.NavigatorApp).toBe('function');
    expect(navigatorModuleLoads).toBe(1);
  });
});
