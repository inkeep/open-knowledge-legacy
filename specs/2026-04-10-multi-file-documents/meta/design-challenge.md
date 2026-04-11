# Design Challenge Findings

**Artifact:** specs/2026-04-10-multi-file-documents/SPEC.md
**Challenge date:** 2026-04-10
**Total findings:** 6 (2 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: Observer module-level mutable state creates cross-document contamination

**Category:** DESIGN
**Source:** DC1 (Simpler alternative), DC2 (Stakeholder gap)
**Location:** SPEC.md section 8.2 (Observer lifecycle), section 8.1 (ProviderPool implementation)
**Issue:** The spec treats observer lifecycle as a per-provider concern (each `PoolEntry` stores its own `observerCleanup` function), but the observers module (`packages/app/src/editor/observers.ts`) captures critical mutable state in module-level closures that is shared across all callers. Specifically:

1. **`lastUserTypedAt`** (observers.ts:61) is a module-level variable set by `markUserTyping()`. It controls Observer B's typing deferral window. With the provider pool, when a user types in Document A and then switches to Document B, Observer B on Document B inherits Document A's typing timestamp and will defer its sync unnecessarily. Conversely, this means Observer B on Document A could fire prematurely when a switch happens.

2. **`lastSyncedXmlMd`** (observers.ts:245) is scoped inside the `setupObservers` closure, so it IS per-call. This is fine.

3. **`markUserTyping()`** is called from `TiptapEditor`'s DOM event listeners (TiptapEditor.tsx:180-194). With document switching, the `useEffect` cleanup removes listeners from the old editor DOM, but `lastUserTypedAt` retains the stale value. Since Observer B on the newly-active document reads this shared timestamp, it may incorrectly defer or not defer.

The spec claims "Observer setup/cleanup functions are already paired (setupObservers returns cleanup fn)" (evidence/provider-lifecycle.md), which is true for the Y.Doc observers themselves. But it does not address the module-level coordination state that crosses document boundaries.

**Current design:** "Each `PoolEntry` stores its own `observerCleanup` function. Observers are set up after the provider's `synced` event fires." (SPEC.md section 8.2)
**Alternative:** The `setupObservers` function should accept `lastUserTypedAt` as an injectable dependency (a getter function or a per-document ref) rather than reading from module scope. Or, `observers.ts` should be refactored so that `setupObservers` returns an object that includes a `markUserTyping` function bound to that document's state, and the caller passes it to the TiptapEditor instead of importing the module-level `markUserTyping`.
**Trade-off:** The alternative requires a slightly more complex observer API (returning `{ cleanup, markUserTyping }` instead of just `cleanup`) but eliminates a subtle cross-document bug. The current design would likely work in practice because typing deferral is 300ms and document switches involve user intention, but it creates a class of bugs that are hard to reproduce and diagnose. An SRE reviewing this would flag the shared mutable module state as a time bomb.
**Status:** CHALLENGED
**Suggested resolution:** The spec should specify that `lastUserTypedAt` becomes per-document state managed by the pool or by each observer instance. This is a design decision, not a bug fix, because the current single-document system doesn't have this problem -- it only materializes when the pool enables multiple concurrent observer sets.

---

### [H] Finding 2: Blank state on app load forecloses independent UI usage without the file tree sidebar

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap), DC3 (Framing validity)
**Location:** SPEC.md section 8.4.3 (Blank state), Decision D10, Decision D4
**Issue:** The spec locks D10 (blank state on app load) and D4 (file tree sidebar is out of scope). Together, these create a deployment where the application is unusable after this spec ships until the file tree sidebar is implemented in a separate PR. Today, the app opens `test-doc` automatically and is immediately functional. After this change, the user sees "No document open" with no way to open any document until the sidebar PR lands.

This creates a gap between "infrastructure spec ships" and "any user can do anything." The Decision Log doesn't record this interaction between D10 and D4, and there is no mitigation specified.

The spec's Complication states the React UI is "hardcoded to a single document" and frames the Resolution as adding multi-document infrastructure. But removing the single-document fallback without providing any alternative document-opening mechanism means the spec is not just adding infrastructure -- it is regressing the app's usability to zero for the period between this spec and the sidebar PR.

**Current design:** "When `activeDocName` is `null` (app load, or after closing last document): TiptapEditor and SourceEditor are not rendered. EditorArea shows a centered placeholder: 'No document open'" (SPEC.md section 8.4.3)
**Alternative:** Provide a minimal bootstrap mechanism that doesn't require the full file tree sidebar. Options include:
- (A) Auto-open the first document from `GET /api/documents` on initial load (preserves current UX, adds one fetch)
- (B) Add a temporary "open document" text input/command palette in the blank state (low-effort UI that's discardable when sidebar ships)
- (C) Support a `?doc=<docName>` URL query parameter as a quick override (also useful for agent-shared links even after sidebar ships)
- (D) If the contentDir contains a single document, auto-open it (common bootstrapping case)

Any of these prevents the zero-usability gap without requiring the file tree sidebar. Option C has the additional benefit of surviving as permanent functionality (spec's own "URL routing" future work item).

**Trade-off:** Each alternative adds a small amount of scope to this spec but prevents a deployment that breaks the current user experience. Option A is ~10 lines of code (fetch list, open first). Option C overlaps with the "URL routing" future work item, so it partially pulls future work forward but in a minimal way.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine D10 in light of D4. Either (a) add a minimal bootstrap mechanism to this spec (Options A-D above), or (b) explicitly document that this spec and the sidebar PR must ship together as one deployment unit, and update the implementation plan accordingly. If they ship together, the blank state concern is moot. If they ship separately, the blank state creates a regression.

---

## Medium Severity

### [M] Finding 3: Document list endpoint path traversal via `dir` query parameter

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md section 8.5 (Document list endpoint)
**Issue:** The pseudocode for `handleDocumentList` uses `safeContentPath` to validate the `dir` query parameter, but applies it incorrectly:

```typescript
const baseDir = safeContentPath(subdir || '.', contentDir).replace(/\.md$/, '');
```

`safeContentPath` appends `.md` to its input (`resolve(contentDir, ${documentName}.md)`), so calling it with a directory name like `articles` produces `contentDir/articles.md`, then the `.replace(/\.md$/, '')` strips it back. This works accidentally but is semantically wrong -- `safeContentPath` is a document-name validator, not a directory-path validator.

More critically, the `dir=.` default case: `safeContentPath('.', contentDir)` resolves to `contentDir/..md` (no, actually `resolve(contentDir, './.md')` = `contentDir/.md`), which then strips to `contentDir/` -- so it works. But `dir=..` would resolve to `resolve(contentDir, '../.md')` which is *outside* contentDir, and `safeContentPath` would correctly reject it. So the traversal protection holds, but only by accident of reusing a function designed for a different purpose.

A security-conscious engineer would flag this as brittle. The `dir` parameter should have its own explicit validation rather than piggybacking on `safeContentPath` with string manipulation.

**Current design:** "const baseDir = safeContentPath(subdir || '.', contentDir).replace(/\.md$/, '');" (SPEC.md section 8.5)
**Alternative:** Write a dedicated `safeSubdir(subdir: string, contentDir: string): string` function that validates the resolved path is within contentDir without the .md append/strip dance. Simpler to audit, same protection.
**Trade-off:** Minimal -- a 5-line function vs. reusing an existing function in a way that's correct but confusing.
**Status:** CHALLENGED
**Suggested resolution:** Either add a `safeSubdir` helper or document why the `safeContentPath` reuse is intentional and safe. The current pseudocode will confuse implementers and reviewers.

---

### [M] Finding 4: ProviderPool as plain class with callback-based React integration is more complex than necessary

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** SPEC.md section 8.1 (ProviderPool), section 8.3 (DocumentContext)
**Issue:** The spec proposes a plain TypeScript class (`ProviderPool`) that communicates state changes to React via an `onSyncStateChange` callback. The `DocumentProvider` React component then maintains its own `useState` for the active document, syncing imperatively with the pool. This creates two sources of truth for the active document state: the pool's `activeDocName` field and the React state's `activeDoc`.

The Decision Log (D1, OQ2) records that "singleton class, React context wraps it" was chosen because the pool "must survive React re-renders." This is true -- WebSocket connections shouldn't be torn down on re-render. But the spec uses `useRef` to hold the pool instance (section 8.3: `const poolRef = useRef<ProviderPool>()`), which already solves the re-render survival concern. The pool class itself doesn't need to be framework-agnostic if it's only used from one React context.

The Decision Log rejected "dynamic room" (D1) but the alternative here isn't dynamic room -- it's whether the pool needs to be a standalone class or could be a custom hook that encapsulates the Map + LRU logic directly. The spec says the pool pattern mirrors the server's `Map<docName, DirectConnection>`, but that's a server-side pattern where React lifecycle isn't a factor.

**Current design:** "The pool is a plain TypeScript class (not a React hook) -- it owns WebSocket connections and must survive React re-renders. The React context layer wraps it." (SPEC.md section 8.1)
**Alternative:** A `useProviderPool` hook that uses `useRef` for the Map and LRU list (surviving re-renders) but uses `useState`/`useReducer` for the active document and sync state (single source of truth, automatic re-renders). The WebSocket instances live in refs; the reactive state lives in React state. This eliminates the dual-state problem and the imperative callback bridge.
**Trade-off:** The hook approach ties the pool to React, making it unusable if the app were ported to another framework. However, the spec shows no non-React consumer of the pool, and the entire app is React. The class approach is more testable in isolation (unit tests without React rendering), which is a legitimate advantage. The dual-state issue is manageable but adds surface area for sync bugs.
**Status:** CHALLENGED
**Suggested resolution:** This is a medium-confidence challenge. The class approach is defensible if the testability benefit is valued. But the spec should explicitly acknowledge the dual-state concern (pool's `activeDocName` vs. React's `activeDoc`) and specify which is authoritative, or add a mechanism to keep them in sync (e.g., pool emits events, React subscribes). The current pseudocode in section 8.3 shows both being set independently in `openDocument`, which could diverge if an error occurs between `pool.open()` and `setActiveDoc()`.

---

### [M] Finding 5: E2E test blast radius is underspecified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md section 9 (Risks/Unknowns), section 16 (Agent Constraints)
**Issue:** The spec's Risks table mentions the E2E test access issue in a single row: "E2E test access -- `window.__hocuspocusProvider` currently exposes singleton" with severity "Low." But investigation shows 16 references to `__hocuspocusProvider` across two test files (`ux-interactions.spec.ts` and `crdt-stress.spec.ts`), including direct access to `provider.document.getText('source')`, `provider.document.getMap('activity')`, and `provider.isSynced`.

These tests reach into the provider to inspect Y.Doc state directly. With the provider pool, the semantics change: does `__hocuspocusProvider` point to the active provider? What happens when the active provider changes mid-test? The spec suggests "keep `__hocuspocusProvider` pointing to active provider (updated on switch)" as an option, but this would break any test that holds a reference to the provider across a document switch.

The spec's Agent Constraints (section 16) don't mention the test files, but any implementation will need to update them. The risk severity should be Medium, not Low, because these are existing stress tests that validate CRDT behavior -- breaking them without replacement loses test coverage for critical functionality.

**Current design:** "Replace with `window.__providerPool` exposing the pool instance, or keep `__hocuspocusProvider` pointing to active provider (updated on switch)." (SPEC.md section 9)
**Alternative:** This isn't an alternative design so much as a gap in the current one. The spec should specify which approach is taken and include the test file updates in the implementation plan.
**Trade-off:** Adding test updates to the implementation plan increases scope but prevents a "tests silently pass but test the wrong thing" failure mode.
**Status:** CHALLENGED
**Suggested resolution:** Promote the E2E test access decision from a Risks table entry to a proper decision (or at minimum, specify the approach). Add the test files to the SCOPE section of Agent Constraints. Consider `window.__providerPool` plus a helper like `window.__activeProvider` that's a getter reading from the pool.

---

## Low Severity

### [L] Finding 1: SourceEditor remount strategy via React `key` prop has a UX cost the spec doesn't acknowledge

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md section 9 (Risks/Unknowns, row on SourceEditor rebinding)
**Issue:** The spec correctly identifies that `yCollab` creates a persistent binding to a specific Y.Text, and proposes using React's `key` prop keyed by `docName` to force a full remount of SourceEditor on document switch. This is the right approach -- there's no incremental rebinding API for yCollab.

However, the spec doesn't acknowledge the UX implication: when switching documents, the SourceEditor will flash/flicker as the entire CodeMirror view is destroyed and recreated. This includes loss of scroll position, cursor position, and any unsaved selection within source mode. For the WYSIWYG editor (TiptapEditor), the same concern applies since the Collaboration extension binds to a specific Y.Doc.

This isn't a design flaw (there's no better alternative given `yCollab`'s API), but the spec should document it as a known UX trade-off so implementers and reviewers don't treat it as a bug or try to "fix" it with unnecessary complexity.

**Current design:** "React `key` prop on SourceEditor keyed by docName forces remount." (SPEC.md section 9)
**Alternative:** No better alternative exists given `yCollab`'s binding model. The observation is that the spec should document the UX consequence (flash/flicker, lost scroll/cursor position) as accepted behavior.
**Trade-off:** Documentation-only change. No complexity added.
**Status:** CHALLENGED
**Suggested resolution:** Add a sentence to the Risks table or a note in section 8.4 acknowledging the visual discontinuity on document switch and explicitly accepting it as a known trade-off.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- **Provider pool over dynamic room (D1):** Holds. The spec correctly identifies that a destroy/recreate approach forecloses tabbed editing. The pool pattern mirrors the server's session manager and is well-justified.
- **LRU eviction cap of 10 (D2):** Holds. Napkin math in A1 (10 docs * ~25KB = ~250KB) is reasonable. The cap prevents unbounded WebSocket growth.
- **MCP tools require Hocuspocus (D11):** Holds. The "agents use native Edit for disk-only" fallback is clear and practical. A disk-only MCP write path would add complexity without clear demand.
- **Flat document list (OQ1):** Holds. Tree structure is a presentation concern best derived client-side. Flat list is simpler and more flexible.

**DC2 (Stakeholder gap):**
- **Path traversal protection in `safeContentPath`:** The existing server-side validation is solid. The `startsWith` check prevents directory escape. The spec correctly identifies the mkdir bug as the only server-side fix needed.
- **No auth/permissions (D9):** Appropriate for the current product scope (local-first wiki). No multi-tenant concerns.

**DC3 (Framing validity):**
- **Problem framing (SCR):** The Situation and Complication are grounded in verifiable codebase facts (hardcoded `DOC_NAME`, singleton provider, commented MCP tools). The Resolution addresses all three dimensions of the Complication. The framing is not post-hoc.
- **Scope boundary (infrastructure vs. sidebar UI):** Reasonable separation. The provider pool, document list API, and MCP tool revival form a coherent infrastructure layer. The sidebar is a pure UI concern that consumes these APIs. *However*, the blank state issue (Finding 2) is a consequence of this scope split that the spec doesn't mitigate.
