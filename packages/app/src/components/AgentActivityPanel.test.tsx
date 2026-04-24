/**
 * AgentActivityPanel unit tests — exercise the body component directly via
 * renderToString. The wrapper `AgentActivityPanel` is a thin Sheet+portal
 * shell around `AgentActivityPanelBody`; Playwright (US-009) covers the
 * portal rendering + Esc/click-outside behavior.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { ActivityPanelData } from '@/lib/use-activity-panel';
import { AgentActivityPanelBody } from './AgentActivityPanel';

const noopFetch = async (_d: string, _i: number): Promise<string> => '';
const noopAsync = async (_d: string): Promise<void> => {};

function sampleData(overrides?: Partial<ActivityPanelData>): ActivityPanelData {
  return {
    sessionAlive: true,
    agent: { displayName: 'Claude', color: '#d97757', connectionId: 'agent-abc' },
    files: [
      {
        docName: 'notes.md',
        additionsTotal: 5,
        deletionsTotal: 1,
        lastTs: Date.now() - 10_000,
        bursts: [{ stackIndex: 0, ts: Date.now() - 10_000, additions: 5, deletions: 1 }],
      },
    ],
    writingDocs: new Set<string>(),
    ...overrides,
  };
}

function renderBody(overrides: {
  data?: ActivityPanelData | null;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  error?: string | null;
}): string {
  return renderToString(
    <AgentActivityPanelBody
      data={overrides.data ?? null}
      status={overrides.status ?? 'idle'}
      error={overrides.error ?? null}
      reload={() => {}}
      fetchBurstDiff={noopFetch}
      closeActivityPanel={() => {}}
      connectionId="agent-abc"
      onNavigate={() => {}}
      onUndoLast={noopAsync}
      onUndoAll={noopAsync}
    />,
  );
}

describe('AgentActivityPanelBody (static render)', () => {
  test('renders agent displayName + file list when data is ready', () => {
    const html = renderBody({ status: 'ready', data: sampleData() });
    expect(html).toContain('Claude');
    expect(html).toContain('notes.md');
    expect(html).toContain('data-testid="activity-panel-close"');
  });

  test('renders session-ended banner when sessionAlive=false', () => {
    const html = renderBody({
      status: 'ready',
      data: sampleData({ sessionAlive: false, files: [] }),
    });
    expect(html).toContain('Session ended');
    expect(html).toContain('data-testid="activity-panel-session-ended"');
  });

  test('loading state renders spinner copy', () => {
    const html = renderBody({ status: 'loading', data: null });
    expect(html).toContain('Loading agent activity');
  });

  test('error state renders retry UI with message', () => {
    const html = renderBody({
      status: 'error',
      error: 'Network blew up',
      data: null,
    });
    expect(html).toContain('Failed to load activity');
    expect(html).toContain('Network blew up');
    expect(html).toContain('Retry');
  });

  test('empty files list renders "No edits yet"', () => {
    const html = renderBody({ status: 'ready', data: sampleData({ files: [] }) });
    expect(html).toContain('No edits yet');
  });

  test('header falls back to generic title when agent metadata is missing', () => {
    const html = renderBody({
      status: 'ready',
      data: sampleData({ agent: null, files: [] }),
    });
    expect(html).toContain('Agent activity');
  });
});
