# Design Challenge Findings

**Artifact:** specs/2026-04-14-graph-directory-coloring/SPEC.md
**Challenge date:** 2026-04-14
**Total findings:** 5 (0 high, 2 medium, 3 low)

---

## High Severity

None.

---

## Medium Severity

### [M] Finding 1: Fullscreen graph breaks G3 (sidebar-as-legend) on ship day

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §2 G3, §6.3, §9 FW1
**Issue:** G3 states: "The user never has to consult a separate legend — the sidebar is the legend." The fullscreen toggle is the *only* existing control in the GraphPanel header (GraphPanel.tsx:59-67). When a user enters fullscreen (`requestFullscreen()` on the panel element, GraphPanel.tsx:23-27), the panel takes `min-h-[100dvh]` and the sidebar is hidden. Colored nodes have no legend in this mode.
**Current design:** "Sidebar folder colors match graph node colors for the same directory prefix. The user never has to consult a separate legend." (§2 G3). FW1 acknowledges: "When graph panel is maximized, sidebar is hidden, so the 'sidebar-as-legend' claim breaks."
**Alternative:** Either (A) qualify G3 to exclude fullscreen mode explicitly ("...when the sidebar is visible"), or (B) add a minimal inline color key overlay that auto-shows when `isFullscreen === true` — a lightweight `<div>` mapping bucket keys to their swatch. The overlay would be ~30 lines of React, no new dependencies, and would fully satisfy G3.
**Trade-off:** Option A is honest but weakens the goal. Option B adds ~30 lines but makes G3 unconditional. Neither is high-cost, but the current spec ships a goal it knows is partially broken for a supported interaction path.
**Status:** CHALLENGED
**Suggested resolution:** Assess whether fullscreen graph usage is common enough to warrant option B in v1. If the fullscreen toggle is rarely used, qualify G3 and defer. If it's the primary exploration mode, a 30-line overlay is cheaper than the confusion it prevents.

---

### [M] Finding 2: Phasing opportunity — coloring at fixed depth first, depth control second

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §6.5 (depth control UI), §6.6 (depth state), §6.7 (vertical-slice summary), D9
**Issue:** The depth control (context provider, localStorage persistence, arrow buttons, min/max bounds) is a significant portion of the app-side implementation. If depth were hardcoded to `1`, the entire feature reduces to: (1) a pure function in core (path + theme -> color), (2) a one-line change in `nodeColor`, (3) a one-line change in FileTree icon stroke. No React context, no provider wrapping, no localStorage, no UI buttons. This delivers the primary value — colored clusters in the graph + sidebar legend — immediately. The depth control could follow in a second additive PR with zero rework on the first.
**Current design:** D9 says "Single PR, no feature flag" with rationale "Additive, no regression path." The Decision Log doesn't address phasing (whether coloring and depth must ship atomically).
**Alternative:** Phase 1: ship coloring with `depth=1` hardcoded. Phase 2: add the depth context, localStorage, and arrow buttons. Both PRs are additive. No rework — Phase 2 wraps the hardcoded `1` in a context provider.
**Trade-off:** Phasing gets the core value to users faster and reduces per-PR review surface. Cost: two review cycles instead of one, and users briefly lack depth adjustment (acceptable for P1 persona at depth=1). Total implementation cost is unchanged — phasing doesn't add code, it reorders it. However, the overall scope is modest enough that phasing overhead may exceed phasing benefit.
**Status:** CHALLENGED
**Suggested resolution:** Evaluate whether the total implementation scope (estimated ~300-400 lines across core + app) justifies the coordination cost of two PRs. If the implementer can ship both in a single focused PR without the review becoming unwieldy, the single-PR approach (D9) holds. If review surface is a concern, phasing is a zero-cost way to reduce it.

---

## Low Severity

### [L] Finding 3: Spec lists private functions as reusable dependencies

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — implementability)
**Location:** §6.2, §6.6, §14 Agent Constraints
**Issue:** §6.2 states: "Reuses identity-module utilities: `hexToHsl`, `hslToHex`, `deriveIconColor` from `packages/core/src/utils/identity.ts`." However, `hexToHsl` and `hslToHex` are private functions (not exported — verified at identity.ts:17,34 and core/index.ts:51-57). §6.6 references `safeLocalStorageSet` (identity.ts:116), also private. Agent constraint §14 says: "`packages/core/src/utils/identity.ts` (reuse only — do not modify API)." This creates a contradiction: the spec directs reuse of functions that can't be imported without modifying the module's exports.
**Current design:** "The directory-color module depends on these and does not re-implement HSL math."
**Alternative:** In practice, the directory-color module only needs `deriveIconColor` (exported) for sidebar icon stroke darkening. The palette is pre-defined hex arrays — no runtime HSL conversion needed. `safeLocalStorageSet` (5 lines of try/catch) can be trivially duplicated in the app-side context. The spec should list only `deriveIconColor` as the dependency and drop the claim about `hexToHsl`/`hslToHex`.
**Trade-off:** None — this is a documentation correction that reduces implementer confusion.
**Status:** CHALLENGED
**Suggested resolution:** Update §6.2 to list only `deriveIconColor` as the reused utility. For `safeLocalStorageSet` in §6.6, either export it from identity.ts (updating the agent constraint to allow this) or note that the context should implement its own try/catch wrapper.

---

### [L] Finding 4: Sidebar sync is secondary value, elevated by framing

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 Problem Statement (Complication)
**Issue:** The Problem Statement presents two co-equal dimensions: (1) graph nodes are undifferentiated, and (2) sidebar and graph "feel disconnected — two views of the same vault with no visual vocabulary shared between them." Testing the intersection: if sidebar sync were removed entirely, graph coloring alone would still solve G1 (orientation) and G2 (navigation) — the core value proposition. Sidebar sync (G3) adds coherence and acts as a legend, but the complication's framing implies the disconnection between sidebar and graph is a problem of similar magnitude to the graph's uniform coloring. It isn't — the sidebar already communicates directory structure through hierarchy; the graph communicates nothing about directories.
**Current design:** The complication joins both dimensions: "uniform gray blob" + "sidebar and graph feel disconnected."
**Alternative:** Frame the primary complication as "graph discards directory information that is already encoded in docNames" and position sidebar sync as a *bonus* that emerges naturally from the shared-primitive design (which it is — §6.4 is ~20 lines leveraging the core function).
**Trade-off:** The current framing is not wrong — sidebar sync IS valuable and comes cheaply. But elevating it to co-equal status slightly overstates the problem it solves. A reader might infer that sidebar color sync is as important as graph coloring, leading to disproportionate design investment if trade-offs arise during implementation.
**Status:** CHALLENGED
**Suggested resolution:** No design change needed. Consider softening the complication's second clause to "the sidebar's directory hierarchy has no visual counterpart in the graph" rather than claiming the two views "feel disconnected."

---

### [L] Finding 5: Node tooltip doesn't surface directory context

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — customer-facing)
**Location:** §6.3 (graph integration)
**Issue:** GraphView.tsx:145 sets `nodeLabel="label"`, which renders the file's display name on hover. For G2 ("spot which graph neighbors are inside vs outside that folder without hovering each one"), color is the primary signal. But when colors collide (djb2 hash collision across buckets) or when the palette has similar hues, a tooltip showing the directory prefix (e.g., "projects/alpha/") would disambiguate. The spec doesn't mention tooltip behavior.
**Current design:** No mention of tooltip changes in §6.3 or the vertical-slice summary.
**Alternative:** Extend `nodeLabel` to include the directory prefix: `nodeLabel={(node) => node.id}` (already shows the full docName path). Or format as `"[projects/alpha] my-note"`.
**Trade-off:** Zero implementation cost (one-line change), marginal UX improvement. Risk: longer tooltip text may clip on small panels.
**Status:** CHALLENGED
**Suggested resolution:** Consider a one-line tooltip enhancement during implementation, or note as a quick follow-on if users report confusion from color collisions.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- Core placement (`packages/core/src/color/`) is sound. Both consumers are in `app`, but the greenfield precedent §4 is about separating computation from rendering, not cross-package consumers. The function is pure (no React, no Node) and architecturally belongs in the pure-logic package.
- 12-color palette with djb2 hash is appropriately sized for the primary persona (3-5 top-level dirs) without over-engineering. Collision behavior is cosmetic, not semantic.
- React context + localStorage for depth state correctly follows existing precedent (theme via `next-themes`, identity via `identity.ts`). No new state library needed.
- `nodeCanvasObjectMode={() => 'after'}` (GraphView.tsx:150) means the default circle rendering uses `nodeColor` for fill, then the custom canvas object draws labels on top. The spec's plan to modify `nodeColor` is correct — it will paint the circles.
- Active-node override (D13) correctly prioritizes "you are here" affordance over directory identity. The active node is always one node; losing its bucket color for blue is a good trade.
- No feature flag (D9) is correct — depth=0 cleanly falls back to current behavior (uniform gray), so the feature is safely additive.

**DC2 (Stakeholder gap):**
- No security, SRE, or server-side concerns — the feature is pure client-side rendering with no data model changes.
- Performance estimate (D18: ~20µs for 1000-node graph) is credible for djb2 string hashing + array index lookup. No optimization needed.
- Flat-vault behavior (D12: control always present, silent no-op) is the correct least-surprise path.

**DC3 (Framing validity):**
- The problem statement accurately describes a real UX gap. Uniform gray nodes waste the directory information already encoded in docNames.
- The resolution (directory-based coloring) follows naturally from the complication. No evidence of post-hoc framing — the spec was user-initiated and the framing is faithful to the user's request.
- The urgency is appropriately calibrated — the spec positions this as an enhancement, not an emergency, which matches the actual stakes.
