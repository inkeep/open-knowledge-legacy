# Exclude Git-Ignored Files from Document System

**Baseline commit:** `df715b9`
**Branch:** `feat/exclude-gitignored-files`
**Date:** 2026-04-11

---

## 1. Problem Statement

**Situation:** Open Knowledge's document system (API + file watcher) serves all `.md` files found in the content directory. A hardcoded `EXCLUDED_DIRS` set in `api-extension.ts` filters five known directories, and the config schema defines `content.include`/`content.exclude` fields that are not wired into the document listing API or file watcher (though the MCP catalog watcher does consume them).

**Complication:** When `content.dir` is `.` (the default — project root), the document list includes git-ignored files: build outputs (`dist/`), temp files (`tmp/`), logs, and other project noise. The hardcoded exclusion set is incomplete and doesn't generalize to project-specific patterns. Meanwhile, the config's `content.exclude` field exists but does nothing.

**Resolution:** Refactor the file watcher to be the **single source of truth** for "what content files exist," maintaining a filtered in-memory index. Apply the unified exclusion filter (union of `config.content.exclude` + `.gitignore` rules) in the watcher only. The documents API reads from the watcher's index instead of doing its own filesystem walk. Remove the hardcoded `EXCLUDED_DIRS`. Exclusion supersedes inclusion for safety.

---

## 2. Goals

1. **Refactor:** Make the file watcher the single owner of the content file index — API reads from it, not its own `readdirSync`
2. **Filter git-ignored files** at the watcher level (single filtering surface)
3. **Wire `content.exclude` config** into the filtering pipeline (currently dead config)
4. **Replace `EXCLUDED_DIRS`** with the unified filter (git-ignore + config exclude)
5. **Maintain safety invariant:** exclusion always supersedes inclusion

## 3. Non-Goals

- **NOT NOW:** UI toggle to show/hide ignored files
- **NOT NOW:** `gitIgnored` metadata field in API response (we filter, not annotate)
- **NEVER:** Allowing editing of git-ignored files to bypass the filter (if you want it, un-ignore it)

---

## 4. Design

### 4.1 Architecture: Watcher as Single Source of Truth

**Current (before):** Three independent filesystem walks, filtering in different places:
```
GET /api/documents  →  readdirSync(contentDir)  →  EXCLUDED_DIRS filter  →  response
file-watcher        →  @parcel/watcher           →  .md extension filter  →  events
seedLastKnownHashes →  readdirSync(contentDir)   →  .md extension filter  →  hash map
```

**Target (after):** Watcher owns the file index; filtering happens once:
```
file-watcher  →  initial scan + watch  →  ContentFilter  →  filtered file index
    ↓                                                            ↓
GET /api/documents  ←  reads from index              seedLastKnownHashes ← built from same scan
```

The file watcher becomes the single owner of "what content files exist." It maintains an in-memory index of known files (with metadata like size and modified time). The documents API reads from this index instead of doing its own `readdirSync`. Filtering lives in one place — the watcher's scan and event handling.

### 4.2 ContentFilter Module

Create a `ContentFilter` in the server package that encapsulates the unified exclusion logic:

1. Loads `.gitignore` file(s) using a **two-pass bootstrap** (see §4.4)
2. Loads `content.exclude` patterns from config
3. Builds an `ignore` instance from the union of both
4. Builds an include matcher from `content.include` patterns using `picomatch`
5. Provides:
   - `isExcluded(relativePath: string): boolean` — used by the watcher during scan and event handling
   - `getWatcherIgnoreGlobs(): string[]` — relative glob patterns for @parcel/watcher's `ignore` option (best-effort optimization; `isExcluded()` in handler is authoritative)

**Precedence rule:** A file is included if and only if:
1. It matches at least one `content.include` pattern (default: `**/*.md`), AND
2. It does NOT match any exclusion rule (config `content.exclude` OR `.gitignore`)

Exclusion wins over inclusion — a file matching both include and exclude is excluded.

**Pattern interaction:** `.gitignore` negation patterns (e.g., `!important.log`) are respected within the `.gitignore` context. However, `content.exclude` patterns are loaded after `.gitignore` and can re-exclude negated files. This is intentional — config-level exclusion is the final authority.

**Discovery vs access:** Filtering applies to **discovery** (the watcher's index). Direct access by document name (persistence `onLoadDocument`, agent-write endpoints) intentionally bypasses the filter — if a client knows a document name, it can open it regardless of ignore status.

### 4.3 Implementation: `ignore` npm package

Use the `ignore` npm package (already a transitive dep, v5.3.2) rather than spawning `git check-ignore`:
- In-process, synchronous, zero subprocess overhead
- Config exclude patterns and `.gitignore` patterns can share one `ignore()` instance
- Pure function — easy to test
- Covers `.gitignore` (root + nested) which handles 99%+ of real usage

Add `ignore` as a **direct** dependency of `@inkeep/open-knowledge-server`.

### 4.4 Surfaces Changed

#### A. New: `packages/server/src/content-filter.ts`

```ts
import ignore from 'ignore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

export interface ContentFilterOptions {
  projectDir: string;
  contentDir: string;
  includePatterns: string[];   // from config.content.include
  excludePatterns: string[];   // from config.content.exclude
}

export interface ContentFilter {
  /** True if the relative path should be excluded from the document system. */
  isExcluded(relativePath: string): boolean;
  /** Relative glob patterns for @parcel/watcher ignore option (best-effort). */
  getWatcherIgnoreGlobs(): string[];
}

export function createContentFilter(opts: ContentFilterOptions): ContentFilter {
  // 1. Two-pass .gitignore bootstrap (see §4.5)
  // 2. Add config.content.exclude patterns to ignore instance
  // 3. Build include matcher from config.content.include (picomatch)
  // 4. Return: excluded if !include match OR exclude match
}
```

#### B. Modified: `packages/server/src/file-watcher.ts` (primary change)

- Accept `ContentFilter` parameter in `startWatcher()`
- **New: maintain an in-memory file index** (`Map<docName, { size, modified }>`) populated during initial scan and kept in sync via watcher events
- Apply `contentFilter.isExcluded()` during initial scan and in `classifyEvents()` — single filtering surface
- Pass `contentFilter.getWatcherIgnoreGlobs()` to `@parcel/watcher`'s `subscribe()` options (best-effort)
- In `seedLastKnownHashes()`: use the same filtered scan (no separate walk)
- **Export a method to read the current file index** (consumed by the documents API)

#### C. Modified: `packages/server/src/api-extension.ts`

- **Remove `EXCLUDED_DIRS` constant entirely**
- **Remove `handleDocumentList`'s `readdirSync` walk** — replace with a read from the watcher's file index
- Add watcher file index accessor to `ApiExtensionOptions` (replaces the standalone `contentDir` for listing)

#### D. Modified: `packages/server/src/standalone.ts`

- Create `ContentFilter` instance from config + project root
- Create watcher **before** API extension (watcher now provides the file index the API reads)
- Pass watcher's index accessor to `createApiExtension()`
- Read `content.include`/`content.exclude` from config (new params on `ServerOptions`)

#### E. Modified: `packages/app/src/server/hocuspocus-plugin.ts`

- Create `ContentFilter` instance for dev mode at **module scope** (alongside Hocuspocus instance)
- Wire watcher → API extension dependency (same pattern as standalone)

#### F. Modified: `packages/cli/src/commands/start.ts`

- Forward `config.content.include` and `config.content.exclude` to server options

### 4.5 .gitignore Loading Strategy

**Two-pass bootstrap** (avoids walking `node_modules/` for nested `.gitignore` files):

1. **Pass 1:** Load the root `.gitignore` (project root) + `content.exclude` patterns into a bootstrap `ignore` instance
2. **Pass 2:** Walk `contentDir` for nested `.gitignore` files, using the bootstrap filter to skip directories already excluded (e.g., `node_modules/`, `.git/`). Load any found nested `.gitignore` files into the final filter with correct relative path prefixes.

This is critical when `contentDir` is `.` (the default) — without it, the scan enters `node_modules/` which contains hundreds of package-scoped `.gitignore` files that are irrelevant to the project.

Additional rules:
- Do **not** handle `.git/info/exclude` or global gitignore (`core.excludesFile`) — these are machine-local edge cases; `.gitignore` covers the vast majority of real usage. Documented as a known limitation.
- If no `.gitignore` exists (non-git project), the filter still works with `content.exclude` patterns only
- `.gitignore` is read once at startup. File watcher does NOT hot-reload `.gitignore` changes (future work). While the server is running, newly-gitignored files will still be tracked, persisted, and synced. Users must restart to apply `.gitignore` changes.

### 4.6 Config Integration

The existing config schema already has the right shape:

```yaml
content:
  dir: .
  include:
    - "**/*.md"
  exclude:
    - "vendor/**"
    - "archive/**"
```

No schema changes needed. Just wire the values through.

---

## 5. Acceptance Criteria

1. `GET /api/documents` reads from the watcher's file index (no independent `readdirSync`)
2. File watcher maintains an in-memory file index, filtered by `ContentFilter`
3. Git-ignored files do not appear in the document list or trigger watcher events
4. `content.exclude` config patterns are applied (no longer dead config)
5. `EXCLUDED_DIRS` hardcoded constant is removed
6. `content.include` patterns are respected (only matching files are listed)
7. Exclusion supersedes inclusion (a file matching both is excluded)
8. Non-git projects gracefully degrade (only `content.exclude` applies)
9. Existing tests pass; new tests cover the content-filter module and watcher index

---

## 6. Risks / Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| `.gitignore` not loaded on startup → silent regression | Medium | Test with real `.gitignore` file; log warning if file missing |
| Nested `.gitignore` files create complex precedence | Low | Delegate to `ignore` package which handles this correctly |
| @parcel/watcher `ignore` option format mismatch | Low | `isExcluded()` in handler is the authoritative filter; watcher ignore is best-effort optimization |
| Hot-reload of `.gitignore` changes | Medium | Documented as future work. While server is running, newly-gitignored files will still be tracked/persisted/synced. Users must restart. Consider logging a warning when `.gitignore` changes. |
| `ignore` package doesn't cover `.git/info/exclude` or `core.excludesFile` | Low | Documented known limitation. `.gitignore` covers 99%+ of real usage. |

---

## 7. Future Work

- **Identified:** Hot-reload `.gitignore` changes via file watcher (watch `.gitignore` itself)
- **Noted:** Support `.git/info/exclude` and global gitignore
- **Noted:** UI toggle to temporarily show excluded files

---

## 8. Decision Log

| # | Decision | Type | Status | Confidence |
|---|----------|------|--------|------------|
| D0 | Refactor: watcher owns the file index; API reads from it (single filtering surface) | Technical | LOCKED | HIGH |
| D1 | Use `ignore` npm package, not `git check-ignore` subprocess | Technical | LOCKED | HIGH |
| D2 | Exclusion = union of config.content.exclude + .gitignore | Cross-cutting | LOCKED | HIGH |
| D3 | Exclusion supersedes inclusion | Cross-cutting | LOCKED | HIGH |
| D4 | Remove EXCLUDED_DIRS, replace with unified filter | Technical | LOCKED | HIGH |
| D5 | Read .gitignore at startup only (no hot-reload) | Technical | DIRECTED | HIGH |
| D6 | Add `ignore` as direct dep of server package | Technical | LOCKED | HIGH |
| D7 | Add `picomatch` as direct dep of server package for `content.include` glob matching | Technical | LOCKED | HIGH |
| D8 | Two-pass `.gitignore` bootstrap: load root first, then scan for nested (skipping already-excluded dirs) | Technical | LOCKED | HIGH |

---

## 9. Open Questions

*None remaining — all P0 items resolved.*

---

## 10. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|--------------|
| A1 | `ignore` package handles nested `.gitignore` correctly when patterns are loaded in order | HIGH | Verified via npm docs + tested in repo |
| A2 | @parcel/watcher `ignore` option accepts `(FilePath\|GlobPattern)[]` | HIGH | Verified from type definition at `node_modules/@parcel/watcher/index.d.ts:13`. Watcher ignore is best-effort optimization; `isExcluded()` is authoritative. |

---

## 11. Agent Constraints

- **SCOPE:** `packages/server/src/` (new content-filter.ts, refactored file-watcher.ts, simplified api-extension.ts, updated standalone.ts), `packages/app/src/server/hocuspocus-plugin.ts`, `packages/cli/src/commands/start.ts`
- **EXCLUDE:** Frontend components (no UI changes), config schema (no changes needed), MCP tools (inherit API behavior), persistence write path
- **STOP_IF:** Implementation requires changes to `@parcel/watcher` subscribe API beyond documented options; watcher index introduces race conditions with API reads
- **ASK_FIRST:** Any change to config schema defaults, any change to persistence write path
