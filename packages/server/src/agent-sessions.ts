/**
 * Agent session management — DirectConnection lifecycle.
 *
 * Each agent gets a persistent DirectConnection to the Hocuspocus server.
 * Sessions track awareness (presence bar shows agent).
 *
 * F1: Each session creates its own frozen LocalTransactionOrigin at birth
 * (precedent #1, D2). All agent write paths call
 * `session.dc.document.transact(fn, session.origin)` — never `dc.transact(fn)`
 * or the shared `AGENT_WRITE_ORIGIN` constant (D32 STOP rule).
 *
 * D30: getSession uses an in-flight promise dedup map so concurrent first-calls
 * share one pending openDirectConnection call and produce exactly one session.
 *
 * US-008: each session creates a Y.UndoManager tracking [Y.Text, metaMap, flashMap]
 * via session.origin. session.undoOrigin is the placeholder origin for the future
 * V0-14 applyAgentUndo path; captureTransaction excludes it from the UM stack
 * to prevent undo-of-undo cycles (D25, D24, D21 defense-in-depth).
 */
import type { DirectConnection, Document, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  applyFastDiff,
  colorFromSeed,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';

export { colorFromSeed } from '@inkeep/open-knowledge-core';

import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { isSystemDoc } from './cc1-broadcast.ts';
import { getLogger } from './logger.ts';
import { mdManager, schema } from './md-manager.ts';
import type { PairedWriteOrigin } from './server-observers.ts';

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
 * Agent write origin — typed `PairedWriteOrigin` (bridge-correctness SPEC §6 R0,
 * precedent #1 extension, review iteration 5 compile-time gate).
 *
 * LEGACY EXPORT — kept for unit tests that directly test observer behavior
 * against a paired-write origin. Production agent-write paths MUST use
 * `session.origin` (per-session frozen origin from getSession) instead of
 * this shared constant.
 *
 * `skipStoreHooks: false` — persistence SHOULD fire after agent writes so
 * content reaches disk through the normal debounce pipeline.
 *
 * `paired: true` — the caller atomically writes BOTH Y.XmlFragment and Y.Text
 * inside one `doc.transact(..., AGENT_WRITE_ORIGIN)` block (see
 * `applyAgentMarkdownWrite` below). The `satisfies PairedWriteOrigin`
 * annotation forces the literal to carry the marker; the compile-time gate
 * catches omissions before they reach runtime (T8/T9/T10 regression-class
 * prevention).
 */
export const AGENT_WRITE_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'agent-write', paired: true },
} as const satisfies PairedWriteOrigin;

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
 * (typically session.origin from a per-session SessionRecord).
 *
 * @see PRECEDENTS.md precedent #9 (minimize CRDT mutation in sync bridges)
 * @see PRECEDENTS.md precedent #10 (XmlFragment-authoritative, Y.Text mirrors)
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
    const currentJson = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
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
    const canonicalBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
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

/**
 * XmlFragment-authoritative agent undo (V0-14, US-009, precedent #10, D4).
 *
 * Calls session.um.undo() INSIDE an outer doc.transact(..., session.undoOrigin)
 * so Y.js merges the UM's internal transaction into the outer. The whole
 * operation fires under undoOrigin (paired: true) → Observer A/B short-circuit.
 *
 * After undo, Y.Text is in the desired post-undo state. We apply the
 * XmlFragment-authoritative composition pattern: parse Y.Text markdown,
 * apply to XmlFragment via updateYFragment (structural diff), mirror
 * Y.Text via applyFastDiff. All atomic in one transact.
 *
 * scope 'last': undo one UM stack item.
 * scope 'session': undo entire UM stack.
 *
 * @see PRECEDENTS.md precedent #10 (XmlFragment-authoritative writes)
 */
export function applyAgentUndo(session: SessionRecord, scope: 'last' | 'session'): void {
  const { dc, um, undoOrigin } = session;
  const document = dc.document;
  const xmlFragment = document.getXmlFragment('default');
  const ytext = document.getText('source');
  const metaMap = document.getMap('metadata');

  // F1 (D4): wrap undo + composition in one outer transact under undoOrigin.
  // Y.js merges um.undo()'s nested transact into this outer → fires under undoOrigin.
  // isPairedWriteOrigin(undoOrigin) === true → Observer A/B short-circuit on settle.
  document.transact(() => {
    if (scope === 'last') {
      if (um.undoStack.length === 0) return;
      um.undo();
    } else {
      while (um.undoStack.length > 0) {
        um.undo();
      }
    }

    // Post-undo: Y.Text has the desired content. Apply XmlFragment-authoritative
    // composition so XmlFragment matches (precedent #10, #12).
    const fullMd = ytext.toString();
    const { body, frontmatter: newFm } = stripFrontmatter(fullMd);

    const parsedJson = mdManager.parseWithFallback(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    const existingFm = (metaMap.get('frontmatter') as string | undefined) ?? '';
    const finalFm = newFm || existingFm;
    if (newFm && newFm !== existingFm) {
      metaMap.set('frontmatter', finalFm);
    }

    const canonicalBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    const canonicalFull = prependFrontmatter(finalFm, canonicalBody);
    applyFastDiff(ytext, ytext.toString(), canonicalFull);
  }, undoOrigin);
}

export interface AgentSessionIdentity {
  displayName: string;
  colorSeed: string;
  clientName?: string;
  principalId?: string;
}

/**
 * Per-session state bundle — F1 (D2, precedent #1) + US-008 (D25/D24/D21).
 *
 * Every write path must use `session.dc.document.transact(fn, session.origin)`
 * (D32 STOP rule). Never call `session.dc.transact(fn)` or pass the shared
 * `AGENT_WRITE_ORIGIN` constant to per-session writes.
 *
 * `um` tracks [Y.Text, metaMap, flashMap] under `session.origin`; writes under
 * `session.undoOrigin` (V0-14 undo path) are excluded via captureTransaction.
 */
export interface SessionRecord {
  dc: AgentDirectConnection;
  /** Per-session frozen PairedWriteOrigin — unique per session (D2, D23). */
  origin: PairedWriteOrigin;
  /** Per-session undo write origin — V0-14 (US-009, D4). Paired so Observer A/B short-circuit. */
  undoOrigin: PairedWriteOrigin;
  /** Per-session UndoManager scoped to [Y.Text, metaMap, flashMap] (US-008, D25). */
  um: Y.UndoManager;
  agentId: string;
  docName: string;
}

/**
 * Create a frozen per-session PairedWriteOrigin (F1, D2, D23, precedent #24(b)).
 * Object-identity-unique per call; deep-frozen via Object.freeze on both
 * the context and the outer object. The returned object is the Y.UndoManager
 * trackedOrigins key for this session — a reconstructed object with the same
 * shape is NOT equivalent (Set-identity match, not structural equality).
 */
function createSessionOrigin(
  sessionId: string,
  agentType?: string,
  principalId?: string,
): PairedWriteOrigin {
  // precedent #1: typed transaction origin object (not string).
  // D23: deep-freeze both context and outer object so accidental mutation throws.
  const context: Record<string, unknown> & { origin: string; paired: true } = {
    origin: 'agent-write',
    paired: true as const,
    session_id: sessionId,
  };
  if (agentType !== undefined) context.agent_type = agentType;
  if (principalId !== undefined) context.principal = principalId;
  Object.freeze(context);
  const origin: PairedWriteOrigin = {
    source: 'local',
    skipStoreHooks: false,
    context,
  };
  Object.freeze(origin);
  return origin;
}

/**
 * Create a frozen per-session PairedWriteOrigin for V0-14 undo writes (US-009, D4).
 * Object-identity-unique per call; deep-frozen (D23). isPairedWriteOrigin returns true
 * so Observer A/B short-circuit when the undo+composition transact settles.
 * captureTransaction: tr => tr.origin !== session.undoOrigin prevents undo-of-undo stacking.
 */
function createUndoOrigin(sessionId: string, agentType?: string): PairedWriteOrigin {
  // precedent #1: typed transaction origin; paired: true so observers short-circuit (D4).
  const context: Record<string, unknown> & { origin: string; paired: true } = {
    origin: 'agent-undo',
    paired: true as const,
    session_id: sessionId,
  };
  if (agentType !== undefined) context.agent_type = agentType;
  Object.freeze(context);
  const origin: PairedWriteOrigin = {
    source: 'local',
    skipStoreHooks: false,
    context,
  };
  Object.freeze(origin);
  return origin;
}

export class AgentSessionManager {
  private sessions = new Map<string, SessionRecord>();
  /** D30: in-flight promise dedup — concurrent first-calls share one pending openDirectConnection. */
  private pendingSessions = new Map<string, Promise<SessionRecord>>();
  private hocuspocus: Hocuspocus;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  private sessionKey(docName: string, agentId: string): string {
    return `${docName}\0${agentId}`;
  }

  /**
   * Get or create a per-agent SessionRecord (DirectConnection + per-session origin).
   *
   * F1 (D2): each new session creates a frozen LocalTransactionOrigin via
   * `createSessionOrigin`. The returned session.origin is object-identity-unique.
   *
   * D30: concurrent first-calls for the same (docName, agentId) share one
   * pending openDirectConnection promise — exactly one DirectConnection created.
   */
  async getSession(
    docName: string,
    agentId = 'claude-1',
    identity?: AgentSessionIdentity,
  ): Promise<SessionRecord> {
    if (isSystemDoc(docName)) {
      throw new Error(`Cannot create agent session for reserved doc: ${docName}`);
    }
    const key = this.sessionKey(docName, agentId);

    const existing = this.sessions.get(key);
    if (existing) return existing;

    // D30: reuse in-flight promise if a concurrent first-call is already pending
    const inflight = this.pendingSessions.get(key);
    if (inflight) return inflight;

    const promise = this._createSession(docName, agentId, identity);
    this.pendingSessions.set(key, promise);
    try {
      const session = await promise;
      this.sessions.set(key, session);
      return session;
    } finally {
      this.pendingSessions.delete(key);
    }
  }

  private async _createSession(
    docName: string,
    agentId: string,
    identity: AgentSessionIdentity | undefined,
  ): Promise<SessionRecord> {
    const agentType = identity?.clientName;
    // F1 (D2): per-session frozen origin — object-identity-unique
    const origin = createSessionOrigin(agentId, agentType, identity?.principalId);
    // US-008: per-session undo origin — V0-14 placeholder, excluded from UM stack
    const undoOrigin = createUndoOrigin(agentId, agentType);

    // D32: thread session context to openDirectConnection so Hocuspocus
    // extensions (e.g. onAuthenticate) can resolve the session's identity.
    const sessionContext = {
      session_id: agentId,
      ...(agentType !== undefined ? { agent_type: agentType } : {}),
      ...(identity?.clientName !== undefined ? { client_name: identity.clientName } : {}),
      ...(identity?.principalId !== undefined ? { principalId: identity.principalId } : {}),
    };

    const dc = (await this.hocuspocus.openDirectConnection(
      docName,
      sessionContext,
    )) as AgentDirectConnection;

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

    // US-008 (D25, D24, D21): per-session UndoManager across Y.Text + metaMap + flashMap.
    // trackedOrigins uses object identity — only transactions under session.origin are stacked.
    // captureTransaction excludes undoOrigin writes to prevent undo-of-undo cycles.
    // ignoreRemoteMapChanges: true — remote agent map updates do not trigger undo eligibility.
    const um = new Y.UndoManager(
      [
        dc.document.getText('source'),
        dc.document.getMap('metadata'),
        dc.document.getMap('agent-flash'),
      ],
      {
        trackedOrigins: new Set([origin]),
        captureTimeout: 500,
        captureTransaction: (tr: { origin: unknown }) => tr.origin !== undoOrigin,
        ignoreRemoteMapChanges: true,
      },
    );

    log.info({ docName, agentId }, `[agent-session] Created session for: ${docName} / ${agentId}`);

    return { dc, origin, undoOrigin, um, agentId, docName };
  }

  /** Check if a session exists without creating one. */
  hasSession(docName: string, agentId = 'claude-1'): boolean {
    return this.sessions.has(this.sessionKey(docName, agentId));
  }

  /**
   * Disconnect and remove a specific agent session.
   * Clears awareness + destroys UM before disconnect (D26: dc.disconnect() is the teardown
   * primitive; explicit um.destroy() releases UM observers eagerly before Hocuspocus unloads
   * the Y.Doc — UM also auto-destroys on doc.on('destroy') per Q47/Q48).
   */
  async closeSession(docName: string, agentId = 'claude-1'): Promise<void> {
    const key = this.sessionKey(docName, agentId);
    const session = this.sessions.get(key);
    if (session) {
      session.dc.document.awareness.setLocalState(null);
      session.um.destroy();
      await session.dc.disconnect();
      this.sessions.delete(key);
      log.info({ docName, agentId }, `[agent-session] Closed session for: ${docName} / ${agentId}`);
    }
  }

  /** Close all sessions for a given agent (across all docs). */
  async closeAllForAgent(agentId: string): Promise<void> {
    const suffix = `\0${agentId}`;
    for (const [key, session] of this.sessions) {
      if (key.endsWith(suffix)) {
        try {
          session.dc.document.awareness.setLocalState(null);
          session.um.destroy();
          await session.dc.disconnect();
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
    for (const [key, session] of this.sessions) {
      if (key.startsWith(prefix)) {
        try {
          session.dc.document.awareness.setLocalState(null);
          session.um.destroy();
          await session.dc.disconnect();
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
      const session = this.sessions.get(key);
      if (!session) continue;
      try {
        session.dc.document.awareness.setLocalState(null);
        session.um.destroy();
        await session.dc.disconnect();
        this.sessions.delete(key);
      } catch (err) {
        log.error({ err, key }, `[agent-session] Failed to close session: ${key}`);
      }
    }
  }
}
