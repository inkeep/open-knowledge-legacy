# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/m6-spec-updates/specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`
**Audit date:** 2026-04-22
**Total findings:** 17 (5 high, 6 medium, 6 low)

Note: This spec was revised during the authoring session with two direction changes (D-M6-R1 user-scoped consent, D-M6-R2 bundle-absolute cliPath) that cascaded through many sections. Several findings below flag places where the cascade was incomplete or where new claims introduced by the revisions are not yet grounded in the supporting design spike / source code.

---

## High Severity

### [H] Finding 1: `runInit` cannot be called without `cwd` — the spec's M6b invocation pattern will `git init` in `process.cwd()` of the Electron main process

**Category:** FACTUAL
**Source:** T1 (own codebase) — `packages/cli/src/commands/init.ts:464-479`
**Location:** §4 Scope (Phase 2 `mcp-wiring.ts` row, line 94), §6.3 (proposed `RunInitOptions.cwd?` comment, line 197), §8 step 5 (line 317)
**Issue:** The spec repeatedly proposes calling `runInit({ editors, mcp: true, force: ..., cliPath: <path> })` from Electron main WITHOUT a `cwd` — §6.3's interface comment explicitly says "`cwd?: string; // optional — omit for user-scope MCP writes (Electron M6b)`" and `evidence/editor-targets-and-scope.md` characterizes `cwd` as merely "passed through the signatures but only used by `legacyProjectConfigPath`... and `instructionsPath`." That characterization is incomplete. Two other `cwd`-consuming side effects in `runInit` are load-bearing and are NOT user-scoped:

1. `ensureProjectGit(cwd)` (line 474) runs `git init` if `.git/` is missing.
2. `initContent(cwd)` (line 479) scaffolds `.open-knowledge/` at `cwd`.

When `options.cwd` is undefined, line 465 defaults to `resolve(process.cwd())`. For a packaged Electron app on macOS, `process.cwd()` is typically `/` (Launch Services default). Calling `runInit({ editors, cliPath })` from Electron main would attempt to `git init /` and scaffold `/.open-knowledge/` — either would fail (permissions) or produce a garbage install.

**Current text (§6.3):** "`cwd?: string; // optional — omit for user-scope MCP writes (Electron M6b)`"
**Evidence:** `packages/cli/src/commands/init.ts:464-479`. The two side effects above are not controlled by any flag in `InitCommandOptions`. The spec does not propose refactoring `runInit` to skip content/git scaffolding when `cwd` is omitted; the `cliPath` field addition alone does not address this.
**Status:** INCOHERENT (spec's proposed invocation pattern contradicts runInit's actual behavior)
**Suggested resolution:** Either (a) propose a new `skipProjectScaffold?: boolean` option that short-circuits steps 0-1 (ensureProjectGit + initContent) when Electron main calls for a MCP-only write; or (b) require `cwd` from Electron and scaffold into a well-known user-scope directory (e.g., `~/.open-knowledge/`, which is already the OK_DIR). The evidence file should also be amended to flag `cwd`'s role in `ensureProjectGit` and `initContent` — not only `legacyProjectConfigPath` / `instructionsPath`.

---

### [H] Finding 2: AC2.6 P1 smoke still includes "Install Command-Line Tools" step, contradicting G10 and D-M6-R2

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** §5 AC2.6 (line 132) vs §2 G10 (line 57) + §10 D-M6-R2 (line 347)
**Issue:** Post-D-M6-R2, the MCP config uses a bundle-absolute `cliPath`, decoupling the P1 MCP path from the "Install Command-Line Tools…" menu item. G10 and D-M6-R2 both explicitly say the menu click is "an *optional* follow-on for users who want shell access — it is not on the P1 MCP path anymore." AC2.6 is stale; it still lists the CLT install step between "open new project" and "MCP consent dialog."
**Current text (AC2.6):** "Fresh Mac, NO Node installed, NO terminal contact: install signed+notarized DMG → open new project → **Install Command-Line Tools (admin prompt)** → MCP consent dialog (all defaults accepted) → open Claude Desktop → …"
**Evidence:** G10 at line 57 explicitly excludes the CLT step. D-M6-R2 at line 347 confirms the decoupling.
**Status:** INCOHERENT (ACs should verify the design, not describe a pre-revision flow)
**Suggested resolution:** Remove "Install Command-Line Tools (admin prompt) →" from AC2.6 step sequence; replace "open new project" with "launch app" to match G10's language (consent dialog fires on first launch, not first project-open, per D-M6-R1).

---

### [H] Finding 3: Consent dialog firing trigger contradicts itself — user-scoped per D-M6-R1 but Playwright AC+scope row describe opening a tmp project

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** §4 Scope (`mcp-wiring.e2e.ts` row, line 100), §5 AC2.8 (line 134), §6.1 IPC event description (line 171)
**Issue:** D-M6-R1 + G7 + §6.2 all say the consent dialog fires on **first desktop-app launch**, user-scoped, from `app.whenReady()` — Navigator is open, no project is loaded. But:

1. Line 100 (scope table): "Launches app → **opens a tmp project** → asserts consent dialog renders..."
2. Line 134 (AC2.8): "launches app with a tmp project path → asserts consent dialog rendered..."
3. Line 171 (IPC event `ok:mcp-wiring:show`): "Fires on **first-project-open**." ← stale pre-D-M6-R1 phrasing

If the dialog fires on `app.whenReady()` before any project is opened (per line 97), then the "opens a tmp project" step in the Playwright smoke is unnecessary / contradictory. If the Playwright smoke still requires opening a project, then the actual trigger is not on `whenReady` — the spec is inconsistent about when the dialog fires.
**Current text (line 171):** "`ok:mcp-wiring:show` (M → R event) — payload: `{ detectedEditors: EditorDetection[] }`. Fires on first-project-open."
**Evidence:** G7 line 54 ("First time the Electron **desktop app** is launched"); §4 line 97 ("on `app.whenReady()`, call `runMcpWiringOnFirstLaunch()` ONCE"); D-M6-R1 line 346 ("fires on first desktop-app launch").
**Status:** INCOHERENT (three leftover references that contradict the cascading revision)
**Suggested resolution:** Update line 171 to "Fires on first desktop-app launch when no user-scoped marker exists." Update lines 100 and 134 to remove the "opens a tmp project" language — the smoke should assert the dialog fires on `_electron.launch()` without opening a project. If project-opening is used as a proxy for "wait for Navigator to finish loading," re-phrase to "waits for Navigator's `did-finish-load` event" so the intent is clear.

---

### [H] Finding 4: Structural section numbering — §8 "Implementation sequence" is missing, its content nested under §7 "Known gaps / open questions"

**Category:** STRUCTURAL
**Source:** Phase 2 reader pass
**Location:** §7 through §9 (lines 269-340)
**Issue:** The spec has `## 7) Known gaps / open questions` at line 269, then the final OQ at line 297, then directly `### Phase 1 (M6a)` at line 299 (line 299-309) and `### Phase 2 (M6b)` at line 311 (line 311-322) with implementation-sequence steps, then `## 9) Agent constraints` at line 324. There is no `## 8) Implementation sequence` header. The Phase 1 / Phase 2 step lists at lines 299-322 are semantically §8 implementation sequence but are structurally nested under §7 (§7 closes only when §9 opens at line 324). A cold reader parsing section numbering sees a jump from §7 to §9 and loses the implementation-sequence framing.

Additionally: the changelog at `meta/_changelog.md:11` notes "identified structural bug: `## 7) Known gaps / open questions` header was dropped when §6.5 was inserted; OQ-1..OQ-11 currently float bare. To be fixed in cascade." — the §7 header issue appears to have been fixed but the §8 gap was introduced or not noticed.
**Current text:** `## 7) Known gaps / open questions` → (OQ-1 through OQ-14) → `### Phase 1 (M6a)` → `### Phase 2 (M6b) — after M4 + M5 merge` → `## 9) Agent constraints`
**Evidence:** `grep "^## \|^### "` output confirms no `## 8)` header exists.
**Status:** INCOHERENT
**Suggested resolution:** Insert `## 8) Implementation sequence` at line 298 (between the last OQ and the Phase 1 steps). This also makes §9's "Agent constraints" header coherent with standard spec structure.

---

### [H] Finding 5: OQ ordering — OQ-14 appears after OQ-15 through OQ-22

**Category:** STRUCTURAL
**Source:** Phase 2 reader pass
**Location:** §7 (lines 271-297)
**Issue:** The OQs are in order 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 14. OQ-14 at line 297 should sort between 13 and 15. The changelog indicates OQ-12 through OQ-22 were added in a single session (2026-04-21) so re-sequencing is straightforward. As-is, a reader referenced to "OQ-14" from AC2.2 (line 128) scrolls past OQ-13 expecting the next entry to be OQ-14, sees OQ-15 instead, and must scan further.
**Current text:** See grep output — OQ numbering confirmed by `grep -oE "OQ-[0-9]+" SPEC.md | sort -u`; by position they run 1..13, 15..22, 14.
**Evidence:** Direct inspection of lines 289-297.
**Status:** STRUCTURAL
**Suggested resolution:** Move OQ-14 (line 297) into position between OQ-13 (line 288) and OQ-15 (line 289). No content change; pure re-ordering.

---

## Medium Severity

### [M] Finding 6: G5's broken-symlink repair does NOT cover the post-D-M6-R2 cliPath staleness case that §6.3 claims it mitigates

**Category:** COHERENCE
**Source:** L1 + L3 (missing conditionality)
**Location:** §2 G5 (line 49) vs §6.3 tradeoffs paragraph (line 224)
**Issue:** §6.3 says "App-move fragility… Mitigated partly by G5 (launch-time repair hook) — **amend to detect mismatched `cliPath` vs current `app.getPath('exe')`** and offer to re-run `runInit` with the new path." But G5 itself (line 49) only describes repairing the `/usr/local/bin/ok` broken symlink (Phase 1 concern) — it says nothing about detecting mismatched MCP-config `cliPath` across selected editors (Phase 2 concern). The §6.3 claim that G5 mitigates the fragility is aspirational; G5 as written in §2 Goals doesn't do this work.
**Current text (§2 G5):** "On app launch: if `/usr/local/bin/ok` is a broken symlink pointing at a nonexistent bundle, offer 'Fix Command-Line Tools' dialog. Handles the drag-to-Trash-then-reinstall case."
**Evidence:** G5 is a Phase 1 goal (line 49, under "Phase 1 — CLI-on-PATH (M6a)"); §6.3 at line 224 implies a Phase 2 extension that isn't scoped in §2, §4, §5 (no AC covers it), or §8.
**Status:** INCOHERENT (spec claims mitigation exists, but the mitigation isn't scoped)
**Suggested resolution:** Either (a) split G5 into G5a (Phase 1 symlink repair) and G5b (Phase 2 cliPath-mismatch repair across editor configs) and add an AC for G5b; or (b) move the app-move fragility mitigation into an explicit Future Work / OQ item and remove the "Mitigated partly by G5" claim from §6.3.

---

### [M] Finding 7: G2's self-diagnosing wrapper behavior is not in the design spike referenced as authoritative

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §2 G2 (line 46), AC2.12 (line 138), §10 D-M6-R6 (line 351), §6 line 142
**Issue:** §6 opens with "Phase 1's design is fully captured at [reports/…/m6-implementation-design.md](…)" — implying that referenced doc is the authoritative design for all Phase 1 behaviors. However, G2's self-diagnosing JSON-stderr behavior (OQ-8 resolution → D-M6-R6) is NOT in the referenced design spike. The spike's wrapper script at `m6-implementation-design.md:24-64` has no presence-check for CLI/Electron paths; it unconditionally invokes `"$ELECTRON" "$CLI" "$@"`. A cold implementer who reads §6's authoritative-reference claim, then reads the spike, will miss the self-diagnosing behavior — and end up shipping a wrapper that crashes with a generic exec error rather than the specified JSON error.

Additionally, AC2.12 references `APP_BUNDLE_DIR` as a test-time env override for path injection, but no env-var override mechanism appears in either the design spike's wrapper or in G2's prose (G2 just describes the presence check, not how tests will exercise it).
**Current text (G2):** "**Self-diagnosing (OQ-8 resolved):** before invoking the bundled CLI, the wrapper verifies that its target path (`$APP_BUNDLE_DIR/Contents/Resources/cli/dist/cli.mjs`) exists AND the Electron binary exists…"
**Current text (AC2.12):** "simulate a missing-bundle state by running `ok.sh` from a fixture with `APP_BUNDLE_DIR` pointing at a nonexistent path…"
**Evidence:** `reports/electron-bundled-cli-install-patterns/evidence/m6-implementation-design.md:24-64` (wrapper script body).
**Status:** INCOHERENT (authoritative design reference is incomplete for the G2 behavior)
**Suggested resolution:** Either extend `m6-implementation-design.md` §1 with the self-diagnosis snippet, or inline the wrapper diff in SPEC.md §6 (not just §2 G2's prose) so an implementer has the concrete code. Also specify in G2 or §6 how `APP_BUNDLE_DIR` override works for testability — is it `APP_PATH` (the actual wrapper variable) or a new override?

---

### [M] Finding 8: AC2.2 Cursor detect condition is wrong — detectPath is a directory, not the `mcp.json` file

**Category:** FACTUAL
**Source:** T1 (own codebase) — `packages/cli/src/commands/editors.ts:292`
**Location:** §5 AC2.2 (line 128)
**Issue:** AC2.2 says "Cursor ☑ if `~/.cursor/mcp.json` dir exists". Two problems:

1. `~/.cursor/mcp.json` is the **config file**, not a directory.
2. The actual `detectPath` for Cursor (`editors.ts:292`) is `dirname(resolveCursorConfigPath({ home }))` = `~/.cursor` (the containing directory), NOT the `mcp.json` file.

`detectInstalledEditors` at `init.ts:812` runs `existsSync(probePath)` on the computed `detectPath`, so the correct condition is "the `~/.cursor` directory exists" — which typically means the user has run Cursor at least once.
**Current text:** "Cursor ☑ if `~/.cursor/mcp.json` dir exists"
**Evidence:** `editors.ts:292` — `detectPath: (_cwd, home) => dirname(resolveCursorConfigPath({ home }))`. The evidence file `evidence/editor-targets-and-scope.md` correctly says detect path is `dir of configPath` — AC2.2's prose contradicts its own cited evidence.
**Status:** CONTRADICTED
**Suggested resolution:** Change to "Cursor ☑ if `~/.cursor/` directory exists" (and similarly audit Claude Desktop's condition at the same line — "Claude Desktop ☑ if its config exists" is also imprecise; detectPath is the directory containing the config file, not the config file itself).

---

### [M] Finding 9: `mergeManagedFields` is object-spread, not field-specific — OQ-16 resolution logic is more subtle than the spec suggests

**Category:** FACTUAL
**Source:** T1 — `packages/cli/src/commands/editors.ts:234-242`, `init.ts:398-401`
**Location:** §4 `mcp-wiring.ts` scope row (line 94), AC2.11 (line 137)
**Issue:** The spec describes the OQ-16 resolution as "pass `force: true` per-editor so `mergeManagedFields` overwrites with the bundle-absolute cliPath." `mergeManagedFields` at `editors.ts:234-242` is a plain object spread `{ ...existing, ...managed }` — the `managed` object is `{ command, args }` (or `{ command, args, env }` for dev mode; or `{ type: 'stdio', command, args }` for VS Code). After merge, the resulting entry has the new `command`/`args` but RETAINS any user-added fields like `env`, `timeout`, or custom extension properties. This is probably what the spec intends, but the prose "overwrites with the bundle-absolute cliPath" undersells it — it's a merge, not an overwrite.

More importantly: for VS Code, `buildEntry` at `editors.ts:302` produces `{ type: 'stdio', ...buildManagedServerEntry(options) }`. So under the OQ-16 detection logic ("if the existing entry's `command`+`args` match the known npx shape exactly"), a VS Code entry's `type: 'stdio'` is NOT part of the shape-match but IS part of the `managed` object — which means the merge check + merge write need to cross-reference the per-editor `buildEntry` shape, not just `command`+`args`. AC2.11's test fixture description says "bun test fixture writes a known-npx-shape entry to a mocked config" — but if that fixture is for VS Code, the known-npx-shape is `{type:'stdio', command:'npx', args:[...]}`, not `{command:'npx', args:[...]}`.

The spec's OQ-16 resolution is correct in spirit, but the implementation hint and AC2.11 both assume a single canonical npx shape across all 6 editors. In practice, VS Code's shape differs (it has `type: 'stdio'` prepended).
**Current text:** "If the existing entry's `command`+`args` match the known npx shape exactly (`{command:'npx', args:['@inkeep/open-knowledge','mcp']}`)..."
**Evidence:** `editors.ts:64-77` (`buildManagedServerEntry`) + `editors.ts:302` (VS Code's `buildEntry` wrapping with `type:'stdio'`).
**Status:** INCOHERENT (under-specifies VS Code)
**Suggested resolution:** Re-frame as "existing entry's managed fields match `buildEntry(cwd, installOptions)` output for that editor" (i.e., use the existing `isCompatible` primitive at `editors.ts:249-251` but with `installOptions: {mode: 'published'}` as the probe). This leverages the existing per-editor primitive and handles VS Code correctly. Update AC2.11 to specify per-editor fixtures rather than one canonical npx-shape fixture.

---

### [M] Finding 10: Parent spec §8.11 says `runInit` is synchronous; actual `runInit` is `async`. The M6 spec inherits this claim

**Category:** FACTUAL
**Source:** T1 — `packages/cli/src/commands/init.ts:464`
**Location:** Parent spec §8.11 line 832 (indirectly inherited by M6 spec's citations of §8.11)
**Issue:** The parent Electron spec at §8.11 line 832 claims `runInit` is "**synchronous** (not `async`) and returns `InitCommandResult`". The actual signature at `init.ts:464` is `export async function runInit(options: InitCommandOptions = {}): Promise<InitCommandResult>`. It is async. The M6 spec doesn't repeat this claim directly but cites §8.11 as authoritative and reuses its prose ("calls `runInit` from Electron main"), so downstream implementers reading §8.11 for signature detail will mis-type their invocation (no `await`, destructuring directly). This is a parent-spec factual error that M6 depends on; it should be surfaced in the M6 spec's "parent-spec follow-ups" list (§10) so the parent gets corrected alongside the M6b corrigendum.
**Current text (parent line 832):** "2. `runInit` is **synchronous** (not `async`) and returns `InitCommandResult { … }`."
**Evidence:** `packages/cli/src/commands/init.ts:464` — `export async function runInit(options: InitCommandOptions = {}): Promise<InitCommandResult>`.
**Status:** CONTRADICTED (parent spec) + M6 spec inherits by reference
**Suggested resolution:** Add a parent-spec follow-up under §10 "Parent-spec follow-ups": "Parent §8.11 line 832 claims `runInit` is synchronous; it is `async`. Correct alongside the D-M6-R1 / D-M6-R2 corrigenda."

---

### [M] Finding 11: Claim about "seven collab entry points / three wiring paths" in §1 scope-clarification paragraph is load-bearing and not evidence-backed

**Category:** COMPLETENESS
**Source:** L7 (inline source attribution)
**Location:** §1 Problem statement, line 39
**Issue:** The scope-clarification paragraph claims "seven collab entry points (`ok start` · `ok mcp` as spawner · `bun run dev` via the Vite plugin · Electron spawn mode · Electron attach mode · `createTestServer` harness · Playwright per-worker fixture) composing Hocuspocus via one of three wiring paths (`bootServer()` · `createServer()` · raw `new Hocuspocus()` in the Vite plugin)". No citation, no reference. A reader cannot verify the taxonomy without grepping `createServer` / `bootServer` / `new Hocuspocus` across the repo. The enumeration frames what's NOT in scope; if one entry point is missing from the list, a reviewer could reasonably expect the spec to address consolidation of that path.
**Current text:** "seven collab entry points (…) composing Hocuspocus via one of three wiring paths (…) all remain as-is."
**Evidence:** No citation in the spec or its evidence directory.
**Status:** UNVERIFIABLE (from the spec alone; claim is concrete but unsupported)
**Suggested resolution:** Either add a citation to an existing evidence file (if one was produced during the worldmodel pass) or an inline footnote listing the files where each entry-point lives. If the enumeration was agent-produced without verification, downgrade the claim to "the existing runtime-server surfaces remain as-is — no entry-point consolidation is in scope."

---

## Low Severity

### [L] Finding 12: `dirname(dirname(app.getPath('exe')))` comment says `.app/Contents/` with trailing slash

**Category:** FACTUAL
**Source:** L7 + T1
**Location:** §6.3 code snippet (lines 208-214)
**Issue:** The code snippet comment says `// .app/Contents/` (with trailing slash), implying the result has a trailing slash. `node:path` `dirname()` does NOT return a trailing slash. For `/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge`:
- `dirname(exe)` = `/Applications/Open Knowledge.app/Contents/MacOS`
- `dirname(dirname(exe))` = `/Applications/Open Knowledge.app/Contents` (no trailing slash).

The `join(...)` then produces the correct final path regardless of trailing slash, so the derivation is correct in outcome — only the inline comment is misleading.
**Current text:** "`dirname(dirname(app.getPath('exe'))),  // .app/Contents/`"
**Evidence:** Node.js `path.dirname` docs; manual trace.
**Status:** Low — cosmetic
**Suggested resolution:** Drop the trailing slash in the comment.

---

### [L] Finding 13: Decision count discrepancy — "Seven direction + design decisions" introduction doesn't align with the "two on 2026-04-21 from the initial coexistence review, five during the /spec pass" breakdown

**Category:** STRUCTURAL
**Source:** Phase 2 reader pass
**Location:** §10 Decision log preamble (line 344)
**Issue:** The preamble at line 344 says "Seven direction + design decisions made during this spec pass (two on 2026-04-21 from the initial coexistence review, five during the /spec pass)". All seven D-M6-R* decisions are stamped 2026-04-21. The 2+5 breakdown is a narrative separation (what was decided before this /spec session vs during it) — not a date-based distinction — and will age poorly. A future reader who has no memory of "initial coexistence review" vs "/spec pass" will be confused.
**Current text:** "Seven direction + design decisions made during this spec pass (two on 2026-04-21 from the initial coexistence review, five during the /spec pass)"
**Evidence:** Line 344 + all D-M6-R* decisions dated 2026-04-21 (lines 346-352).
**Status:** Low — narrative artifact
**Suggested resolution:** Drop the parenthetical breakdown or replace with "D-M6-R1, R2 pre-dated this session's investigation; R3–R7 landed during iteration."

---

### [L] Finding 14: §6.1 "piggybacks on Navigator — the default post-`whenReady` surface per D24" — D24 is a parent-spec reference that isn't explained

**Category:** COMPLETENESS
**Source:** L7
**Location:** §6.1 line 157
**Issue:** "default post-`whenReady` surface per D24" cites parent spec D24 but doesn't explain what D24 says. A reader opening M6 cold must open the parent spec to find D24 (revised 2026-04-20 — Navigator as persistent launcher, new-window-default). Minor in the context of "parent spec is authoritative" framing, but the specific D-number reference without a one-line gloss is a friction point.
**Current text:** "piggybacks on the Navigator window (the default post-`whenReady` surface per D24)"
**Evidence:** Parent §8.6 (Project Navigator section).
**Status:** Low — depth-of-reference
**Suggested resolution:** One-line gloss: "the persistent launcher window opened on `app.whenReady()` per parent D24 (revised 2026-04-20)."

---

### [L] Finding 15: §2 cross-reference to §8.11's per-editor defaults is ambiguous

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** §2 G7 (line 54) vs OQ-14 (line 297)
**Issue:** G7 says "with checkboxes defaulted per §8.11's per-editor defaults." OQ-14 at line 297 explicitly notes that §8.11's defaults are "not evidence-based" and "Recommendation (defaulting unless reviewer overrides): adopt (b) — preselect every detected editor." So G7 says "follow §8.11's defaults" while OQ-14 says "don't follow §8.11's defaults." AC2.2 at line 128 is ambiguous — lists the §8.11 defaults (Claude Code ☑, Claude Desktop ☑, Cursor ☑, VS Code ☐, Codex ☐, Windsurf ☐) AND says "see OQ-14" (which recommends opposite: every detected editor preselected). Implementation could go either way depending on which reference the implementer follows.
**Current text (G7):** "with checkboxes defaulted per §8.11's per-editor defaults"
**Current text (OQ-14 recommendation):** "adopt (b) — preselect every detected editor"
**Current text (AC2.2):** lists §8.11's three-checked / three-unchecked pattern but references OQ-14
**Evidence:** Direct comparison of G7, AC2.2, OQ-14.
**Status:** INCOHERENT (mildly — OQ-14 is marked "defaulting unless reviewer overrides" so the ambiguity is intentional-ish)
**Suggested resolution:** Update G7 to match OQ-14's recommendation: "with every detected editor preselected (per OQ-14's recommendation; §8.11's three-checked / three-unchecked pattern is the fallback if a UX review overrides)." And reconcile AC2.2 — either assert all detected editors are preselected or assert §8.11's pattern, not both.

---

### [L] Finding 16: AC1.7 shell fixture uses double-backslash escape that may not work as the AC implies

**Category:** FACTUAL
**Source:** L7
**Location:** §5 AC1.7 (line 117)
**Issue:** AC1.7 says `echo '#!/bin/bash\necho foreign' > /usr/local/bin/ok && chmod +x /usr/local/bin/ok`. In bash, single-quoted strings do NOT interpret `\n` — the resulting file literally contains `#!/bin/bash\necho foreign` on one line, with no newline before `echo foreign`. This would not produce an executable shell script — `#!/bin/bash\necho foreign` is interpreted as the shebang line with `\necho` as the interpreter path (file not found). To test "simulates npm-installed shim", the AC should use `echo -e '#!/bin/bash\necho foreign'` with `-e` (which is not portable across all `echo` implementations) or switch to `printf '#!/bin/bash\necho foreign\n'` or a heredoc.
**Current text:** "pre-create `/usr/local/bin/ok` as `echo '#!/bin/bash\necho foreign' > /usr/local/bin/ok && chmod +x /usr/local/bin/ok`"
**Evidence:** Bash single-quote semantics.
**Status:** CONTRADICTED (not what the AC says it does)
**Suggested resolution:** Replace with `printf '%s\n%s\n' '#!/bin/bash' 'echo foreign' > /usr/local/bin/ok && chmod +x /usr/local/bin/ok` or a heredoc form. The AC result (collision-prompt dialog) is independent of the fake script actually working — the collision guard only checks "is this file NOT our symlink" — but the AC as written is technically broken.

---

### [L] Finding 17: "revises parent §8.11's project-scoped framing" — parent §8.11 also says "The MCP stdio server runs with `cwd=<current-dir>` per editor-invocation, so a single `open-knowledge` entry serves any project the user opens. No per-project MCP entries required." M6's revision should acknowledge this already-user-scoped claim

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §2 G7 (line 54), §10 D-M6-R1 (line 346)
**Issue:** D-M6-R1 says parent §8.11 was "project-scoped" and needs a corrigendum. But parent §8.11 at line 837 says: "The MCP stdio server runs with `cwd=<current-dir>` per editor-invocation, so a single `open-knowledge` entry serves any project the user opens. No per-project MCP entries required." — i.e., the parent was already explicitly user-scoped in terms of written MCP entries; the project-scoped framing is only in the `runInit({ cwd: projectPath, ... })` call shape (line 831) and the "first launch of a new project" trigger (line 830). The D-M6-R1 corrigendum rationale ("MCP configs are user-scoped everywhere in the ecosystem; project-scoped consent would re-prompt per project for no gain") is correct, but the parent-spec characterization as fully project-scoped is slightly reductive — the parent already acknowledges user-scoped MCP entries; it only got the trigger wrong.
**Current text (D-M6-R1):** "MCP configs are user-scoped in every target AI tool's convention (…) — project-scoped consent would re-prompt for no gain."
**Evidence:** Parent `SPEC.md:837` — "a single `open-knowledge` entry serves any project the user opens. No per-project MCP entries required."
**Status:** Minor imprecision in the revision rationale
**Suggested resolution:** Reframe D-M6-R1 rationale: "Parent §8.11 already intended user-scoped MCP *entries* but wired the trigger as per-project. D-M6-R1 aligns the trigger with the storage scope."

---

## Confirmed Claims (summary)

- **§6.3 `cliPath` derivation** — `join(dirname(dirname(app.getPath('exe'))), 'Resources', 'cli', 'bin', 'ok.sh')` produces the correct path for `/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge` → `/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh`. The `.app/Contents/MacOS/<productName>` shape is confirmed by `electron-builder.yml:2` (`productName: Open Knowledge`).
- **Existing `extraResources`** in `packages/desktop/electron-builder.yml:26-29` matches the spec's description: today ships only `../cli/dist/public`. M6 scope table correctly describes the amendment.
- **`detectInstalledEditors(cwd, home?)` cwd-independence** — confirmed by `init.ts:802` + `editors.ts:258-330`. All 6 editors use `_cwd` and resolve from `home`. `detectPath` is `dir of configPath` for all 6. Evidence file is correct on this specific claim.
- **All 6 editor targets are `scope: 'global'`** — confirmed by `editors.ts:267`, `280`, `291`, `303`, `315`, `326`.
- **`buildManagedServerEntry`'s existing shape** — `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}` confirmed by `editors.ts:24-25` and `:73-76`.
- **`mergeManagedFields`'s object-spread semantics** — confirmed by `editors.ts:234-242`.
- **PR #245, #266, #267 merged status** — verified via `gh pr view`.
- **Parent spec §14 M6 DOD structure** — parent line 1254-1266 lists the 6-bullet DOD. M6 spec's two-phase split is a refinement, not a contradiction.
- **Translocation guard patterns** (`/AppTranslocation/`, `/private/var/folders/`) — confirmed in design spike `m6-implementation-design.md:203-208`.
- **Research report references** — `[reports/electron-bundled-cli-install-patterns/]` paths all resolve.

## Unverifiable Claims

- **"Eliminates the Apple Silicon PATH-precedence hazard"** (§6.3) — the claim that bundle-absolute `cliPath` bypasses `$PATH` resolution is correct in principle (`child_process.spawn(absolute_path, args)` doesn't traverse PATH), but actual behavior of all 6 MCP clients (Claude Code, Claude Desktop, Cursor, VS Code, Codex, Windsurf) reading the config and invoking spawn isn't verifiable without source access to each. OQ-15 already acknowledges this.
- **"Ecosystem norm is `child_process.spawn(command, args)` which does not shell-interpolate"** (OQ-15) — plausible but unverified across all 6 clients. The OQ explicitly flags this.
- **Space-in-path quoting across AI tools** — AC2.6 is the verification point; cannot be verified in this audit (creds-gated).
- **VS Code's `detectPath` behavior on macOS** — `resolveVsCodeConfigPath` resolves to `<Application Support>/Code/User/mcp.json` (macOS default). Whether this directory exists on a typical user machine depends on whether the user has opened VS Code once — inherited detection semantics but behavior-in-the-wild unverified.
- **Squirrel.Mac atomic-swap behavior preserving cliPath** (OQ-18) — explicitly flagged as "Verify during M3 QA once M3 exits scaffolding."
- **TCC/entitlements behavior writing to `~/Library/Application Support/Claude/`** (OQ-20) — flagged as "Verify empirically on signed+notarized build during AC2.6 smoke."
