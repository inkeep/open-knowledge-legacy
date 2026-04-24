/**
 * ActivityPanelFileRow unit tests — render via `renderToString` (same
 * pattern as jsx-component-prop-panel.test.tsx) and inspect the static HTML
 * shape. Interactive behavior (carrot toggle, undo dialog flow, onNavigate
 * firing) is exercised in Playwright E2E (US-009).
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { FileData } from '@/lib/use-activity-panel';
import { ActivityPanelFileRow } from './ActivityPanelFileRow';

function sampleFile(overrides?: Partial<FileData>): FileData {
  return {
    docName: 'notes.md',
    additionsTotal: 10,
    deletionsTotal: 2,
    lastTs: Date.now() - 15_000,
    bursts: [
      { stackIndex: 1, ts: Date.now() - 15_000, additions: 4, deletions: 0 },
      { stackIndex: 0, ts: Date.now() - 45_000, additions: 6, deletions: 2 },
    ],
    ...overrides,
  };
}

const noopFetch = async (_d: string, _i: number): Promise<string> => '';
const noopAsync = async (_d: string): Promise<void> => {};

describe('ActivityPanelFileRow (static render)', () => {
  test('returns null when file has no bursts (D-P18 defensive guard)', () => {
    const html = renderToString(
      <ActivityPanelFileRow
        file={sampleFile({ bursts: [] })}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(html).toBe('');
  });

  test('collapsed state: shows filename, stat, relative timestamp', () => {
    const html = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(html).toContain('notes.md');
    // React's server renderer inserts `<!-- -->` comment markers between
    // adjacent text/expression nodes — strip them before asserting content.
    const stripped = html.replaceAll('<!-- -->', '');
    // Diff stats use unicode '−' minus for deletions (distinct from ASCII '-').
    expect(stripped).toContain('+10');
    expect(stripped).toContain('−2');
    // 15s ago ⇒ 's ago' pattern should appear.
    expect(html).toContain('s ago');
  });

  test('writing indicator renders only when isWriting=true', () => {
    const off = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(off).not.toContain('writing…');

    const on = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={true}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(on).toContain('writing…');
  });

  test('collapsed row does not render undo buttons or dialog', () => {
    const html = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(html).not.toContain('Undo last edit');
    expect(html).not.toContain('Undo all edits');
    expect(html).not.toContain('Undo all edits on this file?');
  });

  test('collapsed row carrot uses right-pointing chevron (▸), not down (▾)', () => {
    const html = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    // The collapsed carrot uses lucide-react's ChevronRight — verify
    // aria-expanded is false (the semantic signal consumers rely on).
    expect(html).toContain('aria-expanded="false"');
  });

  test('filename click target has correct aria-label and data-testid', () => {
    const html = renderToString(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={true}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    expect(html).toContain('aria-label="Navigate to notes.md"');
    expect(html).toContain('data-testid="activity-panel-file-row-filename"');
  });
});
