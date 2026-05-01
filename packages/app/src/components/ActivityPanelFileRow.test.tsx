import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileData } from '@/lib/use-activity-panel';
import { ActivityPanelFileRow } from './ActivityPanelFileRow';

function render(ui: React.ReactElement): string {
  return renderToString(<TooltipProvider>{ui}</TooltipProvider>);
}

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
    const html = render(
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
    const html = render(
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
    const stripped = html.replaceAll('<!-- -->', '');
    expect(stripped).toContain('+10');
    expect(stripped).toContain('−2');
    expect(html).toContain('s ago');
  });

  test('writing indicator renders only when isWriting=true', () => {
    const off = render(
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

    const on = render(
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

  test('collapsed row renders both undo buttons in the header, confirm dialog not shown', () => {
    const html = render(
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
    expect(html).toContain('data-testid="activity-panel-undo-last"');
    expect(html).toContain('data-testid="activity-panel-undo-all"');
    expect(html).toContain('aria-label="Undo last edit on notes.md"');
    expect(html).toContain('aria-label="Undo all edits on notes.md"');
    expect(html).not.toContain('Undo all edits on this file?');
  });

  test('undo buttons are disabled when sessionAlive=false', () => {
    const html = render(
      <ActivityPanelFileRow
        file={sampleFile()}
        sessionAlive={false}
        isWriting={false}
        onNavigate={() => {}}
        onUndoLast={noopAsync}
        onUndoAll={noopAsync}
        fetchBurstDiff={noopFetch}
      />,
    );
    const undoLastIdx = html.indexOf('data-testid="activity-panel-undo-last"');
    const undoAllIdx = html.indexOf('data-testid="activity-panel-undo-all"');
    expect(undoLastIdx).toBeGreaterThan(-1);
    expect(undoAllIdx).toBeGreaterThan(-1);
    const windowBefore = 400;
    const undoLastSlice = html.slice(Math.max(0, undoLastIdx - windowBefore), undoLastIdx);
    const undoAllSlice = html.slice(Math.max(0, undoAllIdx - windowBefore), undoAllIdx);
    expect(undoLastSlice).toContain('disabled');
    expect(undoAllSlice).toContain('disabled');
  });

  test('collapsed row carrot uses right-pointing chevron (▸), not down (▾)', () => {
    const html = render(
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
    expect(html).toContain('aria-expanded="false"');
  });

  test('filename click target has correct aria-label and data-testid', () => {
    const html = render(
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
