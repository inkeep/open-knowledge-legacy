import { describe, expect, mock, test } from 'bun:test';

describe('DocPanel graph lazy boundary', () => {
  test('does not import GraphPanel until the lazy loader runs', async () => {
    let graphPanelModuleLoads = 0;

    mock.module('@/components/GraphPanel', () => {
      graphPanelModuleLoads += 1;
      return {
        GraphPanel: () => null,
      };
    });

    const mod = await import('./DocPanel');

    expect(typeof mod.DocPanel).toBe('function');
    expect(graphPanelModuleLoads).toBe(0);

    const graphPanelModule = await mod.loadGraphPanelModule();
    expect(typeof graphPanelModule.GraphPanel).toBe('function');
    expect(graphPanelModuleLoads).toBe(1);
  });
});
