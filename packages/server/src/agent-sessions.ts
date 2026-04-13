/**
 * Agent session management — DirectConnection + UndoManager lifecycle.
 *
 * Each agent gets a persistent DirectConnection to the Hocuspocus server.
 * Sessions track awareness (presence bar shows agent), and a server-side
 * UndoManager tracks 'agent-write' origin for per-agent undo/redo.
 */
import type { DirectConnection, Document, Hocuspocus } from '@hocuspocus/server';
import { prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { isSystemDoc } from './cc1-broadcast.ts';
import { getLogger } from './logger.ts';
import { mdManager, schema } from './md-manager.ts';

const log = getLogger('agent-sessions');

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

/**
 * After writing to Y.Text, sync the full Y.Text content to XmlFragment so
 * clients receive paired changes. This is necessary because client-side
 * Observer B skips remote Y.Text changes to prevent cross-tab amplification.
 */
export function syncTextToFragment(document: Document): void {
  const ytext = document.getText('source');
  const fullText = ytext.toString();
  try {
    const { frontmatter, body } = stripFrontmatter(fullText);
    const parsedJson = mdManager.parse(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const xmlFragment = document.getXmlFragment('default');
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    // Enforce bridge invariant: ytext must be byte-equal to canonical serialization.
    // Raw markdown may differ from round-tripped form (e.g., `## H\nP` → `## H\n\nP`).
    // Without this, Observer A's guard (currentText === md) fails on the client,
    // triggering content duplication via applyUserDelta with a stale baseline.
    const canonicalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
    const canonicalFull = prependFrontmatter(frontmatter, canonicalBody);
    if (canonicalFull !== fullText) {
      ytext.delete(0, fullText.length);
      ytext.insert(0, canonicalFull);
    }

    const metaMap = document.getMap('metadata');
    metaMap.set('frontmatter', frontmatter);
  } catch (err) {
    log.error(
      {
        err,
        docName: document.name,
        textLength: fullText.length,
        preview: fullText.slice(0, 100),
      },
      `[syncTextToFragment] failed for '${document.name}'`,
    );
    throw err;
  }
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
      log.info({ docName }, `[agent-undo] Created UndoManager for: ${docName}`);
    }
    return um;
  }

  /**
   * Get or create a persistent agent DirectConnection for a document.
   * Sets agent awareness (name, color, type) on first open.
   */
  async getSession(docName: string): Promise<AgentDirectConnection> {
    if (isSystemDoc(docName)) {
      throw new Error(`Cannot create agent session for reserved doc: ${docName}`);
    }
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
      log.info({ docName }, `[agent-session] Created persistent session for: ${docName}`);
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
        log.info({ docName }, `[agent-undo] Destroyed UndoManager for: ${docName}`);
      }
      dc.document.awareness.setLocalState(null);
      await dc.disconnect();
      this.sessions.delete(docName);
      log.info({ docName }, `[agent-session] Closed session for: ${docName}`);
    }
  }

  /** Close agent sessions. When docName is provided, only that session is closed. */
  async closeAll(docName?: string): Promise<void> {
    const entries = docName ? [docName] : [...this.sessions.keys()];
    for (const name of entries) {
      try {
        await this.closeSession(name);
      } catch (err) {
        log.error({ err, docName: name }, `[agent-session] Failed to close session for ${name}`);
      }
    }
  }
}
