# Evidence: Rationale for silent failure in collaborative editors

**Dimension:** Why do production editors deliberately swallow merge-level anomalies? What's the design philosophy?
**Date:** 2026-04-16
**Sources:** Engineering blogs, academic papers, CRDT/OT design documentation.

---

## Key pages referenced

- [Figma — How Multiplayer Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — "last writer wins" rationale
- [Marijn Haverbeke — Collaborative editing in ProseMirror](https://marijnhaverbeke.nl/blog/collaborative-editing.html) — conscious design choice
- [Fernando Ruiz — Conflict Resolution in Collaboration](https://www.fernandoux.com/en/wiki/concepts/conflict-resolution/) — UX framework
- [Replit blog — Making Repl.it Collaborative at Heart](https://blog.replit.com/collab) — OT rationale
- [CKEditor — Lessons learned](https://ckeditor.com/blog/lessons-learned-from-creating-a-rich-text-editor-with-real-time-collaboration/) — OT tradeoffs from a commercial editor vendor

---

## Findings

### Finding: The "keep typing" philosophy is explicitly stated in collaborative-editor UX literature
**Confidence:** CONFIRMED
**Evidence:** [Fernando Ruiz — Conflict Resolution in Collaboration](https://www.fernandoux.com/en/wiki/concepts/conflict-resolution/)

> "If the system detects a conflict, it can stop everything and ask the user which version to keep, though this manual UX blocks the workflow and generates anxiety."

This is the direct articulation of the D3 rationale in our spec: interrupting the user with a modal or blocking dialog introduces workflow friction and user anxiety. The cost of interruption is high enough that automatic resolution (possibly with loss) is preferred in most commercial editors.

**Implications:** The industry consensus is that blocking-modal conflict UX is bad. But this consensus does NOT rule out non-blocking notifications — toasts, banners, ambient indicators. The "keep typing" principle addresses the *modal-dialog* failure mode, not the *ambient-notification* solution space.

---

### Finding: CRDT-based editors' primary marketing claim is "automatic, invisible conflict resolution"
**Confidence:** CONFIRMED
**Evidence:** [Yjs docs](https://docs.yjs.dev/); Figma multiplayer blog; Google Docs OT blog

> (Yjs) "changes are automatically distributed to other peers and merged without merge conflicts"
> (Figma) "Two simultaneous changes are independent unless they affect the same property on the same object, in which case we pick the latest change."
> (Google Docs) "concurrent edits are resolved automatically, so users don't experience merge conflicts"

Each of these systems sells the "no conflicts, ever" promise as a headline value prop. Surfacing an anomaly contradicts that promise: **if the system is advertised as conflict-free, showing a conflict notification breaks the mental model the product has been sold on.**

**Implications:** This is a real argument against toasts — but it applies to *true CRDT semantics* (where any final state is valid). It does NOT apply to *bridge-level merge failures* where the merge algorithm itself may have lost data. A bridge-merge content-loss event is qualitatively different from "two concurrent edits, one winner" — it's "the merge algorithm dropped content that was in both inputs." Users would not perceive this as a "CRDT conflict."

---

### Finding: Version history is the industry-standard safety net — not proactive
**Confidence:** CONFIRMED
**Evidence:** Google Docs version history, Notion page history, Figma version history, Obsidian file recovery, Linear changelogs

Every major editor invests heavily in version history / undo infrastructure. The philosophy: **you can always recover, so we don't need to interrupt you.** This is the industrial "safety net" framing — the product commits to recovery-on-demand rather than prevention-by-interruption.

**Implications:** Our spec already commits to this framing (`specs/2026-04-16-bridge-correctness/SPEC.md §D3`: "version-history + shadow-git primitives provide user-facing recovery"). The D3-LOCKED choice is aligned with industry. The question is whether to add a proactive signal that tells the user "hey, your content MAY be in an older version in case you care" — which is not commonly done.

---

### Finding: The "silent" design has documented usability costs — users complain when loss is real
**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum thread](https://forum.obsidian.md/t/obsidian-sync-add-a-notification-warning-when-sync-merge-with-conflicts-happens/14943) — 4+ years of user complaints; [ACM TOSEM 2024 on VS Code Live Share](https://dl.acm.org/doi/10.1145/3643672)

The Obsidian Sync thread documents users repeatedly losing notes and asking for notifications for 4+ years. The academic study of Live Share explicitly names lack of disconnect/conflict visibility as a usability issue.

The pattern: **silent design works well when the merge system is correct** (Google Docs OT never loses content; Yjs text-merge never loses content). It breaks down when the merge system CAN lose content (Obsidian's diff-match-patch, Notion's property merge, our bridge-layer three-way merge).

**Implications:** A nuanced framing: silent is fine when the merge is correct. When merge correctness is demonstrably imperfect (as our bridge-merge post-condition c is designed to detect), silence is a design liability. The D3 discussion in our spec conflates "collaborative editors are silent" with "therefore our bridge should be silent" — but the editors' silence is backed by merge correctness we don't yet have.

---

### Finding: No production editor surveyed surfaces a "dismissable toast with CTA to version history" for in-editor merge anomalies
**Confidence:** CONFIRMED (within surveyed set)
**Evidence:** Aggregation of all fetched sources — exhaustive search for "Review/Dismiss" + "version history" + "toast" + "conflict" patterns.

The closest analogues:
- **Figma branches** — Review/Dismiss with version history, but triggered by an explicit branch-merge ceremony, not mid-typing.
- **Notion** — duplicate-page artifact, no toast.
- **SharePoint co-authoring** — version history is flagged by icons in the file library view, not by transient notifications.
- **memoQ** (translation tool) — has a "Review changes and conflicts" tab with Dismiss buttons, but it's a translator-QA flow, not a real-time editor.

**Implications:** The specific pattern the spec asks about — dismissable toast with CTA to version history, fired mid-typing from a bridge-level merge — **does not exist as a precedent in surveyed production editors.** Adopting it would be a novel pattern for our class, not an industry-ratified default.

---

### Finding: Disconnection toasts ARE a common pattern — distinct from merge-conflict toasts
**Confidence:** CONFIRMED
**Evidence:** [Figma Help — What can I do offline](https://help.figma.com/hc/en-us/articles/360040328553); our own `packages/app/src/presence/use-sync-toasts.ts`; Google Docs' "Offline — will sync when reconnected" banner

Connection-state toasts ("offline / reconnected / syncing / error") are broadly used. They warn about a system state the user can't directly observe but needs to know to trust the product.

**Implications:** There's precedent for toast-based system-state messaging in editors. A bridge-merge-loss event is a different kind of signal (rare, not about connection state), but the *mechanism* (sonner-style ephemeral toast, dismissable, optional CTA) is well-understood UX and not a jarring departure from existing editor UX.

---

## Negative searches

- "Dropbox Paper conflict toast notification" → No hits.
- "Quip merge conflict version history link notification" → No hits; Quip is deprecated.
- "HackMD collaborative conflict notification" → No hits on content-loss UX.

---

## Gaps / follow-ups

- Ink & Switch's Patchwork notebook exists but the page fetch returned empty content. Subsequent follow-up could scrape the full notebook HTML.
- No inspected editor explicitly discusses the "bridge between two CRDT representations" failure class (because none of them have it — it's specific to our dual-CRDT architecture).
