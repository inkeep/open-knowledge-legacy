/**
 * Shadow-repo layout helpers — shared between CLI (read path) and server
 * (write path) per spec D22.
 *
 * The shadow repo lives at `<projectRoot>/.git/open-knowledge/` (SPEC
 * 2026-04-21-shadow-repo-single-mode). Pre-spec integrated shadows at
 * `.git/openknowledge/` (legacy path) are silently rename-migrated in-place
 * once per repo via `initShadowRepo()`. Its on-disk layout is a documented
 * invariant:
 *
 *   refs/wip/<project-branch>/<writer-id>
 *
 * where `<writer-id>` is one of the five recognized forms in the D34/D52 taxonomy
 * (dropping the legacy `human-` prefix and the opaque `server` writer):
 *   - `agent-<connectionId>`     — an MCP agent session wrote the commit
 *   - `principal-<UUID>`         — a browser-tab principal wrote the commit
 *   - `file-system`              — classified: disk reconcile (file-watcher)
 *   - `git-upstream`             — classified: HEAD-move commit import
 *   - `openknowledge-service`    — classified: service-level fallback (park, etc.)
 *
 * Legacy ref names (`server`, `human-<*>`, `upstream`) classify as `'unknown'`
 * so the D35 allowlist sweep in `initShadowRepo()` can safely delete them on
 * first run without deleting legitimate new-taxonomy refs.
 *
 * Centralizing this layout knowledge prevents CLI/server drift: the CLI
 * consumes these utilities to parse writer IDs and resolve shadow-dir paths
 * without re-implementing the regex or path conventions.
 *
 * This file uses only `node:fs` (no other server/runtime deps) so it is safe
 * to include from any workspace package.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D34 taxonomy (US-006, precedent #25). Classified system writers are non-attributable
 * actions written under a fixed writer-id. Legacy values ('human-', 'upstream',
 * 'server') are classified 'unknown' so the US-018 allowlist sweep can
 * identify and GC them without confusing them with valid attributed refs.
 *
 * Full writer-ID table:
 *   agent-<connectionId>       → 'agent'                           (MCP session)
 *   principal-<UUID>           → 'principal'                        (browser tab)
 *   file-system                → 'classified-file-system'           (disk reconcile)
 *   git-upstream               → 'classified-git-upstream'          (HEAD-move import)
 *   openknowledge-service      → 'classified-openknowledge-service' (park / service)
 *   server, human-*, upstream  → 'unknown'                          (legacy, swept by US-018)
 */
export type WriterClassification =
  | 'agent'
  | 'principal'
  | 'classified-file-system'
  | 'classified-git-upstream'
  | 'classified-openknowledge-service'
  | 'unknown';

export interface ParsedWriter {
  /** The full writer id as stored in the ref (e.g., "agent-<uuid>"). */
  id: string;
  classification: WriterClassification;
  /**
   * Convenience derived from `classification`:
   *   - `true`  when classification === 'agent'
   *   - `false` when classification === 'principal'
   *   - `null`  for system writers and unknown (indeterminate for
   *     "who edited this?" attribution)
   *
   * Prefer `classification` when reasoning about attribution.
   */
  isAgent: boolean | null;
}

/**
 * Canonical regex matching the writer-id portion at the end of a ref.
 * Single source of truth for the layout; any ref-parsing code in the repo
 * should flow through `parseWriterId`.
 *
 * D34: recognized ids — `agent-<uuid>`, `principal-<uuid>`,
 * `file-system`, `git-upstream`, `openknowledge-service`.
 * Legacy ids (`human-*`, `upstream`, `server`) do NOT match → 'unknown',
 * so they are eligible for GC by the US-018 allowlist sweep.
 */
const WRITER_ID_RE =
  /^(agent-[^/]+|principal-[^/]+|file-system|git-upstream|openknowledge-service)$/;

/**
 * Resolve the shadow-repo bare git dir's target path for a project — WITHOUT
 * checking whether it exists yet. Used by init (`packages/server/src/shadow-repo.ts`)
 * to pick where to create the repo, and internally by `getShadowRepoPath`.
 *
 * Single-mode layout: the shadow always lives at `<projectRoot>/.git/open-knowledge/`.
 * Projects without `.git/` get auto-init'd via `ensureProjectGit` before this
 * function is consulted (SPEC 2026-04-21-shadow-repo-single-mode D12/R2).
 */
export function resolveShadowDir(projectRoot: string): string {
  return resolve(projectRoot, '.git/open-knowledge');
}

/**
 * Return the shadow-repo bare git dir's path, or `null` when the shadow repo
 * has not been initialized yet (HEAD file absent).
 *
 * Consumers that need the path regardless of existence should use
 * `resolveShadowDir` directly.
 */
export function getShadowRepoPath(projectRoot: string): string | null {
  const path = resolveShadowDir(projectRoot);
  return existsSync(resolve(path, 'HEAD')) ? path : null;
}

/**
 * Return the `refs/wip/<branch>/` prefix used when enumerating per-writer
 * WIP refs for a given project branch. Callers typically concatenate this
 * with `*` (or omit the trailing slash) when passing to `git for-each-ref`.
 */
export function getWipRefPattern(branch: string): string {
  return `refs/wip/${branch}/`;
}

/**
 * A single contributor entry extracted from a WIP commit message body.
 * Matches the shape written by contributor-tracker.ts's formatContributorsFrom().
 * v is optional for backward compatibility with pre-versioned commit messages.
 */
export interface ShadowContributor {
  v?: number;
  id: string;
  name: string;
  /** Color seed for deterministic color assignment — matches presence bar color. */
  colorSeed?: string;
  docs: string[];
  /**
   * Flat per-contributor array of agent-provided summaries, oldest first.
   * Additive field (spec D9/D23) — legacy commits lack it entirely and parse
   * with `summaries: undefined`. Per D27, malformed values (non-array, or
   * array with non-string elements) drop just this field and leave the rest
   * of the contributor entry intact — a deliberate divergence from the
   * whole-entry-skip convention used for other optional fields, because
   * decorative loss (no bullets) is preferable to attribution loss.
   */
  summaries?: string[];
}

const OK_CONTRIBUTORS_PREFIX = 'ok-contributors: ';

/**
 * Parse `ok-contributors:` JSON lines from a commit message body (or full
 * raw message text via `%B`). Skips blank lines and malformed JSON silently.
 * Returns an empty array when the body is empty or contains no contributor lines.
 */
export function parseContributors(body: string): ShadowContributor[] {
  if (!body) return [];
  const contributors: ShadowContributor[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(OK_CONTRIBUTORS_PREFIX)) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(OK_CONTRIBUTORS_PREFIX.length)) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'id' in parsed &&
        typeof (parsed as Record<string, unknown>).id === 'string' &&
        'name' in parsed &&
        typeof (parsed as Record<string, unknown>).name === 'string' &&
        'docs' in parsed &&
        Array.isArray((parsed as Record<string, unknown>).docs) &&
        ((parsed as Record<string, unknown>).docs as unknown[]).every(
          (d) => typeof d === 'string',
        ) &&
        (!('colorSeed' in parsed) ||
          typeof (parsed as Record<string, unknown>).colorSeed === 'string')
      ) {
        // D27: malformed `summaries` drops just the field; the contributor
        // entry still parses. Decorative loss (no bullets) beats attribution
        // loss (missing contributor). Deliberate divergence from the
        // whole-entry-skip convention applied to other optional fields.
        const raw = parsed as Record<string, unknown>;
        if ('summaries' in raw) {
          const s = raw.summaries;
          if (!Array.isArray(s) || !s.every((x) => typeof x === 'string')) {
            delete raw.summaries;
          }
        }
        contributors.push(parsed as ShadowContributor);
      }
    } catch {
      // skip malformed lines
    }
  }
  return contributors;
}

// ─── In-memory checkpoint body metadata (bridge-correctness SPEC R7d) ────────

/** Prefix for the versioned checkpoint-metadata body line. */
const OK_CHECKPOINT_PREFIX = 'ok-checkpoint-v1: ';

/**
 * Kind-discriminated checkpoint metadata parsed from the `ok-checkpoint-v1:`
 * body line. The body line coexists with `ok-contributors:` lines —
 * `parseContributors` skips unknown prefixes, so the two channels do not
 * interfere (Q7 verified).
 *
 * `docName` and `size` are carried inline so the `/api/rescue` read path can
 * enumerate checkpoints via a single batched `git log` without a per-ref
 * `git ls-tree` fan-out (bridge-correctness review iteration 5). They are
 * optional in the parsed shape for backward-compatible reads: pre-enrichment
 * commits returned `null` for both and the rescue list fell back to
 * `ls-tree`. New writes (`saveInMemoryCheckpoint`) always populate them.
 */
export type ParsedCheckpoint =
  | {
      kind: 'bridge-merge-loss';
      docName: string | null;
      size: number | null;
      metadata: { lostSubstrings: string[] };
    }
  | {
      kind: 'external-change-rescue';
      docName: string | null;
      size: number | null;
      metadata: { incomingDiskSha: string };
    };

/**
 * Parse the `ok-checkpoint-v1:` metadata line from a commit message body.
 * Returns `null` when the line is absent, malformed JSON, has an unknown
 * `kind`, or has a metadata shape that doesn't match the expected kind.
 *
 * Parallel to `parseContributors` in spirit — silent fallback, no throws —
 * so TimelinePanel rendering can gracefully degrade to 'Save Version'
 * rendering for checkpoints without this body line.
 */
export function parseCheckpoint(body: string): ParsedCheckpoint | null {
  if (!body) return null;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(OK_CHECKPOINT_PREFIX)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed.slice(OK_CHECKPOINT_PREFIX.length));
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const obj = parsed as {
      kind?: unknown;
      metadata?: unknown;
      docName?: unknown;
      size?: unknown;
    };
    const kind = obj.kind;
    const metadata = obj.metadata;
    if (metadata === null || typeof metadata !== 'object') return null;
    const docName = typeof obj.docName === 'string' ? obj.docName : null;
    const size = typeof obj.size === 'number' && Number.isFinite(obj.size) ? obj.size : null;
    if (kind === 'bridge-merge-loss') {
      const m = metadata as { lostSubstrings?: unknown };
      if (Array.isArray(m.lostSubstrings) && m.lostSubstrings.every((s) => typeof s === 'string')) {
        return {
          kind: 'bridge-merge-loss',
          docName,
          size,
          metadata: { lostSubstrings: m.lostSubstrings as string[] },
        };
      }
      return null;
    }
    if (kind === 'external-change-rescue') {
      const m = metadata as { incomingDiskSha?: unknown };
      if (typeof m.incomingDiskSha === 'string') {
        return {
          kind: 'external-change-rescue',
          docName,
          size,
          metadata: { incomingDiskSha: m.incomingDiskSha },
        };
      }
      return null;
    }
    return null;
  }
  return null;
}

/**
 * Format the `ok-checkpoint-v1:` body line for a given kind+metadata. Produces
 * exactly one line (no trailing newline). Consumers embed it inside a full
 * commit message body as a sibling to `ok-contributors:` lines.
 *
 * Exported so `saveInMemoryCheckpoint` in the server package can share this
 * serialization rule with the parser — see precedent #4 (shared computation).
 */
export function formatCheckpointBodyLine(parsed: ParsedCheckpoint): string {
  const payload: {
    kind: ParsedCheckpoint['kind'];
    docName?: string;
    size?: number;
    metadata: ParsedCheckpoint['metadata'];
  } = {
    kind: parsed.kind,
    metadata: parsed.metadata,
  };
  if (parsed.docName !== null) payload.docName = parsed.docName;
  if (parsed.size !== null) payload.size = parsed.size;
  return `${OK_CHECKPOINT_PREFIX}${JSON.stringify(payload)}`;
}

// ─── ok-actor: body line (US-015, FR-8, D13) ─────────────────────────────────

/**
 * Structured actor tuple written as `ok-actor:` JSON body line in every
 * shadow-repo commit. Makes the repo queryable without a session registry.
 * v:1 is the sole schema version; bump v to introduce breaking changes.
 */
export interface OkActorEntry {
  v: 1;
  /** Long-lived principal id (US-024 stub — null until human-browser auth wired). */
  principal: string | null;
  /** Per-session agent connection id, e.g. "conn-abc123". Null for classified writers. */
  agent_session: string | null;
  /** Claude model family, e.g. "claude-3-5-sonnet". Null when not known. */
  agent_type: string | null;
  /** MCP client name (e.g. "claude-code"). Null when not known. */
  client_name: string | null;
  /** MCP client version. Null when not known. */
  client_version: string | null;
  /** User-supplied label for this session. Null when absent. */
  label: string | null;
  /** Human-readable display name shown in attribution UI. */
  display_name: string;
  /** Color seed for deterministic color assignment — matches presence bar. */
  color_seed: string;
  /** Documents touched in this drain cycle. */
  docs: string[];
}

const OK_ACTOR_PREFIX = 'ok-actor: ';

/**
 * Format an `ok-actor:` JSON body line. Produces exactly one line (no trailing newline).
 * Pair with `parseOkActor` at the read path.
 */
export function formatOkActor(entry: OkActorEntry): string {
  return `${OK_ACTOR_PREFIX}${JSON.stringify(entry)}`;
}

/**
 * Parse the first `ok-actor:` JSON body line from a commit message body.
 * Returns `null` when the line is absent, malformed, or fails schema validation
 * (v must be 1; display_name and docs must be present).
 */
export function parseOkActor(body: string): OkActorEntry | null {
  if (!body) return null;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(OK_ACTOR_PREFIX)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed.slice(OK_ACTOR_PREFIX.length));
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    // Schema validation: v must be 1, display_name and docs required
    if (obj.v !== 1) return null;
    if (!('display_name' in obj) || typeof obj.display_name !== 'string') return null;
    if (!('docs' in obj) || !Array.isArray(obj.docs)) return null;
    return {
      v: 1,
      principal: typeof obj.principal === 'string' ? obj.principal : null,
      agent_session: typeof obj.agent_session === 'string' ? obj.agent_session : null,
      agent_type: typeof obj.agent_type === 'string' ? obj.agent_type : null,
      client_name: typeof obj.client_name === 'string' ? obj.client_name : null,
      client_version: typeof obj.client_version === 'string' ? obj.client_version : null,
      label: typeof obj.label === 'string' ? obj.label : null,
      display_name: obj.display_name,
      color_seed: typeof obj.color_seed === 'string' ? obj.color_seed : 'unknown',
      docs: (obj.docs as unknown[]).filter((d): d is string => typeof d === 'string'),
    };
  }
  return null;
}

// ─── Subject-prefix scheme (D53, FR-13) ──────────────────────────────────────

/** Format a `wip:` subject from docs touched in the drain cycle. */
export function formatWipSubject(docs: string[]): string {
  if (docs.length === 0) return 'wip: auto-save';
  if (docs.length === 1) return `wip: ${docs[0]}`;
  return `wip: ${docs.length} docs`;
}

/** Format a `reconcile:` subject for file-watcher-triggered reconcile writes (D53). */
export function formatReconcileSubject(docName: string): string {
  return `reconcile: ${docName}`;
}

/** Format a `rollback:` subject for rollback-to-version writes (D53). */
export function formatRollbackSubject(docName: string, sha: string): string {
  return `rollback: ${docName} to ${sha.slice(0, 7)}`;
}

/** Format a `park:` subject for branch-switch park commits (D53). */
export function formatParkSubject(oldBranch: string, newBranch: string): string {
  return `park: ${oldBranch} -> ${newBranch}`;
}

/** Format a `rename:` subject for managed-rename writes (D53). */
export function formatRenameSubject(oldName: string, newName: string): string {
  return `rename: ${oldName} -> ${newName}`;
}

/** Format a `checkpoint:` subject for save-version and safety-checkpoint commits (D53). */
export function formatCheckpointSubject(message: string): string {
  return `checkpoint: ${message}`;
}

/** Format an `import:` subject for upstream-import commits (D53). */
export function formatImportSubject(oldHead: string | null, newHead: string): string {
  return oldHead
    ? `import: from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
    : `import: initial at ${newHead.slice(0, 8)}`;
}

/**
 * Classify a writer id using the documented prefix convention. Unknown
 * prefixes (legacy commits, external git operations) classify as 'unknown'
 * and `isAgent` is `null` — agents reasoning about attribution should
 * treat that as indeterminate, not as "not an agent."
 */
export function parseWriterId(id: string): ParsedWriter {
  if (!WRITER_ID_RE.test(id)) {
    return { id, classification: 'unknown', isAgent: null };
  }
  if (id.startsWith('agent-')) return { id, classification: 'agent', isAgent: true };
  if (id.startsWith('principal-')) return { id, classification: 'principal', isAgent: false };
  if (id === 'file-system') return { id, classification: 'classified-file-system', isAgent: null };
  if (id === 'git-upstream')
    return { id, classification: 'classified-git-upstream', isAgent: null };
  if (id === 'openknowledge-service')
    return { id, classification: 'classified-openknowledge-service', isAgent: null };
  // Unreachable given the regex, but keeps the type narrowing honest.
  return { id, classification: 'unknown', isAgent: null };
}
