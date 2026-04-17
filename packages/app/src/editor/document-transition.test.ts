import { describe, expect, mock, test } from 'bun:test';
import { createOpenDocumentTransition } from './document-transition';

describe('createOpenDocumentTransition', () => {
  test('returns a function', () => {
    const wrapped = createOpenDocumentTransition(
      () => {},
      (scope) => scope(),
    );
    expect(typeof wrapped).toBe('function');
  });

  test('calling the wrapped function invokes startTransition once', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition);

    wrapped('doc-a');

    expect(startTransition).toHaveBeenCalledTimes(1);
  });

  test('the scope passed to startTransition calls openDocument with the docName', () => {
    const startTransition = mock((scope: () => void) => {
      // Defer scope execution to verify startTransition received a callable, not
      // that openDocument was called eagerly.
      scope();
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition);

    wrapped('doc-a');

    expect(openDocument).toHaveBeenCalledTimes(1);
    expect(openDocument).toHaveBeenCalledWith('doc-a');
  });

  test('startTransition receives a function, not an immediate value', () => {
    let scopeFn: (() => void) | null = null;
    const startTransition = mock((scope: () => void) => {
      scopeFn = scope;
    });
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, startTransition);

    wrapped('doc-a');

    // Did not call openDocument eagerly — the wrapping defers to scope().
    expect(openDocument).not.toHaveBeenCalled();
    expect(scopeFn).not.toBeNull();
    // Manually invoke the captured scope; openDocument should fire now.
    (scopeFn as unknown as () => void)();
    expect(openDocument).toHaveBeenCalledWith('doc-a');
  });

  test('multiple calls each schedule their own transition', () => {
    const calls: string[] = [];
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = (docName: string) => {
      calls.push(docName);
    };
    const wrapped = createOpenDocumentTransition(openDocument, startTransition);

    wrapped('doc-a');
    wrapped('doc-b');
    wrapped('doc-c');

    expect(startTransition).toHaveBeenCalledTimes(3);
    expect(calls).toEqual(['doc-a', 'doc-b', 'doc-c']);
  });

  test('does not invoke openDocument or startTransition at construction time', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {});

    createOpenDocumentTransition(openDocument, startTransition);

    expect(startTransition).not.toHaveBeenCalled();
    expect(openDocument).not.toHaveBeenCalled();
  });

  test('passes the docName argument unchanged (no truncation, no normalization)', () => {
    const openDocument = mock((_docName: string) => {});
    const wrapped = createOpenDocumentTransition(openDocument, (scope) => scope());

    wrapped('nested/path/with-dashes_and_underscores.md');

    expect(openDocument).toHaveBeenCalledWith('nested/path/with-dashes_and_underscores.md');
  });

  test('relays openDocument throws without swallowing them inside the transition', () => {
    const startTransition = mock((scope: () => void) => {
      scope();
    });
    const openDocument = mock((_docName: string) => {
      throw new Error('boom');
    });
    const wrapped = createOpenDocumentTransition(openDocument, startTransition);

    expect(() => wrapped('doc-a')).toThrow('boom');
    expect(startTransition).toHaveBeenCalledTimes(1);
  });
});
