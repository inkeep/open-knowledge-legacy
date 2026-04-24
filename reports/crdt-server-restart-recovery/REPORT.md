---
title: "CRDT Server-Restart Recovery: Implementation Architecture + Product Bar"
description: "Deep dive into the architecture for preserving CRDT identity across Yjs server process restart when the persistent source of truth is a text format (markdown). Synthesizes production Yjs prior art (Hocuspocus SQLite, y-leveldb, y-redis, Jupyter RTC, AFFiNE/BlockSuite), Yjs binary format durability properties, and the product UX bar from Notion/Linear/Figma/Google Docs. Recommends a binary-sidecar-as-cache + markdown-as-truth architecture with a server-instance-ID defense-in-depth check via Hocuspocus authentication."
createdAt: 2026-04-23
updatedAt: 2026-04-23
subjects:
  - Open Knowledge
  - Hocuspocus
  - Yjs
  - Jupyter Real-Time Collaboration
  - Notion
  - Linear
  - Figma
  - AFFiNE
  - BlockSuite
topics:
  - CRDT persistence
  - server-restart recovery
  - dual persistence (text + binary)
  - Yjs binary format durability
  - collaborative editor UX
  - defense-in-depth architecture
---

# CRDT Server-Restart Recovery

> **Post-ship status (2026-04-23):** The architecture recommended in this report shipped in the CRDT server-restart recovery PR (branch `worktree-fix-crdt-restart-sidecar`). All 11 bug-class integration tests are green. The implementation lands in seven commits (316fb8e9 preparatory + 0bb46aaf schema + 1399c34e server-info + 3fe79b18 client-cache + 67a9686c server-enforce + a84577e1 sidecar-write + 91feb226 sidecar-load + 8753b805 branch-switch composition). See `packages/server/README.md` §"CRDT server-restart recovery — instance ID + Yjs binary sidecar" for the landed surface.

**Purpose:** Produce an architecturally clean, product-coherent solution for the CRDT content-duplication bug class that manifests when a Yjs-based server restarts while a browser tab holds live CRDT state. Builds on the [`auto-persistence-version-history-patterns`](../auto-persistence-version-history-patterns/REPORT.md) report which identified the bug class and recommended "dual persistence" at the pattern level; this report drives that recommendation to implementation-ready architecture, pressure-tests alternatives, and establishes the product UX bar.

A developer reading this report should be able to implement the fix with confidence in the pattern chosen, know the specific gotchas (Yjs binary format has no version header; `applyUpdate` has three distinct corruption failure modes), and have a clear product contract for what the user sees during restart.

---

## Executive Summary

The recommended architecture is a **Yjs binary sidecar at `<contentDir>/.open-knowledge/ystate/<docName>.bin`, treated as a disposable recovery cache, with markdown preserved as the canonical source of truth, and a server-instance-ID check over Hocuspocus authentication as defense-in-depth.**<br>_[Corrected 2026-04-24 post-ship: architectural recommendation superseded by Shape 2+ (client-side y-indexeddb + buffer-and-replay + CC1 `branch-switched` invalidation) per [`reports/yjs-client-persistence-alternatives/REPORT.md`](../yjs-client-persistence-alternatives/REPORT.md). Sidecar removed in `implement/client-persistence-replaces-sidecar`; server-instance-ID defense retained. Landed architecture: [`specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md`](../../specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md).]_

This architecture is validated at the source level by **Jupyter Real-Time Collaboration**, which ships the same pattern in production (`.ipynb` as truth, `.jupyter_ystore.db` as disposable cache). Source verification ([evidence/d1-followup-jupyter-source-verification.md](evidence/d1-followup-jupyter-source-verification.md)) confirms Jupyter's happy-path design matches OK's intended architecture exactly: `DocumentRoom.initialize()` tries YStore first, derives text, compares to disk, prefers disk on divergence. The verification also surfaces a **known TODO gap in Jupyter's divergence handling** that OK must address rather than inherit — resolved here via Strategy A (truncate sidecar on divergence) + instance-ID defense. Binary-as-truth is the majority pattern in the Yjs ecosystem (Hocuspocus SQLite/Database, y-leveldb, y-redis, AFFiNE, Liveblocks); Open Knowledge's architectural commitment to markdown-first persistence (for git compatibility, human editability, agent attribution) forces the minority pattern, and the architecture must engineer around the duplication failure mode that the majority pattern avoids by construction.

The Hocuspocus docs themselves [explicitly warn](https://tiptap.dev/docs/hocuspocus/guides/persistence) against text-as-truth recovery: _"Do not be tempted to store the Y.Doc as JSON and recreate it as YJS binary when the user connects. This will cause issues with merging of updates and content will duplicate on new connections."_ Issue [#344](https://github.com/ueberdosis/hocuspocus/issues/344) and [#848](https://github.com/ueberdosis/hocuspocus/issues/848) document the failure in the wild.

**Key Findings:**

- **Dual persistence (binary sidecar + markdown truth) is the right architectural shape.** Source-verified from Jupyter Real-Time Collaboration's [DocumentRoom.initialize()](https://github.com/jupyterlab/jupyter-collaboration/blob/main/projects/jupyter-server-ydoc/jupyter_server_ydoc/rooms.py) — tries YStore first, derives text, compares to disk, prefers disk on divergence. Open Knowledge is not novel — it ports a source-verified working pattern onto Hocuspocus. NOTE: Jupyter's code has a known TODO for stale-delta cleanup on divergent reload that OK must address explicitly (Strategy A in D3 below).
- **Yjs binary format is NOT self-describing.** `encodeStateAsUpdate` output has no version header; the Yjs author [explicitly recommends](https://discuss.yjs.dev/t/converting-to-the-v2-update-format/3890) storing format metadata alongside. Any durable storage MUST embed a version header (~80 bytes) for future cross-version migration.
- **`Y.applyUpdate` on corrupt/stale bytes has three distinct failure modes**, including a known infinite-loop bug ([#479](https://github.com/yjs/yjs/issues/479)) and silent partial-apply via `pendingStructs`. Binary-as-cache MUST wrap apply in try/catch + timeout + post-apply state assertion. Markdown fallback is load-bearing.
- **Server-instance-ID via `__system__` CC1 channel + Hocuspocus auth token is the correct defense-in-depth.** When the sidecar fails (corrupt, missing, format-mismatch) and the server falls back to markdown reconstruction, the instance-ID check catches the stale-client reconnect BEFORE Yjs sync merges — eliminating the race window.
- **Product UX bar is "invisible when fast, subtle when slow."** Confirmed across Figma, Linear, Notion. Google Docs' always-on banner is the cautionary tale; Obsidian's forum-documented demand for MORE signal refutes pure silence. Tiers: 0-2s invisible, 2-10s subtle persistent indicator, 10+s named reconnect banner with "edits saved locally" reassurance. Never require user refresh.
- **Unsynced local edits can be preserved across restart by the sidecar.** The sidecar captures all CRDT state including in-flight client edits the server has seen. If the sidecar survives and is loaded cleanly, unsynced edits ride through the restart. If the sidecar fails and fallback engages, unsynced edits are lost (accepted cost for v1; buffer-and-replay as follow-up).
- **MCP agent-write semantics need no change.** Under the sidecar fix, post-restart agent writes land on a cleanly-loaded Y.Doc without compounding the bug. Existing stateless-retry-at-tool contract works.
- **Composition with existing Open Knowledge primitives is clean.** `reconciledBase`, `parkBranch`/`restoreBranchWIP`, `applyExternalChange`, `AgentSessionManager`, shadow repo — none require rework. The shadow repo and the sidecar occupy different architectural layers (shadow repo preserves markdown + attribution; sidecar preserves CRDT state) — they don't overlap or substitute for each other. See [evidence/d8-shadow-repo-relationship.md](evidence/d8-shadow-repo-relationship.md). The sidecar lives in `.open-knowledge/ystate/`, gitignored, GC'd on shutdown. Estimated implementation: ~50-70 LOC in the server package + ~20 LOC client-side for the instance-ID check.

**Critical caveats:**
- The binary sidecar approach does not eliminate the bug class — it dramatically narrows the window. In the extreme case (sidecar corrupted AND instance-ID check disabled/bypassed), content duplication can still occur. The instance-ID defense-in-depth is what closes the final gap.
- Yjs 14 is in RC (as of 2026-04-14). The [format impact is undocumented](https://github.com/yjs/yjs/releases). Pinning Yjs 13.x for now + planning a migration when 14.x GA + migration guide lands is the prudent path.
- The `.ipynb`/`SQLiteYStore` Jupyter precedent uses a delta-log variant to preserve undo history. Open Knowledge's sidecar can start as a single-blob snapshot (simpler) and migrate to delta-log only if long-undo becomes a product feature.

---

## Research Rubric

| # | Dimension | Priority | Depth | Evidence |
|---|---|---|---|---|
| D1 | Prior-art: production Yjs server-restart patterns | P0 | Deep | [evidence/d1-prior-art-yjs-persistence.md](evidence/d1-prior-art-yjs-persistence.md) |
| D2 | Yjs binary format durability + cross-version migration | P0 | Moderate | [evidence/d2-yjs-format-durability.md](evidence/d2-yjs-format-durability.md) |
| D3 | Open Knowledge composition (1P, user-explicit) | P0 | Deep | [evidence/d3-ok-composition.md](evidence/d3-ok-composition.md) |
| D4 | Product bar: production editor restart UX | P0 | Moderate | [evidence/d4-product-bar-restart-ux.md](evidence/d4-product-bar-restart-ux.md) |
| D5 | Defense-in-depth: instance ID + unsynced-edit preservation | P1 | Moderate | [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) |
| D6 | Alternative approaches pressure-tested | P1 | Moderate | [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) |
| D7 | Agent-write-during-restart semantics | P1 | Light | [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) |

**Non-goals (explicit):** The "should we dual-persist at all" question is resolved by the prior [auto-persistence-version-history-patterns](../auto-persistence-version-history-patterns/REPORT.md) report (Finding 5 + D5); this report treats dual persistence as foundation, not debate. Single-CRDT collapse (Automerge/Loro migration) is a separate topic with [its own report](../single-crdt-collapse-alternatives/REPORT.md) — out of scope. Long-undo preservation via delta-log sidecar is out of scope (see D6 Alternative D).

---

## Detailed Findings

### D1: The prevailing Yjs pattern is binary-as-truth; Open Knowledge is outside that grain

**Finding:** Every production Yjs server except Jupyter treats `encodeStateAsUpdate` output as the durable unit of persistence. Open Knowledge's commitment to markdown-first persistence forces the minority pattern (text-as-truth + binary-as-cache). This minority pattern has exactly one well-documented production precedent: Jupyter Real-Time Collaboration.

**Evidence:** [evidence/d1-prior-art-yjs-persistence.md](evidence/d1-prior-art-yjs-persistence.md)

The comparison across seven surveyed systems:

| System | Storage | Format | Text-as-truth? |
|---|---|---|---|
| Hocuspocus SQLite ext | SQLite blob column | Merged snapshot | NO — binary is truth |
| Hocuspocus Database ext | User-supplied (Postgres/Mongo/…) | `Uint8Array` merged snapshot | NO |
| y-leveldb | LevelDB | Delta log + state-vector (auto-compacted at 500 updates) | NO |
| y-redis | Redis streams + S3 + Postgres | Yjs blob in S3 | NO |
| **Jupyter RTC (pycrdt SQLiteYStore)** | **SQLite `.jupyter_ystore.db`** | **Delta log w/ timeline** | **YES — `.ipynb` is truth, cache is disposable** |
| AFFiNE / BlockSuite | Postgres + S3 | Yjs binary (`y-octo`) | NO — markdown only as export |
| Liveblocks / Tiptap Cloud | Opaque managed | Presumed Yjs binary | NO |

The Hocuspocus docs contain a direct warning against text-as-truth:

> **"Do not be tempted to store the Y.Doc as JSON and recreate it as YJS binary when the user connects. This will cause issues with merging of updates and content will duplicate on new connections."** — [Hocuspocus Persistence Guide](https://tiptap.dev/docs/hocuspocus/guides/persistence)

This warning exists because developers do reach for text-as-truth, and the framework has been burned enough to call it out explicitly. Issues [#344](https://github.com/ueberdosis/hocuspocus/issues/344) and [#848](https://github.com/ueberdosis/hocuspocus/issues/848) document the bug in the wild.

**Jupyter RTC's validating precedent:**

> _"Any change made to a document is saved to disk in an SQLite database file called `.jupyter_ystore.db`. ... it is fine to just ignore it, including in your version control system (don't commit this file). **If you happen to delete it, there shouldn't be any serious consequence either.**"_ — [jupyter-collaboration docs](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/configuration.html)

Jupyter's design explicitly positions the binary store as disposable. The `.ipynb` file is canonical; the YStore is a CRDT-identity + undo-history cache. This is precisely Open Knowledge's target pattern, ported onto Hocuspocus (vs. Jupyter's `y-py`/`pycrdt` stack).

**Implications:**
- Open Knowledge is not inventing a pattern, it's adopting a validated one from a different ecosystem.
- The failure mode the prevailing Yjs pattern avoids (content duplication on restart) is the exact class we must defend against, because we DON'T adopt the prevailing pattern.
- Every `onLoadDocument` that produces CRDT state from non-CRDT input is a potential #344; the sidecar approach converts this into a CRDT-to-CRDT path in the happy case while preserving the markdown fallback in the degraded case.

**Decision triggers:**
- If Jupyter RTC pattern breaks down at higher scales than Open Knowledge targets, reconsider.
- If AFFiNE or BlockSuite pattern (binary-as-truth + text-as-export) becomes desirable for product reasons, a full architectural swap is required (out of scope; see [single-crdt-collapse-alternatives](../single-crdt-collapse-alternatives/REPORT.md) for the related migration story).

**Remaining uncertainty:**
- Jupyter's exact YRoom lifecycle code was not read in source; inferred from docs that say YStore deletion is safe.

---

### D2: Yjs binary format is not self-describing; version pinning + external header are mandatory

**Finding:** `Y.encodeStateAsUpdate(doc)` produces a raw varint-encoded struct stream with no version header. The Yjs author explicitly states that you cannot tell V1 from V2 bytes; format metadata must be stored alongside the binary. `Y.applyUpdate` on corrupt input has three distinct failure modes including an open infinite-loop bug and a silent partial-apply. Any binary-as-cache design must add defensive wrappers.

**Evidence:** [evidence/d2-yjs-format-durability.md](evidence/d2-yjs-format-durability.md)

From Yjs source at `yjs/src/utils/encoding.js:555`: `encodeStateAsUpdate` is a V1 wrapper around `encodeStateAsUpdateV2`. Output is pure struct stream — `writeVarUint(numStates)` then per-state `(numStructs, client, clock, structs...)`. No magic bytes. No version tag.

The Yjs author's own guidance on [discuss.yjs.dev](https://discuss.yjs.dev/t/converting-to-the-v2-update-format/3890):

> **"y-websocket only supports v1. Also, you can't tell whether an update is v1 or v2. I recommend, that you store the encoding format alongside of the update message."**

**Three failure modes for `Y.applyUpdate(doc, corrupt_bytes)`:**

1. **Infinite loop** in lib0 varint reader on certain malformed byte sequences. [Yjs issue #479](https://github.com/yjs/yjs/issues/479), OPEN, unfixed.
2. **Thrown `Error: Unexpected end of array`** on truncated input ([forum thread 1724](https://discuss.yjs.dev/t/unexpected-end-of-array-when-trying-to-apply-big-update/1724)).
3. **Silent partial-apply with pending buffer** — `readUpdateV2` (encoding.js:382-448) integrates what it can and stores the rest in `store.pendingStructs`. Document appears partially changed but is quietly incomplete.

Yjs has **no** validation API — no `Y.isValidUpdate(bytes): boolean`.

**Cross-version story:**
- 13.x minor-version format is stable; V1 encoding has been preserved across the entire 13 major line.
- Yjs 14 is RC (as of 2026-04-14, v14.0.0-rc.13). No published migration guide. Format impact is UNCERTAIN.
- `convertUpdateFormatV1ToV2` / `convertUpdateFormatV2ToV1` are first-class exports, enabling in-library round-trip when explicitly called.

**Implications:**
- The sidecar MUST embed an external header: at minimum `{yjsVersion: "13.6.30", formatVariant: "v1", schemaVersion: 1}`. ~80 bytes. Enables:
  - Detecting V2 bytes hitting a V1 reader before `applyUpdate` is called
  - Future cross-version migration pass at read time
  - Gating fallback-to-markdown on format mismatch
- Binary-apply MUST be wrapped in try/catch + timeout + post-apply state assertion (e.g., `fragment.length > 0` when markdown is non-empty). Infinite-loop failure mode (#479) is unfixed; timeout is the only defense.
- Pairing binary-as-cache with markdown-as-truth is load-bearing. Any sidecar failure falls through to markdown reconstruction + instance-ID check.

**Decision triggers:**
- If Yjs 14 ships with a published migration guide and format-change is confirmed, the external header's `formatVariant` field enables one-shot migration at read time.
- If Yjs issue #479 is fixed before OK ships, remove the timeout wrapper as a simplification.

**Remaining uncertainty:**
- Yjs 14 GA timeline + binary format impact: not determinable until migration guide lands.
- Real-world corruption rates in the wild: no published data found.

---

### D3: Sidecar composes cleanly with every Open Knowledge primitive (1P analysis)

**Finding:** The proposed sidecar architecture integrates with existing Open Knowledge primitives (`reconciledBase`, `parkBranch`/`restoreBranchWIP`, `applyExternalChange`, `AgentSessionManager`, shadow repo) without structural rework. ~50-70 LOC of new/modified server-side code plus ~20 LOC client-side for the instance-ID check.

**Evidence:** [evidence/d3-ok-composition.md](evidence/d3-ok-composition.md)

**Sidecar location:** `<contentDir>/.open-knowledge/ystate/<docName>.bin`. The `.open-knowledge/` directory already exists and holds operational metadata (`server.lock`, `principal.json`, `conflicts.json`). `.open-knowledge/ystate/` added to `.gitignore` at init time.

**Not in shadow repo:** The shadow repo's `refs/wip/<branch>/<writer-id>` structure is for per-writer attributed commits. Binary blobs could live there as separate refs (`refs/ystate/<docName>`), but this couples the binary cache to git commit lifecycle — expensive for an ephemeral cache. Sidecar files keep binary-as-cache decoupled from git semantics.

**Per-primitive composition:**

| Primitive | Interaction | Change |
|---|---|---|
| `persistence.onLoadDocument` | Try sidecar first; fall through to markdown on miss/corruption/header-mismatch | ~15 LOC |
| `persistence.onStoreDocument` | Write sidecar (with header) AND markdown on L1 debounce | ~5 LOC |
| `reconciledBase` | Extends to gate sidecar-write-if-unchanged | No new code |
| `applyExternalChange` | Sidecar naturally regenerated on next store cycle | No change |
| `parkBranch` / `restoreBranchWIP` | Delete sidecar on branch switch; regenerate after new-branch sync | ~5 LOC |
| `AgentSessionManager` | No interaction — sessions are per-process | No change |
| `__system__` CC1 broadcast | Carries server instance ID for defense-in-depth | ~10 LOC |
| Shadow repo WIP refs | No interaction — binary stays separate | No change |
| `.gitignore` | Add `.open-knowledge/ystate/` | 1 line |

**Client-side changes:**
- `ProviderPool`: cache server instance ID, include in auth token, handle `authenticationFailed` for mismatch (~20 LOC).
- `DocumentContext`: boot-time `/api/server-info` fetch to warm the cache (~5 LOC).

**Precedent #1 compliance:** Markdown remains source of truth. Binary sidecar explicitly positioned as "disposable cache, regenerable from markdown." Any sidecar failure falls through to current markdown-reconstruction path. This framing is already accepted in the prior `auto-persistence` report (D5): _"Yjs binary is a performance/correctness cache, not a source of truth."_

**Implications:**
- Implementation is localized — no cross-cutting refactor, no new ownership domains.
- Every existing test should continue to pass. New behavior for the T1/T2/T4/T6/T9/T10 scenarios is tested by the 11-test matrix already in place.
- Branch-switch behavior (T5 passing) is preserved — the sidecar is branch-scoped via delete-on-switch.

**Decision triggers:**
- If SQLite extension (Alternative C' in D6) proves simpler operationally, it's a drop-in for the sidecar file approach with identical architectural framing.
- If future work adds long-undo (beyond session), delta-log sidecar (Alternative D) becomes attractive.

**Remaining uncertainty:**
- Exact GC policy for stale `.bin` files (simplest: delete on process shutdown). Longer retention requires thinking through multi-session restart scenarios.
- Post-apply state assertion shape (e.g., `fragment.length > 0` AND frontmatter-matches-markdown) — implementation detail.

---

### D4: Product bar is "invisible when fast, subtle when slow, never require user refresh"

**Finding:** Production collaborative editors converge on a tiered UX: silent under ~2s, subtle persistent indicator 2-10s, named banner 10+s with "edits saved locally" reassurance. Google Docs' always-on banner is the cautionary tale; Obsidian's forum-documented user demand refutes pure silence. Notion's conflict-copy pattern is the outlier worth copying for unreconcilable divergence.

**Evidence:** [evidence/d4-product-bar-restart-ux.md](evidence/d4-product-bar-restart-ux.md)

**Cross-product comparison:**

| Product | Disconnect | Reconnect | Unsynced-edit fate | Content-safety messaging |
|---|---|---|---|---|
| Notion | Top-bar sync status | Silent push | Local, auto-sync | **Conflict copies** (duplicate pages) |
| Linear | Spinner + "Offline"/"Syncing" badge | Silent delta resume | Local IndexedDB; never lost | Minimal — trust the badge |
| Figma | Minimal/absent | Silent rebase onto fresh server | Queued, reapplied | None visible |
| Google Docs | **Modal-y banner** | Banner disappears | Local cache | **Heavy** — often false-positive |
| Replit | Visible reconnect (OT-bound) | Visible reconnect | Stalled during drop | Forum-documented user churn |
| VS Code Live Share | Gold bar / progress | Silent <60s; **modal after** | Lossless <60s; ended >60s | **Stark modal** on session end |

**Obsidian refutes pure silence:** Top-requested forum threads ask for the sync icon to be always visible with progress — "they can't tell how much more is left to happen." Users explicitly want to "avoid editing files that might be out of sync." Silence creates superstition and distrust.

**Recommended tiered UX for Open Knowledge:**

| Hiccup duration | UX surface |
|---|---|
| 0–2 s | **Invisible.** Don't punish for a TCP retransmit. |
| 2–10 s | **Subtle persistent indicator** (top-bar icon/badge, Linear-style spinner). Never modal. |
| 10+ s | **Named banner** — "Reconnecting — your edits are saved locally." Non-modal. |
| Post-resolve | **Never require user refresh.** "Click to refresh" admits self-healing failure. |
| Unreconcilable divergence | **Materialize as content** (Notion conflict-copy pattern), not destructive auto-merge. |

**Implications:**
- Under the sidecar fix in the happy case (sidecar loads cleanly, client reconnects within 2s), the UX is entirely invisible to the user. This matches the top bar of production editors.
- In the degraded case (sidecar fails OR downtime exceeds 10s), the client's reconnect banner shows "Reconnecting — your edits are saved locally." After reconnect, the Y.Doc is rebuilt from the authoritative source (binary or markdown+instance-ID recycle) — no content duplication, no user-visible weirdness.
- Unreconcilable divergence (binary corrupt AND disk has external edits that predate the sidecar) falls to Notion's conflict-copy pattern: materialize as content the user can review. Existing `saveInMemoryCheckpoint` machinery (per CLAUDE.md) supports this via shadow-repo checkpoints.

**Decision triggers:**
- If production telemetry shows server restarts complete within 2s >95% of the time, the banner tier can be deferred as UX polish (not a correctness requirement).
- If Notion-esque users hit unreconcilable divergence frequently enough to matter, promote conflict-copy UX from "edge case" to "first-class TimelinePanel feature."

**Remaining uncertainty:**
- Exact pixel-level banner copy from Figma during real reconnect not captured (engineering blog discusses algorithm only).
- Real-world restart durations in Open Knowledge's deployment contexts (dev loop: fast; production deploys: probably <10s; VM cold-boot: possibly >30s).

---

### D5: Server instance ID via Hocuspocus auth is the correct defense-in-depth

**Finding:** Binary sidecar preserves CRDT identity in the happy case. The residual case (sidecar corrupt, missing, format-mismatched, or intentionally disabled) re-exposes the bug class. A server-instance-ID check over Hocuspocus authentication catches this BEFORE Yjs sync merges, eliminating the race window.

**Evidence:** [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) §D5.

**Mechanism:**

1. Server generates `serverInstanceId: string = randomUUID()` at `createServer()` startup.
2. Server publishes it on `__system__` CC1 channel: `broadcast({ v:1, ch:'server-info', seq:0, serverInstanceId })`.
3. Client caches the ID in `ProviderPool` on first receipt. Cold-start warmup via `GET /api/server-info` populates the cache before first provider connect.
4. Every provider connect includes `expectedServerInstanceId: <cached-id>` in the Hocuspocus auth token.
5. Server's `onAuthenticate` hook:
   - If claimed ID matches current: accept, proceed normally.
   - If claimed ID is null (first-ever connect): accept.
   - If claimed ID mismatches: **reject with `SERVER_INSTANCE_MISMATCH`** reason.
6. Client's `authenticationFailed` handler (on `ProviderPool`):
   - If reason is `SERVER_INSTANCE_MISMATCH`: clear cached ID, call `pool.recycle(docName)` for all open docs, reconnect with null claim.

**Why it closes the race:** The `onAuthenticate` hook runs BEFORE any Yjs sync-step-1/2 message exchange (confirmed in Hocuspocus source at `@hocuspocus/server/src/Hocuspocus.ts:398-413`). If the auth rejects, the WebSocket is closed before sync can pollute the Y.Doc. No merge can occur.

**Unsynced-edit preservation:** Under the sidecar happy case, unsynced edits are preserved (they're in the Y.Doc state the sidecar captures). In the degraded case (sidecar fails → instance-ID check fires → pool recycles → Y.Doc destroyed), unsynced edits are lost. For v1, accept the regression. For v2, implement buffer-and-replay: before recycle, serialize the unsynced XmlFragment delta to localStorage; after reconnect, replay as an agent-write-style paired transaction.

**Implications:**
- Defense-in-depth is ~30 LOC across three files (server gen + broadcast + auth check; client cache + claim + recycle handler).
- Uses existing `__system__` CC1 infrastructure — no new protocol.
- Provides a verification path: if the sidecar is working correctly, the instance-ID check never fires (cache always matches). Metric for monitoring: "instance-ID mismatch rate" should be ~0 in steady state; spikes indicate sidecar failure.

**Decision triggers:**
- If unsynced-edit preservation proves important in production telemetry, v2 buffer-and-replay becomes higher priority.
- If instance-ID mismatches are observed with non-zero rate, audit sidecar corruption causes.

**Remaining uncertainty:**
- Exact `token` serialization format for Hocuspocus — existing pool already sends `JSON.stringify(tabIdentity)`; adding `expectedServerInstanceId` is an additive field.

---

### D6: Alternatives all strictly dominate or are dominated by the sidecar approach

**Finding:** Pressure-testing five candidate fixes (always-recycle, sidecar file, SQLite extension, delta-log sidecar, stateless server) confirms sidecar file is the Pareto-optimal choice for Open Knowledge's specific constraints.

**Evidence:** [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) §D6.

| Alternative | Preserves unsynced edits | Preserves CRDT identity | Composes with OK primitives | Effort | Verdict |
|---|---|---|---|---|---|
| A: Always-recycle | NO | N/A | Yes | Small | Insufficient (UX regression on blips) |
| C: Sidecar file (recommended) | Yes | Yes | Yes | Moderate | **Recommended** |
| C': SQLite extension | Yes | Yes | Partial (coordinates awkwardly) | Moderate + deps | Viable, heavier |
| D: Delta-log sidecar | Yes | Yes + undo | Yes | Large | Over-engineered for current scope |
| E: Stateless server | Yes (via client IndexedDB) | Yes | No (rewrites agent-write) | Massive | Not viable |

**Alternative A (always-recycle) is insufficient:** Under the "invisible when fast" product bar (D4), brief disconnects <4s must NOT force recycle. Always-recycle regresses UX for the 90% case (network blips) to fix the 10% case (server restart).

**Alternative C' (SQLite extension) is viable but heavier:** `@hocuspocus/extension-sqlite` is battle-tested, but adds SQLite as a native dependency (rebuild per Electron platform), a ~1MB bundle size, and its own lifecycle concerns. Coordinating SQLite with markdown-first persistence requires either double-write (complex) or replacing markdown persistence entirely (violates precedent #1). The sidecar file approach is simpler and directly visible (inspectable `.bin` files vs. blob in DB).

**Alternative D (delta-log sidecar) is over-engineered:** Preserves undo history across restart, but OK already persists undo via shadow-repo per-writer WIP refs. The Yjs UndoManager in-process stack is lost on restart regardless; a delta log doesn't fully restore it. Snapshot sidecar is sufficient for restart recovery.

**Alternative E (stateless server, CRDT on client only) would rewrite the entire agent-write surface:** Server-side agent writes via MCP rely on server-side Y.Doc for coordination. Moving CRDT to client-only breaks agent-write. Not viable without a massive rearchitecture.

**Implications:**
- Sidecar file approach is the architecturally cleanest choice with moderate effort.
- If future work surfaces a blocker in the sidecar approach (e.g., filesystem atomicity concerns on exotic platforms), Alternative C' is the direct fallback.

**Remaining uncertainty:**
- Electron desktop packaging complexity for SQLite extension — not benchmarked. If substantially easier to carry SQLite dep (since `@napi-rs/keyring` already adds native deps), C' becomes more attractive.

---

### D7: MCP agent-write semantics need no change under the sidecar fix

**Finding:** Agent writes via MCP already use stateless retry-at-tool semantics aligned with the REST industry pattern. Post-fix, post-restart agent writes land on a cleanly-loaded Y.Doc without compounding the bug. No MCP-layer changes required.

**Evidence:** [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) §D7.

**Current MCP contract:** `packages/cli/src/mcp/tools/shared.ts:180` `httpPost` returns `{ ok: false, error: "Server unreachable: <msg>" }` on network failure. Tool returns `isError: true` to Claude (or other AI agent caller). Caller decides whether to retry.

This aligns with Stripe/GitHub/Linear REST patterns — transient 5xx → client retries with exponential backoff + idempotency keys. MCP is stateless RPC; the agent is responsible for retry semantics.

**Post-fix behavior:** Test T6 demonstrated: "pre-restart marker duplicated [by the bug], post-restart agent write lands once [correct]." Under the sidecar fix, the server's Y.Doc is loaded from binary post-restart (preserving clientID). Agent writes land on a clean Y.Doc. No duplication from any source.

**MCP keepalive (`packages/cli/src/mcp/keepalive.ts`)** reconnects with exponential backoff + re-resolves `wsUrl` each attempt — robust to server restart AND port changes. Stable `connectionId` UUID across reconnects preserves attribution.

**Implications:**
- No changes needed to MCP tools, keepalive, or agent-session management.
- Narrow window exists between "server dies" and "MCP keepalive flags connection as unavailable" where agent writes return "Server unreachable" to Claude. Claude's prompt-level retry handling covers this; no queue-and-replay is required.

**Decision triggers:**
- If production telemetry shows significant "Server unreachable" errors during restarts, consider adding a client-side retry shim in the MCP tools themselves.

**Remaining uncertainty:**
- No data on real-world MCP restart-window error rates.

---

## Proposed Architecture — The Full Picture

### Server-side

```
<contentDir>/
├── docs/
│   ├── my-doc.md                    # Source of truth (existing)
│   └── other-doc.md
├── .open-knowledge/
│   ├── server.lock                  # Existing
│   ├── principal.json               # Existing
│   ├── conflicts.json               # Existing
│   └── ystate/                      # NEW — Yjs binary sidecar cache
│       ├── my-doc.bin               # Yjs binary update for my-doc
│       └── other-doc.bin            # Yjs binary update for other-doc
└── .git/
    └── open-knowledge/              # Shadow repo (existing)
        └── refs/wip/<branch>/<writer-id>   # Per-writer WIP commits
```

**Sidecar file format:**
```
[header: varint length + JSON {yjsVersion, formatVariant, schemaVersion, createdAt}]
[body: Y.encodeStateAsUpdate(doc) output]
```

**Persistence lifecycle:**
```
on client Y.Doc mutation → HocuspocusProvider forwards to server
  ↓
server Y.Doc receives update
  ↓
Hocuspocus L1 debounce (2000ms default)
  ↓
onStoreDocument fires
  ↓
  ├─ Write sidecar:  encodeStateAsUpdate → prepend header → temp+rename ~/.open-knowledge/ystate/<docName>.bin
  ├─ Write markdown: serialize XmlFragment → temp+rename docs/<docName>.md (existing path)
  └─ setReconciledBase(...)
  ↓
Hocuspocus L2 debounce (15s default)
  ↓
Shadow repo commit fires (existing, unchanged)
```

**Load lifecycle (follows Jupyter RTC's verified pattern + explicit divergence handling):**
```
first client connects to a doc after server start
  ↓
onLoadDocument fires
  ↓
  ├─ Try sidecar:
  │  ├─ readFileSync(.open-knowledge/ystate/<docName>.bin)
  │  ├─ Parse header → verify {yjsVersion, formatVariant, schemaVersion}
  │  ├─ On match: Y.applyUpdate(document, body) within try/catch + 1s timeout
  │  └─ Post-apply assertion: fragment.length > 0 && metadata has frontmatter if present in markdown
  │  ↓ (if any step fails)
  │  └─ Fall through to markdown path (below)
  │
  ├─ DIVERGENCE CHECK (Jupyter-style + Strategy A fix):
  │  ├─ Compare serialize(fragment) to disk markdown (mod trailing-whitespace normalization)
  │  ├─ If identical: DONE — sidecar-loaded Y.Doc is current, preserves CRDT identity. ✓
  │  └─ If divergent: DELETE sidecar file (Strategy A — explicitly fix Jupyter's TODO gap)
  │     └─ Fall through to markdown path
  │
  └─ Markdown path (existing):
     ├─ readFileSync(docs/<docName>.md)
     ├─ parseWithFallback → updateYFragment (creates fresh-clientID Items)
     ├─ Write fresh sidecar to reflect the markdown-loaded state
     └─ Instance-ID check at next client connect catches any stale-client case
```

**Why Strategy A (truncate on divergence) vs. Jupyter's TODO:**
Jupyter's source has `# TODO: Delete document from the store.` at the divergence branch. They update the Y.Doc from disk but LEAVE stale deltas in the YStore. On next restart, those stale deltas replay on top of fresh disk state → Y.Doc contains items from BOTH pre- and post-divergence clientIDs → sync-merge-duplication on client reconnect. OK implements the TODO (deletes the sidecar on divergence) so the next load starts clean. The instance-ID defense-in-depth catches stale-client reconnects during the brief window between divergent reload and sidecar-rewrite.

### Client-side

```
ProviderPool construction
  ↓
boot-time fetch GET /api/server-info → cache expectedServerInstanceId
  ↓
__system__ provider subscribes to CC1 ch:'server-info' broadcasts
  ↓ (refreshes cache on every server-info message)
  ↓
pool.open(docName) called
  ↓
HocuspocusProvider created with token = {
    tabIdentity,
    expectedServerInstanceId  // from cache
  }
  ↓
onAuthenticate hook on server:
  ├─ cached id matches current: ACCEPT
  ├─ cached id is null: ACCEPT (populate via server-info broadcast)
  └─ cached id mismatches current: REJECT with SERVER_INSTANCE_MISMATCH
  ↓
client receives auth rejection
  ↓
pool.authenticationFailed handler:
  ├─ Clear cached id
  └─ For every docName in pool: recycleDisconnectedEntry(docName)
     ├─ destroyEntry (destroys Y.Doc)
     └─ open(docName) fresh
```

### Unsynced-edit fate (the T4 question)

**Happy case (sidecar loads cleanly, client reconnects within <4s):**
Unsynced edits are in the Y.Doc state the sidecar captured at the last L1 debounce. On reconnect, the client's Y.Doc syncs with server's sidecar-restored Y.Doc — same clientID domain, no merge conflict, unsynced edits preserved.

**Degraded case (sidecar corrupt/missing → markdown fallback → instance-ID check fires → pool recycles):**
Unsynced edits are lost with the destroyed Y.Doc. User sees the reconnect banner. v1 acceptable trade-off; v2 can add buffer-and-replay via localStorage.

### Server restart visibility to user

| Restart duration | User sees |
|---|---|
| 0-2s | Nothing (invisible). Sidecar loads, sync resumes transparently. |
| 2-10s | Subtle top-bar indicator ("syncing..." spinner). Same as transient network blip. |
| 10+s | Named banner ("Reconnecting — your edits are saved locally"). Non-modal. Disappears on reconnect. |
| Sidecar fails + fallback engages | Instance-ID mismatch → pool recycle → visible one-shot reload. Unsynced edits lost with UI signal. |

---

## Pressure-test: what could go wrong, why it still holds

### Risk 1: Sidecar corruption goes undetected

**Scenario:** A kernel crash mid-fsync leaves a valid-looking but semantically-corrupt `.bin` file. Header passes validation; body has a subtle inconsistency (e.g., dangling parent references via `pendingStructs`).

**Defense:**
1. Post-apply state assertion catches "fragment.length == 0 when markdown is non-empty" — most common silent-corruption outcome.
2. If post-apply passes but the Y.Doc is SUBTLY wrong (e.g., some content missing), the next client user edit will produce markdown that diverges from the stale-state markdown — on next `onStoreDocument`, the new markdown differs from `reconciledBase` → triggers a regular disk write, which bootstraps recovery.
3. Worst case: instance-ID check still prevents stale-client-merge from amplifying the corruption.

**Residual risk:** Very subtle corruption that's internally consistent but wrong — not protected. However, same risk exists today for markdown corruption on disk. Accepted.

### Risk 2: Yjs 14 migration breaks the sidecar

**Scenario:** OK upgrades Yjs 13 → 14 in six months. Existing `.bin` files have `yjsVersion: 13.6.30, formatVariant: v1` header. New code runs Yjs 14.

**Defense:**
1. Header mismatch detected. Fall through to markdown reconstruction. Instance-ID check kicks in if needed.
2. Migration task: one-shot script reads all `.bin` files, calls `convertUpdateFormatV1ToV2` if format changed, rewrites header. Scripted via the deferred tooling.

**Residual risk:** User-data loss during migration if both sidecar AND markdown fail. Same risk exists today. Accepted.

### Risk 3: Instance-ID broadcast lags; client reconnects BEFORE learning new ID

**Scenario:** Server restart. Client reconnects via exponential backoff. `__system__` CC1 broadcast of new instance ID hasn't reached client yet. Client sends cached old ID in auth token.

**Defense:** This is the HAPPY path of the instance-ID check — old ID mismatches current, server rejects, client recycles. No bug can manifest because rejection happens before sync.

**Residual risk:** None. This is how the mechanism is supposed to work.

### Risk 4: User simultaneously edits markdown on disk (external editor) while server restarts

**Scenario:** User has both the OK editor tab open and VSCode open on the same file. Kills server, edits file in VSCode, restarts server.

**Defense:**
1. On restart, sidecar header is checked. Sidecar is "fresh enough" (from the last L1 debounce pre-restart).
2. File-watcher on the new server detects the external edit, fires `applyExternalChange` which merges into the Y.Doc.
3. Client reconnects: sidecar-loaded Y.Doc + external-change-merged state. Same clientID domain. No duplication.
4. If sidecar fails and falls through to markdown: markdown already reflects the external edit; instance-ID check catches the stale-client tab; pool recycles; fresh client picks up the external edit cleanly.

**Residual risk:** None. The scenario composes cleanly.

### Risk 5: Two servers running on the same contentDir (developer misconfiguration)

**Scenario:** `bun run dev` and `open-knowledge start` both pointed at the same contentDir.

**Defense:** Existing `server.lock` mechanism (per CLAUDE.md §"Server process lock") already prevents this — second invocation fails fast with `ServerLockCollisionError`. Sidecar approach is unaffected.

**Residual risk:** None (existing defense holds).

### Risk 6: GC of stale sidecars deletes one that's still needed

**Scenario:** A sidecar is deleted while a client with unsynced edits is reconnecting.

**Defense:** Simplest GC policy is "delete sidecar on clean process shutdown." During active operation, sidecars are never deleted — they're rewritten on every L1 debounce. On process shutdown (SIGTERM), the shutdown sequence could preserve sidecars for future restart OR delete them. Preserving is the right choice: next restart can use them for CRDT-identity recovery.

**Residual risk:** Crash during shutdown leaves sidecars orphaned. On next process start they're either valid-but-older (fine, same as before the restart) or invalid (header mismatch → fallback). Accepted.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Production telemetry on sidecar corruption rates** — no external data found. Implementation should include metrics for sidecar-load-success-rate vs markdown-fallback-rate.
- **Yjs 14 migration path specifics** — format impact UNCERTAIN until GA + migration guide. Header-based defense gives us a runway.
- **Buffer-and-replay design for unsynced edits** (D5) — deferred to v2 pending production data on how often this matters.
- **Jupyter RTC YRoom lifecycle exact mechanism** — inferred from docs, not source-verified. Doesn't change the architectural conclusion but would sharpen confidence in the precedent.

### Out of scope (per Rubric)

- Single-CRDT collapse (Automerge/Loro migration) — see [single-crdt-collapse-alternatives](../single-crdt-collapse-alternatives/REPORT.md).
- "Should we dual-persist at all" — resolved by [auto-persistence-version-history-patterns](../auto-persistence-version-history-patterns/REPORT.md) D5.
- Long-undo via delta-log sidecar — deferred (Alternative D in D6).
- MCP-level retry shim for agent-writes — existing stateless-retry-at-tool is sufficient (D7).

---

## References

### Evidence Files

- [evidence/d1-prior-art-yjs-persistence.md](evidence/d1-prior-art-yjs-persistence.md) — Production Yjs server-restart patterns (Hocuspocus, y-leveldb, y-redis, Jupyter RTC, AFFiNE)
- [evidence/d1-followup-jupyter-source-verification.md](evidence/d1-followup-jupyter-source-verification.md) — Source-verified Jupyter RTC precedent; reclassifies INFERRED → CONFIRMED; surfaces Jupyter's TODO gap on divergent reload
- [evidence/d2-yjs-format-durability.md](evidence/d2-yjs-format-durability.md) — Yjs binary format shape, stability, cross-version compatibility, `applyUpdate` corruption modes
- [evidence/d3-ok-composition.md](evidence/d3-ok-composition.md) — Sidecar composition with existing Open Knowledge primitives (1P analysis)
- [evidence/d4-product-bar-restart-ux.md](evidence/d4-product-bar-restart-ux.md) — Production editor restart UX (Notion, Linear, Figma, Google Docs, Replit, Live Share)
- [evidence/d5-d6-d7-defense-alternatives-agent.md](evidence/d5-d6-d7-defense-alternatives-agent.md) — Defense-in-depth, alternative approaches pressure-test, MCP agent semantics
- [evidence/d8-shadow-repo-relationship.md](evidence/d8-shadow-repo-relationship.md) — How the shadow repo composes with (not replaces) the sidecar; attribution flow under the bug; manual-op (rollback/save-version/branch-switch) integration

### External Sources (selected)

**Yjs ecosystem:**
- [Hocuspocus Persistence Guide](https://tiptap.dev/docs/hocuspocus/guides/persistence) — explicit warning against text-as-truth
- [Hocuspocus extension-sqlite](https://github.com/ueberdosis/hocuspocus/tree/main/packages/extension-sqlite) — the blessed binary-persistence pattern
- [Hocuspocus issue #344](https://github.com/ueberdosis/hocuspocus/issues/344) — canonical content-duplication bug report
- [Hocuspocus issue #848](https://github.com/ueberdosis/hocuspocus/issues/848) — double-applyUpdate variant
- [yjs/y-leveldb](https://github.com/yjs/y-leveldb) — delta-log + snapshot compaction
- [yjs/y-redis](https://github.com/yjs/y-redis) — horizontally-scaled variant
- [Yjs issue #479](https://github.com/yjs/yjs/issues/479) — open infinite-loop on invalid input
- [Yjs Document Updates docs](https://docs.yjs.dev/api/document-updates) — official persistence guidance
- [dmonad on V1/V2 format ambiguity](https://discuss.yjs.dev/t/converting-to-the-v2-update-format/3890) — "store the format alongside"

**Jupyter RTC (primary text-as-truth precedent):**
- [jupyter-collaboration configuration](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/configuration.html) — `.ipynb` as truth, YStore disposable
- [jupyter-collaboration issue #233](https://github.com/jupyterlab/jupyter-collaboration/issues/233)

**AFFiNE / BlockSuite (binary-as-truth at scale):**
- [BlockSuite docs](https://block-suite.com/guide/store.html)
- [AFFiNE architecture blog](https://affine.pro/blog/what-happens-after-you-press-a-in-a-collaborative-editor-platform-io)

**Product UX doctrine:**
- [Figma — How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Notion — Working offline guide](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know)
- [Bytemash — Linear local-first architecture](https://bytemash.net/posts/i-went-down-the-linear-rabbit-hole/)
- [Microsoft — VS Code Live Share connectivity](https://learn.microsoft.com/en-us/visualstudio/liveshare/reference/connectivity)
- [Obsidian Forum — sync icon visibility request](https://forum.obsidian.md/t/mobile-make-sync-icon-always-visible/31780) — users DEMAND signal
- [Ink & Switch — Local-first software essay](https://www.inkandswitch.com/essay/local-first/)

### Related Research

- [auto-persistence-version-history-patterns](../auto-persistence-version-history-patterns/REPORT.md) — Prior report that identified the bug class (D5) and recommended dual persistence at the pattern level. This report builds on it with implementation-ready architecture.
- [single-crdt-collapse-alternatives](../single-crdt-collapse-alternatives/REPORT.md) — Orthogonal direction (replace Yjs entirely with Automerge/Loro). Out of scope here; different tradeoffs.
- [collab-editor-silent-loss-ux-patterns](../collab-editor-silent-loss-ux-patterns/REPORT.md) — Broader UX analysis of merge-anomaly handling. Relevant for "unreconcilable divergence" UX (Notion conflict-copy pattern); complements this report's restart-specific scope.
- [crdt-observer-bridge-latency-analysis](../crdt-observer-bridge-latency-analysis/REPORT.md) — Observer bridge timing characteristics; confirms the observer A/B paths compose cleanly with sidecar architecture.
- [lossless-bridge-merge-alternatives](../lossless-bridge-merge-alternatives/REPORT.md) — Three-way merge approaches for the bridge. Out of scope for restart recovery but adjacent.
