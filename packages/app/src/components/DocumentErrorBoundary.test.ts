/**
 * DocumentErrorBoundary — unit tests for the pure `errorCopy` mapping.
 *
 * Component-level rendering behavior (fallback-on-throw, retry invalidate+reset
 * ordering, back-nav gating, resetKeys clearing) is exercised end-to-end by
 * Playwright in `tests/stress/docs-open.e2e.ts` (US-012, F5 + F6). This file
 * stays at the pure-function altitude that the rest of the repo uses for UI
 * helpers — no DOM, no React renderer, no @testing-library dependency added.
 */

import { describe, expect, test } from 'bun:test';
import {
  BridgeSetupError,
  DocumentNotFoundError,
  PreSyncDisconnectError,
  SyncTimeoutError,
} from '@/editor/sync-promise';
import { errorCopy } from './DocumentErrorBoundary';

describe('errorCopy', () => {
  test('SyncTimeoutError → "Sync timed out" + doc name in summary', () => {
    const copy = errorCopy(new SyncTimeoutError('docs/guide', 30_000));
    expect(copy.title).toBe('Sync timed out');
    expect(copy.summary).toContain('docs/guide');
  });

  test('PreSyncDisconnectError → "Connection dropped" + doc name in summary', () => {
    const copy = errorCopy(new PreSyncDisconnectError('notes/idea'));
    expect(copy.title).toBe('Connection dropped');
    expect(copy.summary).toContain('notes/idea');
  });

  test('DocumentNotFoundError → "Document not found" + doc name in summary', () => {
    const copy = errorCopy(new DocumentNotFoundError('missing.md'));
    expect(copy.title).toBe('Document not found');
    expect(copy.summary).toContain('missing.md');
  });

  test('BridgeSetupError → "Couldn\'t open document" + doc name in summary', () => {
    const copy = errorCopy(new BridgeSetupError('docs/troubled', new Error('observer wiring')));
    expect(copy.title).toBe("Couldn't open document");
    expect(copy.summary).toContain('docs/troubled');
  });

  test('unknown Error subclass → "Unknown error" + surfaced message', () => {
    const copy = errorCopy(new Error('wss handshake rejected'));
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toContain('wss handshake rejected');
  });

  test('Error without message → "Unknown error" + fallback summary', () => {
    const copy = errorCopy(new Error());
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });

  test('non-Error thrown value → "Unknown error" + fallback summary', () => {
    const copy = errorCopy('just a string');
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });

  test('null thrown → "Unknown error" + fallback summary', () => {
    const copy = errorCopy(null);
    expect(copy.title).toBe('Unknown error');
    expect(copy.summary).toMatch(/unexpected/i);
  });
});
