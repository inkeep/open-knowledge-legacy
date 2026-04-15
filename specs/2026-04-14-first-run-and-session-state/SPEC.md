# First-run welcome + session state — Spec

**Status:** Draft
**Owner(s):** Andrew (platform), Sarah (UI — layered ownership per PROJECT.md)
**Last updated:** 2026-04-14
**Baseline commit:** d160ad4
**Links:**
- Linear: [PRD-6522 — V0-7 First-run onboarding + session persistence + starter document](https://linear.app/inkeep/issue/PRD-6522/v0-7-first-run-onboarding-session-persistence-starter-document)
- Story: `stories/V0-7-onboarding/STORY.md` (referenced; not yet read in this session)
- Sibling spec: `specs/2026-04-14-multi-project-path/SPEC.md` — multi-project CLI/hub work (explicitly out of v0 per project framing)
- Related research: `reports/onboarding-multiproject-ux/REPORT.md`, `reports/onboarding-walkthrough-audit/REPORT.md`
- Project: `projects/v0-launch/PROJECT.md` §V0-7 (lines 878–902), PQ6 (line 1014), TQ7 (line 1026), TQ8 (line 1027), TQ9 (line 1028), CC6 (line 1064)

---

## 1) Problem statement

**Situation.** A user opens Open Knowledge in a project directory for the first time. Today the flow is: `open-knowledge start` boots Hocuspocus + serves the SPA; the SPA loads and drops the user into a blank editor view bound to the first document the file watcher happened to index, with no context about what the tool just did to their project, what it will now track, or whether the user is "home." On a second-session return, the user lands on whichever document the sidebar happens to render first — not the one they were editing before.

**Complication.** Three gaps compound at first contact and on every subsequent return:

1. **No guided first-run surface.** The editor has no welcome screen, no content-detection summary, no scope confirmation, no "create your first article" affordance. Linear ticket PRD-6522 frames this as an "empty vault" problem — starter `README.md` + "create your first article" CTA — but the empty case is the *least* common real-world scenario. The far more likely first-run shape is: **user has an existing knowledge base with tens to thousands of markdown files, adds Open Knowledge to it, and immediately needs to know "did the tool index the right files, or is it also tracking 800 vendored `node_modules/**/README.md` files I don't care about?"** The ticket's current scope does not address this — the welcome screen branches are "has files or empty," not "has the right files or the wrong files." Without scope confirmation on first run, users with large existing KBs form a first-impression trust judgment against a sidebar full of noise.

2. **No session persistence.** Leaving and returning drops the user on an arbitrary document. `state.json` does not exist as a primitive. Per-project last-opened-doc is the minimum; a growth path toward "recently edited," "open tabs," and UI-state restoration (required downstream by V0-22 tabs) is missing too. Worse: any naive `state.json` implementation races against itself if multiple processes believe they own the project (V0-1's server-lock mitigates this but only if `state.json` writes go through the lock-holding process).

3. **No dismissal-state storage.** Even if a welcome screen is built, there is no decided mechanism for "never show this again" (TQ7 in `projects/v0-launch/PROJECT.md` — still open). Three bad options have been considered: config flag (wrong scope — config is about content, not UI state); cache marker (brittle, cleared by `.open-knowledge/cache/` wipes); doc-count inference ("hide if ≥1 doc exists" — wrong because users want scope-confirmation to recur after major config changes, not just after first doc). The right answer is `state.json`-backed, schema-versioned, and integrated with the same atomic-write + lock discipline the session-persistence half needs.

The compound effect: the ticket as written solves an onboarding surface for an audience (empty-vault evaluators) that is probably the minority of real first contact; the majority case (existing KB with non-trivial content scope) is silently underserved; and even for the minority case, there is no persistence primitive that lets the UI remember what the user has already dismissed. All three need solving in one coherent slice because they share the same storage substrate (`state.json`), the same lifecycle (first-run + return), and the same lock coordination (V0-1).

**Resolution.** One vertical slice delivering:
- (a) `state.json` as a versioned, lock-coordinated, atomically-written per-project state file — schema generous enough to carry session + UI state without further migrations;
- (b) a server-side init-status endpoint that reports what the file watcher has indexed (count, scope, sample, detected category: empty / existing / suspicious);
- (c) an `initContent()` primitive extension that creates a starter `README.md` only when the vault is truly empty;
- (d) a welcome screen UX with **three explicit branches** — empty, existing, and suspicious (e.g., indexing `node_modules/`) — that renders the right affordances for each;
- (e) a dismissal-state model that respects schemaVersion so welcome can be meaningfully re-presented after future UX updates.

The scope is the full V0-7 PRD-6522 surface plus the existing-KB branch and the schema-versioned dismissal model. It is complementary to, and non-overlapping with, `specs/2026-04-14-multi-project-path/SPEC.md`.

## 2) Goals

- **G1:** A first-time user who opens Open Knowledge against an existing knowledge base lands on a welcome screen that tells them what was indexed, invites them to confirm or narrow scope, and then takes them to their content.
- **G2:** A first-time user who opens Open Knowledge against a fresh empty directory lands on a welcome screen that creates a starter `README.md` and takes them into it, ready to edit.
- **G3:** A first-time user whose vault accidentally indexes `node_modules/**` or similar noise is warned on the welcome screen, not left to discover it via a confused sidebar.
- **G4:** A returning user, having dismissed the welcome screen, resumes on the document they were last editing, not a random first-index entry.
- **G5:** `state.json` is a first-class persistence primitive: versioned, atomically written, lock-coordinated with V0-1, and extensible to future needs (V0-22 tabs, recent docs, UI state) without migration.
- **G6:** The dismissal state is part of `state.json`, not a separate file or inferred from doc counts — TQ7 resolved.
- **G7:** A single server endpoint (new: `GET /api/init-status`) delivers everything the welcome screen needs in one request — TQ8 resolved.

## 3) Non-goals

- **[NOT NOW]** NG1: Tabs, multi-doc open state, or any state beyond `lastOpenedDoc` + welcome-dismissal. V0-22 builds on `state.json` and will extend the schema; this spec only reserves the shape. — Revisit when: V0-22 ships.
- **[NOT NOW]** NG2: Cross-project welcome surface or a global "first-time launching Open Knowledge ever" flow — that is multi-project scope, explicitly deferred per `specs/2026-04-14-multi-project-path/SPEC.md` and per the ticket's "Part B explicitly out of v0 scope" framing. — Revisit when: multi-project spec ships.
- **[NOT NOW]** NG3: Interactive CLI-based scope refinement. Welcome scope confirmation is UI-only; CLI users continue editing `config.yml` by hand or using `open-knowledge preview` (already shipped). — Revisit when: a CLI-first user explicitly asks for interactive scope editing.
- **[NOT NOW]** NG4: "Recently edited" history beyond `lastOpenedDoc`. The schema reserves a `recentDocs` field but does not populate or consume it in v1. — Revisit when: V0-22 tabs needs it.
- **[NOT NOW]** NG5: Welcome screen localization / i18n. English-only, matches the rest of the product. — Revisit when: the product is localized.
- **[NOT NOW]** NG6: Telemetry on welcome-screen completion rates. No telemetry primitive exists. — Revisit when: one does.
- **[NEVER]** NG7: Writing `state.json` from any process that does not hold the V0-1 server lock. Concurrent writes from multiple processes are a correctness bug, not a UX choice.
- **[NEVER]** NG8: Hiding scope problems from the user. If the file count is large enough to be suspicious, the welcome screen must say so — silent over-indexing is the bug we're fixing.
- **[NOT UNLESS]** NG9: Auto-narrowing the default `content.include` based on heuristics (e.g., silently picking `docs/**` if `docs/` exists). Hidden defaults break the principle that what the UI shows matches what the watcher indexes. — Revisit only if: explicit preview-printed detection is specced as its own change (same reasoning as NG6 in the `cli-init-clarity` spec).

## 4) Personas / consumers

- **P1 — Fresh-vault evaluator.** Creates an empty directory, runs `open-knowledge init && start`, opens the editor. Has never seen the product. Expects a "here's what this is, here's a starter, start editing" flow. Sarah's primary target audience.
- **P2 — Existing-KB adopter (the under-served case).** Has a `~/notes` directory or a repo's `docs/` folder with markdown files — could be 5, could be 5,000. Adds Open Knowledge to it. Expects: "we found N files under `docs/`, does this look right?" → scope confirmation → lands in their content. Is the **modal real-world first-run user** — this spec's distinguishing concern over the Linear ticket as originally written.
- **P3 — Noisy-KB adopter.** Same as P2 but the project has `node_modules/`, vendored docs, or similar noise, and the default `**/*.md` scope sweeps in suspicious paths. Needs a warning on the welcome screen plus a nudge to fix scope before continuing. (This is also the user the multi-project spec's F3 default-excludes fix partially serves; this spec complements that by surfacing the problem in UI even if the default excludes miss something.)
- **P4 — Returning user.** Used Open Knowledge yesterday; reopens it today. Expects to land on the doc they were editing, no welcome screen.
- **P5 — Returning user after a tool update.** Used Open Knowledge a month ago; reopens it after a version bump that changed the welcome screen flow. Might benefit from a re-surfaced scope-confirmation. Handled via `schemaVersion` in `state.json.welcome`.
- **P6 — Power user / config editor.** Edited `.open-knowledge/config.yml` to add exclusions, wants to re-run welcome to see current scope. Handled via a manual "reset welcome" affordance (`open-knowledge welcome --reset` CLI or a menu item — scope TBD in R-level).

## 5) User journeys

### P1 — Fresh empty vault
1. User `cd ~/new-notes && open-knowledge init && open-knowledge start`.
2. Opens `http://localhost:5173`. App loads. `state.json` does not exist. `/api/init-status` reports `{variant: "empty", fileCount: 0}`.
3. **Welcome screen — empty branch:** *"Welcome to Open Knowledge. This vault is empty. We'll create a starter README.md for you so you have somewhere to begin."* → single button *"Create starter document"*.
4. Click → `initContent()` writes `<contentDir>/README.md` with the starter template. Server's file watcher picks it up. SPA transitions to the editor bound to `README.md`.
5. `state.json` written: `{version:1, lastOpenedDoc:"README.md", lastOpenedAt:<now>, welcome:{state:"dismissed", seenAt:<now>, variant:"empty", schemaVersion:1}}`.
6. User types. Lives happily.

### P2 — Existing KB (any size, no suspicious patterns)
1. User `cd ~/notes && open-knowledge init && open-knowledge start`. `~/notes` has 47 `.md` files under `/topics/*.md` (could equally be 4 or 4,000 — same flow).
2. SPA loads. `state.json` does not exist. `/api/init-status` reports `{variant: "existing", fileCount: 47, contentDir: ".", include: ["**/*.md"], exclude: ["node_modules/**", ...], sampleFiles: ["topics/a.md", ...], topDirs: ["topics"], suspiciousPatterns: []}`.
3. **Welcome screen — existing branch:** *"Open Knowledge found 47 markdown files in `~/notes`. Top-level: `topics/`. Looks good?"* → sample file list (5 paths) → two buttons: *"Start exploring"* (dismiss + open first file) and *"Edit scope"* (link to `config.yml` docs + open `.open-knowledge/config.yml` in the editor itself).
4. Click **Start exploring** → welcome dismissed, SPA opens the first file in the sidebar, `state.json` is written.

### P3 — Suspicious-pattern detection
1. User `cd ~/work/monorepo && open-knowledge init && open-knowledge start`. Repo has 8,000 `.md` files because `node_modules/` snuck in (or was not caught by defaults).
2. `/api/init-status` reports `{variant: "suspicious", fileCount: 8413, contentDir: ".", sampleFiles: [..., "node_modules/some-pkg/README.md", ...], topDirs: ["node_modules", "docs", "packages"], suspiciousPatterns: ["node_modules"]}`.
3. **Welcome screen — suspicious branch:** *"Open Knowledge may be indexing files you don't want — `node_modules/` detected."* → sample file list with suspicious files highlighted → three buttons: *"Add exclusions"* (opens `config.yml` with `exclude:` cursor positioned, primary CTA), *"Start anyway"* (dismiss + accept the scope), *"Decide later"* (dismiss + mark `welcome.needsAttention:true` for a return nudge).
4. User adds `node_modules/**` to excludes, saves, file watcher rebuilds, welcome screen re-queries `/api/init-status`, variant becomes "existing" → user clicks "Start exploring" → welcome dismissed.

### P4 — Returning user
1. User reopens tab. `state.json` exists with `lastOpenedDoc: "notes/yesterday.md"` and `welcome.state: "dismissed"`.
2. SPA skips welcome screen entirely. Opens `notes/yesterday.md` directly. If that file no longer exists (deleted since last session), falls back to first file in sidebar index and updates `state.json`.

### P5 — Returning user after UX version bump
1. User last dismissed welcome with `welcome.schemaVersion: 1`. New version ships with `WELCOME_SCHEMA_VERSION: 2`.
2. SPA loads, reads `state.json`, compares — welcome should re-show with a one-line "We've updated the onboarding flow" banner at the top. User can re-dismiss; `schemaVersion` updates to 2.

### P6 — Manual re-surfacing
1. User wants to re-run scope confirmation after a major config edit. Options:
   - (a) Editor menu item "Re-run welcome" → clears `welcome.state`, SPA reloads into welcome screen.
   - (b) CLI: `open-knowledge welcome --reset` → deletes the `welcome` block from `state.json`; next SPA load re-shows.
2. This spec ships option (b) as a should-have; option (a) deferred to follow-up.

### Failure / recovery journeys
- **`state.json` corrupt JSON on read.** SPA logs a warning, treats as missing, shows welcome screen. Old file backed up to `state.json.bak.<timestamp>`. No data loss (the primary content is the markdown files themselves).
- **`state.json` lock contention (two processes try to write simultaneously).** V0-1 lock owner is the only writer; non-owner processes attempting to write fail fast with a clear log message. UI never writes directly — all writes go through an API endpoint that the lock-holding server process handles.
- **`initContent()` fails (permission denied writing `README.md`).** Welcome screen shows error with retry + "pick a different directory" link. Does NOT write `state.json.welcome.dismissed`.
- **`/api/init-status` enumeration times out on huge repos.** Endpoint is capped at 10,000 files enumerated for the sample; total count is exact (uses existing `ContentFilter` which is already fast). If > 10,000, the existing or suspicious branch displays "10,000+ files" instead of an exact count.
- **User closes the tab mid-onboarding.** `welcome.state` remains unset (or `pending` if we decide to write intermediate state — see open questions). Next load re-shows welcome. No state corruption.
- **V0-1 lock not acquired (e.g., another process already holds it).** `state.json` reads are fine; writes from non-lock-holding processes are refused. UI sees a "read-only" indicator; welcome screen still functional but dismiss button warns "another instance of Open Knowledge is running for this project."

## 5.5) Invariants (lifted from `stories/init-and-project-switching/STORY.md` Part A)

- **I-A1: Welcome triggers only on first meaningful interaction.** Welcome appears when EITHER (a) `state.json` does not exist OR (b) `state.json.welcome.state !== 'dismissed'` OR (c) welcome was dismissed at a lower `schemaVersion` than current OR (d) `fileCount === 0` — even if previously dismissed. Once dismissed AND ≥1 document exists AND current schemaVersion, welcome does not reappear. Observable: dismiss with content present → reload 5x → no welcome. Delete all docs → reload → welcome reappears.
- **I-A2: Existing content is never modified by onboarding.** Onboarding detects and surfaces. It never moves, renames, reformats, or edits user markdown files. Starter `README.md` is only written when `fileCount === 0` (see R4 acceptance criteria). Observable: checksum any existing `.md` file before and after onboarding — identical.
- **I-A3: CLI and UI initialization produce identical outcomes.** `open-knowledge init` + web-editor onboarding produce a byte-identical `.open-knowledge/` directory and starter `README.md` (if applicable). Observable: diff `.open-knowledge/` + `README.md` after CLI init vs after UI init — no difference except timestamps.
- **I-A4: Onboarding is skippable without consequence.** A user who clicks "Start anyway" (or dismisses via any CTA) can create, read, and edit files with the default content directory. Nothing is gated behind completing the welcome flow. Observable: dismiss welcome, create a file manually, it appears in the sidebar.
- **I-A5: Content detection is accurate.** Counts + paths reported by `/api/init-status` match what the file sidebar shows. No false positives (non-markdown files counted); no false negatives (markdown files missed). Observable: `/api/init-status.fileCount` equals `/api/documents` list length.

## 5.6) Constraints (lifted from story Part A)

- **C-A1: Server must be running before onboarding.** The web editor is served by the Hocuspocus server and runs inside the same process. The welcome screen runs post-boot, inside the SPA. No server-start affordance from within the SPA.
- **C-A2: Content detection uses the existing `ContentFilter` pipeline.** `/api/init-status` reads from the file watcher's in-memory index populated at startup. No separate file-walking logic. Count + filter semantics must match what the file sidebar shows.
- **C-A3: Configuration changes made during onboarding persist to `.open-knowledge/config.yml`.** Not runtime-only. When the user adds an exclusion via the suspicious variant's one-click action, the change is written to disk and survives restart. (See R9a — narrow add-exclude endpoint.)
- **C-A4: Detection completes in under 5 seconds for 10k files.** The existing file watcher already satisfies this — `/api/init-status` is a read from the in-memory index, bounded by serialization cost alone.

## 6) Requirements

### Functional
| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | R1 | `state.json` schema + read/write primitive | `packages/server/src/state-json.ts` (new) exports `readState()` / `writeState()`. Schema validated by Zod. Atomic write: tmp-file + rename. Write is lock-coordinated — only the V0-1 server-lock-holding process writes. Non-owner writes throw a clear error. Unit test: concurrent write attempts from two simulated owners → one succeeds, one fails cleanly; corrupt JSON on read → warning + backup + empty state. |
| Must | R2 | `state.json` schema (v1) | Schema: `{version: 1, lastOpenedDoc?: string, lastOpenedAt?: ISO8601, welcome: {state: "not-shown"\|"pending"\|"dismissed", seenAt?: ISO8601, variant?: "empty"\|"existing"\|"suspicious", schemaVersion: number, needsAttention?: boolean}, recentDocs?: string[]}`. `version` gates future migrations. Unknown fields preserved on round-trip (forward-compat). |
| Must | R3 | `GET /api/init-status` endpoint | `packages/server/src/api-extension.ts` adds this route. Returns: `{fileCount: number, contentDir: string, include: string[], exclude: string[], sampleFiles: string[] (max 5), topDirs: string[] (max 3), variant: "empty"\|"existing"\|"suspicious", suspiciousPatterns: string[]}`. Variant logic defined in §9. Reads from existing `ContentFilter` + `fileWatcher` in-memory index — no separate walk. Response time < 200ms for 10k files. |
| Must | R4 | `initContent()` starter-README writer | `packages/server/src/init-content.ts` (new) exports `initContent({contentDir, contentFilter, templatePath})`. Writes `<contentDir>/README.md` with a 5–10 line starter template (markdown + JSX component example). Only writes if: (a) the file does not exist, AND (b) no files currently match `content.include`. Idempotent on re-run: does nothing if either condition fails. Exposed to CLI via `open-knowledge init-content`, to API via `POST /api/init-content` (lock-owner-only). |
| Must | R5 | Starter template | Content drafted in `meta/starter-template.md`. 6 lines showing heading, paragraph, wiki-link (deliberately red-link as a teaching moment), `<Callout>` JSX component, external link. Must round-trip through the serializer without normalization; verified at impl time. Sarah sign-off before ship. |
| Must | R6 | Welcome screen React component | `packages/app/src/onboarding/WelcomePage.tsx` (new). Renders three variants driven by `/api/init-status` response + `state.json.welcome` state. Owner: **Sarah (primary)**. Uses shadcn primitives. Responsive layout. Dismissal button calls `POST /api/state-json/welcome-dismiss` (lock-owner writes through). |
| Must | R7 | Welcome branch: empty | When variant=`empty`: heading "Your knowledge base is empty", body explaining starter doc, single CTA "Create starter document" → POSTs `/api/init-content` → on success, dismisses welcome + opens `README.md`. |
| Must | R8 | Welcome branch: existing | When variant=`existing`: heading "Open Knowledge found N markdown files", body listing top dirs + sample paths, CTAs "Start exploring" (dismiss + open first file) and "Edit scope" (shows the absolute path to `.open-knowledge/config.yml` with a one-line instruction to open it in the user's editor of choice — narrow config edits via API are out of scope for v1, see D13). N is shown faithfully whether it's 5 or 5,000. |
| Must | R9 | Welcome branch: suspicious | When variant=`suspicious` (detected patterns: `node_modules`, `.git`, `vendor`, `dist`, `build`, `target`, `.next`, `.nuxt`, `.output`, `out` present in top 100 indexed paths): heading "Open Knowledge may be indexing files you don't want", highlights the suspicious paths in the sample, three CTAs: **"Add exclusions"** (primary — POSTs to `/api/config/add-exclude` with one exclude pattern per detected suspicious directory, e.g. `["node_modules/**", "vendor/**"]`; on success the file watcher re-indexes and the welcome screen re-queries `/api/init-status` → variant likely transitions to `existing` → user continues); **"Start anyway"** (dismiss + accept the scope); **"Decide later"** (dismiss + mark `welcome.needsAttention:true`). |
| Must | R9a | `POST /api/config/add-exclude` endpoint | Narrow config-mutation endpoint: accepts `{patterns: string[]}`, appends each pattern to `content.exclude` in `.open-knowledge/config.yml` (idempotent — does not add duplicates), triggers content-filter rebuild + file watcher re-index, returns updated `{exclude: string[], fileCount: number}`. Lock-owner-only (423 otherwise). YAML round-trip must preserve comments and ordering — use a YAML library that supports this (not a JSON re-serialize). **This is the only config-writing endpoint in this spec.** General-purpose config editing stays out of scope per D13. Implements C-A3. |
| Must | R10 | Session-restore on app load | SPA on initial load reads `state.json` via `GET /api/state-json` AND `GET /api/init-status`. Welcome is shown unless ALL of: (a) `state.json.welcome.state === "dismissed"`, (b) `state.json.welcome.schemaVersion === WELCOME_SCHEMA_VERSION`, (c) `initStatus.fileCount > 0`. When welcome is NOT shown: if `lastOpenedDoc` exists in the current file index → open it; if missing → fall back to first file in index, update `lastOpenedDoc`. If no `lastOpenedDoc` at all → open first file without writing until the user navigates. Implements I-A1. |
| Must | R11 | Dismissal write-through | Welcome dismiss calls `POST /api/state-json/welcome-dismiss` with `{variant}`. Server (lock-owner) updates `state.json.welcome` to `{state:"dismissed", seenAt:<now>, variant, schemaVersion: WELCOME_SCHEMA_VERSION}`. 200 on success, 423 Locked if the server doesn't hold the lock. |
| Must | R12 | `lastOpenedDoc` write-through | On document navigation in the editor, debounced (500ms) write through `POST /api/state-json/last-opened` with `{docName}`. Coalesces rapid navigation. No write if welcome is still pending. |
| Must | R13 | `.gitignore` state.json | `open-knowledge init` appends `.open-knowledge/state.json` to project `.gitignore` (state.json is per-machine, per-user, must not be committed). Idempotent append. |
| Should | R14 | `open-knowledge welcome --reset` CLI | New subcommand deletes the `welcome` block from `state.json` for the current project. Direct file write (not via API — this runs when server may not be running). Warns if server is running and instructs to run it through the server instead. Low-effort; ship if time permits. |
| Should | R15 | `WELCOME_SCHEMA_VERSION` constant | Exported from `packages/core/src/constants/welcome.ts`. Starts at `1`. On load, SPA compares `state.json.welcome.schemaVersion` to current constant; if older, re-shows welcome with a one-line "We've updated the onboarding flow" banner. Future version bumps must document the change in the banner. |
| Should | R16 | Welcome re-appearance rules | Welcome re-appears only when I-A1 conditions hold. After dismissal with current `schemaVersion` AND `fileCount > 0`, welcome MUST NOT re-render on reload. It MUST re-render if any of: (a) user explicitly resets via R14, (b) `state.json` is deleted, (c) `WELCOME_SCHEMA_VERSION` is bumped, (d) `fileCount` drops to 0 after dismissal (all docs deleted). Tested by: (1) dismiss → reload 5x with docs present → no welcome; (2) dismiss → delete all .md files → reload → welcome reappears. |
| Could | R17 | Manual "Re-run welcome" editor menu item | In-editor menu entry that clears `welcome.state`, reloads. Convenience over R14 CLI. Ship if trivial. |
| Could | R18 | "Needs attention" post-dismiss nudge | When welcome was dismissed with `needsAttention: true` (from R9 "Decide later"), editor shows a small banner linking back to scope review. Dismissible. One-time. |

### Non-functional
- **Performance:**
  - `/api/init-status` response < 200ms for repos with ≤10k indexed files. Reuses existing in-memory index; no fresh walk.
  - `state.json` read on SPA load < 50ms (tiny file).
  - `state.json` atomic write < 20ms (tmp + rename on local FS).
- **Reliability:**
  - `state.json` corruption on read → warning + backup + in-memory empty state, UI degrades to "always show welcome" mode (safe default).
  - Writes from non-lock-holding processes refused; safe failure, no torn writes.
  - Schema version gates migrations; unknown future fields are preserved on round-trip.
- **Security/privacy:**
  - `state.json` mode 0600 (user-only read/write).
  - `sampleFiles` in `/api/init-status` are localhost-only; not transmitted anywhere.
  - Welcome screen never sends any data off-machine.
- **Operability:**
  - Deletion of `state.json` is safe and documented — forces welcome + drops last-opened-doc memory, nothing else.
  - CLI escape hatch `open-knowledge welcome --reset` covers cases where the SPA can't reach the server.
- **Compatibility:**
  - V0-1 lock infrastructure is a hard prerequisite. V0-1 has shipped (PR #99) — this is satisfied.
  - `state.json` schema is extensible: V0-22 (tabs) will add `openTabs: string[]` and related fields without requiring migration.

## 7) Success metrics & instrumentation

- **Primary (qualitative):** Onboard two real users — one with an empty directory, one with an existing KB of ~50 files — and observe them reach a productive state in under 60 seconds from `start`. For the existing-KB user, the scope confirmation should feel reassuring, not interrogatory.
- **Secondary:** Test with a deliberately messy directory (`node_modules` present) and confirm the suspicious-branch warning appears and the "Add exclusions" flow works end-to-end.
- **Tertiary:** After 30 days, verify that returning users are landing on their last doc (anecdotal; no telemetry).
- **Instrumentation:** None. Qualitative only.

## 8) Current state

- **No `state.json`.** Not a file; not a primitive; no helper functions. `packages/server/src/` does not reference it.
- **No `initContent()`.** `.open-knowledge/AGENTS.md` and `config.yml` are written by `init`, but no starter `README.md` is created for the user.
- **No `/api/init-status` endpoint.** `/api/document`, `/api/documents`, `/api/agent-*`, `/api/save-version`, `/api/metrics/reconciliation`, `/api/rescue` exist; init status is not covered.
- **No welcome screen.** SPA opens directly into the editor bound to whichever document the sidebar first indexes.
- **No session persistence.** Tab refresh = new random starting document.
- **V0-1 lock shipped** (per PROJECT.md line 76, PR #99). `packages/server/src/server-lock.ts` holds the file lock; `destroy()` releases it last.
- **`ContentFilter` + file watcher in-memory index exist.** `packages/server/src/content-filter.ts` + `file-watcher.ts`. Both already feed the documents API. `/api/init-status` reuses them.
- **`open-knowledge preview` command exists** (shipped in `cli-init-clarity`). Useful for CLI-side scope inspection; orthogonal to the UI welcome screen.
- **`.gitignore` append pattern** — the multi-project spec (R11) will also append to `.gitignore`. This spec appends one additional line. Coordinate in implementation: both specs amend the same `init` code path.

## 9) Proposed solution (vertical slice)

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  SPA (packages/app)                                  │
│  ┌────────────────────────────────────────────────┐  │
│  │  WelcomePage.tsx  ← Sarah                      │  │
│  │  ├ Empty variant                               │  │
│  │  ├ Existing variant                            │  │
│  │  └ Suspicious variant                          │  │
│  └───────────────┬────────────────────────────────┘  │
│                  │ fetch + POST                      │
└──────────────────┼───────────────────────────────────┘
                   │
┌──────────────────┼───────────────────────────────────┐
│  Server (packages/server)  ← Andrew                  │
│                  │                                   │
│  ┌───────────────▼────────────────────────────────┐  │
│  │  API extension                                 │  │
│  │  GET  /api/init-status                         │  │
│  │  GET  /api/state-json                          │  │
│  │  POST /api/state-json/welcome-dismiss          │  │
│  │  POST /api/state-json/last-opened              │  │
│  │  POST /api/init-content                        │  │
│  └───────┬──────────────┬─────────────┬───────────┘  │
│          │              │             │              │
│  ┌───────▼────┐  ┌──────▼──────┐  ┌──▼──────────┐   │
│  │ state-json │  │ init-content│  │ content-    │   │
│  │ (new)      │  │ (new)       │  │ filter (ex) │   │
│  │            │  │             │  │             │   │
│  │ read/write │  │ writes      │  │ file index  │   │
│  │ atomic     │  │ README.md   │  │             │   │
│  │ lock-safe  │  │             │  │             │   │
│  └─────┬──────┘  └─────────────┘  └─────────────┘   │
│        │                                             │
│        └─── V0-1 server lock ─────────────────┐     │
│             (only lock-owner writes)          │     │
└───────────────────────────────────────────────┼─────┘
                                                │
                            ┌───────────────────▼──┐
                            │  disk: per-project   │
                            │  .open-knowledge/    │
                            │    state.json        │
                            │    server.lock       │
                            │  <contentDir>/       │
                            │    README.md         │
                            └──────────────────────┘
```

### Responsibility split

| Component | Owner | Why |
|---|---|---|
| `state.json` schema + read/write primitive | Andrew | Platform primitive; lock coordination is Andrew's area |
| `initContent()` | Andrew | Platform primitive used by both UI and CLI |
| `/api/init-status`, `/api/state-json*`, `/api/init-content` | Andrew | Server API |
| `WelcomePage.tsx` + three variant renderers | **Sarah** | Novel UX; shadcn composition; highest-leverage first-impression work |
| Session-restore hook in `TiptapEditor.tsx` | Sarah | Editor-side wiring |
| `.gitignore` append | Andrew (coord with multi-project spec) | CLI side-effect |
| `open-knowledge welcome --reset` CLI | Andrew | Escape hatch |

### `state.json` schema (v1) — canonical

```ts
// packages/server/src/state-json.ts
import { z } from 'zod';

export const WELCOME_SCHEMA_VERSION = 1;

export const StateJsonSchema = z.object({
  version: z.literal(1),
  lastOpenedDoc: z.string().optional(),
  lastOpenedAt: z.string().datetime().optional(),
  welcome: z.object({
    state: z.enum(['not-shown', 'pending', 'dismissed']),
    seenAt: z.string().datetime().optional(),
    variant: z.enum(['empty', 'existing', 'suspicious']).optional(),
    schemaVersion: z.number().int(),
    needsAttention: z.boolean().optional(),
  }).default({ state: 'not-shown', schemaVersion: WELCOME_SCHEMA_VERSION }),
  recentDocs: z.array(z.string()).optional(),  // reserved for V0-22
}).passthrough();  // preserve unknown fields for forward-compat

export type StateJson = z.infer<typeof StateJsonSchema>;
```

### `/api/init-status` response shape

```ts
{
  fileCount: number,
  contentDir: string,             // absolute
  include: string[],
  exclude: string[],
  sampleFiles: string[],          // max 5, relative to contentDir
  topDirs: string[],              // max 3, by file count
  variant: 'empty' | 'existing' | 'suspicious',
  suspiciousPatterns: string[],   // which noise patterns were detected; empty if none
}
```

### Variant logic (D1 below)

- **empty:** `fileCount === 0`
- **existing:** `fileCount > 0` AND no suspicious patterns
- **suspicious:** `fileCount > 0` AND at least one suspicious pattern in top 100 indexed paths. Takes priority over `existing` when triggered.

No file-count thresholds — `existing` covers any non-zero count without noise patterns. We display the count faithfully in the UI but do not change branch behavior based on it. Users with 5 files and users with 5,000 files both see the same scope-confirmation flow; only the `suspicious` branch warns.

Suspicious patterns (hardcoded in server, overridable via `config.onboarding.suspiciousPatterns` later — out of scope for v1): `node_modules`, `.git`, `vendor`, `dist`, `build`, `target`, `.next`, `.nuxt`, `.output`, `out`.

Verified 2026-04-14 against the `open-knowledge` repo itself: `node_modules`, `.git`, `dist`, `build`, `.next`, `vendor`, `out` all match real directories under the repo root. `.nuxt`, `.output`, `target` do not (no Rust/Nuxt tooling in the repo). `node_modules`/`.git`/`dist`/`build`/`.next` are also in spec 1's default `content.exclude`, so those patterns only surface in the suspicious variant when a user has explicitly un-excluded them or a directory matches that slipped through F3 defaults — defense-in-depth.

### API request/response shapes

Concrete shapes for the state-json and config endpoints. YAML round-trip for `/api/config/add-exclude` must preserve comments + ordering (use a structured YAML editor, not a naive parse→mutate→stringify that loses comments).

```ts
// GET /api/state-json → 200
{ version: 1, lastOpenedDoc?: string, lastOpenedAt?: ISO8601,
  welcome: { state, seenAt?, variant?, schemaVersion, needsAttention? },
  recentDocs?: string[] }

// POST /api/state-json/welcome-dismiss  body: { variant, needsAttention?: boolean }
// → 200 { welcome: { state:"dismissed", seenAt, variant, schemaVersion, needsAttention? } }
// → 423 { error: "not-lock-owner" }

// POST /api/state-json/last-opened  body: { docName: string }
// → 200 { lastOpenedDoc, lastOpenedAt }
// → 423 { error: "not-lock-owner" }
// → 404 { error: "doc-not-in-index" }  (docName doesn't match the file watcher's current index)

// GET /api/init-status → 200
{ fileCount, contentDir, include, exclude,
  sampleFiles: string[],    // max 5, relative to contentDir
  topDirs: string[],        // max 3, by file count
  variant: 'empty' | 'existing' | 'suspicious',
  suspiciousPatterns: string[] }  // empty if variant !== 'suspicious'

// POST /api/config/add-exclude  body: { patterns: string[] }
// → 200 { exclude: string[], fileCount: number }  (post-rebuild)
// → 400 { error: "invalid-glob", pattern: string }
// → 423 { error: "not-lock-owner" }

// POST /api/init-content  (no body)
// → 200 { path: "README.md", bytesWritten: number }
// → 409 { error: "content-exists", fileCount: number }  (refuses if any .md already matches include)
// → 423 { error: "not-lock-owner" }
```

## 10) Decision log

| ID | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Three welcome variants: empty / existing / suspicious | Two variants (empty / has-files) per ticket as originally written; four variants with a large-KB warning branch | Two-variant misses the existing-KB case, which is the modal real-world first-run user. A four-variant version added a size threshold warning (">500 files: consider narrowing scope"), but most users with large KBs are intentionally working with a large KB — a count-based warning is either noise or condescending. The signal worth surfacing is *noise detection* (suspicious patterns), not raw count. Three variants is the minimum to cover the real shape without overreaching. |
| D2 | Suspicious-pattern list hardcoded in v1; configurable later | Make it a config field from day one | Hardcoded is enough for v1; the list is short and well-known. Configurability adds surface area with no clear caller yet. |
| D3 | No file-count thresholds gate the UI branch | Thresholds at 100, 500, 1000 | Count-based warnings either annoy users with intentionally-large KBs or fail to catch users with small-but-wrong scope. Noise-pattern detection is the real signal. The count is displayed faithfully but does not change UX branching. |
| D4 | `state.json` schema is explicitly versioned with a `version: 1` literal | Unversioned; file-presence as version signal | Versioning is cheap insurance. Forward migration in a future spec is trivial if the field is there from day one. |
| D5 | Welcome dismissal state lives in `state.json`, not as a separate file or as a config flag | Separate `welcome.marker` cache file; `config.yml` flag; inferred from doc count | Resolves TQ7 from `projects/v0-launch/PROJECT.md`. Separate marker file is fragile (cache wipes). Config flag conflates content config with UI state. Doc-count inference gives wrong answer when users dismiss scope-confirmation then add more files. `state.json` is the right primitive and already needs to exist for session persistence. |
| D6 | `/api/init-status` as a new dedicated endpoint, not an extension of `/api/documents` | Extend existing documents API | Resolves TQ8. Dedicated endpoint is clearer, testable in isolation, and the shape is entirely about onboarding (variant classification, suspicious-pattern detection, samples). Future endpoints like `/api/hub-status` can follow the same pattern cleanly. |
| D7 | `state.json` writes go through the server (API endpoints), not directly from the SPA | Direct FS access from SPA (not possible in browser); CLI writes from SPA (hacky) | SPA is a browser; browsers don't touch the filesystem. Server owns the lock; server owns the write. This also centralizes the "only V0-1 lock-owner writes" enforcement. |
| D8 | `initContent()` lives on the server, exposed via API + CLI | Client-side only (SPA writes via dev tools); CLI-only | Must be server-owned because the file write needs to respect the lock and trigger the file watcher naturally. CLI consumer is a convenience for non-GUI flows. |
| D9 | Starter template is a fixed string with no variables in v1 | Templated with project name, author, date | Keep v1 minimal. Users can edit after creation. Templating is future work. |
| D10 | `schemaVersion` bumps re-surface welcome (not forcefully — with a small banner) | Silent re-surface; no re-surface ever | Quiet re-surface respects user intent (they dismissed before) while opening a channel to meaningfully update the first-run UX later. |
| D11 | Welcome never shows for returning users (dismissed + same schemaVersion) | Show if `lastOpenedDoc` is null | Don't interrupt users who've already onboarded. If they cleared `state.json` deliberately, they get welcome; otherwise no. |
| D12 | Three-variant logic computed server-side in `/api/init-status`, not client-side | Client computes variant from file counts | Server already has the `ContentFilter` + file index; one place of truth. Client just renders the variant the server tells it. |
| D13 | Config editing during onboarding is **narrow** — one endpoint (`POST /api/config/add-exclude`), used only by the suspicious-variant one-click action | (a) Full scope-editor UI writing general config via `POST /api/config/update`; (b) punt entirely — tell users to edit `config.yml` externally | The story's C-A3 requires config persists. The web editor can't open YAML (SourceEditor is markdown-only) so "open config.yml as a document" doesn't work. A full config-editor UI is significant scope (form validation, YAML round-trip preserving comments, conflict resolution with concurrent edits). The 95% case is "suspicious variant → add one exclude pattern," which a narrow endpoint handles. For other config edits, the "Edit scope" CTA shows the path to `config.yml` and tells the user to open it in their system editor. Covers I-A4 (skippable) and C-A3 (persistent) for the critical case. |
| D14 | Welcome reappears when `fileCount === 0` even after prior dismissal | Once dismissed, permanently hidden until `schemaVersion` bump | Story's I-A1. Handles the "deleted everything and came back" edge case. The alternative would silently drop users into an empty editor with no affordances — the same dead-end the story was written to fix. Cost: one extra `/api/init-status` call on every SPA load; negligible. |

## 11) Open questions

| ID | Question | Blocker? | Next step |
|---|---|---|---|
| Q1 | Exact copy for each variant's welcome screen | No — Sarah's domain | Sarah drafts during UI implementation; review with Andrew before ship |
| Q2 | ~~Does the "Edit scope" CTA open config.yml in the editor or OS editor?~~ **Resolved by D13.** | N/A | Neither — R8's "Edit scope" shows the path and instructs the user to open it in their own editor. R9 has one-click add-exclude for the suspicious case. |
| Q3 | Does `welcome.state === "pending"` need to be a real state, or is "not-shown" → "dismissed" sufficient? | No | Defer; use only not-shown / dismissed in v1; add `pending` if a multi-step flow needs it later |
| Q4 | How is the `WELCOME_SCHEMA_VERSION` bump communicated on re-surface — banner text, modal, nothing? | No — Sarah's call | One-line banner at top of welcome screen, dismissible; no modal |
| Q5 | Does R14 (`open-knowledge welcome --reset`) belong in this spec or the `cli-init-clarity` line of specs? | No | Keep here; it's the escape hatch for the state this spec owns |
| Q6 | Should `needsAttention` nudge (R18) be a banner in the editor or a badge on some corner? | No — Sarah's call | Defer to Sarah; R18 is a Could anyway |
| Q7 | What happens to `state.json` when the content directory is renamed / moved? | Yes — but handled | `state.json` is at `<contentDir>/.open-knowledge/state.json`, which moves with the project. Handled transparently. The adjacent multi-project spec's project-id primitive does NOT need to propagate into state.json in v1. |
| Q8 | Coordination with multi-project spec's `~/.open-knowledge/projects.json` — two different state files at two different scopes. Risk of confusion? | No | They're at different paths (user-scope vs project-scope) and carry different data (registry vs session). Document the distinction in CLAUDE.md. |

## 12) Assumptions

- **A1:** V0-1 server lock (`packages/server/src/server-lock.ts`) is stable and its write-ownership semantics are correct. Verification: re-read `server-lock.ts` during implementation; run existing V0-1 tests.
- **A2:** `ContentFilter` is fast enough to enumerate 10k files in < 200ms. Verification: benchmark in a fixture with 10k seeded `.md` files.
- **A3:** `file-watcher` in-memory index is consistent with what `ContentFilter.isIncluded()` would report — they're the same source of truth. Verification: grep.
- **A4:** Sarah's UI can consume JSON from `/api/init-status` via `fetch()` in the SPA without CORS issues (same origin today). Verification: dev-mode smoke test.
- **A5:** `state.json` mode 0600 works on all target filesystems (APFS, ext4). Verification: test on both.
- **A6:** ✅ **Verified 2026-04-14** against the `open-knowledge` repo itself. All ten suspicious patterns except `target`, `.nuxt`, `.output` match real directories in a typical monorepo. `node_modules`/`.git`/`dist`/`build`/`.next` are already caught by spec 1's default `content.exclude`, so they only surface in the suspicious variant if a user explicitly un-excluded them. `vendor`/`out` are the practical cases. `Start anyway` is equal-weight, so false-positives (e.g., a Rust project with a legitimate `target/` directory containing authored docs) are dismissible without consequence.
- **A7:** Schema-version-based re-surface is low enough friction that we will actually bump it for meaningful UX changes rather than avoiding the churn. Verification: cultural, not technical.

## 13) In scope

- R1–R13 (all MUST).
- R14–R16 (SHOULD) — ship unless blocked.
- R17, R18 (COULD) — defer freely.

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Welcome-screen UI work blocks on unclear copy/design, delaying the whole spec | Medium | Medium | Sarah drafts variant copy in `meta/welcome-copy.md` early; Andrew's platform work proceeds in parallel with placeholder copy |
| `state.json` lock contention bugs surface only under multi-process scenarios that our tests don't cover | Medium | High | Integration test with two simulated server instances against one `.open-knowledge/` directory; assert exactly one succeeds, the other fails cleanly |
| Starter `README.md` content choice triggers user disappointment ("it's too cute" or "it's too bland") | Medium | Low | Keep the template minimal; let users edit immediately |
| `suspicious` variant's false-positive rate is too high, annoying users with legitimate `vendor/`, `target/`, etc. directories | Low | Medium | `Start anyway` CTA is equal-weight; no forced correction; dismissal is final unless schemaVersion bumps |
| Session-restore opens a deleted doc, crashes the editor | Low | Medium | `lastOpenedDoc` existence-check against the file index before opening; fall back to first file on miss |
| `schemaVersion` churn annoys returning users every time we tweak welcome copy | Low | Medium | Bump only for meaningful flow changes; don't bump for copy edits |
| `/api/init-status` exposes absolute paths (privacy on shared machines) | Low | Low | localhost-only binding; no different from existing document APIs |
| Users who want to pre-commit `.open-knowledge/state.json` (unusual, but possible) get a surprise when R13 `.gitignore`s it | Very low | Low | Document in AGENTS.md that `state.json` is per-user session state and should not be committed |

## 15) Future work (deferred)

- **V0-22 tabs:** extend `state.json.openTabs: string[]` — this spec reserves the schema shape, V0-22 owns the population.
- **Recent docs populated:** `state.json.recentDocs` tracked on navigation, surfaced as a "Recently edited" sidebar section.
- **CLI welcome reset to support explicit project arg:** `open-knowledge welcome --reset --project <id>` once the multi-project spec's registry exists.
- **Configurable suspicious patterns:** `config.onboarding.suspiciousPatterns` if users need domain-specific noise detection.
- **Telemetry on welcome completion:** never — but if telemetry lands generally, revisit.
- **Welcome variant A/B testing:** not feasible without telemetry; consider only when base primitive lands in other parts of product.
- **`initContent()` variants:** templated starter docs for different project kinds (engineering notes, product specs, research). Wait for demand.
- **Cross-project welcome** (from the multi-project hub): a different shape ("you have 5 projects, here's the two you touched most recently") belonging to the multi-project spec. Lives there, not here.

## 16) Agent constraints

- Do NOT write `state.json` from any process that does not hold the V0-1 server lock. Period.
- Do NOT write to `state.json` directly from the SPA. All writes go through dedicated API endpoints.
- Do NOT couple this spec's `state.json` with `~/.open-knowledge/projects.json` from the multi-project spec. They are at different scopes (per-project vs per-user) and carry different data.
- Do NOT modify `packages/core/` markdown pipeline for this work.
- Do NOT add telemetry.
- Do NOT touch `packages/server/src/persistence.ts`, `reconciliation.ts`, `shadow-repo.ts`. `state.json` is adjacent to but not part of the CRDT/shadow-repo subsystem.
- Do NOT write an unbounded `sampleFiles` array — cap at 5.
- Do NOT write an unbounded `topDirs` array — cap at 3.
- Do NOT build R17 (editor menu re-run) or R18 (needs-attention banner) before R1–R13 are green.
- When adding Zod schemas, match existing style in `packages/cli/src/config/schema.ts` and `packages/server/src/server-lock.ts`.
- Co-locate tests: `state-json.test.ts` next to `state-json.ts`; `init-content.test.ts` next to `init-content.ts`; welcome-page integration tests under `packages/app/tests/integration/`.
- Pre-commit: `bun run check` must pass. No skip-hooks.
