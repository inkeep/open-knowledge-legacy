# Design Challenge Findings

**Artifact:** `specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md`
**Challenge date:** 2026-04-22
**Total findings:** 10 (3 high, 4 medium, 3 low)

Scope note: this pass read the spec, both evidence files, and the research report cold, then cross-checked a small number of load-bearing factual claims against `agentskills.io/specification`, the `vercel-labs/skills` README on GitHub, the source-tree of `packages/cli/src/mcp/{server,tools}`, and the `packages/cli/src/content/init.ts` file referenced by the audit. All findings that are "DESIGN / DC1–DC3" in character are recorded below; findings that are factual contradictions of spec claims (e.g. supported-hosts list) are surfaced separately as decision-implicating for the Auditor's pass.

---

## High Severity

### [H] Finding 1: `paths:` frontmatter field auto-activation is not supported by the Agent Skills spec

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) + DC3 (framing validity)
**Location:** §1 Problem statement (resolution), §6 FR5, §10 D11, §12 A2 ("MEDIUM confidence"), §9 Proposed-solution architecture diagram (`paths: '**/*.md, **/*.mdx' (Claude Code)` callout)

**Issue:** The spec bakes Claude Code's `paths: '**/*.md, **/*.mdx'` frontmatter into FR5's acceptance criteria and states it "locks auto-activation to markdown work." The canonical Agent Skills spec at `https://agentskills.io/specification` (the spec file pointed to by `anthropics/skills/blob/main/spec/agent-skills-spec.md`, which now redirects to agentskills.io) enumerates six frontmatter fields: `name` (required), `description` (required), `license`, `compatibility`, `metadata`, `allowed-tools` (experimental). **`paths:` is not on that list.** Anthropic's own marketplace skill (`plugins/frontend-design/skills/frontend-design/SKILL.md`) carries only `name`, `description`, `license` — no `paths`. Every local SKILL.md in the Inkeep team plugin cache uses `name` + `description` + (optionally) `argument-hint`, never `paths`. Claude Code documentation's `paths:` field applies to the CLAUDE.md `@import` and memory-file mechanism, not to SKILL.md activation — easy to conflate since the surrounding docs share terminology.

**Current design:** "Skill content works on Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf with at most two symlinks off a canonical `~/.agents/skills/open-knowledge/` location" + "auto-activates on markdown work via description matching + `paths:` frontmatter (Claude Code)."

**Alternative:** Drop the `paths:` assumption entirely. Rely on **description-matching alone** for activation across all hosts — that is the single activation lever every host supports per spec. Calibrate the `description` field harder (it is already D11 LOCKED at ~500 chars, well under the 1024-char spec cap), add a trigger-keyword block inside the description, and budget the body assuming skill activation is probabilistic, not deterministic.

**Trade-off:** Lose deterministic "fires on every `.md` turn" activation (which was never actually guaranteed — the spec already rates A2 at MEDIUM confidence with a "will manual-test post-impl" verification plan). Gain: ship a SKILL.md that conforms to the actual spec, passes any future `skills-ref validate` check (referenced in the spec's own validation section), and doesn't break if the field is silently ignored or — worse — rejected by stricter hosts.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine A2 against the canonical spec before finalization. Verify `paths:` behavior empirically against a Claude Code build **before** making it part of any Must-tier acceptance criterion, and if unverifiable, move reliance on it from FR5 acceptance to a Could-tier enhancement with fallback to description-matching. The spec currently treats A2 as "Active" and MEDIUM — a MEDIUM-confidence assumption that a Must-tier FR depends on is load-bearing enough to promote to P0 investigation before close, not defer to "manual-test post-impl."

---

### [H] Finding 2: Claude Desktop is not in `vercel-labs/skills`'s supported-agents list — the 6th host is not covered by `npx skills --agent '*'`

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (stakeholder gap)
**Location:** §1 Problem (six-host enumeration), §2 G5, §6 FR6, §11 Q4 ("Resolved: covered via `npx skills --agent '*'`"), §12 A4 ("MEDIUM confidence"), §10 D4

**Issue:** The spec (G5, Q4) claims `npx skills add --agent '*'` covers all six OK-supported hosts including Claude Desktop. The `vercel-labs/skills` README on GitHub lists 45+ supported agents including Claude Code, Cursor, Codex, GitHub Copilot, Windsurf, OpenCode — **Claude Desktop is not listed.** Two fetches of the README (one via the root, one via the main branch) agreed: Claude Desktop is absent from the agent table. Q4 is marked "Resolved" on this unverified assumption (A4 = MEDIUM); this is exactly the kind of hand-off the Intake workflow warns against — a MEDIUM-confidence foundation beneath a LOCKED cross-cutting decision (D4: "Skill install delegated to `npx skills add`").

The Claude Desktop surface is unusual — skills there are typically installed via the in-app UI (settings → Capabilities), not via a filesystem path. If so, no CLI-level tool can install to it at all, regardless of vendor.

**Current design:** "Cross-host portability. Skill content works on Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf with at most two symlinks off a canonical `~/.agents/skills/open-knowledge/` location" + Q4 resolved via `npx skills --agent '*'`.

**Alternative:** Either (a) explicitly narrow G5 to "five hosts + Claude Desktop best-effort via in-app UI guidance in docs only," removing Claude Desktop from the delivery-surface invariant; or (b) verify Claude Desktop's skill-install contract directly (filesystem path? API? UI-only?) and, if it is UI-only, drop it from G5's implementable scope. Either way, the spec should not claim G5 is satisfied until this is verified.

**Trade-off:** Removing Claude Desktop from the "automated-install" scope is a small product concession (Claude Desktop users fall through to MCP handshake STOP rules + in-app UI doc), not a design change. Keeping the current claim without verification risks shipping a spec that fails its own G5 on day one.

**Status:** CHALLENGED
**Suggested resolution:** Re-open Q4. Either verify Claude Desktop is in a more recent `vercel-labs/skills` release (the evidence file cites 1.5.1 published 2026-04-17), or downgrade A4 to LOW and adjust G5 to five hosts + documented manual path for Claude Desktop.

---

### [H] Finding 3: "Simpler alternative" — a one-surface skill-only design may achieve G1/G2 without the three-surface layering cost

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §1 (Resolution), §9 (architecture), §10 D1 (LOCKED)

**Issue:** D1 locks in three delivery surfaces (MCP instructions ≤1500B + per-tool descriptions + user-global skill) simultaneously. The stated rationale is "full-fidelity replacement for CLAUDE_MD_SECTION injection" and "defense in depth" — each surface is motivated as a fallback for the others. The evidence behind the "defense in depth" claim is weaker than the spec implies:

- **Surface 1 (MCP instructions)**: Claude Code caps at 2KB; Cursor's handling is undocumented; "other hosts are best-effort" (research report §D1). FR3 targets ≤1500B. The STOP-rule + skill-pointer content is load-bearing.
- **Surface 2 (per-tool descriptions)**: The spec's own current-state audit finds **5 of 6 priority tools already carry the prerequisite** (evidence/current-state-audit.md). Only `exec` needs the STOP pointer added. Surface 2 is therefore mostly a near-no-op — which is an argument *for* it (near-zero cost), but also means its marginal contribution vs. Surface 1 alone is small.
- **Surface 3 (Agent Skill)**: Depends on description-matching (see Finding 1) which is fuzzy and host-specific.

A one-surface alternative worth examining: **expand the MCP `instructions` to the full 2KB Claude Code cap (not 1500B), inline the three most critical STOP rules + preview-first + skill-pointer if/when we still want a skill, and skip the `npx skills` install entirely.** The evidence-file finding that the current `instructions` is 24,019 bytes — 22 KB of it silently truncated — is framed as "the problem" but it's also direct evidence that Claude Code *does* inject up to 2KB reliably. Within 2KB you can fit the STOP rule block currently rendered in bracket-prefixed lines + the preview-before-edit REQUIRED block + a one-line `description` of the skill.

**Current design:** Three-surface layered hybrid locked as D1. ~150 lines of new `installUserSkill` code, SHA-256 sidecar machinery (D5), `--force` flag semantics (D10), per-tool audit across 21 tools (FR4) — total implementation surface is ~500 lines of new code + tests.

**Alternative:** **Two-surface minimum**: slim MCP `instructions` (≤ 2KB) + per-tool descriptions (already 83%-there). Skip the skill install entirely. Ship the companion skill as optional install via docs, not `ok init`.

**Trade-off:**
- **Lose:** Full behavioral-content body (~5KB SKILL.md) for cross-session persistence; cross-host agnosticism for anything beyond STOP rules.
- **Gain:** Drop D4 (external-dep commitment), D5 (sidecar machinery), D10, D15, D16; delete the `installUserSkill` module entirely; delete `skill-install.test.ts`; eliminate runtime dependency on `npx skills@^1.5.0`; eliminate A1, A4, A5, A7, A9, A10 from the active-assumption list; drop Q10, Q11 entirely; shrink §16 SCOPE by ~40% and §14 Risks by 5 of 10 rows.

**Status:** CHALLENGED
**Suggested resolution:** The spec's Decision Log Alt A ("Pure deletion + rely on MCP `instructions` alone") was rejected on "fails G2" grounds citing Playwright's documented "agents default to Bash" failure mode. That rejection predates a careful look at how much content the 2KB handshake can actually carry. Re-examine whether a **compressed 2KB `instructions` + already-good per-tool descriptions** (not "alone" — two surfaces, not one) clears the Playwright failure mode, before locking in the third surface. If the user then wants to add a skill for durable cross-session memory, that's a NOT NOW item, not an M1 blocker. The core product promise (G1 zero project-root writes + agent tool-routing) may not require the skill at all.

---

## Medium Severity

### [M] Finding 4: `npx skills` runtime dependency risk is under-weighted given spec's own framing

**Category:** DESIGN
**Source:** DC1 + DC2
**Location:** §10 D4 (LOCKED, 1-way door), §12 A9 (MEDIUM), §14 Risks 3–4

**Issue:** D4 LOCKS in "Skill install delegated to `npx skills add`." The spec enumerates the risk cleanly in §14 (rows 3–4: breaking-change outside caret pin, deprecation) but then lists mitigations for each that amount to "add a CI smoke test" / "fall back to custom install if this materializes." The "fall back to custom install" path is precisely Alt E that was rejected in §9 "Alternatives considered" — meaning the fallback is **harder to reach than the original alternative**, because by the time we need it (post-deprecation), we're building it under time pressure instead of at leisure.

The fetched GitHub README lists 45+ agents (evidence says "27"), version 1.5.1 was published 2026-04-17 — 5 days before this spec — with a snapshot version `1.4.5-snapshot.2` still active. This is a tool actively evolving its surface. Caret-pinning `^1.5.0` locks to a range that could include significant changes.

**Current design:** D4 LOCKED, A9 MEDIUM, risks 3–4 mitigated via "caret pin + CI smoke test." No fallback implementation, no branch of code that doesn't depend on `npx skills`.

**Alternative:** Hedge the 1-way door. Either (a) implement a minimal custom-install path (write-once + two symlinks, ~40 lines — the "Alt E" rejected in §9) and shell out to `npx skills` only as an *additive* cross-host widener for agents outside the 6 OK targets; or (b) commit to a tighter pin (`skills@1.5.x` exact or `~1.5.0`) instead of caret, which is actually what D16 text says ("`^1.5.0`") — clarify D16 carets to tildes if the intent is "patch-only."

**Trade-off:** Alt (a) adds ~40 lines we were trying to remove — but if you already have ~150 lines of fallback in the §14 mitigation plan, that 40 lines is the mitigation, just pulled forward. Alt (b) is a one-character flip with zero code impact.

**Status:** CHALLENGED
**Suggested resolution:** Review the caret vs tilde choice explicitly in D16, since that's where the cost/benefit cliff actually lives. A tilde pin achieves "break explicitly not silently" (D16's stated rationale) better than caret.

---

### [M] Finding 5: SHA-256 sidecar for idempotency — over-engineered for a static asset

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §10 D5 (LOCKED), §6 FR6, FR7, §9 shadow-paths diagram, §10 D15

**Issue:** D5 introduces a SHA-256 sidecar at `~/.open-knowledge/skill-installed-hash` to gate `npx skills add`. The sidecar ALSO carries Q1=B ("user-edit preservation") because the scheme is designed to detect three states at once: (a) fresh install, (b) bundled-hash unchanged, (c) user edited the installed copy. The design works, but it carries five moving parts (bundled-hash compute, sidecar read, installed-hash compute, three-way compare, `--force` override) for a scenario — users hand-editing a skill file bundled with a tool — that (i) has no user-reported demand cited in the spec, (ii) will be invisible 99% of the time (most users never open `~/.claude/skills/open-knowledge/SKILL.md`), and (iii) if it does happen, the "fix" is a CLI flag (`--force`) that the user already has to discover from a warning.

Simpler alternatives the spec did not evaluate:

1. **No sidecar.** Compute bundled-hash on each `ok init`; write-then-gate only on the "file exists" check that `npx skills add -y --copy` presumably does internally (this is Q11's investigation lane — if `-y` without `--copy` means "skip if exists" but `-y --copy` means "overwrite," pick the former and let the tool handle it). Total new state: zero. User-edit preservation is implicit: re-running `ok init` after a hand-edit just doesn't touch the file.

2. **File-mtime sidecar** instead of hash. Write the `ok init` timestamp to a tiny file; skip on re-run if `~/.open-knowledge/skill-installed-at` is newer than the bundled skill's mtime in the CLI package. No SHA-256 compute, no hex parsing, no three-way compare. Still hits the "don't reinstall on every ok init" goal (M3 idempotency).

3. **Package version file.** Write `@inkeep/open-knowledge` version string; skip if unchanged. Semver-native, human-debuggable (`cat ~/.open-knowledge/skill-installed-version` shows `0.5.3`), survives editor indentation/whitespace changes in SKILL.md that hash-compare would false-positive on. Q9 actually originally proposed this (B="string equality"); D5 superseded it claiming "content hash is stronger." Stronger at detecting drift, but drift-detection is what triggers the Q1=B false-positive warning storm if the bundled skill gets even a cosmetic trailing-whitespace change.

**Current design:** SHA-256 sidecar (D5 LOCKED), three-way compare (bundled/sidecar/installed), `--force` flag (D10), test-mode env override (D15). ~80 lines of code plus 7 unit tests (§16 SCOPE skill-install.test.ts).

**Alternative:** Version-string sidecar OR no sidecar at all. 5 lines of code, 2 unit tests.

**Trade-off:**
- **Lose:** Deterministic content-drift detection. A future refactor that tweaks a word in SKILL.md bumps the version either way.
- **Gain:** ~75 lines less code; no hex parsing; no "corrupt sidecar" failure mode; no path to generate a warning when the user hasn't edited anything (possible today if bundled skill's LF/CRLF or trailing-newline serialization changes between CLI builds).

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether Q1=B ("user-edit preservation") is a real user need or an imagined one. The spec doesn't cite a single user who has edited a bundled CLI-distributed skill file. Meanwhile, Q9=A-or-B (semver string equality) was the earlier proposal and was rejected *by D5*, not by user feedback. If the answer is "no one has asked for edit-preservation, it's defensive," then the simpler version-string scheme wins on every axis except cosmetic purity.

---

### [M] Finding 6: Per-tool description front-loading across 21 tools is a recurring maintenance burden the spec underestimates

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — maintenance)
**Location:** §6 FR4 (Must), §11 Q7 ("Open — investigation during impl"), §16 SCOPE / ASK_FIRST

**Issue:** FR4 requires each of 6 priority tools (write_document, edit_document, exec, search, get_preview_url, read_document) to (a) front-load a call-site-local prerequisite in the first 500 bytes, (b) stay ≤ 2048 bytes total, (c) pass a keyword-containment unit test. The full TOOL_DESCRIPTIONS table has **21 tools** (I counted; spec says "20"), and §16 ASK_FIRST says "each description is a customer-facing contract" and requires line-by-line user review. That is 21 customer-facing contracts to maintain line-by-line for every future OK release.

The recurring maintenance cost shape:
- Every new tool (OK has been adding tools — recent: `get_dead_links`, `suggest_links`, `rollback_to_version`) requires its description to be drafted, front-loaded, keyword-tested, user-reviewed.
- Every time the STOP rule wording shifts (e.g., adding a new tool to the "allowed native tools for source" category), 21 descriptions need review for drift.
- The unit test in FR4 asserts keyword containment per tool — a new-tool PR or a STOP-rule rewording can break 21 tests at once.

The audit finding that "5 of 6 already carry the prerequisite" is a snapshot, not a steady state. The spec's own experience — the "Full convention: read `.open-knowledge/AGENTS.md`." dead-pointer appearing in 4 tools (evidence/current-state-audit.md §4) — is a real example of this drift, which is why D14 needs to clean it up.

**Current design:** FR4 requires per-tool prerequisite discipline on 6 priority tools, full audit across 21; Q7 defers "exact content of `mcp/tools/*.ts` descriptions" to implementation; ASK_FIRST gate on every description change.

**Alternative:** Narrow the per-tool-prerequisite contract to **exactly one tool** that has the single load-bearing prerequisite agents need to not break OK's attribution: `exec` needs "STOP on native Read/Grep on in-scope .md" (the Playwright-class failure case). `write_document` + `edit_document` already have preview-before-edit (audit confirms). Everything else is nice-to-have.

- Accept that Surface 2 (per-tool descriptions) is for ONE actual load-bearing rule — the `exec` STOP rule — and that the other "prerequisites" are redundant with Surface 1 (MCP instructions) which fires in the same turn anyway.

**Trade-off:** Less defense-in-depth. But if Surface 1 + per-tool `exec` description converge on the same STOP content, the marginal value of putting it on 5 more tools where it's already redundant is close to zero, and the maintenance drag is linear in tool count.

**Status:** CHALLENGED
**Suggested resolution:** Re-scope FR4 to "audit `exec` description + add STOP rule there" as the Must, demote write_document/edit_document's preview-first to Should (since they already have it), and drop the keyword-containment unit-test across 21 tools in favor of 1 targeted test on `exec`.

---

### [M] Finding 7: Dead-reference cleanup (D14) has a confusing dependency on init-content tool's own `AGENTS.md` scaffolding claim

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing MCP tool behavior)
**Location:** §10 D14, §6 FR2, §16 SCOPE, evidence/current-state-audit.md §4

**Issue:** D14 deletes the "`Full convention: read \`${OK_DIR}/AGENTS.md\`.`" line from 4 tool files. But the evidence file notes that `init-content.ts:43` *also* contains a claim that "`open-knowledge init`" creates "`config.yml`, AGENTS.md, .gitignore`" — a statement that becomes **false** after FR2 drops AGENTS.md from SCAFFOLD_FILES. The spec's SCOPE calls this out ("Update `init-content.ts:43` AGENTS.md scaffold claim") but doesn't enforce it as an acceptance criterion.

The init-content tool description is read by agents doing onboarding. An agent following post-migration `init-content` guidance will: (a) be told `ok init` creates `AGENTS.md`, (b) not find one, (c) be told "Full convention: read `.open-knowledge/AGENTS.md`," (d) also not find that. The fix is in SCOPE but not in the FR acceptance criteria.

**Current design:** D14 deletes the 4 dead pointers; init-content:43 update is mentioned in SCOPE but not codified as an FR.

**Alternative:** Promote the init-content:43 correction to FR2's acceptance criteria. Add a `bun test` that the post-FR2 init-content description does not contain the literal string "AGENTS.md" except in contexts where the agent is reading the user's own AGENTS.md (which is fine — evidence confirms).

**Trade-off:** Slightly heavier acceptance criterion on FR2. Zero runtime cost.

**Status:** CHALLENGED
**Suggested resolution:** Fold the init-content:43 correction into FR2 acceptance criteria or add a dedicated FR ("FR2a. MCP tool descriptions do not claim `.open-knowledge/AGENTS.md` exists after migration"). Current §16 SCOPE phrasing leaves this as implementer-discretion.

---

## Low Severity

### [L] Finding 8: G5 "cross-host portability" claim conflates "one skill works" with "one install reaches all hosts"

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §2 G5, §5 user-journey interaction-state matrix

**Issue:** G5 states: "Skill content works on Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf with at most two symlinks off a canonical `~/.agents/skills/open-knowledge/` location." The "two symlinks" framing is a vestige of Alt E (§9), which D4 superseded with `npx skills --copy` — which, per the evidence file, is "non-interactive forces `--copy`" and therefore does NOT use symlinks at all. So G5's "at most two symlinks" language contradicts D4's implementation.

**Current design:** G5 language still references two symlinks; D4 actually creates N copies (27 per Vercel Labs, 45+ per the fetched README).

**Alternative:** Reword G5 to "skill content is readable by all six supported hosts after `ok init`" without the symlink-count framing. The symlink vs copy detail is an implementation concern, not a goal.

**Trade-off:** None — it's a wording fix.

**Status:** CHALLENGED
**Suggested resolution:** Clean up G5 text in a spec edit pass.

---

### [L] Finding 9: Intersection of D2 (zero project writes) is not challenged by a "principled exception"

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §2 G1 (invariant), §10 D2 (LOCKED), §10 D3 (no migration)

**Issue:** D2 LOCKED zero project-root writes; D3 LOCKED leave-legacy-injections-alone. Together they leave existing OK users in a state where the on-disk AGENTS.md / CLAUDE.md will increasingly drift from the canonical skill body. The spec has no principled exception for one conservative breadcrumb: e.g., a one-line addition like "This repo uses Open Knowledge; MCP instructions live in the server handshake" written only if the file doesn't exist yet, behind an explicit opt-in flag.

The research report's D5 section ("minimal anchor patterns") explicitly dismisses the "one-liner in user's AGENTS.md" pattern, and Alt B in §9 rejects it. The challenge: is there a **one-liner breadcrumb behind an explicit flag** (like today's `--no-root-instructions` in reverse, e.g. `--add-breadcrumb`) that is ergonomic and respects user autonomy?

**Current design:** Zero root writes, zero exceptions. `.open-knowledge/config.yml` is the only survival path for project-level OK metadata.

**Alternative:** Keep G1 as the default but ship a single opt-in flag (`--with-repo-breadcrumb`) that writes one line to AGENTS.md if-missing only. Costs nothing to maintain; users who want it turn it on.

**Trade-off:** Goes against the spirit of G1 (it becomes "zero writes by default"). Adds one code path. OSS-maintainer persona P1 (explicitly named) almost certainly won't enable it.

**Status:** CHALLENGED
**Suggested resolution:** Defer — this is minor and D2's rationale (user asked for zero pollution) is solid. Noted as low-severity challenge only to surface that "zero" is slightly stronger than "user-respectful."

---

### [L] Finding 10: `ok init --dry-run` is tagged "Should" but doesn't exist today — implementation complexity is unknown

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — operability)
**Location:** §6 FR11

**Issue:** FR11 ("Should. `ok init --dry-run` previews all filesystem writes") is conditioned on "existing dry-run flag (if any) extended to cover skill install" — but the spec doesn't verify whether the flag exists. Grep of the spec's cited files shows `options.force`, `options.rootInstructions` but no mention of a dry-run flag. If the flag doesn't exist, FR11 is actually a "Must implement dry-run AND extend it to skill install" — a meaningfully larger scope than the "Should" tag suggests.

**Current design:** FR11 punts to "Defer to Future Work if dry-run flag doesn't exist yet."

**Alternative:** Verify before finalization; either confirm the flag exists (reclassify as real Should), or promote to Future Work / Identified tier with explicit rationale.

**Trade-off:** None — it's a pre-finalization verification step.

**Status:** CHALLENGED
**Suggested resolution:** During implementation, a two-minute grep answers this. Pre-commit to one outcome.

---

## Confirmed Design Choices (summary)

**DC1 — Simpler alternative (mixed):**
- FR1 (delete `upsertRootInstructions`) — simple, well-scoped, no alternative worth raising
- FR2 (drop .open-knowledge/AGENTS.md) — verified by grep; it's a doc artifact nothing reads, clean to drop
- FR3 (≤ 1500 byte instructions) — the evidence-backed 24KB → 1.5KB compression case is strong; size-cap unit test is correct discipline
- FR8 (legacy-injection non-interference) — no simpler alternative; fixture-test pattern is right
- Alt A (pure deletion) rejection under the current framing holds IF Surface 2 (per-tool descriptions) is not counted — see Finding 3 for the challenge

**DC2 — Stakeholder gap:**
- G1 invariant (zero project-root writes) is well-tested via §7 M1 (integration-test on `git status` after init) — SRE/security lens passes
- Non-fatal failure mode for `installUserSkill` (D6) is the right default — operability lens passes
- Test-isolation via `options.home` subprocess env (D15) reuses established pattern — customer-facing engineer wouldn't flag

**DC3 — Framing validity:**
- The Complication holds: "OSS maintainers find project-file writes invasive" + "ecosystem outlier status" + "Agent Skills consolidation on the horizon" are three genuinely interacting pressures. Removing any one dimension (e.g., "ecosystem outlier") would still leave the core user-ask intact. Intersection claim is real, not post-hoc.
- The Resolution follows logically — but is load-bearing on Finding 1 (`paths:` auto-activation) and Finding 2 (Claude Desktop coverage). If both fall, the proposed three-surface design still works; it just provides weaker coverage than the spec currently claims.
