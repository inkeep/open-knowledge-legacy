# Audit Findings

**Artifact:** `specs/2026-04-24-skill-dual-track-install/SPEC.md`
**Audit date:** 2026-04-24
**Total findings:** 16 (5 high, 5 medium, 3 low, 3 editorial)

---

## High Severity

### [H] Finding 1: Claude Desktop detection path claims in prose contradict the detection actually used

**Category:** COHERENCE + FACTUAL
**Source:** L1 (cross-finding contradictions) + T1 (own codebase)
**Location:** §5 (P3 journey, step 3); §6 FR5; §7 Metric 2; §10 D10; §15 Phase 1 exit criteria; §14 T2
**Issue:** The spec's evidence file and D12 correctly nail that detection reuses `EDITOR_TARGETS['claude-desktop'].detectPath`, which on macOS returns `~/Library/Application Support/Claude/` (the *config directory's parent*, via `dirname(resolveClaudeDesktopConfigPath(...))` — see `packages/cli/src/commands/editors.ts:302`). But the prose repeatedly asserts detection checks `/Applications/Claude.app` (macOS) / `%LOCALAPPDATA%\AnthropicClaude\Claude.exe` (Windows). These are *different paths entirely* — the user could have the config dir without the .app bundle (rare) and vice versa (possible if Claude Desktop was installed, run once, then the .app deleted while the config persists). The Windows path in D10 is also wrong — `resolveClaudeDesktopConfigPath` returns `%APPDATA%\Claude\claude_desktop_config.json` (Roaming), not `%LOCALAPPDATA%\AnthropicClaude\Claude.exe`.
**Current text:** "Init detects `/Applications/Claude.app` (macOS) or Windows/Linux equivalent exists." (§5 step 3); "When `/Applications/Claude.app` exists (macOS) or Windows/Linux equivalent" (FR5); "macOS `/Applications/Claude.app`; Windows `%LOCALAPPDATA%\AnthropicClaude\Claude.exe`" (D10).
**Evidence:** `packages/cli/src/commands/editors.ts:302` — `detectPath: (_cwd, home) => dirname(resolveClaudeDesktopConfigPath({ home }))`. `resolveClaudeDesktopConfigPath` at `editors.ts:141-162` returns `~/Library/Application Support/Claude/claude_desktop_config.json` on darwin and `%APPDATA%\Claude\claude_desktop_config.json` on win32. Evidence file `evidence/claude-desktop-detection-existing.md` correctly states this.
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) rewrite all prose to match the config-dir check (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows) OR (b) explicitly change the detection signal to .app/.exe existence and justify the deviation from `detectPath` in D12. Current state is self-contradicting — prose and evidence disagree on what "detection" means.

---

### [H] Finding 2: Phase 2 FR9 assumes a `window.okDesktop.platform` detection surface that doesn't exist

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 FR9
**Issue:** FR9 specifies: "When `window.okDesktop.platform` runtime-detects Claude Desktop via existing `EDITOR_TARGETS['claude-desktop'].detectPath`, the CTA renders." Two problems: (1) `window.okDesktop.platform` is just a string `'darwin' | 'win32' | 'linux'` (see `packages/desktop/src/shared/bridge-contract.ts:239`) — it's an OS tag, not a Claude-Desktop detection API. (2) `EDITOR_TARGETS['claude-desktop'].detectPath` lives in `packages/cli/src/commands/editors.ts` — the app package can't import CLI code. A new IPC channel or a shared helper in `@inkeep/open-knowledge-server` would need to be added. The FR conflates unrelated surfaces.
**Current text:** "When `window.okDesktop.platform` runtime-detects Claude Desktop via existing `EDITOR_TARGETS['claude-desktop'].detectPath`, the CTA renders."
**Evidence:** `packages/desktop/src/shared/bridge-contract.ts:239` — `readonly platform: 'darwin' | 'win32' | 'linux';`. `EDITOR_TARGETS` is exported from `packages/cli/src/commands/editors.ts` (not accessible from `packages/app`). No detect-claude-desktop IPC handler exists today.
**Status:** INCOHERENT
**Suggested resolution:** Specify the new IPC shape needed (e.g. `window.okDesktop.detectClaudeDesktop(): Promise<boolean>`), decide where the detection helper physically lives (probably `@inkeep/open-knowledge-server`, imported by both CLI and Electron main), and which of those three surfaces own the check. Update FR9 acceptance criteria accordingly. This gap shows up again in §16 Phase 2 SCOPE which doesn't list the new IPC channel or the shared helper location.

---

### [H] Finding 3: FW1 and FW4 contradict Phase 2 and Phase 3

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §13 Future Work vs §15 Rollout
**Issue:** §13 lists FW1 as "[Explored] FW1: Electron 'Install in Claude Desktop' button — ... Not in the wedge; pick up in a follow-on ship." But §15 Phase 2 is building exactly this, as an in-scope phase of the current spec (not a follow-on). §13 also lists FW4: "[Noted] FW4: Team+ plugin marketplace track — ... Deferred per research report Dim 5 given #39400 / #38429." But §15 Phase 3 is building exactly this, in this spec. The Future Work section reflects an earlier wedge-only scope and was not updated after D1/D15 expanded scope to all three phases.
**Current text:** §13 FW1: "Not in the wedge; pick up in a follow-on ship." §13 FW4: "Deferred per research report Dim 5 given #39400 / #38429."
**Evidence:** §15.2 Phase 2 explicitly scopes the Electron button; §15.3 Phase 3 explicitly scopes `.claude-plugin/marketplace.json`. §10 D1 DIRECTED 2026-04-24: "Full scope C" including both.
**Status:** INCOHERENT
**Suggested resolution:** Delete FW1 and FW4 outright (they are now in-scope, not future) OR rewrite them as pointers to the Phase 2 / Phase 3 sections. A reader following the Future Work table would reasonably conclude the Electron button and plugin marketplace are NOT being built — directly opposite to §15.

---

### [H] Finding 4: §5 P3 journey step 4 prescribes one URL; FR5 acceptance criteria demand two URLs

**Category:** COHERENCE
**Source:** L1
**Location:** §5 P3 journey (step 4) vs §6 FR5
**Issue:** §5 step 4 shows the `ok init` hint as a single line: `Claude Desktop detected. To use Open Knowledge in Cowork, see https://inkeep.github.io/open-knowledge/guides/install-claude-cowork.` One URL (docs). FR5 acceptance criteria demand: "exactly one line pointing at the docs URL AND the pinned-version release URL." Both URLs. D7 LOCKS "pinned `v${version}` release URL in `ok init` hint" — implying at least the release URL is in-scope. Implementer cannot satisfy both statements as written.
**Current text:** §5 step 4: `... see https://inkeep.github.io/open-knowledge/guides/install-claude-cowork`. FR5: "exactly one line pointing at the docs URL and the pinned-version release URL."
**Evidence:** SPEC.md §5 line 63; §6 FR5 row; §10 D7 row.
**Status:** INCOHERENT
**Suggested resolution:** Pick one shape and reconcile across all three sites. A single-line hint can contain both URLs (e.g., "Claude Desktop detected. See <docs> (guide) or <release-url> (direct ZIP)"), or a single URL pointing at docs (which in turn link to the pinned release). Update §5, FR5, and D7 together.

---

### [H] Finding 5: Phase 3 P0 open questions are marked "DEFERRED to Phase 3 kickoff" while the spec enters finalization

**Category:** COHERENCE (process)
**Source:** L6 (stance consistency) + spec-protocol rule
**Location:** §11 OQ12, OQ13, OQ14
**Issue:** Per the spec protocol (Step 8 resolution completeness gate), every P0 item for an in-scope phase must have its decisions resolved — not deferred — before the spec is finalization-ready. OQ12 (symlink resolution via GitHub/Claude plugin pull) is tagged `P0 (Phase 3 only)` with status "DEFERRED to Phase 3 kickoff — live-test against a Team+ workspace." OQ13 and OQ14 are similarly `P0 (Phase 2 only)` + DEFERRED. If Phase 2 and Phase 3 are in-scope (per D1/D15), their P0s must either (a) be resolved here, or (b) the spec should be factored into three sequential specs (Phase 1 now; Phase 2 + Phase 3 in follow-on specs). The current state mixes "deferred to kickoff" with "in scope of this spec" — a half-way house that skips the quality gate.
**Current text:** OQ12: "DEFERRED to Phase 3 kickoff — live-test against a Team+ workspace" — P0. OQ13, OQ14 similar.
**Evidence:** spec skill §8 resolution completeness gate requires P0 In Scope items resolved pre-finalize.
**Status:** INCOHERENT (process drift)
**Suggested resolution:** Either (a) move OQ12/13/14's parent phases to Future Work with `[Identified]` tier ("needs its own spec pass before implementation"), keeping only Phase 1 as in-scope for this spec; or (b) resolve the three OQs now (live-test symlink, pick stock vs re-shot screenshots, pick poll vs trust-user) and promote to RESOLVED. The `meta/_changelog.md` entry "Phase 2/3 audit can happen at phase kickoff" is a symptom of this drift — it's inventing a new process tier.

---

## Medium Severity

### [M] Finding 6: SKILL.md size claim is factually wrong

**Category:** FACTUAL
**Source:** T1
**Location:** §1 Situation; §8 Current state
**Issue:** Spec says "single-file SKILL.md at `packages/server/assets/skills/open-knowledge/`, 20 KB, ~~20937 bytes~~". Actual size is 21882 bytes (strikethrough value 20937 is stale; current-state unstruck value is stated as "20937 bytes" in two places). Not load-bearing for any decision but factual drift.
**Current text:** §1: "(single-file `SKILL.md` at `packages/server/assets/skills/open-knowledge/`, 20 KB, ~~20937 bytes)". §8: "Single-file `SKILL.md` only (20 KB, 20937 bytes)."
**Evidence:** `wc -c packages/server/assets/skills/open-knowledge/SKILL.md` → 21882. Changelog entry "Single 20KB file" dates to 2026-04-24 morning; file has been edited since.
**Status:** STALE
**Suggested resolution:** Update to `~22 KB (21,882 bytes as of baseline commit 46751128)`, or drop the byte count — it rots after every SKILL.md edit and is not load-bearing.

---

### [M] Finding 7: D5 picks server/package.json as source of truth, but the release tag derives from the published (cli) package — drift risk not acknowledged

**Category:** FACTUAL + COHERENCE
**Source:** L4 (evidence-synthesis fidelity) + T1
**Location:** §10 D5; §6 FR3
**Issue:** D5 says the `metadata.version` source of truth is `packages/server/package.json`. FR3 says the injected version must match "the git tag version of the release." These two references are NOT mechanically linked today: `@inkeep/open-knowledge-server` is `"private": true` (does not publish to npm); the release tag is `v${changesets.outputs.publishedPackages[0].version}`, which reflects whichever public package publishes first — currently `@inkeep/open-knowledge` (CLI package). They currently match (both 0.2.0) because changesets bumps them together via workspace protocol, but nothing enforces this. If the CLI ever publishes without the server bumping (e.g., a CLI-only patch), the injected `metadata.version` would mismatch the git tag. R2 only mentions in-body-prose vs frontmatter drift — not server-vs-cli version drift.
**Current text:** D5: "`metadata.version` source of truth: `packages/server/package.json`"; FR3 acceptance: "where `X.Y.Z` is the git tag version of the release."
**Evidence:** `packages/server/package.json` has `"private": true` (line 4) and `"version": "0.2.0"`; `packages/cli/package.json` has `"private": false` and `"version": "0.2.0"`; `.github/workflows/release.yml:219` `VERSION=$(echo '${{ steps.changesets.outputs.publishedPackages }}' | jq -r '.[0].version')` — reads PUBLISHED (cli) version.
**Status:** CONTRADICTED (subtle)
**Suggested resolution:** Either (a) change D5's source of truth to `packages/cli/package.json` (aligns with git tag), or (b) add a CI assertion in the ZIP-build step that asserts `server.version === cli.version` and fails the release otherwise. Pick one and codify. Also add the drift mode to R2 / §12 risks.

---

### [M] Finding 8: FR7 states a direct-download URL that the actual docs page does not use

**Category:** FACTUAL
**Source:** L1 + T1
**Location:** §6 FR7; §1 problem statement
**Issue:** FR7 notes "Docs page URL: `https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill.zip`" — but the actual docs page `docs/content/guides/install-claude-cowork.mdx` line 22 uses `href="https://github.com/inkeep/open-knowledge/releases/latest"` (the release overview page, not a direct-download URL). The FR asserts the URL is "Locked by existing docs page" — but the existing docs page does not use that URL. FR1 acceptance criteria also cites `https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill.zip` as a valid curl target — which will work after Phase 1 (standard GitHub release asset direct-download redirect), but it does not match the docs' href.
**Current text:** FR7: "Docs page URL: `https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill.zip`. ... Locked by existing docs page"
**Evidence:** `docs/content/guides/install-claude-cowork.mdx:22` → `href="https://github.com/inkeep/open-knowledge/releases/latest"`.
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) update the docs page to use the direct-download URL and confirm Phase 1 ships a ZIP at that path, or (b) update FR7 to reflect that the docs link to the release overview page and the filename `openknowledge.skill.zip` is what users see in the asset list. (a) is the better UX — one-click download.

---

### [M] Finding 9: `evidence/skill-md-frontmatter-current-state.md` quotes a stale SKILL.md description

**Category:** FACTUAL
**Source:** L4 (evidence fidelity) + T1
**Location:** `evidence/skill-md-frontmatter-current-state.md:18`
**Issue:** The evidence file quotes the SKILL.md description as containing `Carries the preview-before-edit sequence (get_preview_url then open browser then write)`. The current SKILL.md description says `Carries the preview-attach rule (if a write response includes \`action: attach-preview-once\`, open the URL; otherwise do nothing)`. The SKILL.md was rewritten after the evidence was captured. The evidence also estimates description length as "~1000+ chars, near spec's 1024 limit"; actual is ~930 chars. Not a show-stopper (no decision depends on the exact wording), but the evidence file is no longer faithful to current state.
**Current text:** evidence file line 18 verbatim quote of older SKILL.md.
**Evidence:** `head -5 packages/server/assets/skills/open-knowledge/SKILL.md` — current description starts `"MUST invoke before ANY tool call ... Carries the preview-attach rule (if a write response includes \`action: attach-preview-once\`, open the URL; otherwise do nothing) ..."`.
**Status:** STALE
**Suggested resolution:** Re-capture the description verbatim, or replace the full quote with a pointer: "see current SKILL.md in the repo" plus the frontmatter-structure summary (2 fields, no `metadata`). Adjust the char-count note to `~930 chars`.

---

### [M] Finding 10: Spec departs from Dim 8 "Recommended packaging" without explaining the downgrade

**Category:** COHERENCE (evidence-synthesis fidelity) + L6
**Source:** L4 + report link
**Location:** §6 FR2; §10 D4
**Issue:** Dim 8 of `reports/agent-skills-zip-distribution-ux/REPORT.md:373-389` explicitly recommends a ZIP containing `SKILL.md` + `scripts/` + `references/` + `LICENSE.txt` with frontmatter `name, description, license, metadata.version, metadata.author, metadata.repository, compatibility`. The spec adopts only `name, description, metadata.version, metadata.author, metadata.repository` — skipping `license`, `compatibility`, and the `scripts/` + `references/` + `LICENSE.txt` files. D4 says: "ZIP structure: ... (single file in wrapper folder). Matches existing bundled asset shape. No LICENSE.txt needed (SKILL.md in-body has license reference)." The spec's §1 says "this spec directly implements Dim 8 recommendations" — but it does not implement three of Dim 8's seven frontmatter fields and drops the extra-directory structure. The downgrade may be fine (minimalism, cowork's 30 MB cap has plenty of headroom) but needs justification.
**Current text:** §1 "this spec directly implements Dim 8 recommendations." §10 D4: "single file in wrapper folder ... No LICENSE.txt needed."
**Evidence:** Research report §Dim 8 lines 373-389 lists the fuller shape. Spec adopts a narrower subset.
**Status:** INCOHERENT with report (or under-justified)
**Suggested resolution:** Either (a) add the missing fields/files to D4 so implementation matches Dim 8 literally (cheap: `license: "MIT. See LICENSE.txt"`, `compatibility: "Claude Desktop, Claude Cowork, Claude.ai web. Requires code execution."`, and a `LICENSE.txt` copy of the repo's LICENSE); or (b) add an explicit rationale line to D4 explaining the intentional divergence from Dim 8 ("minimalism; revisit if Claude Desktop surfaces publisher-info fields"). The current presentation asserts Dim 8 is implemented when it is partially dropped.

---

## Low Severity

### [L] Finding 11: `prior spec` link `specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md` is under-substantiated (needs verification)

**Category:** FACTUAL
**Source:** T1
**Location:** §0 header "Links"
**Issue:** Header references `installUserSkill()` as "introduced" by `specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md`. `installUserSkill()` does exist in `packages/server/src/skill-install.ts`. The cross-reference appears accurate but was not re-verified against the prior spec's status (resolved/in-flight) during this audit. No decision in this spec hangs on it.
**Status:** UNVERIFIABLE (low priority)
**Suggested resolution:** If the prior spec is still in a non-finalized state and `installUserSkill()`'s contract may still change, note the dependency explicitly; otherwise keep as-is.

---

### [L] Finding 12: §1 problem statement claims ~45 agent IDs without a source link

**Category:** L7 (inline source attribution)
**Source:** L7
**Location:** §1 Situation
**Issue:** "...covers ~45 agent IDs in the `vercel-labs/skills` registry..." A reader can't assess credibility without opening `reports/mcp-server-auto-install-harnesses/REPORT.md` Dim 12 or the registry itself. The number is load-bearing to the "don't change Claude Code flow" argument but has no inline citation.
**Suggested resolution:** Add a bracketed source: "covers ~45 agent IDs in the `vercel-labs/skills` registry (see [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12)."

---

### [L] Finding 13: Spec prose calls `metadata.version` check "`unzip -l` + grep-matches post-zip" with no path/pattern detail

**Category:** L2 (confidence-prose alignment) / completeness
**Source:** L2
**Location:** §6 FR3 acceptance criteria
**Issue:** "Verified by a CI step that grep-matches post-zip." An implementer needs to know which file inside the ZIP is greped for what pattern. The detail is implicit (SKILL.md, `metadata.version:`) but stating it would remove ambiguity and be another paragraph safer for a cold reader.
**Suggested resolution:** Add: "(`unzip -p openknowledge.skill.zip open-knowledge/SKILL.md | grep '^  version: ' ` matches the release tag)." Pick the exact pattern the build script emits.

---

## Editorial

### [E] Finding 14: "LOCKED" + "DIRECTED" resolution-status mix without prior introduction

**Location:** §10 Decision Log column "Status"
**Issue:** The spec uses LOCKED / DIRECTED / PROPOSED / INVESTIGATING labels per `references/decision-protocol.md` but never introduces the taxonomy in §10 or §0 preamble. A cold reader has to guess the difference. (Structured-thinking skill defines these, but the reader of this spec doesn't have that loaded.)
**Suggested resolution:** One-line glossary at §10 header: "Status: LOCKED (1-way; don't revisit), DIRECTED (chosen with latitude to implementer), PROPOSED (draft), INVESTIGATING (active investigation)."

---

### [E] Finding 15: Ordering drift — D8 appears AFTER D17 in §10 Decision Log

**Location:** §10
**Issue:** Decisions read D1-D7, D10-D17, D8 (the investigating one). ID ordering breaks at the bottom. Minor but a reader scanning down stops at D17 and may miss D8 (still INVESTIGATING). D8 also contradicts D5's "LOCKED/DIRECTED" feel — it's still open.
**Suggested resolution:** Move D8 into sequence (after D7, before D10). Either resolve D8 or explicitly note "D8 gates FR3 implementation" so it doesn't get lost.

---

### [E] Finding 16: Dim 12 link doesn't show in `reports/mcp-server-auto-install-harnesses/REPORT` — it's under that report's refresh section (fine, but readers need to know)

**Location:** §1 Complication
**Issue:** "Confirmed by [[reports/mcp-server-auto-install-harnesses/REPORT]] Dim 12." Dim 12 is the newest section (added 2026-04-24 Path C pass). A reader hitting the report cold needs to search for it — the executive summary doesn't call out Dim 12. Minor inline-attribution hygiene.
**Suggested resolution:** Link to the anchor directly if Fumadocs supports anchors in wiki-links (`[[reports/mcp-server-auto-install-harnesses/REPORT#dim-12...]]`), or add a line number.

---

## Confirmed Claims (summary)

**Codebase claims that checked out (T1):**
- `.github/workflows/release.yml` has `permissions: { contents: write, id-token: write, pull-requests: write }` (line 116-119, confirmed) and calls `gh release create` with no asset args at line 229 (confirmed lines 215-234).
- `packages/server/src/skill-install.ts` exists with `installUserSkill()` function; shells out to `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy` (line 253, confirmed).
- Sidecar at `~/.open-knowledge/skill-installed-version` tracks installed version (confirmed `SIDECAR_FILENAME` constant line 52, `sidecarPath` line 110).
- 60s subprocess timeout constant `DEFAULT_TIMEOUT_MS = 60_000` (line 77, confirmed).
- `packages/cli/src/commands/init.ts:603-604` calls `installUserSkill({ home: options.home })` (confirmed exactly).
- Bundled skill asset: confirmed single `SKILL.md` in `packages/server/assets/skills/open-knowledge/` (no subdirs) — matches spec §8 except for the byte count (Finding 6).
- `EDITOR_TARGETS['claude-desktop']` exists at `packages/cli/src/commands/editors.ts:293-303` with `detectPath` wired to the config dir (evidence-file claim correct; spec prose wrong — Finding 1).
- `SeedDialog` precedent exists at `packages/app/src/components/SeedDialog.tsx` (confirmed, basis for D16).
- "Initialize LLM brain" CTA exists at `packages/app/src/components/EditorArea.tsx:400` (D16 positional reference correct).
- `createHandler` / `createInvoker` exist at `packages/desktop/src/shared/ipc-handler.ts` and `ipc-invoke.ts` (confirmed; FR12 reference accurate; spec says "shared/bridge-contract.ts" for typing — correct).
- `packages/desktop/src/main/ipc/` directory exists with `seed.ts` as precedent for the new `install-skill.ts` (confirmed).
- Baseline commit `46751128` resolves to "MCP guidance migration ... (#297)" — valid.

**External/OSS claims (T2-T5):**
- `skills@~1.5.0` has no `validate` subcommand — evidence file captured verbatim output; re-verification not performed in this audit (trust boundary). Finding stands as-captured.
- `.claude-plugin/marketplace.json` schema and `plugin.json` schema per `anthropics/knowledge-work-plugins` — captured via WebFetch on 2026-04-24; not re-fetched in this audit. Trust the evidence file.
- Upstream bugs #26254, #31542, #39400, #38429, #26952, #10366 — cited consistently in spec and docs; not re-verified against GitHub state (boundary).

---

## Unverifiable Claims

- **Claude Desktop's Skills-upload UI accepts a ZIP with the `openknowledge.skill.zip` name at exactly the path spec says (`Customize → Skills → + → Upload a skill`).** Manual verification required (T4 in spec's own test plan). Can't confirm without a real session.
- **`openknowledge.skill.zip` at `releases/latest/download/...` will resolve correctly after Phase 1.** Standard GitHub release-asset behavior, but no spec-internal test asserts the HTTP 200. The FR1 acceptance criteria names the URL but the implementation of that URL requires the release to ship first.
- **Whether Claude Desktop resolves symlinks when pulling a plugin from GitHub (OQ12).** Called out as deferred to Phase 3 kickoff. See Finding 5.
- **Whether the `~2-3 weeks` estimate for Phases 2+3 over the wedge (D1 rationale) is realistic.** Scope estimate; no evidence trail.
