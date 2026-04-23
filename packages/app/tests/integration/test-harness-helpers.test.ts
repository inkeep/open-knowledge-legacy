/**
 * Tests for non-server test-harness helpers — small, fast, no I/O.
 *
 * Currently covers `requireShadowDir`, the typed-boundary helper that translates
 * a missing `withShadow: true` opt-in into a harness-named error message instead
 * of an opaque downstream `simpleGit` "fatal: not a git repository" failure
 * surfaced from inside an acceptance test.
 *
 * The error message is the contract: every shadow-asserting test in
 * `packages/app/tests/integration/shadow-harness-*.test.ts` and the migrated
 * `persistence-fan-out.test.ts` consumes `requireShadowDir(server)` rather than
 * `server.shadowDir as string`. If the message regresses, callers lose the
 * descriptive failure mode that points at the missing opt-in.
 */

import { describe, expect, test } from 'bun:test';

import { requireShadowDir, type TestServer } from './test-harness';

describe('requireShadowDir — typed-boundary helper for withShadow opt-in', () => {
  test('throws a harness-named error mentioning withShadow when shadowDir is undefined', () => {
    // Minimal stand-in for a TestServer created via `createTestServer()`
    // (no `withShadow: true`) — only the `shadowDir` field matters here.
    const server = { shadowDir: undefined } as unknown as TestServer;

    expect(() => requireShadowDir(server)).toThrow(/withShadow: true/);
  });

  test('error message is harness-namespaced so failures point at misconfiguration, not the symptom', () => {
    const server = { shadowDir: undefined } as unknown as TestServer;

    expect(() => requireShadowDir(server)).toThrow(/\[test-harness\]/);
  });

  test('returns the shadowDir string when withShadow opt-in produced one', () => {
    const server = { shadowDir: '/tmp/ok-test-abc/.git/open-knowledge' } as unknown as TestServer;

    expect(requireShadowDir(server)).toBe('/tmp/ok-test-abc/.git/open-knowledge');
  });
});
