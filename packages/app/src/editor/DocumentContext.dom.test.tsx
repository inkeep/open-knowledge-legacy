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

const REORDER_A = docTabId('A.md');
const REORDER_B = docTabId('B.md');
const REORDER_C = docTabId('C.md');

function seedReorderSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [REORDER_A, REORDER_B, REORDER_C],
      pinnedTabIds: [REORDER_A],
      activeDocName: 'A.md',
      activeTabId: REORDER_A,
      updatedAt: new Date('2026-05-16T00:00:00.000Z').toISOString(),
    }),
  );
}

function ReorderHarness({
  newOrder,
  draggedTabId,
}: {
  newOrder: readonly string[];
  draggedTabId: string;
}) {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="pinned-tabs">{ctx.pinnedTabIds.join('|')}</span>
      <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
      <button type="button" onClick={() => ctx.reorderTabs(newOrder, draggedTabId)}>
        Reorder
      </button>
    </>
  );
}

describe('DocumentContext reorderTabs — order + drag-mutable pin', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('dragging the lone pinned tab out of the pinned zone unpins it (wired end-to-end)', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_B, REORDER_A, REORDER_C]} draggedTabId={REORDER_A} />,
      {
        wrapper: ProviderHarness,
      },
    );

    expect(screen.getByTestId('pinned-tabs').textContent).toBe(REORDER_A);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(
      `${REORDER_B}|${REORDER_A}|${REORDER_C}`,
    );
    expect(screen.getByTestId('visible-tabs').textContent).toBe(
      `${REORDER_B}|${REORDER_A}|${REORDER_C}`,
    );
    expect(screen.getByTestId('pinned-tabs').textContent).toBe('');
  });

  test('dragging an unpinned tab into the pinned zone pins it; non-dragged tabs keep state', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_C, REORDER_A, REORDER_B]} draggedTabId={REORDER_C} />,
      {
        wrapper: ProviderHarness,
      },
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(
      `${REORDER_C}|${REORDER_A}|${REORDER_B}`,
    );
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(`${REORDER_A}|${REORDER_C}`);
  });

  test('reorderTabs is a no-op when the supplied order matches the current order', async () => {
    seedReorderSession();
    render(
      <ReorderHarness newOrder={[REORDER_A, REORDER_B, REORDER_C]} draggedTabId={REORDER_A} />,
      {
        wrapper: ProviderHarness,
      },
    );

    const beforeOpen = screen.getByTestId('open-tabs').textContent;
    const beforePinned = screen.getByTestId('pinned-tabs').textContent;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));
    expect(screen.getByTestId('open-tabs').textContent).toBe(beforeOpen);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(beforePinned);
  });

  test('reorderTabs commits a new-tab-placeholder reorder among doc-tabs (QA-024)', async () => {
    seedReorderSession();
    function NewTabReorderHarness() {
      const ctx = useDocumentContext();
      return (
        <>
          <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
          <button
            type="button"
            onClick={() => {
              ctx.openNewTab();
            }}
          >
            New tab
          </button>
          <button
            type="button"
            onClick={() => {
              const visible = ctx.visibleTabIds;
              const newTabId = ctx.newTabIds[0];
              if (!newTabId) return;
              const next = visible.filter((id) => id !== newTabId);
              next.splice(1, 0, newTabId);
              ctx.reorderTabs(next, newTabId);
            }}
          >
            Move new-tab to middle
          </button>
        </>
      );
    }
    render(<NewTabReorderHarness />, { wrapper: ProviderHarness });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New tab' }));
    const beforeReorder = screen.getByTestId('visible-tabs').textContent ?? '';
    const beforeParts = beforeReorder.split('|');
    expect(beforeParts).toEqual([REORDER_A, REORDER_B, REORDER_C, beforeParts[3] ?? '']);
    const newTabId = beforeParts[3];
    expect(newTabId).toMatch(/^new-tab:/);
    await user.click(screen.getByRole('button', { name: 'Move new-tab to middle' }));
    const afterParts = (screen.getByTestId('visible-tabs').textContent ?? '').split('|');
    expect(afterParts).toEqual([REORDER_A, newTabId, REORDER_B, REORDER_C]);
  });

  test('reorderTabs defensively appends any open tab the caller forgot to include', async () => {
    seedReorderSession();
    render(<ReorderHarness newOrder={[REORDER_C, REORDER_A]} draggedTabId={REORDER_B} />, {
      wrapper: ProviderHarness,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reorder' }));
    const tabs = screen.getByTestId('open-tabs').textContent ?? '';
    expect(tabs.split('|')).toEqual([REORDER_C, REORDER_A, REORDER_B]);
    expect(screen.getByTestId('pinned-tabs').textContent).toBe(REORDER_A);
  });
});

const RENAME_FOO = docTabId('foo.md');
const RENAME_BAR = docTabId('bar.md');
const RENAME_BAZZ = docTabId('bazz.md');

function seedRenameSession() {
  window.localStorage.setItem(
    localTabSessionStorageKey(window.location.origin),
    JSON.stringify({
      openTabs: [RENAME_FOO, RENAME_BAR],
      pinnedTabIds: [],
      activeDocName: 'foo.md',
      activeTabId: RENAME_FOO,
      updatedAt: new Date('2026-05-16T00:00:00.000Z').toISOString(),
    }),
  );
}

function RenameHarness({ fromDocName, toDocName }: { fromDocName: string; toDocName: string }) {
  const ctx = useDocumentContext();
  return (
    <>
      <span data-testid="open-tabs">{ctx.openTabs.join('|')}</span>
      <span data-testid="visible-tabs">{ctx.visibleTabIds.join('|')}</span>
      <span data-testid="active-tab">{ctx.activeTabId ?? ''}</span>
      <button type="button" onClick={() => ctx.remapTabsForRename([{ fromDocName, toDocName }])}>
        Rename
      </button>
    </>
  );
}

describe('DocumentContext remapTabsForRename — preserves tab position', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = '';
  });

  test('renaming an open tab keeps its index in both openTabs and visibleTabIds', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="foo.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${RENAME_FOO}|${RENAME_BAR}`);
    expect(screen.getByTestId('visible-tabs').textContent).toBe(`${RENAME_FOO}|${RENAME_BAR}`);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('open-tabs').textContent).toBe(`${RENAME_BAZZ}|${RENAME_BAR}`);
    expect(screen.getByTestId('visible-tabs').textContent).toBe(`${RENAME_BAZZ}|${RENAME_BAR}`);
  });

  test('renaming the active tab commits the remapped tab id to activeTabId', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="foo.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_BAZZ);
  });

  test('renaming a non-active tab leaves activeTabId untouched', async () => {
    seedRenameSession();
    render(<RenameHarness fromDocName="bar.md" toDocName="bazz.md" />, {
      wrapper: ProviderHarness,
    });

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByTestId('active-tab').textContent).toBe(RENAME_FOO);
  });
});
