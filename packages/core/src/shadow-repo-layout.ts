/**
 * Shadow-repo layout helpers — shared between CLI (read path) and server
 * (write path) per spec D22 / FR20.
 *
 * The shadow repo at `.git/openknowledge/` (integrated mode, when the project
 * has its own `.git/`) or `.openknowledge/` (standalone mode) is OK's
 * attribution journal. Its on-disk layout is a documented invariant:
 *
 *   refs/wip/<project-branch>/<writer-id>
 *
 * where `<writer-id>` has one of four recognized prefixes:
 *   - `agent-<opaque-id>`   — an agent wrote the commit
 *   - `human-<opaque-id>`   — a human wrote the commit
 *   - `upstream`            — imported from `git pull`
 *   - `server`              — internal bookkeeping
 *
 * Centralizing this layout knowledge prevents CLI/server drift: the CLI
 * consumes these utilities to parse writer IDs and resolve shadow-dir paths
 * without re-implementing the regex or path conventions.
 *
 * This file uses only `node:fs` (no other server/runtime deps) so it is safe
 * to include from any workspace package.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export type WriterClassification = 'agent' | 'human' | 'upstream' | 'server' | 'unknown';

export interface ParsedWriter {
  /** The full writer id as stored in the ref (e.g., "agent-abc123"). */
  id: string;
  classification: WriterClassification;
  /**
   * Convenience derived from `classification`:
   *   - `true`  when classification === 'agent'
   *   - `false` when classification === 'human'
   *   - `null`  when 'upstream' | 'server' | 'unknown' (indeterminate for
   *     "who edited this?" attribution)
   *
   * Agents reasoning about agent-vs-human authorship should prefer
   * `classification` over this boolean — see SPEC.md R3 on disambiguation.
   */
  isAgent: boolean | null;
}

/**
 * Canonical regex matching the writer-id portion at the end of a ref.
 * Single source of truth for the layout; any ref-parsing code in the repo
 * should flow through `parseWriterId`.
 */
const WRITER_ID_RE = /^(human-[^/]+|agent-[^/]+|upstream|server)$/;

/** Mode of the shadow-repo location; determined by whether the project has its own `.git/`. */
export type ShadowRepoMode = 'integrated' | 'standalone';

export interface ResolvedShadowDir {
  /** Absolute path where the shadow repo lives (or would live, if not yet initialized). */
  path: string;
  mode: ShadowRepoMode;
}

/**
 * Resolve the shadow-repo bare git dir's target path for a project — WITHOUT
 * checking whether it exists yet. Used by init (`packages/server/src/shadow-repo.ts`)
 * to pick where to create the repo, and internally by `getShadowRepoPath`.
 *
 * Rule matches server's historical `initShadowRepo` logic:
 *   - Integrated mode (`<projectRoot>/.git/openknowledge/`) when the project
 *     has its own `.git/` directory
 *   - Standalone mode (`<projectRoot>/.openknowledge/`) otherwise
 */
export function resolveShadowDir(projectRoot: string): ResolvedShadowDir {
  const abs = resolve(projectRoot);
  const projectGit = resolve(abs, '.git');
  try {
    if (statSync(projectGit).isDirectory()) {
      return { path: resolve(projectGit, 'openknowledge'), mode: 'integrated' };
    }
  } catch {
    // no project .git/ — fall through to standalone
  }
  return { path: resolve(abs, '.openknowledge'), mode: 'standalone' };
}

/**
 * Return the shadow-repo bare git dir's path, or `null` when the shadow repo
 * has not been initialized yet (HEAD file absent).
 *
 * Consumers that need the path regardless of existence should use
 * `resolveShadowDir` directly.
 */
export function getShadowRepoPath(projectRoot: string): string | null {
  const { path } = resolveShadowDir(projectRoot);
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
  docs: string[];
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
        Array.isArray((parsed as Record<string, unknown>).docs)
      ) {
        contributors.push(parsed as ShadowContributor);
      }
    } catch {
      // skip malformed lines
    }
  }
  return contributors;
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
  if (id.startsWith('human-')) return { id, classification: 'human', isAgent: false };
  if (id === 'upstream') return { id, classification: 'upstream', isAgent: null };
  if (id === 'server') return { id, classification: 'server', isAgent: null };
  // Unreachable given the regex, but keeps the type narrowing honest.
  return { id, classification: 'unknown', isAgent: null };
}
