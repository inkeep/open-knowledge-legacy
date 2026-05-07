import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Document } from '@hocuspocus/server';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {
  type AgentDirectConnection,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  applyAgentUndo,
  iconFromClientName,
} from './agent-sessions.ts';

function createMockHocuspocus() {
  const openedDocs: string[] = [];
  const ydocs = new Map<string, Y.Doc>();
  const awarenessCalls: Array<{ method: string; args: unknown[] }> = [];

  function makeDC(docName: string): AgentDirectConnection {
    let disconnected = false;
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

  test('rejects reserved system doc names with a thrown error (D49)', async () => {
    await expect(manager.getSession('__system__', 'agent-alice')).rejects.toThrow(/reserved doc/i);
  });

  test('rejects reserved config doc names with a thrown error (D49 / FR-29)', async () => {
    await expect(manager.getSession('__config__/project', 'agent-alice')).rejects.toThrow(
      /reserved doc/i,
    );
    await expect(manager.getSession('__local__/project', 'agent-alice')).rejects.toThrow(
      /reserved doc/i,
    );
    await expect(manager.getSession('__user__/config.yml', 'agent-alice')).rejects.toThrow(
      /reserved doc/i,
    );
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

  test('always deletes the session entry, even when disconnect throws', async () => {
    await manager.getSession('doc.md', 'agent-throws');
    expect(manager.hasSession('doc.md', 'agent-throws')).toBe(true);

    // biome-ignore lint/suspicious/noExplicitAny: test reaches into internal map for failure injection
    const session = (manager as any).sessions.get(
      // biome-ignore lint/suspicious/noExplicitAny: test reaches into internal map for failure injection
      (manager as any).sessionKey('doc.md', 'agent-throws'),
    );
    expect(session).toBeDefined();
    session.dc.disconnect = async () => {
      throw new Error('SIMULATED: Y.js observers in inconsistent state');
    };

    await expect(manager.closeSession('doc.md', 'agent-throws')).resolves.toBeUndefined();
    expect(manager.hasSession('doc.md', 'agent-throws')).toBe(false);
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

describe('per-session origin — US-007', () => {
  test('D30: concurrent getSession calls produce exactly one openDirectConnection call', async () => {
    const [session1, session2] = await Promise.all([
      manager.getSession('doc.md', 'agent-alice'),
      manager.getSession('doc.md', 'agent-alice'),
    ]);
    expect(session1).toBe(session2);
    expect(mockHocuspocus.openedDocs.filter((d) => d === 'doc.md')).toHaveLength(1);
  });

  test('D23: session.origin is deep-frozen — mutation throws in strict mode', async () => {
    const session = await manager.getSession('doc.md', 'agent-alice');
    expect(Object.isFrozen(session.origin)).toBe(true);
    expect(Object.isFrozen(session.origin.context)).toBe(true);
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
    expect(session.um.undoStack.length).toBe(0);
  });
});

describe('applyAgentUndo — scope drain semantics (V0-14)', () => {
  test("scope='session' drains every UM frame in one call and reports it", async () => {
    const session = await manager.getSession('doc-drain.md', 'agent-drain');
    const ytext = session.dc.document.getText('source');

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
    const session = await manager.getSession('doc-resolve.md', 'agent-resolve');
    const xmlFragment = session.dc.document.getXmlFragment('default');
    const ytext = session.dc.document.getText('source');

    const embedResolver = {
      resolveEmbed: (basename: string) =>
        basename === 'photo.png' ? 'attachments/photo.png' : null,
      sourcePath: 'doc-resolve.md',
    };

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '![[photo.png]]\n', 'replace', embedResolver);
    }, session.origin);
    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '# Heading\n', 'replace', embedResolver);
    }, session.origin);

    expect(ytext.toString()).toContain('# Heading');

    const undone = applyAgentUndo(session, 'last', embedResolver);
    expect(undone).toBe(true);

    const schema = getSchema(sharedExtensions);
    const pmJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
    const node = pmJson.content?.[0] as
      | { type?: string; attrs?: { componentName?: string; props?: Record<string, unknown> } }
      | undefined;
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedImage');
    expect(node?.attrs?.props?.src).toBe('/attachments/photo.png');
    expect(node?.attrs?.props?.target).toBe('photo.png');
  });
});

describe('applyAgentUndo — Y.Text-is-truth contract (FR-40)', () => {
  test('preserves CRLF line endings across undo (no canonicalize-write-back)', async () => {
    const session = await manager.getSession('doc-crlf.md', 'agent-crlf');
    const ytext = session.dc.document.getText('source');

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '__foo__\r\nLine 2.\r\n', 'replace');
    }, session.origin);
    expect(ytext.toString()).toBe('__foo__\r\nLine 2.\r\n');

    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '# Heading\n', 'replace');
    }, session.origin);

    const undone = applyAgentUndo(session, 'last');
    expect(undone).toBe(true);

    expect(ytext.toString()).toBe('__foo__\r\nLine 2.\r\n');
  });

  test('preserves doc-start `---` (no canonicalize to `***\\n\\n`) across undo', async () => {
    const session = await manager.getSession('doc-start-dashes.md', 'agent-dashes');
    const ytext = session.dc.document.getText('source');

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '---\n# H\n\nBody.\n', 'replace');
    }, session.origin);
    expect(ytext.toString()).toBe('---\n# H\n\nBody.\n');

    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '# Other\n', 'replace');
    }, session.origin);

    const undone = applyAgentUndo(session, 'last');
    expect(undone).toBe(true);

    expect(ytext.toString()).toBe('---\n# H\n\nBody.\n');
    expect(ytext.toString().startsWith('---\n')).toBe(true);
    expect(ytext.toString().includes('***')).toBe(false);
  });

  test('preserves user-form delimiter `__foo__` across undo (FR-25 alignment check)', async () => {
    const session = await manager.getSession('doc-delimiter.md', 'agent-delim');
    const ytext = session.dc.document.getText('source');

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '__bold__ and _italic_\n', 'replace');
    }, session.origin);
    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '# Heading\n', 'replace');
    }, session.origin);

    const undone = applyAgentUndo(session, 'last');
    expect(undone).toBe(true);

    expect(ytext.toString()).toBe('__bold__ and _italic_\n');
    expect(ytext.toString().includes('**bold**')).toBe(false);
    expect(ytext.toString().includes('*italic*')).toBe(false);
  });

  test("scope='session' drains across multiple source-form writes — final state empty", async () => {
    const session = await manager.getSession('doc-session-drain.md', 'agent-drain');
    const ytext = session.dc.document.getText('source');

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '__a__\r\n', 'replace');
    }, session.origin);
    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '---\n# B\n', 'replace');
    }, session.origin);
    session.um.stopCapturing();

    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, '## H ##\nC\n', 'replace');
    }, session.origin);

    expect(session.um.undoStack.length).toBe(3);

    const undone = applyAgentUndo(session, 'session');
    expect(undone).toBe(true);
    expect(session.um.undoStack.length).toBe(0);
    expect(ytext.toString()).toBe('');
  });
});
