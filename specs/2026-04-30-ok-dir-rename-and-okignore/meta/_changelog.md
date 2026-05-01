# Changelog — `.ok/` rename + `.okignore` spec

Append-only process history. New entries at the top.

---

## 2026-04-30 — Session 1: Intake + scaffold + worldmodel

### Intake
- Captured seed: rename `.open-knowledge/` → `.ok/`, lift content include/exclude into `.okignore` (gitignore syntax). Pre-release.
- Light intake surfaced 4 ambiguities. User responses:
  - Q1 (shadow repo scope): **rename includes `.git/open-knowledge/` → `.git/ok/`** for consistency. → D1 LOCKED.
  - Q2 (gitignore semantics expressiveness): investigation in `packages/server/src/content-filter.ts` showed `content.exclude` already runs through the same `ignore` library as `.gitignore`; `content.include`'s only real job (extension filter) is redundant with the upstream `isSupportedDocFile()` gate. Pure gitignore semantics are expressively complete. User direction taken as agreement. → D2 LOCKED.
  - Q3 (migration UX): **hard cutover, no migrator**. Pre-release; greenfield. → D3 LOCKED.
  - Q4 (`.okignore` location): **project root + nested at any folder depth**. Mirrors `.gitignore`. → D4 LOCKED.
- Saved feedback memory `feedback_pre_release_no_migrators.md` capturing the user's "no legacy code in pre-release" stance — applies to future specs, not just this one.

### Scaffold
- Created SPEC.md (template-prefilled), `evidence/`, `meta/`. Baseline commit: `37bf36b42`. Spec path: `specs/2026-04-30-ok-dir-rename-and-okignore/`.
- Wrote `evidence/_user_outcomes.md` capturing user-stated direction for value framing.

### Worldmodel (--depth full)
- Channels available: web, reports, code, user-sources. No relevant catalog skills (`.claude/skills/` set is UI-focused: accessibility, shadcn, vercel-*); no relevant OSS repos (`~/.claude/oss-repos/` only has `episodic-memory`).
- Dispatched code-channel agent (general-purpose + load /explore) and web-channel agent (general-purpose for WebSearch/WebFetch) in parallel; ran reports-channel inline (CATALOGUE.md scan).
- Code channel wrote `evidence/_code_channel.md` (~430 lines — full callsite enumeration). Surface count: 347 tracked files, 3,762 line-hits; production source ~70 callsites (server ~46, cli ~20, desktop ~10, app ~6, core 3); docs ~52 line-hits across ~10 mdx files. Three recent rename precedents catalogued.
- Web channel wrote `evidence/_web_channel.md`. Confirmed `ignore` lib filename-agnostic + cross-source `!` negation; mapped `.<tool>ignore` ecosystem precedents.
- Reports channel wrote `evidence/_reports_channel.md`. Two relevant prior reports: `git-directory-nesting-shadow-repo` (validates `.git/<custom>/` placement — carries forward) and `symlink-handling-file-sync-crdt` (low relevance).
- Synthesized into `evidence/_init_worldmodel.md`.

### Key worldmodel findings that updated SPEC.md
- **Settings pane "Content" section** writes ALL THREE content fields including `content.dir` — real end-user surface, not just YAML cleanup. Added Q7 + FR11.
- **`OK_DIR` constant inconsistently used** — server-src has 16 hardcoded literal sites. Added Q8 (minimal-touch vs systematic) + FR5.
- **`~/.open-knowledge/` user-home paths** (auth.yml, config.yml, mcp-status.json, stats.jsonl, skill-installed-version) rename in lockstep with per-project. Clarified D1 scope.
- **Adopt-detection invariant** — `state-manifest.ts` checks both `.open-knowledge/` AND `.git/open-knowledge/`. Renaming without updating the check causes existing projects to be detected as fresh-init. Added FR3, escalated to top risk in §14.
- **Bundle ID, URL scheme, writer-ID literal, Codex MCP server name** all confirmed out of scope. Added NG6/NG7/NG8/NG9.
- **Drift-guard test** at `init.test.ts:205-231` asserts the committed `.open-knowledge/.gitignore` matches scaffold byte-for-byte. Added Q11 (BUILTIN_SKIP_DIRS strategy) + FR12 + FR14.
- **Closest rename precedent** (`48d4218`, the previous shadow-repo rename) shipped a `renameSync` shim. We're going against it per user direction; pre-release license + D3 hard cutover. Risk acknowledged.
- **3 new tracked threads** (Q12-Q15): `clone.ts` `.git/info/exclude` line, `ignore` lib version verification, test rewrite/delete itemization, doc site rewrite scope.

### Open Questions surfaced for iterative loop
- Q7 Settings pane disposition (P0, product, blocking FR11)
- Q8 OK_DIR consistency pass scope (P0, technical)
- Q9 Codex MCP server name rename (P0, product)
- Q10 Default `.okignore` template (P0, product, blocking FR12)
- Q11 BUILTIN_SKIP_DIRS strategy (P0, technical, blocking FR14)
- Q12-Q15 tracked threads (P0, mechanical)

### Next
- Step 3: frame on topology — SCR is already drafted in §1; will run 5-probe stress test + scope hypothesis + extract granular evidence/<topic>.md files where worthwhile.
- Step 4: backlog re-extraction (3-probe walk-through / tensions / negative space) on top of grounded surface map.
- Step 5: iterative loop on Q7-Q11 (the load-bearing P0 OQs).

---

## 2026-04-30 — Session 1 cont'd: Step 3 framing + Step 4 backlog + Step 5 iterative loop (one batch)

### Step 3 (framing)
- SCR (§1) stress-tested against 5 probes: 4 PASS (demand reality, status quo, observation, future-fit). Probe 3 (narrowest wedge) flagged that the rename and `.okignore` halves are independently shippable — user kept them bundled per intake seed.
- Scope hypothesis presented + accepted (no objections).

### Step 4 (backlog extraction collapsed into Step 5)
- Worldmodel grounded the topology; backlog extraction surfaced 9 Open Questions (Q7-Q15) at start of Step 5; completeness re-sweep at end of Step 5 added 5 more (Q16-Q20).

### Step 5 (iterative loop)
- 5 P0 load-bearing decisions resolved by user 2026-04-30:
  - Q7a → **D5 LOCKED** Settings pane "Content" section becomes single-field (`content.dir` only).
  - Q8b → **D6 LOCKED** Systematic OK_DIR consistency pass (16 server-src sites route through the constant; user chose against the agent's minimal-touch recommendation).
  - Q9b → **D7 LOCKED** Codex MCP server identifier `mcp_servers.open-knowledge` stays as-is (NG9 confirmed).
  - Q10b → **D8 LOCKED** `ok init` scaffolds `.okignore` with commented header; committed by default.
  - Q11b → **D9 LOCKED** Both — keep self-ignoring `.ok/.gitignore` AND add `'.ok'` to BUILTIN_SKIP_DIRS.
- 4 tracked threads resolved DELEGATED to implementation:
  - Q12 (clone.ts `.git/info/exclude`) — pure rename per D3; legacy entries are harmless cruft.
  - Q13 (`ignore` lib version) — verified `^5.3.2` in `packages/server/package.json`; safe (cross-source `!` negation works at 5.x).
  - Q14 (test rewrite/delete) — itemize at implementation; `content-filter.test.ts` rewrites, `set-config.test.ts` deletes, `loader.test.ts` becomes "key rejected" test.
  - Q15 (doc site) — itemize at implementation.
- Completeness re-sweep (4 probes) surfaced 5 new tracked threads:
  - Q16 (field registry test) DELEGATED.
  - Q17 (errors string `errors.ts:186`) DELEGATED.
  - Q18 (pre-existing changeset conflict check) DELEGATED.
  - Q19 (published JSON schemas regenerate) DELEGATED — `bun run check` covers.
  - Q20 (user-home re-prompt on rename) DELEGATED — expected behavior; document in PR description.
- Tensions surfaced: D6 (systematic OK_DIR) inflates PR scope; mitigated by recommending two-commit split in §14 risks.
- §6 FR5/FR11/FR12/FR14 refined to reflect locked decisions.
- §9 (Proposed solution) drafted with vertical slice.
- §13 (In Scope) filled out with deployment/rollout considerations.
- §14 (Risks) extended with 2 new risks.

### Next
- Step 6: spawn parallel cold-reader audit + design challenger via nest-claude.

---

## 2026-04-30 — Session 1 cont'd: Step 6 audit + Step 7 assess-findings

### Audit findings
- Auditor wrote `meta/audit-findings.md`. 4 H-severity, 4 M-severity, 8 L-severity. Verdict: "needs work" — two H-severity factual errors invalidate load-bearing claims.
- Verified each H-severity claim against repo:
  - **A1 CONFIRMED** — `state-manifest.ts:83-88 detectProjectShape()` checks ONLY `shadowRepoDir`; `lockDir` is `void`-discarded per D14 (2026-04-27). FR3 as written would re-introduce the lockDir-misclassification bug.
  - **A2 CONFIRMED** — `git grep -E "'\.open-knowledge'" -- packages/server/src/*.ts` excluding tests returns 9 hits, not 16. The `_code_channel.md` count mixed literal-string sites with jsdoc/comment lines.
  - **A3 CONFIRMED** — `fs-traced.ts:43` is a third literal site (`${sep}.git${sep}open-knowledge${sep}` for the `'shadow-repo'` cardinality bucket). Not in any FR.
  - **A4 CONFIRMED** — `errors.ts:186` is the agent-settable paths string, NOT a YAML-key-rejection precedent. FR8's "source-located error" mechanism has no in-codebase template.

### Challenge findings
- Challenger wrote `meta/design-challenge.md`. 2 H-severity, 4 M-severity, 2 L-severity.
- Verified each H-severity claim:
  - **C1 CONFIRMED** — `cli/src/auth/token-store.ts:85` literal `.open-knowledge` outside FR5's server-src grep scope.
  - **C2** is a design challenge with new evidence (`48d4218` shim precedent) — surfaces to user.

### Pure factual corrections applied autonomously (factual fixes; no decision change)
- FR3 rewritten: shadow-repo only (mirrors D14's narrowing); `lockDir` parameter intentionally unused.
- FR2 extended: `fs-traced.ts:43` shadow-repo classifier explicitly named.
- FR5 broadened: monorepo-wide grep scope (drops the false `packages/server/src`-only gate); `token-store.ts:85`, `mcp-wiring.ts:63`, `ipc-handlers.ts:342`, `fs-traced.ts:43,49,51` enumerated.
- §8 Current state: corrected adopt-detection statement to shadow-only; documented the original mistake + correction.
- D1 rationale rewritten: lockstep stands on consistency grounds, not on a fictitious adopt-detection invariant.
- D6 site list updated: 9 server-src + user-home callsites + 3 fs-traced classifiers (replacing the false "16").
- §14 risk row updated: "Adopt-detection update applied incorrectly" replaces the old "regression if not updated" framing — risk is now mis-broadening (re-introducing D14's fixed bug) not under-broadening.

### Items routed to user (Step 7 assess-findings consolidated batch)
- **A4 (decision-implicating):** FR8's "source-located error" promise has no precedent; user picks the YAML-rejection mechanism.
- **C2 (design challenge):** D3 hard cutover vs. `48d4218` shim precedent.
- **C3 (design challenge):** D6 fast-follow PR option (third option for Q8 not previously presented).
- **C4 (design challenge):** Narrowest-wedge alternative (`.okignore` lift first, rename later).
- **C5 (design challenge):** D5 Settings IA — single-field section is a UI smell; consider repositioning.
- **C6 (design challenge):** NG9 (Codex MCP server name) contradicts G1.

### Next
- Step 8: verify and finalize after user resolves the routed items above.

---

## 2026-04-30 — Session 1 cont'd: Step 7 user routing + Step 8 verify and finalize

### Step 7 — user resolutions to audit/challenge findings
- **A4 → 1b (D10 LOCKED):** Build new `REMOVED_KEY`-class error case in `packages/core/src/config/errors.ts` for the rejected `content.{include,exclude}` YAML keys. Drops the false `preview.baseUrl` precedent claim.
- **C2 → 2a (D11 LOCKED):** D3 hard cutover REAFFIRMED. The `48d4218` shim precedent counter-argument was considered + rejected. No `renameSync` shim.
- **C3 → "two PRs" (D6 revised):** Split into rename PR + fast-follow refactor PR. This PR is pure rename (literal-search-replace); the fast-follow PR routes literals through `OK_DIR`. §15 Future Work entry added.
- **C4 → 4a (kept bundled):** Bundling stands. No spec change.
- **C5 → 5b (D5 revised):** Settings pane Content section removed entirely. `content.dir` becomes YAML-only.
- **C6 → user surfaced two new questions Q21 + Q22 before deciding.**

### Step 7 follow-up — Q21 + Q22 investigation + resolution
- **Q21 (content.dir disposition) → D12 LOCKED:** Keep as YAML-only. Architectural cost of removal too high — `content.dir` is the file-watcher subscription root + resolution root for ~20 callsites (`paths.ts:18` `resolveContentDir`); `.okignore` can replicate filtering but NOT watcher-subscription scope.
- **Q22 (MCP_SERVER_NAME rename) → D13 LOCKED:** Retain `'open-knowledge'`. Single constant in `cli/src/constants.ts:14` flows to all 6 editor wirings. LLMs read MCP tool names as semantic hints; `'open-knowledge'` carries meaning; `'ok'` overloads with confirmation/status semantics. NG9 broadens from "Codex only" to cover the constant + all editor wirings.

### Step 8 — Verify and finalize
- **Mechanical adversarial checks (challenge-protocol):**
  - ASSUMED decisions: D1-D13 all LOCKED. None ASSUMED. ✓
  - 1-way doors at LOW/MEDIUM confidence: D1-D13 all marked "No (still pre-release)" — pre-release license consistent. ✓
  - Non-goal accuracy: NG1-NG9, all LOCKED with appropriate temporal tags (NEVER for stable identifiers + pre-release simplification, NOT NOW for deferrable scope). ✓
  - Pre-mortem top-1: literal-search-replace might miss a string-concatenated `.open-knowledge` segment (e.g., a path built with `+ '.open-knowledge'` in a non-grep-literal form). Mitigation: integration tests + `bun run check:full:parallel` + post-merge smoke. Acceptable for pre-release.
- **Resolution status:** all D-decisions are LOCKED with explicit rationale + evidence. No INVESTIGATING or DEFERRED items. ✓
- **§16 Agent Constraints derived:** SCOPE/EXCLUDE/STOP_IF/ASK_FIRST populated from In Scope items + LOCKED decisions + NG entries. Cross-cutting threading sweep applied (telemetry classifier, schema publishing, error envelope all in STOP_IF or SCOPE).
- **Resolution completeness gate:** every In Scope FR (FR1-FR15) has acceptance criteria verifiable via grep gates + tests; 3P deps named (`ignore` 5.x is current, picomatch removed, `@parcel/watcher` semantics confirmed); architectural viability validated (codebase already uses `ignore`); no FR depends on Out-of-Scope items. ✓
- **Collective standalone-value check:** FR1-FR15 collectively deliver an end-to-end user-visible outcome (rename + config lift + scaffold + tests + docs all updated in one PR). ✓
- **Future Work classification:** §15 has the OK_DIR fast-follow PR as "Identified" maturity (clear scope, ~50 lines, scheduled trigger after rename merges + 1-week settling). CLI bin rename remains "Identified."
- **Quality bar:** problem framing grounded (SCR + 5 stress probes); decisions have explicit rationale + evidence; alternatives §9 considered + rejected; risks §14 named with mitigations; agent constraints unambiguous. ✓
- **Baseline commit:** retained at 37bf36b42 (no source code changes during spec process — only spec artifacts in `specs/2026-04-30-ok-dir-rename-and-okignore/`).

### Spec status: FINALIZED. Ready for `/ship`.
