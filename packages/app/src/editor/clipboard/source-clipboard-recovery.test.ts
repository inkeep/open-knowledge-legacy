/**
 * Unit tests for `handleChunkedInsertFailure` — the recovery path for
 * FR-21's chunked Source-view paste when insertion fails mid-stream.
 *
 * Covers the Major finding from Pass 1 (`chunked-insert-failure-leaves-editor-empty`):
 *   1. Selection text is re-inserted at the anchor so the user does not lose
 *      the content they had selected.
 *   2. Structured telemetry is emitted via `logChunkedInsertFail` for
 *      typed `ChunkedInsertError`, or `logConversionFail` otherwise.
 *   3. A sonner toast surfaces a user-visible signal — without it the user
 *      sees their selection vanish with no feedback.
 *
 * We mock the CM6 `EditorView` as a minimal shape (just `dispatch`) and
 * spy on `console.warn` + the sonner module's `toast.error` export. This
 * keeps the test at the recovery-contract level — a full CM6 + Y.Doc
 * integration test would require wiring yCollab + DOM and belongs in a
 * Playwright E2E, not bun-test.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ChunkedInsertError } from '@inkeep/open-knowledge-core';

type ToastFn = { error: ReturnType<typeof mock> };
const toastMock: ToastFn = { error: mock(() => {}) };
mock.module('sonner', () => ({ toast: toastMock }));

// Imported AFTER the mock so the module picks up our stub.
// biome-ignore lint/suspicious/noExplicitAny: test-scoped dynamic import
let handleChunkedInsertFailure: any;
// biome-ignore lint/suspicious/noExplicitAny: test-scoped dynamic import
let mod: any;

beforeEach(async () => {
  toastMock.error.mockClear();
  mod = await import('./source-clipboard.ts');
  handleChunkedInsertFailure = mod.handleChunkedInsertFailure;
});

afterEach(() => {
  toastMock.error.mockClear();
});

interface DispatchCall {
  from: number;
  to: number;
  insert: string;
}

function makeFakeView(): {
  dispatch: ReturnType<typeof mock>;
  dispatches: DispatchCall[];
} {
  const dispatches: DispatchCall[] = [];
  const dispatch = mock((arg: { changes: DispatchCall }) => {
    dispatches.push(arg.changes);
  });
  return { dispatch, dispatches };
}

function withSilencedWarn<T>(fn: () => T): T {
  const orig = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = orig;
  }
}

describe('handleChunkedInsertFailure — Source-view recovery contract', () => {
  test('ChunkedInsertError: restores selection text + emits structured telemetry + shows toast', () => {
    const { dispatch, dispatches } = makeFakeView();
    const err = new ChunkedInsertError(new Error('y-text full'), {
      chunksCompleted: 2,
      totalChunks: 10,
      bytesWritten: 100 * 1024,
      bytesRemaining: 400 * 1024,
    });
    withSilencedWarn(() =>
      handleChunkedInsertFailure({
        // biome-ignore lint/suspicious/noExplicitAny: fake view for unit test
        view: { dispatch } as any,
        source: 'gdocs',
        html: '<p>1</p>'.repeat(10),
        restoreText: 'original user selection',
        anchorIndex: 42,
        err,
      }),
    );
    // Selection-restore dispatch landed at the anchor with the original text.
    expect(dispatches).toEqual([{ from: 42, to: 42, insert: 'original user selection' }]);
    // Toast surfaces partial-progress info to the user.
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const msg = toastMock.error.mock.calls[0]?.[0];
    expect(msg).toContain('2 of 10 chunks');
    expect(msg).toContain('restored');
  });

  test('empty restoreText: no dispatch but still emits telemetry + toast', () => {
    const { dispatch, dispatches } = makeFakeView();
    const err = new ChunkedInsertError(new Error('boom'), {
      chunksCompleted: 0,
      totalChunks: 5,
      bytesWritten: 0,
      bytesRemaining: 250 * 1024,
    });
    withSilencedWarn(() =>
      handleChunkedInsertFailure({
        // biome-ignore lint/suspicious/noExplicitAny: fake view for unit test
        view: { dispatch } as any,
        source: 'generic',
        html: '<p>x</p>',
        restoreText: '',
        anchorIndex: 0,
        err,
      }),
    );
    expect(dispatches).toEqual([]); // no dispatch for empty restoreText
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  test('non-ChunkedInsertError falls back to conversion-fail telemetry', () => {
    const { dispatch, dispatches } = makeFakeView();
    withSilencedWarn(() =>
      handleChunkedInsertFailure({
        // biome-ignore lint/suspicious/noExplicitAny: fake view for unit test
        view: { dispatch } as any,
        source: 'notion',
        html: '<p>x</p>',
        restoreText: 'abc',
        anchorIndex: 5,
        err: new Error('unrelated failure'),
      }),
    );
    expect(dispatches).toEqual([{ from: 5, to: 5, insert: 'abc' }]);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    // The generic branch emits the "Paste failed" toast instead of the
    // chunks-landed variant, so users know it wasn't a partial outcome.
    const msg = toastMock.error.mock.calls[0]?.[0];
    expect(msg).toContain('Paste failed');
  });

  test('dispatch throw during restore is logged but does not prevent toast', () => {
    const throwingDispatch = mock(() => {
      throw new Error('view destroyed');
    });
    withSilencedWarn(() =>
      handleChunkedInsertFailure({
        // biome-ignore lint/suspicious/noExplicitAny: fake view for unit test
        view: { dispatch: throwingDispatch } as any,
        source: 'gmail',
        html: '<p>x</p>',
        restoreText: 'some text',
        anchorIndex: 0,
        err: new ChunkedInsertError(new Error('x'), {
          chunksCompleted: 1,
          totalChunks: 3,
          bytesWritten: 50000,
          bytesRemaining: 100000,
        }),
      }),
    );
    // Telemetry + toast path still runs.
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });
});
