/**
 * Agent session management — DirectConnection + UndoManager lifecycle.
 *
 * Each agent gets a persistent DirectConnection to the Hocuspocus server.
 * Sessions track awareness (presence bar shows agent), and a server-side
 * UndoManager tracks 'agent-write' origin for per-agent undo/redo.
 */
import type { DirectConnection, Document, Hocuspocus } from '@hocuspocus/server';
import { sharedExtensions, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

/**
 * The DirectConnection class exposes `.document` at runtime but the exported
 * interface only declares `transact()` and `disconnect()`. We extend the
 * interface so we can access `document` (needed for `dc.document.transact()`
 * with a custom origin string and for awareness).
 */
export interface AgentDirectConnection extends DirectConnection {
  document: Document;
}

/** Agent write origin — tracked by server-side UndoManager. */
export const AGENT_WRITE_ORIGIN = 'agent-write';

/** Default agent identity. Key used in Y.Map('activity'). */
export const DEFAULT_AGENT_ID = 'claude-1';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/**
 * After writing to Y.Text, sync the full Y.Text content to XmlFragment so
 * clients receive paired changes. This is necessary because client-side
 * Observer B skips remote Y.Text changes to prevent cross-tab amplification.
 */
export function syncTextToFragment(document: Document): void {
  const ytext = document.getText('source');
  const fullText = ytext.toString();
  const { frontmatter, body } = stripFrontmatter(fullText);
  const parsedJson = mdManager.parse(body);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const xmlFragment = document.getXmlFragment('default');
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(document, xmlFragment, pmNode, meta);
  const metaMap = document.getMap('metadata');
  metaMap.set('frontmatter', frontmatter);
}

export class AgentSessionManager {
  private sessions = new Map<string, AgentDirectConnection>();
  private undoManagers = new Map<string, Y.UndoManager>();
  private hocuspocus: Hocuspocus;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  /**
   * Get or create a server-side UndoManager for agent writes on a document.
   * Tracks Y.Text('source') with origin 'agent-write'.
   *
   * captureTimeout: 0 — each agent transaction is its own undo entry.
   *   Diverges from spec Q11 ("use default 500ms"). Justified for the spike because every
   *   /api/agent-write* HTTP call wraps exactly one dc.document.transact() call, so each
   *   request is already one logical action — grouping would only matter if a single agent
   *   action emitted multiple transactions (e.g., token streaming). Revisit when streaming
   *   agent writes land: at that point 500ms grouping would better match "one agent reply =
   *   one undo step" UX. Until then, 0ms is the simpler model.
   */
  getUndoManager(dc: AgentDirectConnection): Y.UndoManager {
    const docName = dc.document.name;
    let um = this.undoManagers.get(docName);
    if (!um) {
      const ytext = dc.document.getText('source');
      um = new Y.UndoManager(ytext, {
        trackedOrigins: new Set([AGENT_WRITE_ORIGIN]),
        captureTimeout: 0,
      });
      this.undoManagers.set(docName, um);
      console.log(`[agent-undo] Created UndoManager for: ${docName}`);
    }
    return um;
  }

  /**
   * Get or create a persistent agent DirectConnection for a document.
   * Sets agent awareness (name, color, type) on first open.
   */
  async getSession(docName: string): Promise<AgentDirectConnection> {
    let dc = this.sessions.get(docName);
    if (!dc) {
      dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
      dc.document.awareness.setLocalState({
        user: {
          name: 'Claude',
          color: '#D97757',
          type: 'agent',
          icon: 'claude',
          tabId: `agent-${crypto.randomUUID()}`,
        },
        mode: 'idle',
      });
      this.sessions.set(docName, dc);
      this.getUndoManager(dc);
      console.log(`[agent-session] Created persistent session for: ${docName}`);
    }
    return dc;
  }

  /** Check if a session exists without creating one. */
  hasSession(docName: string): boolean {
    return this.sessions.has(docName);
  }

  /** Get UndoManager for a document if it exists. */
  getExistingUndoManager(docName: string): Y.UndoManager | undefined {
    return this.undoManagers.get(docName);
  }

  /**
   * Disconnect and remove an agent session. Clears awareness before disconnect.
   */
  async closeSession(docName: string): Promise<void> {
    const dc = this.sessions.get(docName);
    if (dc) {
      const um = this.undoManagers.get(docName);
      if (um) {
        um.destroy();
        this.undoManagers.delete(docName);
        console.log(`[agent-undo] Destroyed UndoManager for: ${docName}`);
      }
      dc.document.awareness.setLocalState(null);
      await dc.disconnect();
      this.sessions.delete(docName);
      console.log(`[agent-session] Closed session for: ${docName}`);
    }
  }

  /** Close all agent sessions. Used during test reset. */
  async closeAll(): Promise<void> {
    const entries = [...this.sessions.keys()];
    for (const docName of entries) {
      await this.closeSession(docName);
    }
  }
}
