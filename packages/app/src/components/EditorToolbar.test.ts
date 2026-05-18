import { describe, expect, test } from 'bun:test';
import SRC from './EditorToolbar?raw';

describe('EditorToolbar source-level guards', () => {
  test('toolbar wraps its 3-col grid in `.editor-content-aligned` so cells map to the editor content column', () => {
    const alignedIdx = SRC.indexOf('editor-content-aligned');
    expect(alignedIdx).toBeGreaterThan(-1);
    const gridColsIdx = SRC.indexOf('grid grid-cols-3');
    expect(gridColsIdx).toBeGreaterThan(-1);
    expect(alignedIdx).toBeLessThan(gridColsIdx);
  });

  test('breadcrumb cell keeps `pointer-events-auto` so the title tooltip surfaces', () => {
    const cellStart = SRC.indexOf('<EditorBreadcrumb');
    const outerCellStart = SRC.lastIndexOf('pointer-events-auto', cellStart);
    expect(outerCellStart).toBeGreaterThan(-1);
  });

  test('toolbar root is `pointer-events-none` overlay', () => {
    expect(SRC).toMatch(/data-testid="editor-toolbar"[^>]*pointer-events-none/);
  });

  test('mode toggle cell stays centered (justify-center) — alignment fix did not shift it', () => {
    expect(SRC).toMatch(/<div\s+className="pointer-events-auto flex justify-center">/);
  });
});
