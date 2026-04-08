# Evidence: Version History UX in Auto-Save Products (D1)

**Dimension:** D1 — Version history UX patterns
**Date:** 2026-04-08
**Sources:** Figma Help Center, Google Docs docs, Notion Help, Replit docs, Lovable docs, Apple developer docs, web search

---

## Key products referenced
- Figma — version history panel, auto-save collapsing
- Google Docs — version history with "Only show named versions" toggle
- Notion — flat auto-save timeline, no named versions
- Replit — History++ with file-level OTs + app-level checkpoints
- Lovable — bookmark/favorite pattern for stable versions
- Apple Pages — Time Machine-style spatial UI
- v0 (Vercel) — chat-as-timeline, iteration-based versions
- Linear — activity collapsing heuristic

---

## Findings

### Finding: Every product distinguishes auto-saves from named/milestone versions visually
**Confidence:** CONFIRMED
**Evidence:** Figma collapses auto-saves under named versions (expandable). Google Docs groups auto-saves by time blocks with an "Only show named versions" toggle. Lovable uses bookmark/favorite icons to mark stable versions. Replit has file-level granular OTs vs app-level checkpoint milestones.

**Implication:** Open Knowledge's Layer 2 (WIP refs) and Layer 3 (named checkpoints) map directly to this universal pattern.

### Finding: Vertical list is the dominant timeline UI pattern
**Confidence:** CONFIRMED
**Evidence:** Figma, Google Docs, Notion, Lovable, Replit all use right-sidebar vertical lists ordered newest-first. Apple Pages is the only exception (Time Machine spatial UI — not practical for web).

**Implication:** The timeline panel should be a vertical list in a right sidebar or collapsible drawer.

### Finding: Google Docs' "Only show named versions" toggle is the gold standard for noise control
**Confidence:** CONFIRMED
**Evidence:** Google Docs version history has a toggle at the top of the sidebar that filters to show only user-named milestone versions, hiding all auto-save noise. This directly maps to "show me only Save Version checkpoints."

**Implication:** The timeline UI should default to showing only named checkpoints, with an expand/toggle to reveal collapsed auto-saves between them.

### Finding: Notion's flat timeline without named versions is the anti-pattern
**Confidence:** CONFIRMED
**Evidence:** Notion shows all auto-generated snapshots (~10 min intervals) in a flat list with no grouping. Users report this becomes noisy and hard to navigate for long-lived pages.

**Implication:** Named checkpoints are essential UX. Auto-save-only timelines fail at scale.

### Finding: Replit's two-tier model (granular file OTs + coarse app checkpoints) validates our architecture
**Confidence:** CONFIRMED
**Evidence:** Replit uses History++ for file-level operational transforms (granular, automatic) alongside app-level checkpoints (milestone, sometimes agent-initiated). Under the hood, code state uses git commits + Neon database branches for data state.

**Implication:** The Layer 2 (granular WIP refs) + Layer 3 (coarse checkpoints) split is independently validated by Replit's architecture.

### Finding: Timeline metadata varies but timestamp + author are universal
**Confidence:** CONFIRMED
**Evidence:** All products show timestamp and editor name/avatar per version. Named versions additionally show user-provided title. Figma and Google Docs show descriptions/annotations. Lovable shows the user prompt that triggered the change.

**Implication:** Minimum metadata per checkpoint: name, description, author, timestamp, files changed count.

---

## Gaps / follow-ups
- Exact pixel-level UI patterns not captured (screenshots are copyrighted)
- Token budget implications of timeline data in agent context not investigated
