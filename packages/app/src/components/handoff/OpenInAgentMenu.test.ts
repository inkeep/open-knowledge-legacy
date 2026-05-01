import { describe, expect, test } from 'bun:test';

describe('OpenInAgentMenu module surface', () => {
  test('exports the shell component', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.OpenInAgentMenu).toBe('function');
  });

  test('re-exports successToastForWebFallback for surface-level wiring', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.successToastForWebFallback).toBe('function');
    const itemMod = await import('./OpenInAgentMenuItem');
    expect(mod.successToastForWebFallback).toBe(itemMod.successToastForWebFallback);
  });
});
