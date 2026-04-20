---
title: "Collaborative Editor UX for Silent Content Loss: Production Patterns + Integration Seam"
description: "Surveys how production real-time collaborative editors (Google Docs, Notion, Figma, Linear, Obsidian, VS Code Live Share, CodeMirror+ShareDB) handle merge anomalies where content may be lost. Cross-references industry 'keep typing' philosophy against documented UX costs when silent-loss is real (Obsidian's 4-year user complaint thread). Identifies the dual-CRDT/dual-view failure class as architecturally unique (no production editor has our specific shape). Concludes: silent named-checkpoint matching Notion's duplicate-on-offline-merge pattern fits Notion-esque user expectations; toasts carry trust-erosion cost that outweighs the marginal recovery help they'd provide."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Google Docs
  - Notion
  - Figma
  - Linear
  - Obsidian
  - VS Code Live Share
  - CodeMirror collab
  - ShareDB
  - Replicache
topics:
  - collaborative editor UX
  - silent merge loss patterns
  - version history as recovery affordance
  - dual-CRDT bridge UX
  - local-first recovery patterns
---

# Collaborative Editor UX for Silent Content Loss

**Purpose:** Determine the right UX surface for Open Knowledge's bridge-merge content-preservation post-condition violations. Specifically, whether a user-facing toast with "see version history" CTA is appropriate, or whether silent logging with a recoverable artifact (matching Notion's duplicate-on-offline-merge pattern) is the better Notion-esque fit.

## Executive Summary

**Silent named-checkpoint is the right UX pattern for our failure class.** Toasts create trust erosion disproportionate to their recovery value — Notion-esque users read "your edit may have been affected" as "this app can lose my work" even when it's accurate. No surveyed production editor uses a mid-typing merge-loss toast; the closest pattern (Figma's Review/Dismiss dialog) applies to branch-merge ceremonies, not live multiplayer typing.

The dominant industry pattern for "we did something that might have lost content": **create a predictable recoverable artifact (duplicate page, version-history entry, rescue buffer) and let users who notice go find it.** Notion's offline-merge produces a copy page. Google Docs' version history captures every edit automatically. Our equivalent: a named `saveInMemoryCheckpoint` on post-condition violation, silently visible in TimelinePanel with a distinguishing label.

**Implementation seam is cheap (~20-30 LOC core + existing infrastructure reuse):**
- `Y.Map('activity')` is the right transport for any optional awareness signal
- Sonner toast infrastructure is shipped and themed
- TimelinePanel already exists and supports custom labels via commit-message parsing
- The structured-event awareness convention (precedent #3) accommodates a new kind via additive enum widening (precedent #9)

## Research Rubric

| ID | Dimension | Depth | Evidence |
|---|---|---|---|
| D1 | Production editor survey (what they do today) | Deep | [evidence/production-editor-survey.md](evidence/production-editor-survey.md) |
| D2 | "Silent is fine" rationale + its limits | Deep | [evidence/silent-failure-rationale.md](evidence/silent-failure-rationale.md) |
| D3 | Notification pattern catalog (toast / banner / artifact / cursor / inline) | Moderate | [evidence/notification-patterns-catalog.md](evidence/notification-patterns-catalog.md) |
| D4 | Dual-view failure class architectural uniqueness | Moderate | [evidence/dual-view-merge-loss-failure-class.md](evidence/dual-view-merge-loss-failure-class.md) |
| D5 | Local-first UX literature + Replicache patterns | Moderate | [evidence/local-first-ux-literature.md](evidence/local-first-ux-literature.md) |
| D6 | Open Knowledge 1P awareness infrastructure + integration seam | Deep | [evidence/1p-awareness-infrastructure.md](evidence/1p-awareness-infrastructure.md) |

## Detailed Findings

### D1. Production editor survey — no precedent for mid-typing merge-loss toast

| Editor | Merge mechanism | Can lose content? | User-facing signal |
|---|---|---|---|
| Google Docs | OT; provably lossless | No | Version history; manual access only |
| Notion multiplayer | CRDT silent; duplicate page on offline merge | **Yes** — database properties silently last-writer-wins | Duplicate page for text only |
| Figma multiplayer | OT + property-level LWW | No | — |
| Figma **branches** (library) | Explicit Review/Dismiss dialog | Ceremony only | Review sidebar (opt-in) |
| Obsidian Sync | diff-match-patch silent | **Yes** | Log entry only — [4-year-open feature request](https://forum.obsidian.md/t/obsidian-sync-add-a-notification-warning-when-sync-merge-with-conflicts-happens/14943) for UI warning |
| VS Code Live Share | OT silent | Reported desyncs | — (ACM study flagged as usability gap) |
| Replit multiplayer | OT + task-isolation | No | — |
| CodeMirror+ShareDB / pm-collab | Library only | Application-defined | Application-defined |

The closest pattern to "toast + version-history CTA" is Figma's Review/Dismiss — but it triggers only on library-branch merge ceremonies, never during live multiplayer typing. **No surveyed editor uses this pattern for the failure class we have.**

### D2. "Silent is fine" is conditional on merge correctness

Industry consensus ([Fernando Ruiz](https://www.fernandoux.com/en/wiki/concepts/conflict-resolution/), NN/g toast patterns): blocking modal conflict dialogs are an anti-pattern — they "block the workflow and generate anxiety." But this philosophy addresses MODAL blocking specifically. Non-blocking surfaces (toasts, banners) are compatible with "keep typing."

**The nuance:** silent is correct when merge is provably lossless (Google Docs OT, Yjs text-merge). Silent becomes a liability when merge CAN lose content. Obsidian's 4-year forum thread is the sharpest evidence: *"Obsidian silently syncs in the background and doesn't warn me if it is merging a file. Notes mysteriously become blank."* Users DO notice silent loss over time, and get angry about the lack of signal.

Our bridge-merge post-condition IS the "can lose" case (Khanna-Kunal-Pierce 2007 impossibility for state-based merge). Silent-as-default inherits the Obsidian failure mode.

### D3. Notification pattern fit — ephemeral toast OR silent artifact

| Pattern | Fit for rare recoverable events | Why |
|---|---|---|
| Silent log + counter | Current industry default when merge is correct | No recovery signal if loss is real |
| **Dismissable toast** | Workable but trust-expensive | Non-blocking; but reads as "this app can lose my work" |
| **Silent version-history artifact** | **Best fit for Notion-esque users** | Matches Notion's duplicate-on-merge pattern; users who notice find it; users who don't aren't alarmed |
| Persistent banner | Overkill | Occupies chrome for <1% event |
| Inline diff marker | Wrong | Bridge-loss has no clean coordinates in the merged output |
| Awareness cursor hint | Too weak | Easy to miss for a rare critical event |

### D4. Dual-view failure class is architecturally unique

Surveyed editors with "source + WYSIWYG" modes either:
- Are single-user (Joplin, Typora, StackEdit)
- Use single-buffer with decoration (Obsidian Live Preview — not a parallel CRDT)
- Use pre-toggle confirmation (CKEditor)

**Only Open Knowledge has a runtime-synchronized bidirectional bridge between two distinct CRDTs (Y.XmlFragment + Y.Text).** No peer architecture to copy UX from.

### D5. Local-first UX literature endorses server-detect → side-channel → client-UX pattern

[Replicache's client-view-reset](https://doc.replicache.dev/concepts/how-it-works) is the direct precedent: server detects inconsistency → signals via a side channel → client reacts. Our proposed mechanism (server-side `mergeThreeWay` detects → `Y.Map('activity')` side channel OR silent shadow-repo checkpoint → client either renders toast or just updates TimelinePanel) is structurally identical. Aligns with established local-first patterns.

### D6. Open Knowledge 1P infrastructure supports either surface at low cost

**`Y.Map('activity')` is the right transport for awareness signaling** (precedent #3): `ActivityEntry { agentId, timestamp, type: 'insert'|'replace'|'delete', description? }` extensible via enum widening (precedent #9). Auto-evicts (ACTIVITY_TTL_MS=30_000s). Existing observe-loop pattern in `agent-flash-source.ts`.

**CC1 broadcaster is the WRONG transport** — it's deliberately pure-signal (`{v:1, ch, seq}`) with no payload. Bridge-loss needs per-doc payload.

**Sonner toast infrastructure is shipped and themed** (`packages/app/src/components/ui/sonner.tsx`, `main.tsx:32` mounted globally). Throttled-toast precedent: `packages/app/src/editor/clipboard/paste-failure-toast.ts`.

**TimelinePanel wiring** (`packages/app/src/components/EditorPane.tsx:167-173`) supports custom labels if the underlying commit message is parsed post-`checkpoint:` prefix. Opens via existing `setTimelineOpen(true)` handler. Cross-component handoff via `window.dispatchEvent` is precedented (RAW_MDX_NAV_EVENT pattern at `EditorPane.tsx:80-86`).

## Recommendation

**For Open Knowledge's failure class: silent named-checkpoint, NOT toast.**

Rationale:
1. Toasts that say "your edit may have been affected" erode trust for Notion-esque users who read it as "this app can lose my work" — even when accurate.
2. The closest industry analogue is Notion's duplicate-on-offline-merge pattern: silent in the moment, predictable recoverable artifact, no new UI concept.
3. Our existing version-history (TimelinePanel + `save-version` primitive + shadow-git) provides the recovery affordance without introducing a new UI surface.
4. If post-ship telemetry shows the rate is high enough that users ARE losing content in ways they notice but can't find, re-evaluate for a toast addition.
5. Implementation cost matches the pattern: ~20-30 LOC via a new `saveInMemoryCheckpoint` primitive on shadow-repo, a small TimelinePanel change to render the distinctive label.

**Do not ship the toast.** Ship the silent checkpoint. Watch the telemetry. Iterate on the UX later if the assumption is wrong.

## Sources

- [Figma — How Multiplayer Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Figma — Review branch changes](https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes)
- [Google Drive Blog — Conflict resolution in Google Docs](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_22.html)
- [Notion — How we made Notion available offline](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [Obsidian Forum — Sync merge notification feature request (4+ years open)](https://forum.obsidian.md/t/obsidian-sync-add-a-notification-warning-when-sync-merge-with-conflicts-happens/14943)
- [ACM TOSEM 2024 — Real-Time Collaborative Programming: VS Code Live Share](https://dl.acm.org/doi/10.1145/3643672)
- [Replicache — How It Works](https://doc.replicache.dev/concepts/how-it-works)
- [Fernando Ruiz — Conflict Resolution in Collaboration](https://www.fernandoux.com/en/wiki/concepts/conflict-resolution/)
- [NN/g — Toast Message Patterns](https://www.nngroup.com/articles/toast-notifications/)
- [Ink & Switch](https://www.inkandswitch.com/)

## Related Research

- [reports/three-way-merge-content-preservation/REPORT.md](../three-way-merge-content-preservation/REPORT.md) — why merge loss is architecturally unavoidable in our dual-CRDT bridge
- [reports/crdt-observer-bridge-latency-analysis/REPORT.md](../crdt-observer-bridge-latency-analysis/REPORT.md) — latency profile for the observer bridge
