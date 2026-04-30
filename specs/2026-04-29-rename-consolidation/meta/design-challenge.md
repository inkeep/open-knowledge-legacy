# Design Challenge Findings

**Artifact:** `specs/2026-04-29-rename-consolidation/SPEC.md`
**Challenge date:** 2026-04-29
**Total findings:** 9 (3 high, 4 medium, 2 low)

The spec is well-investigated and the resolved decisions are largely defensible. This file surfaces nine concerns where the spec's rationale either does not address a credible alternative, has subtle gaps, or carries hidden assumptions that should be made explicit before implementation. The bundle thesis (DC1) and the principal-fallback semantics (D-A1, especially the precedence rule D-A8) attract the highest-severity challenges.

---

## High Severity

### [H] Finding 1: D-A8 silently demotes the loaded principal under MCP — UI vs MCP timeline asymmetry never gets surfaced

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer / end user)
**Location:** §10 D-A8, §6 FR5, §1 Resolution, §9 Architecture overview
**Issue:** D-A8 says "body `agentId` (when present) takes precedence over server-side `getPrincipal()` fallback." The rationale in §10 says "the agent identity is the more specific actor in the call chain" and assumes the only conflict is "body-agent vs server-principal-fallback." But this overlooks the **co-actor case**: an MCP agent on the same machine as a logged-in human principal. Today's `buildAgentActor()` already attaches `principalId` to the agent's `actor` metadata for normal writes (`api-extension.ts:1323`). On rename, after this spec ships:

- UI rename → contributor entry with writerId `principal-<UUID>`, displayName "Miles" → timeline shows "Miles renamed X → Y."
- Agent (MCP) rename, while Miles is logged in → contributor entry with writerId `agent-<connId>`, displayName "Claude" → timeline shows "Claude renamed X → Y."

The principal that actually invoked the agent is now **invisible** for renames, even though `buildAgentActor()` would otherwise attach `principalId` as actor metadata so the UI can show a "Claude (on behalf of Miles)" hover state. The spec preserves the agent label but **discards** the principal context that the existing `actor` field carries.

**Current design:** "body `agentId` (when present) takes precedence over server-side `getPrincipal()` fallback."
**Alternative:** Extend `extractActorIdentity` so that even when `agentId` is present, the contributor entry's `actor` metadata still receives `principalId` from `getPrincipal()` — this is the path `buildAgentActor` already takes for normal writes. The writer ID stays `agent-<connId>` (rename-as-agent semantics preserved), but the audit trail still records who's logged in.
**Trade-off:** Gain: timeline can render "Claude renamed X (on behalf of Miles)" symmetrically with normal writes. No new fields. Cost: nothing — `actor.principalId` is already populated for non-rename writes; this just removes a divergence.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine D-A8 with the existing `buildAgentActor` precedent in mind. The "agent wins" framing applies to writer ID (one entry per writer is correct), but the actor-metadata principal context shouldn't be dropped. Add this to `extractActorIdentity`'s contract or document why renames specifically should drop principalId from actor metadata when `getPrincipal()` is also non-null.

---

### [H] Finding 2: D-A2 side-effect anonymity preserves the wrong invariant — anonymizing principal-driven backlink rewrites loses information the user wants

**Category:** DESIGN
**Source:** DC3 (framing validity) + DC2 (stakeholder gap — end user)
**Location:** §3 NG8, §10 D-A2, §6 FR7
**Issue:** The spec preserves the existing "side-effect docs stay anonymous" carve-out from D22, citing it as a "carve-out preserved" without re-examining whether the carve-out's rationale survives the principal-attribution amendment. The original D22 carve-out's stated motivation was: prevent "Claude edited 47 docs" timeline noise on every popular doc rename. That made sense when the agent was an unattended bot pumping summaries through.

But for principal-driven UI renames, the anonymity has a different cost: **the user has no record that they're the one who caused the change to those 47 docs.** When Miles clicks "rename `articles/auth` → `essays/auth`" in FileTree, every doc that linked to it gets rewritten; today and post-spec, those 47 docs each show a phantom edit on their timeline with no contributor. From Miles's perspective (the very user whose UX gap the spec sets out to fix in G3), the timeline tells him "something happened here, but no one did it" — strictly worse than today's "an agent did it" because today there's at least *some* actor.

The spec's "Miles renamed 47 docs" framing as "noise" inherits an agent-bot aesthetic, not a principal-driven one. A user typically *does* want to see what their own actions affected. (Compare: `git log` shows the author of the rename commit on every affected file — universal expectation.)

**Current design:** "Side-effect docs from a principal-driven rename remain anonymous. Backlink-rewrite cascades use `defaultWriter` (anonymous), not the principal."
**Alternative:** Diverge from the agent carve-out. For agent-driven renames, side-effect anonymity stays (high-volume MCP scenarios). For principal-driven renames, side-effect docs ARE attributed to the principal — Miles's identity carries to all 47 docs. This is symmetric with how `git log` and shadow commits already attribute the principal's WS-driven writes.
**Trade-off:** Gain: timeline gives the user a real audit trail of "what I caused" — directly supports G3's stated value. Cost: timeline busier on big rename events, but the timeline scope filter is already a known follow-up (NG2). The 47-bullet fan-out only happens on actual rename events, not routine writes.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine D-A2's symmetry argument. The agent and principal cases have different UX expectations. Either (a) flip D-A2 to attribute principal-driven side-effects, (b) make it a config flag, or (c) keep the anonymity but explicitly document that this is a deliberate choice that **disables** the user's audit trail for the most common write surface (UI rename), and explain why that cost is acceptable.

---

### [H] Finding 3: The bundle thesis (DC1) — Option A vs Option B rejection is not load-bearing enough

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §9 Alternatives considered (Option A vs B), §1 Resolution
**Issue:** Option B (three separate specs) is rejected with: "the spine consolidation is a prerequisite for both the folder rewrite and the principal attribution wiring (D22 amendment touches the same handlers). Sequential specs would force temporary half-states or scaffolding."

This rationale conflates two independent claims:

1. **Folder-rewrite needs the spine consolidation.** TRUE — to fix folder rename's link-rewrite gap, you need the spine reachable from the folder branch.
2. **Principal attribution needs the spine consolidation.** FALSE — `extractActorIdentity` is a 30-line helper at the handler boundary. It works fine on the un-consolidated `/api/rename` and `/api/rename-path` independently. There is no load-bearing dependency between the D22 amendment and the rewrite-spine lift.

The rollback symmetry (D-A10) reinforces this: `handleRollback` doesn't touch the rewrite spine at all, yet the spec correctly extends D22-A to it. So "principal attribution requires consolidation" is empirically false within this very spec.

If un-bundled:
- **Spec A (principal attribution):** ~150 LOC, server-side only, no UI changes, no schema migration. 1-2 day implementation. Tests for `extractActorIdentity` + symmetry across both rename and rollback handlers. **High user value, low risk.**
- **Spec B (consolidation + folder link-rewrite + journal v2 + MCP rename_folder):** the architectural rework. The risky one (test coverage of the lifted spine, journal v2 migration, MCP API design).

The spec's own risk table (§14) flags "Lifted rewrite spine introduces regressions in `/api/rename` semantics" as M-likelihood, H-impact. Bundling means the principal-attribution win rides on the back of the riskier consolidation.

**Current design:** Option A — "Bundle three improvements in one spec ... bundling because all three depend on or reinforce the consolidated spine."
**Alternative:** Ship D22-A (principal attribution + rollback symmetry) as a standalone first PR. Then the consolidation + folder link-rewrite + journal v2 + MCP `rename_folder` as a second. Both ship in lockstep PRs over a few days; no half-states because the principal-attribution change is purely additive at the server boundary.
**Trade-off:** Gain: principal attribution lands in days, not weeks; reverting/iterating either piece is simpler. Cost: two PRs instead of one, slight rebase overhead.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine the bundle-vs-separate trade-off. The "all three depend on the spine" claim doesn't hold once you trace the actual dependencies. The user-visible win (G3 "Miles renamed X" in timeline) is the cheapest of the three changes; bundling slows it behind the riskiest. Consider splitting at minimum into "principal attribution" (now) and "consolidation + folder + journal v2 + MCP" (next).

---

## Medium Severity

### [M] Finding 4: D-A11 + Spec §9 Auth/permissions claim future-proofing, but the actual multi-principal migration is harder than the spec suggests

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — security engineer)
**Location:** §10 D-A11, §9 Auth/permissions, evidence/oq-7-principal-trust-boundary.md
**Issue:** D-A11 cites "future-proofs for multi-principal: `getPrincipal()` becomes session-aware without changing handler call sites" as the reason to reject body-supplied `principalId`. The evidence file says the same. But this future-proofing claim is partial:

The spec says `getPrincipal()` would "become session-aware" — but `getPrincipal()` today takes **no arguments** (`packages/server/src/api-extension.ts:1323` — `getPrincipal?.()?.id`). A session-aware version requires passing the request object (or a session resolved from it) into every call site. That's not "no call-site change" — that's threading a new parameter through `extractActorIdentity` → handler → potentially through `_performManagedRename` if the spine grows actor awareness.

A more honest framing: today's call sites are wrong-shape for multi-principal regardless of where principalId comes from. The body-trust rejection isn't *worse* than alternatives, but the future-proofing rationale is a wash. The real reason to reject body-supplied `principalId` is simpler: today there's no auth, so any body-supplied principal is forgeable. That's load-bearing on its own; the future-proofing argument adds nothing.

**Current design:** "Future-proofs for multi-principal: `getPrincipal()` becomes session-aware without changing handler call sites."
**Alternative:** Same decision (don't trust body), different rationale. Drop the future-proofing claim; lean on "today's HTTP boundary is unauthenticated, body cannot be trusted." Document that multi-principal will require session threading through call sites regardless. Don't oversell what the current pattern buys for the future.
**Trade-off:** Gain: honest spec; later spec authors won't be surprised when multi-principal turns out to require call-site changes anyway. Cost: one less reason to point at when defending D-A11.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine the future-proofing claim in D-A11 and oq-7-principal-trust-boundary.md. Soften or remove it. Lean on the "body is unauthenticated" justification — it's sufficient on its own.

---

### [M] Finding 5: D-A9 rename-map single-pass — three concrete edge cases not addressed

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — implementer / SRE)
**Location:** §10 D-A9, §6 FR3
**Issue:** D-A9 specifies a rename-map single-pass algorithm and resolves OQ-2 with "avoids double-rewriting because rewrite is text replacement against the full map, not iterative re-scan." This is correct for the basic case but doesn't address three cases that surface naturally in real folder renames:

1. **Case-only renames on case-insensitive filesystems** (macOS APFS default, Windows NTFS default). Renaming `Articles/` → `articles/` resolves both source and destination to the same `realpath` — `existsSync(destinationPath)` returns true and the spec's 409 "Destination already exists" check would block the rename. The S1 path has the same gap today; it's not new. But folder rename is more visible because users casually re-case folder names. **The rename-map algorithm itself works fine** on the data, but the API boundary stops the operation before the algorithm runs. Spec needs to either acknowledge this as out of scope or solve it (case-conflict detection + git-aware atomic two-step rename).

2. **Cross-collision where two rename maps would conflict.** Rename `A/` → `B/` while a sibling doc `B/foo.md` already exists at the destination. The spec checks `existsSync(destinationPath)` for the folder root, but the `affectedDocs[]` map can land on existing files outside the moved folder. Today's S3 path doesn't catch this either; it's silently overwriting. The shared spine should detect collisions at journal-build time and 409 early.

3. **Reverse-rename in the same operation:** `articles/auth.md` → `essays/auth.md` AND `essays/auth.md` (existing) → `articles/auth.md` in one logical "swap." This is theoretically reachable if the future-work folder rename UX ever offers a swap operation, but more pressingly: **a single-pass algorithm on the snapshot map produces undefined behavior on a swap** because `applyRename({A:B, B:A})` against pre-rename contents replaces all literal `A` with `B` first, then all `B` (now including the just-rewritten ones) with `A`. Order of map iteration matters. The spec says "apply ALL substitutions in one pass against pre-rename snapshots" — but a single-pass *substitution string* algorithm that handles a cycle correctly requires either a placeholder-substitute trick or a topological-sort-then-rewrite. Worth pinning by test even if unreachable today.

**Current design:** "Apply ALL substitutions in one pass against pre-rename snapshots ... avoids double-rewriting because rewrite is text replacement against the full map, not iterative re-scan."
**Alternative:** Extend D-A9 with explicit handling: (1) define case-only rename behavior (probably 400 with an explicit error message; this is a separate spec); (2) require collision detection at journal-build time, return 409 with the specific colliding paths; (3) require the helper to use placeholder-substitution (e.g., assign each old-name a UUID, replace old → UUID, then UUID → new) so cycles work — or at minimum a unit test pinning that swap-cycles produce the expected output.
**Trade-off:** More test surface, slightly more code. Without it, partial rename-map collisions silently overwrite or produce wrong link-rewrite output, both of which are content-loss-class bugs.
**Status:** CHALLENGED
**Suggested resolution:** Add a sub-section under D-A9 enumerating these three cases with explicit guidance: case-only (out of scope, 400), collision (409 at journal-build), cycles (placeholder-substitute or topo-sort, with a test). Even if all three are deferred, surfacing them in the spec makes the implementer's choice visible.

---

### [M] Finding 6: D-A7 single folder-level summary — the UX claim isn't tested for a 50-doc folder

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — end user) + DC3 (framing validity)
**Location:** §10 D-A7, §5 P2 happy path
**Issue:** D-A7 chose "one folder rename = one user intent. Per-doc summaries would force the agent to fabricate N summaries." The reasoning is sound for the agent's authoring side. But the consumer side — the user reading the timeline — is unexamined.

If Miles renames `articles/` → `essays/` (50 docs), and an agent did the same earlier with summary `"Reorganized taxonomy"`:
- Doc X's timeline shows: "Claude renamed articles/X → essays/X — Reorganized taxonomy"
- Doc Y's timeline shows: "Claude renamed articles/Y → essays/Y — Reorganized taxonomy"
- ... 48 more times.

The summary "Reorganized taxonomy" is a folder-level reason. Reading it on every individual doc's timeline is **redundant** — the rename subject (`articles/X → essays/X`) already conveys the file-level fact, so the bullet adds no per-doc context. It's literally the same string 50 times.

There are three plausible UX models:
- **Folder summary on every doc** (chosen). Redundant but informative.
- **Folder summary on a "folder rename event" timeline entry, not per-doc.** Requires a new timeline entity (folder rename group) — out of scope.
- **No summary on per-doc timeline; summary only available on hover/group view of the rename.** Compromise — keeps the rename subject but defers summary to a denser surface.

The spec picks option 1 by default without weighing the tradeoff. For agents writing summaries, the "force agent to fabricate N summaries" cost dominates. For users reading the timeline of one doc to understand its history, the redundancy creates a "TLDR collapse" cost.

**Current design:** "Single folder-level summary, applied to every affected-doc contributor entry."
**Alternative:** Same write semantics (one summary on input), but the timeline rendering surfaces it as a single "rename: articles/ → essays/ (Reorganized taxonomy)" marker per-doc rather than a per-doc bullet. Or: store summary on the rename event itself in the journal v2; render-time joins. Or accept the redundancy as a deliberate trade-off but document why N=50 of the same string is not a UX concern.
**Trade-off:** Gain: cleaner per-doc timeline. Cost: requires either a UI change or a new schema entity (rename event), pulling in NG-class work.
**Status:** CHALLENGED
**Suggested resolution:** Acknowledge the per-doc redundancy in D-A7's rationale. If the spec is okay with the redundancy, say so and explain why (e.g., "the only alternative is a UI change that's deferred to NG-X"). If not, expand scope or defer the MCP `rename_folder` summary feature to a follow-up.

---

### [M] Finding 7: Folder rename to non-existent folder (auto-create) is not specified

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — implementer)
**Location:** §6 FR3, §9 P1 happy path, §9 API/transport
**Issue:** The spec assumes both `fromPath` and `toPath` exist (or don't) at the API boundary — `existsSync(sourcePath)` 404s if source missing, `existsSync(destinationPath)` 409s if destination already exists. But there's a third case: **destination's parent doesn't exist**. Renaming `articles/` → `2026/essays/` where `2026/` doesn't yet exist on disk.

For a file rename, today's `_performManagedRename` does `mkdirSync(dirname(destinationPath), { recursive: true })` (api-extension.ts:1199). For folder rename via S3, the same `mkdirSync` is in the `applyRename` block (api-extension.ts:4035). So today, auto-create works.

But the consolidated rewrite spine the spec proposes might not preserve this. The spec specifies the input contract but not the auto-create behavior. If the implementer's "lifted spine" wraps the rename in a single block that requires the destination parent to exist, it'd silently regress today's UX. Conversely, if it preserves auto-create, that needs to be in the spec so it doesn't get lost in the lift.

**Current design:** Not specified in §6 or §9.
**Alternative:** Add to §6 FR3 / FR4: "Destination parent directory is auto-created with `mkdirSync({ recursive: true })`" as it is today. Also clarify whether case-only renames on case-insensitive filesystems are supported (intersects Finding 5).
**Trade-off:** Cost: a few lines in the spec. Gain: implementer doesn't have to guess.
**Status:** CHALLENGED
**Suggested resolution:** Add an FR or NFR pinning the auto-create behavior so the lift doesn't silently regress.

---

## Low Severity

### [L] Finding 8: D-A5 dropping `kind` field in journal — no real cost, but the rationale's logic is shaky

**Category:** DESIGN
**Source:** DC1 (simpler alternative — minimal counter)
**Location:** §10 D-A5, §9 Data model
**Issue:** D-A5's rationale: "kind is derivable but unreliably so (a 1-file folder rename is indistinguishable from a file rename by length); since recovery doesn't care, drop the redundancy." This is fine in isolation, but the rationale is logically backwards: "indistinguishable by length" is an argument *for* including `kind` (so distinguishability is restored), not against. The actual reason to drop it (recovery doesn't need it) is buried.

For future schema needs — observability dashboards distinguishing rename volumes by kind, retry semantics that differ for files vs folders, debugging "what was happening when this crashed" — `kind` is cheap to keep (one extra string per journal). The spec's "we don't need it now" reasoning is fine, but framing it as "kind is unreliable" makes future readers think recovery considered it and rejected it on correctness grounds, when the actual rejection is "minimalism."

**Current design:** "kind is intentionally absent — recovery doesn't need it, and a 1-file folder rename would be indistinguishable from a file rename by `affectedDocs.length` anyway."
**Alternative:** Same outcome. Reframe rationale: "kind is intentionally absent; recovery doesn't need it. If observability ever needs kind, a v3 schema bump adds it cheaply."
**Trade-off:** None — pure framing. Reduces future spec-reader confusion.
**Status:** CHALLENGED
**Suggested resolution:** Edit D-A5's rationale to lead with "recovery doesn't care" rather than "indistinguishable from file rename by length," which sounds like a correctness argument when it isn't.

---

### [L] Finding 9: D-A3 atomic deletion — Open Knowledge MCP is published as `@inkeep/open-knowledge`; external clients embedding the rename endpoint exist by definition

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (stakeholder gap — customer-facing engineer)
**Location:** §10 D-A3, §9 Alternatives Option D
**Issue:** D-A3 says "both callers in this monorepo; CLAUDE.md 'don't add backward-compat shims' applies." But `@inkeep/open-knowledge` is a published npm package. The MCP `rename_document` tool's HTTP call is encapsulated in `packages/cli/src/mcp/tools/rename-document.ts` and only consumed via the published CLI's MCP stdio layer. Verified: no external `fetch('/api/rename')` callers reachable from outside the monorepo via this package's public API.

So D-A3's "both callers in this monorepo" claim is correct *for the published package*. But the claim is undersold: `/api/rename` is a server-side HTTP endpoint exposed on `localhost:<port>` of the running OK server. **Anything else in the user's process — extensions, browser extensions, custom integrations, scripts — that hits `localhost:<port>/api/rename` will 404 after this change.** This isn't theoretical — it's what server-internal HTTP endpoints invite. The CLAUDE.md "no backward-compat shims" rule was written for code-level migrations, not for HTTP endpoints that are technically reachable from anywhere on localhost.

**Current design:** "Both callers in this monorepo; CLAUDE.md 'don't add backward-compat shims' applies. No deprecation window."
**Alternative:** Keep `/api/rename` as a thin shim that 308-redirects (or proxies) to `/api/rename-path` with `kind: 'file'` for one minor version, then delete in the next. Or document explicitly in the published changelog that any external `localhost:<port>/api/rename` usage will break.
**Trade-off:** Gain: graceful migration for any user-side scripting. Cost: ~10 LOC shim, one extra release cycle to delete. Acceptable in either direction; a shim isn't free but is cheap.
**Status:** CHALLENGED
**Suggested resolution:** Note the localhost-HTTP exposure in D-A3 and either (a) accept the breakage with an explicit changelog note, or (b) keep a deprecation shim for one minor version. Don't lean on "both callers in this monorepo" alone — it's true but elides the localhost surface.

---

## Confirmed Design Choices (summary)

The following design decisions held up under DC1/DC2/DC3 scrutiny:

**DC1 (simpler alternative):**
- The spine consolidation + lift-into-shared-helper (D-A4) is the right minimal move; no simpler alternative meets G5.
- Single endpoint with `kind` discriminator (FR1) over two parallel endpoints — the spec's choice cleanly removes the maintenance hazard.
- New MCP `rename_folder` tool (FR8, D-A6) over forcing N file-rename loops — the per-call attribution and atomicity wins justify the new tool.

**DC2 (stakeholder gap):**
- Recovery journal v2 covering folder rename (FR4, D-A5) — addresses the SRE concern that S3 had no crash-safety today.
- Symmetric extension to `handleRollback` (D-A10) — without it, today's "agent rollback attributed but UI rollback anonymous" gets strictly worse. The spec correctly identifies this.
- Side-effect docs anonymity for **agent**-driven renames (D-A2 partial) — preserves the original D22 rationale for high-volume MCP scenarios.

**DC3 (framing validity):**
- The Complication's five compounding issues hold up. Each is independently real (verified against world model and code), and each has the load-bearing dependency the spec claims (folder link-rewrite needs spine; principal attribution unblocks G3; consolidation removes maintenance hazard).
- The intersection between attribution and consolidation is tighter than the bundle thesis (Finding 3) suggests for **rename**, but the rollback symmetry argument (D-A10) is genuine — if the rewrite spine is consolidated, the rollback symmetry naturally rides along.
- D-A1 supersession of D22 (vs in-place edit) is the correct choice — avoids rewriting shipped spec text per the post-ship corrigendum protocol.

**Already-rejected alternatives that hold:**
- NG3 stable-ID linking — correctly rejected as a one-way migration with worse authoring UX. The cited industry references (AnyType) confirm this isn't free.
- Option C in §9 — same as NG3.
- Option D (deprecation window) — Finding 9 challenges the rationale slightly but ultimately the deletion is reasonable; the challenge is about the framing, not the conclusion.
