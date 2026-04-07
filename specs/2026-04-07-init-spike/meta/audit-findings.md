# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-07-init-spike/SPEC.md
**Audit date:** 2026-04-07
**Total findings:** 10 (3 high, 4 medium, 3 low)

---

## High Severity

### [H1] Finding 1: Hocuspocus #832 listed as active known issue, but it was fixed in v2.13.2 -- spec's mitigation guidance may mislead the implementer

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** V3 (DirectConnection Writes), section "Known issue (Hocuspocus #832)"
**Issue:** The spec describes Hocuspocus #832 (DirectConnection state corruption / orphaned doc) as an active known issue requiring mitigation ("ensure the editor (WebSocket client) is connected before opening DirectConnection"). GitHub confirms this bug was fixed in Hocuspocus v2.13.2 (release notes: "fixes a bug that could lead to data loss when using directConnection with custom y origin (#832)"). The spec pins @hocuspocus/server at ^3.4.0, which includes this fix. The implementer would spend time implementing a mitigation for a bug that no longer exists at the pinned version.
**Current text:** "Known issue (Hocuspocus #832): If DirectConnection opens when zero WebSocket clients are connected, clients connecting within the debounce window (~2s) may get an orphaned doc. Mitigation: ensure the editor (WebSocket client) is connected before opening DirectConnection. Document if this occurs."
**Evidence:** [GitHub Issue #832](https://github.com/ueberdosis/hocuspocus/issues/832) -- closed, fixed in v2.13.2. The spec pins ^3.4.0 which includes the fix. The evidence file `evidence/hocuspocus-direct-connection.md` also lists this as "active as of 2026-04-07" (line 30).
**Status:** STALE
**Suggested resolution:** Downgrade from "Known issue" to historical context. Change to: "Hocuspocus #832 (DirectConnection state corruption) was fixed in v2.13.2. The spike's pinned version (^3.4.0) includes this fix. If unexpected sync behavior occurs when DirectConnection opens before any WebSocket client, check whether a regression has reintroduced the issue." Also update `evidence/hocuspocus-direct-connection.md`.

---

### [H2] Finding 2: Vite plugin code pattern uses `server.ws.handleUpgrade()` which does not exist on Vite's WebSocket API

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** V2 (Hocuspocus Embedded in Vite), implementation pattern code block; `evidence/hocuspocus-direct-connection.md` lines 47-57
**Issue:** The evidence file's "Hocuspocus in Vite" code pattern calls `server.ws.handleUpgrade(req, socket, head, (ws) => { hocuspocus.handleConnection(ws, req) })`. Vite's `server.ws` is Vite's own internal HMR WebSocket server (type `WebSocketServer` from Vite internals), NOT a standard `ws` module `WebSocket.Server`. It does not expose a `handleUpgrade()` method. The spec's V2 implementation pattern (lines 98-118) uses `server.httpServer?.on('upgrade', ...)` which correctly accesses the raw HTTP server, but it calls `hocuspocus.handleConnection(/* WebSocket upgrade handling */)` without showing how to actually perform the WebSocket upgrade. The implementer needs to create their own `ws.WebSocketServer({ noServer: true })` instance and call `wss.handleUpgrade()` on it to get a WebSocket object to pass to `hocuspocus.handleConnection()`. The evidence file pattern will produce a runtime error.
**Current text (evidence file):** `server.ws.handleUpgrade(req, socket, head, (ws) => { hocuspocus.handleConnection(ws, req) })`
**Current text (spec):** The V2 implementation pattern shows `hocuspocus.handleConnection(/* WebSocket upgrade handling */)` as a placeholder comment.
**Evidence:** [Vite Plugin API docs](https://vite.dev/guide/api-plugin) -- `server.ws` is Vite's HMR WebSocket with `send()` and `on()` methods, no `handleUpgrade`. [Hocuspocus Server Examples](https://tiptap.dev/docs/hocuspocus/server/examples) -- `handleConnection(websocket, request, context)` requires a WebSocket object. Standard pattern requires `new WebSocketServer({ noServer: true })` from the `ws` package, then `wss.handleUpgrade(req, socket, head, (ws) => hocuspocus.handleConnection(ws, req))`.
**Status:** CONTRADICTED
**Suggested resolution:** Fix the evidence file's code pattern to use a standalone `ws.WebSocketServer({ noServer: true })`. The spec's V2 pattern already uses `server.httpServer?.on('upgrade', ...)` which is correct for intercepting the upgrade event, but should show the complete pattern including creating a `ws.WebSocketServer` and calling its `handleUpgrade`. Add `ws` to the dependency list in section 5 (it is an implicit dependency of Hocuspocus but needed explicitly for the `noServer` pattern).

---

### [H3] Finding 3: Yjs v14 availability is the highest-risk assumption but the spec treats it with insufficient alarm -- v14 does not appear to exist on npm or as a public release

**Category:** FACTUAL
**Source:** T3 (3P dependencies), T4 (Web verification)
**Location:** V7 (Yjs v14 Delta Protocol), Section 9 (Assumptions A1/A2), Section 5 (Tech Stack)
**Issue:** The spec's V7 validation hinges entirely on Yjs v14 RC existing and being usable. Web search confirms the latest Yjs version on npm is 13.6.30 (published ~20 days ago). No `yjs@next` tag, no v14 RC, and no public Yjs 14 release or release candidate is findable on npm, the Yjs GitHub releases page, or the Yjs community forum. The peritext-on-yjs-feasibility report discusses "Yjs 14's refactored y-prosemirror" and "unified YType class" but its own Limitations section acknowledges these are "Not Fully Confirmed" -- "Whether y-prosemirror v14's delta protocol actually works when given a flat YType -- requires empirical testing" and "Whether Yjs 14's unified YType is stable enough for production (currently RC)". There appears to be a version confusion: the source-toggle-architecture report's evidence confirms that Yjs has been refactored to a unified `YType` class, but this may be in the current v13.x codebase, not a separate "v14" release. The spec should be explicit about the high probability of V7 FAIL due to non-availability, and the implementer's first action should be checking npm before attempting any V7 work.

The spec does handle this gracefully (A1 marks it MEDIUM confidence, V7 has explicit "If v14 is not available" FAIL guidance, and the architecture falls back to V4b). However, the framing treats V7 as a "might work, let's try" rather than "very likely unavailable based on current npm state." This matters because the implementer (an AI agent) might spend significant time trying to locate, clone, and build an unreleased version from source when the correct outcome is a fast FAIL.
**Current text:** "Use Yjs v14 RC (the unified YType refactor). Check npm for `yjs@next` or `yjs@14.0.0-rc.*`. If v14 is not published to npm, clone the yjs repo and build from source." (V7 implementation notes)
**Evidence:** [npm yjs package](https://www.npmjs.com/package/yjs) -- latest version 13.6.30 as of 2026-04-07. No v14 RC or `@next` tag found. [Yjs GitHub releases](https://github.com/yjs/yjs/releases) -- no v14 release found in search results.
**Status:** INCOHERENT
**Suggested resolution:** Add to V7 implementation notes: "NOTE: As of spec writing, no Yjs v14 release or RC is publicly available on npm. The unified YType refactor described in research reports may refer to internal restructuring within the v13.x line. The implementer should: (1) check `npm view yjs versions` for any v14 tag, (2) check `npm view yjs dist-tags` for a `next` tag, (3) if neither exists, check the Yjs GitHub repo main branch for evidence of the unified YType/DeltaConf refactor. If v14 is genuinely unavailable, record V7 as FAIL within 15 minutes and proceed to V4b." Adjust A1 confidence from MEDIUM to LOW.

---

## Medium Severity

### [M1] Finding 4: Spec pins `yjs: "^13.6.30"` in the dependency list but V7 requires Yjs v14 -- contradictory version requirements

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 5 (Tech Stack) vs. V7 (Yjs v14 Delta Protocol)
**Issue:** Section 5's package.json lists `"yjs": "^13.6.30"` as a verified dependency. V7's entire hypothesis depends on Yjs v14's unified YType. These are contradictory: you cannot test the v14 delta protocol with v13.6.30. The spec does note "For V7 specifically: May need `yjs@next` (v14 RC) or building from source" but this is a parenthetical addition that doesn't resolve the package.json listing v13 as the pinned version.
**Current text:** Package list says `"yjs": "^13.6.30"`. V7 says "Use Yjs v14 RC (the unified YType refactor)."
**Evidence:** Internal contradiction within the spec.
**Status:** INCOHERENT
**Suggested resolution:** Split the dependency specification: "For V1-V6: `yjs: ^13.6.30`. For V7: requires `yjs@next` or `yjs@14.0.0-rc.*` if available; if unavailable, V7 is FAIL." Or add a conditional note to the package.json block.

---

### [M2] Finding 5: `skipStoreHooks` flag attributed to "Hocuspocus v4+" but the spec pins @hocuspocus/server ^3.4.0

**Category:** FACTUAL
**Source:** T4 (Web verification), L4 (Evidence-synthesis fidelity)
**Location:** V4b (Source Toggle, feedback loop prevention reference), Risk R4
**Issue:** The spec references `reports/crdt-mcp-filesystem-bridge/evidence/feedback-loop-prevention.md` for the feedback loop prevention pattern. That evidence file states: "The `skipStoreHooks` flag on LocalTransactionOrigin (added in Hocuspocus v4) allows DirectConnection writes to opt out of triggering `onStoreDocument`." The spec pins @hocuspocus/server at ^3.4.0. If `skipStoreHooks` is genuinely a v4 feature, it is not available in the spike's pinned version. This could make the V4b feedback loop prevention pattern unimplementable as described. Web search could not confirm the exact version where `skipStoreHooks` was introduced.
**Current text:** V4b references `evidence/feedback-loop-prevention.md`. R4 says "Implement content-hash write tracking to suppress self-echo."
**Evidence:** `evidence/feedback-loop-prevention.md` line 100-101: "The `skipStoreHooks` flag on LocalTransactionOrigin (added in Hocuspocus v4)". Spec section 5: `"@hocuspocus/server": "^3.4.0"`.
**Status:** UNVERIFIABLE
**Suggested resolution:** Verify whether `skipStoreHooks` exists in @hocuspocus/server 3.4.x by checking the actual types. If it does not, the content-hash approach (which the spec also mentions) is the sole feedback loop prevention mechanism and should be called out as the primary approach rather than an alternative. Add an open question: "Does @hocuspocus/server 3.4.x include skipStoreHooks on LocalTransactionOrigin?"

---

### [M3] Finding 6: V1 claims "~150 lines of custom fixes" but references a 27-pattern test; the spec says 4 patterns need fixing, evidence says 12 lossy patterns

**Category:** COHERENCE
**Source:** L2 (Confidence-prose misalignment), L4 (Evidence-synthesis fidelity)
**Location:** V1 (Markdown Round-Trip Fidelity)
**Issue:** The spec states: "After applying ~150 lines of custom fixes (frontmatter, tight/loose lists, task list checkboxes), the round-trip is lossless for standard knowledge platform content." The research report identifies 12 lossy patterns total: 4 fixable (with ~150 LOC), 5 cosmetic, and 3 fundamental. The spec's claim of "lossless" after fixes is slightly overconfident -- it should say "lossless for semantic content" or "zero semantic loss." The fundamental losses (reference links converted to inline, blank line count normalization) still occur but are correctly categorized as non-semantic. Additionally, the spec says "the output converges after exactly 1 cycle" -- this is confirmed by the research report and is correct.

The spec also says the test has "27 patterns" in section 14 but the V1 test fixture has only 12 content types listed. This is fine for a spike (the 27 are from the research report's exhaustive test; the spike fixture is representative), but the gap should be acknowledged.
**Current text:** "After applying ~150 lines of custom fixes... the round-trip is lossless for standard knowledge platform content."
**Evidence:** Research report: "Zero semantic information is lost for standard knowledge platform content types" but "14/27 byte-identical" and 3 fundamental structural changes remain after fixes.
**Status:** INCOHERENT
**Suggested resolution:** Change "lossless" to "zero semantic loss" in V1's hypothesis. This matches the research report's language precisely and avoids implying byte-identical output.

---

### [M4] Finding 7: V3 DirectConnection code sample uses approximate Yjs API that may not match y-prosemirror's expected ProseMirror node structure

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** V3 (DirectConnection Writes), code sample lines 248-260
**Issue:** The spec's V3 DirectConnection code sample inserts content using raw Yjs XML APIs (`new Y.XmlElement('paragraph')`, `new Y.XmlText()`, `text.insert()`). The spec itself acknowledges this is approximate ("The above is approximate -- verify against y-prosemirror's expected structure"). However, this is actually a critical implementation detail, not a minor note. y-prosemirror maps ProseMirror node types to Yjs XmlElement names, and the exact structure (including attribute mapping) must match what y-prosemirror expects, or the editor will fail to render the inserted content. The open question is flagged but buried; for an AI implementer, this needs to be elevated to a "verify first" step.
**Current text:** "What's the correct Yjs API for inserting a fully-formed paragraph into a Y.XmlFragment? The above is approximate -- verify against y-prosemirror's expected structure."
**Evidence:** The source-toggle-architecture evidence confirms y-prosemirror maps ProseMirror schema to Yjs types with specific naming conventions.
**Status:** INCOHERENT
**Suggested resolution:** Elevate the open question to the test procedure itself: "Step 2a (prerequisite): Inspect how y-prosemirror creates Yjs nodes from ProseMirror nodes by reading the y-prosemirror source. Use the same node creation pattern in the agent-sim script." The code sample should be explicitly marked as pseudocode, not runnable code.

---

## Low Severity

### [L1] Finding 8: The spec references `@tiptap/y-tiptap` in V7 open questions but the package list in Section 5 does not include it

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** V7 open questions vs. Section 5 (Tech Stack)
**Issue:** V7 asks "Does `@tiptap/y-tiptap` v3.0.2 work with Yjs v14, or does it pin to v13?" The evidence file `package-versions.md` lists `@tiptap/y-tiptap: 3.0.2` as a verified package, and `tiptap-markdown-serialization.md` explains that TipTap v3 uses `@tiptap/y-tiptap` (not y-prosemirror directly). However, Section 5's package.json does not include `@tiptap/y-tiptap` -- it lists `@tiptap/extension-collaboration: ^3.20.0` which depends on it transitively. This is technically fine (it's a transitive dependency), but for V7 specifically the implementer needs to understand this dependency chain.
**Current text:** Section 5 lists `@tiptap/extension-collaboration: ^3.20.0`. V7 asks about `@tiptap/y-tiptap`.
**Evidence:** `evidence/package-versions.md` confirms `@tiptap/y-tiptap: 3.0.2` is the actual binding package.
**Status:** INCOHERENT
**Suggested resolution:** Add a comment in Section 5 noting that `@tiptap/extension-collaboration` depends on `@tiptap/y-tiptap` (the TipTap-maintained fork of y-prosemirror). For V7, the implementer may need to work with `@tiptap/y-tiptap` directly or with `y-prosemirror` from source.

---

### [L2] Finding 9: V5 test procedure says "afterStoreDocument (Layer 2)" but this hook name may not exist in Hocuspocus

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** V5 (Git Auto-Persistence Pipeline), step 2
**Issue:** V5 says to configure `afterStoreDocument` as the Layer 2 hook for git commits. Hocuspocus documentation lists `onStoreDocument` as a hook but `afterStoreDocument` is less clearly documented. The hook may exist (it appears in the Hocuspocus types) but its behavior relative to `onStoreDocument` (sequential? parallel? guaranteed to fire after?) is an open question that the spec itself flags in OQ5. This is low severity because the spec already flags it as an open question, but the test procedure uses it as if it's confirmed API.
**Current text:** "`afterStoreDocument` (Layer 2): `git add` + `git commit` to a WIP ref"
**Evidence:** [Hocuspocus Hooks docs](https://tiptap.dev/docs/hocuspocus/server/hooks) list `onStoreDocument` prominently but `afterStoreDocument` is less documented.
**Status:** UNVERIFIABLE
**Suggested resolution:** Add to OQ5: "Does `afterStoreDocument` fire reliably after `onStoreDocument` completes? If not available, Layer 2 git commits can be triggered at the end of the `onStoreDocument` handler itself (after the markdown write completes)."

---

### [L3] Finding 10: Decision D3 describes V4b as "file watcher sync" but V4b test procedure does not actually use a file watcher for the toggle-back path

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** Decision Log D3 vs. V4b test procedure
**Issue:** Decision D3 states: "Source toggle V4b approach: file watcher sync (not serialize-on-toggle in memory)." However, reading V4b's actual test procedure, the toggle-back path is: "Read the .md file from disk -> Parse markdown -> ProseMirror Node -> Apply to Y.XmlFragment via updateYFragment." This is serialize-on-toggle triggered by the user clicking the toggle button -- not a file watcher automatically syncing changes. The file watcher is relevant for the concurrent agent write scenario (step 8-9) and for V5's persistence, but the core toggle mechanism in V4b is user-initiated disk read, not watcher-initiated. The decision log's characterization is slightly misleading.
**Current text:** D3: "Source toggle V4b approach: file watcher sync (not serialize-on-toggle in memory)"
**Evidence:** V4b test procedure steps 5a-5d describe a user-initiated read from disk on toggle-back.
**Status:** INCOHERENT
**Suggested resolution:** Reword D3 to: "Source toggle V4b approach: serialize through disk (source mode writes to .md file, toggle-back reads from .md file). File watcher path used for external editor interop (Cursor), not for the toggle itself."

---

## Confirmed Claims (summary)

**Coherence (L1-L7):**
- L5: The implementation order in Section 4 correctly reflects the dependency graph described in the validation sections. V7+V2 first (parallel), V1/V3/V6 second (independent), V4/V5 third (dependent on earlier results). Confirmed coherent.
- L6: The spec maintains a consistent prescriptive stance throughout -- appropriate for a spike spec aimed at an AI implementer. No stance shifts detected.
- L4: The `updateYFragment` vs `prosemirrorJSONToYDoc` distinction (D5, V4b critical note) is accurately represented from the source-toggle-architecture evidence. The evidence file confirms `updateYFragment` is diff-based (sync-plugin.js lines 1145-1298) and `prosemirrorJSONToYDoc` creates a new Y.Doc (lib.js lines 299-302).
- L4: The markdown round-trip convergence claim ("output converges after exactly 1 cycle") is confirmed by the research report's D5 finding with empirical testing across cycles 1-5.
- L4: The void node serialization approach (fenced code block with `jsx-component` info string) is confirmed as surviving round-trip byte-identical by the research report's D7 finding.

**Factual (T3-T5):**
- T4: @tiptap/markdown 3.22.1 is confirmed as the latest version on npm (published ~2 days ago). The spec lists ^3.22.0 which resolves correctly.
- T4: @hocuspocus/server 3.4.4 is confirmed as the latest version on npm. The spec lists ^3.4.0 which resolves correctly.
- T4: The CodeMirror duplicate package issue (instanceof checks failing with duplicate @codemirror/view installs) is a well-documented problem. The overrides solution in the spec is the standard mitigation.
- T4: Hocuspocus `handleConnection()` method accepts `(websocket, request, context)` and works without calling `listen()` -- confirmed by official Hocuspocus documentation.
- T4: The `onStoreDocument` hook receives document name and Y.Doc -- confirmed by Hocuspocus hooks documentation.
- T5: The claim that "no block-canonical editor has shipped a source toggle" aligns with the competitive analysis in the source-toggle-architecture report (AFFiNE, Outline, BlockNote all lack it).
- T4: simple-git `.raw()` method supports arbitrary git plumbing commands including `write-tree`, `commit-tree`, and `update-ref` -- this is the documented API for commands not covered by simple-git's convenience methods.

## Unverifiable Claims

1. **"Yjs 14's unified YType" existence as a separate release.** Could not confirm whether "Yjs v14" is a real planned release or whether the unified YType refactor is already present in the v13.x line. The research reports discuss it with CONFIRMED confidence from source code analysis, but no public npm release or RC exists. The source code observations may be from a private/unreleased branch, or the "v14" label may be a research report convention for the internal refactor. This is the spec's highest-risk assumption.

2. **`skipStoreHooks` availability in @hocuspocus/server 3.x.** The evidence file claims it was "added in Hocuspocus v4" but cannot confirm whether this is backported to the 3.x line. Need to check the actual TypeScript types in the installed package.

3. **y-prosemirror v14 delta protocol (`toDeltaDeep()`, `applyDelta()`, `observeDeep()`).** These methods are described in the peritext-on-yjs-feasibility report as CONFIRMED from source code, but the version of y-prosemirror that contains them is unclear. The npm version of y-prosemirror and whether `@tiptap/y-tiptap` wraps a compatible version could not be independently verified.
