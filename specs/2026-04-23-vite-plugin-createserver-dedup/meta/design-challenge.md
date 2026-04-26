# Design Challenge Findings

**Artifact:** `specs/2026-04-23-vite-plugin-createserver-dedup/SPEC.md`
**Challenge date:** 2026-04-23
**Total findings:** 8 (2 high, 3 medium, 3 low)

Lenses applied:
- **DC1** — Simpler alternative
- **DC2** — Stakeholder gap (SRE / security / customer-facing-eng)
- **DC3** — Framing validity (SCR intersection, urgency, resolution→complication fit)

The spec's Decision Log rejects Options B (shared helper) and C (Vite proxy). I independently re-examined both and flag that the rejection reasoning is weaker than the Log asserts, particularly for Option B scoped more tightly than the spec considered.

---

## High Severity

### [H] Finding 1: Option B scoped to boot.ts + plugin only is plausibly simpler than Option A + copied keepalive wiring, and the rejection rationale is circular

**Category:** DESIGN
**Source:** DC1
**Location:** §3 NG2, §9 "Alternatives considered", §10 D5, §15 "Future Work — Explored", Risks R7
**Issue:** The spec rejects Option B (extract `attachCollabHttpServer`) by pairing it with test-harness migration (NG3) and citing "wider merge surface; three consumer paths all need to migrate in one PR." D5 then locks in a known **third copy** of ~150 LOC of keepalive / presence-ts / `parseKeepaliveConnectionId` / grace-timer wiring inside the plugin. The rationale for D5 is "partial extract undermines NG2's scope discipline" — i.e., we copy because we deferred the extract, and we deferred the extract because the extract is larger. This is circular: NG2's "wider scope" framing assumes it must bundle the test-harness, but nothing forces that bundling.

A narrower Option B' exists: extract `attachCollabHttpServer({ httpServer, serverInstance, keepaliveGraceMs, log })` from `boot.ts:244-396` *only*; `bootServer` and the new plugin both call it; the test harness keeps its existing copy as Future Work (NG3 unchanged). Merge surface: 2 files instead of 3, and both are sites this spec already plans to modify in spirit (the plugin post-refactor will contain the copied version; boot.ts is where the canonical version lives).

**Current design:** "**D5 LOCKED** Keepalive + presence-ts-refresh + parseKeepaliveConnectionId wiring is **copied from `boot.ts:244-396`** into the plugin rather than extracted to a shared helper in this refactor … Third copy (boot.ts + harness + plugin) is explicit tech-debt the Future Work plan owns." (§10)

**Alternative:** Option B' — extract a pure helper `attachCollabHttpServer(...)` in `packages/server/src/collab-http-attach.ts` scoped to boot.ts + plugin only. The plugin calls `attachCollabHttpServer({ httpServer: server.httpServer, serverInstance: srv, keepaliveGraceMs: 10_000, log })` inside `configureServer`. `bootServer` calls the same helper post-`listen()`. Test-harness migration stays Future Work (NG3).

**Trade-off:**
- **Gained:** One source of truth for keepalive-grace logic at the end of this spec. D5's "third copy is explicit tech-debt" disappears. Spec's stated G1 (single source of truth for server wiring) extends naturally to the HTTP-attach wiring. FR17's negative-LOC target is deeper. The spec's Metric 1 target ("0 primitives wired in both places") extends from server-side wiring to HTTP-attach wiring.
- **Lost:** boot.ts is touched (currently untouched in Option A); CLI `ok start` + Electron utility exercise the refactored extraction on day one, which shifts a production path's risk budget into this PR. Mitigation: the extract is a pure move of self-contained code (boot.ts:244-396 references only `serverInstance.sessionManager`, `agentPresenceBroadcaster`, `agentFocusBroadcaster` — all available via the helper's `serverInstance` arg), verifiable by diff + tier-1 integration test re-run.

The code in `boot.ts:244-396` is strikingly self-contained: closure variables `keepaliveGraceMs`, `keepaliveGraceTimers`, `keepaliveGraceInflight`, `shuttingDown`, `wss` all already live in a single scope that can move wholesale into the helper. A 150-LOC extract-and-delete on boot.ts, paired with the plugin's new invocation, looks comparable in merge-surface complexity to copying 150 LOC verbatim into the plugin — and the copy locks in D5's debt without time pressure.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether NG2 must bundle test-harness migration. If it doesn't, Option B' becomes the minimal wedge instead of Option A + copy. If the team still prefers the copy, document *why* the extraction cost is higher than it looks (specific risks, not scope-discipline appeals).

---

### [H] Finding 2: The SCR elevates a maintenance problem into a correctness problem without quantifying the correctness surface

**Category:** DESIGN
**Source:** DC3
**Location:** §1 Problem statement, §5 "P3 — Developer debugging external-change reconciliation" journey, §7 Metric 2
**Issue:** The Complication asserts two different kinds of pain as co-equal:
1. **Maintenance pain:** "Every new agent API endpoint has to be added in both places." (cited PRs #272, #280, multi-agent-presence follow-up). This is real and quantifiable.
2. **Correctness pain:** "A developer debugging reconciliation … is running a different code path." Illustrated by the P3 journey as silent data loss ("The browser's local edits are overwritten silently").

The Resolution ("call createServer() directly") follows from the correctness framing. But the spec supplies no evidence that the correctness surface has actually bitten a developer — §7 Metric 2 is observational, and Metric 1's baseline ("9 subsystems missing") is a structural count, not a failure count. The three cited PRs are all *maintenance* follow-ups (adding wiring), not *correctness* incidents (silent data loss, principal-auth misbehavior, unrecovered managed-rename).

If the true pain is maintenance-only, the alternative-ranking changes:
- **Option A** (chosen) lands the correctness subsystems in dev as a side effect. Good, but its justification collapses to "future-proofing against a class of bug we haven't observed."
- **Option B'** (from Finding 1) solves the maintenance pain more thoroughly at similar cost.
- **Option C** (Vite proxy) solves both pains by eliminating the second codepath entirely — its rejection on "changes dev UX" is less decisive if the current dev UX's correctness gap is speculative.

If the true pain is correctness, the spec should name an observed incident (a reconciliation bug reported in dev that reproduced under `ok start` and turned out to be a dev-mode gap). The P3 journey reads as a constructed hypothetical: "Reporter files 'reconciliation bug' that turns out to be 'dev mode doesn't run reconciliation.'" — "Reporter files" is future tense, not a cited incident.

**Current design:** "Practical consequences: … A developer debugging reconciliation, principal-auth, managed-rename recovery, or SyncEngine behavior under `bun run dev` is running a different code path than `ok start` — divergences surface as 'cannot reproduce' reports." (§1)

**Alternative:** Narrow the SCR to the maintenance framing, then re-rank alternatives on that basis. Either (a) concede the correctness argument is speculative and keep Option A on maintenance grounds alone (which weakens the "NEVER NG1 two-process dev" stance since UX considerations now dominate), or (b) cite a specific observed correctness incident that Option A's dev-inherits-everything posture would have caught.

**Trade-off:** If the framing tightens to maintenance-only, the NEVER tag on NG1 (two-process dev) becomes a judgment call, not a forced move. Option C re-enters as a credible alternative if the maintenance cost of syncing two code paths is the real driver, because `server.proxy` eliminates the second path entirely.

**Status:** CHALLENGED
**Suggested resolution:** Either cite the observed correctness incident that motivates the resolution, or tighten the Complication to the maintenance frame and revisit NG1's NEVER classification.

---

## Medium Severity

### [M] Finding 3: `ensureProjectGit` fail-fast at module load is a dev-UX regression that §15 Noted but no requirement gates

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer — here, the developer)
**Location:** §10 D8, §15 "Noted — Dev-mode `ensureProjectGit` UX polish", FR8
**Issue:** Today's plugin uses `runDevShadowInit`, which has a softer UX on `.git/` problems (the evidence explicitly calls this out: "post-refactor, `createServer()`'s `ensureProjectGit` fail-fast may produce a different error shape for a dev who deletes `.git/` mid-session"). D8 locks top-level `await ensureProjectGit(PROJECT_ROOT)` at module load — if the check fails, **Vite plugin registration throws**, and `bun run dev` exits before the dev server starts. A developer on a fresh checkout without `.git/` (common for downloaded tarballs or submodule workflows) hits a hard stop where they used to get a soft warning.

FR8 specifies "Missing `.git/` in project root fails fast with the same error shape as `ok start`" — which is correct behavior for `ok start` (a user-facing binary) but a deliberate regression for `bun run dev` (a contributor-facing dev loop). The spec flags this in §15 Noted as "UX observation only" but FR8 treats it as a must-have with parity framing. These are in tension.

**Current design:** "**D8 LOCKED** Plugin invokes `createServer()` at **module-load** … Module-load uses **top-level `await ensureProjectGit(PROJECT_ROOT)` before `createServer()`** … fail-fast via thrown `ProjectGitInitError`." (§10 D8)

**Alternative:** Either (a) catch `ProjectGitInitError` at module-load, emit a warning, and skip `createServer()` wiring (plugin registers as no-op; dev server comes up without collab; console hints "git is required for collab features — run `git init` and restart `bun run dev`"), or (b) move the `ensureProjectGit` check inside `configureServer` so the Vite dev server still boots, only the collab plugin errors loudly with a focused message.

**Trade-off:**
- **(a)** preserves graceful-degradation UX; costs the test that confirms FR8 parity with `ok start`.
- **(b)** delays failure until Vite is up; developer sees the error in the browser console or terminal warning, not a node exit.
- Option A (the spec's current answer) forces the developer to fix `.git/` before seeing any dev feedback, including Vite HMR on non-collab files.

**Status:** CHALLENGED
**Suggested resolution:** Add an explicit requirement (must or should) on dev-mode behavior when `.git/` is absent. Today's `runDevShadowInit` degradation path is load-bearing for contributor DX; the spec shouldn't silently give it up in service of "parity with ok start."

---

### [M] Finding 4: Module-load side effects leak into test contexts that import the plugin transitively without `OK_TEST_CONTENT_DIR`

**Category:** DESIGN
**Source:** DC2 (SRE / test infra engineer)
**Location:** §10 D8, evidence/lifecycle-module-load-vs-configureServer.md "ensureProjectGit ordering"
**Issue:** D8's module-load path runs `await ensureProjectGit(PROJECT_ROOT)` and then `createServer({...})` (which acquires the server lock, opens the shadow repo, starts file watchers, etc.) unless `isTestIsolated` is true. `isTestIsolated` is detected only through `process.env.OK_TEST_CONTENT_DIR`. Any test or tool that **imports the plugin module transitively** (e.g., a Vite config test, a plugin factory test, a lint or knip rule that loads it) in a process where `OK_TEST_CONTENT_DIR` is unset will trigger the full server init as a side effect of `import`.

Today's plugin does some of this at module load too (`acquireServerLock`, `new Hocuspocus`), but `createServer()` is a larger surface — shadow repo init, HEAD watcher, file watcher, SyncEngine `git remote -v`, principal load. Top-level `await` makes the import block. In a test runner that imports many plugins to inspect their factory signatures, every import pays this cost.

The spec doesn't enumerate "who imports this module" nor does it provide a `isPluginImportedForFactoryOnly` escape hatch. `OK_TEST_CONTENT_DIR` is a content-dir override, not a "please don't boot a server" signal — overloading it changes the semantics.

**Current design:** "Top-level await works natively in Bun + ESM; Vite's plugin module resolution supports async plugin modules. No config change required." (evidence/lifecycle-module-load-vs-configureServer.md)

**Alternative:** Move `createServer()` invocation inside `configureServer` (Option (b) in the evidence doc). The evidence doc rejects (b) based on HMR re-invocation concerns and concludes Vite fires `configureServer` once per process — which makes (a) and (b) equivalent in the happy path and (b) strictly safer for non-Vite import contexts. A singleton gate (`if (srv) return; srv = createServer(...)`) inside `configureServer` costs three lines.

**Trade-off:**
- **Module-load (current):** Matches today's plugin shape. Exposes server init to any module importer. Top-level await blocks the import.
- **Inside configureServer:** Defers init to Vite's lifecycle. A module import that does not start a dev server pays zero server-init cost. HMR re-invocation is a solved pattern (early-return on existing `srv`).

**Status:** CHALLENGED
**Suggested resolution:** Either justify module-load with a concrete non-Vite importer that needs init-on-import, or switch to the configureServer + singleton-gate shape. The evidence-doc's preference for (a) is "matches current plugin shape" — preservation bias, not an affirmative argument.

---

### [M] Finding 5: `principalAuthExtension` activating in dev silently changes test/agent-sim behavior that isn't characterized

**Category:** DESIGN
**Source:** DC2 (security / test-infra engineer)
**Location:** §2 G2, §6 FR3, §11 Q6 (deferred), Risks R4
**Issue:** FR3 mandates `principalAuthExtension` in dev. R4 acknowledges the risk but rates it LOW based on "principal-auth is onAuthenticate-only so untokened connections are unaffected." That framing is correct for the Hocuspocus WS path, but:

1. **Agent-sim** (`packages/app/src/server/agent-sim.ts`, referenced in CLAUDE.md commands) writes via `POST /api/agent-write-md`. Does HTTP-path agent-write flow through `principalAuthExtension`, or only WS? If HTTP write paths now require a principal token that the sim doesn't carry, the sim's documented usage changes on day one.
2. **Playwright fixtures** today boot `bun run dev` per worker and hit `/api/agent-write-md` for seeding (per `packages/app/tests/stress/*.e2e.ts`). Same question — does the HTTP-path principal-auth change break seeding?
3. D50 is cited as the governing decision but not quoted; the spec relies on "we know it's fine" without tracing.

This is LOW as a security surface (dev-only, local, single-user). It is MED as a test-coverage concern because a silent behavioral change in test-seeding paths manifests as a confusing Playwright failure, not an auth error.

**Current design:** "`principalAuthExtension` now runs in dev — same unauthenticated-token posture as prod (D50 LOCKED; principal ID pinned against loaded principal when loaded). No new security surface." (§6 non-functional requirements)

**Alternative:** Before implementation, explicitly trace the agent-sim and Playwright seed paths through the post-refactor `principalAuthExtension`-active plugin. Either confirm they degrade gracefully (no regression) or add an explicit SCOPE item for adjusting them.

**Trade-off:**
- Tracing is cheap and resolves the uncertainty.
- Treating R4 as "LOW, will catch in integration suite" risks a bruising day-one test-failure investigation when the Playwright suite red-flags.

**Status:** CHALLENGED
**Suggested resolution:** Add an evidence file or Assumption entry (`A6`) that traces seed-path behavior against the post-refactor auth chain. If a tweak is needed to agent-sim or the Playwright seed helpers, capture it in §16 SCOPE.

---

## Low Severity

### [L] Finding 6: FR1's structural grep gate is brittle and rots as new server primitives land

**Category:** DESIGN
**Source:** DC2 (maintainer)
**Location:** §6 FR1
**Issue:** FR1's acceptance criterion enumerates the current set of imports (`createPersistenceExtension`, `createApiExtension`, `createServerObserverExtension`, `AgentSessionManager`, …) and requires them absent from the plugin post-refactor. This is load-bearing for the "no hand-wiring" guarantee. But tomorrow, when someone adds `createNewThingExtension` to `@inkeep/open-knowledge-server`, the gate doesn't fire if they wire that extension directly into the plugin instead of through `createServer()`. The gate protects against regression of today's known primitives only.

**Current design:** "Grep gate: `rg 'new Hocuspocus|createApiExtension|AgentSessionManager\(' packages/app/src/server/hocuspocus-plugin.ts` returns zero matches." (§6 FR1 Notes)

**Alternative:** Invert the gate. Assert the plugin calls `createServer(` exactly once and no `new Hocuspocus(` / `ServerOptions`-building outside that call. A structural assertion on "the plugin delegates to createServer" is more durable than an enumeration of forbidden imports. Complement with a knip-style check asserting the plugin file does not re-export any `@inkeep/open-knowledge-server` internal.

**Status:** CHALLENGED
**Suggested resolution:** Reframe FR1's acceptance criterion to a positive assertion (delegation) rather than an enumeration of negatives.

---

### [L] Finding 7: D6 accepts dual log styles on style grounds but the volume change is the real SRE question

**Category:** DESIGN
**Source:** DC2 (SRE / operator)
**Location:** §10 D6, §7 Observability
**Issue:** D6 preserves bracket-prefixed `[hocuspocus]` plugin lines alongside the pino `[server]` lines inherited from `createServer()`. The rationale is "log unification is a separate polish concern." That handles *style*. But `createServer()` emits materially more log lines at startup than today's plugin — shadow repo init, HEAD watcher start, SyncEngine decision, file-watcher start, principal load. A developer running `bun run dev` now sees a noisier startup. For a power user this is signal; for a first-time contributor it can obscure which line matters. The spec flags "log-line parity with `ok start` is a feature, not a bug" (§6 NFR Operability) — agreed, but `ok start` is a CLI that owns the terminal, whereas `bun run dev` shares the terminal with Vite's own output. The reading experience differs.

**Current design:** "**D6 LOCKED** … Operators see dual log styles in dev. Accepted" (§10 D6)

**Alternative:** Add a `LOG_LEVEL=warn` default for the dev-mode pino logger (or `quiet: true` semantics extended through `createServer()` to dampen info-level chatter), documented as the expected developer posture. Power users can `LOG_LEVEL=info bun run dev` for deep debugging.

**Status:** CHALLENGED (low — easily reversible post-merge)
**Suggested resolution:** Add a Should-level FR on dev-mode log verbosity, or an explicit Noted entry in §15 for a volume-tuning follow-up.

---

### [L] Finding 8: D5 copy inherits boot.ts's keepalive timer-map without bounding, and the inheritance isn't surfaced

**Category:** DESIGN
**Source:** DC2 (security / SRE)
**Location:** §10 D5, evidence/collab-entry-point-taxonomy.md (mentions HTTP-layer primitives)
**Issue:** `boot.ts:247` declares `const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();` with no upper bound. D5 copies this logic verbatim. In the MCP keepalive path, each `connectionId` close schedules a timer and inserts into this map; the timer deletes itself on fire or on reconnect. Under a buggy or adversarial MCP client that cycles connection IDs rapidly, the map grows by the arrival rate minus the drain rate (10 s default grace). In prod this is bounded by MCP client behavior. In dev, the same code runs with the same lack of bound.

This is not a vulnerability introduced by the spec — it's inherited from boot.ts — but D5's "copy verbatim" clause means the plugin now carries the same unbounded-map shape **in two places** until Option B ships. If Option B is deferred indefinitely (a plausible outcome given NG2's weak trigger criteria), this becomes two maintenance points for the same class of resource-use bug.

**Current design:** "**D5 LOCKED** Keepalive + presence-ts-refresh + parseKeepaliveConnectionId wiring is **copied from `boot.ts:244-396`** into the plugin rather than extracted to a shared helper" (§10 D5)

**Alternative:** Add an explicit Note that the copied code inherits boot.ts's resource-use assumptions as-is, and that any future hardening (timer map cap, eviction policy, rate limit) needs to land in both places until Option B collapses them. Add this as a triggers-to-revisit signal for NG2 ("if keepalive-grace logic gets a third modification cycle *or a hardening requirement across both sites*").

**Status:** CHALLENGED (low — inheritance concern, not an introduced bug)
**Suggested resolution:** Amend NG2's "Triggers to revisit" to include "any hardening requirement that would need to be applied to both the boot.ts and plugin copies." Document the inherited-assumption chain in D5's Implications cell.

---

## Confirmed Design Choices (summary)

Choices that survived all three lenses without a credible counterproposal:

**DC1 (simpler alternatives held):**
- G3 "single-process dev" — defensible given the contributor-loop context; NG1's NEVER tag is strong but survives DC1 unless DC3 Finding 2's framing tightens. Not separately challenged below that finding.
- FR17 net-LOC gate — aligns with real cleanup (D10 files-to-delete list is concrete).
- D10 file-deletion list (dev-shadow-init.ts + test) — grep-verified single-consumer; clean.

**DC2 (stakeholder review held):**
- Server-lock collision preservation (FR10) — existing contract, no new surface.
- `OK_TEST_CONTENT_DIR` isolation preservation (FR11) — existing test-infra contract.
- `prependListener('upgrade')` ordering preservation (FR14) — no regression proposed.
- HMR warn-and-continue behavior preservation (FR15) — correct scope.
- D9 unified-destroy via `srv.destroy()` — strictly simpler than three parallel cleanup paths; SRE-positive.

**DC3 (framing validity partially held):**
- M6 baton-pass framing — independently verified via evidence/m6-baton-pass.md; clean carve-out, zero code overlap.
- D7 target-prose for the CLAUDE.md correction — specific, non-drafty, removes drift at merge time. Good hygiene.
- D3 corrigendum-breadcrumb pattern — matches repo precedent, strictly dominates silent prose edit.
- Q4's M6-taxonomy verification — thorough and corrected (evidence/collab-entry-point-taxonomy.md); removed a bad claim from the surrounding context.

---

## Notes for the spec agent

The two HIGH findings both circle the same tension: the spec's scope-discipline narrative ("plugin-only is the minimal wedge") interacts awkwardly with (a) the fact that the keepalive/grace code block is itself a natural extract candidate (Finding 1) and (b) the Complication's swing between maintenance and correctness pain (Finding 2). Resolving either may clarify the other. Finding 1 says "if Option B' is on the table, Option A needs a stronger justification." Finding 2 says "if the frame is maintenance-only, Option B'/C re-compete on simpler terms." A user-facing decision on the framing drives the right resolution to Finding 1.

Findings 3 and 4 together argue that the module-load + fail-fast shape has unexamined downsides in dev that the evidence doc's "matches current plugin shape" rationale doesn't address. They don't mandate a change, but they should be addressed with explicit rationale or a shape change.

Findings 5–8 are lower-stakes hardening notes — worth resolving in-spec where cheap, otherwise captured as Noted follow-ups.
