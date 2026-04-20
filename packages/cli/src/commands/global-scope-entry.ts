/**
 * Shared helpers for global-scope MCP editor targets (Claude Desktop + Windsurf).
 *
 * Global-scope targets write into a single user-level JSON file that persists
 * across projects. To let one user run `open-knowledge init` in multiple
 * project directories without clobbering earlier entries, we:
 *
 *   (a) bake `--cwd <abs-path>` into each entry's `args`, and
 *   (b) qualify the server key with a slugified project basename
 *       (`open-knowledge-<slug(basename(cwd))>`).
 *
 * This module is pure and deterministic — no filesystem writes, no prompts.
 * `realpathSync` is called as a lookup only (caller's cwd vs. existing entries'
 * --cwd values); ENOENT falls back to string equality so stale entries pointing
 * at deleted paths don't crash the resolver.
 *
 * Spec: specs/2026-04-17-claude-desktop-init-cwd/SPEC.md
 *   D1  project-qualified keys
 *   D10 disambiguation upper bound (1000)
 *   D11 slugify rule
 *   D12 realpath-normalize both sides, ENOENT → string equality
 *   D17 legacy detection gate (exact `open-knowledge` key + no `--cwd`)
 */
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { isObject } from '../utils/is-object.ts';
import type { ResolvedServerKey } from './editors.ts';

const MCP_SERVER_KEY_PREFIX = 'open-knowledge';
const LEGACY_SERVER_KEY = 'open-knowledge';
const DEFAULT_SLUG_FALLBACK = 'project';
const DISAMBIGUATION_UPPER_BOUND = 1000;

/**
 * Slugify a basename into a key-safe kebab-ASCII form (D11 LOCKED).
 *
 *   lowercase → replace `[^a-z0-9]+` with `-` → trim leading/trailing `-`
 *   empty result falls back to `'project'`
 */
export function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? DEFAULT_SLUG_FALLBACK : slug;
}

/**
 * Extract the value immediately following `--cwd` in an `args` array.
 * Returns undefined when args is not an array, `--cwd` is absent, or it's
 * the trailing element with no successor.
 */
export function getCwdFromArgs(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined;
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--cwd') {
      const next = args[i + 1];
      return typeof next === 'string' ? next : undefined;
    }
  }
  return undefined;
}

/**
 * Wrap `realpathSync` with an ENOENT fallback — returns the original path if
 * the path cannot be resolved (e.g., a stale entry pointing at a deleted dir).
 * Any other error re-throws.
 */
export function realpathOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return p;
    }
    throw err;
  }
}

function isLegacyWindsurfEntry(entry: unknown): boolean {
  if (!isObject(entry)) return false;
  return getCwdFromArgs(entry.args) === undefined;
}

/**
 * Resolve the server key for a global-scope target.
 *
 * Algorithm:
 *   1. Match step: iterate existing `open-knowledge*` keys, comparing
 *      realpath-normalized `--cwd` values to the caller's cwd. First match
 *      wins and returns `{ key, existingEntry }`.
 *   2. Legacy step (only when opts.detectLegacy === true): if an entry with
 *      exact key `'open-knowledge'` exists AND its args contain NO `--cwd`,
 *      return a migration result — the caller will delete the old key and
 *      write a new project-qualified one.
 *   3. Default key step: compute `open-knowledge-<slug(basename(cwd))>`.
 *   4. Disambiguation step: if the default key is taken by an entry with a
 *      different cwd, suffix `-2`, `-3`, … up to `-1000`; on collision return
 *      `{ key, disambiguatedFrom }` where `disambiguatedFrom` is the conflicting
 *      key at the default position.
 *
 * Throws when all 1000 disambiguation suffixes are taken (D10 upper bound).
 */
export function globalScopeResolveServerKey(
  existingServers: Record<string, unknown>,
  cwd: string,
  opts: { detectLegacy?: boolean } = {},
): ResolvedServerKey {
  const detectLegacy = opts.detectLegacy === true;
  const normalizedCwd = realpathOrSelf(cwd);

  // 1. Match step — any open-knowledge* key whose --cwd realpath-matches.
  for (const [key, entry] of Object.entries(existingServers)) {
    if (!key.startsWith(MCP_SERVER_KEY_PREFIX)) continue;
    if (!isObject(entry)) continue;
    const entryCwd = getCwdFromArgs(entry.args);
    if (entryCwd === undefined) continue;
    if (realpathOrSelf(entryCwd) === normalizedCwd) {
      return { key, existingEntry: entry };
    }
  }

  // 2. Legacy step — exact key 'open-knowledge' with NO --cwd (Windsurf only).
  if (detectLegacy) {
    const legacy = existingServers[LEGACY_SERVER_KEY];
    if (legacy !== undefined && isLegacyWindsurfEntry(legacy)) {
      const projectSlug = slugify(basename(normalizedCwd));
      return {
        key: `${MCP_SERVER_KEY_PREFIX}-${projectSlug}`,
        existingEntry: legacy,
        migratedFromKey: LEGACY_SERVER_KEY,
      };
    }
  }

  // 3. Default key step.
  const projectSlug = slugify(basename(normalizedCwd));
  const defaultKey = `${MCP_SERVER_KEY_PREFIX}-${projectSlug}`;
  if (existingServers[defaultKey] === undefined) {
    return { key: defaultKey, existingEntry: undefined };
  }

  // 4. Disambiguation step — default key is taken by a different cwd.
  for (let suffix = 2; suffix <= DISAMBIGUATION_UPPER_BOUND; suffix++) {
    const candidate = `${defaultKey}-${suffix}`;
    if (existingServers[candidate] === undefined) {
      return {
        key: candidate,
        existingEntry: undefined,
        disambiguatedFrom: defaultKey,
      };
    }
  }

  throw new Error(
    `Unable to pick a unique server key: ${DISAMBIGUATION_UPPER_BOUND} suffixes of ${defaultKey} are all taken.`,
  );
}
