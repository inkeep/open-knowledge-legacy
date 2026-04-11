# Audit Findings

**Artifact:** specs/2026-04-11-zero-config-bunx-packaging/SPEC.md
**Audit date:** 2026-04-11
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Finding 1: Chokidar version inconsistency — spec contradicts itself on ^4.0.0 vs ^5.0.0

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 9 (Track 2), Decision Log (D7), Open Questions (Q1), Deployment table (Section 13)
**Issue:** The spec contains four conflicting references to the chokidar version:
1. Track 2 code proposal (line 191): `Add chokidar (^4.0.0) to dependencies`
2. Decision D7 (line 376): `Use chokidar ^5.0.0 (ESM-only, Node >= 20) as the watcher fallback` — LOCKED
3. Q1 resolution (line 387): `Resolved: chokidar ^5.0.0`
4. Deployment table (line 445): `chokidar v4 is ~185KB with one dep (readdirp)`

D7 is LOCKED at ^5.0.0, yet the Track 2 implementation section still says ^4.0.0, and the deployment table describes v4's characteristics.

**Current text:** "Add `chokidar` (^4.0.0) to `dependencies`" (Track 2, line 191) vs "Use chokidar ^5.0.0 (ESM-only, Node >= 20)" (D7, line 376)
**Evidence:** The Decision Log (D7) is the authoritative resolution and says ^5.0.0 LOCKED. The Track 2 implementation section and deployment table were not updated after the decision was made.
**Status:** INCOHERENT
**Suggested resolution:** Update Track 2 line 191 to `chokidar (^5.0.0)`. Update the deployment table row (line 445) to reflect chokidar v5 characteristics (~80KB, 1 dep — readdirp ^5.0.0, ESM-only) instead of v4.

---

### [H2] Finding 2: Track 2 dependency changes target wrong package.json — contradicts Decision D8

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions), T1 (Own codebase)
**Location:** Section 9 (Track 2), Decision Log (D8), Agent Constraints (Section 16)
**Issue:** Track 2 says:
> **Package.json changes** in `packages/cli/package.json`:
> - Move `@parcel/watcher` from `dependencies` to `optionalDependencies`
> - Add `chokidar` (^4.0.0) to `dependencies`

But Decision D8 (DIRECTED) says "chokidar dependency lives in the server package (not CLI)" because "the file watcher is a server concern." The file-watcher.ts that needs modification lives at `packages/server/src/file-watcher.ts` and the `@parcel/watcher` import is in the server package. The server's `package.json` also lists `@parcel/watcher` in dependencies.

Furthermore, the Agent Constraints SCOPE in Section 16 correctly lists `packages/server/package.json` as a target file, but Track 2's narrative directs the implementer to `packages/cli/package.json` for the dependency changes.

**Current text:** "**Package.json changes** in `packages/cli/package.json`" (Track 2, line 189)
**Evidence:** `packages/server/package.json` line 15: `"@parcel/watcher": "^2.5.6"` in dependencies. `packages/server/src/file-watcher.ts` line 20: `import { type AsyncSubscription, subscribe } from '@parcel/watcher';`. Both the import and the dependency declaration are in the server package.
**Status:** INCOHERENT
**Suggested resolution:** Change Track 2's "Package.json changes" to target `packages/server/package.json` for both the @parcel/watcher optionalDependencies move and the chokidar addition. Also note that `packages/cli/package.json` may need a corresponding change to @parcel/watcher (since it also lists it as a dependency) — or the CLI dependency can be removed entirely since it's consumed transitively through the server package that gets bundled by tsdown.

---

## Medium Severity

### [M1] Finding 3: chokidar fallback code uses `filter.isIncluded()` which does not exist on the ContentFilter interface

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 9 (Track 2), chokidar fallback code block (line 228)
**Issue:** The proposed chokidar fallback function includes:
```typescript
ignored: (path: string) => !filter.isIncluded(path),
```
The `ContentFilter` interface (defined in `packages/server/src/content-filter.ts`) does NOT expose an `isIncluded()` method. Its public interface is: `isExcluded(relativePath)`, `isDirExcluded(relativePath)`, and `getWatcherIgnoreGlobs()`. The internal `isIncluded` is a private picomatch function scoped to the `createContentFilter` closure.

**Current text:** `"ignored: (path: string) => !filter.isIncluded(path),"` (line 228)
**Evidence:** `packages/server/src/content-filter.ts` lines 25-36 define the `ContentFilter` interface with three methods: `isExcluded()`, `isDirExcluded()`, `getWatcherIgnoreGlobs()`. No `isIncluded()` method.
**Status:** CONTRADICTED
**Suggested resolution:** Change to `ignored: (path: string) => filter.isExcluded(relative(dir, path))` or equivalent. Note that `isExcluded` expects a path relative to contentDir, so the chokidar callback would need to compute the relative path before calling it.

---

### [M2] Finding 4: D7 claims chokidar v5 has "1 dep vs 13" but the comparison is against v3, not v4

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** Decision Log (D7, line 376)
**Issue:** D7 states: "Lighter than v4 (~80KB vs ~150KB), 1 dep vs 13, ESM-only matches our module format." The "1 dep vs 13" comparison is incorrect for a v4-to-v5 comparison. Chokidar v4 already reduced dependencies from 13 to 1 (readdirp). Chokidar v5 also has 1 dependency (readdirp ^5.0.0). The "13 deps" figure describes v3, not v4. The size comparison (~80KB vs ~150KB) between v5 and v4 is approximately correct.

**Current text:** "1 dep vs 13" (D7 rationale)
**Evidence:** npm registry and chokidar changelog confirm: v3 had ~13 deps, v4 reduced to 1 dep (readdirp), v5 also has 1 dep (readdirp ^5.0.0). The "1 dep vs 13" comparison is v5 vs v3, not v5 vs v4.
**Status:** CONTRADICTED
**Suggested resolution:** Correct D7 rationale to: "Lighter than v4 (~80KB vs ~150KB), same 1 dep (readdirp), ESM-only matches our module format. v4 has 1 dep too — the advantage of v5 is ESM-only (smaller) + matches our module format."

---

### [M3] Finding 5: tsdown.config.ts neverBundle changes in Track 2 may break the build

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 9 (Track 2), tsdown.config.ts changes (lines 243-245)
**Issue:** Track 2 proposes:
> - Remove `@parcel/watcher` from `neverBundle` (it's now optional, dynamically imported)
> - Add `chokidar` to `neverBundle` (it's a runtime dependency, not bundled)

Removing `@parcel/watcher` from `neverBundle` means tsdown would attempt to bundle it. But @parcel/watcher is a native addon — it cannot be bundled into a JS file. The dynamic import approach means the import statement moves from top-level to inside a try/catch, but tsdown would still try to resolve and bundle the module at build time unless it's externalized. If @parcel/watcher is moved to `optionalDependencies` in server/package.json but removed from neverBundle, tsdown may either fail at build time (can't resolve native addon) or produce a broken bundle.

**Current text:** "Remove `@parcel/watcher` from `neverBundle` (it's now optional, dynamically imported)" (line 244)
**Evidence:** tsdown.config.ts currently has `neverBundle: ['@parcel/watcher', 'simple-git']`. @parcel/watcher is a native addon with platform-specific binaries that cannot be bundled into JS. tsdown's `alwaysBundle` inlines workspace packages; `neverBundle` externalizes packages. Removing from neverBundle would cause tsdown to attempt to bundle or inline the native addon.
**Status:** CONTRADICTED
**Suggested resolution:** Keep `@parcel/watcher` in `neverBundle` in tsdown.config.ts. The dynamic import changes the runtime behavior (try/catch), but the build system still needs to externalize it. Add `chokidar` to `neverBundle` alongside `@parcel/watcher`.

---

## Low Severity

### [L1] Finding 6: Evidence file quotes tsdown output extensions that don't match actual build output

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** evidence/codebase-current-state.md (lines 34-35)
**Issue:** The evidence file quotes tsdown config as: `outputExtension: () => ({ js: '.js', dts: '.d.ts' })` which matches the actual config. However, the actual build output produces `.mjs` and `.d.mts` files (not `.js` and `.d.ts`). The package.json correctly references `.mjs`/`.d.mts`. This suggests tsdown overrides the declared extension (possibly based on `format: 'esm'` + `"type": "module"`). The evidence file does not note this discrepancy.

**Current text:** `outputExtension: () => ({ js: '.js', dts: '.d.ts' })` quoted as representative of the build output
**Evidence:** Actual dist/ directory contains: `cli.mjs`, `index.mjs`, `index.d.mts`, etc. package.json references `./dist/cli.mjs` and `./dist/index.d.mts`.
**Status:** INCOHERENT
**Suggested resolution:** Add a note to the evidence file or the spec that the tsdown config's outputExtension appears to be overridden — actual output uses `.mjs`/`.d.mts`. This is informational and doesn't affect the spec's proposed changes, but could confuse an implementer reading the evidence.

---

### [L2] Finding 7: Spec Section 8 summary says "cli.mjs" is a single 6MB file, but dist has code-split chunks

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 9 (Track 1), published package structure diagram (lines 172-175)
**Issue:** The spec's published package structure shows `cli.mjs` with the comment `~6MB with bundled core/server`. In reality, `cli.mjs` is 65KB; the bulk is in code-split chunks (`src-BkK7Pile.mjs` at 1.9MB, plus smaller chunks). The total dist size is 6.1MB, which is correct, but the per-file description is misleading. An implementer verifying with `npm pack --dry-run` would see multiple chunk files, not a single monolithic cli.mjs.

**Current text:** "cli.mjs (CLI entry — ~6MB with bundled core/server)" (line 173)
**Evidence:** `dist/cli.mjs` is 65KB. `dist/src-BkK7Pile.mjs` is 1.9MB. Total dist is 6.1MB across 7 .mjs files + declaration files + source maps.
**Status:** INCOHERENT
**Suggested resolution:** Update the published package structure diagram to show chunk files or note that cli.mjs imports code-split chunks, with total dist size of ~6MB.

---

## Confirmed Claims (summary)

**T1 (Own codebase) — confirmed:**
- `start.ts` asset path resolution uses monorepo-relative paths only (lines 62-67 in actual code) — confirmed, matches spec's current state description
- `file-watcher.ts` has a hard top-level import of `@parcel/watcher` with no fallback — confirmed (line 20)
- `@parcel/watcher` is in `dependencies` (not `optionalDependencies`) in both CLI and server packages — confirmed
- `start` is the default Commander.js command via `{ isDefault: true }` — confirmed (cli.ts line 69)
- Config defaults (port 3000, host localhost, content.dir `.`, include `**/*.md`) — confirmed via schema.ts
- `runInit()` is idempotent, returns structured result with mcpAction — confirmed (init.ts)
- `runInit` writes MCP entry with `npx` command — confirmed (init.ts line 28)
- `"files": ["dist"]` in CLI package.json — confirmed
- `bin` entry resolves to `./dist/cli.mjs` — confirmed
- App dist is ~2MB total (1.9MB JS + 77KB CSS + HTML) — confirmed

**T4 (Web verification) — confirmed:**
- chokidar v5 is ESM-only, requires Node >= 20 (specifically v20.19) — confirmed via npm/GitHub
- chokidar v5 is ~80KB unpacked — confirmed
- chokidar v5 has 1 dependency (readdirp) — confirmed
- `@parcel/watcher` has a documented bunx failure mode (oven-sh/bun#19282) — confirmed, issue exists

**Coherence lenses — confirmed:**
- L5 (Summary coherence): Section 1 (Problem statement), Section 2 (Goals), and Section 9 (Proposed solution) are well-aligned. The four tracks map cleanly to the three gaps identified in the complication.
- L6 (Stance consistency): The spec maintains a consistent prescriptive engineering stance throughout.
- L3 (Conditionality): Version bounds and platform conditions are properly stated (Node >= 22, macOS/Linux).

## Unverifiable Claims

- **A1:** `import.meta.dirname` behavior in bunx/npx cache contexts — the spec correctly flags this as an assumption requiring pre-implementation testing. Cannot verify without publishing a test package.
- **Plugin format details** (evidence/plugin-format.md): Claims about Claude Code plugin structure, the broken inline mcpServers (issue #16143), and SessionStart hook behavior are cited from documentation and GitHub issues. The issue link was not independently verified (URL check not performed), but the claims are internally consistent.
- **bunx speed claims** ("~11x faster for remote packages"): Cited from the research report without primary benchmarks. Treat as directional.
