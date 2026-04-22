/**
 * Surface tests for `OpenInAgentMenu` — the dropdown shell.
 *
 * Repo convention: no `@testing-library/react` / `happy-dom`. The component's
 * branching logic is split into the per-row `OpenInAgentMenuItem` (covered
 * by its own pure-helper tests) + this shell's host-classification +
 * input-null defensive trigger handling. Full interaction (click, refresh on
 * open, three-surface mounting) lands under Playwright in US-013.
 *
 * This file's job is to:
 *   - Catch refactor drift in the module surface.
 *   - Verify the re-export of `successToastForWebFallback` (the menu wires it
 *     to sonner; the row only declares the label).
 */

import { describe, expect, test } from 'bun:test';

describe('OpenInAgentMenu module surface', () => {
  test('exports the shell component', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.OpenInAgentMenu).toBe('function');
  });

  test('re-exports successToastForWebFallback for surface-level wiring', async () => {
    const mod = await import('./OpenInAgentMenu');
    expect(typeof mod.successToastForWebFallback).toBe('function');
    // Sanity-check the re-export points at the same function as the row module.
    const itemMod = await import('./OpenInAgentMenuItem');
    expect(mod.successToastForWebFallback).toBe(itemMod.successToastForWebFallback);
  });
});
