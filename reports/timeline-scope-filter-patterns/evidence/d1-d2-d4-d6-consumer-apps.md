# Evidence: D1/D2/D4/D6 — Consumer apps (Google, Notion, Figma, Obsidian, Dropbox)

**Dimension:** D1 (scope-switching UI), D2 (density/aggregation), D4 (filter composition), D6 (empty states) — consumer content products
**Date:** 2026-04-20 (research access date 2026-04-17)
**Sources:** Official help docs, developer docs, product blogs

---

## Key files / pages referenced

- [Google Drive Help: Check activity & file versions](https://support.google.com/drive/answer/2409045)
- [Google Docs Help: Version history](https://support.google.com/docs/answer/190843)
- [Google Workspace Updates — Oct 2023 Activity view](https://workspaceupdates.googleblog.com/2023/10/new-view-in-google-drive-shows-recent-activity.html)
- [Google Drive Activity API](https://developers.google.com/drive/activity)
- [Google Workspace Admin: Drive log events](https://support.google.com/a/answer/4579696)
- [Stony Brook IT KB: Viewing Recent Activity in Google Drive](https://it.stonybrook.edu/help/kb/viewing-recent-activity-in-google-drive)
- [Notion Help: Inbox & notifications](https://www.notion.com/help/updates-and-notifications)
- [Notion Help: Workspace analytics](https://www.notion.com/help/workspace-analytics)
- [Notion Help: Feed view](https://www.notion.com/help/feeds)
- [NotionBase: What Is Page History](https://thenotionbase.com/what-is-page-history-in-notion)
- [Kidonng: Bring back All/Following updates petition](https://kidonng.notion.site/Bring-back-All-and-Following-updates-tab-in-Notion-495993c53ecd4a4eacd904a40e9bbb6e)
- [Figma Help: View a file's version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)
- [Figma Help: View and export activity logs](https://help.figma.com/hc/en-us/articles/360040449533-View-and-export-activity-logs)
- [Figma Help: See viewer history](https://help.figma.com/hc/en-us/articles/29638316371479-See-viewer-history-for-your-files)
- [Obsidian Help: File recovery](https://obsidian.md/help/plugins/file-recovery)
- [Obsidian Sync](https://obsidian.md/sync)
- [Dropbox Help: File activity](https://help.dropbox.com/organize/file-activity)
- [Dropbox Help: Recents overview](https://help.dropbox.com/organize/recents-overview)
- [Dropbox Help: Version history overview](https://help.dropbox.com/delete-restore/version-history-overview)

---

## Findings — Google Drive / Google Docs

### D1 (CONFIRMED) — Context-bound info-panel pattern
**Finding:** Google Drive uses a right-sidebar "Activity" panel whose content re-scopes based on file-browser selection: nothing selected = whole-Drive activity; folder selected = folder activity; file open = per-file activity. A separate standalone "Activity" page (Oct 2023 launch, left-nav entry) acts as a workspace-wide landing surface for pending access requests, approvals, and last-30-days comments — not a general event feed.
**Evidence:** Stony Brook IT KB — "to see new activity of a specific document or folder, first select that item from drive to view activity for only it." Drive Help documents Info button → Activity for recent changes; Oct-2023 Updates blog — "a standalone page that's accessible from the left hand navigation panel."
**Implications:** The affordance is the file tree itself — no tabs, no dropdown, no chip selector. Users who don't know to click the info icon will miss it.

### D2 (CONFIRMED at API level, INFERRED at UI level) — Consolidated grouping by actor+target with time range
**Finding:** The Drive Activity API supports a `consolidated` response mode that groups runs of actions by shared actor/target into a single logical entry with a unified `TimeRange` rather than a `Timestamp`. UI reflects this — N edits by the same actor in a short window become one entry with a range, not N rows. No explicit date-bucket headers (Today / Yesterday) documented.
**Evidence:** Drive Activity API docs — each `DriveActivity` resource carries "summary information, such as every Actor and Target from all the actions, a unified Timestamp or TimeRange"; "activity consolidated in the response" is caller-requestable.
**Implications:** Run-collapse is a data-model decision, not UI-only. Defining the entry shape to support ranges once pays across every surface.

### D4 (CONFIRMED) — Consumer filter-free; admin gets full condition builder
**Finding:** User-facing Activity sidebar has no in-panel filter bar (no actor, type, or date). Filtering is achieved by re-scoping (pick a different file/folder). The admin Audit & Investigation tool has a condition builder with AND/OR over event type, actor, date range, visibility, doc type, resources.
**Evidence:** Google Workspace Admin Help redirects to drive-log-events reference; no filter controls mentioned in user-facing Drive Help, Stony Brook KB, or Updates blog.
**Implications:** Deliberate split — everyday user (scope-by-selection, no filters) vs. compliance investigation (full filter builder). Two products, not one layered UX.

### D6 (CONFIRMED hide-when-empty; NOT FOUND explicit copy) — Sections hide when empty
**Finding:** The Oct-2023 standalone Activity page omits sections like "Manage access" entirely when they have no entries. No documented empty-state message or prompt-to-broaden-scope copy.
**Evidence:** Updates blog — "'Manage access' won't display if pending access requests do not exist."
**Implications:** Hide-over-placeholder pattern is consistent with Google's minimalist dashboard aesthetic but offers no template for "no activity in this scope — try broader."

---

## Findings — Notion

### D1 (CONFIRMED) — Three fragmented surfaces, not a unified scope picker
**Finding:** Notion splits scope across (1) per-page **Updates** tab (via `•••` or clock icon on page), (2) workspace-wide **Inbox** (sidebar), (3) **Workspace Analytics** (Settings → Analytics, Members/Content/AI/Search tabs). No teamspace- or database-level native timeline. Previously-shipped "All" and "Following" update tabs were removed, prompting a user petition for restoration.
**Evidence:** Notion Help Inbox page — "The Inbox at the top of your sidebar gathers updates from across your workspace"; NotionBase describing per-page Updates via `•••`; Workspace Analytics docs — "workspace-level only—not switchable between workspace/teamspace/page levels"; Kidonng petition calling for restored tabs.
**Implications:** Fragmenting scopes across separate surfaces doesn't let users browse "what happened in this folder today." Notion's Inbox is notification-centric, not timeline-centric.

### D2 (CONFIRMED) — Two-level grouping (page → thread) in Inbox; flat list in Updates
**Finding:** Inbox groups updates "by page and by comment thread" with caret-collapse. Per-page Updates tab is flat chronological. Workspace Analytics shows aggregated metrics (90-day active members, sortable by Page views/Page edits/Last active) — not event feed.
**Evidence:** Notion Help Inbox — "organized by page and by comment thread... Users can collapse notifications by page using the caret (^) control"; Workspace Analytics Members tab columns.
**Implications:** Page/thread grouping works for notifications but doesn't scale to edit-event feeds. Distinction matters: notification stream ≠ timeline.

### D4 (CONFIRMED) — Fixed filter modes, tab-scoped
**Finding:** Inbox has four fixed modes: Unread-and-read, Unread-only, Archived, All-workspace-updates. No actor or date-range chips. Workspace Analytics Content tab: Created on / Created by / Teamspace. AI tab filters by Agents / Connectors / Meeting notes. Each tab has its own filter set — no unified filter bar.
**Evidence:** Notion Help Inbox filter modes; Workspace Analytics Content-tab filter list.
**Implications:** Fragmented per-tab filters keep each surface simple but prevent cross-cutting queries like "activity by Alice across the whole workspace this week."

### D6 (INFERRED) — Empty filtered databases show "No filter results" + action CTA
**Finding:** Notion's 2025 sidebar/database redesign shows "No filter results" + a prominent "New page" button when filtered views return zero rows. Empty-state copy for Inbox or Updates not documented separately.
**Evidence:** The Organized Notebook blog on Notion 3.4 (T3 corroboration).
**Implications:** Couples negative-state with forward action. Timeline analog: "No activity in this scope — view all workspace activity" as one-click scope broadening.

---

## Findings — Figma

### D1 (CONFIRMED) — Per-file only; admin Activity Logs separate; Viewer History is a third surface
**Finding:** Version History is strictly per-file (File menu → Show Version History → right sidebar). No file-tree-level, project-level, or team-level version timeline. Admin-only **Activity Logs** (Org/Enterprise) in Admin sidebar is org-wide event logging. **Viewer History** (Feb 2025) is per-file via right-sidebar avatar dropdown.
**Evidence:** Figma Help — "Version history operates per-file. Each file maintains its own timeline of changes"; Activity Logs page — "click Admin in the left sidebar, then click Activity"; Viewer History — "click your avatar in the right sidebar."
**Implications:** Design-tool ergonomics (designers live in one file at a time) justify Figma's per-file-only default. Inadequate template for a multi-doc knowledge product.

### D2 (CONFIRMED) — Autosaves grouped by date; named versions inline; "Show older" lazy-load
**Finding:** Version History panel automatically groups autosaves into collapsible date groups. Named versions are inline with timestamps and contributor names. "Show older" button lazy-loads earlier history.
**Evidence:** Figma Help — autosaved versions grouped by date; "Click Show older to explore more of a file's history."
**Implications:** Date-bucket + expandable autosaves + first-class named versions is a compact, well-shaped design — maps directly onto Open Knowledge's existing `checkpoint` vs. `wip` distinction (named = checkpoint; autosave = wip).

### D4 (CONFIRMED) — No filters on Version History; admin Activity Logs has Member/Date/Events/Team
**Finding:** Version History has zero filters. Admin Activity Logs has four: Member email, Date range, Event types, Team.
**Evidence:** Figma Help Activity Logs page — documented filter list.
**Implications:** Same consumer/admin split as Google: no filters in the everyday surface.

### D6 (NOT FOUND) — No empty-state documentation
**Finding:** Figma help docs do not document empty-state copy for version history. New files autosave within minutes so empty state is rare in practice.
**Evidence:** Search of Figma Help Version History page — no empty-state text.
**Implications:** Not a useful template when "no activity in folder X" is a realistic state.

---

## Findings — Obsidian

### D1 (CONFIRMED) — Per-file only, explicit design choice
**Finding:** File Recovery (core plugin) and Sync Version History are strictly per-file. To view history, open the file, then "File recovery: Open local history" via command palette or File menu. No vault-wide, folder-scoped, or cross-file timeline exists in core or Sync. Community plugins (e.g., Version History Diff) add diff views but not cross-file scope.
**Evidence:** Obsidian Help File Recovery — instructions select a specific note first; Obsidian Sync page — "version history for every note" (per-note, 1-year retention).
**Implications:** Obsidian is an anti-pattern reference — proof that a credible writing tool can ship with strictly per-file history. For team/workspace products, this is a floor, not a template.

### D2 (CONFIRMED) — Thin vertical list, minimum 5-minute snapshot spacing
**Finding:** Per-file list is chronological. Default minimum snapshot spacing 5 minutes; 7-day retention (File Recovery local), 1-year retention (Sync). No documented grouping.
**Evidence:** Obsidian Help — "snapshots are saved a minimum of 5 minutes from each other, and kept for 7 days."
**Implications:** No density template to borrow.

### D4 / D6 — N/A
**Finding:** No filters (single-scope UI), no documented empty-state copy.
**Evidence:** Obsidian Help File Recovery page documents no filters or empty-state copy.
**Implications:** N/A.

---

## Findings — Dropbox

### D1 (CONFIRMED) — Explicit three-tier multi-scope (file / folder / account-wide) via fragmented entry points
**Finding:** Dropbox is the only consumer product surveyed with genuine multi-scope timelines: (1) per-file Activity tab (file preview → Activity), (2) per-folder "Folder activity" (folder → ellipsis → Folder activity, includes subfolders), (3) account-wide activity (gear icon next to "All files" → feed). Separate Notifications/Recents sidebar (desktop/mobile). Team accounts can toggle personal vs. team views inside the feed.
**Evidence:** Dropbox Help Version history page — "Folder activity: View all changes within a specific folder and its subfolders… Account-wide activity: 'a list of any changes made to files and folders in your Dropbox account, from newest to oldest'"; File activity page — per-file File menu → Activity; Recents — "Team account members can toggle between personal and team views."
**Implications:** Dropbox is the closest template for a multi-scope timeline. Scope switching uses explicit entry points (gear, folder menu, file menu) plus a personal/team toggle inside the feed — not tabs on a single surface. Fragmentation may reflect legacy file-manager UI rather than designed primitive.

### D2 (CONFIRMED) — Newest-to-oldest flat list, no documented aggregation
**Finding:** Account-wide activity is "newest to oldest." Folder activity is recursive (includes subfolders). Retention varies by plan (Basic/Plus/Family 30 days; Professional/Business 180; Enterprise 365). No run-collapse or date-bucket grouping documented.
**Evidence:** Dropbox Help Version history — "from newest to oldest"; plan-based retention tables.
**Implications:** At heavy-team scale, account-wide without aggregation likely produces wall-of-events. Compared to Google's API-level `consolidated` field, Dropbox's UI appears less sophisticated.

### D4 (CONFIRMED — by documented absence) — Consumer Activity has no filters; admin console does
**Finding:** No filter options in user-facing Activity/Version History views (no actor, type, or date-range chip). Admin console has separate "View team activity" with filters.
**Evidence:** Dropbox Help File activity and Version history pages — no documented filter options in consumer docs.
**Implications:** Consistent split: consumer filter-free vs. admin filter-heavy.

### D6 (NOT FOUND) — No empty-state documentation
**Finding:** No documented empty-state UX.
**Evidence:** Dropbox Help surfaces produced no empty-state documentation in targeted searches.
**Implications:** N/A.

---

## Synthesis (preliminary, to refine in REPORT.md)

Four patterns emerge:

1. **Context-bound scope (Google Drive, Dropbox)** — right-rail panel re-scopes based on file-browser selection. Zero-chrome, discoverable only via info icon.
2. **Dedicated standalone page (Notion Inbox, Google Oct-2023 Activity page)** — narrow to notifications/action items, not general edit feeds.
3. **Per-file only (Figma, Obsidian)** — acceptable for single-file tools; inadequate for multi-doc.
4. **Admin-separate filtering** (every product) — consumer filter-free, admin filter-heavy.

None of the five products ship a consumer-facing UI with explicit scope-chips (file/folder/workspace toggle) + cross-cutting filters (actor, date, type) in one coherent surface. That design space is unclaimed at the consumer tier. Notion's removed "All"/"Following" tabs + user petition suggests demand exists but canonical answer hasn't shipped.

Density aggregation is underdeveloped across the set — Google API and Figma date-groups are the only explicit primitives documented.

Vendor-bias note: all sources here are vendor help docs describing their own products. Bias toward feature-presence overstatement is possible; omissions (e.g., "no filters") are harder to overstate so CONFIRMED-by-absence findings are more reliable than CONFIRMED-feature-presence ones.

---

## Gaps / follow-ups

- No empirical data on density perception — how users actually react to 10 vs. 100 vs. 1000 entries per scope. Would require UX research.
- Did not probe Craft, Roam, Logseq — other knowledge apps may have multi-scope timelines worth comparing. Time-boxed.
- Dropbox admin console filter set not fully enumerated (mentioned but not detailed).
- Notion petition is T3 signal of demand but doesn't prove Notion plans to ship it — treat as anecdote, not roadmap.
