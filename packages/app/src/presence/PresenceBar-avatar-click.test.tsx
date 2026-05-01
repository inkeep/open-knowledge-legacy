
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { AgentPresenceEntry } from '@inkeep/open-knowledge-core';
import { renderToString } from 'react-dom/server';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AgentParticipant } from './use-presence';

const openActivityPanelCalls: string[] = [];
const openActivityPanel = (connectionId: string): void => {
  openActivityPanelCalls.push(connectionId);
};

let currentAgents: AgentParticipant[] = [];
let crossDocAgents: AgentParticipant[] = [];

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({
    activeProvider: null,
    activeDocName: null,
    systemProvider: null,
    openActivityPanel,
    docPanelMode: 'doc',
    docPanelAgentId: null,
    docPanelExpandSignal: 0,
    closeActivityPanel: () => {},
  }),
}));

mock.module('./use-presence', () => ({
  usePresence: () => ({ current: currentAgents, crossDoc: crossDocAgents }),
}));

mock.module('./use-sync-status', () => ({
  useSyncStatus: () => ({ state: 'clean' }),
}));

mock.module('./use-sync-toasts', () => ({
  useSyncToasts: () => {},
}));

const { PresenceBar } = await import('./PresenceBar');

function agent(
  agentId: string,
  icon = 'claude',
  currentDoc: string | null = 'x.md',
): AgentParticipant {
  const presence: AgentPresenceEntry = {
    displayName: `Agent-${agentId}`,
    icon,
    color: '#d97757',
    currentDoc,
    mode: 'idle',
    ts: Date.now(),
  };
  return { kind: 'agent', agentId, presence };
}

afterEach(() => {
  openActivityPanelCalls.length = 0;
  currentAgents = [];
  crossDocAgents = [];
});

describe('PresenceBar avatar click wiring', () => {
  test('each current-doc agent avatar is a button with the open-panel aria-label', () => {
    currentAgents = [agent('abc', 'claude', 'notes.md')];
    const html = renderToString(
      <TooltipProvider>
        <PresenceBar />
      </TooltipProvider>,
    );
    expect(html).toContain('data-presence-badge="agent"');
    expect(html).toContain('<button');
    expect(html).toContain('Open activity panel for Agent-abc');
  });

  test('each cross-doc agent avatar is also a button (regression guard for D-P9 LOCKED)', () => {
    crossDocAgents = [agent('zzz', 'cursor', 'other.md')];
    const html = renderToString(
      <TooltipProvider>
        <PresenceBar />
      </TooltipProvider>,
    );
    expect(html).toContain('data-presence-badge="agent"');
    expect(html).toContain('data-presence-crossdoc="true"');
    expect(html).toContain('Open activity panel for Agent-zzz, editing other.md');
  });

  test('presence bar renders an overflow chip when current-doc agents exceed the primary limit', () => {
    currentAgents = [
      agent('a', 'claude', 'x.md'),
      agent('b', 'cursor', 'x.md'),
      agent('c', 'windsurf', 'x.md'),
      agent('d', 'openai', 'x.md'),
      agent('e', 'cline', 'x.md'),
    ];
    const html = renderToString(
      <TooltipProvider>
        <PresenceBar />
      </TooltipProvider>,
    );
    expect(html).toContain('data-slot="presence-overflow"');
  });
});
