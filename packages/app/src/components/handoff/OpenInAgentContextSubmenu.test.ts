import { describe, expect, test } from 'bun:test';
import { contextRowHint } from './OpenInAgentContextSubmenu';

describe('contextRowHint (v1: inputMissing only)', () => {
  test('inputMissing=false (workspace known): returns null (no hint)', () => {
    expect(contextRowHint(false)).toBeNull();
  });

  test('inputMissing=true (no workspace): returns "No workspace"', () => {
    expect(contextRowHint(true)).toBe('No workspace');
  });
});

describe('module surface', () => {
  test('exports OpenInAgentContextSubmenu + contextRowHint', async () => {
    const mod = await import('./OpenInAgentContextSubmenu');
    expect(typeof mod.OpenInAgentContextSubmenu).toBe('function');
    expect(typeof mod.contextRowHint).toBe('function');
  });
});
