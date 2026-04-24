# Design Challenge Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/m6-spec-updates/specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`
**Challenge date:** 2026-04-22
**Total findings:** 12 (5 High, 4 Medium, 3 Low)

---

## Cold-read framing summary (independent-arrival test)

Before engaging the Decision Log, here is the shape I independently arrive at from goals + constraints + referenced source:

**Phase 1 (M6a):** VS-Code-pattern CLI-on-PATH via menu item. The research report + design spike already render this hand-off-ready. My independent shape matches the spec 1:1 with two minor adjustments (flagged below — see L1, L2).

**Phase 2 (M6b):** MCP wiring from Electron that writes **only** the per-editor MCP config entries, with no project-scaffolding side effects (git init, `.open-knowledge/`, AGENTS.md, launch.json). Dialog should fire the first time the user **picks a project**, not on first app launch, because the MCP server spawned by AI tools serves a specific content directory — a consent dialog divorced from the project being set up leaves a dangling question ("which project does this configure for?"). The consent UI would let the user either configure once for all future projects (leaving `cwd` to an empty/ephemeral path the CLI can handle) OR per-project.

The spec's D-M6-R1 LOCKED call ("user-scoped, fires on first desktop-app launch") + D-M6-R2 LOCKED ("bundle-absolute cliPath") creates a coherent user-scoped frame — but quietly depends on `runInit` behaving as "write MCP configs only" when it actually also calls `ensureProjectGit(cwd)`, `initContent(cwd)`, `scaffoldLaunchJson(cwd)`, `upsertRootInstructions(cwd)`, and `collectLegacyProjectConfig(cwd)`. None of those are addressed by the spec. This divergence is the signal driving H1 below.

---

## High Severity

### [H] Finding H1: `runInit` is not a "write MCP configs only" function — it has five other side effects that require a real project `cwd`

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — what would a skeptical SRE flag?), DC3 (framing validity)
**Location:** §4 Phase 2 `mcp-wiring.ts` row; §6.3; §8 Phase 2 step 5; AC2.3; G8
**Issue:** The spec's `mcp-wiring.ts` row describes the call as `runInit({ editors, mcp: true, force: <per OQ-16>, cliPath: <bundle-absolute path> })` — notably omitting `cwd`. AC2.3 repeats the same shape. The parent §8.11 call shape was `runInit({ cwd: projectPath, editors, force: false, mcp: true })` — with an explicit project path, because `runInit` is inherently per-project.

Reading `packages/cli/src/commands/init.ts:464-560` cold, `runInit` executes in this order, all against `cwd`:

1. `const cwd = resolve(options.cwd ?? process.cwd());` (line 465) — if `cwd` is unset, falls back to `process.cwd()`, which for a packaged macOS Electron app launched from Launch Services is **`/`** (the root filesystem).
2. `await ensureProjectGit(cwd)` (line 474) — runs `git init` at `cwd` if no `.git/` present. This is a fail-fast operation per R2/D12 of the shadow-repo spec.
3. `contentResult = initContent(cwd)` (line 479) — scaffolds `.open-knowledge/` at `cwd`.
4. `writeEditorMcpConfig(target, cwd, ...)` (line 519) — the only step that's actually "write MCP configs."
5. `collectLegacyProjectConfig(target, cwd)` (line 526) — reads `<cwd>/.mcp.json`, `<cwd>/.cursor/mcp.json`, etc.
6. `scaffoldLaunchJson(cwd, ...)` (line 533) — writes `<cwd>/.claude/launch.json` when Claude is selected.
7. `upsertRootInstructions(cwd, ...)` (line 544) — writes/updates `<cwd>/AGENTS.md`.

Consequences of the D-M6-R1 user-scoped framing that the spec quietly inherits:

- **If `cwd` defaults to `/`** (macOS packaged-app `process.cwd()` is typically `/`): `ensureProjectGit` tries to `git init /`. Even if permission-denied, this is a user-visible error; if it succeeds under sudo or if the user ever has root privileges, `/.git/` lands on disk.
- **`scaffoldLaunchJson(cwd='/')` writes `/.claude/launch.json`** — but if `cwd` happens to be the user's home (e.g., app launched from a terminal), it writes `~/.claude/launch.json`. **`~/.claude/` IS Claude Code's user-level config directory.** Writing a VS Code-shaped `launch.json` there collides with Claude Code's own files.
- **`upsertRootInstructions(cwd)` writes `<cwd>/AGENTS.md`** — a file that the knowledge-base convention uses as the repo's persistent agent-instructions canonical. Writing to `/AGENTS.md` or `~/AGENTS.md` is unrelated to any project and pollutes a namespace the user may own for different purposes.
- **`initContent(cwd)` creates `<cwd>/.open-knowledge/`** with a `config.yml`. If this lands at `~/.open-knowledge/`, it collides with the user-level OK config that the marker file `mcp-status.json` is also supposed to live in — and OK's config loader (`packages/cli/src/config/loader.ts`) might now resolve content paths against `$HOME` on subsequent CLI runs.
- **`ensureProjectGit` throws `ProjectGitInitError`** (D9/R2) when git is missing from the system. Under the D-M6-R1 framing, this error fires on every first-launch of OK even when the user never asked to initialize anything. The consent dialog converts into a "you need to install git first" blocker for everyone who doesn't have git installed, which P1 (non-technical docs author) may not have.

**Current design:** "call `runInit({ editors, mcp: true, force: <per OQ-16>, cliPath: <bundle-absolute path> })`" (§4 Phase 2 `mcp-wiring.ts` row) — no `cwd`.
**Alternative:** Two options, in descending order of soundness:

1. **(A, preferred) Split `runInit` into `runInit` (project-scoped, current behavior) and `writeUserMcpConfigs` (user-scoped, MCP-only).** M6b calls the new function. The new function loops over `targets`, calls `writeEditorMcpConfig(target, '', force, { cliPath }, home)` (or a redesigned signature that doesn't take `cwd` at all), and returns `EditorMcpResult[]`. No git init, no `.open-knowledge/` scaffold, no AGENTS.md touch, no `launch.json`. This matches the evidence file's own finding that "Primary writes already land at user-level paths. M6b's 'user-level MCP config' framing matches the current CLI default. No new write path needed." — but the spec then still calls `runInit` instead of the MCP-only subset.
2. **(B, fallback) Keep calling `runInit` but pass an isolated, disposable `cwd`.** E.g., `cwd = app.getPath('userData')` (`~/Library/Application Support/Open Knowledge/`) so `git init`, `.open-knowledge/`, `AGENTS.md`, `launch.json` all land in an OK-owned location that never surprises the user. This is structurally safer but still writes files nobody asked for — a dirty hack. If Option A is rejected for scope reasons, flag this as the explicit choice.

Do NOT rely on `process.cwd()` behavior being `/` or any other specific path — Electron's `app.setPath('userData')` is reliable but `process.cwd()` is not.

**Trade-off:** Option A is ~2 hours of CLI work + one backward-compatibility test. Option B adds a ~5-line comment explaining why `cwd` is set to userData. Both are cheap compared to shipping a feature that `git init`s random directories on first app launch.
**Status:** CHALLENGED
**Suggested resolution:** Before M6b implementation, verify empirically what `process.cwd()` resolves to in a signed packaged macOS app launched from Finder, Launch Services cold, Dock, and Spotlight. Then decide between A and B. Update the `mcp-wiring.ts` row in §4, G8, AC2.3, and the implementation plan §8 step 5 to reflect the chosen shape. Add an AC that verifies **no `.open-knowledge/`, `.claude/`, `.git/`, or `AGENTS.md` is created outside the expected location after M6b consent-dialog acceptance.**

---

### [H] Finding H2: The "partial-failure" handling (OQ-19) and the "merge npx shape" handling (OQ-16) are architecturally incompatible — one must win

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer), DC1 (simpler alternative)
**Location:** §4 Phase 2 `mcp-wiring.ts` row; OQ-16; OQ-19 ("must resolve before impl")
**Issue:** The spec describes two pre-`runInit` behaviors and a post-`runInit` behavior that operate at different granularities:

- **OQ-16 (pre-read):** "before calling `runInit`, read each selected editor's existing OK entry. If the existing entry's `command`+`args` match the known npx shape exactly, pass `force: true` per-editor."
- **OQ-19 (recommended (b)):** "log per-editor result, show a diagnostics toast listing failures, keep succeeded writes + don't mark the marker `configured: true` so dialog re-fires next launch" — but "Marker only set to `configured: true` if ALL selected succeed; otherwise defer marker write so the dialog re-fires with prior selections pre-filled."

But `runInit` accepts `force: boolean` — a single boolean for ALL editors. It does not accept "force for Claude Desktop only, not for Cursor." To pass per-editor `force`, M6b would have to invoke `runInit` once PER editor, each with a one-element `editors` array + its own `force` value. That decomposition then amplifies the OQ-19 partial-failure surface by N — the `runInit` side effects (git init, `.open-knowledge/`, AGENTS.md, launch.json per H1 above) fire on every iteration.

Alternatively, M6b could skip `runInit` entirely and call `writeEditorMcpConfig` directly — but `writeEditorMcpConfig` is not exported from `packages/cli/src/commands/init.ts`.

**Current design:** "call `runInit({ editors, mcp: true, force: <per OQ-16>, cliPath })`" with a per-editor conditional `force`.
**Alternative:**
- **(A)** Export `writeEditorMcpConfig` from the CLI. M6b iterates selected editors, calls `writeEditorMcpConfig(target, '', force, installOptions, home)` per editor with per-editor `force`, aggregates results, writes marker conditionally per OQ-19 (b). This is the structurally clean decomposition and aligns with H1's Option A.
- **(B)** Add a `forceEditors?: Set<EditorId>` option to `runInit` so M6b can say "force these ones, not those." Backward-compatible.

**Trade-off:** Option A also solves H1; both require CLI surface changes the spec currently doesn't scope. The spec's AC2.11 test asserts the behavior but does not name the mechanism — choose one before writing the test or the test will be hard to express.
**Status:** CHALLENGED
**Suggested resolution:** Decide A or B before AC2.11 is written. Add the chosen signature to §4 + the CLI change row. If neither, the spec should explicitly acknowledge that M6b performs N independent `runInit` invocations (with the H1 side effects firing N times) and score the user-visible impact.

---

### [H] Finding H3: Consent dialog timing races `auto-updater` + `openProjectOrFallbackToNavigator` + `browser-window-created` + M4 deep-link dispatch in `app.whenReady()`

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE / customer-facing)
**Location:** §6.1 (dialog piggybacks on Navigator); §4 Phase 2 `index.ts` row; G7 / G10; OQ-13
**Issue:** The spec says: "Dialog renders inside the Navigator window (OQ-13 resolved) — piggybacks on NavigatorApp's existing React tree via an `ok:mcp-wiring:show` IPC event fired after Navigator's `did-finish-load`."

Reading `packages/desktop/src/main/index.ts` cold (line 696-818), `app.whenReady()` already orchestrates:

1. `appState = loadAppState()` — may restore `lastOpenedProject`.
2. Branch: `if (appState.lastOpenedProject && !optionHeld && existsSync(...))` → `openProjectOrFallbackToNavigator(appState.lastOpenedProject)` — **opens an editor window, NOT Navigator.**
3. Else → `openNavigator()`.
4. `autoUpdaterHandle = await bootAutoUpdater(...)` — later, this schedules Toast B via `whenRendererReady` which attaches to `browser-window-created` if no window is open yet.

Three user-reachable states where D-M6-R5 (piggyback on Navigator) breaks:

- **F1 — Second launch with `lastOpenedProject` set, no marker.** If a user ran the DMG once (say, triggered `Install Command-Line Tools…` but dismissed any MCP prompt before it existed), `lastOpenedProject` is set. On next launch, the app goes straight to an editor window — Navigator is never opened. `ok:mcp-wiring:show` has no subscriber. The marker never gets written. Dialog re-fires every launch forever, but only if Navigator opens (which it doesn't).
- **F2 — First launch via `openknowledge://` deep link.** M4's `registerProtocolHandler` queues the URL and flushes it after `whenReady`. `openProject` is called with the deep-linked path; Navigator is skipped. Same as F1. P1 users in the happy path (M6b → Claude Desktop sends "write a file" → agent-flash) might never see the dialog if the user arrives via deep link from a chat message containing `openknowledge://` (plausible if AI-tool integration is the whole point).
- **F3 — Navigator opens but `did-finish-load` lands before `ok:mcp-wiring:show` fires.** Spec says "fired after Navigator's `did-finish-load`" — but `did-finish-load` is a webContents event with no retention. If main queues the IPC send before the renderer attaches a listener (renderer's `useEffect` subscribe), the message drops silently. The spec needs a handshake-style send-then-wait-for-renderer-ack or a "renderer pulls state on mount" model, not a fire-and-forget from did-finish-load.

The auto-updater code already handles F3 via its `whenRendererReady` helper (lines 780-816) with a three-case dispatch: "window exists + loaded → fire; window exists + loading → wait for did-finish-load; no window → wait for browser-window-created." That shape is load-bearing and M6b would need to mirror it.

**Current design:** "piggybacks on the Navigator window (the default post-`whenReady` surface per D24)" (§6.1).
**Alternative:**
- **(A)** Let `McpConsentDialog` render inside **whichever window opens first** — Navigator OR the first editor window. Same pattern as M3's Toast B. IPC handshake waits for renderer-mount-ack, not `did-finish-load`. The dialog is a pseudo-modal overlay that doesn't care which host it lands in, because consent is genuinely user-scoped.
- **(B)** Gate consent-dialog firing on `app.whenReady()` actually reaching Navigator — if `lastOpenedProject` is set OR a deep link is in-flight, defer the dialog to the next Navigator open (File → New Project, or explicit user nav). Document that this means P1 users who deep-link on first app open get zero MCP prompt until they later return to Navigator.

**Trade-off:** (A) matches the auto-updater's already-production pattern and maximizes coverage. (B) is simpler to reason about but fails silently in exactly the flows the P1 smoke (AC2.6) is supposed to prove work end-to-end.
**Status:** CHALLENGED
**Suggested resolution:** Adopt (A). Mirror M3's `whenRendererReady` helper. Update §6.1 + add an AC that covers F1 + F2 (first-launch with deep link AND first-launch with `lastOpenedProject` set) — currently AC2.2 only tests the happy-path Navigator open.

---

### [H] Finding H4: D-M6-R2's bundle-absolute `cliPath` is fragile under Electron auto-update swap + app relocation, and the spec's mitigation (G5 amendment) is under-specified

**Category:** DESIGN
**Source:** DC3 (framing validity), DC2 (stakeholder gap — SRE)
**Location:** D-M6-R2; §6.3; G5; G8; OQ-18 (P2, "no expected issue"); §6.5 row "DMG uninstalled"
**Issue:** D-M6-R2 writes `cliPath = /Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh` into user-level MCP configs. The spec acknowledges three tradeoffs (§6.3):

1. App-move fragility (user drags `.app` out of `/Applications/`).
2. Paths contain spaces.
3. Two `ok` semantics per machine.

What the spec does NOT examine:

- **OQ-18 (P2 "no expected issue") is load-bearing, not incidental.** Squirrel.Mac updates via atomic `.app` replacement in place. The bundle-absolute path is stable IF AND ONLY IF the auto-updater preserves the canonical install location. If electron-updater ever moves the app to a staging path during update (e.g., `~/Library/Caches/...`), every MCP config on the user's machine points at a temporarily-nonexistent target. The window between "old app removed" and "new app swapped in" is normally milliseconds, but a user who restarts Claude Desktop in that window gets a broken spawn.
- **macOS LaunchServices + bundle-id-based path resolution.** The spec claims: "LaunchServices tracks by bundle ID, so the GUI survives the move — but absolute paths don't." This is correct but not actionable. If the user drags the app from `/Applications/` to `~/Applications/`, the GUI keeps working, but every MCP client on the machine has a stale cliPath until the user clicks into OK again AND G5's repair hook detects the mismatch AND the user clicks "Fix." In the interim, AI tools report "spawn ENOENT" (or self-diagnosing wrapper exit 69 per D-M6-R6) with zero signal pointing at OK as the cause.
- **OQ-18's "verify during M3 QA" deferral is a process risk, not a design.** M3 (auto-update) has been scaffolded but not completed — AC15 (install-on-quit round-trip) and AC16 (mid-download kill smoke) are creds-gated on M2 publishing a signed DMG (`specs/2026-04-21-m3-electron-updater/SPEC.md`). M3's tests do not exercise "MCP configs pointing at bundled cliPath survive the atomic swap" because M3 predates this design decision. Without a test gate, the first time anyone notices is when a user upgrades from v0.x to v0.y and Claude Desktop starts failing.

The alternative that D-M6-R2 REJECTED — "the M6a symlink at `/usr/local/bin/ok`" — is MORE robust to both app-move and atomic-swap, not less. The symlink is stable across updates because the wrapper's `readlink`-chased `APP_PATH` follows the live bundle wherever it lives. D-M6-R2's rationale (decouples M6b from M6a; avoids Apple Silicon PATH precedence; version-couples directly) is real, but trades robustness for decoupling.

The research report (`reports/electron-bundled-cli-install-patterns/evidence/npm-electron-coexistence.md`) surveyed exactly this tradeoff — and every VS Code fork + Zed + Cursor use the **symlink** path in their MCP-equivalent configs for this exact reason. The spec's deviation from the canonical pattern is load-bearing and deserves an explicit "why not the symlink" section.

**Current design:** "bundle-absolute `cliPath`" (D-M6-R2) with "G5 (launch-time repair hook) amended to detect mismatched `cliPath` vs current `app.getPath('exe')` and offer to re-run `runInit` with the new path."
**Alternative:**
- **(A, hybrid)** Use the symlink path when the symlink exists; fall back to bundle-absolute when it doesn't. At consent-dialog time, probe `/usr/local/bin/ok` → if present and points at OUR wrapper, write `{"command":"/usr/local/bin/ok","args":["mcp"]}`. If absent, write the bundle-absolute. Downgrades to bundle-absolute only when the user chose not to install M6a. Gets you the decoupling + robustness symmetrically.
- **(B, symlink-first with nudge)** Always use `/usr/local/bin/ok` in MCP configs. If M6a is not installed yet, surface a Phase-2 dialog like "To complete setup, OK needs to install a command-line helper. This requires your password once. [Install] [Skip — some AI tools may not work until you install from File menu later]." Unifies M6a and M6b into one user story.
- **(C, current)** Accept bundle-absolute + upgrade G5's repair hook into a HARD requirement with AC + Playwright smoke that kills-the-app-during-update, moves the app bundle, and verifies the repair. The spec has NONE of these — it just says "amend G5."

The research report + VS Code precedent strongly prefer (B). If the spec stays on (C), the AC coverage for app-move and atomic-swap needs to be explicit, not deferred to OQ-18 P2.

**Trade-off:** (A) duplicates precedence logic in M6b. (B) re-couples M6b to M6a, which D-M6-R2 explicitly decoupled. (C) keeps the current shape but pays the test-coverage debt now, not later.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine D-M6-R2 with the robustness-vs-decoupling trade made explicit. If staying on (C), add an AC that simulates app-move + verifies repair, and an AC that verifies Squirrel.Mac's atomic-swap doesn't leave any MCP client with a dead target (requires scripting against a mock update feed, which M3's `OK_UPDATER_FEED_URL` already enables). Otherwise, document OQ-18's reopen in M3 closeout.

---

### [H] Finding H5: Spec quietly assumes `child_process.spawn` handles spaces in `command` — unverified, and AC2.6 is creds-gated, which means this is a shipping-risk assumption, not an in-spec-cycle assumption

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** OQ-15 ("not verifiable in-session"); D-M6-R2 tradeoff #2; §6.3 "Paths contain spaces"
**Issue:** OQ-15 says: "Ecosystem norm is `child_process.spawn(command, args)` which does not shell-interpolate, so spaces in `command` are safe. Not verifiable in-session without source access to all 6 clients. Resolution posture: trust the ecosystem norm for initial impl; encode verification in AC2.6 across all selected editors."

AC2.6 is creds-gated on Apple Developer notarization (OQ-17 + AC2.6 "Creds-gated, full P1 E2E"). In practice this means:

- The AC cannot run in CI.
- The AC cannot run on an unsigned DMG reliably (`shell.openExternal` + TCC prompts differ).
- The AC runs only manually, post-ship, when Apple creds land.

The rejected alternative here is creating a symlink without spaces in its path and pointing MCP configs at that. The symlink path `/usr/local/bin/ok` has no spaces — guaranteed to pass spawn on every client. The bundle-absolute path contains `/Applications/Open Knowledge.app/...` which always has a space between `Open` and `Knowledge`.

The research report (`reports/electron-bundled-cli-install-patterns/REPORT.md`) does NOT establish that all six MCP clients handle spaces in `command`. It establishes that the pattern is canonical for symlink paths but says nothing about literal bundled-absolute paths.

Real-world precedent: Claude Desktop's own MCP client config reader previously had quoting bugs (anthropics/claude-code GitHub issues reference bash-interpolation of config values). "Trust the ecosystem norm" is weaker than "verify against the major clients."

**Current design:** "trust the ecosystem norm for initial impl; encode verification in AC2.6"
**Alternative:**
- **(A)** Add a spec-time verification task that reads each of the 6 MCP clients' source/docs and confirms `spawn(command, args)` with `shell: false`. Log evidence under `evidence/mcp-client-spawn-semantics.md`. If any client uses `shell: true` or `exec`, the bundle-absolute cliPath is broken for that client and the M6b write path must either (a) symlink it (b) quote it (c) refuse that client.
- **(B)** Use a symlink path that avoids the space-in-path class entirely (connects to H4 alternative B or C).
- **(C, preserve current)** Accept the risk + ensure AC2.6 runs for all 6 selected editors before M6b is "done." Explicitly add a STOP_IF: "If AC2.6 smoke fails on any editor for a spawn-related reason, do not mark M6b shipped."

**Trade-off:** (A) is ~2 hours of research. (B) reopens D-M6-R2. (C) defers the verification past ship, which is what the spec currently does implicitly.
**Status:** CHALLENGED
**Suggested resolution:** (A) is cheap and belongs in the spec phase, not post-ship. At minimum, read Claude Desktop's actual spawn code (open source? known via `claude-code` repo? verify) since it's the primary P1 target.

---

## Medium Severity

### [M] Finding M1: The "never stomp foreign customization" merge rule (OQ-16 / D-M6-R4) has two undetected false negatives

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer)
**Location:** D-M6-R4; AC2.11; OQ-16
**Issue:** D-M6-R4 defines "foreign customization" as "any deviation from the `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` exact shape." Two false-negative cases:

1. **A user who ran an older CLI that wrote `{command:'npx', args:['-y','@inkeep/open-knowledge','mcp']}`** (with `-y` flag). This is the shape shown in parent spec §8.12 D52 literal. The `-y` flag was the CLI default before the npx shape in `buildManagedServerEntry` (editors.ts:73-76) stabilized. An existing entry with `-y` is NOT "foreign customization" — it's a stale OK default — but D-M6-R4's exact-match gate flags it as foreign, skips the overwrite, and logs `mcp-wiring-skip-customized`. The P1 user with Node-less machine has a stale `-y npx` config they can't fulfill.
2. **A user whose existing entry has `env: {OK_LOG_LEVEL: 'debug'}` or any harmless augmentation.** The `mergeManagedFields` function in `editors.ts:234` preserves unrelated keys — that's already how non-force merges work. But D-M6-R4's pre-check uses exact-shape matching (see AC2.11 fixture "write a known-npx-shape entry"), not "is our managed subset compatible." It would flag this as foreign.

The canonical implementation already present in `editors.ts` — `hasMatchingManagedFields(existing, managed)` at line 227 — is the exact check D-M6-R4 reinvents, but loosely. `isCompatible` + `mergeManagedFields` is the "compatible subset" model the CLI uses today; D-M6-R4 bypasses it in favor of exact-shape comparison.

**Current design:** "If the existing OK entry matches the known npx shape exactly... overwrite with bundle-absolute cliPath. If user-customized (any deviation), skip..."
**Alternative:** Reuse the existing `isCompatible` check. If `isCompatible(existing, cwd, { cliPath: bundleAbsolute })` returns true → no-op (already matches target shape). If it returns true for the PRIOR `{mode: 'published'}` shape but not the new `{cliPath: ...}` shape → overwrite with `force: true` (this is exactly the "stale but managed" case). If it returns false for both → treat as foreign, skip.

**Trade-off:** Reusing `isCompatible` requires calling it twice in the pre-check (once for published/npx shape, once for bundleAbsolute shape) but matches the CLI's existing semantics, handles the `-y` variant, and survives future managed-shape evolution.
**Status:** CHALLENGED
**Suggested resolution:** Replace D-M6-R4's "exact npx shape" gate with "isCompatible with any prior-era OK-managed shape." Extend the CLI's `EditorMcpTarget` interface with a method like `isOkManagedShape(existing) → boolean` if needed. Amend AC2.11 to cover (i) exact npx shape overwritten, (ii) `-y npx` variant overwritten, (iii) arbitrary user env preserved but command+args overwritten, (iv) genuinely foreign `{command: 'custom-wrapper'}` skipped.

---

### [M] Finding M2: TCC / entitlements for writing `~/Library/Application Support/Claude/` is deferred to "AC2.6 empirical" — but AC2.6 is creds-gated, which loops the risk

**Category:** DESIGN
**Source:** DC2 (SRE / security engineer)
**Location:** OQ-20; AC2.6
**Issue:** OQ-20 says: "Non-sandboxed apps (no `com.apple.security.app-sandbox` entitlement) generally have free home access outside TCC-protected paths... `~/Library/Application Support/` is typically unrestricted. Verify empirically on signed+notarized build during AC2.6 smoke."

Two risks:

1. **AC2.6 is creds-gated.** Same as H5 — the verification cannot run in CI and doesn't run until post-ship manual QA. If TCC DOES prompt for `~/Library/Application Support/Claude/` access on signed+notarized builds (plausible — Apple's TCC rules evolve quarterly), the user sees a surprise dialog mid-flow: "Open Knowledge wants to access data in Claude" with OK / Don't Allow. If they click Don't Allow, the Claude Desktop write silently fails (OQ-19 recommendation (b) keeps the dialog reopening, but never reveals the TCC decision is the cause).
2. **macOS 15 Sequoia / 16 introduces TCC for per-app data directories.** Apple has been expanding TCC protection gradually. `~/Library/Application Support/` is currently unrestricted for non-sandboxed apps, but Apple has signaled it will restrict "cross-app data access" in future releases. The spec assumes current state is stable — plausible for the M6 horizon, but the spec itself acknowledges "Apple's TCC rules evolve."

**Current design:** "Verify empirically on signed+notarized build during AC2.6 smoke. If a TCC prompt fires mid-flow, user may dismiss it, leaving config unwritten — add dialog language preparing the user for OS prompts."
**Alternative:**
- **(A)** Add a pre-emptive "OS may ask for permissions" message in the consent dialog, pointing to known targets. User is primed to allow when the prompt fires.
- **(B)** Before firing each per-editor write, probe the target path with `fs.access(dir, fs.constants.W_OK)` — if it fails, route the failure through OQ-19 (b) with explicit "access denied — this is a macOS security setting" copy.
- **(C)** Move AC2.6 OUT of "creds-gated post-ship" into "creds-gated but required before M6b marked shipped" and add the explicit TCC-behavior check as a sub-AC.

**Trade-off:** (A) adds 1-2 lines of copy. (B) adds a ~10 LOC probe loop. (C) is a process choice — the spec already gates AC2.6 as creds-gated; changing that to "required before ship" is the real decision.
**Status:** CHALLENGED
**Suggested resolution:** Combine (A) + (B). Add a visual copy note in the dialog. Add a probe-write loop before each editor write. Add a structured log event `mcp-wiring-target-write-denied` so surface-level diagnostics can distinguish TCC denial from disk-full.

---

### [M] Finding M3: The self-diagnosing wrapper (D-M6-R6) exits with code 69 but MCP clients may display the exit code / stderr inconsistently — the UX for P1 is undefined

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer)
**Location:** D-M6-R6; G2; AC2.12; OQ-8
**Issue:** D-M6-R6 says: "emits a single-line machine-readable JSON error to stderr — `{"error":"ok-bundle-missing","hint":"..."}` — and exits with a distinct non-zero code (e.g. 69 / `EX_UNAVAILABLE`). MCP clients surface the stderr to the user cleanly."

This last claim is unverified. MCP client surfacing behavior:

- **Claude Code (TUI):** displays stderr in the agent session output. User sees the JSON as raw text. The "hint" field is visible but buried.
- **Claude Desktop:** MCP server errors surface in a separate panel (per Anthropic docs), but as of research cutoff the UX is "MCP server crashed — check logs." The JSON payload is not parsed into a user-actionable dialog. P1 user sees "Open Knowledge appears to be having issues."
- **Cursor:** similar to Claude Desktop — MCP connection errors surface in the sidebar status.
- **VS Code (GitHub Copilot / MCP extension):** depends on which extension. Usually logs to Output panel; user has to open it.

The spec's assumption — "MCP clients surface the stderr to the user cleanly" — conflates "to a developer reading logs" with "to P1, a non-terminal user." A P1 docs author encountering "Open Knowledge appears to be having issues" has no path to the JSON, no hint text in the UI, and no clue that the recovery is "reinstall the DMG or delete the config entry."

Note: G5 (launch-time repair hook) addresses one case (user dragged Trash + reinstalled), but requires the user to launch OK at some point. A user who has NEVER launched the OK app (installed from DMG once, then only interacts via Claude Desktop) never gets the repair prompt.

**Current design:** Self-diagnosing wrapper + exit 69 + "MCP clients surface the stderr to the user cleanly."
**Alternative:**
- **(A)** Add a "guard rail" server-side: when OK's main app launches, if a valid install detects that any of the known MCP config files has a `cliPath` pointing at a nonexistent file, display a pro-active repair offer ("We detected an older Open Knowledge install referenced in your Claude Desktop config. Click to update it"). This is the symmetric of OQ-8 option (a) "active cleanup" — the spec punted on cleanup as "too risky" but didn't consider PASSIVE repair-offer (user-driven).
- **(B)** Verify empirically what Claude Code / Claude Desktop / Cursor each show when an MCP server stderr-emits the JSON. Document in evidence/. If "hint" is not user-visible in ANY of the clients, re-evaluate whether the JSON shape is the right medium.

**Trade-off:** (A) adds ~50 LOC + a new dialog. (B) is research time. Together they close the loop on OQ-8.
**Status:** CHALLENGED
**Suggested resolution:** At minimum, run (B) before ship. Document what each client shows. If the hint is buried in all clients, reshape the wrapper's output to prepend a terse copy like "Open Knowledge has been removed. Reinstall from the Open Knowledge DMG." on line 1, JSON on line 2 — so "tail -1" remains machine-readable and "head -1" is human-readable.

---

### [M] Finding M4: Spec bakes in an assumption about M7's shape — "P1 persona needs M6 complete" may not hold if M7 ships a different onboarding

**Category:** DESIGN
**Source:** DC3 (framing validity), DC1 (simpler alternative — do we need M6b at all for the design-partner gate?)
**Location:** Top of spec ("Blocks: M7 (first design-partner build requires M6 complete for the P1 persona)"); §6.4; §2 G10
**Issue:** The spec frames M6b as P1-critical: "Fresh Mac, NO Node.js installed, NO terminal contact → install DMG → launch app → MCP consent dialog fires → accept defaults → open Claude Desktop → Claude calls `write_document`." This is cited as the gate for M7 (first design-partner build).

But M7's spec does not exist yet. The assumption that "first design-partners are P1" is a product choice, not a technical constraint. Alternative personas that would NOT block on M6b:

- **Design partners who are themselves terminal-fluent** (Claude Code / CLI power users). They will `ok init` from terminal; M6a alone is sufficient.
- **Design partners whose team has one ops person who pre-configures the machines.** M6a is sufficient.
- **Design partners in a controlled pilot where Inkeep runs onboarding sessions.** Pre-configuration is done out of band.

If M7's design partners are actually option 1, 2, or 3, M6b is not on the critical path at all. M6a alone + explicit "run `ok init` from terminal after installing" docs would unblock M7.

Conversely, if M6b is truly load-bearing for M7, the AC2.6 creds-gated smoke (which cannot run in CI and cannot happen before Apple Developer Program enrollment completes) is a blocking dependency that the spec acknowledges but doesn't schedule.

**Current design:** "Blocks: M7 (first design-partner build requires M6 complete for the P1 persona)."
**Alternative:** Explicitly scope M6b as "P1-optimized path" rather than "P1-gating." Design partners can ship via M6a + `ok init` from terminal as a fallback. M6b is the nice-to-have that converts the 2-command onboarding into a 0-command onboarding.

**Trade-off:** Rescoping unblocks M7 on M6a alone, which is 2-3 weeks faster if Apple creds stall AC2.6.
**Status:** CHALLENGED
**Suggested resolution:** Confirm with product (the user) whether M7's first design-partners are genuinely P1 personas or Persona-X with terminal fluency. If Persona-X, demote M6b from "blocks M7" to "part of the post-M7 polish path" and lift the dependency on AC2.6 credentials. This also relieves H5's shipping risk by buying verification time.

---

## Low Severity

### [L] Finding L1: `extraResources` filter `['**/*', '!**/*.map']` in OQ-22 preserves dev-only files that bloat the bundle

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** OQ-22
**Issue:** Design spike §2 shows electron-builder.yml diff with `filter: ["**/*", "!public/**", "!**/*.map"]`. OQ-22 then reverses the `!public/**` exclusion to preserve `ok ui` asset reachability. Final filter `['**/*', '!**/*.map']` includes:

- Type-definition files (`*.d.ts`) — no runtime effect, but ~500KB+ bundle weight.
- Test fixtures co-located with source (the CLI tests are excluded at build time, but any `fixtures/` or `test-resources/` that end up under `dist/` ship).
- README/LICENSE duplicated from the source tree.

Modern electron-builder filter discipline: ship only what the runtime needs. A more precise filter: `['**/*.mjs', '**/*.cjs', '**/*.json', '**/public/**']` covers the runtime surface without the dev-only files.

**Current design:** `filter: ['**/*', '!**/*.map']`.
**Alternative:** Explicit positive filter listing runtime-needed globs. Measure before/after `du -sh dist-desktop/mac/Open\ Knowledge.app/Contents/Resources/cli/`.
**Trade-off:** Negligible UX impact (bundle size), but matches VS Code's discipline of shipping minimal bundles.
**Status:** CHALLENGED
**Suggested resolution:** Non-blocking. Can ship with `['**/*', '!**/*.map']`, then tighten in a follow-up PR if bundle size matters.

---

### [L] Finding L2: The admin-prompt-decline UX (OQ-7) has two "lower-surprise" options — not one

**Category:** DESIGN
**Source:** DC1, DC2
**Location:** OQ-7
**Issue:** OQ-7 frames the choice as "silent-return (lower-surprise) vs toast." A third option not considered: surface the admin-prompt decline AS a dismissible info message inside the Navigator window — same channel the consent dialog uses. Leverages the D-M6-R5 piggyback infrastructure for free.

**Current design:** "Silent-return is the lower-surprise option; toast may be warranted if follow-up UX needs to cue the user toward the menu item."
**Alternative:** Navigator info-banner persistent until dismissed: "Command-Line Tools not installed. [Install] [Dismiss]"
**Trade-off:** Adds a minor UX surface but reuses existing pattern.
**Status:** CHALLENGED
**Suggested resolution:** Optional — dec ide alongside D-M6-R5 implementation.

---

### [L] Finding L3: Scope gap — Windows / Linux path for M7 design partners is implicit NEVER but not stated

**Category:** DESIGN
**Source:** DC3
**Location:** NG4 ([NOT NOW] "Windows PATH install ... + Linux `.deb`/`.rpm` postinst"); `Blocks: M7`
**Issue:** NG4 defers Windows + Linux to post-M6 but doesn't address the scenario where M7 design partners are on Windows. The spec claim that "M6 blocks M7" combined with NG4 implies "M7 launches macOS-only." Is this intentional?

If M7 actually must support Windows (even internally), M6 as specified cannot unblock it — NG4 forecloses the Windows path, so Windows users need their own equivalent of M6a + M6b, which is not scoped in any existing spec.

**Current design:** "macOS-only v0... Menu item is gated on `process.platform === 'darwin'`; non-darwin users don't see it."
**Alternative:** Explicit scope statement: "M7 ships macOS-only. Windows + Linux for M7+N, and M6+N will extend this spec's patterns."
**Trade-off:** Wording only.
**Status:** CHALLENGED
**Suggested resolution:** Non-blocking. Add a one-liner to §3 or §6.4 confirming M7 shape.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternatives) held up where checked:**

- Single CLI binary (`ok`) vs. Cursor's two-CLI split (NG1) — strongly supported by research report D2.
- VS Code pattern for M6a — canonical, 10+ years of provenance, no serious alternative surfaced.
- Opt-in menu item vs Docker's auto-install (NG3) — correct; Docker-Desktop's pattern is the documented anti-pattern.
- `ELECTRON_RUN_AS_NODE=1` wrapper vs shipping separate Node runtime — fork-stable industry pattern.

**DC2 (Stakeholder gap) surfaced the H1-H5 / M1-M4 findings above; other stakeholder checks held:**

- Translocation guard (G3) — surfaced, supported, both VS Code + Zed did NOT ship this and have bug reports to show.
- Collision guard (G4, NG2) — Docker-Desktop's aggressive overwrite is the cautionary tale.
- Uninstall cleanliness (G6) — "only remove symlinks owned by the current app" is correct.
- Self-diagnosing wrapper (D-M6-R6) — design is sound (though M3 surfaces the UX-surfacing question).

**DC3 (Framing validity) held except where H1 / H4 / M4 surface gaps:**

- Phase split (M6a + M6b separable) — validated; D-M6-R2's decoupling is architecturally clean even if H4 flags a robustness tradeoff.
- CLI-on-PATH via menu vs. at-install-time (NG4) — menu-time is correct for macOS; installer-time is the future Windows path.
- User-scoped consent (D-M6-R1) — the framing is internally consistent, but only if H1 is resolved. The spec's evidence file ("editor-targets-and-scope.md") supports it for MCP config writes; the flaw is that `runInit` does MORE than MCP config writes.

---

## Notes on divergence from Decision Log

Two decisions where my independent-arrival differed significantly from the log and warrant re-examination:

1. **D-M6-R1 (user-scoped consent).** I arrived at per-first-project-open scope because it matches where the MCP server's `contentDir` comes from. The spec's user-scoped choice is defensible (config targets are user-level), but the rationale needs to resolve H1's side-effect problem before it's truly sound. The correct decomposition may be "consent is user-scoped, but MCP config writing is a new CLI surface that doesn't pretend to be `runInit`."
2. **D-M6-R2 (bundle-absolute cliPath).** I arrived at symlink-preferred because the research report consistently recommends symlinks for version-change robustness. The spec's decoupling rationale is real but underweights the atomic-swap / app-move failure modes (H4). A hybrid (H4 alternative A) resolves the tradeoff.

If these two re-examinations propagate, the cascade would touch §4, §6.3, G8, G9, G10, AC2.3, AC2.4, AC2.11, and the parent §8.11 / D52 corrigenda — but the result is a more robust spec.
