---
name: init_worldmodel
description: Worldmodel topology for `.open-knowledge/` → `.ok/` rename + `.okignore` lift. Synthesized from code, web, and reports channels.
type: evidence
date: 2026-04-30
sources:
  - evidence/_code_channel.md
  - evidence/_web_channel.md
  - reports/git-directory-nesting-shadow-repo/REPORT.md
  - reports/CATALOGUE.md (scanned)
  - .open-knowledge/config.yml
  - PRECEDENTS.md
depth: full
---

# Worldmodel — `.ok/` rename + `.okignore` lift

Topology only. Granular file:line evidence lives in `_code_channel.md` and `_web_channel.md`. This is the synthesis layer.

---

## Summary

The rename touches **3,762 line-hits across 347 tracked files** but the production-code surface is much smaller — about **70 source-file callsites** spread across server (~46), cli (~20), desktop (~10), app (~6), core (3), plus the docs site (~52 lines across ~10 mdx files). The `OK_DIR` constant exists as canonical SSOT but is inconsistently consumed: cli is well-routed (38 OK_DIR uses), server-src is not (only 1 production file uses it; the other 16 server sites hardcode the literal). Three rename precedents in the recent past — two hard-cutover (PRs #399, #392), one with a `renameSync` shim (commit `48d4218`, the previous shadow-repo rename). The `ignore` npm library is filename-agnostic (confirmed) and supports cross-source `!` negation in add-order (confirmed) — both load-bearing claims in D2 hold. The Settings pane has a real end-user "Content" section surfacing all three of `content.dir` / `include` / `exclude` — this is the most non-obvious surface affected by `content.{include,exclude}` removal.

---

## 1. Surfaces (product + internal)

### 1.A — `.open-knowledge/` directory at project root

| Surface | Site | Notes |
|---|---|---|
| Canonical constant | `packages/core/src/constants/ok-dir.ts:2` | `export const OK_DIR = '.open-knowledge';` — the single source of truth |
| Server lock dir | `packages/server/src/server-factory.ts:279` (literal) | `lockDir = resolve(contentDir, '.open-knowledge')`; passed to Hocuspocus |
| Cache files | `packages/server/src/backlink-index.ts:767` | `<projectDir>/.open-knowledge/cache/<branch>/backlinks.json` |
| Conflict store | `packages/server/src/conflict-storage.ts:50` | `<contentDir>/.open-knowledge/conflicts.json` |
| Sync state | `packages/server/src/sync-engine.ts:224` | `<contentDir>/.open-knowledge/sync-state.json` |
| Upload tmp | `packages/server/src/upload-streaming.ts:87` | `<contentDir>/.open-knowledge/tmp` (atomic same-FS rename) |
| Rename journal | `packages/server/src/managed-rename-journal.ts:30` | `<contentDir>/.open-knowledge` |
| Telemetry classifier | `packages/server/src/fs-traced.ts:49,51` | `'.open-knowledge${sep}conflict'` and `'ok-internal'` cardinality classes |
| State manifest | `packages/server/src/state-manifest.ts:17,62,197` | adopt-detection: `(no .open-knowledge/) AND (no .git/open-knowledge/) → fresh-init` |
| Vite/dev-mode plugin | `packages/app/src/server/hocuspocus-plugin.ts:65` | dev-mode reads `<projectRoot>/.open-knowledge/config.yml` |
| Init scaffold | `packages/cli/src/content/init.ts:228` | creates `<projectDir>/.open-knowledge/` + `cache/` + `.gitignore` + `config.yml` |
| Config loader | `packages/cli/src/config/loader.ts:172` | `projectConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME)` |
| Lock-dir helper | `packages/cli/src/config/paths.ts:23,27` | `resolveLockDir(contentDir) = resolve(contentDir, OK_DIR)` |
| Clone exclude | `packages/cli/src/commands/clone.ts:121` | writes `${OK_DIR}/` to `.git/info/exclude` so cloned repos don't surface OK files; idempotent variant detection at lines 158-174 |
| Static-serve exclude | `packages/cli/src/commands/ui.ts:157,179,214` | UI HTTP server excludes dotfiles incl. `.open-knowledge/`; reads `server.lock` + `ui.lock` |
| Drift-guard test | `packages/cli/src/content/init.test.ts:205-231` | parses tree to find committed `.open-knowledge/.gitignore`; asserts byte-for-byte match against scaffold template |
| Bash command exclusion | `packages/cli/src/bash/{mtime-scan,parse-command}.ts` | OK_DIR consumers |
| Smoke test | `packages/desktop/tests/unit/scaffold.test.ts:17` | `expect(OK_DIR).toBe('.open-knowledge');` — must update on rename |
| Attach-mode lookup | `packages/desktop/src/main/window-manager.ts:461` | electron checks `<projectPath>/.open-knowledge/server.lock` to decide attach-vs-spawn |
| Reveal in Finder | `packages/desktop/src/main/menu.ts` | menu item: "Reveal `.open-knowledge/`" |
| Bash perf harness | `packages/app/scripts/perf-prod.sh:25,27,118` | shell literal `$REPO_ROOT/.open-knowledge/server.lock` |
| Connecting banner | `packages/app/src/components/ConnectingBanner.tsx:97` | UI text: `<code>.open-knowledge/last-spawn-error.log</code>` |
| Seed dialog | `packages/app/src/components/SeedDialog.tsx:411` | UI label `'.open-knowledge/config.yml'` |
| Repo `.gitignore` comment | `.gitignore:75` | comment says `.open-knowledge/.gitignore` is the only place OK-internal paths belong |
| Codex MCP | `.codex/config.toml:1` | `[mcp_servers.open-knowledge]` — server NAME (NOT a path) |
| Dogfood config | `.open-knowledge/config.yml` | uses defaults only — no custom include/exclude |
| Dogfood gitignore | `.open-knowledge/.gitignore` | committed; matches scaffold template byte-for-byte |
| Docs site | `docs/content/**/*.mdx` (~52 line-hits across ~10 files) | configuration.mdx, content-filtering.mdx, cli-reference.mdx, getting-started.mdx, github-sync.mdx, mcp-integration.mdx, internals/lifecycle.mdx, internals/server-lifecycle.mdx, internals/service-topology.mdx |
| Docs homepage hero | `docs/src/app/(home)/sticky-showcase.tsx:656` | literal `.git/open-knowledge/` shown to viewer |
| Repo instruction docs | `AGENTS.md:33,95,97,…`, `CLAUDE.md` (this file), `PROJECT.md`, `README.md`, `STORIES.md` | repo-level documentation |
| MCP server instructions | `packages/cli/src/mcp/server.ts:194,212` | system instruction prose: STOP rule about `.open-knowledge/` |
| MCP exec tool desc | `packages/cli/src/mcp/tools/exec.ts:61` | tool description STOP rule mentioning `.open-knowledge/` |

### 1.B — `~/.open-knowledge/` user-home paths (separate from per-project)

| Surface | Site | File written |
|---|---|---|
| User-global config | `packages/cli/src/config/loader.ts:159` | `~/.open-knowledge/config.yml` |
| Auth token store | `packages/cli/src/auth/token-store.ts:77,85,142` | `~/.open-knowledge/auth.yml` (chmod 0600 plaintext fallback when keyring unavailable) |
| First-launch consent | `packages/desktop/src/main/mcp-wiring.ts:63,67,184,510` | `MCP_STATUS_DIR_NAME = '.open-knowledge'`; writes `~/.open-knowledge/mcp-status.json` |
| Handoff telemetry | `packages/desktop/src/main/ipc-handlers.ts:342,366` | `STATS_FILE_RELATIVE_PATH = ['.open-knowledge', 'stats.jsonl']` |
| Skill-installed sidecar | `packages/server/src/skill-install.ts:86` | `~/.open-knowledge/skill-installed-version` |

User-home paths use the same dirname `.open-knowledge` and need to rename in lockstep with the per-project dir. CLAUDE.md explicitly notes the user/project precedence: `~/.open-knowledge/config.yml` (user defaults) → `./.open-knowledge/config.yml` (project, this file).

### 1.C — `.git/open-knowledge/` shadow repo

| Surface | Site | Purpose |
|---|---|---|
| Canonical SSOT | `packages/core/src/shadow-repo-layout.ts:96` | `getShadowRepoPath() = resolve(projectRoot, '.git/open-knowledge')` |
| Initialization | `packages/server/src/shadow-repo.ts:84,154` | shadow init |
| Legacy rename shim (R9) | `packages/server/src/shadow-repo.ts:91`; tested at `shadow-repo.test.ts:96-134` | `renameSync` from previous `.git/openknowledge/` to current `.git/open-knowledge/` — closest precedent for in-place per-machine directory rename |
| Adopt detection | `packages/server/src/state-manifest.ts:17,62,197` | absence of `.open-knowledge/` AND `.git/open-knowledge/` → fresh-init |
| Docs site | `docs/content/internals/service-topology.mdx:86`, `docs/content/guides/getting-started.mdx:176`, `docs/src/app/(home)/sticky-showcase.tsx:656` | references |
| Research reports | `reports/crdt-server-restart-recovery/`, `reports/worktree-git-shadow-repo-issue/`, `reports/vite-dev-server-diagnostic/` | path mentioned |

### 1.D — Out of scope (LOCKED, must NOT change)

| Item | Site | Why locked |
|---|---|---|
| Bundle ID | `packages/desktop/electron-builder.yml:1` | `appId: com.inkeep.open-knowledge` — Keychain ACL binding; per `packages/desktop/README.md`, "LOCKED forever" |
| URL scheme | `packages/desktop/electron-builder.yml:131`; `shell-allowlist.ts:18` | `openknowledge://` deep-link protocol |
| Writer ID | `packages/server/src/persistence.ts:467,478`; `shadow-repo.ts:467`; `contributor-tracker.ts:16` | `'openknowledge-service'` literal — stable identifier per precedent #25, NOT a path |
| Codex MCP server name | `.codex/config.toml:1` | `mcp_servers.open-knowledge` is a server identifier, not a path; renaming would break user-side MCP wiring (separate decision) |
| Package names | `package.json` files across packages | `@inkeep/open-knowledge`, `@inkeep/open-knowledge-server`, etc. — npm publishing implications, deferred to NG4 in SPEC.md |
| CLI bin name | `packages/cli/package.json` | `open-knowledge` (with `ok` alias) — NG4 |

---

## 2. `content.include` / `content.exclude` / `content.dir` callsites

### Schema definition (single SSOT)

`packages/core/src/config/schema.ts:30-58` defines all three keys via Zod with the `fieldRegistry`. Defaults: `dir: '.'`, `include: ['**/*.md', '**/*.mdx']`, `exclude: []`. Scopes: all three are `scope: 'project'`. `agentSettable`: `false` for `dir`, `true` for `include` + `exclude`. `include` carries a `.min(1)` Zod constraint.

### Production reads (consumers)

| Surface | Site | Purpose |
|---|---|---|
| File-watcher filter | `packages/server/src/content-filter.ts:113,142,...` | THE primary consumer — picomatch include + `ignore`-lib exclude |
| File-watcher prefilter | `packages/server/src/file-watcher.ts:837` | feeds `@parcel/watcher` `subscribe({ ignore })` via `getWatcherIgnoreGlobs()` |
| CLI start | `packages/cli/src/commands/start.ts:420,427,428,651,652` | passes config.content.* to bootServer; re-applies on hot-reload |
| Init terminal report | `packages/cli/src/commands/init.ts:1099,1100` | shows current include/exclude after init |
| Preview reporter | `packages/cli/src/commands/preview.ts:29,30`; `packages/cli/src/content/preview.ts:180` | "${OK_DIR}/config.yml → content.include / content.exclude" |
| UI server | `packages/cli/src/commands/ui.ts:174,175` | constructs ContentFilter |
| Path resolve | `packages/cli/src/config/paths.ts:19` | `resolveContentDir(cwd, config) = resolve(cwd, config.content.dir)` |
| MCP search | `packages/cli/src/mcp/tools/search.ts:107,108,114` | honors include/exclude; appends OK_DIR to native exec exclude list |
| MCP consolidate/ingest/research | `packages/cli/src/mcp/tools/{consolidate,ingest,research}.ts` | join `args.topic` under `config.content.dir` |
| MCP preview-url | `packages/cli/src/mcp/tools/preview-url.ts:58` | jsdoc references `config.content.dir` |
| Folder rules | `packages/cli/src/content/folder-rules.ts:12` | folder-default rules apply over content.include-matched files |
| Vite plugin | `packages/app/src/server/hocuspocus-plugin.ts:65,72,75,81` | dev-mode reads project config to derive dir/include/exclude |

### Production writes (the only two)

| Surface | Site | Path access |
|---|---|---|
| MCP set_config | `packages/cli/src/mcp/tools/set-config.ts:5-9` | allowlist admits `content.include` + `content.exclude` (NOT `content.dir`) — agent-driven |
| **Settings pane UI** | `packages/app/src/components/settings/SettingsPane.tsx:81-103` | end-user "Content" section with all three fields. L88 dir, L93 include, L98 exclude. Writes via `useFieldBinding` → `writeConfigPatch`. **Real UI surface — most non-obvious affected surface.** |

### Validation + telemetry

| Surface | Site | Purpose |
|---|---|---|
| Allowlist error | `packages/core/src/config/errors.ts:186` | `Agent-settable paths: content.include, content.exclude, folders[],` (literal in error string) |
| Field-registry invariant | `packages/core/src/config/field-registry.test.ts:134-155` | asserts content.* are registered with expected scopes |
| YAML patch test | `packages/core/src/config/yaml-patch.test.ts:73` | expects `['content.include']` |
| Schema/loader tests | `packages/cli/src/config/{schema,loader}.test.ts` | non-default values |
| MCP set-config tests | `packages/cli/src/mcp/tools/set-config.test.ts:110,168,231,237,282,285,289,292,296` | many tests setting content.include/exclude/dir + asserting dir is rejected |
| Schema published | `packages/cli/scripts/build-config-schema.mjs:31,126` | `dist/schemas/v0/config.project.schema.json` + `config.user.schema.json` |

### File watcher's authoritative filter (current logic)

`packages/server/src/content-filter.ts` implements the 4-step ordered logic at lines 198-222:

```
(0) reserved synthetic docs (__system__, __config__, __user__) → excluded
(1) gitignore + content.exclude (unioned in `ignore` lib instance) → if hit, excluded
(2) content.include (picomatch) → if matched, included
(3) sibling-asset rule (D11): asset extension + dir has an included .md → included
(4) else → excluded
```

`isSupportedDocFile()` (`packages/server/src/doc-extensions.ts`) gates `.md` / `.mdx` extensions UPSTREAM at populateDirCount and isExcluded step (0). This is what makes pure-gitignore semantics safe: removing `content.include` does not cause non-doc files to be indexed because the extension gate runs first.

`loadNestedGitignores()` (`content-filter.ts:311`) walks `contentDir` for nested `.gitignore` files; skips `BUILTIN_SKIP_DIRS` (23 dirs incl. `node_modules`, `.git`, build outputs); prefixes patterns with relative path; supports `!` negation. **`.open-knowledge` is NOT in `BUILTIN_SKIP_DIRS`** — the filter walks INTO it, but the scaffolded `.open-knowledge/.gitignore` self-ignores its contents (cache/, server.lock, etc.).

`getWatcherIgnoreGlobs()` (`content-filter.ts:235`) returns raw patterns (drops `!` and `#` lines) for `@parcel/watcher`'s `ignore` option. **`@parcel/watcher` uses micromatch glob syntax, NOT full gitignore syntax** — this is a "best-effort prefilter" only. The authoritative filter still runs in `isExcluded()` after each event.

---

## 3. Connections & dependencies

```
config.yml (YAML) ─┬─ ConfigSchema (Zod) ──────────────── load via cli/src/config/loader.ts
                   │                                       │
                   └─ Settings pane UI ──── writeConfigPatch ─┘
                       (and MCP set_config)
                                                            │
                                                            ▼
                                              start.ts → bootServer()
                                                            │
                                                            ▼
                                              file-watcher.ts ── createContentFilter ── content-filter.ts
                                                            │                                   │
                                                            ▼                                   ▼
                                              @parcel/watcher subscribe ────── isExcluded() / isDirExcluded()
                                                  (best-effort prefilter)         (authoritative)
                                                                                       │
                                                                                       ▼
                                                                           document index → CRDT docs
```

`server.lock` lifecycle: `server-factory.ts:279` constructs `lockDir`; `acquireServerLock` writes `<lockDir>/server.lock` with PID+port BEFORE Hocuspocus init; `destroy()` triggers `releaseServerLock`. Read sites: MCP `server-discovery.ts`, CLI `stop.ts` / `ui.ts`, electron `window-manager.ts`, perf bash harness, app `use-collab-url.ts`.

CC1 broadcast (`packages/server/src/cc1-broadcast.ts:40-61`) is **document-name string comparison only — no `.open-knowledge/` path construction.** Confirmed via grep: 0 hits in cc1-broadcast.ts. Channels emit via `Document.broadcastStateless` over the `__system__` carrier doc.

Shadow repo (`packages/core/src/shadow-repo-layout.ts:96`) is structurally separate from `.open-knowledge/`. Adopt-detection in `state-manifest.ts:17` checks for absence of BOTH (manifest absent + no `.open-knowledge/` AND no `.git/open-knowledge/` → fresh-init). Renaming both in lockstep is necessary to preserve adopt-detection semantics — otherwise an existing project with the new `.ok/` and the new `.git/ok/` would be detected as fresh-init.

---

## 4. Entities & terminology

| Term | Definition | Source |
|---|---|---|
| `OK_DIR` | Canonical constant, value `.open-knowledge` | `packages/core/src/constants/ok-dir.ts:2` |
| `ContentFilter` | The file-watcher's exclusion + inclusion engine | `packages/server/src/content-filter.ts` |
| `BUILTIN_SKIP_DIRS` | 23 hardcoded dirs always skipped (node_modules, .git, dist, etc.) | `content-filter.ts:39-62` |
| `isSupportedDocFile()` | Hard extension gate — `.md` / `.mdx` only | `packages/server/src/doc-extensions.ts` |
| `ASSET_EXTENSIONS` | Set of asset MIME-class extensions for sibling-asset rule | `packages/core/src/constants/upload.ts:177` |
| Sibling-asset rule (D11) | Auto-include assets next to included `.md` files | `content-filter.ts:212-218` |
| Writer ID | Stable string identifier per shadow-repo commit author class | precedent #25 |
| `'openknowledge-service'` | One of the writer-ID classes — STABLE LITERAL, not a path | precedent #25 |
| Adopt detection | Logic that decides fresh-init vs. existing project | `state-manifest.ts` |

`PRECEDENTS.md` #25 is the **only** precedent that hardcodes `.open-knowledge/` path text (specifically `<projectRoot>/.git/open-knowledge/`). No other precedent mentions `.open-knowledge/`, `content.dir`, gitignore, or content filtering.

---

## 5. Patterns

### Rename precedent comparison (recent OK history)

| PR / Commit | Renamed | Files | LOC Δ | Backward-compat shim? |
|---|---|---|---|---|
| #399 (`37bf36b42`) | `standalone.ts` → `server-factory.ts` | 19 | +38/−37 | None — pure `git mv` + import-path updates |
| #392 (`3ecd260b0`) | workspace scope → project scope | 60 | +448/−454 | None — wire-format value AND on-disk YAML key both changed in one PR |
| `48d4218` | `.git/openknowledge/` → `.git/open-knowledge/` | (smaller) | n/a | **Shipped a `renameSync` shim** in `packages/server/src/shadow-repo.ts:91`; tested at `shadow-repo.test.ts:96-134`. Closest precedent for renaming a per-machine durable directory. |

**Pattern:** team default for in-codebase / wire-format renames is hard cutover with no shim (PRs #399 + #392). For per-machine durable directories, the precedent is mixed — `48d4218` shipped a shim, but the user direction here is hard cutover. Pre-release license + user direction overrides the shim precedent.

### Self-ignoring committed dotfile

The `.open-knowledge/.gitignore` template (declared in `cli/src/content/init.ts:199-216`, drift-guarded at `init.test.ts:205-231`) is committed at repo root and self-ignores all OK-internal contents (cache/, server.lock, ui.lock, sync-state.json, principal.json, state.json, last-spawn-error.log). **`.open-knowledge` itself is NOT in `BUILTIN_SKIP_DIRS`** — the filter walks INTO it but finds nothing that matches `isSupportedDocFile()` due to this self-ignore. Pattern: scaffold-and-commit, not hardcoded skip.

### Cross-package constant indirection (incomplete)

`OK_DIR` is canonically defined in `core` and re-exported through `cli/src/constants.ts`. CLI consumes it well (~38 sites). Server-src consumes it inconsistently — only `principal.ts`, `seed/plan.ts`, and 2 seed test files import it; the other 16 server-src sites hardcode `.open-knowledge` as a literal. Server tests also hardcode the literal. **The rename creates an opportunity (not a requirement) to systematically route server-src through `OK_DIR`.**

---

## 6. Personas & audiences (verification)

The seed correctly identifies this as internal-refactor work. Worldmodel did not surface unexpected external surfaces. Confirmed:
- No public CLI flag named `--open-knowledge-dir` or similar (verified via grep — `--scope`, `--no-init`, etc. don't reference the dir name).
- No HTTP API endpoint that returns `.open-knowledge/` paths in its public response shape (the `lockDir` field is in CLI internal contracts only).
- Bundle ID + URL scheme are LOCKED out of scope (separate decision domain).
- The Codex MCP server name `mcp_servers.open-knowledge` (`.codex/config.toml:1`) IS a user-facing identifier — renaming would break user-side Codex MCP wiring. Keep as-is OR add as a separate decision in §10.

---

## 7. 3P landscape

### `ignore` (kaelzhang/node-ignore)

| Property | Status | Source |
|---|---|---|
| Filename-agnostic | **CONFIRMED HIGH** — accepts pattern strings via `ig.add()`, never reads files itself | [README](https://github.com/kaelzhang/node-ignore) |
| Cross-source `!` negation across multiple `.add()` calls | **CONFIRMED MEDIUM-HIGH** — patterns evaluated in add-order; `!secret.md` in a later source CAN override `*.md` from earlier | README; `TestResult.unignored` interface |
| gitignore-spec compliant | **CONFIRMED MEDIUM** — README states "exactly the gitignore manpage"; trailing-slash dir-only, leading-`/` anchor, `#` comment, `\#` escape all work | README; gitignore manpage |
| `.git/` auto-ignore | **NOT auto-ignored** — caller must add explicitly. OK already does via `ig.add('.git')` at content-filter.ts:120. | [Prettier docs](https://prettier.io/docs/ignore) |
| CRLF in `add(string)` | **UNRESOLVED** — not explicitly documented; callers normalize upstream. OK normalizes via `parseGitignorePatterns` (content-filter.ts:299-303) which splits on `\n` after trim. | searched, not in docs |
| Current version | `7.0.5` (May 2025); `5.x → 7.x` are all safe in single-instance use; only breakage is mixing v6/v7 instances. | [Releases](https://github.com/kaelzhang/node-ignore/releases) |

**Implication:** D2 (pure gitignore semantics) holds without modification. The expressiveness-gain claim (cross-source `!` negation) is verified.

### `picomatch` (currently used for `content.include`)

Glob-only matching via `picomatch(includePatterns, { dot: true })` at `content-filter.ts:114`. Goes away with `content.include` removal. No other consumers in the file-watcher path.

### `@parcel/watcher` ignore semantics

Uses **micromatch glob syntax**, NOT gitignore syntax. `getWatcherIgnoreGlobs()` returns the subset of patterns the watcher can interpret (drops `!` and `#`). Watcher-level filtering is best-effort prefilter; authoritative filter runs in `isExcluded()` post-event. **No change with `.okignore` lift** — same semantic split applies.

### `.<tool>ignore` ecosystem precedents

| Tool | Backed by | Composes with `.gitignore`? | Nested files honored? |
|---|---|---|---|
| `.prettierignore` | node-ignore | yes (auto) | **NO** ([prettier#12923](https://github.com/prettier/prettier/issues/12923)) |
| `.dockerignore` | gitignore-like | no | **NO** |
| `.gcloudignore` | gitignore-like + `#!include:` directive (non-recursive) | falls back to `.gitignore` if absent | n/a |
| `.npmignore` | gitignore syntax | falls back to `.gitignore` if absent | known-buggy with `package.json files` |
| `.cursorignore` | gitignore syntax | yes | **YES** (per Cursor docs) |
| `.eslintignore` | (deprecated v9) | n/a | n/a — moved to flat config `ignores` array |
| `.aiderignore` / `.geminiignore` / `.codeiumignore` | gitignore-style each | varies | varies |
| Community `.agentignore` proposal | gitignore-style | n/a | n/a — not adopted |

**Cleanest precedent for OK to mimic:** `.prettierignore` for the "node-ignore-backed + composes-with-`.gitignore` + auto-VCS-floor" pattern. **Diverges where:** `.prettierignore` does NOT honor nested files; OK's D4 explicitly opts in to nested. `.cursorignore` is the closest precedent for nested-honored.

**Cautionary tale:** `.eslintignore` deprecation in v9 — semantics shifted (`temp.js` → `**/temp.js`). Lesson: don't make `.okignore` semantics drift from `.gitignore`. Stay strictly gitignore-syntax-compliant.

### Footguns to design around

- **Cannot re-include inside an excluded parent** — structural git limitation. Workaround requires ancestor re-inclusion at every level. Document in scaffold comment + docs.
- **`**` only as full path component** — `foo-**` collapses to `foo-*`. Already noted in OK's existing config.yml comment (line 37 of dogfood). Carry forward.
- **`node-ignore` does NOT auto-ignore `.git/`** — OK already adds it explicitly. Preserve this.
- **`BUILTIN_SKIP_DIRS` floor is non-overridable today.** With `.okignore`, the question becomes whether to keep the hardcoded floor or expose it as overridable. Default: keep hardcoded (matches Prettier's pattern of "VCS-dir floor outside the filter").

---

## 8. Prior research

| Report | Relevance | Findings to carry forward |
|---|---|---|
| `reports/git-directory-nesting-shadow-repo/REPORT.md` (2026-04-08) | HIGH — directly about `.git/<custom>/` placement | **Confirms `.git/<custom>/` is safe** (untouched by gc/prune/fsck/repack, invisible to clone/push, established pattern via git-lfs / git-annex / git-branchless). Renaming `.git/open-knowledge/ → .git/ok/` preserves this property — both are custom subdirs of `.git/`. Better for worktrees: `.git/<custom>/` is shared across worktrees via main `.git/` (vs. per-worktree copies). |
| `reports/symlink-handling-file-sync-crdt/REPORT.md` (2026-04-12) | LOW-MED — file watcher general behavior; mentions `@parcel/watcher` | Realpath-based identity already handled. No specific impact on rename. |
| `reports/CATALOGUE.md` scan | n/a | No prior reports on `.gitignore` syntax, content-scoping refactors, or `.<tool>ignore` conventions. This is novel territory for the OK codebase. |

---

## 9. Current state

### How `.open-knowledge/` is created/located/locked

1. **Created** at `ok init` — `cli/src/content/init.ts:228` runs `mkdirSync(<projectDir>/.open-knowledge, recursive)` + creates `cache/` subdir + writes `.gitignore` (template) + writes `config.yml` (commented-out defaults). Drift-guarded byte-for-byte against the committed `.open-knowledge/.gitignore`.
2. **Located** at runtime via `OK_DIR` constant (cli) or literal (server-src). Project-local resolution: `loader.ts:172` resolves `projectConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME)`. User-global: `loader.ts:159` resolves `userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME)`. Lock dir resolution: `paths.ts:23` returns `resolve(contentDir, OK_DIR)`.
3. **Locked** at server boot via `acquireServerLock(lockDir, …)` in `server-lock.ts`, called by `bootServer() → createServer()` BEFORE Hocuspocus init. Lock file: `<lockDir>/server.lock` carries PID + bound port. Stale-lock reclamation: PID dead OR mtime > 24h. `<lockDir>/ui.lock` is the peer for the UI server. Released on `destroy()`.

### How `content.include` / `content.exclude` flow

1. **Source:** `config.yml` (project) ↔ Zod-validated by `ConfigSchema` at `core/src/config/schema.ts:30-58`.
2. **Loader:** `cli/src/config/loader.ts` reads YAML + applies precedence (built-in defaults → user → project → flags).
3. **Consumer (boot path):** `cli/src/commands/start.ts:420,427,428` passes `config.content.{dir,include,exclude}` to `bootServer()`, which forwards to `createContentFilter(...)` in `content-filter.ts`.
4. **Authoritative filter:** `content-filter.ts:198-222` runs the 4-step ordered check on every file event. `content.include` → picomatch matcher; `content.exclude` → unioned with `.gitignore` rules in one `ignore`-lib instance.
5. **Watcher prefilter:** `getWatcherIgnoreGlobs()` returns raw glob patterns (drops `!` and `#`) for `@parcel/watcher.subscribe({ ignore })` — best-effort, not authoritative.
6. **Hot reload:** `start.ts:651-652` re-applies on config-watcher reload.
7. **Write paths:** Settings pane UI (3 fields) + MCP `set_config` allowlist (`include` + `exclude` only).

### `loadNestedGitignores` walking pattern

`content-filter.ts:311-363`. Two-pass:
- Pass 1 (bootstrap): root `.gitignore` patterns + `.git` constant + `content.exclude` patterns added to `ignore` instance.
- Pass 2 (walk): recursively descend `contentDir` looking for nested `.gitignore` files. Skips `BUILTIN_SKIP_DIRS` (perf optimization for `node_modules`). Skips dirs already excluded by the bootstrap filter. For each found `.gitignore`, parses patterns and prefixes them with the relative path from project root. Adds prefixed patterns to the same `ignore` instance.

**`.okignore` lift requires extending this walker** to also pick up `.okignore` files at every level the walker visits, OR a parallel walker that does the same job for `.okignore`. The pattern-prefixing logic is reusable.

---

## 10. Unresolved / Adjacent

### UNRESOLVED

- **CRLF behavior in `node-ignore.add(string)`** — UNRESOLVED in upstream docs. OK's `parseGitignorePatterns` already splits on `\n` after `trim()`, so this is handled defensively. Not a blocker.
- **`@parcel/watcher` ignore semantics — exact pattern subset that works** — content-filter.ts comments say "best-effort" and drops `!`/`#` lines. Whether negation patterns silently fail (false positive on `node_modules/!keep-this/`) vs. error is not documented. The post-event authoritative filter masks any error here, so risk is purely perf (extra events through the funnel that get filtered out).

### ADJACENT (relevant but separate decision domains)

- **Codex MCP server name** at `.codex/config.toml:1` — `[mcp_servers.open-knowledge]`. This is a user-facing identifier. Renaming it would force users to update their Codex MCP wiring after pulling. Decision-domain: do we rename to `mcp_servers.ok`, or leave as a separate cosmetic decision? Currently flagged out-of-scope per intake (NG4 doesn't cover it explicitly — worth surfacing).
- **`@inkeep/open-knowledge` package names** — NG4 in SPEC. Out of scope.
- **CLI bin name `open-knowledge`** — NG4. Out of scope.
- **`OK_*` env vars** — NG5. Out of scope (already aligned).
- **AGENTS.md / PROJECT.md / README.md / STORIES.md / docs/content/* mass updates** — In scope per FR4 (all in-repo references update in one PR). Mechanical — not a tracked OQ.
- **Bundle ID `com.inkeep.open-knowledge`** — explicitly LOCKED out of scope (NG6 to be added in SPEC).
- **URL scheme `openknowledge://`** — explicitly LOCKED (NG7 to be added).
- **Writer-ID literal `'openknowledge-service'`** — stable identifier per precedent #25, NOT a path (NG8 to be added).

### Adopt-detection invariant

`state-manifest.ts:17,62,197` checks both `.open-knowledge/` AND `.git/open-knowledge/` for adopt detection. **Both must rename in lockstep with the adopt-detection logic also updated** — otherwise a project with the new `.ok/` and `.git/ok/` would be detected as fresh-init (no manifest + no `.open-knowledge/` + no `.git/open-knowledge/` → fresh-init). This is a semantic correctness concern that goes beyond literal-string replacement.
