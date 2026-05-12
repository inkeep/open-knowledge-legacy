import { describe, expect, test } from 'bun:test';
import SRC from './sidebar?raw';

describe('getInitialSidebarWidth source-level guards', () => {
  test('decodeURIComponent is wrapped in a try/catch that returns defaultWidth', () => {
    const start = SRC.indexOf('function getInitialSidebarWidth');
    expect(start).toBeGreaterThan(-1);
    const after = SRC.slice(start);
    const end = after.indexOf('\nfunction ', 1);
    const body = end === -1 ? after : after.slice(0, end);

    expect(body).toContain('decodeURIComponent(savedWidth)');
    expect(body).toMatch(/try\s*{[\s\S]*decodeURIComponent[\s\S]*}\s*catch/);
    expect(body).toMatch(/catch\s*(?:\([^)]*\))?\s*{[\s\S]*return defaultWidth/);
  });

  test('decoded value is range-checked against SIDEBAR_WIDTH_VALUE_PATTERN', () => {
    expect(SRC).toContain('const SIDEBAR_WIDTH_VALUE_PATTERN = /^\\d+(?:\\.\\d+)?(?:rem|px)$/');
    expect(SRC).toMatch(/SIDEBAR_WIDTH_VALUE_PATTERN\.test\(decodedWidth\)/);
  });
});
