# Rename `.open-knowledge/` → `.ok/` and lift content path rules into `.okignore` — Spec

**Status:** Finalized
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-30
**Baseline commit:** 37bf36b42
**Links:**
- Evidence: `./evidence/` (spec-local findings)

---

## 1) Problem statement

**Situation:** Every Open Knowledge project today carries a `.open-knowledge/` directory at its root holding `config.yml`, `server.lock`, and other per-project state, plus a sibling `.git/open-knowledge/` shadow repo for per-writer WIP refs and the upstream-import trail. The project's `config.yml` carries a `content` block with three keys — `dir`, `include`, `exclude` — that govern which files in the project are CRDT documents. Inclusion is a picomatch whitelist; exclusion is unioned with `.gitignore` rules through the `ignore` library. The default `content.include = ['**/*.md', '**/*.mdx']` is redundant with the hardcoded `isSupportedDocFile()` extension gate that already runs upstream of the include match.

**Complication:** Two related friction sources. (1) `.open-knowledge/` is wordy as a per-project artifact; the CLI binary is `ok` and the user-visible project surface is conceptually "OK," so the directory name lags the rest of the naming. (2) Content path rules sit in YAML next to operational config (debounce timings, server host, GitHub OAuth client ID), even though the patterns themselves are precisely the kind of thing developers already author and version-control as `.gitignore` files in the project root. Burying them in a YAML block under a `content` key — with custom-glob semantics layered on `.gitignore` semantics — is a foreign convention where a familiar one fits. The project is pre-release with no external installs to migrate, so the timing to fix both is now.

**Resolution:** Rename `.open-knowledge/` → `.ok/` everywhere it appears (per-project config dir, server lock, shadow repo at `.git/open-knowledge/` → `.git/ok/`, all docs and tests). Replace `content.include` + `content.exclude` with a `.okignore` file at the project root using gitignore syntax, with nested `.okignore` files supported at any folder depth (mirroring `.gitignore`'s nested-file mechanic). `content.dir` stays in YAML — it names the root of content, not a pattern. Pure gitignore semantics: `.okignore` only excludes; the absence of an "include" whitelist is acceptable because `isSupportedDocFile()` already enforces the `.md`/`.mdx` extension gate upstream. Hard cutover, no migrator — pre-release license to break.

## 2) Goals
- G1: Single user-visible per-project directory named `.ok/` instead of `.open-knowledge/` covering all internal state currently under `.open-knowledge/` (config, server lock, anything else discovered during worldmodel) and the shadow repo at `.git/ok/`.
- G2: Path rules for what counts as content live in a `.okignore` file at the project root, with nested `.okignore` supported at any folder depth, using gitignore syntax interpreted by the `ignore` npm library (the same engine the file watcher already uses for `.gitignore`).
- G3: `content.{include,exclude}` is removed from the config schema; `content.dir` remains.
- G4: All in-repo references — code paths, tests, docs, dogfood `.open-knowledge/` directory, CLI scaffolding (`ok init`), templates — are updated to the new names in one PR.

## 3) Non-goals
- **[NEVER]** NG1: Backward-compatible reading of an existing `.open-knowledge/` directory. No fallback path, no legacy-config loader. — Pre-release; user direction is hard cutover.
- **[NEVER]** NG2: Auto-migrator that detects `.open-knowledge/` on startup and renames + lifts `content.{include,exclude}` into `.okignore`. — Same reason.
- **[NEVER]** NG3: Continued support for `content.include` / `content.exclude` keys in `config.yml`. The schema rejects them with a source-located error, the same precedent as `preview.baseUrl` at user scope.
- **[NOT NOW]** NG4: Renaming the package names (`@inkeep/open-knowledge`, `@inkeep/open-knowledge-server`, etc.) or the CLI's primary bin name (`open-knowledge`, with `ok` as alias). — Out of scope for this spec; package-name churn is a separate decision with its own publishing implications. Revisit if: a downstream brand decision lands.
- **[NOT NOW]** NG5: Renaming `OK_*` env vars (e.g., `OK_TEST_CONTENT_DIR`) — already aligned with the new naming.
- **[NEVER]** NG6: Renaming the macOS bundle ID `com.inkeep.open-knowledge` (`packages/desktop/electron-builder.yml:1`). Per `packages/desktop/README.md` this is "LOCKED forever" — the Keychain ACL binds to it. Changing it breaks every existing user's stored credentials.
- **[NEVER]** NG7: Renaming the URL scheme `openknowledge://` (`packages/desktop/electron-builder.yml:131`; `shell-allowlist.ts:18`). It's the deep-link protocol; renaming forces all linkers to update.
- **[NEVER]** NG8: Renaming the writer-ID literal `'openknowledge-service'` (`packages/server/src/persistence.ts:467,478`; `shadow-repo.ts:467`; `contributor-tracker.ts:16`). Per precedent #25 these are stable identifiers in the shadow-repo writer-ID taxonomy, NOT path components.
- **[NEVER]** NG9 (broadened post-audit): Renaming `MCP_SERVER_NAME` from `'open-knowledge'` to `'ok'` in `packages/cli/src/constants.ts:14`, AND any of the 6 editor MCP wirings that consume it via `editors.ts:317-375` (Cursor, VS Code, Codex, Claude Desktop, Claude Code), AND the literal `mcp_servers.open-knowledge` in `.codex/config.toml`. The MCP server identifier flows to LLMs as `mcp__open-knowledge__<tool>` — the agent-readable surface where semantic specificity matters more than brevity. Per D13. Originally NOT NOW (Q9b on Codex only); broadened to NEVER post-audit when investigation revealed the single-constant landscape and the agent-context implication.

## 4) Personas / consumers

This is internal-refactor work; no new external surface. The "consumers" are:

### P1: Open Knowledge developers (the team) and AI coding agents working in the OK monorepo
- **JTBD:** When I'm working in the OK codebase, I want the per-project artifacts to be named consistently with the rest of the product surface, so I have one less mental translation layer.
- **Current workflow + workarounds:** Type `.open-knowledge/` constantly. Live with the name.
- **Pain points:** Verbose path; mismatch with the `ok` CLI brand.
- **Trust/security sensitivities:** None new.
- **Success in their terms:** Greppable, one obvious name, no parallel naming.

### P2: Authors of OK projects (the team's dogfood + future external users post-release)
- **JTBD:** When I'm setting up scoping rules for what counts as content in my project, I want to use a familiar `.gitignore`-style file at the project root, not learn a custom YAML schema.
- **Current workflow + workarounds:** Edit `content.include`/`content.exclude` in `.open-knowledge/config.yml`.
- **Pain points:** Two-source friction (`.gitignore` for git, YAML keys for OK) covering the same conceptual job; YAML glob keys are easy to miss when reviewing project setup.
- **Trust/security sensitivities:** None new.
- **Success in their terms:** Drop a `.okignore` next to `.gitignore`, use the same syntax, get the expected scoping. Override `.gitignore` rules with `!` when wanted (a strict expressiveness gain).

## 5) User journeys

(Not load-bearing for an internal-refactor spec. Filled lightly.)

### P2: Project author scoping content
1. **Discovery** — Sees `.okignore` in a generated `ok init` scaffold or in the docs.
2. **Setup** — `ok init` creates `.ok/config.yml` + a `.okignore` at project root with sensible defaults.
3. **First use** — Edits `.okignore` with familiar gitignore syntax to exclude e.g. `drafts/`. File watcher reloads on edit.
4. **Ongoing use** — Adds nested `.okignore` files in subfolders as needed.
5. **Failure / debug** — Pattern doesn't match what they expected: identical mental model to `.gitignore`, so debugging path is the same.
6. **Growth** — Uses `!` to opt files back IN that `.gitignore` excludes (e.g., a tracked secret-notes folder).

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `.okignore` at project root | n/a | "no patterns; track everything supported-extension" | n/a (parse errors are gitignore-level — silently skip malformed lines, same as git) | applied | n/a |
| Nested `.okignore` | n/a | unscoped | n/a | applied with path prefix | n/a |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: All persisted-state paths under `.open-knowledge/` move to `.ok/` (per-project AND user-home) | `git grep -E '\.open-knowledge'` returns zero hits in source/tests/docs/dogfood (excluding `CHANGELOG.md` historical and shipped-spec corrigenda) | Both `<contentDir>/.open-knowledge/` and `~/.open-knowledge/` rename in lockstep |
| Must | FR2: Shadow repo at `.git/open-knowledge/` moves to `.git/ok/`, AND the telemetry classifier at `fs-traced.ts:43` (literal `${sep}.git${sep}open-knowledge${sep}` for the `'shadow-repo'` cardinality bucket) updates in lockstep | `git grep -E '\.git/open-knowledge'` returns zero hits in source/tests; `fs-traced.test.ts` (or equivalent) verifies shadow-repo writes still bucket as `'shadow-repo'` post-rename | Confirmed safe per `reports/git-directory-nesting-shadow-repo/REPORT.md`. Without the `fs-traced.ts:43` update, post-merge shadow writes silently fall through to the `'git'` classifier — Tempo dashboards lose the shadow-repo split |
| Must | FR3: Adopt-detection in `state-manifest.ts:detectProjectShape()` updates the **shadow-repo path** from `.git/open-knowledge/` → `.git/ok/` ONLY. The `lockDir` parameter remains intentionally `void`-discarded per D14's narrowing (2026-04-27 fix; see docstring lines 60-82). | `detectProjectShape()`: a project with new `.git/ok/` shadow returns `'adopt'`; a project with neither shadow nor manifest returns `'fresh'`; existence of `.ok/` (lockDir) is NOT a signal | Original FR text was wrong (would re-introduce the lockDir-misclassification bug D14 fixed). Corrected post-audit 2026-04-30. |
| Must | FR4: All in-repo references update in one PR — code, tests, docs (Next.js site), repo-instruction docs (CLAUDE.md, AGENTS.md, PROJECT.md, README.md, STORIES.md), shipped-spec corrigenda where appropriate | CI green; manual review of grep-zero | Mechanical |
| Must | FR5: This PR — `OK_DIR` constant updates to `'.ok'` AND every hardcoded `.open-knowledge` literal in source/tests/docs flips to `.ok` via mechanical search-replace. Sites: 9 in `packages/server/src` + 1 in `packages/cli/src/auth/token-store.ts:85` + 2 in `packages/desktop/src/main/` (mcp-wiring.ts:63 + ipc-handlers.ts:342). Plus `fs-traced.ts:43,49,51` telemetry classifiers (with their `${sep}` framing). FR5 ends at literal-flip; OK_DIR routing for these sites is fast-follow per D6. | `git grep -nE "['\"]\.open-knowledge['\"]" -- 'packages/*/src/' ':!packages/*/src/*.test.ts'` returns zero post-this-PR. Telemetry classifiers compile and bucket as `'shadow-repo'` and `'ok-internal'` correctly post-rename | Reviewers see this PR as pure rename. Fast-follow PR (§15 Future Work) handles the OK_DIR-routing systematic pass |
| Must | FR6: `.okignore` at project root participates in content filtering with gitignore syntax | File watcher applies patterns from `.okignore`; `!` negation works; cross-source `!` override of `.gitignore` works (e.g., `!secret.md` in `.okignore` re-includes a file `.gitignore` excludes) | Reuses `ignore` npm library; verified file-name agnostic |
| Must | FR7: Nested `.okignore` at any folder depth is honored | Walker discovers nested `.okignore` files, applies patterns with correct path prefix (mirrors existing `loadNestedGitignores` walking in `content-filter.ts:311`) | Diverges from `.prettierignore`/`.dockerignore` precedent (which DON'T honor nested) — matches `.cursorignore` |
| Must | FR8: `content.include` and `content.exclude` are removed from `ConfigSchema`. YAML loader detects the removed keys at parse time and emits a `REMOVED_KEY`-class error from `core/src/config/errors.ts` (D10) naming the source line in `config.yml` and directing the user to move patterns to `.okignore` | Schema parse rejects keys; field-registry test asserts the keys are absent from the registry; new `errors.ts` test covers the source-located rejection message; YAML loader test verifies the error is emitted with the key name + line number + redirect message | New mechanism per D10 (the `preview.baseUrl` precedent originally cited does not exist as described — audit Finding 4) |
| Must | FR9: `content.dir` remains in `ConfigSchema` unchanged | No change to defaults, scope, or `agentSettable: false` | The "where content lives" knob — orthogonal to filtering |
| Must | FR10: MCP `set_config` allowlist removes `content.include` and `content.exclude` | `set-config.ts` tests for these keys are deleted; allowlist drops to 3 paths (`folders[]`, `mcp.tools.read_document.historyDepth`, `mcp.tools.search.maxResults`); `core/src/config/errors.ts:186` error string updates | Agents can no longer set these keys via MCP — the keys don't exist |
| Must | FR11: Settings pane "Content" section is **removed entirely** (D5 revised). `content.dir` becomes YAML-only | `SettingsPane.tsx` deletes lines 81-103; `SettingsPane.test.ts` removes the Content section's tests; the rendered Settings pane has no Content section | Users wanting non-default `content.dir` edit `config.yml` directly; default `'.'` covers the typical case |
| Must | FR12: `ok init` scaffolds `.ok/` (renamed) AND a `.okignore` at the project root with a commented header (Q10b → D8); both files are committed; drift-guards assert byte-for-byte against templates | New `OK_OKIGNORE_TEMPLATE` constant added; `init.test.ts` extended with byte-for-byte drift-guard for `.okignore`; renamed `OK_GITIGNORE_CONTENT` drift-guard continues to pass post-rename; repo's own `.okignore` ships in the rename PR | Template body: comment header explaining gitignore syntax + `!` cross-source override; no example excludes |
| Must | FR13: PRECEDENTS.md #25 text updates to reference `.git/ok/` | The only precedent that hardcodes the path; renumbering not allowed (precedent #29 retraction taught us slot-stability) | Update text in place |
| Must | FR14: Both — keep self-ignoring `.ok/.gitignore` for git AND add `'.ok'` to `BUILTIN_SKIP_DIRS` for walker perf (Q11b → D9) | `content-filter.ts:39-62` gains one entry (`'.ok'`); `content-filter.test.ts` covers the skip; `.ok/.gitignore` carries forward from current `.open-knowledge/.gitignore` template | Two tiny changes; both targeted |
| Must | FR15: Default project shape exhibits no behavioral regression | An OK project with only `.gitignore` + no custom `content.*` keys (i.e., the dogfood shape) indexes the exact same files post-rename as pre-rename | Verified via integration test: same set of `.md`/`.mdx` files appear in the document index before vs. after |

### Non-functional requirements
- Performance: file-watcher startup time is unchanged or improved (one fewer schema branch; same `ignore` library)
- Reliability: no behavioral regression for the default project shape (project with only `.gitignore` and no custom `content.*` keys behaves identically)
- Security/privacy: no new attack surface
- Operability: `ok init` scaffolds a `.okignore` template; error messages on the now-rejected `content.{include,exclude}` keys point to `.okignore` with the migration recipe
- Cost: none

## 7) Success metrics & instrumentation
- **Metric 1:** Codebase has a single name for the per-project directory.
  - Baseline: 200+ occurrences of `.open-knowledge` across source, tests, docs, dogfood
  - Target: 0 occurrences (verified via `git grep`)
- **Metric 2:** Content path rules expressed in one place per project.
  - Baseline: `content.include` + `content.exclude` + `.gitignore`
  - Target: `.okignore` + `.gitignore`

(No telemetry — pure refactor.)

## 8) Current state (how it works today)

**Summary of current behavior** (full enumeration in `evidence/_init_worldmodel.md` §1, §2, §9):

- The per-project directory `.open-knowledge/` is constructed at server boot via `lockDir = resolve(contentDir, '.open-knowledge')` (`server-factory.ts:279`, literal — NOT routed through the `OK_DIR` constant). It holds `server.lock`, `ui.lock`, `config.yml`, `cache/`, `conflicts.json`, `sync-state.json`, `principal.json`, `state.json`, `last-spawn-error.log`, `tmp/`, plus a committed `.gitignore` that self-ignores everything inside (drift-guarded against `OK_GITIGNORE_CONTENT` template).
- A peer set of paths under `~/.open-knowledge/` holds user-global state: `config.yml` (user defaults), `auth.yml` (CLI plaintext token fallback when keyring unavailable, chmod 0600), `mcp-status.json` (Electron first-launch consent marker), `stats.jsonl` (handoff telemetry), `skill-installed-version` (skill sidecar).
- The shadow repo at `<projectRoot>/.git/open-knowledge/` is a bare git repo holding per-writer WIP refs and the upstream-import journal (precedent #25). Its placement was validated by `reports/git-directory-nesting-shadow-repo/REPORT.md` — invisible to `git clone`, untouched by `gc`/`prune`/`fsck`/`repack`, shared across worktrees.
- Adopt detection (`state-manifest.ts:83-88` `detectProjectShape()`) decides fresh-init vs. adopt by checking ONLY the shadow repo at `<projectRoot>/.git/open-knowledge/`. The `lockDir` parameter is retained for API stability but `void`-discarded — explicit narrowing per D14 (2026-04-27) which fixed a smoke-test bug where a freshly-initialized lockDir was misclassified as adopt. Spec text originally claimed "checks both" — corrected post-audit 2026-04-30.
- The `OK_DIR` constant (`packages/core/src/constants/ok-dir.ts:2`) is the canonical SSOT but is consumed inconsistently: cli is well-routed (~38 OK_DIR uses), server-src is not (only `principal.ts` + `seed/plan.ts` + 2 seed test files import it; the other 16 server-src sites hardcode the `.open-knowledge` literal).
- `content.{dir,include,exclude}` are defined in `ConfigSchema` at `packages/core/src/config/schema.ts:30-58` with defaults `dir: '.'`, `include: ['**/*.md', '**/*.mdx']`, `exclude: []`. `dir` is `agentSettable: false`; `include` and `exclude` are `agentSettable: true` (settable via MCP `set_config` and via the Settings pane UI).
- The flow YAML → ContentFilter: `start.ts:420` reads config; `bootServer()` forwards to `createContentFilter(...)` in `content-filter.ts`; the filter applies a 4-step ordered check on every file event (system-doc gate → `.gitignore` + `content.exclude` unioned in one `ignore`-lib instance → `content.include` picomatch → sibling-asset rule D11 → default reject). `isSupportedDocFile()` (`packages/server/src/doc-extensions.ts`) gates `.md`/`.mdx` extensions UPSTREAM, before `content.include` is consulted.
- Two write surfaces for `content.include`/`content.exclude`: MCP `set_config` allowlist and the Settings pane "Content" section (`SettingsPane.tsx:81-103` — three fields: dir, include, exclude).
- `loadNestedGitignores()` (`content-filter.ts:311-363`) walks `contentDir` recursively for nested `.gitignore` files; prefixes patterns with relative path; supports `!` negation. Skips `BUILTIN_SKIP_DIRS` (23 dirs incl. `node_modules`, `.git`, build outputs, etc.). **`.open-knowledge` is NOT in `BUILTIN_SKIP_DIRS`** — the walker enters it but the committed self-ignore `.gitignore` masks its contents.

**Key constraints:**
- 347 tracked files reference `.open-knowledge` (3,762 line-hits total). Production source: ~70 callsites across server (~46), cli (~20), desktop (~10), app (~6), core (3). Plus ~52 line-hits across docs/.
- Recent rename precedents (3): PR #399 (`standalone.ts` → `server-factory.ts`, hard cutover, 19 files), PR #392 (workspace → project scope rename, hard cutover, 60 files), commit `48d4218` (`.git/openknowledge/` → `.git/open-knowledge/`, shipped a `renameSync` shim — closest precedent for per-machine durable directory rename, but going against the user's hard-cutover direction).
- Bundle ID, URL scheme, and writer-ID literal are LOCKED out of scope (see §3 NG6/NG7/NG8).

**Known gaps/bugs discovered during research:** None that affect this spec. The web channel found `node-ignore` does not auto-ignore `.git/` (callers must add it explicitly); OK already does this at `content-filter.ts:120`. CRLF behavior in `node-ignore.add(string)` is undocumented; OK normalizes upstream via `parseGitignorePatterns` — not a concern.

## 9) Proposed solution (vertical slice)

This is a mechanical rename + a config-shape lift. The design surface is intentionally narrow.

### User experience / surfaces

- **CLI:** `ok init` scaffolds `.ok/` (config + cache + self-ignoring `.gitignore`) AND a project-root `.okignore` with a commented header (D8). `ok start` reads `.ok/config.yml`, acquires `.ok/server.lock`. `ok clone` writes `${OK_DIR}/` (now `.ok/`) to `.git/info/exclude`. `ok stop` reads `.ok/server.lock`.
- **Settings pane:** `Content` section renders as a single-field section with `content.dir` only (D5 / FR11).
- **MCP `set_config`:** allowlist drops to 3 paths — `folders[]`, `mcp.tools.read_document.historyDepth`, `mcp.tools.search.maxResults` (FR10). Agents that previously called `set_config` with `content.include` / `content.exclude` get the standard "not in allowlist" rejection (existing precedent — same shape as `content.dir` rejection today).
- **Docs:** all references update — configuration.mdx, content-filtering.mdx, cli-reference.mdx, getting-started.mdx, github-sync.mdx, mcp-integration.mdx, internals/{lifecycle,server-lifecycle,service-topology}.mdx, plus the homepage hero literal in `sticky-showcase.tsx:656` (Q15 itemize).
- **Error messages on rejected `content.{include,exclude}` keys in YAML:** mirror the precedent at `core/src/config/errors.ts` for `preview.baseUrl` rejection — source-located error pointing at the line in `config.yml` plus a one-line directive: "Move these patterns to `.okignore` at the project root."

### System design

- **Architecture overview:** No architectural change. The `ContentFilter` API surface is unchanged: it accepts a project root, a content dir, and emits `isExcluded` / `isDirExcluded` / `getWatcherIgnoreGlobs` / refcount methods. What changes is the *source* of patterns — `.gitignore` + `.okignore` (parsed by the same `ignore`-lib instance) instead of `.gitignore` + `content.exclude` (YAML).
- **Data model:** `ConfigSchema.content` becomes a single-key shape: `{ dir: string }`. `ConfigSchema` rejects `content.include` and `content.exclude` keys at parse time. `OK_DIR` constant flips from `'.open-knowledge'` to `'.ok'`.
- **API/transport:** No HTTP/wire-format change. CC1 broadcast stays name-only. WebSocket protocol unchanged.
- **Auth/permissions:** No change. `agentSettable` for `content.dir` stays `false`.
- **Enforcement point(s):** `ConfigSchema` (key removal) + `ContentFilter` constructor (load `.okignore` files alongside `.gitignore` files in the same walker pass — extends `loadNestedGitignores` to also pick up `.okignore`). The `BUILTIN_SKIP_DIRS` Set gains `'.ok'` (D9).
- **Observability:** `fs-traced.ts:49,51` telemetry classifier — the substring match becomes derived from `OK_DIR` (D6) but the emitted classifier labels (`'ok-internal'`, `'conflict'`) stay stable for cardinality discipline.

#### Data flow diagram

Primary flow (unchanged in shape):
```
config.yml (YAML) → ConfigSchema (validates content.dir; rejects content.include/exclude)
                                   ↓
                       start.ts → bootServer() → createContentFilter({ projectDir, contentDir, ... })
                                                                      ↓
                       ContentFilter loads:
                          - root .gitignore + nested .gitignore files (existing walker)
                          - root .okignore  + nested .okignore  files (new — extends walker)
                          - all into ONE `ignore` lib instance (cross-source `!` works)
                                                                      ↓
                       file-watcher events → isExcluded() / isDirExcluded() (4-step; step 0 system-doc gate, step 1 ignore-lib check, step 2-3 simplified — no picomatch include matcher, since FR8 removes it)
                                                                      ↓
                       document index → CRDT docs
```

Shadow paths to test (per FR15):
- **nil / missing** — project with no `.gitignore` and no `.okignore`: indexes all `.md`/`.mdx` files honoring only `BUILTIN_SKIP_DIRS` + `isSupportedDocFile()` extension gate. Same as today's behavior with `content.include = ['**/*.md', '**/*.mdx']` and empty `content.exclude`.
- **empty** — empty `.okignore` file (just a comment header): same as nil case.
- **wrong type** — N/A (file is text, not YAML).
- **conflict** — `.gitignore` excludes `secret.md`, `.okignore` has `!secret.md`: cross-source override wins; file is included. Verified per web-channel finding.
- **partial failure** — malformed pattern in `.okignore` (e.g., invalid glob): per `node-ignore` semantics, malformed lines are silently dropped (matches gitignore behavior). No crash.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| ConfigSchema rejection of `content.include` / `content.exclude` | User has these keys in their existing `config.yml` | Parse-time error with source location | User edits `config.yml` to remove keys; moves patterns to `.okignore` | One-time post-rename cleanup; error message points at the fix |
| `.okignore` file is missing | Walker doesn't find it | Silent — no error (parity with missing `.gitignore`) | n/a | Project uses `.gitignore` + `BUILTIN_SKIP_DIRS` + extension gate only |
| Adopt-detection finds `.open-knowledge/` (legacy) but not `.ok/` post-rename | Old dir present, new code looks for new dir | `state-manifest.ts` triggers fresh-init | User notices the existing `.open-knowledge/` dir, deletes it (per PR-described cleanup) | Dogfood-only; pre-release |
| Server lock at `.ok/server.lock` collides with a running server | `acquireServerLock` finds an active PID | Reclaim-or-fail per existing logic | User stops the running server | Standard dev hygiene |

### Alternatives considered

- **A — Phased PRs (rename first, `.okignore` second).** Considered per probe-3 stress test. Rejected per user direction at intake (bundled in seed). Both halves share the "name alignment" theme.
- **B — Auto-migrator on startup.** Considered per intake Q3. Rejected per D3 (user direction: hard cutover, no legacy code in pre-release).
- **C — `content.include` retained alongside `.okignore`.** Considered as a hybrid model. Rejected per D2 (gitignore semantics are expressively complete; `isSupportedDocFile()` extension gate already replaces `content.include`'s only real job; one source of truth simpler).
- **D — Add `.okignore` syntax to support inclusion (custom extension to gitignore).** Considered briefly. Rejected per the `.eslintignore` cautionary tale: don't drift from gitignore semantics.
- **Why we chose this approach:** Simplest expressively-complete model. Reuses existing `ignore` library (already in use). No new dependencies. Mirrors `.gitignore` mental model exactly. Pre-release window justifies hard cutover.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Rename extends to ALL `.open-knowledge`-named dirs: per-project `<contentDir>/.open-knowledge/`, user-home `~/.open-knowledge/`, AND shadow repo at `<projectRoot>/.git/open-knowledge/`. Three rename targets, lockstep | T | LOCKED | No (still pre-release) | User direction 2026-04-30: "keep shadow repo consistent for now." User-home rename follows from "directory name where we store open-knowledge specific paths." Lockstep is the cleanest answer for naming consistency (the original "adopt-detection requires lockstep" rationale was wrong post-audit — `state-manifest.ts:detectProjectShape()` checks only the shadow repo per D14; lockstep stands on consistency grounds alone). | intake; `evidence/_init_worldmodel.md` §1.A/§1.B/§1.C | All three path constructors update; FR3 corrects the shadow-only signal; precedent #25 writer-ID taxonomy literal `'openknowledge-service'` unchanged (NG8) |
| D2 | Pure gitignore semantics for `.okignore`. No "include" whitelist; the absence of `content.include` is acceptable because `isSupportedDocFile()` already gates extensions upstream | T | LOCKED | No | Investigation showed gitignore semantics are expressively complete vs. today's `content.include`+`content.exclude`, with `!` negation as a strict expressiveness gain | `evidence/content-filter-current-behavior.md` (to write) | `content.include` removed from schema; default behavior unchanged for canonical projects |
| D3 | Hard cutover. No migrator code, no legacy `.open-knowledge/` reader, no transitional period | X | LOCKED | No | User direction 2026-04-30: "this is a greenfield project. I don't want to maintain any legacy code or migrators at this point (it is pre-release)" | intake | Aggressively simpler implementation; users with an existing project move the directory + lift their content rules manually |
| D4 | `.okignore` lives at the project root with nested `.okignore` honored at any folder depth (mirrors `.gitignore`) | T | LOCKED | No | User direction 2026-04-30 + parity with `.gitignore` precedent | intake | Reuses the existing `loadNestedGitignores` walking pattern in `content-filter.ts`, extended to also pick up `.okignore` files |
| D5 | Settings pane removes the entire "Content" section. After `content.include` and `content.exclude` are dropped, the section's remaining field (`content.dir`) becomes YAML-only — no longer surfaced in the UI | P | LOCKED | No | User direction 2026-04-30 (Q7a → revised to 5b after C5 design challenge). `content.dir` is a niche knob (defaults to `.` for ~all projects); the single-field section was a UI smell. Settings pane stays focused on configurable preferences | intake; meta/design-challenge.md §[M] Finding 5 | `SettingsPane.tsx:81-103` deletes the entire Content section. `content.dir` remains in `ConfigSchema` as YAML-only (see §11 Q21 for the broader content.dir question) |
| D6 | **Minimal-touch in this PR + fast-follow refactor PR** for `OK_DIR` consistency. This PR: literal-search-replace `.open-knowledge` → `.ok` at every callsite (faster, smaller diff, pure rename). Fast-follow PR (~1 week later): route all hardcoded `.ok` literal sites through the `OK_DIR` constant for SSOT consistency. CI grep gate on this PR catches regressions | T | LOCKED | No | User direction 2026-04-30 (Q8b → revised to "two PRs" after C3 design challenge). Spec's own §14 risk row 7 acknowledged the bundled-pass burden; the fast-follow option wasn't presented at the original Q8 | intake; meta/design-challenge.md §[M] Finding 3 | This PR is reviewable as pure rename. Fast-follow PR is pure refactor (no behavioral change). Each is independently reviewable. See §15 Future Work for the fast-follow PR scope |
| D7 | Codex MCP server identifier `mcp_servers.open-knowledge` in `.codex/config.toml` is NOT renamed. Stays as-is | P | LOCKED | No | User direction 2026-04-30 (Q9b). Avoids forcing every contributor / user-of-OK-via-Codex to update their per-machine `.codex/config.toml`. NG9 confirmed | intake | The `.codex/config.toml` line stays; identifier persists as a stable user-side name |
| D8 | Default `ok init` scaffolds `.okignore` at the project root with a commented header file (no example-defaults), and the file IS committed | P | LOCKED | No | User direction 2026-04-30 (Q10b). Establishes the file + teaches syntax (gitignore-style + `!` for cross-source override) without shipping defaults that may not match the project | intake | New `OK_OKIGNORE_TEMPLATE` constant in `packages/cli/src/content/init.ts` alongside `OK_GITIGNORE_CONTENT`. Drift-guard test asserts byte-for-byte match. Repo's own `.okignore` ships with the rename PR (dogfood) |
| D9 | Both: keep the self-ignoring `.ok/.gitignore` for git's purposes AND add `'.ok'` to `BUILTIN_SKIP_DIRS` for content-filter walker performance | T | LOCKED | No | User direction 2026-04-30 (Q11b). Self-ignoring `.gitignore` is needed for git tracking; adding to BUILTIN_SKIP_DIRS skips the walker descent entirely (perf optimization on big repos). Both changes are tiny | intake | Single-line addition to BUILTIN_SKIP_DIRS in `content-filter.ts:39-62`; `.ok/.gitignore` template carries forward from current `.open-knowledge/.gitignore` (renamed locations only) |
| D10 | FR8 YAML-key-rejection mechanism: build a new custom error case in `packages/core/src/config/errors.ts` for removed `content.{include,exclude}` keys. Error names the path (`config.yml` line + key) and directs the user to `.okignore`. ~30 lines of code | T | LOCKED | No | User direction 2026-04-30 (A4 → 1b). The previously-cited `preview.baseUrl` precedent does not exist as described (audit Finding 4). Default Zod error gives no migration directive; a single new error case is the right shape | meta/audit-findings.md §[H] Finding 4 | Adds one branch in `errors.ts:175-194`-style switch for "REMOVED_KEY" error; YAML loader detects `content.include` / `content.exclude` at parse time and emits the error with source location |
| D11 | D3 hard cutover REAFFIRMED after audit challenge C2 (`48d4218` shim precedent). The closest peer precedent did ship a shim, but user direction (greenfield + pre-release license) overrides | X | LOCKED | No | User direction 2026-04-30 (C2 → 2a). Shim's incremental cost is real but the dogfood team's re-auth + cleanup steps are explicitly accepted | meta/design-challenge.md §[H] Finding 2 | No legacy reader, no `renameSync` migration shim, no transitional flags |
| D12 | `content.dir` remains in `ConfigSchema` as a YAML-only knob (default `.`). Settings pane has no Content section per D5; agentSettable: false unchanged. Removing it was considered (Q21) and rejected — it's the file-watcher subscription root and the resolution root for ~20 callsites; `.okignore` patterns can replicate filtering but NOT watcher-subscription scope | T | LOCKED | No | User direction 2026-04-30 (Q21 → keep). Niche but architectural; `.okignore` is filter-not-scope | Q21 investigation; `evidence/_init_worldmodel.md` §2; meta/design-challenge.md (no challenge raised against this) | No code change for content.dir itself; FR9 stands |
| D13 | `MCP_SERVER_NAME = 'open-knowledge'` constant in `packages/cli/src/constants.ts:14` is RETAINED. All 6 editor wirings (Cursor, VS Code, Codex, Claude Desktop, Claude Code, etc. per `editors.ts:317-375`) continue to register the MCP server as `'open-knowledge'`. Tools surface to LLMs as `mcp__open-knowledge__<tool>`. NG9 broadens to cover the constant + all editor MCP wirings (not just `.codex/config.toml`) | P | LOCKED | No | User direction 2026-04-30 (Q22 → retain). LLM tool selection uses semantic hints; `'open-knowledge'` carries clear meaning, `'ok'` is overloaded English. CLI bin / directory / docs are user-visible and stay `ok`; MCP identifier is agent-visible and stays `open-knowledge` | Q22 investigation; meta/design-challenge.md §[M] Finding 6 (counter-argument considered + rejected on agent-context grounds) | No code change for MCP_SERVER_NAME or editor wiring code. NG9 explicitly broadens |

## 11) Open questions

(Backlog grounded by worldmodel; intake seeds Q1-Q6 resolved and folded into evidence. Will grow during Step 4 + iterative loop.)

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q7 | Settings pane "Content" section disposition | P | P0 | Yes (FR11) | — | **Resolved → D5 (revised; remove section entirely; `content.dir` becomes YAML-only)** |
| Q8 | OK_DIR consistency pass — minimal-touch or systematic | T | P0 | No | — | **Resolved → D6 (revised; minimal-touch THIS PR + systematic fast-follow PR)** |
| Q21 | Should `content.dir` be removed entirely? | T | P0 | No | — | **Resolved → D12 (keep as YAML-only; architectural value as watcher-subscription root)** |
| Q22 | Rename `MCP_SERVER_NAME` to `'ok'`? | P | P0 | Yes (NG9) | — | **Resolved → D13 (retain `'open-knowledge'`; NG9 broadens to cover the constant + all editor wirings)** |
| Q9 | Codex MCP server identifier rename | P | P0 | No | — | **Resolved → D7 (Q9b stays as-is, NG9 holds)** |
| Q10 | Default `.okignore` template for `ok init` | P | P0 | Yes (FR12) | — | **Resolved → D8 (Q10b commented header, committed)** |
| Q11 | `BUILTIN_SKIP_DIRS` strategy | T | P0 | Yes (FR14) | — | **Resolved → D9 (Q11b — both: self-ignoring `.gitignore` AND add to BUILTIN_SKIP_DIRS)** |
| Q12 | `clone.ts` `.git/info/exclude` line update | T | P0 | No | — | **Resolved DELEGATED** — pure rename per D3; legacy entries from previously-cloned projects are harmless cruft, not worth detection logic |
| Q13 | Verify `ignore` npm package version | T | P0 | No | Grepped `packages/server/package.json:37` → `"ignore": "^5.3.2"` | **Resolved DELEGATED** — `5.3.2` is safe; cross-source `!` negation works at 5.x per web channel. No version bump required (could upgrade to 7.0.5 separately, no functional gain) |
| Q14 | Tests setting non-default `content.include`/`exclude` — rewrite to `.okignore` parsing or delete | T | P0 | No | — | **Resolved DELEGATED** — itemize at implementation: `content-filter.test.ts` rewrites to use `.okignore` parsing; `set-config.test.ts` cases for removed keys are deleted; `loader.test.ts:155-164` becomes a "key rejected" test; `preview.test.ts` cases adapt to read `.okignore` |
| Q15 | Doc site rewrite scope | P | P0 | No | — | **Resolved DELEGATED** — itemize at implementation; 52+ line-hits across `configuration.mdx`, `content-filtering.mdx`, `cli-reference.mdx`, `getting-started.mdx`, `github-sync.mdx`, `mcp-integration.mdx`, `internals/{lifecycle,server-lifecycle,service-topology}.mdx`, plus `docs/src/app/(home)/sticky-showcase.tsx:656` |
| Q16 | Field registry test (`packages/core/src/config/field-registry.test.ts:134-155`) asserts `content.{include,exclude,dir}` registry entries — must update to drop `include` and `exclude` rows | T | P0 | No | — | **Resolved DELEGATED** — mechanical; surfaced by completeness re-sweep |
| Q17 | Errors string at `core/src/config/errors.ts:186` literal `"Agent-settable paths: content.include, content.exclude, folders[],"` must drop the two removed keys | T | P0 | No | — | **Resolved DELEGATED** — mechanical; surfaced by completeness re-sweep |
| Q18 | Pre-existing unreleased changeset `.changeset/init-gitignore-consolidation.md` — verify no conflict with the rename PR's changes; if conflict, fold into the rename's changeset | P | P0 | No | — | **Resolved DELEGATED** — verify at implementation start; fold if needed |
| Q19 | Published JSON schemas `dist/schemas/v0/config.{project,user}.schema.json` regenerate automatically from updated `ConfigSchema` via `packages/cli/scripts/build-config-schema.mjs` — verify the build runs and outputs match | T | P0 | No | — | **Resolved DELEGATED** — `bun run check` runs the schema build; CI catches drift |
| Q20 | `~/.open-knowledge/` user-home rename causes a one-time re-prompt for stored credentials (`auth.yml`), first-launch consent (`mcp-status.json`), telemetry stats (`stats.jsonl`), skill-install marker — all become "first run" at the new `~/.ok/` paths post-rename | X | P0 | No | — | **Resolved DELEGATED** — expected behavior per D3 hard cutover; document in PR description as "expected re-prompt for dogfood team on first run after merge" |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The `ignore` npm library treats `.okignore` files identically to `.gitignore` files (i.e., file name is conventional; library only cares about pattern strings) | HIGH | Read library source | Before finalization | Active |
| A2 | `isSupportedDocFile()` is a sufficient upstream gate to replace `content.include`'s extension whitelist function | HIGH | Worldmodel + Step 3 read of doc-extensions module | Before finalization | Active |
| A3 | No external installs depend on `.open-knowledge/` because the project is pre-release | HIGH (CLAUDE.md states pre-release) | None — user-confirmed | Locked | Active |

## 13) In Scope (implement now)

- **Goal:** Rename `.open-knowledge/` → `.ok/` (per-project, user-home, shadow repo) AND lift content path rules from `config.yml` (`content.include`, `content.exclude`) into a `.okignore` file at the project root with `.gitignore`-syntax (gitignore-faithful) semantics. Hard cutover, single PR.
- **Non-goals:** §3 NG1-NG9.
- **Requirements with acceptance criteria:** §6 FR1-FR15 (gates: `git grep -E '\.open-knowledge'` → 0; `git grep -E '\.git/open-knowledge'` → 0; full `bun run check:full:parallel` green; integration tests for adopt-detection at new paths; drift-guards pass for both `.ok/.gitignore` and new `.okignore` template).
- **Proposed solution:** §9 (vertical slice; system design — to be drafted as a tight implementation outline since the design surface is mechanical).
- **Owner(s)/DRI:** Andrew Mikofalvy.
- **Next actions (tickets/tasks):** Step 8 finalization derives `Agent Constraints` (§16). Implementation ships via `/ship` against this spec on a feature branch.
- **Risks + mitigations:** §14.
- **What gets instrumented/measured:** No new instrumentation — pure refactor. The existing `fs-traced.ts` cardinality classifier (`'ok-internal'`, `'conflict'`) labels persist; only the underlying path-segment string updates (D6).

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Dogfood team has stored credentials at `~/.open-knowledge/auth.yml` etc. that become inaccessible on first run after merge | Hard cutover per D3; document re-prompt in PR description | Manual: dogfood team confirms re-auth works once |
| Worktree `.git/open-knowledge/` shadow repos exist on dev machines; rename means the new code looks for `.git/ok/` and treats existing projects as fresh-init | Adopt-detection FR3 covers; existing shadow repo at `.git/open-knowledge/` becomes orphan (harmless directory in `.git/`); user can `rm -rf .git/open-knowledge` after pulling the rename PR | Adopt-detection integration test |
| `.ok/server.lock` collisions if a server is running at PR merge time | Standard dev hygiene (stop server before pulling); no migration code per D3 | Documented in PR |
| Cloned projects (via `ok clone`) carry obsolete `.open-knowledge/` line in `.git/info/exclude` | Harmless cruft per Q12; pure rename | n/a |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Missed rename site across 70+ source callsites + 52+ doc lines | Med | Med (silent runtime breakage if a literal escapes; broken docs if a doc reference escapes) | Mechanical grep gates: `git grep -E '\.open-knowledge'` and `git grep -E '\.git/open-knowledge'` must return zero; full `bun run check:full:parallel` before merge | |
| Adopt-detection update applied incorrectly — D14 (2026-04-27) narrowed `detectProjectShape()` to check ONLY the shadow repo. An implementer reading the original (now-corrected) FR3 might re-broaden the check to "either signal triggers adopt," which would re-introduce the lockDir-misclassification bug D14 fixed | Low (corrected in spec) | High pre-bug, contained post-mitigation | FR3 explicitly checks shadow-repo only; `state-manifest.test.ts` (or equivalent) covers the corrected contract; docstring at lines 60-82 of state-manifest.ts is the authoritative reference | |
| Drift-guard test (`init.test.ts:205-231`) breaks when `.open-knowledge/.gitignore` template moves to `.ok/.gitignore` | High (will break) | Low (test catches it; fix is mechanical) | Update template + test in same commit | |
| Settings pane redesign cost underestimated (Q7) — depending on disposition, this could be a single-field reduction or a full section removal with route changes | Med | Low-Med | Resolve Q7 early in iterative loop with explicit option enumeration | |
| Server-src OK_DIR inconsistency tempts a scope expansion (Q8) — if we route the 16 server-src sites through `OK_DIR` mid-rename, the diff size jumps significantly | Med | Med (PR review burden) | Default to minimal-touch (Q8 recommendation); systematic pass is a separate tracked refactor | |
| `.okignore` semantics surprise — missing include-whitelist makes a project suddenly index unexpected files when `.gitignore` is incomplete | Low | Low | `isSupportedDocFile()` extension gate prevents non-markdown indexing; `BUILTIN_SKIP_DIRS` covers typical offenders; FR15 verifies the default project shape exhibits no behavioral regression | |
| `node-ignore` doesn't auto-ignore `.git/` (web-channel finding) | Low | Low | OK already adds `.git` explicitly at `content-filter.ts:120`; preserve in the refactor | |
| OK_DIR systematic pass (D6) inflates rename PR scope beyond pure-rename | High (will happen) | Low (mechanical refactor; tests catch issues) | Reviewer pre-warned in PR description; commit history splits "OK_DIR routing pass" from "literal value flip" so the diff is reviewable in two passes | |
| Pre-existing changeset `.changeset/init-gitignore-consolidation.md` may conflict with rename PR's gitignore-template changes | Low | Low | Q18 — verify at implementation start; fold if needed | |

## 15) Future Work

### Identified
- **CLI bin rename to drop `open-knowledge`** — Drop the long-form `open-knowledge` bin in favor of `ok` only. Requires npm publishing decision.
- **OK_DIR systematic-routing fast-follow PR** (D6 split): Route all `.ok` literal sites discovered post-rename through the `OK_DIR` constant. Pure refactor with zero behavioral change. Sites: 9 in `packages/server/src` + 1 in `cli/src/auth/token-store.ts` + 2 in `desktop/src/main/` + 3 in `fs-traced.ts`. Rename PR ships first; this PR is reviewable in isolation as a refactor.
  - What we learned: monorepo-wide audit catalogued 15 hardcoded sites across 4 packages.
  - Recommended approach: import OK_DIR from `@inkeep/open-knowledge-core`; replace literal `'.ok'` with `OK_DIR` in path constructors. Telemetry classifiers in `fs-traced.ts` derive path segments from OK_DIR (with appropriate `${sep}` framing).
  - Why not in scope now: Q8 → D6 split decision — keep this PR as pure rename, do the consistency-pass as a follow-up.
  - Triggers to revisit: rename PR merges + a 1-week settling period.
  - Implementation sketch: ~50-line PR; CI grep gate from FR5 (literal-zero) holds throughout.

## 16) Agent constraints

**SCOPE — files/directories this PR touches:**
- `packages/core/src/constants/ok-dir.ts` (OK_DIR constant flip `'.open-knowledge'` → `'.ok'`)
- `packages/core/src/config/schema.ts` (remove `content.include` + `content.exclude` Zod leaves; keep `content.dir`)
- `packages/core/src/config/errors.ts` (add `REMOVED_KEY`-class error case per D10)
- `packages/core/src/config/field-registry.test.ts` (drop registry entries for removed keys)
- `packages/server/src/content-filter.ts` (extend `loadNestedGitignores` to also pick up `.okignore`; add `'.ok'` to `BUILTIN_SKIP_DIRS`; remove picomatch include matcher; collapse the 4-step logic accordingly)
- `packages/server/src/state-manifest.ts` (update only the `shadowRepoDir` path string `.git/open-knowledge` → `.git/ok`; preserve D14 narrowing — `lockDir` stays unused)
- `packages/server/src/fs-traced.ts` (lines 43, 49, 51 — telemetry classifier path-segment strings)
- `packages/server/src/server-factory.ts:279`, `backlink-index.ts:767`, `conflict-storage.ts:50`, `managed-rename-journal.ts:30`, `skill-install.ts:86`, `sync-engine.ts:224`, `upload-streaming.ts:87`, `api-extension.ts:5198` (server-src literal flips)
- `packages/server/src/shadow-repo.ts` (shadow path; legacy R9 rename shim from commit `48d4218` is OUT of scope to touch)
- `packages/cli/src/auth/token-store.ts:85` (literal flip)
- `packages/cli/src/commands/init.ts` + `packages/cli/src/content/init.ts` (scaffold `.ok/` + new `.okignore` template at project root, both committed; OK_GITIGNORE_CONTENT carries forward to `.ok/.gitignore`)
- `packages/cli/src/content/init.test.ts` (drift-guards for both `.ok/.gitignore` and new `.okignore` template)
- `packages/cli/src/mcp/tools/set-config.ts` (drop `content.include` + `content.exclude` from allowlist; reduces to 3 paths)
- `packages/desktop/src/main/mcp-wiring.ts:63` (`MCP_STATUS_DIR_NAME` literal flip)
- `packages/desktop/src/main/ipc-handlers.ts:342` (`STATS_FILE_RELATIVE_PATH` literal flip)
- `packages/app/src/components/settings/SettingsPane.tsx:81-103` (delete entire Content section)
- `packages/app/src/components/settings/SettingsPane.test.ts` (drop Content-section tests)
- `packages/app/src/server/hocuspocus-plugin.ts:65` (Vite plugin literal)
- `packages/app/scripts/perf-prod.sh` (bash literals)
- `packages/app/src/components/{ConnectingBanner,SeedDialog}.tsx` (UI labels)
- `docs/content/**/*.mdx` (~52 line-hits, ~10 files: configuration, content-filtering, cli-reference, getting-started, github-sync, mcp-integration, internals/{lifecycle,server-lifecycle,service-topology})
- `docs/src/app/(home)/sticky-showcase.tsx:656` (homepage hero literal)
- Repo-instruction docs: `AGENTS.md`, `PROJECT.md`, `README.md`, `STORIES.md`, `CLAUDE.md` (all references to `.open-knowledge/` and `.git/open-knowledge/`)
- `PRECEDENTS.md` (#25 text update — re-text to reference `.git/ok/`; do NOT renumber)
- `.open-knowledge/` → `.ok/` (dogfood directory rename) including `.open-knowledge/.gitignore` → `.ok/.gitignore` and `.open-knowledge/config.yml` → `.ok/config.yml`
- `.gitignore` (root — line 75 comment update)
- New: `.okignore` at project root with commented-header template (FR12)

**EXCLUDE — do NOT touch:**
- `packages/cli/src/constants.ts:14` (`MCP_SERVER_NAME = 'open-knowledge'` per D13/NG9)
- `packages/cli/src/commands/editors.ts:317-375` (consumes `MCP_SERVER_NAME` per D13/NG9)
- `packages/cli/src/commands/init.test.ts` (per-editor MCP wiring tests assert `mcpServers['open-knowledge']` — protected MCP identifier per NG9; do NOT flip these literals)
- `.codex/config.toml` (`[mcp_servers.open-knowledge]` per NG9)
- `packages/server/src/persistence.ts:467,478`, `shadow-repo.ts:467`, `contributor-tracker.ts:16` (writer-ID literal `'openknowledge-service'` per NG8)
- `packages/desktop/electron-builder.yml:1,131` (bundle ID `com.inkeep.open-knowledge` per NG6; URL scheme `openknowledge://` per NG7)
- `packages/desktop/src/main/shell-allowlist.ts` (URL scheme allowlist per NG7)
- All `package.json` files (package names per NG4)
- `packages/cli/package.json` `bin` field (CLI bin name `open-knowledge` per NG4)
- All `.changeset/*.md` historical entries (except adding a new changeset for this PR)
- All `CHANGELOG.md` files (historical record)
- All shipped specs in `specs/2026-04-*` (corrigendum rule per CLAUDE.md — append breadcrumb on same line if needed; do NOT rewrite)
- `packages/server/src/shadow-repo.ts` R9 `renameSync` shim from commit `48d4218` (legacy code preserves prior `openknowledge` → `open-knowledge` rename semantics; out of scope)

**STOP_IF — halt and seek review if any of these fire:**
- After implementation, `git grep -nE "['\"]\.open-knowledge['\"]" -- 'packages/*/src/' ':!packages/*/src/*.test.ts'` returns non-zero
- `git grep -nE '\.git/open-knowledge'` returns non-zero in source/tests (excluding shipped specs + reports)
- Adopt-detection contract regresses (`state-manifest.test.ts` or equivalent fails; the contract is "shadow-repo only" per D14 + this spec's FR3 — do NOT broaden it)
- Drift-guard fails for either `.ok/.gitignore` or new `.okignore` template (`init.test.ts` byte-for-byte assertions)
- `fs-traced` test or telemetry sanity check shows shadow-repo writes bucketing as `'git'` instead of `'shadow-repo'` post-rename (FR2 missed)
- Field-registry test catches a leak (`content.include` or `content.exclude` still registered)
- `bun run check:full:parallel` fails for any reason
- Cross-cutting threading (telemetry, schema-publish, error-envelope) shows divergence between the rename PR and the fast-follow OK_DIR refactor PR

**ASK_FIRST — confirm before doing any of these:**
- Adding any read of legacy `.open-knowledge/` paths (D3/D11 hard cutover prohibits — no legacy reader, no shim, no fallback)
- Modifying `MCP_SERVER_NAME` constant or any editor wiring in `editors.ts` (NG9 broadened per D13)
- Modifying writer-ID literal `'openknowledge-service'` (NG8)
- Modifying bundle ID, URL scheme, or package names (NG4/NG6/NG7)
- Adding new `content.*` schema fields beyond `content.dir` (out of scope; raise as a follow-up spec)
- Adding `.okignore` semantics that diverge from `.gitignore` (e.g., new directives like gcloud's `#!include:`) — D2 explicitly stays gitignore-faithful per `.eslintignore` cautionary tale
- Bundling the OK_DIR systematic refactor pass into this PR (D6 explicitly fast-follows)
