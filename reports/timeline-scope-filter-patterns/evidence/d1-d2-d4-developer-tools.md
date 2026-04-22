# Evidence: D1/D2/D4 — Developer tools (GitHub, GitLab, VS Code, Linear, Jira, desktop clients)

**Dimension:** D1 (scope-switching UI), D2 (density/aggregation), D4 (filter composition) — developer products. D3 for GitHub/GitLab covered here at product-level; git mechanics deep-dive is in `d3-git-mechanics.md`.
**Date:** 2026-04-20 (research access date 2026-04-17)
**Sources:** Official docs, release notes, open source repo code, community discussions

---

## Key files / pages referenced

- [VS Code 1.44 Release Notes — Timeline](https://code.visualstudio.com/updates/v1_44)
- [vscode.proposed.timeline.d.ts](https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.timeline.d.ts)
- [vscode/extensions/git/src/timelineProvider.ts](https://github.com/microsoft/vscode/blob/main/extensions/git/src/timelineProvider.ts)
- [microsoft/vscode Issue #84297 — API support for Timeline view](https://github.com/microsoft/vscode/issues/84297)
- [microsoft/vscode PR #89262 — Initial Timeline support](https://github.com/microsoft/vscode/pull/89262)
- [VS Code Source Control Overview](https://code.visualstudio.com/docs/sourcecontrol/overview)
- [GitHub Docs — Using the activity view](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-the-activity-view-to-see-changes-to-a-repository)
- [GitHub Changelog — Repository pushes activity (2023-05-31)](https://github.blog/changelog/2023-05-31-view-repository-pushes-on-the-new-activity-view/)
- [GitHub Docs — Using Pulse](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-pulse-to-view-a-summary-of-repository-activity)
- [GitHub Docs — Tracking changes in a file](https://docs.github.com/en/repositories/working-with-files/using-files/tracking-changes-in-a-file)
- [GitHub REST API — List commits](https://docs.github.com/en/rest/commits/commits)
- [GitHub Community Discussion #5706](https://github.com/orgs/community/discussions/5706)
- [GitLab Docs — Repository](https://docs.gitlab.com/ee/user/project/repository/)
- [GitLab Docs — Contributions calendar](https://docs.gitlab.com/ee/user/profile/contributions_calendar.html)
- [Linear Docs — Filters](https://linear.app/docs/filters)
- [Linear Docs — Conceptual model](https://linear.app/docs/conceptual-model)
- [Linear Changelog](https://linear.app/changelog)
- [Atlassian Developer — jira:issueActivity module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-activity/)
- [Atlassian Community — Activity Stream Gadget](https://community.atlassian.com/forums/App-Central-articles/How-to-configure-Activity-Stream-Gadget-for-Jira-instruction/ba-p/2428521)
- [Atlassian Support — Viewing Log/History (Sourcetree)](https://support.atlassian.com/sourcetree/kb/viewing-log-history-of-a-repository/)
- [GitHub Desktop Issue #11990 — File History](https://github.com/desktop/desktop/issues/11990)
- [GitHub Desktop Issue #8913 — Filter in history list](https://github.com/desktop/desktop/issues/8913)

---

## Findings — GitHub

### D1 (CONFIRMED) — URL-encoded scope across separate surfaces
**Finding:** GitHub splits scope across distinct navigation affordances bound to URL path: per-file (`/blame/` and "History" button on file view), per-folder (Tree view's History button filters by path), repo-wide commit list at `/commits/<branch>`, repo-wide Activity view at `/activity` (scoped by branch, not path). Pulse and Insights (Contributors, Code Frequency, Network) are repo-only. No unified widget that flips between "this file / this folder / this repo."
**Evidence:** GitHub Docs "Using the activity view" — Activity view has four dropdowns: BRANCH NAME, All activity, All users, All time. GitHub Community Discussion #5706 — "When you drill down to look at a directory or file... there is a 'History' button that takes you to the list of commits affecting that particular directory/file."
**Implications:** Scope-by-URL is simple for server-rendered pages but loses state on navigation; users can't toggle scope without losing other filter state.

### D2 (CONFIRMED for Pulse time range; INFERRED for pagination) — "Load more" paging; day-header grouping; no run-collapse
**Finding:** Activity view and commit-list pages use server-rendered pagination (Older button), not infinite scroll. Items chronological with day-header grouping. No collapsing of related events — each push is its own row. Pulse aggregates coarsely (summary counts, top-15 contributors, default 7-day window, dropdown for other periods).
**Evidence:** GitHub Docs Pulse — "shows the last seven days of repository activity." Activity view docs don't explicitly describe pagination.
**Implications:** "Pick scope URL, then scroll/paginate chronologically" — not density-aware.

### D3 (CONFIRMED for REST mapping; UNCERTAIN backing-store) — REST mirrors `git log`, activity events are event-sourced separately
**Finding:** REST List Commits endpoint accepts `path`, `author`, `since`, `until`, `sha` — direct mapping to `git log --author --since --until <sha> -- <path>`. Folder vs. file scope uses same `path` param (server does `git log -- <path>`). Docs note "timestamps must be between 1970-01-01 and 2099-12-31" — hints commits queried from git, not denormalized. Activity view events (pushes/force-pushes/branch create/delete) are event-sourced separately since these aren't in `git log` output.
**Evidence:** GitHub REST "List commits" docs; `git log` man page — `--follow` "only works for a single file."
**Implications:** Folder history perf bounded by git's own `git log -- <path>` cost. File-rename tracking via `--follow` works per-file but cannot extend to folders.

### D4 (CONFIRMED) — Four orthogonal dropdowns on Activity view; path+branch via URL on commit list
**Finding:** Activity view composes branch + activity type + user + time as four orthogonal dropdowns. Commit-list pages implicitly compose path + branch via URL. Explicit author/date filters only via REST, not UI. No chip-based filter bar.
**Evidence:** GitHub Docs Activity view page — four dropdowns listed.
**Implications:** Simple composition but not URL-shareable with filter state; REST is the composable surface.

---

## Findings — GitLab

### D1 (CONFIRMED) — Scope split across distinct nav items
**Finding:** GitLab separates repo/file/folder/user scope across nav items: Code → Repository graph (repo-wide commit/branch graph), find-file-history + Git blame (per-file), Contributor analytics (per-member line charts), user-profile Activity feed with Followed-users tab plus RSS.
**Evidence:** GitLab Repository docs — "Repository graph" described; contributions-calendar docs — "approved, closed, commented, created, merged, pushed commits" events + Followed-users tab + RSS.
**Implications:** No unified multi-scope timeline; menu-item navigation rather than scope picker.

### D2 (INFERRED) — Day-granularity heatmap at user scope; flat chronological elsewhere
**Finding:** Contributions calendar aggregates day-granularity over 12 months (GitHub-style heatmap). Activity feed is chronological. No documented collapse/grouping.
**Evidence:** Contributions calendar docs — "shows a user's events from the past 12 months."
**Implications:** Heatmap is user-scope only; repo/file scope stays flat-list.

### D3 (UNCERTAIN) — Events API exists but not verified in-session
**Finding:** GitLab exposes events via REST Events API (`/api/v4/events`, project events, user events), filterable by target_type/action/before/after/scope. Commit history follows same `git log -- <path>` model.
**Evidence:** Not loaded for Events API specifically in this research pass.
**Implications:** Cleaner server-side event store for non-commit activity than GitHub — but not verified.

### D4 (INFERRED) — Tab strip for user activity; not chip composition
**Finding:** User Activity page uses tab strip (All / Followed users / specific event types) rather than composable chips.
**Evidence:** Contributions-calendar docs note Followed-users as a tab.
**Implications:** Simpler, less flexible than Linear.

---

## Findings — VS Code Timeline + TimelineProvider

### D1 (CONFIRMED) — Strictly per-file, bound to active editor
**Finding:** The Timeline view is strictly per-file, bound to the active editor. No configurable scope switcher — the view auto-updates to the currently-open file. A toolbar eye icon toggles whether Timeline auto-tracks the active editor (pins the current file, doesn't widen scope). For repo-wide history users install separate extensions (Git Graph, GitLens) or use Source Control Graph (a distinct view).
**Evidence:** VS Code 1.44 release notes — "a unified view for visualizing time-series events (for example, Git commits, file saves, test runs, etc.) for a file." Source Control docs — "The Timeline view in the Explorer view shows the commit history for a specific file. Source Control Graph… a visual representation of your branch structure and commit history."
**Implications:** Per-file-only is by construction; all extensibility inherits this constraint. The `TimelineProvider.provideTimeline(uri, options, token)` signature bakes "per-file" into the API contract — `uri` is load-bearing, no `provideProjectTimeline` counterpart.

### D2 (CONFIRMED) — Cursor-based paging with opaque cursor + limit
**Finding:** Cursor-based paging via `TimelineOptions.cursor` (opaque string) and `TimelineOptions.limit` (either `number` or `{timestamp, id}` sentinel for "all newer than"). The returned `Timeline` object carries `paging.cursor` if more items exist. Git's built-in provider requests `limit+2` entries per page to decide whether to emit a cursor.
**Evidence:** `vscode.proposed.timeline.d.ts` — `TimelineOptions { cursor?: string; limit?: number | {timestamp: number; id?: string} }` and `Timeline { paging?: { cursor: string | undefined }; items: readonly TimelineItem[] }`. `extensions/git/src/timelineProvider.ts` — `repo.logFile(uri, { maxEntries: limit, hash: options.cursor, follow: true, shortStats: true })`.
**Implications:** Opaque-per-provider cursor lets extensions define cursor semantics (commit hash for git; anything else possible). Limit accepting `{timestamp, id}` sentinel enables "fetch everything newer than X" without knowing page size — nice for change-feed subscriptions.

### D3 (CONFIRMED) — Git provider uses `git log --follow -- <path>` per file
**Finding:** Git provider invokes `repo.logFile(uri, { maxEntries, hash: cursor, follow: true, shortStats: true })` — `git log --follow -- <path>` with limit. Cursor is last commit's hash from previous page. `follow: true` = rename-tracking on by default per-file. No project-scoped git invocation since Uri parameter is load-bearing.
**Evidence:** `timelineProvider.ts` source — direct `logFile` call.
**Implications:** Cost scales with file history depth × number of registered providers. Adding many providers compounds the cost since each runs on editor change.

### D4 (CONFIRMED) — No filter composition primitives
**Finding:** API exposes no filter composition primitives — no `author`, no `eventType`, no date-range beyond cursor/limit's "newer than" sentinel. Filtering across sources (show/hide providers) is a user setting (`timeline.excludeSources`), not a per-view filter. Extensions can contribute menu items as action affordances, not query filters.
**Evidence:** `vscode.proposed.timeline.d.ts` — TimelineProvider surface has `id`, `label`, `onDidChange`, `provideTimeline`; no author/event filter hooks. VS Code 1.44 — "Users can choose which sources to include" via setting.
**Implications:** By design, filters are pushed to providers via the opaque cursor; Timeline itself is a dumb renderer. Cross-source filtering ("all commits AND test runs by user X in past week") cannot be composed by the host.

### Special API notes
**Registration:** `registerTimelineProvider(scheme: string | string[], provider: TimelineProvider): Disposable` — `scheme` (`'*'` for all documents, `'file'`, `'git'`, etc.) is the sole scope predicate the host applies before dispatching. Scheme filter is binary, not hierarchical.

**Original design intent:** Issue #84297 indicates paging was NOT in the first design (`provideTimeline(uri, since, token)` with just a `Date` cutoff), and PR #89262 removed paging during merge — paging was added back later. Evolution reveals opaque-cursor+limit won over simple since-date once real providers (git) needed to handle 100K-commit histories.

---

## Findings — Linear

### D1 (CONFIRMED per-entity; INFERRED absence of workspace-wide) — Entity-local activity + Views for cross-entity
**Finding:** Linear attaches activity feeds directly to the object being viewed — each issue, project, initiative, document, and cycle has its own activity feed inline with the entity. No unified "workspace-wide activity view"; users build custom Views with filters to achieve cross-entity scope. Scope = "what am I currently viewing" + applied filters.
**Evidence:** Linear changelog — "Projects and initiatives now support comments in their activity feed." Linear Filters docs — workspace/team/project scoping via filter-driven Views.
**Implications:** Activity is entity-local metadata, not a separate timeline surface. Navigate to the entity to change scope — no cross-scope filter bar.

### D2 (INFERRED) — Entity-local chronological feed
**Finding:** Activity entries chronological, threaded under each issue with sorting controls (newest/oldest). Comments and activity unified into one feed per entity. No run-collapse documented.
**Evidence:** Linear docs mention activity feeds but don't document pagination mechanics.
**Implications:** Entity-local scope keeps feed size naturally small; no aggregation problem at workspace level (no workspace-level feed exists).

### D3 (UNCERTAIN) — GraphQL API; not git-backed
**Finding:** Linear is GraphQL-backed with their own datastore. Activity queries are per-entity resolvers.
**Evidence:** Not verified in this research pass.
**Implications:** Different shape than git-backed model.

### D4 (CONFIRMED) — Richest chip + boolean filter composition
**Finding:** Linear's filter model composes via chips in a top bar, with boolean AND/OR combinators available in 2026-era "advanced filters." Filters include Priority, Cycle, Estimate, Labels, Links, Project, Team, Status, Blocked/Blocking, Parent/Sub-issue, Completed/Created/Due/Updated dates, Assignee, Created-by, Subscribers, free-text search. "Click the X on a filter to remove it"; "clicking on any other part of the filter formula will give you options to change it."
**Evidence:** Linear Filters docs — direct quotes above.
**Implications:** The richest filter-composition model in this cohort — chip bar + boolean combinators + persist-as-View. Demonstrates what a filter-layer over a timeline looks like when data isn't git-shaped.

---

## Findings — Jira / Atlassian

### D1 (CONFIRMED) — Per-issue Activity tab + dashboard Activity Stream gadget
**Finding:** Jira's Activity tab attached per-issue. Dashboard-level Activity Stream gadget is the aggregate-scope surface, configured via Configure → Add filter with options for project, user, date, issue, issue type, activity type. No single scope switcher — either look at an issue's Activity tab or configure a gadget with filters.
**Evidence:** Atlassian Developer `jira:issueActivity` module docs — "adds an item to the Activity panel of Jira issues." Atlassian Community Activity Stream Gadget article — configuration steps and filter categories.
**Implications:** Split between entity activity (issue tab) and aggregate activity (dashboard gadget), analogous to VS Code's per-file Timeline vs. external Git Graph extensions.

### D2 (CONFIRMED event types; UNCERTAIN pagination) — Chronological with narrow event taxonomy
**Finding:** ~11 event types tracked: attachment added, comment added, issue closed, issue created, issue edited, issue opened, issue progress started/stopped, issue reopened, issue resolved, issue transitioned. Chronological, no documented density controls.
**Evidence:** Atlassian Community article enumerates event list.
**Implications:** Narrow taxonomy (~11 types) — simpler than GitHub's or Linear's.

### D3 (CONFIRMED plugin model) — Forge plugin contribution surface
**Finding:** `jira-issue-activity` Forge module is a pluggable contribution surface. Backing store is Jira's event DB, not git.
**Evidence:** Forge manifest docs.
**Implications:** Plugin model parallels VS Code TimelineProvider — both let extensions contribute items into a host-managed panel.

### D4 (CONFIRMED) — Dialog-style configuration, not chip bar
**Finding:** Gadget exposes six filters in a configuration dialog (not chip bar), then renders a single feed. Marketplace apps ("Filters Activity Stream") layer JQL composition on top. Community demand for richer filtering, especially JQL-powered (JRASERVER-29839).
**Evidence:** Atlassian Community article; JRA tickets.
**Implications:** Core Jira uses dialog-style config; composable filter bars via third-party. Less inline-interactive than Linear.

---

## Findings — Desktop git clients (Sourcetree, GitHub Desktop)

### D1 (CONFIRMED shortcuts; INFERRED "Log Selected"; CONFIRMED Desktop gap) — Repo-wide default, file scope contextual or absent
**Finding:** Sourcetree uses a dedicated Log View (`Ctrl+2`) with `git log --graph --all --date-order` as default + toggles for "All Branches / Current Branch" + "Show Remote Branches." Per-file history via right-click → Log Selected on a commit's changed file (community-reported; not in scraped official docs). GitHub Desktop has a History tab with text filter; per-file history is a community feature request (Issues #11990, #3178 open as of search date).
**Evidence:** Atlassian Support "Viewing Log/History" — shortcuts + default `git log --graph --all --date-order`. GitHub Desktop Issue #11990 "File History" — open feature request.
**Implications:** Desktop clients default to repo-wide; file scope is contextual right-click or absent. No multi-scope switcher attempt.

### D2 (INFERRED) — Graph or flat-list, no documented aggregation
**Finding:** Sourcetree renders graph with date-ordered or ancestor-ordered commits; pagination/limit not documented. GitHub Desktop is flat-list with text-filter over commit message/author.
**Evidence:** Atlassian docs silent on limits.
**Implications:** Graph scales visually but doesn't aggregate.

### D3 (CONFIRMED) — Shell out to `git log`; client-side filter
**Finding:** Both clients shell out to `git log` and render locally. GitHub Desktop text filter is client-side over loaded commits.
**Evidence:** Standard git-client architecture; GitHub Desktop Issue #8913.
**Implications:** Same path-cost limits as GitHub Web.

### D4 (CONFIRMED) — Minimal filter composition
**Finding:** Sourcetree uses checkboxes (All vs. Current, Show Remote). GitHub Desktop has single text filter. Neither offers chip-based multi-filter.
**Evidence:** Atlassian Support; GitHub Desktop issues thread.
**Implications:** Desktop clients lag web forges on filter UX.

---

## Cross-cutting observations

1. **No product delivers a unified multi-scope timeline with a scope-switcher.** Three models:
   - **URL-encoded scope** (GitHub, GitLab) — scope lives in path
   - **Entity-local activity** (Linear, Jira issue tab, VS Code Timeline) — activity is metadata on the object
   - **Separate views for separate scopes** (Sourcetree Log View vs. per-file; GitLab Repo graph vs. file history)

2. **Paging strategy divides cleanly.** Git-forge products inherit git's `git log` pagination. VS Code adopts opaque-cursor so any provider can page. Linear/Jira use GraphQL/REST over their own datastores.

3. **Filter composition is orthogonal to scope.** The richest filter UX (Linear chip-bar with AND/OR) lives in products where data is NOT git-backed. Git-backed products expose per-attribute dropdowns. VS Code pushes filtering into providers via opaque cursor.

4. **VS Code TimelineProvider design signal.** The `provideTimeline(uri, options, token)` signature bakes per-file into the API. Extensions wanting repo-wide history (Git Graph) sidestep the Timeline API entirely with their own webview. Strong signal that the API was designed for file-centric instrumentation, not project-scoped aggregation.

5. **Aggregation/density solutions are underdeveloped.** Heatmap calendars exist (GitLab contributions, GitHub profile) only at user-profile level. No product documented scrapes collapse runs of repetitive events ("10 force-pushes in 5 min") into a single UI row.

Vendor-bias note: official docs bias toward "here's how to use this feature"; absences/limitations come from community threads (GitHub Desktop File-History issue, Notion petition). Triangulating feature-present-by-docs + feature-missing-by-community-demand is how I reached "no unified multi-scope timeline exists."

---

## Gaps / follow-ups

- GitLab Events API not verified first-hand — flagged UNCERTAIN
- Linear GraphQL backing store not verified
- Jira JQL-powered marketplace app behavior not detailed
- Did not probe JetBrains IDE (IntelliJ Timeline/History) — similar per-file design likely
- Sourcetree "Log Selected" file-history UI flow described by community but not in Atlassian official docs — INFERRED
