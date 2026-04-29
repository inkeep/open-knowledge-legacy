# Context Bridge Alternatives — Compound Components Across TipTap NodeView Portals

**Date:** 2026-04-15
**Commissioned by:** Component Blocks v2 spec (US-015 Fallback 2 escalation)
**Status:** Synthesis of 5 parallel research probes

---

## Problem

TipTap renders each NodeView as `ReactDOM.createPortal()` — all NodeViews are React-tree siblings, not nested. React Context follows the React tree, not the DOM tree. Compound components (Radix Tabs/Accordion, fumadocs wrappers) that rely on parent→child Context propagation break: child NodeViews can't access the parent NodeView's Context.

Compounding this: Radix's `createContextScope` creates closure-scoped `React.createContext()` instances that are never exported. Even an external bridge can't reference the Context objects to capture/re-provide them.

## Findings (5 probes, high confidence)

### What doesn't work

| Approach | Why it fails |
|---|---|
| **React 19 APIs** | `use()` follows same React-tree ancestry as `useContext()`. No portal-aware context. RFC #13332 (cross-renderer portals, Dan Abramov, 2018) still open/unassigned after 8 years. |
| **Radix cooperation** | `createContextScope` is intentionally opaque. Closure-scoped `BaseContext` never exposed. `createScope()` creates FRESH contexts. Multiple GitHub issues requesting exposed contexts — Radix position: internal implementation detail. Unchanged in latest v1.1.3. |
| **fumadocs exports** | Neither styled nor unstyled layer exports contexts. Styled Tabs strips `value`/`onValueChange` via `Omit<>`. v17 structurally identical. Author marks unstyled as `@internal`. |
| **TipTap fix** | Issues #6427 (closed, no fix) and #6547 (open, no response). Portal model is architectural to `@tiptap/react`. No v4, no extension points. |
| **Existing bridge libraries** | `@react-three/drei useContextBridge`, FluentUI, PixiJS, `use-context-selector` — ALL require known `React.Context` objects as input. None solve closure-scoped contexts. |
| **`react-reconciler`** | `getChildHostContext`/`getRootHostContext` are for host context (renderer metadata), not React Context. No customization hook. |

### What could work (Future Work — Explored tier)

#### Path 1: `@handlewithcare/react-prosemirror` v3.0.1 (HIGH confidence, HIGH effort)

**What:** Replaces TipTap's React rendering layer with a full React reimplementation of ProseMirror's DOM update algorithm. NodeViews render as true React-tree children, not portals. Context flows naturally — fumadocs/Radix compounds just work without any bridge.

**Status:** v3.0.1 released April 2026. 361 GitHub stars. Full port of PM view test suite. Same org/author as our existing `@handlewithcare/remark-prosemirror` dep (Shane Moores, handlewithcarecollective).

**Cost:** Replace `@tiptap/react`'s rendering integration while keeping TipTap extensions, schema, commands, plugins. Every NodeView needs adaptation (from TipTap's `ReactNodeViewRenderer` to react-prosemirror's `useNodeViews` / `widget` API). Major migration but architecturally permanent.

**Why it's the right long-term answer:** Eliminates BOTH layers of the problem simultaneously (portal structure + context access). No workarounds, no pattern-copy, no imperative DOM. Every editor in the TipTap/PM ecosystem will eventually face this — we'd be first movers. Ecosystem evidence: Plate (Slate-based) and Lexical both render in-tree and don't have this problem.

**Ecosystem validation:**
- Plate/Slate: recursive React render tree, context flows naturally ✅
- Lexical/MDXEditor: `DecoratorNode` sidesteps with nested editors (no shared compound state)
- BlockNote (TipTap): same portal limitation, not solved
- Novel (TipTap): no compound support

#### Path 2: React fiber-walk (MEDIUM confidence, LOW effort, FRAGILE)

**What:** Walk `fiber.return` chain from a provider-side DOM node. Check `fiber.tag === 10` (ContextProvider). Read `fiber.type._context` to discover the closure-scoped Context object and `fiber.memoizedProps.value` for its current value. Re-provide in consumer NodeViews via our existing Context Bridge.

**How React DevTools does it:** DevTools uses exactly this technique to discover and display all contexts in its Components panel. It's proven to work but explicitly unsupported by React.

**Cost:** ~50-100 LoC to implement. Couples to React internals (`__reactFiber$` prefix, tag numbers, `_context` property, `memoizedProps`). May break across React major versions. Would need a compatibility shim tested per React release.

**Why it's interesting:** Could upgrade Fallback 2 to full D12 fidelity without a renderer migration. The Context Bridge infrastructure (US-008) is already in place — this just gives us the Context objects to populate it with.

#### Path 3: Ark UI migration for compounds (LOW priority)

**What:** Replace fumadocs-ui compound components with Ark UI equivalents. Ark UI (Zag.js-based) exports `RootProvider` and `useTabs` for external state management. Contexts are still internal, but state is externalized via state machines.

**Why it's low priority:** Requires replacing fumadocs-ui for compounds, which is exactly what Fallback 2 already does more simply (imperative DOM vs Zag.js state machines). Only becomes interesting if we want compound-component fidelity ≥99% with a maintained upstream.

## Current architecture (correct for P0)

Fallback 2 (pattern-copy compounds) is the correct P0 architecture:
- 12 leaf components: direct fumadocs-ui import (100% D12 fidelity)
- 4 compound components: editor-local wrappers with imperative DOM state (~95% visual fidelity)
- Same CSS classes via --color-fd-* bridge (US-003)
- Context Bridge infrastructure (US-008) ready for future use

## Recommendation

**P0:** Ship Fallback 2 as-is. It works, it's correct, it's maintainable.

**Next spec cycle (Explored tier Future Work):** Evaluate `@handlewithcare/react-prosemirror` v3 migration. Scope: replace `@tiptap/react` rendering only (keep extensions/schema/commands). Benefit: eliminates portal problem permanently, enables full D12 fidelity for compounds, unblocks NG13 custom compound components, and establishes architectural leadership in the ProseMirror-React ecosystem. The shared org relationship (`handlewithcarecollective`) is a natural collaboration surface.

**Tactical option (if migration timeline is long):** Prototype the fiber-walk technique as an interim upgrade. ~50-100 LoC, could ship behind a feature flag. Bridges the gap between Fallback 2 and the renderer migration.
