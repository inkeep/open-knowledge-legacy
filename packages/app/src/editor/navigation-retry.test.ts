import { describe, expect, mock, test } from 'bun:test';
import { createNavigationRetryHandler } from './navigation-retry';

describe('createNavigationRetryHandler', () => {
  test('returns a zero-arg function', () => {
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise: () => {},
      openDocumentTransition: () => {},
      getActiveDocName: () => 'doc-a',
    });
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(0);
  });

  test('invalidates then navigates when activeDocName is present', () => {
    const invalidateSyncPromise = mock((_docName: string) => {});
    const openDocumentTransition = mock((_docName: string) => {});
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise,
      openDocumentTransition,
      getActiveDocName: () => 'doc-a',
    });

    handler();

    expect(invalidateSyncPromise).toHaveBeenCalledTimes(1);
    expect(invalidateSyncPromise).toHaveBeenCalledWith('doc-a');
    expect(openDocumentTransition).toHaveBeenCalledTimes(1);
    expect(openDocumentTransition).toHaveBeenCalledWith('doc-a');
  });

  test('ordering is load-bearing: invalidate fires before openDocumentTransition', () => {
    const calls: Array<'invalidate' | 'open'> = [];
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise: () => {
        calls.push('invalidate');
      },
      openDocumentTransition: () => {
        calls.push('open');
      },
      getActiveDocName: () => 'doc-a',
    });

    handler();

    expect(calls).toEqual(['invalidate', 'open']);
  });

  test('no-op when activeDocName is null (nothing to retry)', () => {
    const invalidateSyncPromise = mock((_docName: string) => {});
    const openDocumentTransition = mock((_docName: string) => {});
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise,
      openDocumentTransition,
      getActiveDocName: () => null,
    });

    handler();

    expect(invalidateSyncPromise).not.toHaveBeenCalled();
    expect(openDocumentTransition).not.toHaveBeenCalled();
  });

  test('reads activeDocName at call time, not at construction time', () => {
    const invalidateSyncPromise = mock((_docName: string) => {});
    const openDocumentTransition = mock((_docName: string) => {});
    let current: string | null = 'doc-a';
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise,
      openDocumentTransition,
      getActiveDocName: () => current,
    });

    // Swap active doc AFTER construction but BEFORE handler invocation — the
    // handler should see the new value, proving the thunk is re-read per call.
    current = 'doc-b';
    handler();

    expect(invalidateSyncPromise).toHaveBeenCalledWith('doc-b');
    expect(openDocumentTransition).toHaveBeenCalledWith('doc-b');
  });

  test('successive calls re-read activeDocName each time', () => {
    const invalidateSyncPromise = mock((_docName: string) => {});
    const openDocumentTransition = mock((_docName: string) => {});
    let current: string | null = 'doc-a';
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise,
      openDocumentTransition,
      getActiveDocName: () => current,
    });

    handler();
    current = 'doc-b';
    handler();
    current = null;
    handler(); // no-op

    expect(invalidateSyncPromise.mock.calls).toEqual([['doc-a'], ['doc-b']]);
    expect(openDocumentTransition.mock.calls).toEqual([['doc-a'], ['doc-b']]);
  });

  test('does not invoke any callback at construction time', () => {
    const invalidateSyncPromise = mock((_docName: string) => {});
    const openDocumentTransition = mock((_docName: string) => {});
    const getActiveDocName = mock(() => 'doc-a');

    createNavigationRetryHandler({
      invalidateSyncPromise,
      openDocumentTransition,
      getActiveDocName,
    });

    expect(invalidateSyncPromise).not.toHaveBeenCalled();
    expect(openDocumentTransition).not.toHaveBeenCalled();
    expect(getActiveDocName).not.toHaveBeenCalled();
  });

  test('relays openDocumentTransition throws without swallowing them', () => {
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise: () => {},
      openDocumentTransition: () => {
        throw new Error('boom');
      },
      getActiveDocName: () => 'doc-a',
    });

    expect(() => handler()).toThrow('boom');
  });

  test('skips openDocumentTransition when invalidateSyncPromise throws', () => {
    // Belt-and-suspenders: if invalidation throws, the retry is aborted and
    // we don't navigate into a known-stale Suspense state. Validates the
    // sequential (not try/finally) structure of the handler body.
    const openDocumentTransition = mock((_docName: string) => {});
    const handler = createNavigationRetryHandler({
      invalidateSyncPromise: () => {
        throw new Error('invalidate failed');
      },
      openDocumentTransition,
      getActiveDocName: () => 'doc-a',
    });

    expect(() => handler()).toThrow('invalidate failed');
    expect(openDocumentTransition).not.toHaveBeenCalled();
  });
});
