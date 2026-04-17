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
import type {
  DirectConnection,
  Document,
  Hocuspocus,
  LocalTransactionOrigin,
} from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  applyFastDiff,
  colorFromSeed,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';

export { colorFromSeed } from '@inkeep/open-knowledge-core';

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
} satisfies LocalTransactionOrigin;

/** Map known MCP clientInfo.name values to icon identifiers. */
export function iconFromClientName(name?: string): string {
  const ICON_MAP: Record<string, string> = {
    'claude-code': 'claude',
    'claude-ai': 'claude',
    cursor: 'cursor',
    'cursor-vscode': 'cursor',
    cascade: 'windsurf',
    codex: 'openai',
    copilot: 'github',
    cline: 'cline',
  };
  return name ? (ICON_MAP[name] ?? 'bot') : 'bot';
}

/**
 * XmlFragment-authoritative agent write composition (FR-1, precedent #10).
 *
 * Reads current XmlFragment (which reflects all CRDT-synced content including
 * client WYSIWYG typing mid-flight), composes the agent's delta at the markdown
 * level, applies via updateYFragment (structural diff preserves user-content
 * Items), and mirrors Y.Text via applyFastDiff (character-level DMP diff_main
 * preserves non-agent Y.Text Items and their origins).
 *
 * Called within a transact() block whose origin is the caller's responsibility
 * (typically AGENT_WRITE_ORIGIN).
 *
 * @see AGENTS.md precedent #9 (minimize CRDT mutation in sync bridges)
 * @see AGENTS.md precedent #10 (XmlFragment-authoritative, Y.Text mirrors)
 */
export function applyAgentMarkdownWrite(
  document: Document,
  markdown: string,
  position: 'append' | 'prepend' | 'replace',
): void {
  try {
    const xmlFragment = document.getXmlFragment('default');
    const ytext = document.getText('source');
    const metaMap = document.getMap('metadata');

    // 1. Read current authoritative state from XmlFragment + metaMap.
    const currentJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const currentBody = mdManager.serialize(currentJson);
    const existingFm = (metaMap.get('frontmatter') as string | undefined) ?? '';

    // 2. Split the agent's payload into frontmatter + body. The agent may
    //    send a full document (FM + body) or body-only; we handle both.
    //    On 'replace', an FM in the payload updates metaMap. On 'prepend'/
    //    'append', the payload is treated as body-only — any leading FM is
    //    stripped defensively to avoid producing a document with two FM
    //    blocks (double-FM is a CommonMark invalid state).
    const { frontmatter: payloadFm, body: payloadBody } = stripFrontmatter(markdown);

    // 3. Determine the final frontmatter and compose the final body.
    let finalFm: string;
    let newBody: string;
    switch (position) {
      case 'replace':
        // Payload FM (if present) wins; otherwise keep existing FM.
        finalFm = payloadFm || existingFm;
        newBody = payloadBody.trim();
        break;
      case 'prepend':
        finalFm = existingFm;
        newBody = `${payloadBody.trim()}\n\n${currentBody}`;
        break;
      case 'append':
        finalFm = existingFm;
        newBody = currentBody.trim()
          ? `${currentBody}\n\n${payloadBody.trim()}\n`
          : `${payloadBody.trim()}\n`;
        break;
    }

    // 4. Apply composed body to XmlFragment via structural diff
    //    (preserves user-content Items at matching positions).
    const parsedJson = mdManager.parseWithFallback(newBody);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    // 5. Commit the final frontmatter to metaMap if it changed. This is the
    //    canonical storage surface read by persistence.onStoreDocument and
    //    by the Y.Text mirror in step 6.
    if (finalFm !== existingFm) {
      metaMap.set('frontmatter', finalFm);
    }

    // 6. Mirror Y.Text with minimal mutation. Only the changed region is
    //    touched, so user-content Items in Y.Text retain their origin.
    const canonicalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
    const canonicalFull = prependFrontmatter(finalFm, canonicalBody);
    applyFastDiff(ytext, ytext.toString(), canonicalFull);
  } catch (err) {
    log.error(
      { err, docName: document.name, position, markdownLen: markdown.length },
      `[applyAgentMarkdownWrite] failed for '${document.name}'`,
    );
    throw err;
  }
}

export interface AgentSessionIdentity {
  displayName: string;
  colorSeed: string;
  clientName?: string;
}

export class AgentSessionManager {
  private sessions = new Map<string, AgentDirectConnection>();
  private hocuspocus: Hocuspocus;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  private sessionKey(docName: string, agentId: string): string {
    return `${docName}\0${agentId}`;
  }

  /**
   * Get or create a persistent agent DirectConnection for a document.
   * Sessions are keyed by (docName, agentId) for multi-agent isolation.
   * Sets per-agent awareness (name, color, icon) on first open.
   */
  async getSession(
    docName: string,
    agentId = 'claude-1',
    identity?: AgentSessionIdentity,
  ): Promise<AgentDirectConnection> {
    if (isSystemDoc(docName)) {
      throw new Error(`Cannot create agent session for reserved doc: ${docName}`);
    }
    const key = this.sessionKey(docName, agentId);
    let dc = this.sessions.get(key);
    if (!dc) {
      dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
      const icon = iconFromClientName(identity?.clientName);
      const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(identity?.colorSeed ?? agentId);
      dc.document.awareness.setLocalState({
        user: {
          name: identity?.displayName ?? 'Claude',
          color,
          type: 'agent',
          icon,
          tabId: `agent-${agentId}`,
        },
        mode: 'idle',
      });
      this.sessions.set(key, dc);
      log.info(
        { docName, agentId },
        `[agent-session] Created session for: ${docName} / ${agentId}`,
      );
    }
    return dc;
  }

  /** Check if a session exists without creating one. */
  hasSession(docName: string, agentId = 'claude-1'): boolean {
    return this.sessions.has(this.sessionKey(docName, agentId));
  }

  /**
   * Disconnect and remove a specific agent session.
   * Clears awareness before disconnect.
   */
  async closeSession(docName: string, agentId = 'claude-1'): Promise<void> {
    const key = this.sessionKey(docName, agentId);
    const dc = this.sessions.get(key);
    if (dc) {
      dc.document.awareness.setLocalState(null);
      await dc.disconnect();
      this.sessions.delete(key);
      log.info({ docName, agentId }, `[agent-session] Closed session for: ${docName} / ${agentId}`);
    }
  }

  /** Close all sessions for a given agent (across all docs). */
  async closeAllForAgent(agentId: string): Promise<void> {
    const suffix = `\0${agentId}`;
    for (const [key, dc] of this.sessions) {
      if (key.endsWith(suffix)) {
        try {
          dc.document.awareness.setLocalState(null);
          await dc.disconnect();
          this.sessions.delete(key);
        } catch (err) {
          log.error(
            { err, agentId },
            `[agent-session] Failed to close session for agent ${agentId}`,
          );
        }
      }
    }
  }

  /** Close all sessions for a given document (all agents). */
  async closeAllForDoc(docName: string): Promise<void> {
    const prefix = `${docName}\0`;
    for (const [key, dc] of this.sessions) {
      if (key.startsWith(prefix)) {
        try {
          dc.document.awareness.setLocalState(null);
          await dc.disconnect();
          this.sessions.delete(key);
        } catch (err) {
          log.error({ err, docName }, `[agent-session] Failed to close session for doc ${docName}`);
        }
      }
    }
  }

  /** Close all sessions (optionally scoped to a single docName for backward compat). */
  async closeAll(docName?: string): Promise<void> {
    if (docName) {
      await this.closeAllForDoc(docName);
      return;
    }
    const keys = [...this.sessions.keys()];
    for (const key of keys) {
      const dc = this.sessions.get(key);
      if (!dc) continue;
      try {
        dc.document.awareness.setLocalState(null);
        await dc.disconnect();
        this.sessions.delete(key);
      } catch (err) {
        log.error({ err, key }, `[agent-session] Failed to close session: ${key}`);
      }
    }
  }
}
