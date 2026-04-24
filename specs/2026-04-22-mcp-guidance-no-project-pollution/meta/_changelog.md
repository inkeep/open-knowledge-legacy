# Changelog — MCP Guidance Delivery Without Project-Dir Pollution

## 2026-04-22 — Session 1 (scaffold)

- **Intake complete.** SCR drafted + stress-tested (5 probes). Problem confirmed real; future-fit strong; layered hybrid is the correct wedge.
- **Decisions confirmed by user:**
  - Scope wedge: **A (full hybrid)** — instructions + tool descriptions + skill, all in this spec.
  - Legacy injection handling: **A only** — leave users' existing injected sections untouched; no migration subcommand (stricter than agent's initial A+B recommendation).
  - Spec directory: `specs/2026-04-22-mcp-guidance-no-project-pollution/`; baseline `5fdd5557`.
- **Scaffolded artifacts:** SPEC.md (draft) + `evidence/` dir + this changelog.
- **Open Questions registered:** Q1-Q9 (see SPEC.md §11). All P0 except Q3 (deferred to Future Work).
- **Assumptions registered:** A1-A8 (see SPEC.md §12).
- **Next:** build world model via `/worldmodel --depth light`, extract evidence, enter Iterate phase.

## 2026-04-22 — Session 1 (scaffold → world model → first iterate)

- **World model built** via local code trace (skipped `/worldmodel` dispatch; scope is narrow CLI refactor on code already surveyed during research).
- **Critical finding:** `buildInstructions` emits **24,019 bytes**, 12× Claude Code's 2 KB cap. Prose is 11 KB; per-tool descriptions are an inlined 13 KB block that fully duplicates what `tools/list` delivers natively. Removing the inlined block is pure dedup with zero information loss. Current SPEC.md §8 + FR3 updated to reflect measured size.
- **Evidence:** [evidence/current-state-audit.md](../evidence/current-state-audit.md) — complete audit of surfaces + findings + test-impact map.
- **Open questions refined:** Q7 (tool desc audit) gains specific targets — `write_document`, `edit_document`, `exec`, `search`, `get_preview_url`, `read_document` as highest-leverage. Q8 (internal AGENTS.md refs) gains 4 specific call sites to fix.
- **Ready for first decision batch** — see §4 of the next message.

## 2026-04-22 — Session 1 (decision batch 1 + npx skills pivot)

- **User resolved 9 open questions** in the first batch (Q1=B, Q2=draft approved, Q9=B, Q4=A, Q6=A, Q7=A, Q8=A, Q9=A+C housekeeping). Q5 asked as "can we just use npx skills from Vercel?" — investigated as a new alternative.
- **New evidence:** [evidence/npx-skills-investigation.md](../evidence/npx-skills-investigation.md) — `skills@1.5.1` is stable, MIT, 1-dep, active (published 5 days ago), supports local-path source + `--agent '*'` non-interactive install to 27 hosts including all 6 OK-supported.
- **User confirmed** `npx skills` as the install mechanism → major spec reshape:
  - **D4 rewritten:** install via `npx skills add --agent '*' -g -y --copy`; per-host copies.
  - **D5 rewritten:** idempotency via SHA-256 sidecar at `~/.open-knowledge/skill-installed-hash`, replacing version-field approach.
  - **D7 DROPPED:** symlink fallback moot — `npx skills --copy` handles Windows uniformly.
  - **D10 added:** `--force` flag for user-edit override.
  - **D11 added:** skill description wording locked from user-approved draft.
  - **D12 added:** skill content structure delegated with constraints (port `CLAUDE_MD_SECTION` + frontmatter conventions from deleted `.open-knowledge/AGENTS.md`).
  - **D13 added:** delete `PREVIEW_GUIDANCE` shared constant.
  - **D14 added:** delete "Full convention: read `.open-knowledge/AGENTS.md`" pointers in 4 MCP tool files.
  - **D15 added:** `HOME` env-var override for subprocess test isolation.
  - **D16 added:** pin `skills@^1.5.0`.
- **FR6 rewritten** as `npx skills` shell-out with SHA-256 pre-check.
- **FR7 rewritten** as user-edit preservation logic (was: symlink fallback).
- **Q4, Q5, Q8, Q9 resolved;** Q10, Q11 added to track `npx skills` empirical behavior for impl phase.
- **Open questions remaining:** Q3 (deferred to Future Work), Q7 (tool-description audit, open for impl phase), Q10 (`--agent '*'` behavior), Q11 (no-agents-installed UX).
- **SCOPE + STOP_IF + ASK_FIRST updated** in Agent Constraints §16.
- **Non-goals updated:** NG6 dropped (symlink concern moot), NG7 clarified, NG8 added (ok doctor deferred).
- **Risks section updated:** removed symlink risk; added `npx skills` offline / subprocess / deprecation risks.

Next: content drafts (FR3 compressed `buildInstructions`, FR4 per-tool descriptions, FR5/D12 SKILL.md body) require user review before implementation. Per-tool description audit (Q7) requires reading 6+ files. Audit phase follows once all P0 content is drafted.

## 2026-04-22 — Session 1 (post Q7 audit + FR4 refinement)

- **Tool description audit done** (Q7): read 6 highest-leverage tool DESCRIPTION constants in `packages/cli/src/mcp/tools/`. 5 of 6 (`write_document`, `edit_document`, `search`, `get_preview_url`, `read_document`) already front-load their call-site prerequisites. Only `exec` lacks an explicit STOP pointer re native Read/Grep/Glob on markdown — flagged for impl.
- **FR4 budget tuned:** user approved **B** — per-description ≤ 2,048 bytes (Claude Code per-tool cap) AND front-loaded prerequisite in first 500 bytes. Replaces original "≤ 500 bytes" target. Unit test will verify both invariants.
- **Content drafts** (FR3 buildInstructions, FR4 per-tool edits, D12 SKILL.md body) flow through normal impl ASK_FIRST review per §16 — not blocking spec finalization.
- **Advancing to Audit phase (Step 6)** — spawn parallel `/audit` + challenger subagents.

## 2026-04-22 — Session 1 (Audit + Assess + Finalize)

**Audit phase (Step 6).** Spawned parallel nested Claude Code instances:
- Auditor (`/audit` + `/spec`): 19 findings (5H / 7M / 7L). Dominant pattern: "Alt E residue" — stale canonical+symlink language after the `npx skills` pivot. `meta/audit-findings.md`.
- Challenger (`/spec` + design-challenge protocol): 10 findings (3H / 4M / 3L). Dominant pattern: complexity challenge on three-surface design + SHA-256 sidecar. `meta/design-challenge.md`.

**Assess-findings phase (Step 7).** Loaded `/assess-findings`; classified all 29 findings.

Verified factual claims:
- F5 CONFIRMED: `packages/cli/package.json` `files` array is `["dist", "!dist/**/*.map"]` — bundled SKILL.md would not ship without explicit `"assets"` addition. **Critical runtime bug avoided.** Added to SCOPE + FR5.
- F17 CONFIRMED: `rootInstructions` is a programmatic-only field in `InitCommandOptions`, never wired as `.option()` in Commander. FR1 acceptance criteria tightened accordingly.
- F15 CONFIRMED: 21 tools (not 20) in `TOOL_DESCRIPTIONS`.
- C2 CONFIRMED: Claude Desktop is NOT in `vercel-labs/skills@1.5.1` supported-agents list. G5 narrowed to 5 first-class hosts + Claude Desktop best-effort.
- C10 CONFIRMED: No `--dry-run` flag exists in `runInit`. FR11 demoted to Future Work (Identified tier).

**User decisions (2026-04-22, post-audit):**

1. **Three-surface architecture RETAINED** (C3 rejected). User framing: "detailed instructions needed for seamless tool preference; skill was one way to expose them; feature should feel seamless." Three surfaces are saturation by design, not redundant. Added G2 seamlessness explicitly; added D17 locking the philosophy.
2. **Version-string sidecar (not SHA-256)** (2-B). Simpler; no user-edit preservation machinery (NG8); upgrades always overwrite on version bump. D5 rewritten; D10 (`--force` flag) DROPPED; FR7 rewritten; FR9 test list rewritten.
3. **Tilde pin `~1.5.0` instead of caret** (3-B). D16 updated.

**Fixes applied (Act category, 24 findings):**
- F1/C8: G5 rewrote — dropped "two symlinks" language; narrowed to 5 hosts + Claude Desktop best-effort path via docs.
- F2: "27/36+ agents" → "40+ agent hosts (as of `skills@1.5.1`)" consistently.
- F3: FR4 500-byte confusion resolved — "≤ 2,048 bytes total with first 500 bytes containing prerequisite." Stale references in §9 diagram + failure modes + state matrix cleaned.
- F4: §16 SCOPE file paths underscore → hyphen (`write-document.ts` etc.) matching disk reality.
- F5: Added `"assets"` to `packages/cli/package.json.files` as FR5 acceptance criterion; explicit path-resolution scheme documented.
- F6/F14: D4 "(to be written)" removed.
- F7: A5 confidence HIGH → MEDIUM; FR6 note reworded to "we pass `--copy` explicitly."
- F8/C1: `paths:` treated as Claude Code extension only (A2 + FR5 clarified; §9 diagram note added).
- F9/F10: FR9 test list fully rewritten to match Alt F semantics (no symlink tests, no frontmatter-recovery tests).
- F11: §9 error messages + state matrix rewrote to per-host-copy semantics.
- F12: FR12 → FR11 (Could-tier) checks sidecar at `~/.open-knowledge/skill-installed-version`.
- F13: NG6 deleted (symlink concern moot).
- F15: 20 → 21 tools.
- F16: "VS Code Copilot 1024" → "Agent Skills standard 1,024; Claude Code 1,536."
- F17/F18: FR1 acceptance precision; P1 persona reworded.
- F19: §16 SCOPE source-line pointers added for D12 content ports.
- C7: FR2 acceptance expanded to cover `init-content.ts:43` scaffold claim + 4 stale AGENTS.md pointers.
- C4: D16 caret → tilde pin.
- C9 DECLINED: breadcrumb exception contradicts D2/D3 LOCKED; noted but not adopted.
- New D17 added: Saturated three-surface delivery is first-class product promise (user framing).

**Spec state:** Finalized. 473 lines. Baseline commit stamped `57b50335`. All P0 open questions resolved or impl-phase-investigation. 1 decline (C9). Zero unresolved design challenges.

**Next:** `/ship` against this spec when ready to implement.

## 2026-04-22 — Session 1 (auto-install triggers — post-finalization amendment)

- **User added requirement before `/implement` kickoff:** "we want on package install or like the electron app install for the skills to be added globally." Skill install fires automatically on adoption (not only via `ok init`).
- **User decisions (3 batched):**
  - Postinstall scope: **A** — postinstall hook fires for all install paths including `npx`.
  - Electron trigger timing: **B** — every launch (idempotent via FR7 sidecar).
  - Spec boundary: **A** — Electron wiring included in this spec (not deferred).
- **Spec changes:**
  - Added G6 (auto-install on adoption).
  - Added D18-D21 (host `installUserSkill` in server package, bundled SKILL.md in server/assets/, postinstall non-fatal, Electron first-launch fire-and-forget in main process).
  - Added FR12 (CLI postinstall hook) + FR13 (Electron first-launch).
  - Rewrote FR5 + FR6 to reflect the server-package-hosted implementation.
  - Moved skill-install file location from `packages/cli/src/content/` → `packages/server/src/skill-install.ts`.
  - Moved bundled SKILL.md from `packages/cli/assets/` → `packages/server/assets/`.
  - Removed "add assets to cli package.json files" from SCOPE (server auto-publishes; CLI no longer hosts the asset).
  - Added `packages/cli/scripts/postinstall.mjs` as new file.
  - Added Desktop main-process wiring to SCOPE.
- **Dependency graph leveraged:** Desktop already depends on `@inkeep/open-knowledge-server` (workspace:*) for `bootServer`, `isProcessAlive`, `readServerLock`. Adding `installUserSkill` there is zero incremental dep surface.
- **Net:** three call sites, one implementation. `ok init` remains authoritative; postinstall is best-effort early trigger; Electron first-launch catches DMG-install users who never run `ok init`.

**Next:** re-entering `/implement` with expanded spec. Story set grows by ~2 stories (postinstall + Electron); skill-install infra moves to server package.

## 2026-04-22 — Session 1 (dual-hypothesis documentation during implement loop)

- **Operator observation surfaced:** OK operator (@timothycardona) reported that pre-change MCP `instructions` edits did NOT shift Claude Code agent behavior, whereas CLAUDE.md edits DID. This is load-bearing evidence that could invalidate A6's "compression fixes the Playwright-class failure" claim.
- **Two competing hypotheses** to explain the observation:
  - **H1 (compression artifact):** Edits lived past the 2 KB cap (current `buildInstructions` output = 24,019 bytes; Claude Code truncates past ~2 KB) → content never reached the model → of course no behavior change. Plan's FR3 compression IS the fix.
  - **H2 (weak weighting):** Content was delivered but the model treats `# MCP Server Instructions` block as a spec-level "hint" (RFC 2119 `MAY`) and doesn't weight it as directive like CLAUDE.md content. Compression alone doesn't fix this; plan needs amendments.
- **Cannot disambiguate ex ante** — both hypotheses fit the observed behavior. Only post-ship measurement (ship the 1.5 KB compressed version, then test on Claude Code) can disambiguate.
- **Current plan is robust under either hypothesis:** under H1 our plan IS the fix; under H2 the skill body + per-tool descriptions carry the steering load (the 3-surface saturation was designed for this degradation mode anyway).
- **Spec updates:**
  - Added A6b: new assumption naming both hypotheses as LOW-confidence until post-ship measurement.
  - Added Risk `R-INST-WEIGHT`: full disambiguation protocol + amendment plan for H2 case (expand D11 description; extend FR4 front-loading to more tools; investigate `paths:` effectiveness).
  - Added M5 metric: controlled post-ship measurement protocol (fresh Claude Code session, markdown-read intent, observe tool choice — with A/B between skill-installed and skill-removed to isolate contribution per surface).
  - No changes to current stories or implementation plan. Amendments to D11 / FR4 are contingent on H2 disambiguation.
- **Research agent dispatched** (background) to investigate `instructions` handling across all 6 target hosts via decompilation + OSS source reads. Expected to surface evidence relevant to H1 vs H2 before post-ship measurement runs.

**Implication:** ship the current plan. If post-ship M5 measurement shows H2 holds, trigger the R-INST-WEIGHT amendment plan as a follow-up spec. No pre-ship re-work needed.

## 2026-04-22 — Session 1 (research: MCP instructions host variance — major finding)

**Research agent completed** the focused investigation dispatched earlier. Evidence file written to `reports/mcp-guidance-delivery-no-project-pollution/evidence/d1-mcp-instructions-followup-2026-04-22.md`. Result contradicts prior plan assumption.

**Major finding: only 1 of 6 target hosts confirmed to inject MCP `instructions` into model context.**

| Host | Injects `instructions`? | Confidence | Primary source |
|---|---|---|---|
| Claude Code | YES — every turn, 2KB cap, tied to Tool Search retrieval | CONFIRMED | [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) + decompilation |
| Cursor | NO — undocumented; feature request filed | INFERRED | [forum post 150294](https://forum.cursor.com/t/mcp-system-prompt-missing-instructions-for-prompt-discovery-and-usage/150294) |
| Codex CLI | SPLIT — `codex-mcp` reads, `rmcp-client` ignores | CONFIRMED-split | openai/codex Rust source |
| Windsurf | NO — undocumented | INFERRED | docs.windsurf.com |
| VS Code Copilot | NO — uses `copilot-instructions.md` instead | INFERRED | code.visualstudio.com mcp-servers docs |
| Claude Desktop | NO — host explicitly drops the field | INFERRED (high-conf) | [anthropics/claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131) |

**Cross-verified via open-source MCP clients:** sst/opencode + OpenHands confirmed via source-read — neither reads `instructions`. Rules out any lingering hope that closed-source hosts might silently honor the field.

**Bonus Claude Code finding:** `instructions` is tied to Tool Search — when Tool Search is active (default on Sonnet/Opus 4+), server instructions act as retrieval-index hints for tool discovery. This is a STRONGER role than "system prompt hint"; may influence which tools the agent selects.

**Spec updates applied:**
- **A6c** (new assumption, HIGH confidence): MCP `instructions` is Claude-Code-only for reliable delivery.
- **R-INST-WEIGHT** (existing risk, scoped): now explicitly limited to Claude Code. Disambiguation protocol unchanged.
- **R-INST-HOSTS** (new risk, HIGH confidence): 4 of 6 hosts don't deliver `instructions`; Claude Desktop is worst-coverage (1-surface only: tool descriptions); NG5 becomes load-bearing for non-Claude-Code hosts.

**No pre-ship re-work required.** The spec's three-surface saturation was always defense-in-depth; skill + per-tool descriptions were always the cross-host backbone. MCP `instructions` is now explicitly Claude-Code-scoped. Current plan ships as-is; Claude Desktop gap flagged for M2 investigation.

**Honest reframing of the plan's reliability claims:**
- Claude Code: 3-surface coverage (instructions + skill + tool descs) — highest fidelity
- Cursor / Windsurf / VS Code Copilot: 2-surface coverage (skill + tool descs) — good
- Codex: 2-3 surface coverage depending on client version
- Claude Desktop: 1-surface coverage (tool descs only; skill not in `npx skills` agent list) — weakest, acknowledged limitation

**Implication for R-INST-WEIGHT post-ship measurement:** even if H1 holds on Claude Code (compression fixes delivery), the finding doesn't transfer to other hosts because they don't deliver `instructions` at all. The measurement protocol stays as written but its results only inform Claude Code behavior. For non-Claude-Code hosts, the open question (A7 skill activation reliability) becomes THE open question for R-INST-HOSTS.

## 2026-04-22 — Session 1 (research: Claude Desktop skill install deep-dive — 10-dimension investigation)

**Why spawned:** operator flagged Claude Desktop + Cursor as primary user hosts; prior R-INST-HOSTS risk identified Claude Desktop as weakest-coverage (1 surface); needed to verify whether ANY programmatic install path exists before accepting manual-only as our answer.

**Verdict: Claude Desktop skill install is fundamentally manual-only.** No programmatic bypass exists. Full evidence at `reports/mcp-guidance-delivery-no-project-pollution/evidence/claude-desktop-skill-install-2026-04-22.md`.

**Primary-source confirmations (10 dimensions investigated):**
- Anthropic's own docs explicitly enumerate three install surfaces (claude.ai UI zip, `/v1/skills` API, Claude Code filesystem) and state they do NOT cross-sync. Claude Desktop falls under claude.ai — UI zip only.
- Issue #40558 (feature request: `~/.claude/skills/` filesystem support in Desktop) closed as **invalid** by Anthropic.
- Issue #20697 (sync Claude Code ↔ Claude Desktop skills) open 3 months, zero Anthropic response.
- Issue #26952 (`claude://` URL scheme for skill install) closed **not planned**.
- `claude://` scheme is for session resume only, no skill install.
- Admin API has zero skill endpoints (only users, invites, workspaces, API keys).
- `/v1/skills` API uploads do NOT appear on claude.ai (verified primary source).
- DXT / `.mcpb` bundles are MCP-server-only — no skill slot in the manifest.
- Claude Desktop is an Electron webview over claude.ai; skills live server-side keyed to Anthropic account.
- No community-built CLI / script / Electron extension automates the upload.

**Contradiction flagged** between the two research passes:
- Pass 1 (MCP instructions host variance): Claude Desktop DROPS the `instructions` field per Issue #131.
- Pass 2 (Claude Desktop skills deep-dive): RECOMMENDS MCP `instructions` as "the pragmatic answer for Claude Desktop guidance delivery."
- Reconciliation: unclear. Either #131 was transient and since fixed, or pass 2 speculated without verifying. Post-ship empirical test required.

**Spec updates applied:**
- **A4b added:** Claude Desktop skill install is manual-only; HIGH confidence, primary-source anchored across 10 dimensions.
- **§15 Future Work > Explored:** Added "Claude Desktop skill manual-install path" as M1.5 follow-up — zip build + publish + docs + empirical test on MCP instructions handling.
- **§15 Future Work > Explored:** Added "Claude Desktop DXT / `.mcpb` bundle for MCP server install" — orthogonal to skill install, smooths initial MCP server registration.

**No M1 plan changes.** The 11 user stories in the iteration loop remain correct scope. M1.5 candidate work — zip bundle + Claude Desktop docs — is additive and can ship separately once M1 lands.

**Honest scoring confirmed:**
- Cursor: 2 of 3 surfaces automated (skill via `npx skills`, tool descriptions). Per-tool descriptions load-bearing.
- Claude Desktop: 1 of 3 surfaces automated (tool descriptions only). Manual zip upload is the workaround for skill surface. MCP instructions honoring unclear (contradictory research).

## 2026-04-23 — M1.5 content update: skill body sweep (bug bash + user-directed additions)

**Trigger.** M1 testing surfaced that the shipped skill body, while discoverable after the YAML fix + imperative description rewrite, didn't address every agent-prompting issue. Three bug bash items in `projects/v0-launch/bug-bash-triage.md` §1 (#7, #12, #13) sat in the "agent-prompting sweep" bucket explicitly pointed at AGENTS.md — since M1 deleted that surface, the skill body now has to carry the content.

**Plan.** `/Users/timothycardona/.claude/plans/wait-show-me-your-proud-pixel.md` — approved by user after 2 rounds of AskUserQuestion on design tensions.

**User-approved decisions (AskUserQuestion during plan mode):**
- **D1 — Link strategy:** Flip to standard markdown links. `[text](./path.md)` for all links. Wiki-link syntax `[[Page]]` still parsed for legacy, no longer the recommended default. **Design implication:** agent-written content won't participate in the backlink graph by default; backlinks become incidental rather than load-bearing. Called out explicitly; user confirmed direction.
- **D2 — Grounding strictness:** MUST-cite (strict). Every factual claim requires a source at the point of claim. Advisory-tone rejected (gets rationalized away).
- **D3 — Scope add-ons:** hub-maintenance cadence (port); observed agent behaviors (M1 testing case); config.yml folder/metadata encouragement; M2-candidate for converting OK's workflow MCP tools (`init-content`, `ingest`, `research`, `consolidate`) to proper Agent Skills à la `eng:research`.
- **Media scope (2nd AskUserQuestion):** all 4 dimensions — markdown syntax only, image sourcing/fetching, alt-text discipline, cite image sources.

**Skill body changes applied (`packages/server/assets/skills/open-knowledge/SKILL.md`):**

1. **New section: "Grounding — every factual claim needs a source (MUST)"** — addresses bug #13 (LLM generates content without web searches). Mirrors `/research` skill discipline. Every claim cites source via inline markdown link; web-search-first; fabricate-free; TODO-marker when evidence unavailable.
2. **"Linking" section rewritten per D1** — flipped to standard markdown links. Wiki-links noted as legacy-supported but not recommended. Explicit "never backtick a link" rule (bug #7) + "never use HTML anchors" + "get_dead_links is strict; editor red-underline tolerant" warning.
3. **New section: "Media — images and attachments"** — 4 sub-dimensions: markdown syntax only (bug #12), image sourcing (fetch + save locally, never hot-link), alt-text discipline (meaningful, not empty/generic/filename), cite image sources via caption line (applies Grounding rule to images).
4. **New clause in STOP section: "MCP tool visibility — not seeing `exec` is NOT the escape hatch"** — ported from deleted `CLAUDE_MD_SECTION`. Addresses rationalization observed in M1 testing (agent read `.open-knowledge/AGENTS.md` via native `Read` despite skill loaded). Also added STOP bullet for the native-`Read` on `.open-knowledge/AGENTS.md` case specifically.
5. **New section: "Folder structure + metadata — edit `.open-knowledge/config.yml`"** — per D3 user request. When creating/restructuring folders, add matching `folders:` entry to config.yml with glob + frontmatter defaults. Prefer enriching config.yml over creating hub files.
6. **"Organization" section reframed** — tighter. Folders first-class; metadata in config.yml; no hub files for new content; keep existing hubs updated as children change but don't propagate the pattern.
7. **New section: "Cadence"** — ported from old `CLAUDE_MD_SECTION` (reduced). Interleave writes so preview follows. If hub doc exists: write child → update hub → write next child.
8. **Anti-pattern table refreshed** — 10 rows total. New rows: backticked-link, HTML `<img>`, unsourced factual claim, empty/generic alt text (implicit via Media section's Don't/Do in prose), catalog via INDEX.md hub file.
9. **Frontmatter comment update** — skill body now notes it tracks `@inkeep/open-knowledge-server` package version. Check `cat ~/.open-knowledge/skill-installed-version` to see what's installed.
10. **Description field tightened** to reflect new sections — mentions grounding rule, media rules, dead-link verification, folder-first organization with config.yml metadata.

**Files touched:**
- `packages/server/assets/skills/open-knowledge/SKILL.md` — canonical source, full rewrite (9 sections touched)
- `tmp/ship/drafts/skill-body.md` — mirrored from canonical (spec D12 traceability)
- `packages/cli/dist/assets/skills/open-knowledge/SKILL.md` — rebuilt via `bun run build`

**Version bump skipped.** User direction — we're still iterating, no need to spend version numbers. Manual remove + reinstall was used for the testing cycle. `packages/server/package.json` stayed at `0.2.0`. Next release will bump once content stabilizes; until then, `npx skills remove open-knowledge -g && rm ~/.open-knowledge/skill-installed-version && ok init` is the force-refresh pattern.

**Post-edit verification (completed):**
- Build succeeded: `bun run build` emits updated asset at `packages/cli/dist/assets/skills/open-knowledge/SKILL.md`
- Install succeeded via `npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy`
- Installed file at `~/.claude/skills/open-knowledge/SKILL.md` = 16,992 bytes
- All 13 expected section headers present in installed file (STOP, Reads, Writing, Grounding, Linking, Media, Frontmatter, Folder structure + metadata, Organization, Cadence, Anti-patterns, Server lifecycle, Scope recap)

**Not in scope (M2 candidates):**
- Converting OK's instructional MCP tools (`init-content`, `ingest`, `research`, `consolidate`) into proper Agent Skills modeled on `eng:research` — user flagged during D3, separate spec pass required
- Claude Desktop manual-install zip bundle + docs (M1.5 from prior changelog entry)
- DXT / `.mcpb` one-click Claude Desktop MCP install

---

## M1.6 (2026-04-23) — Karpathy workflow alignment for MCP workflow tools

**Trigger.** Post-M1.5 behavioral spot-check showed the skill body was "behaviorally good but missing something." User directive: update the four workflow MCP tools (`ingest`, `research`, `consolidate`, `init-content`) to be more thorough and align with [Karpathy's three-layer wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). Second directive during work: make `research` structurally mirror the `eng:research` skill (mandatory execution order, ⛔ gates, checkpoint tasks, scan-first routing, STOP scoping gate, 3P framing, validate + recap).

**Shape of the change.** Content-only update to the four MCP workflow tool bodies + a new SKILL.md "Workflow tools" orientation section. Zero API changes, zero schema changes, zero behavioral code changes. The tools still return instructional text; the text is now much thicker and follows a consistent three-layer frame.

**Files touched:**

1. **`packages/cli/src/mcp/tools/shared.ts`** — Added `WorkflowRole` type + `buildWorkflowFrame(role)` helper. Emits a common "Where this fits" orientation block referencing Karpathy's three-layer pattern (raw sources / wiki-provisional / wiki-canonical / schema), naming the tool's role, and showing Before/After flow. One definition, four consumers.
2. **`packages/cli/src/mcp/tools/ingest.ts`** — Prepended frame. Added Step 0 ("Is this source worth preserving?" — scope + dedup + is-it-`research`-the-user-wants check). Added Step 5 ("Discuss takeaways with the user — in chat, not in the raw file") — Karpathy's "discussing takeaways" moment, preserving the raw/analysis separation. Added optional Step 6 (update 1–3 neighbor docs to link the new source). Extended non-goals: no silent chaining into `research`, no synthesis mixed into the raw file.
3. **`packages/cli/src/mcp/tools/research.ts`** — Full rewrite to mirror the `eng:research` skill shape. New structure: three paths (A=article default, B=direct answer, C=update existing), autonomy modes (supervised/headless), 3P external framing default, mandatory execution order with ⛔ gates, 8 numbered steps (Step 0: checkpoint tasks → Step 1: scan existing coverage + route → Step 2: STOP scoping gate → Step 3: ingest sources → Step 4: read + analyze → Step 5: write article → Step 6: link + file Q&A back → Step 7: validate → Step 8: recap + follow-up). Grounding discipline (every claim cites), path-specific shortcuts (Path B skips Steps 5 + 7; Path C skips Steps 3 + 5).
4. **`packages/cli/src/mcp/tools/consolidate.ts`** — Prepended frame. Elevated decision-confirmation to a top-of-body STOP gate (previously buried in Step 2). Re-check step after loading research (in case the research surfaces an un-rebutted open question).
5. **`packages/cli/src/mcp/tools/init-content.ts`** — Prepended frame. Added optional Step 6 for seeding a `log.md` (Karpathy's append-only work history). Renumbered final step to "Step 7: Verify."
6. **`packages/server/assets/skills/open-knowledge/SKILL.md`** — New "Workflow tools — when to invoke them" section inserted between "Anti-patterns" and "Server lifecycle." Tabulates the four tools with Karpathy layer + trigger cues. Documents typical day-2 flow. Explicit "do not chain silently" rule — agent asks the user between phases.
7. **`tmp/ship/drafts/skill-body.md`** — Mirrored from canonical (spec D12 traceability, now synced).
8. **`packages/cli/dist/`** — Rebuilt via `bun run --cwd packages/cli build`. All four tool bodies + skill asset updated in dist.

**Why "mirror `eng:research`" matters.** `eng:research` is one of the most battle-tested skills in the Claude ecosystem. Its patterns (checkpoint tasks, scan-first, STOP scoping gate, path routing, evidence discipline, recap) exist because they prevent known failure modes (agent jumps to `WebFetch` without scoping, duplicates prior research, fabricates missing evidence, prematurely canonicalizes). Making `research` structurally mirror it imports those preventions into OK's workflow without depending on the `eng:*` plugin being installed.

**Karpathy mapping locked in:**

| Karpathy layer | OK tool | OK discipline |
| --- | --- | --- |
| Raw sources (immutable) | `ingest` | Preservation-only; no analysis in the file; takeaways live in chat |
| Wiki, provisional | `research` | `status: provisional`; `sources:` frontmatter; scan-first; STOP scoping gate |
| Wiki, canonical | `consolidate` | `status: canonical`; `supersedes:` chain; STOP decision-gate before any write |
| Schema + bootstrap | `init-content` + `config.yml` | Day-1 population; optional `log.md` seed for append-only trail |

**Version bump skipped.** Same stance as M1.5 — still iterating. `packages/server/package.json` stays at `0.2.0`. Force-refresh pattern unchanged: `npx skills remove open-knowledge -g && rm ~/.open-knowledge/skill-installed-version && ok init`.

**Post-edit verification:**
- `bun run --cwd packages/cli build` succeeded in 2.7s
- `grep -c "Karpathy" packages/cli/dist/cli.mjs` → 7 matches (frame helper + four tool bodies + skill section)
- Skill body mirrored to draft (`diff` returns 0 lines)

**Known open follow-ups:**
- Convert the four workflow tools from "MCP tool returns instructional text" to full Agent Skills with `references/` files (M2). The content is now thick enough to drop into skill files directly when we do this conversion.
- Behavioral spot-check needed: confirm agents following the new `research` tool body actually (a) create checkpoint tasks, (b) scan before fetching, (c) stop at the scoping gate in supervised mode.
- TS deprecation warning on `server.tool(name, description, schema, cb)` signature is pre-existing on every tool in `packages/cli/src/mcp/tools/` — not introduced by this round. Separate cleanup pass.
