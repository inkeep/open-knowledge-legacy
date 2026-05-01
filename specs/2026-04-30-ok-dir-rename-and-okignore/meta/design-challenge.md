---
name: design-challenge
description: Cold-reader design challenges for the .ok/ rename + .okignore spec
type: meta
date: 2026-04-30
sources:
  - SPEC.md
  - evidence/
challenger: general-purpose-subagent (cold-reader)
---

# Design Challenge Findings

**Artifact:** `specs/2026-04-30-ok-dir-rename-and-okignore/SPEC.md`
**Challenge date:** 2026-04-30
**Total findings:** 8 (2 H, 4 M, 2 L)

---

## Executive summary

- **Spec is broadly sound.** Decisions D1-D9 are coherent, evidence-backed, and the gitignore-faithful semantic choice (D2) is structurally well-grounded. The bundling of the rename + `.okignore` lift is defensible given the user's pre-release license and shared "name alignment" theme.
- **Two high-severity holes worth surfacing.** (1) The user-home rename (`~/.open-knowledge/` → `~/.ok/`) creates a real auth/credential disruption for the dogfood team that the spec acknowledges (Q20) but characterizes too lightly given commit `48d4218`'s shipped-shim precedent. (2) FR3's adopt-detection scope appears to overlook **`token-store.ts:85`**, which hardcodes `'.open-knowledge'` for the user-home auth path — neither routed through OK_DIR nor present in the FR5 server-src list. This is a "first-time-encounter" path on par with adopt-detection.
- **Mid-severity scope-bundling concern.** D6 (systematic OK_DIR pass for 16 server-src sites) genuinely inflates a rename PR with refactor work. The spec's own Risk row acknowledges "PR review burden" but doesn't ask whether the refactor could be a fast-follow PR with `git grep` regression tests as the connective tissue. The split would not weaken the rename.
- **The "rename without lift" wedge was not evaluated.** Spec §9 enumerates four alternatives (A-D) but none is the narrowest wedge: **lift `content.include`/`exclude` into `.okignore` without renaming the directory.** This is a much smaller blast-radius PR; the directory rename can come later. Rejection-by-intake is not the same as rejection-by-evaluation.
- **Single-field Settings section is a UI smell, not just a single decision.** D5 keeps the section. A cold reader notices the asymmetry — every other Settings section has multiple fields. The question of *where `content.dir` should live* (as opposed to *whether to keep showing it*) was not surfaced.

---

## High Severity

### [H] Finding 1: FR3/FR5 missed `~/.open-knowledge/` callsites that hardcode the literal — token-store.ts is the load-bearing gap

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — future maintainer / SRE perspective)
**Location:** SPEC.md §6 FR3, FR5; §11 Q20; evidence/_init_worldmodel.md §1.B
**Issue:** FR5's grep target (`git grep -E "'\.open-knowledge'" -- packages/server/src`) and FR3's adopt-detection update both scope to *server* paths or the project-local `.ok/` rename. But the user-home rename also breaks paths in `packages/cli/src/auth/`. Specifically:

```
packages/cli/src/auth/token-store.ts:85
  this.authFile = authFile ?? join(homedir(), '.open-knowledge', 'auth.yml');
```

This is a **string literal**, NOT routed through `OK_DIR`. It's not in `packages/server/src/`, so FR5's grep scope misses it. The FR5 acceptance criterion (`packages/server/src` zero-hits) would pass while `~/.open-knowledge/auth.yml` continues to be the path read for credentials post-rename — a silent credential-lookup divergence that would only surface on the dogfood team's first re-auth.

The same pattern likely exists for `mcp-status.json`, `stats.jsonl`, and `skill-installed-version` per evidence/_init_worldmodel.md §1.B. The spec mentions `MCP_STATUS_DIR_NAME = '.open-knowledge'` and `STATS_FILE_RELATIVE_PATH = ['.open-knowledge', 'stats.jsonl']` as user-home sites but does NOT list them in FR5 alongside the server-src sites.

**Current design:** "FR5 ... `git grep -E "'\.open-knowledge'" -- packages/server/src` returns zero" — and "FR3 adopt-detection logic in `state-manifest.ts` is updated to check both `.ok/` AND `.git/ok/`."
**Alternative:** Broaden FR5's grep scope to the entire monorepo (excluding tests + historical docs), AND add an explicit FR for routing user-home path constructors (`auth/token-store.ts:85`, desktop `mcp-wiring.ts`, `ipc-handlers.ts`, server `skill-install.ts`) through `OK_DIR` in the same PR. Adopt-detection (FR3) is not the only "first-time-encounter" path.
**Trade-off:** Slightly larger FR5 footprint and possibly a few more files in D6's systematic-pass list. Without it: silent credential-lookup divergence and re-prompt for the dogfood team is masked as "expected re-prompt" when it's actually two separate breaks (intentional re-prompt + missed-rename callsite still pointing at `.open-knowledge`).
**Status:** CHALLENGED
**Suggested resolution:** Extend FR5's grep coverage to `packages/cli/src`, `packages/desktop/src`, and `packages/server/src/skill-install.ts`. Add explicit acceptance: `git grep -E "['\"]\.open-knowledge['\"]" -- packages/` returns zero across all packages. Reframe Q20 from "expected re-prompt" to "expected re-prompt **and** all user-home path constructors confirmed flipped."

---

### [H] Finding 2: D3 hard cutover ignores the closest-precedent (commit `48d4218`) shipped a shim — and that precedent specifically covered per-machine durable directory rename

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) / DC3 (Framing validity — pre-release license is invoked but the precedent contradicts)
**Location:** SPEC.md §10 D3, §13 Deployment, §14 Risks; evidence/_init_worldmodel.md §5 Pattern
**Issue:** The spec's D3 rationale rests on user direction ("greenfield project, no legacy code"). But the spec itself notes (evidence §5, current state §8) that the **closest** precedent for this exact class of change — per-machine durable directory rename — DID ship a `renameSync` shim (commit `48d4218`, `.git/openknowledge/` → `.git/open-knowledge/`). PRs #399 and #392 are not the right precedents because they're code/wire-format renames, not durable on-disk-state renames.

The spec acknowledges this asymmetrically: it cites #399 + #392 as supporting hard cutover but only mentions `48d4218`'s shim in evidence as "going against the user's hard-cutover direction." It doesn't ask: **what changed between `48d4218` and now that justifies dropping the shim pattern?** The codebase is no more pre-release today than it was when `48d4218` shipped.

A 30-line `renameSync(legacyPath, newPath)` shim at boot, deleted in a fast-follow PR, would:
- Preserve dogfood credentials at `~/.open-knowledge/auth.yml` (one less re-auth)
- Preserve shadow repos at `.git/open-knowledge/` (no orphan dir cleanup)
- Cost roughly the same review effort as Q20's "document re-prompt in PR description"

This is materially less disruptive than D3's "hard cutover documented in PR description." User direction is real, but the design challenge per protocol is: **does the rejection rationale hold under cold scrutiny?** "Pre-release" is a license, not a forcing function.

**Current design:** "Hard cutover. No migrator code, no legacy `.open-knowledge/` reader, no transitional period."
**Alternative:** Bounded-lifetime `renameSync` shim at boot for both `~/.open-knowledge/` and `.git/open-knowledge/` paths, identical in shape to the `48d4218` precedent. Deleted in a fast-follow PR (e.g., 1-2 weeks later). Adopt-detection (FR3) checks new paths only; shim runs first.
**Trade-off:** ~30 lines of code with a known-safe pattern + a follow-up cleanup PR vs. dogfood team re-auth + manual `rm -rf .git/open-knowledge` cleanup steps. The shim is cheaper than the documentation/coordination cost.
**Status:** CHALLENGED
**Suggested resolution:** Surface to user: "The closest precedent (`48d4218`) shipped a shim for this exact class of change. The user direction was 'no migrator,' but a bounded-lifetime `renameSync` shim is functionally not a migrator — it's a one-time path lift that mirrors the `48d4218` pattern. Reaffirm hard cutover, or adopt the shim?"

---

## Medium Severity

### [M] Finding 3: D6 (systematic OK_DIR pass) bundles refactor with rename — splitting reduces review burden without weakening either

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) / Interface depth probe
**Location:** SPEC.md §6 FR5, §10 D6, §14 Risks (row 7: "OK_DIR systematic pass (D6) inflates rename PR scope beyond pure-rename — Likelihood: High (will happen)")
**Issue:** The spec's own Risk row 7 acknowledges that D6 "inflates rename PR scope" with "PR review burden." The mitigation is "commit history splits 'OK_DIR routing pass' from 'literal value flip' so the diff is reviewable in two passes." But this is intra-PR commit splitting, not PR splitting — reviewers still must engage with both halves at once.

The D6 rationale ("cleaner long-term codebase shape; single SSOT for the directory name across all packages") is sound but **temporally orthogonal** to the rename. The 16 server-src sites can be routed through `OK_DIR` as a fast-follow PR with a CI check (`git grep -E "['\"]\.open-knowledge['\"]" -- packages/server/src` returns zero) added to the rename PR. The rename PR becomes pure-rename; the consistency PR becomes pure-refactor.

The interface-depth deletion test: if you removed D6 from this PR, would the rename PR still meet G1-G4? Yes — every literal site can be flipped via `git grep | sed`-style replacement, exactly as if it were OK_DIR-routed. D6's value (cleaner SSOT) is preserved in a follow-up PR.

User direction (Q8b → systematic pass) was made when the recommendation was minimal-touch in this PR. The challenge isn't whether to do the systematic pass — it's whether to do it **bundled** vs. **fast-follow**. The latter wasn't an option presented.

**Current design:** "Pure mechanical refactor — every site does `import { OK_DIR } from '@inkeep/open-knowledge-core'` then uses the constant in `resolve(...)` / `join(...)` calls" (FR5).
**Alternative:** Rename PR flips the 16 literal sites in-place (`.open-knowledge` → `.ok` mechanical replacement) plus the OK_DIR constant value. Fast-follow PR routes the 16 sites through OK_DIR. Both PRs ship in the same week.
**Trade-off:** Two smaller diffs vs. one larger diff. Smaller diffs are reviewable independently; the consistency-pass PR is a pure refactor with no behavioral change. Cost: one extra PR + two reviews instead of one + two-pass review.
**Status:** CHALLENGED
**Suggested resolution:** Surface to user: "Q8b was framed as 'minimal-touch this PR vs. systematic this PR.' A third option exists: 'minimal-touch this PR + fast-follow refactor PR.' Worth considering given Risk row 7's acknowledgment?"

---

### [M] Finding 4: The "narrowest wedge" alternative — `.okignore` lift WITHOUT directory rename — was not evaluated in §9 Alternatives

**Category:** DESIGN
**Source:** DC1 (Simpler alternative — narrowest wedge from probe-3 stress test)
**Location:** SPEC.md §9 Alternatives considered, §1 Problem statement, §10 D3
**Issue:** §9's alternatives enumerate (A) phased PRs, (B) auto-migrator, (C) `content.include` retained alongside `.okignore`, (D) extend `.okignore` syntax. Conspicuously absent: **lift `content.include`/`exclude` into `.okignore` and defer the directory rename to a separate spec.**

This is a meaningfully different alternative because:
- The two halves of the spec address two different "users" (P1 dev cognitive load vs. P2 author config-shape friction).
- The `.okignore` lift has near-zero blast radius (one schema field removal, one walker extension, one Settings-pane field removal).
- The directory rename has wide blast radius (3,762 line-hits, 70+ source callsites, dogfood credential disruption, shadow-repo orphans).
- The two share only a thematic "name alignment" justification, not a technical dependency.

Probe-3 of the 5-probe stress test in evidence specifically flagged splitting as viable; the spec keeps them bundled "per intake seed." Bundling-by-seed is not bundling-by-evaluation.

A counterproposal: ship `.okignore` lift first (small, low-risk, immediate user value for project authors). Ship directory rename second (larger, more disruptive, higher cognitive value for the dev team). Each PR has its own decision tree, its own reviewers can specialize, and a regression in one doesn't entangle the other.

The spec's rejection (§9 alt A) covers "phased PRs" but reads them as rename-then-okignore, not okignore-then-rename. The latter is the genuinely narrower wedge — `.okignore` ships first because it's smaller AND has bounded technical dependency on the rename (the rename can pre-bake `.okignore` discovery without committing to the directory name).

**Current design:** "Both halves share the 'name alignment' theme."
**Alternative:** Two PRs, sequenced okignore-first. PR1: lift `content.include/exclude` → `.okignore`, no directory rename. PR2: rename `.open-knowledge` → `.ok` (per-project + user-home + shadow repo). PR1 is a few hundred line-hits; PR2 is a few thousand.
**Trade-off:** Two review cycles vs. one. Reviewer attention split vs. concentrated. Risk-amplification reduction (an issue in one half doesn't gate the other) vs. coordination overhead. Net: the bundled PR's main argument ("share name-alignment theme") is product-narrative; the technical case for splitting is stronger.
**Status:** CHALLENGED
**Suggested resolution:** Surface as a §9 alternative to evaluate explicitly. The rejection rationale should not be "user said bundle" — it should be "we evaluated split-by-half-then-rename and the bundling won because [evidence]."

---

### [M] Finding 5: D5's single-field Settings section is a UI smell that asks the wrong question

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — design-review / future maintainer perspective)
**Location:** SPEC.md §6 FR11, §10 D5, §9 User experience
**Issue:** The decision was framed as "keep section, single field" vs. "remove section." Both options leave a UX outcome unevaluated: **a single-field Settings section is structurally inconsistent with the rest of the Settings pane.** Every other section in `SettingsPane.tsx` has multiple fields. A single-field section reads as either "more is coming" or "this section is stuck around for legacy reasons."

The unsurfaced question: should `content.dir` move to a multi-field "Project" or "Workspace" section? It's the project-root knob; conceptually it sits next to `folders[]` (which IS multi-field and currently lives elsewhere). Or: should the Content section absorb adjacent settings (e.g., from `folders[]`) to restore multi-field parity?

The spec treats this as a 1-decision pivot (D5). A cold reader sees a 2-decision pivot: (1) what to do with the include/exclude removal, AND (2) what should the resulting Settings information architecture look like? The second question wasn't asked.

**Current design:** "Settings pane keeps the 'Content' section as a single-field section showing `content.dir` only."
**Alternative:** Either (a) merge `content.dir` into a renamed section that already has or will have other fields (e.g., "Project" with `content.dir` + `folders[]` summary), or (b) hide the section entirely since `content.dir` defaults to `'.'` and is rarely changed (DX cost is low). Option (b) trades visibility for IA consistency.
**Trade-off:** D5 is faster to ship. Either alternative requires a small Settings IA discussion. Neither blocks rename PR; both could be a fast-follow.
**Status:** CHALLENGED
**Suggested resolution:** Surface to user: "Single-field section is a known UX smell (every other Settings section has multiple fields). Worth a Settings IA decision in this PR (e.g., merge with adjacent 'Project' fields), or accept the smell and revisit in a Settings cleanup PR?"

---

### [M] Finding 6: NG6/NG7/NG8 holding while NG9 also holds creates an "OK" naming asymmetry every contributor sees daily

**Category:** DESIGN
**Source:** DC3 (Framing validity — does the goal "single user-visible name 'OK'" hold given NG9?)
**Location:** SPEC.md §3 NG9, §10 D7, G1
**Issue:** G1 states the user-visible per-project directory should be `.ok/` to align with the rest of the product surface. NG6 (bundle ID), NG7 (URL scheme), NG8 (writer-ID literal) are LOCKED out of scope on technical grounds — they're stable identifiers with breakage cost. NG9 (Codex MCP server identifier `mcp_servers.open-knowledge`) is also held — but on the basis of "user-side update cost" only. Every contributor's daily Codex usage will continue to show `open-knowledge` as the MCP server name even after the rename ships.

The NG9 rejection rationale is weaker than NG6/NG7/NG8's because:
- It's not a stable-identifier-by-design — it's a config-key user picks
- The user-side update cost is bounded (one line in `.codex/config.toml` per machine, documented in the rename PR)
- The dogfood team is already paying re-auth + shadow-repo-cleanup costs per D3 — adding "and update your `.codex/config.toml` mcp_servers key" is marginal incremental cost
- The asymmetry compounds: NG9-as-is means every Codex invocation reads `mcp_servers.open-knowledge` while every other surface reads `.ok` / `ok` — a cognitive load that the entire spec argues against

The spec's framing ("Treated as adjacent identifier rename, not directory rename") is technically accurate but elides the question: **if the goal is one user-visible name, why is NG9 held?**

**Current design:** "Renaming the Codex MCP server identifier `mcp_servers.open-knowledge` in `.codex/config.toml`. This is the user-side MCP wiring name — renaming forces users-with-Codex to update their config."
**Alternative:** Include the rename in this PR. Document in PR description: "If you use Codex with OK locally, update `.codex/config.toml` `[mcp_servers.open-knowledge]` → `[mcp_servers.ok]`." Adds one line to the dogfood team's re-onboarding checklist alongside the existing `.git/open-knowledge` cleanup line.
**Trade-off:** Slight additional dogfood-team coordination cost + the rename PR's scope grows by one line. Avoided cost: the daily friction of inconsistent naming for every contributor using Codex with OK indefinitely.
**Status:** CHALLENGED
**Suggested resolution:** Surface to user: "NG9's rejection cost (one-line per-machine config update) is marginal compared to the indefinite cost of `mcp_servers.open-knowledge` showing in every contributor's daily Codex flow. Reconsider including in this PR?"

---

## Low Severity

### [L] Finding 7: D9 (BUILTIN_SKIP_DIRS + self-ignoring `.gitignore`) — redundancy is justified but undocumented

**Category:** DESIGN
**Source:** DC1 (Simpler alternative — interface depth deletion test)
**Location:** SPEC.md §6 FR14, §10 D9
**Issue:** The spec adopts "both" — keep self-ignoring `.ok/.gitignore` AND add `'.ok'` to `BUILTIN_SKIP_DIRS`. The rationale is "self-ignoring `.gitignore` is needed for git tracking; adding to BUILTIN_SKIP_DIRS skips the walker descent entirely (perf optimization)."

These do different jobs and are both load-bearing. But the rationale conflates jobs:
- **`.ok/.gitignore`** prevents git from tracking OK-internal files (server.lock, cache/). Required for git correctness.
- **`BUILTIN_SKIP_DIRS`** prevents the content-filter walker from descending. Required for content-filter perf (avoid walking cache files at startup).

A simpler-alternative challenge: do we need BOTH if the `.gitignore` already excludes everything and the `ignore` library evaluates `.gitignore` rules during the walk? The walker DOES check the bootstrap filter (containing `.gitignore` patterns) before descending — so `.ok/` would be skipped via the gitignore route too. The perf delta between "skip via BUILTIN_SKIP_DIRS lookup" and "skip via gitignore-evaluation lookup" is small; whether it justifies redundancy is unclear from the spec.

This is low-severity because the redundancy is small (one Set entry) and protective (defensive against future changes to either system). But the spec's rationale ("Both changes are tiny") is the right outcome with the wrong reasoning — the correct reason is "they protect against different failure modes."

**Current design:** "keep the self-ignoring `.ok/.gitignore` for git's purposes AND add `'.ok'` to `BUILTIN_SKIP_DIRS` for content-filter walker performance"
**Alternative:** Document the *different* jobs explicitly in D9. Or: drop `BUILTIN_SKIP_DIRS` entry and rely on the gitignore-route skip (one fewer place to maintain when .ok/ contents change).
**Trade-off:** Minor. The current both-belt-and-suspenders is fine; it just shouldn't be defended as "tiny."
**Status:** CHALLENGED
**Suggested resolution:** Update D9 rationale to explicitly note the two jobs (git-tracking vs. content-filter perf) and confirm the gitignore-route alone is insufficient (or measurable perf delta exists).

---

### [L] Finding 8: §9's failure-modes table omits the most likely failure — a subtle `content.include` use case lost in the cutover

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — author / dogfood team)
**Location:** SPEC.md §9 Failure modes; evidence/_init_worldmodel.md §2 Production reads
**Issue:** D2's rationale is that `isSupportedDocFile()` (the `.md`/`.mdx` extension gate) is upstream and replaces `content.include`'s job. But `content.include` is a *positive* whitelist with arbitrary glob expressiveness — not just an extension filter. Two possible non-obvious uses:

1. **Subdirectory scoping:** `content.include = ['docs/**/*.md']` would *only* index markdown under `docs/`, ignoring `notes/*.md` even if not gitignored. Under pure gitignore semantics, this is expressible via `.okignore` (`!docs/`, `*` style — but per the manpage you cannot re-include inside an excluded parent, so the user must exclude everything else explicitly) or via `content.dir = './docs'` (which IS retained). The spec assumes the latter is sufficient; not all use cases collapse to that.
2. **Specific file inclusion:** `content.include = ['README.md', 'docs/**/*.md']` (arbitrary multi-pattern whitelist).

Neither use case appears in the dogfood `.open-knowledge/config.yml` (it uses defaults — confirmed by grep). But the spec hasn't surveyed whether any team member's working configurations use a non-default `content.include`. FR15's acceptance criterion ("default project shape exhibits no behavioral regression") protects the default case, not the customized case.

This is low-severity because:
- The dogfood config uses defaults
- No external installs exist (pre-release)
- Any custom config gets a clear schema-rejection error pointing at `.okignore`

But the spec characterizes D2 as "expressively complete" — which is true *for the default case* and broadly true via the gitignore re-inclusion-with-ancestor-re-include workaround, but **not** strictly equivalent. A future user wanting "include only docs/, ignore everything else markdown" gets a more verbose `.okignore` than the equivalent `content.include = ['docs/**/*.md']`.

**Current design:** "Pure gitignore semantics for `.okignore`. No 'include' whitelist; the absence of `content.include` is acceptable because `isSupportedDocFile()` already gates extensions upstream."
**Alternative:** Acknowledge in D2/§9 that `content.include`'s positive-whitelist expressiveness is a strict subset of `content.dir + .okignore`-with-exclude-everything, and the workaround is more verbose. Document this in the docs site's gitignore-syntax overview.
**Trade-off:** Documentation cost only. No design change.
**Status:** CHALLENGED
**Suggested resolution:** Add a row to §9 Failure modes: "User had a non-default `content.include` for subdirectory scoping → schema-rejection error directs to `content.dir` change OR `.okignore` with explicit exclude-everything-else."

---

## Confirmed Design Choices (summary)

The following held up under cold-reader scrutiny:

- **D1 (lockstep rename of all three `.open-knowledge` paths)** — adopt-detection invariant in `state-manifest.ts:17` makes lockstep necessary; rationale is technically required, not a preference.
- **D2 (pure gitignore semantics)** — confirmed by web-channel evidence that `node-ignore` is filename-agnostic and supports cross-source `!` negation. The expressiveness gain (cross-source override) is real. Subtle expressiveness loss is captured in Finding 8 (low severity).
- **D4 (nested `.okignore` honored)** — `.cursorignore` precedent supports it; the existing `loadNestedGitignores` walker pattern is reusable. Diverges from `.prettierignore`/`.dockerignore` but the divergence is on the side of more capability, not less.
- **D7 (Codex MCP server identifier as-is)** — challenged in Finding 6 (medium); the technical rationale (user-side config update) holds in isolation but the asymmetry argument is the load-bearing concern.
- **D8 (`ok init` scaffolds commented-header `.okignore`, committed)** — establishes the file + teaches syntax without shipping defaults that may not match. Cleanest precedent.
- **§9 §13 deployment / rollout table** — comprehensive enough; the rollout concerns are documented even if Finding 2 contests the hard-cutover choice.
- **Risk catalog (§14)** — surprisingly self-aware (Risk row 7 explicitly flags D6's PR scope inflation; row 4 flags Settings pane redesign cost). The spec doesn't hide its own concerns.

---

## Adjacent observations (cold-reader notes, not challenges)

- **The spec is unusually well-grounded in evidence.** Every D-decision cites a specific user direction date and an evidence file. This is uncommon and good.
- **Q12-Q19 "DELEGATED" resolutions** are appropriately scoped — these are mechanical itemize-at-implementation tasks, not deferred judgment calls. The labeling is honest.
- **The `evidence/_user_outcomes.md` "What the user did NOT say" section is excellent practice** — it explicitly fences off NG4/NG5 territory before the iterative loop can drift.
- **Risk row 5** ("`.okignore` semantics surprise — missing include-whitelist makes a project suddenly index unexpected files") is mitigated by `isSupportedDocFile()` upstream gate and `BUILTIN_SKIP_DIRS` floor. But the spec's own §9 failure-modes table doesn't reproduce this risk row — minor coherence gap between §14 and §9.
- **Finalization gate strength.** Once Findings 1 and 2 are resolved, this spec is implementable as-is. Findings 3-6 are surfaceable to the user but don't block.
