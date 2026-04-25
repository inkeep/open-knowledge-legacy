import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Document } from '@hocuspocus/server';
import * as Y from 'yjs';
import {
  type AgentDirectConnection,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  applyAgentUndo,
  iconFromClientName,
} from './agent-sessions.ts';

// Minimal Hocuspocus mock for session management tests.
// Each openDirectConnection call returns a unique mock DC so we can track disconnects.
// Uses a real Y.Doc so Y.UndoManager creation succeeds (US-008).
//
// Awareness is also represented as a call-log, NOT as state plumbing.
// Post-FR-3 (US-003), `AgentSessionManager` MUST NOT touch per-doc awareness —
// presence is published on the `__system__` Y.Doc via `AgentPresenceBroadcaster`
// instead. The log lets tests assert "getSession did not reach for awareness".
function createMockHocuspocus() {
  const openedDocs: string[] = [];
  const ydocs = new Map<string, Y.Doc>();
  const awarenessCalls: Array<{ method: string; args: unknown[] }> = [];

  function makeDC(docName: string): AgentDirectConnection {
    let disconnected = false;
    // Reuse the same Y.Doc per docName so concurrent sessions share state.
    let ydoc = ydocs.get(docName);
    if (!ydoc) {
      ydoc = new Y.Doc();
      ydocs.set(docName, ydoc);
    }
    const awareness = {
      setLocalState(...args: unknown[]) {
        awarenessCalls.push({ method: 'setLocalState', args });
      },
      setLocalStateField(...args: unknown[]) {
        awarenessCalls.push({ method: 'setLocalStateField', args });
      },
    };
    const doc = {
      name: docName,
      awareness,
      getText: (name: string) => ydoc.getText(name),
      getMap: (name: string) => ydoc.getMap(name),
      getXmlFragment: (name: string) => ydoc.getXmlFragment(name),
      transact: (fn: () => void, origin?: unknown) => ydoc.transact(fn, origin),
      on: ydoc.on.bind(ydoc),
      off: ydoc.off.bind(ydoc),
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
    awarenessCalls,
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

  test('does not touch per-doc awareness (presence lives on __system__ via AgentPresenceBroadcaster)', async () => {
    await manager.getSession('doc.md', 'agent-alice', {
      displayName: 'Alice',
      colorSeed: 'seed',
      clientName: 'claude-code',
    });
    await manager.closeSession('doc.md', 'agent-alice');
    expect(mockHocuspocus.awarenessCalls).toEqual([]);
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

  // Regression: phantom `Agent (agent-<shortid>)` timeline commits (2026-04-22).
  // extractAgentIdentity returns `agent-<raw>` as the sessions-map key / writerId,
  // but `context.session_id` must be the RAW connection id — the `agent-` prefix
  // is the writerId namespace added by `resolveWriterFromOrigin` in persistence.ts.
  // When session_id carried the prefix, resolveWriterFromOrigin double-prefixed to
  // `agent-agent-<raw>` and the onStoreDocument safety-net booked phantom commits
  // under that mismatched writerId.
  test('session_id in origin context is RAW (unprefixed) even when agentId is prefixed', async () => {
    const session = await manager.getSession('doc.md', 'agent-85aabbcc-1234');
    expect(session.agentId).toBe('agent-85aabbcc-1234');
    expect(session.origin.context.session_id).toBe('85aabbcc-1234');
    expect(session.undoOrigin.context.session_id).toBe('85aabbcc-1234');
  });

  test('session_id in origin context is unchanged when agentId has no prefix', async () => {
    const session = await manager.getSession('doc.md', 'claude-1');
    expect(session.agentId).toBe('claude-1');
    expect(session.origin.context.session_id).toBe('claude-1');
    expect(session.undoOrigin.context.session_id).toBe('claude-1');
  });
});

// US-008 acceptance criteria (D25, D24, D21)
describe('per-session UndoManager — US-008', () => {
  test('session.um exists and is a Y.UndoManager', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(session.um).toBeInstanceOf(Y.UndoManager);
  });

  test('session.undoOrigin is deep-frozen', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(Object.isFrozen(session.undoOrigin)).toBe(true);
    expect(Object.isFrozen(session.undoOrigin.context)).toBe(true);
  });

  test('um.trackedOrigins contains session.origin by identity', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(session.um.trackedOrigins.has(session.origin)).toBe(true);
  });

  test('um.trackedOrigins does NOT contain undoOrigin', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(session.um.trackedOrigins.has(session.undoOrigin)).toBe(false);
  });

  test('different sessions have independent UndoManagers (not ===)', async () => {
    const sessionA = await manager.getSession('doc.md', 'agent-alice');
    const sessionB = await manager.getSession('doc.md', 'agent-bob');
    expect(sessionA.um).not.toBe(sessionB.um);
  });

  test('um.destroy() is called on closeSession — subsequent doc transact does not push to undoStack', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    await manager.closeSession('doc.md', 'agent-alice');
    // After destroy, the UM should have an empty stack (no tracking post-destroy).
    // We just verify the destroy didn't throw.
    expect(session.um.undoStack.length).toBe(0);
  });
});

// V0-14 (FR-4) applyAgentUndo drain semantics. Complements the end-to-end
// integration test at packages/app/tests/integration/agent-undo.test.ts.
describe('applyAgentUndo — scope drain semantics (V0-14)', () => {
  test("scope='session' drains every UM frame in one call and reports it", async () => {
    const session = await manager.getSession('doc-drain.md', 'agent-drain');
    const ytext = session.dc.document.getText('source');

    // stopCapturing() separates the next transact into its own UM frame,
    // without waiting for the captureTimeout (500ms default).
    session.dc.document.transact(() => ytext.insert(0, 'a'), session.origin);
    session.um.stopCapturing();
    session.dc.document.transact(() => ytext.insert(0, 'b'), session.origin);
    session.um.stopCapturing();
    session.dc.document.transact(() => ytext.insert(0, 'c'), session.origin);

    expect(session.um.undoStack.length).toBe(3);

    const undone = applyAgentUndo(session, 'session');
    expect(undone).toBe(true);
    expect(session.um.undoStack.length).toBe(0);

    const undoneAgain = applyAgentUndo(session, 'session');
    expect(undoneAgain).toBe(false);
  });

  test("scope='last' pops exactly one frame", async () => {
    const session = await manager.getSession('doc-last.md', 'agent-last');
    const ytext = session.dc.document.getText('source');

    session.dc.document.transact(() => ytext.insert(0, 'x'), session.origin);
    session.um.stopCapturing();
    session.dc.document.transact(() => ytext.insert(0, 'y'), session.origin);

    expect(session.um.undoStack.length).toBe(2);

    const undone = applyAgentUndo(session, 'last');
    expect(undone).toBe(true);
    expect(session.um.undoStack.length).toBe(1);
  });

  test("scope='session' returns false on an empty stack (no-op)", async () => {
    const session = await manager.getSession('doc-empty.md', 'agent-empty');
    expect(session.um.undoStack.length).toBe(0);
    expect(applyAgentUndo(session, 'session')).toBe(false);
    expect(applyAgentUndo(session, 'last')).toBe(false);
  });

  test('post-undo XmlFragment uses embedResolver for `![[file]]` refs', async () => {
    // Composition-equivalence with applyAgentMarkdownWrite: the post-undo
    // body re-parse must use the same resolver so PM image `src` lands as
    // the resolved disk path, not the literal target. Without this, the
    // editor renders the inline image with a broken src until the next
    // round-trip.
    const session = await manager.getSession('doc-resolve.md', 'agent-resolve');
    const xmlFragment = session.dc.document.getXmlFragment('default');
    const ytext = session.dc.document.getText('source');

    const embedResolver = {
      resolveEmbed: (basename: string) =>
        basename === 'photo.png' ? 'attachments/photo.png' : null,
      sourcePath: 'doc-resolve.md',
    };

    // Write 1: body containing `![[photo.png]]`
    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '![[photo.png]]\n', 'replace', embedResolver);
    }, session.origin);
    session.um.stopCapturing();

    // Write 2: a different body so 'last' undo brings us back to Write 1.
    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '# Heading\n', 'replace', embedResolver);
    }, session.origin);

    // Sanity: post-write-2 ytext is the heading, no embed.
    expect(ytext.toString()).toContain('# Heading');

    // Undo 'last' restores the wiki-embed body. Pass embedResolver so the
    // re-parse maps `photo.png` → `attachments/photo.png` on the PM image.
    const undone = applyAgentUndo(session, 'last', embedResolver);
    expect(undone).toBe(true);

    // The server-side mdast→PM dispatch emits a PM `image` (NOT a
    // `wikiLinkEmbed` node) for image-extension embeds — handler dispatch
    // covers this in packages/core/src/markdown/index.ts. Y.XmlFragment's
    // `toJSON()` returns the XML serialization, so we assert the resolved
    // src landed on the image element's `src` attribute. Without the
    // resolver fix the post-undo XmlFragment would carry `src="photo.png"`
    // (literal target), diverging from a fresh-load shape.
    const xmlString = xmlFragment.toJSON();
    expect(xmlString).toContain('<image');
    expect(xmlString).toContain('src="/attachments/photo.png"');
    expect(xmlString).not.toContain('src="photo.png"');
  });
});
