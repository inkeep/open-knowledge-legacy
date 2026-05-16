import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

mock.module('@/lib/documents-events', () => ({
  subscribeToDocumentsChanged: () => () => {},
}));

import { PageListProvider, usePageList } from './PageListContext';

interface PagesResponseBody {
  pages: { docName: string; title: string; size: number; modified: string }[];
}
type ResponseResolver = (res: Response) => void;

let pageResolvers: ResponseResolver[] = [];
let docResolvers: ResponseResolver[] = [];
let originalFetch: typeof globalThis.fetch;

function jsonRes(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function pagesBody(docNames: string[]): PagesResponseBody {
  return {
    pages: docNames.map((docName) => ({
      docName,
      title: docName,
      size: 1,
      modified: '2026-01-01T00:00:00.000Z',
    })),
  };
}

async function settleRound(docNames: string[]) {
  const pr = pageResolvers.shift();
  const dr = docResolvers.shift();
  if (!pr || !dr) throw new Error('settleRound: no in-flight fetch pair to resolve');
  await act(async () => {
    pr(jsonRes(pagesBody(docNames)));
    dr(jsonRes({ documents: [] }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  pageResolvers = [];
  docResolvers = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pages')) {
      return new Promise<Response>((resolve) => {
        pageResolvers.push(resolve);
      });
    }
    if (url.includes('/api/documents')) {
      return new Promise<Response>((resolve) => {
        docResolvers.push(resolve);
      });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function Probe() {
  const { loading, pages } = usePageList();
  if (loading) return <div data-testid="page-list-skeleton" />;
  return <div data-testid="page-list-content">{[...pages].sort().join(',')}</div>;
}

describe('PageListContext loading stability', () => {
  test('PRD-6649: a background refetch (window focus) never re-shows the cold-load skeleton or remounts the view', async () => {
    render(
      <PageListProvider>
        <Probe />
      </PageListProvider>,
    );

    expect(screen.getByTestId('page-list-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('page-list-content')).toBeNull();

    await settleRound(['A']);
    await waitFor(() => {
      expect(screen.getByTestId('page-list-content')).not.toBeNull();
    });
    expect(screen.queryByTestId('page-list-skeleton')).toBeNull();

    const coldNode = screen.getByTestId('page-list-content');
    coldNode.setAttribute('data-marker', 'cold');
    const pageFetchesAfterCold = pageResolvers.length; // 0 — cold round drained

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(pageResolvers.length).toBe(pageFetchesAfterCold + 1);

    expect(screen.queryByTestId('page-list-skeleton')).toBeNull();
    const inFlightNode = screen.getByTestId('page-list-content');
    expect(inFlightNode).toBe(coldNode);
    expect(inFlightNode.getAttribute('data-marker')).toBe('cold');

    await settleRound(['A', 'B']);
    await waitFor(() => {
      expect(screen.getByTestId('page-list-content').textContent).toBe('A,B');
    });
    const afterNode = screen.getByTestId('page-list-content');
    expect(afterNode).toBe(coldNode);
    expect(afterNode.getAttribute('data-marker')).toBe('cold');
    expect(screen.queryByTestId('page-list-skeleton')).toBeNull();
  });
});
