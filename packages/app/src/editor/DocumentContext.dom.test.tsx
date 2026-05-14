import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { docTabId, localTabSessionStorageKey } from './editor-tabs';

mock.module('@/lib/use-collab-url', () => ({
  useCollabUrl: () => ({
    collabUrl: null,
    attempts: 0,
    terminal: false,
    lastError: null,
    retry: () => {},
  }),
}));

const { DocumentProvider, useDocumentContext } = await import('./DocumentContext');

const PINNED_TAB_ID = docTabId('Pinned.md');
const OTHER_TAB_ID = docTabId('Other.md');

function seedTabSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [PINNED_TAB_ID, OTHER_TAB_ID],
      pinnedTabIds: [PINNED_TAB_ID],
      activeDocName: 'Pinned.md',
      activeTabId: PINNED_TAB_ID,
      updatedAt: new Date('2026-05-13T00:00:00.000Z').toISOString(),
    }),
  );
}

function Harness() {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="pinned-tabs">{ctx.pinnedTabIds.join('|')}</span>
      <button type="button" onClick={() => ctx.closeTabs([PINNED_TAB_ID])}>
        Close pinned
      </button>
      <button type="button" onClick={() => ctx.closeTabs([PINNED_TAB_ID], { force: true })}>
        Force close pinned
      </button>
    </>
  );
}

function ProviderHarness({ children }: { children: ReactNode }) {
  return <DocumentProvider>{children}</DocumentProvider>;
}

describe('DocumentContext tab close force contract', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('closeTabs skips pinned tabs unless force is explicitly set', async () => {
    seedTabSession();
    render(<Harness />, { wrapper: ProviderHarness });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(PINNED_TAB_ID);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close pinned' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${PINNED_TAB_ID}|${OTHER_TAB_ID}`);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(PINNED_TAB_ID);

    await user.click(screen.getByRole('button', { name: 'Force close pinned' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(OTHER_TAB_ID);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe('');
  });
});
