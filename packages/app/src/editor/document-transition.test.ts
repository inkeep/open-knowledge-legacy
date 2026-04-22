import { describe, expect, mock, test } from 'bun:test';
import { createOpenDocumentTransition } from './document-transition';

const alwaysWarm = () => true;
const alwaysCold = () => false;

describe('createOpenDocumentTransition — warm path', () => {
  test('wraps openDocument in startTransition when isWarm returns true', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, alwaysWarm);

    wrapped('doc-a');

    expect(startTransition).toHaveBeenCalledTimes(1);
    expect(openDocument).toHaveBeenCalledTimes(1);
    expect(openDocument).toHaveBeenCalledWith('doc-a');
  });

  test('startTransition receives a deferred scope, not an immediate invocation', () => {
    let scopeFn: (() => void) | null = null;
    const startTransition = mock((scope: () => void) => {
      scopeFn = scope;
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, alwaysWarm);

    wrapped('doc-a');

    expect(openDocument).not.toHaveBeenCalled();
    expect(scopeFn).not.toBeNull();
    (scopeFn as unknown as () => void)();
    expect(openDocument).toHaveBeenCalledWith('doc-a');
  });

  test('relays openDocument throws without swallowing them inside the transition', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {
      throw new Error('boom');
    });
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, alwaysWarm);

    expect(() => wrapped('doc-a')).toThrow('boom');
    expect(startTransition).toHaveBeenCalledTimes(1);
  });
});

describe('createOpenDocumentTransition — cold path', () => {
  test('bypasses startTransition when isWarm returns false', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, alwaysCold);

    wrapped('doc-a');

    expect(startTransition).not.toHaveBeenCalled();
    expect(openDocument).toHaveBeenCalledTimes(1);
    expect(openDocument).toHaveBeenCalledWith('doc-a');
  });

  test('cold-path throws propagate without wrapping', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {
      throw new Error('cold boom');
    });
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, alwaysCold);

    expect(() => wrapped('doc-a')).toThrow('cold boom');
    expect(startTransition).not.toHaveBeenCalled();
  });
});

describe('createOpenDocumentTransition — classification boundary', () => {
  test('isWarm is consulted per-call with the target docName', () => {
    const isWarm = mock((docName: string) => docName === 'warm-doc');
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition, isWarm);

    wrapped('warm-doc');
    wrapped('cold-doc');

    expect(isWarm).toHaveBeenCalledTimes(2);
    expect(isWarm).toHaveBeenNthCalledWith(1, 'warm-doc');
    expect(isWarm).toHaveBeenNthCalledWith(2, 'cold-doc');
    // Only the warm call went through startTransition.
    expect(startTransition).toHaveBeenCalledTimes(1);
    expect(openDocument).toHaveBeenCalledTimes(2);
  });

  test('passes the docName argument unchanged (no truncation, no normalization)', () => {
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, (scope) => scope(), alwaysWarm);

    wrapped('nested/path/with-dashes_and_underscores.md');

    expect(openDocument).toHaveBeenCalledWith('nested/path/with-dashes_and_underscores.md');
  });

  test('does not invoke isWarm, openDocument, or startTransition at construction time', () => {
    const isWarm = mock((_docName: string) => true);
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});

    createOpenDocumentTransition(openDocument, startTransition, isWarm);

    expect(isWarm).not.toHaveBeenCalled();
    expect(startTransition).not.toHaveBeenCalled();
    expect(openDocument).not.toHaveBeenCalled();
  });
});
