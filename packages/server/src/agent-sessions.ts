/**
 * Agent session management — DirectConnection lifecycle.
 *
 * Each agent gets a persistent DirectConnection to the Hocuspocus server.
 * Sessions track awareness (presence bar shows agent).
 *
 * Per-agent undo is deferred to V0-14 (three-UndoManager architecture).
 * The broken scaffold (UndoManager, undo/redo endpoints, AgentUndoButton)
 * was removed in V0-16 per TQ13.
 */
import type { DirectConnection, Document, Hocuspocus } from '@hocuspocus/server';
import { prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
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

/**
 * Agent write origin — typed LocalTransactionOrigin
 *
 * Passed to `document.transact(fn, AGENT_WRITE_ORIGIN)` in all agent write
 * paths. Load-bearing for observer origin guards and future UndoManager scoping.
 *
 * skipStoreHooks: false — persistence SHOULD fire after agent writes so
 * content reaches disk through the normal debounce pipeline.
 */
export const AGENT_WRITE_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'agent-write' },
};

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
    const parsedJson = mdManager.parseSafe(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const xmlFragment = document.getXmlFragment('default');
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    // Enforce bridge invariant: ytext must be byte-equal to canonical serialization.
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
  private hocuspocus: Hocuspocus;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
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
      log.info({ docName }, `[agent-session] Created persistent session for: ${docName}`);
    }
    return dc;
  }

  /** Check if a session exists without creating one. */
  hasSession(docName: string): boolean {
    return this.sessions.has(docName);
  }

  /**
   * Disconnect and remove an agent session. Clears awareness before disconnect.
   */
  async closeSession(docName: string): Promise<void> {
    const dc = this.sessions.get(docName);
    if (dc) {
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
