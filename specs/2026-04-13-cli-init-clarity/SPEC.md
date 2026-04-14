# CLI init clarity — Spec

**Status:** Approved
**Owner(s):** Andrew
**Last updated:** 2026-04-13
**Baseline commit:** cafed34
**Links:**
- Evidence: `./evidence/`
- Audit: `./meta/audit-findings.md` · Design challenge: `./meta/design-challenge.md`
- Related project (planned, not yet created): `projects/day-0-editor-completeness/` — ED-4 (web onboarding)
- Related story: `stories/init-and-project-switching/STORY.md` (Part A invariant I-A3)
- Source feedback: Nick — *"completely unclear what Init does — ran it and it just included all my markdown files, had to dig into config to understand what happened."*

---

## 1) Problem statement

**Situation.** `open-knowledge init` (`packages/cli/src/commands/init.ts`) scaffolds `.open-knowledge/`, registers the MCP server in selected editor configs (interactive multi-select), and prints a static summary of files written + a "Next steps" hint. Default content scope is `**/*.md` with empty excludes — every markdown file under the project root becomes editable content unless gitignored. The CLI never previews what that resolves to. `open-knowledge start` does have a `--open` flag (`start.ts:13,223-229`) but it is macOS-only (`execFile('open', [url])` — no `xdg-open` / `cmd /c start` fallback). `start` also auto-scaffolds `.open-knowledge/` on first run if missing (`start.ts:35-50`), so there are effectively two init paths in production today.

**Complication.** Three legibility gaps intersect at first contact with the product:
1. **Output describes mechanics, not consequences.** "Created AGENTS.md, .gitignore, config.yml" tells the user what the CLI did to itself, not what changed about their project. With `**/*.md` default, the user can't tell from output whether 5 docs or 500 vendored markdown files just became content.
2. **No preview before committing, no preview on demand.** The only way to learn what content the watcher will track is to run `init` and then start the server and check the sidebar — there is no read-only inspection verb. After init, the user has no way to re-check ("did adding `vendored-docs/` actually get picked up?") without restarting the server.
3. **Cross-platform browser bridge incomplete.** `start --open` works on macOS, logs an error and prints no URL hint on Linux/Windows. The "next steps: open your editor" hint relies on a bridge that doesn't fully exist on every platform.

The compound effect: a user's first 60 seconds with the product are spent in the terminal forming a trust judgment from output that reads as a black box. Web-editor onboarding (planned as ED-4 in `projects/day-0-editor-completeness/`, **not yet created**) will eventually fix the in-browser side, but the terminal moment will remain broken — and the existing story `stories/init-and-project-switching/` invariant I-A3 requires CLI and UI initialization produce structurally identical outcomes, including the legibility surface.

**Resolution.** Two additions and one fix to the CLI:
- **R1 — Post-init content preview.** After init writes the scaffold, surface what the file watcher will pick up: file count, content directory, applied include/exclude scope, sample of paths, and a config-key snippet. Reuses `ContentFilter` from `@inkeep/open-knowledge-server` (bundled into the CLI by tsdown via `alwaysBundle`).
- **R2 — `open-knowledge preview` standalone verb.** Read-only command that prints the same content block on demand. Works pre-init, post-init, and after config edits — addresses both the pre-commit case (Evaluator persona) and the ongoing-use case (vendored docs added later, `content.exclude` edited).
- **R3 — Cross-platform `start --open`.** Replace macOS-only `execFile('open', ...)` with platform-aware launch (`open` / `xdg-open` / `cmd /c start`).

R1 + R2 share the same `previewContent()` helper. R3 is independent and bundled because it's a 10-line fix with a documented escape hatch (URL is always printed; auto-launch is best-effort).

## 2) Goals

- **G1:** A first-time user reading `open-knowledge init` output understands which files in their project will become content, without reading config files or source code.
- **G2:** A user can preview content scope on demand — before init, after init, after config edits — via a dedicated read-only verb.
- **G3:** `start --open` works on macOS, Linux, and Windows; falls back gracefully to printing the URL when no launcher is available.

## 3) Non-goals

- **[NOT NOW]** NG1: Interactive content-scope adjustment in the CLI (e.g., prompts to narrow include/exclude). The preview verb shows the user the result; refining scope happens by editing `.open-knowledge/config.yml`. — Revisit if: users hit "the default is too broad" as a recurring complaint that editing config doesn't address.
- **[NOT NOW]** NG2: `init --dry-run` flag. `open-knowledge preview` covers the "what will the watcher pick up?" question; describing scaffold side-effects in advance is lower-value once preview exists. — Revisit if: users specifically want a "what would init write?" inspection.
- **[NOT NOW]** NG3: Browser-open after `init` (`init --start --open` chain). Keep `init` and `start` as separate verbs. — Revisit if: telemetry shows users always run `init` then `start` back-to-back.
- **[NOT NOW]** NG4: First-document creation prompt for empty-content directories ("Create your first article?"). Belongs in the web onboarding flow (ED-4), not the CLI. — Revisit if: ED-4 ships and parity demand emerges.
- **[NEVER]** NG5: A TUI for browsing / selecting content files in the terminal. CLI is one-shot output, not interactive content browsing.
- **[NOT UNLESS]** NG6: *Hidden* auto-narrowing of the default include scope (e.g., silently switching to `docs/**/*.md` if `docs/` exists). Hidden defaults break the invariant that what the CLI shows matches what the watcher will index. — Revisit if: explicit, preview-printed detection (e.g., "Detected `docs/` — defaulting `content.dir` to `docs/`. Override in config.yml.") is specced as its own change. Tracked in §15 Future Work as "Smarter detected defaults."

## 4) Personas / consumers

- **P1 — First-time user (primary).** Just ran `npx @inkeep/open-knowledge init` for the first time. Has no mental model of the product. Forms a trust judgment from terminal output in the first 60 seconds. Nick is the canonical example.
- **P2 — Evaluator.** Trying the product on an existing repo with messy markdown (vendored docs, archived notes, generated content). Wants to inspect content scope before committing to init's side effects, and wants to re-check after editing `config.yml`.
- **P3 — Returning user / debugger.** Already initialized; sidebar feels wrong (too many or too few files). Wants a "what does the watcher think it should track right now?" answer without restarting the server.
- **P4 — Power user / scripter.** Uses `--editor`, `--no-mcp`, may want machine-readable preview output for piping. Lower priority for v1; flag if scope creeps.

## 5) User journeys

### P1 happy path
1. User runs `npx @inkeep/open-knowledge init` in a project with 50 markdown files in `docs/`.
2. CLI scaffolds, writes MCP config, then prints:
   - "Scaffolded `.open-knowledge/`"
   - MCP server registration table
   - Content block (see §9)
   - Existing "Next steps" block, including a hint to run `open-knowledge preview` if scope ever needs re-checking
3. User runs `open-knowledge start --open`. Browser launches; sidebar shows the 50 files.

### P2 happy path (pre-init inspection)
1. User runs `open-knowledge preview` in a fresh repo.
2. CLI loads config (schema defaults — `.open-knowledge/config.yml` does not exist yet), runs `previewContent()`, prints the content block. No filesystem writes.
3. User either (a) accepts the defaults and runs `open-knowledge init`, or (b) manually creates `.open-knowledge/config.yml` with a narrower scope first, re-runs `preview` to confirm, then runs `init`. Path (b) is for users who want scope locked down before init's MCP-registration side effects; the preview output's config snippet doubles as the template to copy. `init` skips scaffold files that already exist (reports them under "Skipped (already exist)" rather than overwriting) so a hand-crafted `config.yml` survives.

### P3 happy path (post-init re-check)
1. User added a `vendored-docs/` directory with 800 markdown files. Sidebar feels cluttered.
2. User runs `open-knowledge preview`. Output shows total count jumped to 850 with samples from `vendored-docs/`.
3. User edits `config.yml` to add `vendored-docs/**` to `content.exclude`, re-runs `open-knowledge preview`, sees count drop to 50.

### Failure / recovery
- **Content directory has 10,000+ files:** preview enumerates lazily, caps the sample, shows total count. No hang. (See A3 / NFR.)
- **`ContentFilter` throws (e.g., malformed `.gitignore`):** preview prints a warning ("Could not enumerate content: <reason>") but does not block init from completing. Init exits 0; user has scaffold but no preview. Standalone `preview` exits 1 (no other work to do; the warning IS the output).
- **`start --open` fails to find a browser launcher:** print URL with a clear hint ("Could not auto-open browser; visit `<url>` manually"). Exit 0 (server still runs).

## 6) Requirements

### Functional
| Priority | Requirement | Acceptance criteria |
|---|---|---|
| Must | R1 — content preview after init | After `runInit()` succeeds, output includes total file count matching `ContentFilter` enumeration, content directory path, applied include/exclude patterns, ≤5 sample paths, and a 3-line config snippet showing how to adjust scope. Verified by integration test against a tmpdir with N seeded `.md` files. |
| Must | R2 — `open-knowledge preview` standalone verb | `open-knowledge preview` runs the same content block as R1 with zero filesystem writes. Works pre-init (loads schema defaults), post-init (loads from `.open-knowledge/config.yml`), and after config edits (re-reads on every invocation). Exit 0 on success; exit 1 if `previewContent()` throws unrecoverably. Verified by: (a) hash `.open-knowledge/` and `.mcp.json` before/after — both unchanged or absent; (b) integration test seeds files, edits exclude, re-runs preview, asserts count drops. |
| Must | R3 — cross-platform `start --open` | `start --open` invokes the correct platform launcher. Verified by unit test stubbing `child_process.execFile` and asserting `{cmd, args}` equals `('open', [url])` on darwin, `('xdg-open', [url])` on linux, `('cmd', ['/c', 'start', '', url])` on win32. Falls back to printing URL with a clear message if launcher missing (callback err is non-fatal). |
| Should | R4 — preview cap + truncation | Sample is capped at 5 paths. Total count is exact. If enumeration exceeds a soft limit (e.g., 10k files), still report exact count. |
| Should | R5 — preview block in `start`'s auto-init path | When `start` triggers auto-init (`didAutoInit === true`), render the preview block AFTER the boxed banner and ready-on URL line. Gated by `didAutoInit` so it only fires on first-run-via-start, not on subsequent `start` invocations. |
| Could | R6 — `--json` output for scripting | Machine-readable preview output. Defer to P4 demand. |

### Non-functional
- **Performance:** Preview enumeration completes in <2s for repos with up to 10k files (see A3 — verified during implementation). <500ms for typical repos (<500 files).
- **Reliability:** Preview failure must not block init. Init's exit code reflects scaffold + MCP-write success only.
- **Security/privacy:** Preview output is local-only (terminal). No telemetry. Sample paths shown verbatim — assume the user owns the terminal output.
- **Operability:** No new logging surface needed; existing `getLogger('init')` covers warnings. The Content block (both `init` and `preview`) prints to **stderr**, preserving stdout for a future `--json` mode (R6) and keeping shell pipelines pristine for P4. Warnings and errors also go to stderr. This matches Vite / npm / other CLIs that reserve stdout for machine-consumable output.
- **Cost:** Filesystem walk only. No network.

## 7) Success metrics & instrumentation

- **Primary:** Qualitative — re-run the test with Nick (or equivalent first-time user) post-ship. Target: they can answer "what files just became content?" from terminal output alone, without opening config or running other commands.
- **Secondary:** Internal team usage of `open-knowledge preview` after vendored-docs / config edits.
- **Instrumentation:** None. Local CLI; no telemetry pipeline exists. Validation is qualitative + manual.

## 8) Current state

- `runInit()` (`init.ts:171`) returns `InitCommandResult` with `contentCreated`, `contentSkipped`, `editors[]`. No content-preview field.
- `formatInitResult()` (`init.ts:232`) renders the scaffold + MCP summary. No content section.
- `ContentFilter` lives at `packages/server/src/content-filter.ts`, `createContentFilter({projectDir, contentDir, includePatterns, excludePatterns})`. CLI declares `@inkeep/open-knowledge-server` as a workspace **devDependency**; `tsdown.config.ts` lists it under `deps.alwaysBundle`, so it ships inlined inside `dist/cli.mjs`. No runtime resolution needed.
- `start --open` exists at `start.ts:13,223-229` — macOS-only via `execFile('open', [url])`. Failure logs `Failed to open browser: <err>` (not silent).
- `start` auto-init at `start.ts:35-50` calls `runInit({cwd, mcp: false})` if `.open-knowledge/` missing.
- File watcher's startup walk (`file-watcher.ts:seedLastKnownHashes`) uses the same `ContentFilter` — so a CLI preview that reuses `ContentFilter` will report exactly what the watcher indexes.
- Configured defaults from `config/schema.ts:6-14` (verified): `content.include: ['**/*.md']`, `content.exclude: []`, `content.dir: '.'`.

## 9) Proposed solution (vertical slice)

### User experience / surfaces
- **CLI output (init):** Append a "Content" block after the existing "MCP server configuration" block, before "Next steps". The block leads with a plain-English scope summary, then the raw pattern syntax for users who want precision. Example (project-wide scope, >N files):
  ```
  Content:
    Found 50 markdown files (all markdown in this project and subdirectories).
    Scope: include=**/*.md  exclude=(none)
    Sample: docs/intro.md, docs/api.md, README.md, …

    Looks broader than you want? Edit .open-knowledge/config.yml:
      content:
        include: ["docs/**/*.md"]   # narrow to one directory
        # or:
        exclude: ["vendor/**"]      # keep broad scope, skip noise

    Re-check anytime: open-knowledge preview
  ```
  - **Plain-English line formula.** Derive the human summary from `(contentDir, include, exclude)`:
    - Default (`contentDir: '.'`, `include: ['**/*.md']`, `exclude: []`) → "all markdown in this project and subdirectories"
    - Narrowed contentDir (`contentDir: 'docs'`) → "all markdown under `docs/`"
    - Non-empty exclude → append " (excluding N pattern(s))"
  - **Broad-scope hint.** When scope is project-wide (`contentDir: '.'`, empty exclude) AND `totalCount > 20`, render "Looks broader than you want?" above the snippet. Otherwise render the neutral "To adjust, edit .open-knowledge/config.yml:" lead-in. The threshold and copy are tuned so narrow/intentional scopes don't get nudged.
  - **Contextual snippet.** If `docs/` exists at the project root, the `include` example is `["docs/**/*.md"]`. Otherwise (no conventional content root detected), the snippet leads with an `exclude` example (e.g., `["vendor/**", "node_modules/**"]`) since narrowing by directory has no obvious target.
- **CLI output (preview verb):** Same Content block. No "Next steps" suffix, no MCP/scaffold sections.
- **CLI output (start --open):** No new output; behavior change only.
- **CLI output (start auto-init):** When `start` triggers auto-init (`didAutoInit === true`), render the Content block AFTER the boxed banner and ready-on URL line, but append an inline hint to the URL line ("→ run `open-knowledge preview` to inspect content scope") so users who click through the URL before the block renders still know how to re-check. The block itself renders after `ready.then()` resolves and degraded warnings have rendered. Rationale: URL prominence preserved for repeat users who know what they have; first-run users who miss the scrollback get a pointer to the `preview` verb. Gated by `didAutoInit` so this hint only fires on first-run-via-start.
- **Errors:** Preview failures inside init print a single warning line and init still exits 0. Standalone `preview` exits 1 with the warning as the only output. `start --open` failure prints URL + "open manually" hint.

### Affected routes / pages
| Route / Page | Surface | What to verify |
|---|---|---|
| `open-knowledge init` | CLI output | Content block present; counts match; sample populated; config snippet rendered |
| `open-knowledge preview` (new) | CLI output | No filesystem writes; preview block present; works pre-init (defaults) and post-init (config) |
| `open-knowledge start --open` (linux) | Browser launch | `xdg-open` invoked with URL |
| `open-knowledge start --open` (windows) | Browser launch | `cmd /c start "" <url>` invoked |
| `open-knowledge start` (first run, auto-init) | CLI output | Banner → URL → degraded warnings → Content block, in that order |

### System design
- **New module:** `packages/cli/src/content/preview.ts`. Exports `previewContent(opts): PreviewResult`. Pure function over filesystem; no side effects. Imports `createContentFilter` from `@inkeep/open-knowledge-server` (already bundled by tsdown).
  - Rationale: keep `previewContent()` CLI-local until a real second consumer (ED-4) exists with known requirements. ContentFilter stays where it is — preview is a presentation concern, ContentFilter is shared infrastructure.
- **New command:** `packages/cli/src/commands/preview.ts`. Commander.js `Command` named `preview`. Loads config via the existing config loader, calls `previewContent()`, formats output via shared formatter. Wired in `cli.ts`.
- **Init integration:**
  - `runInit()` accepts an optional `previewContent: PreviewResult` field on `InitCommandResult`.
  - `init` command calls `previewContent()` after `runInit()` returns.
  - `formatInitResult()` renders the new block when `previewContent` is present.
- **Start auto-init integration:** In `start.ts`, after `ready.then()` resolves and degraded warnings render, if `didAutoInit`, call `previewContent()` and render the block. Async; doesn't block server readiness.
- **Cross-platform launcher:** Replace `execFile('open', [url])` in `start.ts` with a small helper:
  ```ts
  function openBrowser(url: string): void {
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32' ? 'cmd'
              : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    execFile(cmd, args, (err) => {
      if (err) console.error(`Could not auto-open browser; visit ${url} manually`);
    });
  }
  ```

#### Data flow (preview)
1. CLI invokes `previewContent({projectDir, contentDir, include, exclude})`.
2. Helper calls `createContentFilter(...)`, then walks `contentDir` recursively, applying `isExcluded()` per file and `isDirExcluded()` per directory (mirroring `file-watcher.ts:seedLastKnownHashes`).
3. Returns `{totalCount, sample: string[], contentDir, include, exclude, warnings: string[]}`.

Shadow paths to test:
- **nil:** `contentDir` doesn't exist → return `{totalCount: 0, sample: [], warnings: ['content directory not found: <path>']}`.
- **empty:** `contentDir` exists but no matching files → `{totalCount: 0, sample: []}`. CLI renders "Found 0 markdown files".
- **wrong type:** N/A (no untrusted input).
- **timeout:** No hard cap in v1 (Q3). If A3 verification fails during implementation, add a 10s cap.
- **conflict:** N/A.
- **partial failure:** Per-directory `readdirSync` failure → warning, continue.

#### Failure modes
| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `previewContent()` | filesystem unreadable | exception in `readdirSync` | log warning, return partial result | preview shows partial count + warning |
| `previewContent()` | `.gitignore` malformed | exception in `createContentFilter` | log warning, return `{totalCount: 0, warnings: [...]}` | preview block shows warning, init still succeeds (preview verb exits 1) |
| `openBrowser()` | launcher binary missing | `execFile` callback err | print "open manually" hint | user opens URL manually |

### Alternatives considered
- **A) Spawn Hocuspocus to count files** → over-engineered; spawning a server to enumerate files. Rejected.
- **B) Duplicate ContentFilter logic in CLI** → drift risk, breaks invariant I-A3. Rejected.
- **C) Use third-party `open` package (sindresorhus/open) for browser launch** → adds dep + transitive surface; ~10 lines of `execFile` covers our needs. Rejected unless launcher edge cases pile up.
- **D) `init --dry-run` instead of (or alongside) `preview` verb** → conflates "what will init scaffold?" with "what content scope?" Two distinct questions; the latter is the load-bearing one (P1, P2, P3 all need it; only P2 needs the former, and only one-time). The standalone verb also gives P3 the ongoing-use answer. Replaced R2.
- **E) Place `previewContent()` in `packages/server/` as a shared export** → speculative architecture for ED-4 which doesn't exist on disk. API shape designed against a hypothetical caller tends to ossify. Promote later if ED-4 materializes with concrete requirements. Rejected for v1.
- **F) Auto-narrow defaults to `docs/**/*.md` when `docs/` exists** → genuine improvement but changes behavior for existing users in repos with both `docs/` and root markdown. Out of scope for legibility-focused work; tracked as Future Work (Identified).
- **Chosen:** Reuse `ContentFilter` from server (bundled by tsdown); CLI-local `previewContent()` helper; new `preview` verb; init writes preview block; start auto-init renders preview after URL; inline platform switch for browser launch.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Bundle R1+R2+R3 in one spec/PR | X | DIRECTED | No | User-confirmed scope; R3 reduces to a small platform-switch (already partially built) and shares no code with R1+R2 | session §4 | Single PR; if R3's cross-platform testing blocks, split before merge |
| D2 | Place `previewContent()` in `packages/cli/src/content/preview.ts` (CLI-local) | T | DIRECTED | No | Design challenge F2: shared API for one consumer is speculative; promote when ED-4 is real and its needs are known. ContentFilter stays shared (already in server, tsdown-bundled) | `tsdown.config.ts:11`, design-challenge F2 | If ED-4 surfaces, file move + import rewrite is cheap |
| D3 | Inline `execFile` switch for cross-platform browser launch (no `open` npm pkg) | T | DIRECTED | No | ~10 lines covers all 3 platforms; avoid new dep | session §9 | If launcher edge cases multiply, revisit |
| D4 | Preview failure must not block init | P | LOCKED | No | First-contact UX: a warning is acceptable; refusing to scaffold over a preview bug is unacceptable | requirements §6 NFR | All preview code wrapped in try/catch in init path; standalone preview verb exits 1 on failure |
| D5 | No `--json` output in v1 | P | DIRECTED | No | No P4 demand yet; defer to Future Work | §3 NG, §6 R6 | Future spec if scripting demand emerges |
| D6 | New `open-knowledge preview` verb instead of `init --dry-run` | P | DIRECTED | No | Design challenge F4: `--dry-run` conflates side-effect preview with content-scope preview; standalone verb covers Evaluator (P2) AND Returning (P3) personas; eliminates need for D6's earlier multiselect-skip hack | design-challenge F4-F5, §5 P3 journey | New command; init no longer needs `--dry-run` flag |
| D7 | Preview renders on `start`'s auto-init path after `ready.then()` resolves | P | DIRECTED | No | Q1 — consistency across both first-run paths; placement after URL + degraded warnings keeps signal-to-noise tuned for repeat users | session §4 Q1, audit coherence note | Modify `start.ts` to call `previewContent()` inside (or after) the `ready.then()` block |
| D8 | Preview enumerates `.open-knowledge/` content (matches watcher behavior) | P | LOCKED | No | Q5 — invariant: preview must match what the watcher indexes. ContentFilter handles `.open-knowledge/.gitignore` (excludes `cache/`) and traverses the rest | `evidence/current-init-cli-shape.md`, `content-filter.ts:loadNestedGitignores` | No special-casing in `previewContent()`; on fresh init the count is typically 1 (just `AGENTS.md`) since the scaffolded subdirs are empty |
| D9 | NG6 narrows the original NG5: hidden auto-narrowing forbidden; explicit detected-with-preview defaults are Future Work | P | DIRECTED | No | Design challenge F1: original NG5 conflated hidden and explicit heuristics. Reframed to forbid only hidden magic; legible explicit defaults can be specced as their own change | design-challenge F1 | Future Work item "Smarter detected defaults" added to §15 |
| D10 | Preview block leads with plain-English scope summary; broad-scope hint ("Looks broader than you want?") fires when `contentDir='.'` + empty exclude + `totalCount>20` | P | DIRECTED | No | Review finding §9 major: `**/*.md` glob is not self-evident to P1; neutral "To adjust" framing reads as success confirmation for first-time users in the default-broad case. Differentiating framing surfaces Nick's original complaint without changing defaults | PR #108 review (major finding) | `previewContent` returns enough structured data for the formatter to pick framing; threshold tunable |
| D11 | Config snippet is contextual: `include: ["docs/**/*.md"]` when `docs/` exists, else `exclude` example | P | DIRECTED | No | Review finding §9 consider-1: fixed `docs/**/*.md` example is misleading in repos without a `docs/` directory | PR #108 review (consider) | Formatter needs `existsSync('docs')` check on project root |
| D12 | Content block prints to stderr; stdout reserved for future `--json` mode | T | DIRECTED | No | Review finding §16 consider-2: informational output on stdout pollutes pipelines; aligns with Vite/npm conventions | PR #108 review (consider) | `previewContent`'s formatter writes to `process.stderr`; tests assert stream |
| D13 | `start` auto-init path appends a `preview` hint to the URL line (not a full reorder) | P | DIRECTED | No | Review finding §9 minor-2: users who click URL before Content block renders still need a pointer to re-check scope. Reordering Content above URL would bury the URL for repeat users who know their scope | PR #108 review (minor) | URL line gets `→ run \`open-knowledge preview\` to inspect content scope` suffix when `didAutoInit === true` |

## 11) Open questions

All Q1-Q5 resolved during iterate phase (2026-04-13). Closed entries kept here for traceability:

| ID | Question | Resolution | Status |
|---|---|---|---|
| Q1 | Preview in `start`'s auto-init path? | **Yes**, render preview after the banner/URL **and after `ready.then()` degraded warnings resolve**, gated by `didAutoInit` so it only fires on first-run-via-start. | Closed |
| Q2 | Sample cap default? | **5 paths.** | Closed |
| Q3 | Enumeration time cap? | **No hard cap in v1.** Verify A3 during implementation; add 10s cap if exceeded. | Closed |
| Q4 | `init --dry-run` and the editor multiselect prompt? | **Superseded by D6** — `--dry-run` flag dropped in favor of `open-knowledge preview` verb, which has no editor-multiselect concern. The original Q4 trade-off (skip prompt vs ask) no longer applies. | Closed (superseded) |
| Q5 | Preview enumerate `.open-knowledge/` itself? | **Yes** — match watcher behavior. ContentFilter traverses `.open-knowledge/` minus `cache/` (per nested `.gitignore`). On fresh init only `AGENTS.md` exists; scaffolded subdirs are empty. | Closed |

## 12) Assumptions

| ID | Assumption | Confidence | Verification | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `config/schema.ts` defaults: `content.include: ['**/*.md']`, `content.exclude: []`, `content.dir: '.'` | HIGH | **Verified** 2026-04-13 — `packages/cli/src/config/schema.ts:6-14` matches | n/a | **Confirmed** |
| A2 | `xdg-open` is present on default Linux *desktop* installs (Ubuntu/Fedora desktop spins). Minimal/server/CI images may lack it. | MEDIUM | `xdg-utils` ships with desktop spins; not present on minimal/server images. Headless/SSH/WSL fall through to printed URL per D3. | Before finalize | Active |
| A3 | The `ContentFilter` walk speed on a 10k-file repo is well under 2s | MEDIUM | Verify during implementation (spike on a large checkout). If exceeded, add a 10s cap. Cross-referenced from §6 NFR. | During implementation | Active |
| A4 | tsdown's `alwaysBundle` config inlines `@inkeep/open-knowledge-server` into `dist/cli.mjs` for the published npm package | HIGH | **Verified** 2026-04-13 — `packages/cli/tsdown.config.ts:11` lists it explicitly. The CLI's existing `import('@inkeep/open-knowledge-server')` in `start.ts` works in production via this path. | n/a | **Confirmed** |

## 13) In Scope

- **Goal:** Ship R1+R2+R3 so a first-time user understands what `init` did, can re-check content scope on demand, and `start --open` works on every platform.
- **Non-goals:** §3 NG1-NG6
- **Requirements with acceptance criteria:** §6
- **Proposed solution:** §9
- **Owner(s)/DRI:** Andrew (spec); implementer TBD
- **Next actions:** Verify and finalize; produce spec.json
- **Risks + mitigations:** §14
- **What gets instrumented/measured:** Qualitative re-run with Nick; no telemetry

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Preview enumeration is slow on huge repos and degrades init UX | LOW | MEDIUM | Verify A3 during implementation; add 10s cap if exceeded; sample early |
| Cross-platform launcher edge cases (WSL, headless servers, SSH sessions) | MEDIUM | LOW | Always print URL; auto-launch is best-effort, never blocking; if rabbit hole, split R3 from PR |
| `preview` verb doesn't see `.open-knowledge/config.yml` correctly when run pre-init (no file exists) | LOW | LOW | Loader returns schema defaults when no config file present (existing behavior) |
| Adding a "Content" block bloats output for power users | LOW | LOW | Block is ~8 lines including the snippet; future `--quiet` if demand |

## 15) Future Work

### Identified
- **Smarter detected defaults.** Detect `docs/` (or other conventional content roots) at init time and default `content.dir` accordingly, *with explicit print-in-preview disclosure* (e.g., "Detected `docs/` — defaulting `content.dir` to `docs/`. Override in config.yml."). NG6 forbids hidden magic, not legible detection.
  - What we know: design challenge F1 surfaced this as a real alternative framing. The current spec ships legibility first; smarter defaults compound on top.
  - Why it matters: Resolves Nick's complaint at the *defaults* level rather than the *output* level; modal user case (project with conventional `docs/`) gets narrower scope by default.
  - Investigation needed: detection rules (just `docs/`? `documentation/`? others?), interaction with existing user config files, behavior change for existing installs.
- **`init --start --open` chain.** Combine the three commands into one for the smoothest first-run UX.
  - What we know: P1 (first-time user) sequences these three commands; combining them removes 2 context-switches.
  - Investigation needed: How `init` would background or hand off to `start` (process-model change).

### Noted
- **`init --dry-run` flag** — describe scaffold + MCP write side effects without executing. Lower-value once `preview` exists. Could ship if asked.
- **`--json` preview output (R6)** — for scripting / CI integration. No demand signal yet.
- **Interactive scope adjustment** — prompt to narrow `content.include` if the preview shows >N files. Could ship as part of web onboarding (ED-4) instead of CLI.

## 16) Agent constraints

- **SCOPE:** `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/start.ts`, `packages/cli/src/commands/init.test.ts`, `packages/cli/src/cli.ts` (wire new command), new files: `packages/cli/src/commands/preview.ts` (+ test), `packages/cli/src/content/preview.ts` (+ test).
- **EXCLUDE:** Anything in `packages/app/`, `packages/core/`, `packages/server/` (reuse only — no edits), MCP tool implementations, persistence/file-watcher behavior changes.
- **STOP_IF:** The change requires modifying `ContentFilter` semantics, schema changes to `config.yml`, or any behavior of `file-watcher.ts` / `persistence.ts`. Or: A3 verification fails (>2s on 10k files) — implement the 10s cap before proceeding.
- **ASK_FIRST:** Adding a new npm dependency (D3 commits to no new deps); changing `runInit()`'s public return shape in a breaking way; promoting `previewContent()` out of CLI to a shared package (D2 commits to CLI-local).
