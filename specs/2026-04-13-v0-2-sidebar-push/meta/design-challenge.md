# Design Challenge Findings

**Artifact:** `specs/2026-04-13-v0-2-sidebar-push/SPEC.md`
**Challenge date:** 2026-04-13
**Total findings:** 7 (2 high, 3 medium, 2 low)

I read the spec end-to-end, the intake context pointers, the project PROJECT.md entry for V0-2 + CC1, and the Hocuspocus sources to ground the transport claims (`node_modules/@hocuspocus/server/src/Document.ts:238`, `Connection.ts:173`, `Hocuspocus.ts:428`). For each finding I cite what in the spec it calls into question, evidence for and against, whether the Decision Log rejection still holds, and a recommendation.

---

## High Severity

### [H] Finding 1: `__system__` Y.Doc (D8) is a "doc that is not a doc" and leaks into ≥4 subsystems that assume docs are real files

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (operational stakeholder)
**Location:** SPEC.md §9 "System design" / §10 D8 / §14 risks / §16 SCOPE + STOP_IF

**Issue.** D8 introduces a synthetic Y.Doc named `__system__` whose defining property is that every subsystem that normally operates on docs must know to skip it. Spec SCOPE enumerates the gating points:

- `persistence.ts` must skip `onLoadDocument` / `onStoreDocument` for `__system__` (A5 unverified)
- `file-watcher.ts` must exclude `__system__` from the in-memory file index if ever seen
- `content-filter.ts` must deny `__system__` paths
- `FileSidebar` must filter `__system__` out of the tree
- Integration test must assert no `.__system__.md` is written
- `ProviderPool` must pin `__system__` (new never-evict flag, A4 unverified)
- Shadow repo + reconciliation + `reconciledBase` + `DocumentSaveInfo` + `HEAD` watcher all treat docs uniformly; adding a doc that is *structurally* a doc but *semantically* a channel silently inherits all of those paths unless each is audited.

This is exactly the shape of a cross-cutting leak. The `__system__` token is not opaque to the system; it has to be **recognized and negated** in every layer that has a legitimate "this is a real content doc" policy. That's the opposite of generic-primitives-over-specific (CLAUDE.md architectural precedent #2).

**Current design:** "Transport: dedicated `__system__` Y.Doc. Every client opens it on app mount via ProviderPool. Server broadcasts via `hocuspocus.documents.get('__system__').broadcastStateless()`" (D8) with rationale "zero fork of Hocuspocus."

**Alternative (3c reopened).** A narrow server-side primitive backed by a single Hocuspocus feature — *not* a fork, *not* a protocol extension — using what `Document.broadcastStateless()` already provides (`node_modules/@hocuspocus/server/src/Document.ts:238`). Concretely:

- Create the `__system__` Document object programmatically on the server via `hocuspocus.createDocument('__system__', ...)` **without** installing the persistence + file-watcher extensions on it. In Hocuspocus, extensions are global, so instead register the CC1 broadcaster as an extension whose `onLoadDocument` / `onStoreDocument` short-circuit only on that documentName — and centralize that check in **one** place (a `systemDocumentGuard` helper) that every existing extension composes with, rather than scattering `if (documentName === '__system__') return;` across `persistence.ts`, `file-watcher.ts`, `content-filter.ts`, `api-extension.ts`, etc.
- Or: skip the pseudo-doc entirely. Use a per-connection sidechannel (see Finding 2).

**Evidence for.** The SPEC itself lists at least four skip points in §16 SCOPE and two more in §14 risks (persistence, file-watcher, content-filter, provider-pool, test assertion, rescue/reconciliation implicit). Every new extension or index in the future (catalog, search, shadow-repo GC, symlink alias map) will need the skip too, or will produce confusing artifacts.

**Evidence against.** `broadcastStateless` is genuinely per-Document in Hocuspocus; there is no server-wide equivalent. Some form of this is required. The ProviderPool entry is cheap. The "skip" checks are three lines each.

**Does the Decision Log rejection of 3c hold?** Partially. 3c was rejected as "requires fork or deep internals coupling." That's *false for the primitive we actually need* — a single `Hocuspocus.broadcastStateless(payload)` method that iterates `this.documents.values()` or iterates all connections directly. It's ≤15 lines, no protocol extension, no fork. The real reason 3c was rejected is that it would need to land upstream OR be maintained as a monkey-patch. That's a valid reason, but not the one in D8. The rejection rationale should be updated to reflect the *actual* trade-off.

**Trade-off.**
- Gained by current design: zero server-side code outside `cc1-broadcast.ts`.
- Lost: every future subsystem gets a special case; A4 (never-evict) and A5 (persistence skip) are unverified MEDIUM-confidence assumptions gating a 1-way-door decision.

**Status:** CHALLENGED
**Suggested resolution:** Either (a) centralize all `__system__` skips into a single `isSystemDoc(documentName)` helper + audit every extension for it as part of this spec (not implementation), explicitly acknowledging the leak; or (b) reopen 3c with an implementation sketch of a thin server-wide broadcast helper and compare on code-delta lines, not on "fork vs. no fork." Minimum: promote A4 and A5 to verified before marking D8 LOCKED, because they are load-bearing for a 1-way door.

---

### [H] Finding 2: The hybrid contract (D7) + seq + resync sentinel reinvents SSE's `id`/`retry`/`event` over an opaque transport — and a pure-signal (A) design may be both cheaper *and* sufficient

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** SPEC.md §9 "Payload shape" / §10 D7 / §10 Alternative A

**Issue.** The hybrid contract carries per-event typed payloads (`{kind, path, docName, seq}` or `{oldPath,newPath,...}`) **and** a `resync` sentinel that forces re-fetch **and** a seq-gap re-fetch **and** a reconnect re-fetch. So the client already falls back to `GET /api/documents` on three distinct paths. The only case where the typed payload saves a fetch is: the steady-state "single file changed and no seq gap and no reconnect" case.

Napkin math question the spec does not answer: for the target workloads (one human + one agent editing; occasional `git checkout`), how often does that happy path actually fire vs. resync/reconnect/gap? If most changes are either (a) singletons that the sidebar could cheaply re-fetch in <50 ms against an in-memory index (verified D12, `api-extension.ts:425-426`) or (b) bursts that collapse to `resync`, then the typed payload is carrying freight that is rarely decoded.

Pure signal alternative (A) rejected rationale: "full-list HTTP per event is wasteful at scale (~100 KB/event × 10 clients in a 3000-file vault)." This rationale quantifies a worst case but not the nominal case:
- 10 concurrent clients is aggressive for a local-first editor. Most dogfood is 1–2.
- `/api/documents` response size has not been measured; 100 KB is assumed. The file index entry is small (path + size + mtime); 3000 entries at ~80 bytes is ~240 KB uncompressed, ~30 KB gzipped. Hocuspocus WebSocket is not gzipped for stateless frames, but HTTP is.
- Typed events don't eliminate fetches either (see above: three fetch paths remain).

**Current design:** "Contract semantics: hybrid — typed events happy path + re-fetch on reconnect / seq gap / `resync` sentinel." (D7, LOCKED, 1-way door)

**Alternative.** Pure signal: `{ch:'files', seq:N}` with no kind/path payload. Client re-fetches `/api/documents` on every signal. Server coalesces via the same 100 ms window and emits one signal per window regardless of event count. No `resync` sentinel needed — there is nothing to coalesce away because the signal never carried enumeration in the first place. No rename atomicity concern (Finding 3) because there is no delete+create flash — the re-fetch gives an atomic snapshot.

**Evidence for.**
- Three of the four client paths in D7 already re-fetch. The typed payload is load-bearing in exactly one path.
- `/api/documents` is already O(1) in memory (D12 verification). The cost argument against (A) assumes it isn't.
- Contract surface shrinks dramatically: one channel ID + one seq. V0-3 and V0-11 inherit *less*, so less can go wrong downstream. Matches CLAUDE.md precedent #2 (generic primitives over specific).
- Pure-signal is also the most direct reading of CC1's charter text: "signal-then-fetch (not push-the-data)." The hybrid is a partial departure from CC1 that the spec doesn't call out as such.

**Evidence against.**
- Typed events enable future consumers to filter without fetching. But today, none of V0-2 / V0-3 / V0-11 filter — sidebar and backlinks panels re-derive the whole view anyway.
- Rename atomicity: with typed events the client can patch a single node; with pure signal the re-fetch implicitly produces the atomic snapshot. Pure signal is arguably *more* atomic.

**Does the Decision Log rejection of (A) hold?** Weakly. The rejection rationale is quantified ("100 KB × 10 clients") but both numbers are unsourced. D12 independently verified the list endpoint is cheap. Re-examine with actual measurements before committing to the hybrid shape as the contract V0-3/V0-11 must inherit.

**Trade-off.**
- Gained by pure signal: simpler contract, no sentinel, no oldPath/newPath rename variant, simpler seq reasoning (no per-kind interpretation), faster V0-3/V0-11 adoption, no `resync` vs. normal-event distinction in client logic.
- Lost: steady-state happy-path bandwidth. If (A)'s re-fetch cost is actually <10 KB compressed and <50 ms server-side, this is negligible.

**Status:** CHALLENGED
**Suggested resolution:** Before finalizing D7 as LOCKED + 1-way door, measure `/api/documents` response size (gzipped) against a realistic vault (the repo itself: `ls **/*.md`). If the number is <20 KB, reopen D7 — pure signal likely wins on all axes and V0-3/V0-11 inherit a simpler contract. Spec says D7 is 1-way door — so this measurement is spec-time, not implementation-time.

---

## Medium Severity

### [M] Finding 3: 100 ms coalescing window (D10) has no evidence it fires on realistic loads; may add complexity with no benefit

**Category:** DESIGN
**Source:** DC1 (capability/complexity trade-off)
**Location:** SPEC.md §10 D10, §6 requirements row 8

**Issue.** The coalescing window + >5-events sentinel is justified by "`git checkout` between branches with 200+ file delta." That's a real workload, but the spec never checks whether `@parcel/watcher` actually delivers those 200 events into a single 100 ms window in practice. On macOS FSEvents, bursts are coalesced by the kernel; on Linux inotify, they are not. Branch switches trigger large rename chains that fire over many hundreds of ms. If the 200 events spread across, say, 800 ms, they produce 8 signals, each under the 5-event threshold — **the sentinel never fires** and clients patch 200 deltas in series anyway (which the spec explicitly lists as the failure mode to prevent).

The agent-sim command in CLAUDE.md (`--rapid 5 --markdown`, 100 ms spacing) will produce events nearly exactly at the coalescing boundary — flaky test territory.

**Current design:** "Server-side 100 ms tumbling window per channel. Bursts >5 events within a window collapse to a single `{kind: 'resync'}` sentinel."

**Alternative.** Either (a) use a longer window (500 ms) tuned against measured inotify spread on a real `git checkout`, or (b) drop the threshold — always emit either exactly one typed event OR one signal per window, never both, so the client logic is uniform. Or (c) if we adopt pure signal (Finding 2), the window is just a debounce with no threshold logic needed.

**Evidence for.** Spec does not cite any watcher timing evidence; A6 explicitly defers measurement to implementation.

**Evidence against.** 100 ms may be fine on macOS where FSEvents coalesces; dogfood is mostly macOS. If so, the risk is low in practice even if the rationale is weak.

**Does the Decision Log rejection hold?** D10 isn't a rejection; it's the chosen design. But the foundational measurement (A6) is deferred to implementation, and the window size is the kind of parameter that's hard to change once V0-3/V0-11 inherit the contract semantics "bursts produce resync sentinels." If the window proves wrong, both downstream consumers have to adapt.

**Trade-off.**
- Gained: may prevent 200-delta fan-out on macOS.
- Lost: two client code paths (typed event vs. resync sentinel); undefined behavior on Linux; value unknown on realistic loads.

**Status:** CHALLENGED
**Suggested resolution:** Before locking D10, run the `agent-sim --rapid` and a scripted `git checkout` on this very repo (has ~50 `.md` files under `.open-knowledge/catalogs/` based on git status) and measure watcher inter-event spacing. If inter-event > 100 ms, widen the window. Document actual measurement; don't leave A6 "Active — measure during implementation" for a 1-way-door-adjacent parameter that V0-3/V0-11 inherit.

---

### [M] Finding 4: Excluding `update` events (D9) hard-codes a today-only sidebar concern into the contract V0-3 and V0-11 inherit

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing)
**Location:** SPEC.md §10 D9, §9 "Event kinds broadcast"

**Issue.** V0-3 (BacklinksPanel) is the paradigmatic consumer of `update` events — when a file's content changes, its outbound wiki-links change, which changes **other files' backlinks**. A V0-3 panel subscribed to `ch: 'backlinks'` ultimately needs to know when any file's body changed. D9 excludes `update` from the `ch: 'files'` channel only — so V0-3 would add its own update-emission path in `persistence.ts`, on a different channel, from a different emit site. That breaks CC1's intent of "one primitive, many consumers."

V0-11 graph panels likely need the same for edge recomputation.

The rationale "sidebar doesn't render mtime" is true but scopes to V0-2's *view*, not the contract. This is the trap Finding 1 warned about: a contract defined by the first consumer's needs forces later consumers to either (i) extend the contract (requiring the D2 "Andrew+Mike signoff" gate and re-spec), or (ii) invent parallel channels, fragmenting CC1.

**Current design:** "Broadcast kinds: create | delete | rename. Exclude update and conflict." (D9)

**Alternative.** Either (a) include `update` on `ch: 'files'` with the rename/typed-event shape — sidebar ignores it, but V0-3 and any future content-derived panel consume it from day 1; or (b) if we adopt pure signal (Finding 2), the signal is just "something changed, refetch if you care" — then `update` naturally belongs, and V0-3 subscribes without any contract revision.

**Evidence for.** V0-3 PROJECT.md:332 explicitly calls out backlinks push emitted from `persistence.ts`'s backlink-index update path — i.e., tied to content updates. Excluding updates from `ch: 'files'` doesn't help V0-3 and doesn't match the CC1 "reusable primitive" goal.

**Evidence against.** `update` events are more frequent than create/delete/rename (every keystroke debounced); broadcasting all of them on `ch: 'files'` is bandwidth the sidebar doesn't need.

**Does the Decision Log rejection hold?** D9 rejection is weak for the primitive; it's strong for the sidebar's immediate needs. The spec says V0-2 "defines the contract V0-3/V0-11 inherit" but then picks create/delete/rename because of what sidebar renders — a contradiction. If `update` is genuinely not needed by the primitive, the spec should justify that on *primitive* grounds, not sidebar grounds.

**Trade-off.**
- Gained by including update: V0-3/V0-11 inherit cleanly; one emission path from persistence.
- Lost: more bandwidth on `ch: 'files'` that sidebar ignores (cheap if JSON is small).

**Status:** CHALLENGED
**Suggested resolution:** Reconcile D9 with D2 ("this spec defines the contract"). Either keep `update` excluded and explicitly document that V0-3 will need its own channel/emission (amending §15 Future Work and the D2 "stable contract" claim), or include `update` now so the primitive actually serves all three consumers. Pure signal (Finding 2) makes this choice moot.

---

### [M] Finding 5: L1-only test coverage (D11) leaves the sidebar UX change unverified in V0-2's own merge window

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing eng + SRE)
**Location:** SPEC.md §10 D11, §13 acceptance, §14 risk row "flakes on CI"

**Issue.** D11 splits testing between this spec (L1: "disk write → server broadcast → `onStateless` fires") and V0-4 (L2: Playwright agent-write → sidebar row appears). That neatly preserves ownership lines, but:

1. V0-2's own acceptance criterion says "manual smoke (`agent-sim.ts --rapid 5`) shows sidebar updates <500 ms p95" — i.e., human manual testing is the gate for the actual user-visible outcome.
2. V0-4 ships later. Between V0-2 landing and V0-4's Playwright tests, the sidebar-subscribe code path is covered only by L1 (which doesn't exercise React tree patching) and manual smoke (which doesn't run in CI).
3. Risk row "Layer 1 integration test flakes on CI due to timing windows" proposes "loose bound (<2 s) in CI." So the CI-gated assertion is 4× weaker than the stated target.

A minimal V0-2-owned Playwright test — agent-write via `agentWriteMd`, assert `data-doc-name="…"` appears in sidebar within a bounded time — is one fixture and ~30 lines. It would catch tree-patching regressions introduced anywhere from the ProviderPool pin to the `FileSidebar` subscribe handler.

**Current design:** "V0-2 owns Layer 1 integration test … V0-4 owns Layer 2 Playwright E2E"

**Alternative.** V0-2 also owns a single smoke-level Playwright test for the sidebar path specifically (not the full V0-4 file-ops UX matrix). Keeps L2 ownership for V0-4's scope (delete/rename UI) while locking regression prevention for this PR's changes.

**Evidence for.** CLAUDE.md "Playwright policy" — "DOM-binding and user-interaction regressions that unit/integration tests cannot reach." The FileSidebar tree patch on `onStateless` is exactly this class.

**Evidence against.** Playwright tests are heavier; concurrent with the D11 goal of keeping V0-2 small.

**Does the Decision Log rejection hold?** D11 didn't reject a V0-2-specific Playwright test; it aliased the L2 coverage to V0-4. Those aren't the same. A targeted V0-2 Playwright test doesn't violate D11's intent.

**Trade-off.**
- Gained: regression safety for the sidebar DOM patch path from V0-2 day one.
- Lost: ~30 lines of Playwright and one fixture maintained until V0-4 supersedes.

**Status:** CHALLENGED
**Suggested resolution:** Add one Playwright test (`tests/stress/cc1-sidebar.e2e.ts`) narrowly scoped to "agent-write → row appears" as part of V0-2's acceptance. V0-4's L2 matrix remains V0-4's responsibility.

---

## Low Severity

### [L] Finding 6: Auth / sub-channel namespacing / error semantics absent from published contract v1 (§9)

**Category:** DESIGN
**Source:** DC2 (security + customer-facing eng)
**Location:** SPEC.md §9 "Payload shape (CC1 contract v1)", §13 contract artifact

**Issue.** §9 publishes `{ch, kind, ..., seq}` as the contract V0-3/V0-11 inherit. It specifies shape but not:

- **Auth:** today trust-boundary is localhost (§6 NFR) so this is fine. But the contract ships with V0-3 for BacklinksPanel and V0-11 for graph panels. If one future channel ever needs per-document filtering (e.g., a hypothetical secrets vault), the `ch` string has no namespace — all subscribers on `__system__` see all channels. Future-work item worth naming explicitly.
- **Channel namespacing rules:** `'files'`, `'backlinks'`, `'graph'` — but are channel IDs flat strings or hierarchical (`'files.created'`)? Who registers a new channel? D2 says "Andrew + Mike signoff" for contract changes; does adding a new `ch` value count? Ambiguous.
- **Error semantics:** client sees a payload it can't parse — drop, log, disconnect? Spec doesn't say. "Defensive dedupe" is noted as Could (§6 row 12); malformed-payload handling is not.
- **Version field:** no `v: 1` field in the payload. If V0-11 wants to extend the shape, no forward-compat path.

**Current design:** §9 `CC1Event` TypeScript union, per-channel seq, `ch` as flat string.

**Alternative.** Add to §9 contract v1: (i) `v: 1` literal on every payload; (ii) namespace rule — flat kebab-case, reserved prefix `_` for internal channels; (iii) error policy "unknown `ch` or unparseable payload: log + skip, do not disconnect"; (iv) explicit statement that today there is no per-channel auth and all subscribers see all channels (future-work risk).

**Evidence for.** D2 declares this the stable contract for all future consumers. A contract missing version + error policy is a source of lock-in pain on the first incompatible extension.

**Evidence against.** Spec explicitly accepts localhost-only trust boundary; most of this is future-proofing.

**Does the Decision Log rejection hold?** Not addressed. The spec locked the shape (D7) but didn't enumerate what the contract *includes beyond* the shape.

**Trade-off.** 4 extra lines in the contract doc, zero runtime cost.

**Status:** CHALLENGED
**Suggested resolution:** Append a "Contract addendum" subsection to §9 covering version field, namespacing rule, malformed-payload policy, and an explicit "no per-channel auth (NG)" note so V0-3/V0-11 don't rediscover these.

---

### [L] Finding 7: SSE / ETag-based documents endpoint (reconsider NG4 mechanics) was rejected on constraint-grounds, not evidence-grounds

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** SPEC.md §10 NG4, §9 Alternatives considered ("SSE on a dedicated endpoint", "Smarter polling")

**Issue.** NG4 is NEVER; the §9 rejections point to CC1 as the constraint. CC1 *itself* (PROJECT.md:991) says "use the existing Hocuspocus awareness channel." The constraint is upstream of the spec. But the spec also rejects "Smarter polling (ETag / `?since=`)" on the grounds that "V0-3/V0-11 can't inherit." That rejection doesn't hold: a `/api/documents` with ETag/If-None-Match could serve all three (sidebar polls at reconnect, backlinks panel polls its endpoint with ETag, graph panel its own). What they can't share is a *push* primitive — but the spec hasn't justified that push is necessary for all three.

The spec's Complication #1 is "user-visible staleness ≤5 s." ETag polling at 1 s with `If-None-Match` has ~zero server cost (in-memory index, 304 response), ~1 s worst-case staleness, and needs zero new architecture. The only reason to prefer push over 1 s polling is Complication #2 (architectural fragmentation of N pollers) — i.e., CC1 itself.

If CC1 is load-bearing (PROJECT-level commitment), this finding is moot. But the spec should say "we are accepting CC1's constraint; the engineering case for push over 1 s ETag-poll is weak on its own," rather than constructing independent technical rejections that don't hold up.

**Current design:** NG4 NEVER for new transport; §9 rejects smarter polling on G2 grounds.

**Alternative.** Frame honestly: "CC1 mandates push-over-awareness at the project level. Without CC1 as a constraint, ETag-based polling at 1 s would meet G1 at lower complexity. We are accepting CC1 to unlock the architectural goal (G2), not because push is technically cheaper."

**Evidence for.** `api-extension.ts:425-426` serves from in-memory index (D12 verified) — ETag caching is trivial. The failure mode this design prevents (accreting pollers) is real but is the *reason for CC1*, not an independent rejection of ETag.

**Evidence against.** CC1 is a project commitment, not a spec-level choice. Re-litigating it is out of scope for V0-2.

**Does the Decision Log rejection hold?** Yes, because CC1 is the constraint. But the spec's *rationale* for rejecting ETag conflates CC1's constraint with a freestanding technical argument. DC3 (framing): this is post-hoc justification.

**Trade-off.** Cosmetic — doesn't change the outcome, just the honesty of the decision log.

**Status:** CHALLENGED
**Suggested resolution:** Add one line to the §9 "Smarter polling" rejection: "Rejected primarily because CC1 mandates push-over-awareness (PROJECT.md:991); on pure engineering merits ETag-poll at 1 s would also meet G1." Makes the constraint legible.

---

## Confirmed Design Choices (summary)

Design choices that held up under all three lenses:

- **D1 (reuse Hocuspocus transport, no new endpoint).** LOCKED, 1-way door. CC1 constraint is legitimate; Hocuspocus is already load-bearing for the product.
- **D3 (no background polling fallback, single re-fetch on reconnect).** Clean semantics. Reconnect-handler is small.
- **D4 (sidebar UX redesign out of scope).** RH2 guardrail is sound; scope creep risk is real.
- **D5 (optimistic UI deferred to V0-4).** Correctly scoped to consumer of the primitive, not the primitive itself.
- **D6 (dual-framing SCR).** Holds under DC3. Single-lens framings would mislead about the bet.
- **D11 ownership intent.** The L1/L2 split is conceptually right; only the V0-2-side completeness is challenged in Finding 5, not the split itself.
- **D12 (OQ5 list endpoint scalability dropped).** Well-evidenced: `api-extension.ts:425-426` + `CLAUDE.md` "File discovery." Future-work `Noted` tier is appropriate.
- **§14 risk inventory coverage.** The SRE perspective is well-represented (restart recovery, server-older-than-client, LRU eviction, CI flakes). No gaping hole here.

The challenges in this file are concentrated on: (i) transport choice (D8) inducing a cross-cutting skip-list (Finding 1), (ii) contract shape (D7, D9) being over-specified for V0-2 yet under-specified for V0-3/V0-11 inheritance (Findings 2, 4, 6), (iii) one parameter (D10 window) deferred past its spec-time decision point (Finding 3), and (iv) one test-ownership edge (Finding 5). The product framing (D6), the pattern goal (CC1), and the scope guardrails (D4/D5) hold.
