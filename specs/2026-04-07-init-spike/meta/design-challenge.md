# Design Challenge Findings

**Artifact:** specs/2026-04-07-init-spike/SPEC.md
**Challenge date:** 2026-04-07
**Total findings:** 7 (3 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: V7 (Yjs v14 delta protocol) carries high risk of being untestable, and the spec underweights the consequences of that outcome

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC3 (Framing validity)
**Location:** Section 3 (V7), Section 4 (Implementation Order), Assumptions A1/A2
**Issue:** The spec positions V7 as the critical fork point that "runs first" and determines the V4 approach. But V7 depends on three unverified assumptions stacking up simultaneously: (1) Yjs v14 RC is available and stable enough to use, (2) y-prosemirror v14-compatible bindings exist and work, and (3) @tiptap/y-tiptap works with Yjs v14 or can be bypassed.

External verification reveals:
- Yjs v14 is at **RC10** (March 29, 2025) -- still pre-release after months of RCs, suggesting instability or incomplete features.
- y-prosemirror's Yjs-14-compatible version is **v2.0.0-2** (December 2024 pre-release) -- over a year old, with only 2 pre-releases, indicating early/experimental status.
- @tiptap/y-tiptap (v3.0.2) has **no evidence of Yjs v14 compatibility**. The spec lists this as OQ3 but the consequence is underweighted: if @tiptap/y-tiptap pins to yjs@^13, the entire TipTap collaboration extension chain may refuse to install alongside yjs@14.
- Hocuspocus v3.4.4 likely also pins to yjs@^13. The spec does not address Hocuspocus + Yjs v14 compatibility at all.

The most likely outcome is that V7 fails with "Yjs v14 ecosystem not ready" -- a packaging/compatibility failure, not an architectural discovery. This would consume spike time (possibly significant, if the implementer tries to work around dependency conflicts) and produce no architectural signal.

**Current design:** "V7 runs first, determines V4 approach. If FAIL -> V4 uses serialize-on-toggle." (Section 3, V7; Section 4)
**Alternative:** Accept upfront that V7's most probable failure mode is "ecosystem not ready" (not "architecture doesn't work") and restructure the spike accordingly. Two options:

**(A) Deprioritize V7 to a best-effort exploration.** Run V2, V1, V3, V6, V4b, V5 as the primary spike validating the serialize-on-toggle architecture (which the spec already needs as the fallback). Attempt V7 only if time remains. The architectural question V7 answers (does the delta protocol work with a flat YType?) remains interesting for future work, but the product can ship without it -- as the spec itself acknowledges by having V4b.

**(B) Cap V7 at a strict time-box (2 hours).** If `npm install yjs@next` + y-prosemirror@2 + a minimal binding test doesn't work within 2 hours, document the dependency state and move on. Do not allow the implementer to clone repos, build from source, or work around peer dependency conflicts.

Both alternatives reduce risk of the spike spending its most productive time fighting npm rather than validating architecture.

**Trade-off:** Approach A forgoes validating the V7 hypothesis entirely, accepting serialize-on-toggle as the P0 architecture. Approach B preserves the V7 exploration but bounds the cost. Both are strictly better than the current "V7 runs first" ordering if V7's most likely failure is packaging, not architecture.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether V7 should gate the spike's execution order given the high probability of an ecosystem-readiness failure, and whether a strict time-box or deprioritization better serves the spike's goals.

---

### [H] Finding 2: The evidence files contradict the spec's Hocuspocus WebSocket upgrade code pattern

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3 (V2), evidence/hocuspocus-direct-connection.md
**Issue:** The spec's V2 code sample (SPEC.md line 98-118) and the evidence file (hocuspocus-direct-connection.md) show **different** WebSocket upgrade patterns, and the evidence file's pattern has a likely bug.

The **spec** shows:
```typescript
server.httpServer?.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/collab')) {
    hocuspocus.handleConnection(/* WebSocket upgrade handling */)
  }
})
```

The **evidence file** shows:
```typescript
server.httpServer?.on('upgrade', (req, socket, head) => {
  if (req.url === '/collab') {
    server.ws.handleUpgrade(req, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, req)
    })
  }
})
```

The evidence version uses `server.ws.handleUpgrade()` -- but Vite's `server.ws` is Vite's internal WebSocket server (for HMR), not a raw `ws` WebSocket.Server instance. It may not expose `handleUpgrade()`. The Vite Plugin API documentation shows `server.ws` used for `send()` and `on()` (message-level), not for raw upgrade handling.

The correct pattern likely requires instantiating a separate `ws.WebSocketServer({ noServer: true })` and calling its `handleUpgrade()`, or using Hocuspocus's own WebSocket handling. Neither the spec nor the evidence file shows this.

An implementer following either code sample verbatim will likely hit a runtime error -- exactly the kind of issue a spike should surface, but the spec presents it as a known, solved pattern rather than flagging the uncertainty.

**Current design:** V2 code sample presented as a verified pattern with "Known gotcha: Must intercept the WebSocket `upgrade` event BEFORE Vite's HMR handler claims it."
**Alternative:** Flag the WebSocket upgrade mechanism as the primary uncertainty in V2. The correct pattern may require: (a) a standalone `ws.WebSocketServer({ noServer: true })` for Hocuspocus, (b) Hocuspocus's own `handleUpgrade()` method if it exists, or (c) a completely different approach (e.g., separate port). The spec should acknowledge this is an open question, not present untested code as the solution.
**Trade-off:** Reduces implementer confidence in the provided pattern but prevents wasted time debugging a broken code sample.
**Status:** CHALLENGED
**Suggested resolution:** Verify whether Vite's `server.ws` exposes `handleUpgrade()`. If not, revise the V2 pattern to either use a standalone WebSocket server or flag this as the specific unknown V2 should resolve.

---

### [H] Finding 3: The spec omits validation of Hocuspocus persistence hook + markdown serialization integration (the V1-V5 bridge)

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3 (V5), Section 4 (Implementation Order)
**Issue:** V5 assumes the `onStoreDocument` hook receives a Y.Doc that can be serialized to markdown via the same pipeline validated in V1. But V1 validates the round-trip through @tiptap/markdown's browser-side API (which operates on TipTap's JSONContent), while V5's persistence hook runs **server-side** (in the Vite plugin context, Node.js).

The serialization path in V5 is: Y.Doc (from onStoreDocument) -> ProseMirror Node -> @tiptap/markdown serialize -> markdown string -> write to disk.

The gap: **how do you get from a Y.Doc to a ProseMirror Node on the server side?** This requires either:
1. `yDocToProsemirrorJSON()` from y-prosemirror (or @tiptap/y-tiptap) -- which needs a ProseMirror schema available server-side
2. A headless TipTap instance (TipTap supports server-side use via `@tiptap/core` without DOM)
3. Direct Yjs traversal + custom serialization

None of these are addressed in the spec or tested by any validation. V1 tests browser-side round-trip. V5 tests persistence hooks. But the bridge between them -- server-side Y.Doc-to-markdown serialization -- is untested.

If this bridge doesn't work, V5 cannot produce markdown files on disk, which means the entire CRDT-to-filesystem pipeline fails.

**Current design:** "onStoreDocument (Layer 1): serialize Y.Doc -> ProseMirror JSON -> markdown -> write .md file to disk." (V5 test procedure, step 2)
**Alternative:** Either: (a) add explicit validation that Y.Doc -> ProseMirror JSON -> markdown works server-side with the correct schema, or (b) restructure V5's persistence to serialize on the **client side** and send the markdown string to the server for writing (simpler but less clean), or (c) acknowledge this as a sub-validation within V5 that may fail independently of the hook mechanics.
**Trade-off:** Option (a) adds scope to V5. Option (b) changes the architecture (client-side serialization means a disconnecting client loses its pending serialization). Option (c) just documents the risk without adding scope.
**Status:** CHALLENGED
**Suggested resolution:** Add a sub-step to V5 that explicitly validates server-side Y.Doc-to-markdown serialization before testing the full persistence pipeline. This is a separate failure point from "do the hooks fire?"

---

## Medium Severity

### [M] Finding 4: V4b's concurrent-edit test (steps 8-9) describes a scenario that is architecturally impossible under the specified design

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3 (V4b), steps 8-9
**Issue:** V4b step 8 says: "while in source mode, trigger a DirectConnection write (V3) to a DIFFERENT paragraph." V4b step 9 says: "trigger a DirectConnection write to the SAME paragraph."

But V4b's design specifies that source mode **writes to disk** and the CRDT is not being updated during source editing. The user is in a non-collaborative CodeMirror instance editing a serialized markdown snapshot. The DirectConnection write goes to the Y.XmlFragment in the CRDT. On toggle-back, `updateYFragment` reconciles.

The test is correct in intent (verify merge behavior on toggle-back), but the spec's language ("trigger a DirectConnection write... while in source mode") may mislead the implementer about **when** the conflict is detected. The conflict isn't concurrent in the CRDT sense -- it's a divergence between the disk-based snapshot and the CRDT-based document that gets reconciled synchronously on toggle-back. The word "concurrent" is misleading for what is actually a merge-on-reconnect scenario.

More substantively, step 9 expects "user's version wins, agent's edit lost for that paragraph" -- but `updateYFragment` performs a structural diff, not a per-paragraph last-writer-wins. The actual behavior depends on whether the paragraph structure changed (text edit within the same node may merge; structural changes like splitting paragraphs may clobber). The spec's prediction about what happens is stated with more confidence than the evidence supports.

**Current design:** "Test concurrent scenario: while in source mode, trigger a DirectConnection write to the SAME paragraph... Expected: user's version wins, agent's edit lost."
**Alternative:** Rephrase as "divergence scenario" rather than "concurrent." Drop the prediction of "user's version wins" and instead make the validation goal: "Document exactly what updateYFragment does when the CRDT and the toggle-back ProseMirror node have diverged in the same paragraph." This is a characterization test, not a pass/fail. The outcome informs the product design (whether to warn users, how to handle agent-during-source-mode writes).
**Trade-off:** None -- this is a documentation/framing improvement that makes the validation more honest about what it can learn.
**Status:** CHALLENGED
**Suggested resolution:** Reframe V4b steps 8-9 as characterization tests rather than pass/fail with predicted outcomes. The spec itself says "the spike should characterize it, not fix it" (Risk R3) -- the V4b test procedure should match that philosophy.

---

### [M] Finding 5: The "~150 lines of fixes" claim for V1 is presented as a validated estimate, but it originates from a single research report and has never been implemented

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Section 3 (V1), lines 148-154
**Issue:** The spec repeatedly cites "~150 lines of custom fixes" as if this is a measured quantity. This number comes from the markdown-roundtrip-fidelity-tiptap report's **estimate**, not from working code. The report describes what _should_ work based on API analysis, not what _does_ work.

The spec lists four fixes:
1. Frontmatter: strip before parse, re-prepend on serialize (~30 lines)
2. Tight/loose lists: custom extension with `tight` attribute (~50 lines)
3. Task list checkboxes: task list extension + renderMarkdown (~20 lines)
4. Normalize-on-first-load: run one round-trip on initial file load (~15 lines)

These are ~115 lines, not ~150. But the real concern is that none of these have been built. The tight/loose list fix in particular requires modifying how @tiptap/markdown's marked tokenizer processes list tokens -- this is non-trivial and may not be achievable via the public `marked.use()` extension API. If the marked extension hooks don't expose the `loose` property on list tokens, the fix may require patching marked internals, which changes the effort significantly.

This matters because V1's pass criteria include "zero semantic loss for standard content types" after fixes. If the fixes turn out to be harder than estimated, V1's pass/fail determination becomes muddied -- it's not the round-trip that failed, it's the fix complexity that was underestimated.

**Current design:** "Implement the ~150 LOC fixes... Re-run the round-trip with fixes applied. Verify improved fidelity."
**Alternative:** Split V1 into two sub-validations: (a) measure the raw round-trip fidelity WITHOUT fixes (this is the ground truth), and (b) attempt the fixes and measure improvement. If the fixes prove harder than expected, V1a still produces valuable data -- the raw fidelity measurement tells you whether the architecture works, even if the polish needs more effort.
**Trade-off:** Makes V1 take slightly longer but produces a clearer signal. The raw measurement (V1a) is the load-bearing finding; the fixes (V1b) are an effort estimate validation.
**Status:** CHALLENGED
**Suggested resolution:** Consider separating the round-trip measurement from the fix implementation to isolate the two different questions V1 is answering.

---

### [M] Finding 6: D3 (Source toggle V4b uses file watcher sync) was DIRECTED but the reasoning "source mode writes to disk, same path as Cursor interop" conflates two different use cases with different requirements

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** Decision Log D3, Section 3 (V4b)
**Issue:** D3 justifies V4b's "file watcher sync" approach by noting it follows "the same path as Cursor interop." But the Cursor interop path (external editor writes to disk, file watcher detects change, syncs to CRDT) has fundamentally different timing and consistency requirements than the source toggle path (user toggles between views of the same document).

For Cursor interop, eventual consistency with multi-second latency is acceptable -- the user is in a different application and doesn't expect real-time sync. For source toggle, the user is clicking a button to switch views within the same application and expects immediate consistency.

V4b's design writes markdown to disk on source-mode saves, then on toggle-back reads from disk. This works for the toggle use case. But the Decision Log's rationale ("same path as Cursor interop") implies these are architecturally the same path, which they are not:

- **Toggle path:** Write to disk on toggle-to-source, read from disk on toggle-back. Synchronous, user-initiated, single-document.
- **Cursor interop path:** External process writes to disk, @parcel/watcher detects change, CRDT updated. Asynchronous, event-driven, any document.

V4b's test procedure (step 3a-3c, 5a-5d) describes the toggle path. The file watcher is NOT involved in V4b at all -- it's a direct write/read. The Decision Log's rationale is misleading. What V4b actually validates is "serialize to disk, read from disk" -- which is simpler than file watcher sync and doesn't require @parcel/watcher at all for the toggle case.

**Current design:** D3 rationale: "source mode writes to disk, same path as Cursor interop"
**Alternative:** Clarify that V4b's toggle mechanism is synchronous write/read (no file watcher), while Cursor interop (future work) uses asynchronous file watching. The toggle path is simpler than the Decision Log suggests. This also means V4b doesn't need to validate @parcel/watcher or the feedback loop prevention -- those are V5/future-work concerns, not source toggle concerns.
**Trade-off:** Simplifies V4b's scope (removes file watcher dependency for the toggle case). May need to revise V4b's implementation notes about feedback loops, which apply to the Cursor interop path, not the toggle path.
**Status:** CHALLENGED
**Suggested resolution:** Distinguish the synchronous toggle path from the asynchronous file-watcher path in V4b's design. Remove the file watcher from V4b's scope if it is not actually needed for the toggle use case.

---

## Low Severity

### [L] Finding 7: The test fixture omits a task list, which is listed as one of the ~150 LOC fixes

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 3 (V1), test fixture content (lines 166-221)
**Issue:** V1's fix list includes "Task list checkboxes: task list extension + renderMarkdown (~20 lines)" as one of the four fixes. But the test fixture markdown (Section 3, V1, lines 166-221) does not contain a task list. The round-trip measurement cannot detect task list checkbox loss if the fixture doesn't include one.

This is a minor gap -- adding `- [x] Done item\n- [ ] Pending item` to the fixture resolves it. But it illustrates that the fixture was designed separately from the fix list and the two are not aligned.

**Current design:** Test fixture contains headings, paragraphs, lists, code blocks, tables, blockquotes, images, horizontal rules, and a JSX component block -- but no task list.
**Alternative:** Add a task list section to the test fixture.
**Trade-off:** None.
**Status:** CHALLENGED
**Suggested resolution:** Add a GFM task list to the test fixture to ensure the task list fix is actually validated.

---

## Confirmed Design Choices (summary)

### DC1 (Simpler alternative)

- **TipTap + y-prosemirror as the WYSIWYG editor binding:** Held up. The research comprehensively evaluates the full option space. No simpler alternative achieves the same goals without multi-month investment. The stack is the right starting point.
- **Fenced code block with custom info string for void nodes (D2):** Held up strongly. The evidence file makes a thorough case. CommonMark spec guarantees verbatim preservation. Graceful degradation in non-aware renderers. The rejected alternatives (raw HTML, HTML comments, Pandoc directives) each have concrete, documented flaws.
- **updateYFragment over prosemirrorJSONToYDoc (D5):** Held up. The evidence is clear that prosemirrorJSONToYDoc destroys collaboration state. This is correctly LOCKED.
- **@tiptap/markdown over prosemirror-markdown (D1):** Held up. Native TipTap integration, per-extension parse/render rules, and higher byte-identical rate (52% vs 48%) justify the choice.
- **Git WIP refs via simple-git .raw():** Held up. The plumbing command approach avoids checkout and is a clean separation from the working branch.

### DC2 (Stakeholder gap)

- **DirectConnection write ordering (Hocuspocus #832):** Documented and mitigated. The spec correctly identifies this as a known issue with a clear workaround.
- **updateYFragment clobber risk (R3):** Appropriately documented as a known limitation for characterization, not fix. The spec's Risk section is honest about this.
- **CodeMirror duplicate install risk:** Documented with the overrides solution. This is a well-known ecosystem issue.

### DC3 (Framing validity)

- **The SCR framing is sound.** The Situation (15+ decisions from individual research), Complication (untested integration), and Resolution (integrated prototype) are genuinely interconnected. The spike is justified -- the risk of building on untested assumptions is real.
- **The spike's "most valuable output is what breaks" philosophy:** This is the correct framing for an engineering spike. The pass/fail structure with documented evidence for failures is well-designed.
- **Implementation order (D7):** The dependency graph (V7+V2 first, then V1/V3/V6, then V4/V5) is correctly mapped -- though V7's priority is challenged separately in Finding 1.
