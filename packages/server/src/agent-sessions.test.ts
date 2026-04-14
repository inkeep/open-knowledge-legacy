import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Document } from '@hocuspocus/server';
import { type AgentDirectConnection, AgentSessionManager } from './agent-sessions.ts';

// Minimal Hocuspocus mock for session management tests.
// Each openDirectConnection call returns a unique mock DC so we can track disconnects.
function createMockHocuspocus() {
  const openedDocs: string[] = [];

  function makeDC(docName: string): AgentDirectConnection {
    let disconnected = false;
    const awareness = {
      state: null as unknown,
      setLocalState(s: unknown) {
        this.state = s;
      },
      setLocalStateField(_field: string, _value: unknown) {},
    };
    const doc = {
      name: docName,
      awareness,
    } as unknown as Document;
    return {
      document: doc,
      disconnect: async () => {
        disconnected = true;
      },
      isDisconnected: () => disconnected,
      transact: () => {},
    } as unknown as AgentDirectConnection;
  }

  return {
    openedDocs,
    openDirectConnection: async (docName: string): Promise<AgentDirectConnection> => {
      openedDocs.push(docName);
      return makeDC(docName);
    },
  };
}

let mockHocuspocus: ReturnType<typeof createMockHocuspocus>;
let manager: AgentSessionManager;

beforeEach(() => {
  mockHocuspocus = createMockHocuspocus();
  manager = new AgentSessionManager(mockHocuspocus as never);
});

afterEach(async () => {
  await manager.closeAll();
});

describe('getSession — composite key (docName + agentId)', () => {
  test('creates a session on first call', async () => {
    await manager.getSession('doc.md', 'agent-alice');
    expect(manager.hasSession('doc.md', 'agent-alice')).toBe(true);
  });

  test('returns the same DC on repeated calls (idempotent)', async () => {
    const dc1 = await manager.getSession('doc.md', 'agent-alice');
    const dc2 = await manager.getSession('doc.md', 'agent-alice');
    expect(dc1).toBe(dc2);
    expect(mockHocuspocus.openedDocs.filter((d) => d === 'doc.md')).toHaveLength(1);
  });

  test('creates separate sessions for different agents on the same doc', async () => {
    const dc1 = await manager.getSession('doc.md', 'agent-alice');
    const dc2 = await manager.getSession('doc.md', 'agent-bob');
    expect(dc1).not.toBe(dc2);
    expect(manager.hasSession('doc.md', 'agent-alice')).toBe(true);
    expect(manager.hasSession('doc.md', 'agent-bob')).toBe(true);
  });

  test('creates separate sessions for the same agent on different docs', async () => {
    await manager.getSession('doc-a.md', 'agent-alice');
    await manager.getSession('doc-b.md', 'agent-alice');
    expect(manager.hasSession('doc-a.md', 'agent-alice')).toBe(true);
    expect(manager.hasSession('doc-b.md', 'agent-alice')).toBe(true);
  });

  test('default agentId is claude-1', async () => {
    await manager.getSession('doc.md');
    expect(manager.hasSession('doc.md', 'claude-1')).toBe(true);
  });
});

describe('closeSession', () => {
  test('removes only the targeted (docName, agentId) session', async () => {
    await manager.getSession('doc.md', 'agent-alice');
    await manager.getSession('doc.md', 'agent-bob');
    await manager.closeSession('doc.md', 'agent-alice');
    expect(manager.hasSession('doc.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc.md', 'agent-bob')).toBe(true);
  });

  test('is a no-op for non-existent sessions', async () => {
    await expect(manager.closeSession('doc.md', 'agent-nobody')).resolves.toBeUndefined();
  });
});

describe('closeAllForDoc', () => {
  test('closes all agents for a document, leaving others intact', async () => {
    await manager.getSession('doc-a.md', 'agent-alice');
    await manager.getSession('doc-a.md', 'agent-bob');
    await manager.getSession('doc-b.md', 'agent-alice');

    await manager.closeAllForDoc('doc-a.md');

    expect(manager.hasSession('doc-a.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc-a.md', 'agent-bob')).toBe(false);
    expect(manager.hasSession('doc-b.md', 'agent-alice')).toBe(true);
  });

  test('is a no-op when no sessions exist for doc', async () => {
    await expect(manager.closeAllForDoc('nonexistent.md')).resolves.toBeUndefined();
  });
});

describe('closeAllForAgent', () => {
  test('closes all docs for an agent, leaving others intact', async () => {
    await manager.getSession('doc-a.md', 'agent-alice');
    await manager.getSession('doc-b.md', 'agent-alice');
    await manager.getSession('doc-a.md', 'agent-bob');

    await manager.closeAllForAgent('agent-alice');

    expect(manager.hasSession('doc-a.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc-b.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc-a.md', 'agent-bob')).toBe(true);
  });
});

describe('closeAll', () => {
  test('without docName: closes every session', async () => {
    await manager.getSession('doc-a.md', 'agent-alice');
    await manager.getSession('doc-b.md', 'agent-bob');

    await manager.closeAll();

    expect(manager.hasSession('doc-a.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc-b.md', 'agent-bob')).toBe(false);
  });

  test('with docName: delegates to closeAllForDoc', async () => {
    await manager.getSession('doc-a.md', 'agent-alice');
    await manager.getSession('doc-b.md', 'agent-alice');

    await manager.closeAll('doc-a.md');

    expect(manager.hasSession('doc-a.md', 'agent-alice')).toBe(false);
    expect(manager.hasSession('doc-b.md', 'agent-alice')).toBe(true);
  });
});
