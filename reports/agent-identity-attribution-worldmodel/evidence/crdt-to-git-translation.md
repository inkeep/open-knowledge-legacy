---
title: CRDT → git translation feasibility for per-session refs
description: End-to-end pipeline trace, Y.js origin survival analysis, per-session commit mechanics (options A/B/C), interaction with existing subsystems, prior-art summary. Informs the shadow ref topology decision in the agent identity foundation spec.
tags: [evidence, spec-input, crdt, shadow-repo, per-session-refs, agent-identity]
sources: [packages/server/src/persistence.ts, packages/server/src/shadow-repo.ts, packages/server/src/server-observers.ts, packages/server/src/contributor-tracker.ts, packages/server/src/agent-sessions.ts, packages/server/src/api-extension.ts, packages/server/src/head-watcher.ts, packages/server/src/reconciliation.ts, packages/server/src/external-change.ts]
---

# CRDT → git translation feasibility for per-session refs

**Status:** Investigation evidence for the agent-identity foundation spec. Non-prescriptive — maps what's true, not what to do.

## 1. Executive summary

- **Option B (isolated session contributions) is infeasible** on Y.js. Transaction origin is not stored on items (`ID` at `node_modules/yjs/src/utils/ID.js:7` is `{client, clock}` only), not replicated over the wire (`Transaction.js:130-138` writes structs + deleteSet only, no origin), and the `clientID` on items identifies the server's single Y.Doc instance, not the writing agent. No API exists to enumerate items by origin post-facto.
- **Option A (doc-state-after-session's-write) is feasible and mostly pre-built.** `commitWip` (`shadow-repo.ts:126-203`) already takes a `WriterIdentity` and writes `refs/wip/<branch>/<writer.id>`; the pipeline just needs to pass a per-session writer instead of the frozen `{id:'server', ...}` default (`persistence.ts:169-173`). The save-version path (`shadow-repo.ts:847-951`) already demonstrates per-writer refs in production.
- **Option C (baseline-diff)** is possible but expensive. Requires per-agent baseline-state tracking and moving-baseline diff computation. ~10-100× cost of A for marginal gain over honest Option A semantics.
- **The information needed for Option A is reachable today but currently discarded.** `onStoreDocumentPayload.lastTransactionOrigin` and `lastContext` exist in Hocuspocus (`node_modules/@hocuspocus/server/src/Hocuspocus.ts:297-311`), but `persistence.ts:405` destructures only `{document, documentName}`. Per-agent identity already flows through `api-extension.ts` (`agentId` from `extractAgentIdentity`, lines ~1018-1037) and lands in `contributor-tracker.ts` via `recordContributor(docName, agentId, agentName, colorSeed)`.
- **Observer/paired-write invariants are orthogonal to per-session topology.** Observer self-skip is origin-identity based (`server-observers.ts:423, 621`) but paired-write check is structural `context.paired === true` (`isPairedWriteOrigin` at lines 124-128), so per-session origins don't require reworking the observer guards.
- **The commit-time debounce and per-doc debounce are layered.** L1 (Hocuspocus debounce, 2000ms default) fires `onStoreDocument` per-doc; L2 (persistence's `gitCommitTimer`, 15000ms default per `persistence.ts:164` — NOT 30s as the docstring claims) schedules one shadow commit globally. Under per-session, L2 fan-outs one commit per distinct writer in the drained contributor snapshot.
- **tmp-index collision is avoided naturally under per-writer sharding.** `commitWip` uses `index-wip-${writer.id}` (`shadow-repo.ts:133`), NOT UUID-isolated. N distinct writer IDs eliminate same-ID contention; single-flight (`commitInFlight` in `persistence.ts:178`) still serializes across writers in one process.
- **Subsystem impact is concentrated in six touchpoints:** `parkBranch` hardcodes `human-server` ref (`shadow-repo.ts:722`), `defaultWriter='server'` in `persistence.ts:169-173`, `commitUpstreamImport` uses `UPSTREAM_WRITER`, `applyExternalChange` uses `FILE_WATCHER_ORIGIN`, rollback uses `ROLLBACK_ORIGIN`, save-version takes explicit `writers[]`. Only two are in the agent hot path.

## 2. Pipeline trace — one agent write MCP HTTP → git commit

**Entry (MCP → HTTP API):** Agent calls `POST /agent-write-md` → `handleAgentWriteMd` at `api-extension.ts:1111-1217`. `extractAgentIdentity(body)` at lines 1018-1037 produces `{rawAgentId, agentId, agentName, colorSeed, clientName}` — `agentId = 'agent-${rawAgentId}'` or `'claude-1'` if unset.

**Session acquisition:** `sessionManager.getSession(resolvedDocName, agentId, identity)` at line 1162. `AgentSessionManager` at `agent-sessions.ts:171-295` keys by `(docName, agentId)`, opens a `DirectConnection` via `hocuspocus.openDirectConnection(docName)` (line 199). Sets awareness `tabId: agent-${agentId}` (line 208).

**CRDT write (Y.Doc structure):** Content lives in THREE co-located Y-types:
- `document.getXmlFragment('default')` — authoritative structured body (ProseMirror tree via @tiptap/y-tiptap)
- `document.getText('source')` — character-level Y.Text mirror (markdown source)
- `document.getMap('metadata')` — frontmatter string

`applyAgentMarkdownWrite(dc.document, markdown, position)` at `agent-sessions.ts:93-163` reads XmlFragment → serializes → composes new body → `updateYFragment` (line 142) writes structurally → `applyFastDiff(ytext, ytext.toString(), canonicalFull)` (line 155) mirrors into Y.Text. Both writes happen inside one `dc.document.transact(() => {...}, AGENT_WRITE_ORIGIN)` (`api-extension.ts:1171-1181`) — the paired-write invariant.

**Contributor tracking (side-channel):** Immediately after the transact block: `recordContributor(resolvedDocName, agentId, agentName, colorSeed)` at `api-extension.ts:1182`. The ONLY surface today where per-agent identity survives past the transact boundary. Accumulates into `pendingContributors: Map<agentId, {agentId, displayName, colorSeed, docs: Set<string>}>` (`contributor-tracker.ts:20`).

**onStoreDocument trigger:** When `document.transact(...)` completes, Y.Doc emits `update` → `Document.handleUpdate` → `Hocuspocus.handleDocumentUpdate` (`Hocuspocus.ts:263-311`). This is where origin info exists. Hocuspocus extracts:
- `connection` (only if `origin.source === 'connection'` — not our case)
- `context` — from `origin.context` when source is `'local'` (our case: `{origin: 'agent-write', paired: true}`)

`shouldSkipStoreHooks(origin)` at `types.ts:40-50` returns `origin.skipStoreHooks ?? false`. `AGENT_WRITE_ORIGIN.skipStoreHooks = false` (`agent-sessions.ts:59`), so `storeDocumentHooks(document, storePayload)` fires. The `storePayload` includes `lastContext: context` and `lastTransactionOrigin: origin` (lines 301-308).

**L1 debounce:** `storeDocumentHooks` debounces by `debounceId = 'onStoreDocument-${document.name}'` at `this.configuration.debounce` (default 2000ms).

**onStoreDocument handler (persistence):** `persistence.ts:405`: the extension handler destructures `{document, documentName}` — **discards `lastTransactionOrigin` and `lastContext`.** Load-bearing gap: per-agent identity that Y.js/Hocuspocus preserves until this exact point is dropped here. The handler:
1. Reads XmlFragment → markdown (lines 409-417)
2. Reconciled-base skip gate (lines 426-427) — no-op if content unchanged
3. Atomic temp+rename disk write: `writeFile(tmpPath, ...); rename(tmpPath, canonicalPath)` (lines 488-490)
4. `setReconciledBase(documentName, markdown)` (line 512)
5. `scheduleGitCommit()` (line 521)

**L2 debounce:** `scheduleGitCommit` at `persistence.ts:284-302` sets `gitCommitTimer = setTimeout(..., commitDebounceMs)` where `commitDebounceMs = 15_000` (line 164). Single-flight via `commitInFlight`.

**L2 fires → commitToWipRef:** `persistence.ts:181-282`. Reads `swapContributors()` snapshot, calls `formatContributorsFrom(snapshot)` to produce `ok-contributors: {...}` JSON lines in commit body. Message: `` `WIP auto-save ${ISO_timestamp}${contributors}` ``. Calls `commitWip(shadow, defaultWriter, contentRoot, message, branch)` where `defaultWriter = {id:'server', name:'openknowledge-server', email:'noreply@openknowledge.local'}` (lines 169-173). The per-agent identity from the contributor snapshot never becomes the ref-level or author-level attribution — it only appears as JSON lines in the message body.

**git plumbing:** `commitWip` at `shadow-repo.ts:126-203`:
1. `tmpIndex = resolve(shadow.gitDir, 'index-wip-${writer.id}')` (line 133)
2. `ref = 'refs/wip/${branch}/${writer.id}'` (line 134)
3. `read-tree` to seed index from `ref^{tree}` (or empty on first commit)
4. `git add ${contentRoot}` with `GIT_INDEX_FILE: tmpIndex` — stages from the **disk file**, not from Y.Doc
5. `write-tree` produces `treeSha`
6. `commit-tree treeSha -m message -p parentSha` with `GIT_AUTHOR_NAME: writer.name`, `GIT_AUTHOR_EMAIL: writer.email`, `GIT_COMMITTER_NAME: 'openknowledge'` (hardcoded, lines 188-189)
7. `update-ref ${ref} ${commitSha}`

**Key answers:**
- Content physically lives in `XmlFragment` (structured) + `Y.Text('source')` (mirror) + `Y.Map('metadata')` (frontmatter).
- `onStoreDocument` fires on every `update` event from Y.Doc that doesn't set `skipStoreHooks`, debounced per-doc.
- The disk file IS written from Y.Doc state inside `onStoreDocument` (`persistence.ts:489-490`), and that is what `git add` stages at commit time. **Y.Doc state is not read at commit time** — the commit sees whatever the disk file contains.
- Origin survives to `onStoreDocumentPayload` (`lastTransactionOrigin`, `lastContext`) but is destructured away by `persistence.ts:405`.
- `onStoreDocument` fire and `commitToWipRef` fire are layered: L1 per-doc debounce (2s) → disk write → schedule L2 (15s) → one shadow commit globally. Between write and L2 fire, any number of docs/agents may land additional writes; the commit is one coarse transaction covering all.

## 3. Origin survival analysis

**(a) Observer callback access** — Confirmed in `server-observers.ts:421-454` (observerA) and `server-observers.ts:619-649` (observerB). Both take `(events, transaction)` and read `transaction.origin` directly. Structural check `isPairedWriteOrigin(origin)` (lines 124-128) works on remote-arriving origins whose object identity was lost on the wire.

**(b) Item-level persistence** — **Negative.** `Y.ID` at `node_modules/yjs/src/utils/ID.js:7-24` is `{client: number, clock: number}` only. The `client` is the Y.Doc instance's `clientID`, not the agent. On the server, there is ONE Y.Doc per document, so ALL items created on the server share the same `client` value regardless of which agent wrote them. Checking `item.id.client` tells you only "server wrote this" vs "some remote client wrote this" — useless for multi-agent attribution through a single DirectConnection.

**(c) Post-facto enumeration by origin** — **Negative.** Y.js provides no API to enumerate items by origin. `writeUpdateMessageFromTransaction` at `Transaction.js:130-138` writes `structsFromTransaction` + `deleteSet`; `transaction.origin` is never encoded. Origin is a JavaScript runtime reference alive only for the duration of the transaction and in listeners that read it synchronously.

**(d) AttributionManager / Y.js attribution plugin** — None exist in mainline Y.js. Peritext has been explored for per-author marks but attributes range-based marks, not structural items, and requires a fork of Y.js semantics. No drop-in Y.js attribution layer exists today.

**Conclusion:** The only reliable carrier of per-agent identity across the CRDT→git boundary is an explicit side-channel recorded by the writer at write time. The `recordContributor(...)` in `api-extension.ts:1097, 1182, 1715` is exactly such a side-channel; `swapContributors()` at commit time (`persistence.ts:186`) is the drain. Per-session refs would use the same side-channel, just keyed differently at the commit step.

## 4. Per-session commit mechanics

### Option A — doc-state-after-session's-write (FEASIBLE)

**Mechanics.** On L2 debounce fire, inspect the contributor snapshot (already drained atomically via `swapContributors`). For each distinct `agentId` in the snapshot, emit one `commitWip(shadow, {id: 'agent-' + rawId, name, email}, contentRoot, message, branch)` call. Same `contentRoot` means `git add` produces the same `treeSha` for all per-agent commits in this drain — **git allows this**: multiple refs pointing at commits with the same tree is routine. `commit-tree` uses the tree SHA and embeds author/committer metadata in the commit object, so the refs diverge on the commit object (different author, different parent chains) while sharing tree objects.

**Ref evolution.** `refs/wip/main/agent-X` advances when agent X writes. On the next L2 drain, if only agent Y wrote, `refs/wip/main/agent-X` stays put; `refs/wip/main/agent-Y` advances. `git log refs/wip/main/agent-X` = the sequence of commits where X was a contributor — **one commit per drain in which X wrote, with the tree = doc state at that moment including all other agents' concurrent writes.**

**Three-agent scenario.** T1 X writes, T2 Y writes, T3 X writes, all within one 15s L2 window:
- X's commit trail: 2 commits (T1-drain if separate, T3-drain). Tree at T1 = doc-after-X1; tree at T3 = doc-after-Y-plus-X2.
- `git diff refs/wip/main/agent-X~..refs/wip/main/agent-X` INCLUDES Y's T2 work.
- Y's commit trail: 1 commit.

**Key property.** Each ref is a **narrative of when that agent wrote** with snapshots of the full doc. The ref is NOT a narrative of what that agent authored. This matches the timeline-UX invariant ("show this session's activity and what the doc looked like at each of their moments").

**Feasibility verification.** Save-version already demonstrates per-writer refs in production: `shadow-repo.ts:847-951` iterates `writers[]`, collects per-writer `refs/wip/${branch}/${w.id}`, and creates checkpoint parents pointing into each chain. Tests at `shadow-repo.test.ts:190-211` demonstrate `refs/wip/main/human-nick` and `refs/wip/main/agent-cursor` coexisting.

### Option B — isolated session contributions (INFEASIBLE)

**What it would mean.** `git log refs/wip/main/agent-X` shows only the textual delta X introduced. Would require either:

1. **Doc-state-with-only-X's-items filtering.** Y.js has no API for this. Items don't carry origin. Would need to fork Y.js to persist origin on items (breaks wire protocol, breaks CRDT convergence since items would need origin as part of their identity).
2. **Per-agent delta side-channel at transact time.** Capture `ytext.toString()` before the transact (baseline) and after; the diff is "what X's transaction produced." But: this diff captures the *effect* given pre-write state, not X's "contribution" semantically. If X replaces the whole doc, the diff shows all of it. Fragments pulled from different agents' diffs will rarely compose into valid markdown documents.
3. **Per-agent branches in a CRDT state history.** Automerge does this; Y.js doesn't. Y.js's state is a single linear update log per Y.Doc.

**Verdict.** B cannot be built on Y.js's current abstractions without a fork or accepting approximation (option 2, with known coherence gaps).

### Option C — baseline-diff (COMPLEX, APPROXIMATE)

**What it would mean.** Per-session ref stores diffs-vs-baseline where baseline = "doc state with all non-me writes but none of mine."

**Complexity.** For K concurrent agents, computing baseline requires tracking per-agent "last-write pre-state" snapshot. Every write to any agent must update every other agent's baseline. State grows O(K × doc_size); updates O(K) per write.

**Approximation.** The option-2 side-channel from B (pre/post diff) is a weak form of C with the same coherence problems.

**Verdict.** Buildable but cost/complexity ~10-100× Option A for marginal gain. Commit trails still wouldn't be "pure contributions" — they'd be "diffs vs a chosen baseline," requiring UI-layer explanation.

## 5. Subsystem interactions

| Subsystem | Current behavior | Per-session impact | Refactor cost |
|---|---|---|---|
| **Branch switch / parkBranch** | `parkBranch(shadow, branch, 'server', docs)` at `standalone.ts:1044` uses hardcoded `sessionId='server'` → `refs/wip/${branch}/human-server`. Collapses all state into one park commit. | Park each live session's ref separately OR park once to synthetic snapshot + keep per-session refs frozen until restore. | Medium. One call site but signature changes. |
| **External change (`applyExternalChange`)** | `FILE_WATCHER_ORIGIN` in `external-change.ts:33`. Downstream L2 commit uses `defaultWriter = 'server'`. | Not an agent. Attribute to `external` writer classification. | Low. |
| **Rollback (`ROLLBACK_ORIGIN`)** | `api-extension.ts:127-131`, used at line 2237. | Server action. Either `rollback-server` writer OR attribute to triggering session (need to thread sessionId). | Low-medium. |
| **Managed rename (`MANAGED_RENAME_ORIGIN`)** | `api-extension.ts:144-148`, used at line 878. | Same options as rollback. | Low-medium. |
| **Save Version** | `shadow-repo.ts:847-951` already takes `writers: WriterIdentity[]`. | **Already per-writer compatible.** Need caller at `api-extension.ts:1864-1868` to pass full active-session writer list instead of hardcoded `[{id: 'server', ...}]`. | Trivial. |
| **GC** | `shadow-branch-gc.ts` deletes WIP refs after 24h grace when project branch is gone, scoped per branch. `parseWriterId` already recognizes `agent-*` prefix. | Need per-writer TTL (last-commit-time). Derivable from ref's committer-date. | Medium. |

**tmp-index collision:** `commitWip` shares tmp-index filename across concurrent calls for the *same* writer ID (`index-wip-${writer.id}`, `shadow-repo.ts:133`). Per-session sharding naturally eliminates same-ID contention. Single-flight (`commitInFlight`) still serializes index access across writers within one process.

## 6. Observer integration

**The paired-write path.** Agent writes XmlFragment AND Y.Text in one `dc.document.transact(() => {...}, AGENT_WRITE_ORIGIN)` block. When transact drains, Y.js fires:
1. `xmlFragment.observeDeep` callbacks (`server-observers.ts:421`)
2. `ytext.observe` callbacks (`server-observers.ts:619`)
3. `doc.on('afterAllTransactions')` — the settlement handler (`server-observers.ts:664-697`)

Both observers check `isPairedWriteOrigin(transaction.origin)` at lines 433, 629 — structural `ctx?.paired === true`. On match, synchronously refresh `lastSyncedXmlMd` baseline and decline to set dirty flags. Settlement handler sees `!xmlDirty && !textDirty`, calls `onDispatch?.('none')`, returns. **No OBSERVER_SYNC_ORIGIN inner transaction fires.**

**Persistence trigger source.** `OBSERVER_SYNC_ORIGIN.skipStoreHooks = true`. If settlement fired a sync, it would NOT trigger onStoreDocument. Under paired-write it doesn't fire. The `onStoreDocument` trigger IS the ORIGINAL outer `transact` with `AGENT_WRITE_ORIGIN` (skipStoreHooks: false).

**What persistence sees.** `onStoreDocumentPayload.lastTransactionOrigin` IS the `AGENT_WRITE_ORIGIN` object reference. `lastContext` is `{origin: 'agent-write', paired: true}` — **not the per-agent identity.** Because `AGENT_WRITE_ORIGIN` is a module-level frozen constant, every agent's write arrives with the same origin object identity and the same context literal. Per-agent identity is in `agentId` local to the HTTP handler, which is why `recordContributor` has to be called separately outside the transact.

**Implication for per-session.** Two paths:

1. **Contributor-tracker approach (extend existing side-channel).** Keep `AGENT_WRITE_ORIGIN` shared. On L2 drain, drive commit fan-out from the contributor snapshot. **Already wired end-to-end** — just change what `commitToWipRef` does with the snapshot (iterate → per-writer commits instead of one `'server'` commit with body lines).
2. **Per-session origin objects.** Construct `{source:'local', skipStoreHooks:false, context:{origin:'agent-write', paired:true, sessionId}}` per session. Then `lastTransactionOrigin.context.sessionId` is readable in `onStoreDocument`. Cost: any place using `AGENT_WRITE_ORIGIN` with `===` identity check must migrate to structural. Currently `isPairedWriteOrigin` is already structural, so the blast radius is smaller than it appears.

Contributor-tracker approach has smaller blast radius; per-session-origin approach is more typed.

## 7. Prior art

**Automerge `doc.change(author, fn)`.** Automerge tags each change with actor ID at change-creation time; persists on the change object, recoverable via `getAllChanges(doc)`. Per-author view is straightforward. Y.js's update log does NOT carry actor/origin metadata.

**Fossil SCM.** Per-commit author field standard in all DVCSes. Fossil has "timeline" as a first-class concept with author filtering. Ports to Y.js only via side-channel attribution.

**Pijul.** Per-patch author metadata; patches commute (unlike git). Non-CRDT model; not directly transferable.

**Y.js attribution plugins.** Searched the ecosystem — none provide item-level attribution. Peritext handles per-range marks, not per-item authorship, not drop-in for Y.js items.

**Bottom line.** The Y.js ecosystem treats origin as transaction-local debug metadata, not durable attribution. Every project needing per-author CRDT attribution builds a side-channel. `contributor-tracker.ts` is exactly that pattern.

## 8. Tradeoffs table

| Dimension | Status quo (body-derived) | Option A (per-session refs) | Option B (isolated) | Option C (baseline-diff) |
|---|---|---|---|---|
| **Git-nativeness** | Low | High | N/A | Medium |
| **Query ergonomics** | Parse JSON from body | `git log refs/wip/.../agent-X` native | N/A | Custom diff interpretation |
| **Concurrent-agent behavior** | One commit per drain, all contributors | Fan-out: one commit per contributor per drain, shared tree | Ideal if feasible | Complex |
| **Refactor cost** | Baseline | Low-medium | N/A | High |
| **Invariant-violation risk** | Low | Low-medium | N/A | Medium-high |
| **Undo-stack future-fit** | Poor | Good | N/A | Medium |
| **Timeline UX fit** | Requires JSON parse | Ref IS the activity | Ideal | Custom UX |
| **GC semantics** | Single ref branch-GC | Per-writer TTL needed | N/A | Per-writer + state |
| **Backward compat** | Baseline | Medium (multiple refs per branch) | N/A | Readers need new diff concept |

## 9. Key unresolved questions

1. **Does "session" mean `connectionId` (per MCP subprocess, stable across tool calls) or per-tool-call?** The existing `agentId = 'agent-${rawAgentId}'` in `api-extension.ts:1022` suggests `rawAgentId` comes from the HTTP request body — which in MCP is `identity.connectionId`. Worth confirming MCP layer reliably sets the same rawAgentId for all calls from one subprocess. (Current claim: yes per `identityRef` in `cli/src/mcp/server.ts:290-300`.)
2. **Writer-ID for `applyExternalChange`?** Not an agent. Options: reuse `upstream`, add `external` classification, or keep `server`.
3. **Should concurrent-agent contributions on the same drain all point to the SAME tree SHA (cheap)?** Git allows it. `git log --all --oneline` shows N commits per drain with identical diffs — slightly noisy for human consumption. Alternative: one "canonical" commit + linked refs. Needs UX input.
4. **Do non-hot paths need to call `recordContributor`?** Currently only agent-write, agent-write-md, agent-patch. Rollback, managed-rename, file-watcher do NOT. Under per-session, these need explicit writer-ID decisions.
5. **Does `swapContributors`'s drain semantics survive fan-out?** Partial-commit-success acceptable, or all-or-nothing? On commit-N failure, today `restoreContributors(snapshot)` merges everything back.
6. **Y.Doc `clientID` stability across restarts.** Regenerated per process start. Items written before restart carry a different clientID than items written after. Fine for CRDT convergence but another reason `item.id.client` can't serve as attribution.
