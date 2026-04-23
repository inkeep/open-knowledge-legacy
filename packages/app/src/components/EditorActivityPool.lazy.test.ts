import { describe, expect, mock, test } from 'bun:test';

describe('EditorActivityPool source lazy boundary', () => {
  test('does not import SourceEditor until the lazy loader runs', async () => {
    let sourceEditorModuleLoads = 0;

    mock.module('@/editor/SourceEditor', () => {
      sourceEditorModuleLoads += 1;
      return {
        SourceEditor: () => null,
      };
    });

    const mod = await import('./EditorActivityPool');

    expect(typeof mod.EditorActivityPool).toBe('function');
    expect(sourceEditorModuleLoads).toBe(0);

    const sourceEditorModule = await mod.loadSourceEditorModule();
    expect(typeof sourceEditorModule.SourceEditor).toBe('function');
    expect(sourceEditorModuleLoads).toBe(1);
  });
});
