import type { Principal } from '@inkeep/open-knowledge-core';
import { AGENT_ID_RE, resolveAgentType, toBroadcasterKey } from './agent-id.ts';
import { type NormalizedSummary, normalizeSummary } from './agent-write-summary.ts';
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';

const AGENT_NAME_MAX_LEN = 128;

interface ActorMetadata {
  principalId?: string;
  agentType?: string;
  clientName?: string;
  clientVersion?: string;
  label?: string;
}

type ActorIdentity =
  | {
      kind: 'agent';
      writerId: string;
      displayName: string;
      colorSeed: string;
      clientName: string | undefined;
      clientVersion: string | undefined;
      label: string | undefined;
      actor: ActorMetadata;
      summary: NormalizedSummary;
    }
  | {
      kind: 'principal';
      writerId: string;
      displayName: string;
      colorSeed: string;
      actor: ActorMetadata;
      summary: NormalizedSummary;
    }
  | {
      kind: 'anonymous';
      summary: NormalizedSummary;
    }
  | { kind: 'invalid-summary' };

/**
 * Identity boundary for rename + rollback handlers.
 *
 * Routing:
 *   body.agentId valid + non-empty → 'agent'    (writerId = agent-<id>)
 *   no agentId, getPrincipal() → principal     → 'principal' (writerId = principal-<uuid>)
 *   no agentId, getPrincipal() → null         → 'anonymous' (no contributor recorded)
 *
 * The 'agent' branch ALSO populates `actor.principalId` from getPrincipal() so the
 * agent-on-behalf-of-principal audit trail mirrors `buildAgentActor` for non-rename
 * writes. Body-supplied `principalId` is intentionally never read — server's
 * getPrincipal() is the only source of principal identity (HTTP body is unauthenticated).
 */
export function extractActorIdentity(
  body: Record<string, unknown>,
  getPrincipal: (() => Principal | null) | undefined,
): ActorIdentity {
  const summary = normalizeSummary(body.summary);
  if (summary.kind === 'invalid') {
    return { kind: 'invalid-summary' };
  }

  const rawAgentId: string | undefined =
    typeof body.agentId === 'string' && body.agentId.length > 0 && AGENT_ID_RE.test(body.agentId)
      ? body.agentId
      : undefined;

  const principal = getPrincipal?.() ?? null;

  if (rawAgentId !== undefined) {
    const writerId = toBroadcasterKey(rawAgentId);
    const displayName =
      typeof body.agentName === 'string' ? sanitizeGitIdentity(body.agentName) : 'Claude';
    let clientName = typeof body.clientName === 'string' ? body.clientName : undefined;
    if (clientName !== undefined) clientName = sanitizeGitIdentity(clientName);
    let clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion : undefined;
    if (clientVersion !== undefined) clientVersion = sanitizeGitIdentity(clientVersion);
    let label = typeof body.label === 'string' ? body.label : undefined;
    if (label !== undefined) label = sanitizeGitIdentity(label);
    const colorSeed =
      typeof body.colorSeed === 'string' && body.colorSeed.length > 0
        ? body.colorSeed.slice(0, AGENT_NAME_MAX_LEN)
        : rawAgentId;
    const actor: ActorMetadata = {
      principalId: principal?.id,
      agentType: resolveAgentType(clientName),
      clientName,
      clientVersion,
      label,
    };
    return {
      kind: 'agent',
      writerId,
      displayName,
      colorSeed,
      clientName,
      clientVersion,
      label,
      actor,
      summary,
    };
  }

  if (principal) {
    return {
      kind: 'principal',
      writerId: principal.id,
      displayName: principal.display_name,
      colorSeed: principal.id,
      actor: { principalId: principal.id },
      summary,
    };
  }

  return { kind: 'anonymous', summary };
}
