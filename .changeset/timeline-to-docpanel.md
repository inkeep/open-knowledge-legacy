---
"@inkeep/open-knowledge-app": minor
---

feat(editor): Timeline (version history) is now a tab in the document panel — version list stays visible while you preview a historical version.

The standalone Timeline Sheet that overlaid the editor is replaced by a 5th `Timeline` tab in the right-rail document panel, alongside Outline, Backlinks, Outgoing Links, and Graph. Clicking an entry switches the editor to diff mode without closing the version list, so you can scan multiple historical versions back-to-back without the open/close cycle the Sheet required. Diff mode persists when you switch to a different DocPanel tab — the Restore + Close affordances in the editor banner stay visible — and a new "Current version" row at the top of the Timeline tab is the tab-local exit.

The clock-icon **History** button in the editor header is removed — the Timeline tab is the sole discovery surface. Use the document panel's collapse button in the editor header to hide the panel entirely.

A long-standing bug is fixed alongside: navigating to a different document while previewing a historical version now exits diff mode and the Timeline tab refetches for the new document. Previously the diff for the prior file would silently linger in the editor area, a discrepancy the per-file scoping of the history API made confusing.

No changes to the history or rollback APIs. The polling cadence (10s while the Timeline tab is mounted) and retention policies are unchanged.
