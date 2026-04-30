/**
 * Agent identity validation — the canonical character class for a valid
 * agentId across every server-side entry point.
 *
 * Enforced identically at three surfaces:
 *   1. HTTP write body — `extractAgentIdentity` in `api-extension.ts` strips
 *      invalid agentIds to `undefined` (falls back to the default id).
 *   2. Keepalive WS URL — `parseKeepaliveAgentId` in `boot.ts` returns `null`
 *      on invalid values; the close handler then no-ops rather than firing
 *      `clearPresence` with attacker-controlled bytes.
 *   3. Internal test harnesses.
 *
 * The constraint protects both correctness (keeps the `agent-<id>`
 * broadcaster key a safe map key) AND observability (pino log fields +
 * structured events never ingest raw URL-query bytes — no log injection
 * via CR/LF/control chars that some transports would pass through).
 *
 * Central ownership here prevents drift between the write path and the
 * cleanup path. See review pass 2 finding #2 for the motivating case:
 * an unvalidated keepalive agentId could be used from an unauthenticated
 * peer to force-evict another agent's presence entry.
 */
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';

export const AGENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a raw agentId string. Returns the input iff it matches
 * `AGENT_ID_RE`; otherwise returns `null`. Never throws.
 */
export function validateAgentId(rawAgentId: string | undefined | null): string | null {
  if (typeof rawAgentId !== 'string' || rawAgentId.length === 0) return null;
  if (!AGENT_ID_RE.test(rawAgentId)) return null;
  return rawAgentId;
}

/**
 * Translate a raw agentId (sent via HTTP body `agentId` field or via
 * keepalive WS URL `?agentId=`) into the broadcaster-map key used by
 * `AgentPresenceBroadcaster.setPresence` / `clearPresence`.
 *
 * The `agent-` prefix is the server's internal convention for the
 * presence map. Keeping the transform centralized here (rather than
 * inlining `` `agent-${rawAgentId}` `` at call sites) ensures the write
 * path, the cleanup path, and test harnesses all produce identical keys.
 * The "STOP — the agent- prefix convention" section in AGENTS.md /
 * CLAUDE.md names this helper explicitly for that reason.
 *
 * NOTE: callers are responsible for validating the raw id first via
 * `validateAgentId`. This helper does not re-validate because every
 * load-bearing call site either validated upstream (keepalive parse) or
 * has already committed to writing the key (HTTP write handlers — the
 * validation happens at body parse time).
 */
export function toBroadcasterKey(rawAgentId: string): string {
  if (rawAgentId.startsWith('agent-')) return rawAgentId;
  return `agent-${rawAgentId}`;
}

/**
 * Derive the bounded-cardinality `agent_type` from a `clientInfo.name`
 * string. Mirrors the registry used by `iconFromClientName` on the client
 * side. Unknown clients map to `'bot'`. Used by every actor-identity
 * resolver (`extractAgentIdentity`, `extractActorIdentity`, agent-write
 * span attributes) so the type tag stays consistent across surfaces.
 */
export function resolveAgentType(clientName: string | undefined): string {
  if (!clientName) return 'bot';
  const lower = clientName.toLowerCase();
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('cline')) return 'cline';
  if (lower.includes('windsurf')) return 'windsurf';
  return 'bot';
}

/**
 * Cap on `agentName` / `colorSeed` / sanitized identity fields. Bounded
 * cardinality for log indexing + prevents pathological multi-MB values
 * from a malicious body. Owned here so write/rename/rollback handlers
 * agree on the bound.
 */
export const AGENT_NAME_MAX_LEN = 128;

interface AgentBodyFields {
  /** Raw agentId passed by the caller, validated against `AGENT_ID_RE`.
   *  `undefined` when absent or invalid. */
  rawAgentId: string | undefined;
  /** Broadcaster-map key (`agent-<id>`). Defined iff `rawAgentId` is defined. */
  writerId: string | undefined;
  /** Sanitized `agentName`, defaulting to `'Claude'` when absent. */
  displayName: string;
  /** Sanitized `clientName`, or `undefined` when absent. */
  clientName: string | undefined;
  /** Sanitized `clientVersion`, or `undefined` when absent. */
  clientVersion: string | undefined;
  /** Sanitized `label`, or `undefined` when absent. */
  label: string | undefined;
  /** Sanitized + capped `colorSeed` from the body, or `undefined` when absent.
   *  Callers apply their own fallback (raw agentId, broadcaster key, etc.). */
  colorSeed: string | undefined;
}

/**
 * Parse the agent-identity fields off an HTTP write body. Centralized so
 * `extractAgentIdentity` (write handlers, closure-scoped) and
 * `extractActorIdentity` (rename/rollback, module-scoped) can't drift
 * apart on validation, sanitization, or the cardinality cap.
 *
 * Each caller adds its own routing on top: `extractAgentIdentity` defaults
 * absent agentIds to `'claude-1'`; `extractActorIdentity` returns a
 * discriminated union with `getPrincipal()` fallback.
 */
export function parseAgentBodyFields(body: Record<string, unknown>): AgentBodyFields {
  const rawAgentId =
    typeof body.agentId === 'string' && body.agentId.length > 0 && AGENT_ID_RE.test(body.agentId)
      ? body.agentId
      : undefined;

  const writerId = rawAgentId !== undefined ? toBroadcasterKey(rawAgentId) : undefined;

  const displayName =
    typeof body.agentName === 'string' ? sanitizeGitIdentity(body.agentName) : 'Claude';

  const clientName =
    typeof body.clientName === 'string' ? sanitizeGitIdentity(body.clientName) : undefined;
  const clientVersion =
    typeof body.clientVersion === 'string' ? sanitizeGitIdentity(body.clientVersion) : undefined;
  const label = typeof body.label === 'string' ? sanitizeGitIdentity(body.label) : undefined;

  const colorSeed =
    typeof body.colorSeed === 'string' && body.colorSeed.length > 0
      ? body.colorSeed.slice(0, AGENT_NAME_MAX_LEN)
      : undefined;

  return { rawAgentId, writerId, displayName, clientName, clientVersion, label, colorSeed };
}
