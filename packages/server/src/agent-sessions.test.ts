import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Document } from '@hocuspocus/server';
import {
  type AgentDirectConnection,
  AgentSessionManager,
  iconFromClientName,
} from './agent-sessions.ts';

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

describe('iconFromClientName', () => {
  test('returns claude icon for claude-code', () => {
    expect(iconFromClientName('claude-code')).toBe('claude');
  });

  test('returns cursor icon for cursor clients', () => {
    expect(iconFromClientName('cursor')).toBe('cursor');
    expect(iconFromClientName('cursor-vscode')).toBe('cursor');
  });

  test('returns bot for unknown clients', () => {
    expect(iconFromClientName('unknown-harness')).toBe('bot');
  });

  test('returns bot for undefined input', () => {
    expect(iconFromClientName(undefined)).toBe('bot');
  });
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

// US-007 acceptance criteria (F1, D2, D23, D30)
describe('per-session origin — US-007', () => {
  test('D30: concurrent getSession calls produce exactly one openDirectConnection call', async () => {
    // Launch two concurrent first-calls; dedup map must collapse them to one DC.
    const [session1, session2] = await Promise.all([
      manager.getSession('doc.md', 'agent-alice'),
      manager.getSession('doc.md', 'agent-alice'),
    ]);
    // Same SessionRecord object — only one DC created.
    expect(session1).toBe(session2);
    expect(mockHocuspocus.openedDocs.filter((d) => d === 'doc.md')).toHaveLength(1);
  });

  test('D23: session.origin is deep-frozen — mutation throws in strict mode', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    // Both outer object and context must be frozen.
    expect(Object.isFrozen(session.origin)).toBe(true);
    expect(Object.isFrozen(session.origin.context)).toBe(true);
    // Strict-mode mutation of a frozen object throws TypeError.
    expect(() => {
      (session.origin as Record<string, unknown>).source = 'remote';
    }).toThrow(TypeError);
  });

  test('object-identity-unique: origins from different sessions are not ===', async () => {
    const sessionA = await manager.getSession('doc.md', 'agent-alice');
    const sessionB = await manager.getSession('doc.md', 'agent-bob');
    expect(sessionA.origin).not.toBe(sessionB.origin);
  });

  test('SessionRecord carries correct agentId and docName', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(session.agentId).toBe('agent-alice');
    expect(session.docName).toBe('doc.md');
  });
});
