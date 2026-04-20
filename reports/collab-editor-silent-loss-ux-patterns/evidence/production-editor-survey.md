# Evidence: Production editor survey

**Dimension:** Production editor survey — how do Google Docs, Notion, Figma, Linear, Obsidian, VS Code Live Share, CodeMirror/ShareJS, and Replit handle merge anomalies / potential content loss?
**Date:** 2026-04-16
**Sources:** Official blog posts and documentation from each vendor, plus user-reported behavior on community forums.

---

## Key pages referenced

- [Figma — How Multiplayer Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — explains conflict resolution algorithm (last-writer-wins per property) but no user-facing conflict UX in the multiplayer case
- [Figma — Making Multiplayer More Reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/) — write-ahead journal for durability; no user-facing anomaly UX
- [Figma — Get updates from main files](https://help.figma.com/hc/en-us/articles/5665728006423) — library-updates/branches flow, NOT multiplayer
- [Notion — Use pages offline](https://www.notion.com/help/use-pages-offline) — official offline-mode docs
- [Notion — How we made Notion offline](https://www.notion.com/blog/how-we-made-notion-available-offline) — no user-facing conflict UX discussion
- [Obsidian forum — Add notification warning when merge happens](https://forum.obsidian.md/t/obsidian-sync-add-a-notification-warning-when-sync-merge-with-conflicts-happens/14943) — open feature request since 2021; as of v1.9.10 only a log entry, no toast/popup
- [Google Drive blog — Conflict resolution in the new Google Docs](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_22.html) — foundational OT-based design
- [Replicache — Reset Strategy](https://doc.replicache.dev/strategies/reset) — technical docs only, no UX guidance
- [VS Code Live Share — ACM TOSEM study 2024](https://dl.acm.org/doi/10.1145/3643672) — academic study on Live Share; documents absence of disconnect/conflict notifications

---

## Findings

### Finding: Google Docs uses OT with no user-facing conflict UX on the happy path
**Confidence:** CONFIRMED
**Evidence:** [Google Drive Blog, 2010](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_22.html); contemporary technical summaries such as [Medium: OT as an algorithm for automatic conflict resolution](https://medium.com/coinmonks/operational-transformations-as-an-algorithm-for-automatic-conflict-resolution-3bf8920ea447)

> "Google Docs uses Operational Transformation (OT) ... concurrent edits are resolved automatically, so users don't experience merge conflicts."

Google Docs never shows a conflict toast in the normal case. The user learns about "someone else made changes" via live cursors and avatars, not via a conflict notification. Version history is accessed explicitly through File → Version history, not pushed to the user. Google Docs DOES show a notice for a different class of event: "Document offline — changes will be saved when you reconnect" during disconnection.

**Implications:** Google Docs does not have the "dismissable toast with CTA to version history" pattern for merge anomalies. The design commits to OT-level automatic resolution, with version history as the passive safety net. This is the philosophical baseline the D3 decision in `specs/2026-04-16-bridge-correctness/SPEC.md §D3` cites.

---

### Finding: Notion does NOT notify on merge anomalies — it creates duplicate pages as the signal
**Confidence:** CONFIRMED
**Evidence:** Multiple third-party summaries ([AFFiNE blog](https://affine.pro/blog/notion-offline), [TaskFoundry](https://www.taskfoundry.com/2025/08/notion-offline-mode-setup-sync-conflict-guide.html), [NotionApps](https://www.notionapps.com/blog/notion-offline-guide))

> "When you edit a project offline while a colleague updates it via another connection, Notion preserves both versions as separate pages upon reconnection, creating duplicate titles like 'Project Brief' and 'Project Brief (Conflict)'."

> "There is no warning or notification before sync conflicts occur, though Notion may create duplicate pages with names like 'Project Brief (Conflict)' when it can't reconcile changes."

> "Notion's CRDT system handles text merges well, but database properties like select fields, dates, relations, and rollups don't merge — when two people edit the same property offline, only one version survives and the other is silently overwritten."

**Implications:** Notion's user-visible conflict signal is **artifact creation** (a duplicated page in the sidebar), not a toast. For the lossy property-merge case (last-writer-wins on selects/dates/relations), content is silently overwritten — no notification at all. The sidebar's appearance-of-a-new-item is the entire UX.

---

### Finding: Figma's ONLY user-facing "review/dismiss" flow is library branching — NOT the multiplayer case
**Confidence:** CONFIRMED
**Evidence:** [Figma help — Review branch changes](https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes); [Figma help — Get updates from main files](https://help.figma.com/hc/en-us/articles/5665728006423)

Figma has two distinct conflict surfaces:

1. **Multiplayer editing** (real-time, last-writer-wins per property): no conflict UX at all. The multiplayer engineering blog post explicitly states the conflict resolution is automatic and user-invisible: "Two simultaneous changes are independent unless they affect the same property on the same object, in which case we pick the latest change."

2. **Branches/library updates** (Git-style branching, paid feature): HAS a Review/Dismiss flow with version-history access. This fires when a merge-target file has new changes that conflict with the branch.

> "When there are changes to layers you are editing in your branch, you may need to resolve conflicts. You can do this as soon as new changes are available, or when you merge the branch."
> "You can select 'Show version history' to open version history in the right sidebar."

**Implications:** Figma does NOT treat real-time multiplayer merges as a user-UX concern. The Review/Dismiss flow is reserved for an explicit branching ceremony — i.e. when the user has opted in to a Git-like workflow and knows they will have to resolve. The "keep typing" philosophy holds for default multiplayer, matching the D3 lock decision.

---

### Finding: Obsidian Sync has an ACTIVE USER COMPLAINT about silent merges; no notification was shipped
**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum feature request thread](https://forum.obsidian.md/t/obsidian-sync-add-a-notification-warning-when-sync-merge-with-conflicts-happens/14943) — 2021 request, still open; Obsidian team response in 2023 notes v1.5 added log entries but not UI notifications

User complaints (quoted verbatim from the thread):

> "Obsidian silently syncs in the background and doesn't warn me if it is merging a file."
> "Notes mysteriously become blank, requiring manual recovery file checks."
> "Manually checking the log all the time...to make sure my files haven't been corrupted...is a bad experience."

User requests:
- Popup notification when merges occur ("merged 6 files, see log for details")
- Sync log filtering by merge status
- Persistent dismissible alerts (not auto-disappearing)
- Git-style conflict UI with manual selection

Obsidian team (@WhiteNoise, 2023-11): merge-conflict information was added to sync logs in v1.5, popup notice remains an open feature request. v1.9.10 added "Create conflict file" as an alternative to auto-merge, but still no proactive notification.

**Implications:** Obsidian sits in the "silent log + counter" camp that our current D3 approach sits in. **Users complain about this specifically.** The absence of a toast notification is perceived by users as a bug, not a design choice. This is a direct counterexample to the philosophy that "silent logging is enough" when the failure class includes real content loss (Obsidian's "notes go blank" class) rather than just anomaly-without-loss.

---

### Finding: VS Code Live Share has documented absence of offline-conflict notifications; research flags this as a usability gap
**Confidence:** CONFIRMED
**Evidence:** [ACM TOSEM 2024 — Understanding Real-Time Collaborative Programming](https://dl.acm.org/doi/10.1145/3643672)

> "The most serious challenges with Live Share are lagging, followed by permissions and conflicts."
> "The host cannot receive an obvious notification when a guest loses network connection, and when the host is immersed in development tasks, this issue becomes severe because it is more challenging to know the offline status of the guests timely."

> (Reported issue in Live Share GitHub) "Collaboratively editing the same file caused it to lose sync and changes from remote were not reflected in actual files."

**Implications:** Live Share chose the "silent" design and an independent academic study documents the resulting usability problems — primarily around presence/connection, secondarily around conflicts. A research community consensus exists that connection/sync anomalies in real-time editors SHOULD surface to users.

---

### Finding: Replit uses task-isolation + automatic merge; conflicts happen at explicit "apply" ceremony, not silently
**Confidence:** CONFIRMED
**Evidence:** [Replit docs — Multiplayer](https://docs.replit.com/replit-workspace/workspace-features/multiplayer); [Replit blog — Making Repl.it Collaborative at Heart](https://blog.replit.com/collab)

Replit's Agent-era model routes concurrent work through isolated task copies, merged explicitly at the end. This is structurally similar to Figma's branching: conflicts are deferred to an explicit merge ceremony, not surfaced mid-typing. For raw multiplayer text editing, Replit uses OT (same lineage as Google Docs) with no user-facing conflict UX.

**Implications:** Another instance of the dichotomy — real-time typing stays silent; explicit merge ceremonies surface conflicts. No "mid-typing toast" pattern found.

---

### Finding: CodeMirror-collab / ShareDB / prosemirror-collab — transport libraries with NO prescribed UX
**Confidence:** CONFIRMED
**Evidence:** [prosemirror-collab README](https://github.com/ProseMirror/prosemirror-collab); [Marijn Haverbeke's essay](https://marijnhaverbeke.nl/blog/collaborative-editing.html); [ShareDB README](https://github.com/share/sharedb)

These libraries provide the transport and OT/CRDT primitives; they ship no user-facing UX. Application developers choose whether to display conflict or anomaly signals. Haverbeke's essay explicitly notes that "you can't do automatic merging — you have to identify conflicts and present them to the user to resolve" but this is presented as a technical framing, not a concrete UX pattern.

**Implications:** The CodeMirror/ShareJS/prosemirror-collab ecosystems are the primitives our system builds on; the UX question is our own to answer. There is no industry-ratified pattern we can adopt from these libraries.

---

## Negative searches

- **"Google Docs toast notification merge conflict"** → No evidence Google Docs shows in-editor notifications for merge anomalies. Version history is always manually accessed.
- **"Figma Review Dismiss multiplayer conflict toast"** → Confirmed (via direct fetch of Figma's own multiplayer engineering blogs) that the Review/Dismiss flow is for library branches, not multiplayer. Earlier search-result summaries conflated the two surfaces.
- **"Notion conflict toast version history CTA"** → No evidence. Notion's user-facing signal is duplicate-page creation (artifact), not a transient notification.

---

## Gaps / follow-ups

- Replit Teams' "Ghostwriter Collaborative" specific UX not documented publicly; behavior in 2026 Agent era may differ from the 2018–2020 Multiplayer era docs.
- Linear's rich-text editor internal architecture not publicly documented beyond "it uses ProseMirror"; conflict UX unknown — no Linear blog post found mentioning it.
- Google Docs mobile may differ from web; not investigated.
