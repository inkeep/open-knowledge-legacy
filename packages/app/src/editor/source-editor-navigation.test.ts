import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearPendingSourceNavigationsForTest,
  consumePendingSourceNavigation,
  peekPendingSourceNavigation,
  rememberPendingSourceNavigation,
} from './source-editor-navigation';

afterEach(() => {
  clearPendingSourceNavigationsForTest();
});

describe('source-editor-navigation', () => {
  test('consume returns the pending navigation once for a doc', () => {
    const navigation = {
      kind: 'raw-mdx' as const,
      detail: { offset: 42 },
    };

    rememberPendingSourceNavigation('doc-a', navigation);

    expect(peekPendingSourceNavigation('doc-a')).toEqual(navigation);
    expect(consumePendingSourceNavigation('doc-a')).toEqual(navigation);
    expect(consumePendingSourceNavigation('doc-a')).toBeNull();
  });

  test('pending navigation is doc-scoped and latest-write-wins per doc', () => {
    rememberPendingSourceNavigation('doc-a', {
      kind: 'raw-mdx',
      detail: { offset: 7 },
    });
    rememberPendingSourceNavigation('doc-a', {
      kind: 'outline',
      detail: { index: 3, slug: 'intro', mode: 'source' },
    });
    rememberPendingSourceNavigation('doc-b', {
      kind: 'raw-mdx',
      detail: { offset: 99 },
    });

    expect(consumePendingSourceNavigation('doc-a')).toEqual({
      kind: 'outline',
      detail: { index: 3, slug: 'intro', mode: 'source' },
    });
    expect(consumePendingSourceNavigation('doc-b')).toEqual({
      kind: 'raw-mdx',
      detail: { offset: 99 },
    });
  });
});
