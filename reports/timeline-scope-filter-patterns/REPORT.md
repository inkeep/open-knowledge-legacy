---
title: "Timeline Scope Filter Patterns: File, Folder, Project"
description: "Investigates how content products and developer tools let users switch between per-file, per-folder, and workspace-wide activity timelines — UI affordances, density/aggregation, query-layer mechanics, and filter composition. Maps 10 products against the design space and catalogs the current Open Knowledge extension points for multi-scope timeline filtering."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - Google Drive
  - Notion
  - Figma
  - Obsidian
  - Dropbox
  - GitHub
  - GitLab
  - VS Code
  - Linear
  - Jira
  - Open Knowledge
topics:
  - multi-scope timelines
  - activity feeds
  - filter composition
  - git pathspec
  - changed-path Bloom filters
  - version history UX
---
# Timeline Scope Filter Patterns: File, Folder, Project

**Purpose:** Map the prior art and query-layer mechanics for multi-scope activity timelines so Open Knowledge can design a file / folder / project filter interface on top of the existing per-file TimelinePanel with well-understood tradeoffs.

---

## Executive Summary

Multi-scope timeline filtering is **an unclaimed design space in the consumer tier**. Across \~10 external products surveyed (plus Open Knowledge's 1P state), none ship a single UI surface with an explicit scope-switcher (file / folder / project) composed with cross-cutting filters (actor, date range, action type). Every product picks one of three shape-constrained models, and each model has a recognizable tradeoff.

The closest template is **Dropbox's three-tier split** — per-file Activity tab, per-folder Folder activity (recursive, includes subfolders), account-wide Folder activity reached via the `All files` gear icon → Folder activity. All three scopes use Dropbox's single "Folder activity" feature name; scope is preselected by the entry point. Three entry points, one surface. Notion is reported (per an unofficial user petition; not corroborated in current Notion docs) to have removed a unified "All / Following" updates tab — if accurate, it's a warning that workspace-wide views without curation become walls of events users stop opening. Treat as design-intuition, not documented roadmap.

**Key findings:**

- **No product has solved it cleanly in the consumer tier.** Every incumbent either scopes by URL (GitHub, GitLab), entity (Linear, Jira, VS Code Timeline), or fragments the scopes across separate surfaces (Dropbox, Notion, Figma). The scope-switcher + filter-composition combination is unclaimed. ([d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md), [d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md))
- **Density at project scope is the hard problem, not the query layer.** Google's Drive Activity API is the only documented product exposing first-class run-collapse as an API-level primitive (`consolidated` mode groups actor + target into a single `TimeRange`, caller opt-in; whether Google's UI renders consolidated entries is inferred, not confirmed). Figma's date-bucket + "Show older" lazy-load maps cleanly onto Open Knowledge's existing `checkpoint` / `wip` distinction. Most other products dump a flat list — Dropbox's "newest to oldest" is explicit about not aggregating. ([Drive Activity API](https://developers.google.com/drive/activity), [d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md))
- **Git mechanics already support multi-scope without infrastructure change.** `git log -- <pathspec>` treats a directory pathspec as "any file under that tree"; multiple pathspecs combine with OR; `--glob='refs/wip/*'` walks specific namespaces efficiently. Open Knowledge's `timeline-query.ts` already uses pathspec scoping; extending to folder or project scope is a path-string change, not a query-layer redesign. ([d3-git-mechanics.md](evidence/d3-git-mechanics.md))
- **Changed-path Bloom filters (Git 2.27+, opt-in via `commit-graph write --changed-paths`) are the single biggest performance lever** for folder- and project-scoped history on large shadow repos — but enablement is **not free of operational cost**. It brings a scheduled maintenance job (that must coordinate with the shadow-repo writer lock), split-chain consolidation over time, a new correctness failure class (commit-graph corruption produces silently-wrong `git log` output until rebuilt), and a Git 2.27+ version floor. The filters also provide no benefit for project-scope queries (no pathspec = nothing to reject). **Decision for this work: defer enablement; three policy options are documented in D3 for when it's revisited.** The git-commit-graph man page describes "significant performance gains" qualitatively; specific numeric speedups commonly cited in community writeups were not confirmed against primary sources in this research session. ([git-commit-graph man page](https://git-scm.com/docs/git-commit-graph), [d3-git-mechanics.md](evidence/d3-git-mechanics.md))
- **Open Knowledge's current state is well-positioned.** The existing `getDocumentHistory()` already uses a conditional `docPath` pathspec, and shadow refs (`refs/wip/<branch>/<writer-id>`) are already writer-scoped and project-wide — narrowing is the special case, not broadening. The API's only hard blocker is `docName` being a required parameter at every layer (server, MCP tool, React prop). ([d5-open-knowledge-current-state.md](evidence/d5-open-knowledge-current-state.md))
- **Filter composition richness is inversely correlated with "git-backed."** Linear's chip-bar is the richest filter UX in the surveyed set — on GraphQL-over-their-own-datastore. Linear's own docs directly quote filter-removal ergonomics and category composition; within-category boolean combinators (AND/OR) are commonly reported but not pulled from primary Linear docs in this session. Git-backed tools expose per-attribute dropdowns (GitHub Activity) or a single text filter (GitHub Desktop). VS Code TimelineProvider pushes filtering entirely into providers via opaque cursor — a deliberate "host is dumb, provider is smart" split. ([d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md))
- **Restore semantics become ambiguous under wider scopes.** When the current scope is a folder or the project, a timeline entry may touch N files. The existing restore affordance targets `activeDocName` only. This is a genuine new UX surface, not just a filter extension — click-an-entry in multi-file scope needs a design (navigate vs. disable restore vs. reveal file picker). ([d5-open-knowledge-current-state.md](evidence/d5-open-knowledge-current-state.md))

**Critical caveats:**

- Specific performance numbers for changed-path Bloom filters are community-attested only; the git man page says "significant performance gains" without a number. Do not quote multipliers without re-verifying against a live source.
- The Notion "removed All/Following tabs" claim surfaces only in an unofficial user petition whose URL returned essentially empty content during audit verification, and Notion's current Inbox help docs list "All workspace updates" as a present filter mode. Treat the removal as unconfirmed narrative; keep the underlying design-intuition ("workspace-wide views without curation become walls of events") since it's defensible independently.
- The Linear filter-composition model looks attractive as a north star, but Linear is not git-backed — directly cloning its chip-bar shape onto a git-log query layer hides that filter-category composition (author + date + scope) is trivially AND-able, while filter-value composition within a category (author = Alice OR Bob) requires post-process JS filtering since `git log --author` is regex-matched, not set-membership. The complexity is shifted, not eliminated.

---

## Research Rubric

| #  | Dimension                                                   | Depth    | Priority |
| -- | ----------------------------------------------------------- | -------- | -------- |
| D1 | Scope-switching UI patterns                                 | Deep     | P0       |
| D2 | Multi-entity aggregation & density                          | Deep     | P0       |
| D3 | Query-layer patterns for scope-variable history             | Moderate | P0       |
| D4 | Filter affordance taxonomy (composition with other filters) | Moderate | P1       |
| D5 | Open Knowledge current state (1P catalog)                   | Moderate | P0       |
| D6 | Empty states + zero-history scope behavior                  | Light    | P2       |

**Framing:** Primarily 3P (external products + git mechanics) with a 1P catalog of Open Knowledge's current extension points (D5).
**Stance:** Factual with light conclusions. Present patterns and tradeoffs; flag strong fits for Open Knowledge's git-backed model. No prescriptive "do exactly X."

---

## Detailed Findings

### D1 — Scope-switching UI patterns

**Finding:** Across 10 products, **three scope-switching models** emerge, and each has distinct tradeoffs. No product delivers a unified scope-switcher-plus-filter-bar at the consumer tier.

**Evidence:** [d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md), [d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md)

**The three models:**

1. **URL-encoded scope** — [GitHub](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-the-activity-view-to-see-changes-to-a-repository), [GitLab](https://docs.gitlab.com/ee/user/project/repository/). Scope lives in the URL path (`/commits/main/src/foo.ts`, `/activity?branch=main`). Simple for server-rendered pages. Loses state on navigation: clicking another file discards filter state, and scope can't be shared as a link with selected filters intact.

2. **Entity-local activity** — [Linear](https://linear.app/docs/filters), [Jira issue tab](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-activity/), [VS Code Timeline](https://code.visualstudio.com/api/references/vscode-api#TimelineProvider). Activity is metadata on the object. Navigate to the entity to change scope. The `TimelineProvider.provideTimeline(uri, options, token)` signature makes per-file load-bearing in the type system — extensions wanting repo-wide history (Git Graph) sidestep the Timeline API entirely with their own webview. A strong design signal: when VS Code chose per-file as the "grain," every subsequent extension inherited the constraint.

3. **Context-bound scope-by-selection** — [Google Drive's right-rail Activity panel](https://support.google.com/drive/answer/2409045), [Dropbox's per-file/folder menus](https://help.dropbox.com/delete-restore/version-history-overview). The same panel re-scopes based on what's selected in the file tree. Zero-chrome; discoverable only via the info icon. Works when users have a strong mental model of the file tree as the scope selector.

**Decision triggers (when this matters):**

- If Open Knowledge wants scope to be URL-shareable (deep-link to "project activity by Alice this week"), the URL-encoded model is the proven template.
- If scope should follow what the user is looking at without explicit action, Google Drive's pattern fits — but the FileSidebar would need to drive the scope, and it currently doesn't.
- If the timeline stays a right-rail panel (current shape), the panel's own scope selector is the only option — none of the surveyed products model this cleanly, which is evidence that "scope in panel" is the unclaimed design.

**Remaining uncertainty:**

- Whether the "admin vs. consumer" split (consumer filter-free, admin filter-heavy) that appears in every vendor product is a deliberate product decision or an accident of incumbent history. Cannot distinguish from docs alone.

---

### D2 — Multi-entity aggregation & density

**Finding:** Density at project scope is the largest unsolved UX problem across the surveyed products. The only explicit aggregation primitives come from two sources: [Google's Drive Activity API](https://developers.google.com/drive/activity) (consolidated mode that groups actions by shared actor + target into unified `TimeRange` entries) and [Figma's date-bucketed version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history) with "Show older" lazy-load. Every other product documented in this research dumps a flat chronological list.

**Evidence:** [d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md); [d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md).

**Implications:**

- Figma's model is directly applicable: named versions (Open Knowledge `checkpoint`) are first-class; autosaves (`wip`) group under dates and collapse under "Show older." The existing `TimelinePanel` already does something similar with the `WipGroup` component (WIP entries collapse between checkpoints) — the pattern extends naturally to "10 WIP edits across 3 docs in the last 20 minutes" rendered as one expandable row.
- Google's actor+target consolidation is a data-model decision, not UI-only. If Open Knowledge wants "Alice edited specs/ 12 times in 5 minutes → one row," the TimelineEntry type needs to accommodate a time-range variant (`startTimestamp` / `endTimestamp` vs. single `timestamp`) plus an aggregate count. This is a schema extension, not a component-only change.
- **Notion's precedent is a design-intuition cue, not a confirmed template.** An [unofficial user petition](https://kidonng.notion.site/Bring-back-All-and-Following-updates-tab-in-Notion-495993c53ecd4a4eacd904a40e9bbb6e) reports that Notion removed unified workspace-wide "All" / "Following" update tabs; the petition URL did not return substantive content during audit verification, and current Notion Inbox docs list "All workspace updates" among the present filter modes. The underlying design intuition still applies — a unified workspace-wide view without curation risks becoming too noisy at scale to be actionable — but do not quote the removal as historical fact without a better source. Any project-wide view in Open Knowledge should ship with aggregation-by-default (not opt-in) as insurance against this failure mode.
- Pagination patterns divide cleanly: cursor-based (VS Code TimelineProvider's opaque `cursor` + `limit` with `{timestamp, id}` sentinel) or page-based ("Load more"). Open Knowledge's current `offset`/`limit` model works for now; migration to cursor-based is only needed if the offset-based pagination performance degrades at project scope.

**Remaining uncertainty:**

- No empirical data on user tolerance for entry density by scope. How many entries per screen becomes "too noisy to use"? Would require UX research, out of scope here.

---

### D3 — Query-layer patterns for scope-variable history

**Finding:** `git log` composes pathspec + multi-ref + author + date filters in one command with predictable semantics (AND across filter dimensions, OR within pathspec list). Folder-scope is a directory pathspec; project-scope is absence of pathspec. Both are one-line changes from file-scope. The only hard compositional gotcha is `--follow` — it requires exactly one pathspec (confirmed empirically: `fatal: --follow requires exactly one pathspec`).

**Evidence:** [d3-git-mechanics.md](evidence/d3-git-mechanics.md); [git-log man page](https://git-scm.com/docs/git-log); [gitglossary](https://git-scm.com/docs/gitglossary); empirical verification against git 2.39.5 in this repo.

**Key mechanics:**

- **Pathspec `some/dir/`** matches via `fnmatch(3)` as "directory prefix, empty pattern" — any file under that tree. Multi-pathspec is OR. `*` and `?` cross `/` boundaries unless wrapped in `:(glob)` magic.
- **Multi-ref walks** via `--glob='refs/wip/*' --glob='refs/checkpoints/*' HEAD` is the surgical version of `--all` that avoids stashes and decoration refs. Deduplication across refs is automatic (set-semantics of reachability).
- **Changed-path Bloom filters** (opt-in: `git commit-graph write --reachable --changed-paths --split`) are the documented optimization for `git log -- <path>` on large repos. The [git-commit-graph man page](https://git-scm.com/docs/git-commit-graph) says this "provides significant performance gains." Speedups in the 2-10× range are community-attested on Stack Overflow and engineering blogs but not numerically confirmed in the man page itself.
- **Full composition template:**

```
  git log \
    --glob='refs/wip/*' --glob='refs/checkpoints/*' HEAD \
    --author='alice@example.com' \
    --since='2026-03-01' --until='2026-04-20' \
    --no-merges \
    --pretty=format:'%H%x00%ae%x00%ai%x00%s' \
    -- path/to/doc.md path/to/folder/
```

**Implications for Open Knowledge:**

- The `getDocumentHistory()` query builder already uses this shape. Migrating from per-file-only to per-file-OR-per-folder-OR-project is a change to how `docPath` is constructed (pass the directory pathspec or omit entirely), not a query rewrite.
- Changed-path Bloom filters on the shadow repo are the biggest performance lever available but are **not a free win** — the payoff is real, and so is the operational cost. Enablement brings: (a) a new scheduled maintenance job (`git commit-graph write --reachable --changed-paths --split`) that must coordinate with the shadow-repo writer lock, (b) `--split`-chain growth that eventually needs consolidation via `--split=replace`, (c) a new correctness surface — commit-graph corruption can cause silently-wrong `git log` output until the file is rebuilt, (d) a minimum-git-version floor (2.27+, May 2020). The filters also don't help project-scope queries (every commit "matches" when there's no pathspec). **Decision for now: defer enablement.** Three policy options for when the question is revisited, in order of increasing conservatism:

| Policy                                                                                                                                                        | Tradeoff                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable at `open-knowledge init`; schedule commit-graph writes every N commits or on a timer                                                                   | Simplest control flow; pays ongoing maintenance cost from day one even on small workspaces; pays cost before there's measured benefit                                |
| Enable lazily — first `getDocumentHistory()` call whose latency crosses a threshold triggers a one-time `commit-graph write`                                  | Self-tuning; the first slow query is the trigger; adds a "first call is slow" UX quirk and a threshold-tuning surface                                                |
| Don't enable by default — ship as an `open-knowledge maintenance optimize` subcommand (or `config.shadow.commitGraph.changedPaths: true`) that users opt into | Zero added default surface area; only workspaces that have measurable slow path-filtered queries pay the cost; keeps the shadow repo's commit-graph state user-owned |

The third option aligns with the existing codebase posture (the shadow repo already has user-triggered `save-version` and `rollback` primitives; background optimizations are not the current pattern). Revisit when a real workspace produces evidence that `git log -- <path>` latency is a user-visible bottleneck — at that point, the data will also inform which policy is right.

- Don't pre-emptively build a Postgres audit table. The shadow repo IS the event log, and this precedent is already established ("git is the source of truth"). If scale bites, the incremental path is commit-graph first, lazy path-cache second, SQLite sidecar third — and only as evidence motivates each.

**Decision triggers:**

- If workspace size exceeds \~1M shadow-repo commits, even with Bloom filters the per-query tree-diff cost may become UX-visible. At that point, a lightweight on-disk cache of `(path → last N commit OIDs)` is the next step.
- If a user-facing "follow renames" toggle is ever added, gate it to single-file scope at the query-builder layer — don't let git's fatal error surface to users.

---

### D4 — Filter affordance taxonomy

**Finding:** Filter UX correlates with backing store shape. Git-backed products expose per-attribute dropdowns or URL params; non-git products (Linear, admin Jira) expose chip bars with boolean combinators.

**Evidence:** [d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md); [Linear Filters docs](https://linear.app/docs/filters).

**The spectrum:**

| Product                                                                                                                                                              | Filter model                                         | Filter count | Composition  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ | ------------ |
| [Linear](https://linear.app/docs/filters)                                                                                                                            | Chip bar, AND/OR combinators, persist-as-View        | \~20         | Full boolean |
| [GitHub Activity view](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-the-activity-view-to-see-changes-to-a-repository) | Four orthogonal dropdowns (branch, type, user, time) | 4            | Implicit AND |
| Jira Activity Stream gadget                                                                                                                                          | Configuration dialog with checkboxes                 | 6            | Implicit AND |
| VS Code Timeline                                                                                                                                                     | None (per-source include/exclude via setting)        | 0            | —            |
| GitHub Desktop                                                                                                                                                       | Single text filter                                   | 1            | —            |
| Figma Version History                                                                                                                                                | None                                                 | 0            | —            |
| Google Drive Activity                                                                                                                                                | None (scope-by-selection)                            | 0            | —            |
| Obsidian File Recovery                                                                                                                                               | None                                                 | 0            | —            |
| Dropbox Activity                                                                                                                                                     | None (consumer); admin has filters                   | 0 (consumer) | —            |

**Implications:**

- Open Knowledge's existing `getDocumentHistory()` already has three filter dimensions (`type`, `author`, `excludeAuthor`). Scope (file/folder/project) adds a fourth. A chip bar with four categories is well within established UI precedent — GitHub Activity's four dropdowns is the minimum viable shape, Linear's chip bar + AND/OR is the north star if filter-value-within-category composition becomes desirable.
- **Ordering matters.** Scope is semantically the outermost filter: it changes which refs and pathspecs are passed to `git log`. Type/author filter on the returned entries. UI should reflect this — scope is the primary affordance (top-left), other filters secondary (right or below).
- Vendor bias caveat: Linear's filter UX is the richest in the cohort, but Linear's docs are describing their own product. Treat "20 filters, AND/OR" as an upper bound on what a well-shaped chip-bar UI can express, not as a target for Open Knowledge.

**Decision triggers:**

- If most queries end up being "this file, default filters," a dropdown-style scope picker (as a segmented control or "Scope: file ▾") is plenty.
- If users frequently want "activity by Alice in the specs folder this week," a chip bar matches the mental model.

---

### D5 — Open Knowledge current state (1P catalog)

**Finding:** The existing stack is well-positioned for multi-scope filtering. The query layer already uses git pathspec; the shadow refs are already writer-scoped (not doc-scoped); the API has orthogonal filter dimensions. The main changes are (a) making `docName` optional at the API/MCP/UI boundaries, (b) adding a scope selector to TimelinePanel's header or FileSidebar context menus, (c) handling multi-file entries in the restore flow.

**Evidence:** [d5-open-knowledge-current-state.md](evidence/d5-open-knowledge-current-state.md).

**What's already there:**

- `packages/server/src/timeline-query.ts:128-139` — `docPath` is already conditional: when undefined, `git log` returns all commits on the reachable refs without path restriction. Project-scope is literally "pass `docName: undefined`."
- `packages/core/src/shadow-repo-layout.ts:46-52` — WIP refs are `refs/wip/<branch>/<writer-id>`, one per writer (not per doc). Walking `refs/wip/<branch>/` is already project-wide; narrowing to one doc is the constrained case via pathspec on `--`.
- `packages/server/src/timeline-query.ts:362-373` — existing filters (`type`, `author`, `excludeAuthor`) run as JS filters after git log. Scope composes cleanly in front: git-pathspec first, JS filters second.

**What needs to change:**

- **API contract:** `packages/server/src/api-extension.ts:1927-1930` returns 400 if `docName` is missing. Either accept an optional `path=` or `scope=` parameter that can be a file path, directory path, or empty (project scope), or make `docName` optional with `path` as an alternate form.
- **MCP tool contract:** `packages/cli/src/mcp/tools/get-history.ts:47` has `docName: z.string()` as required. Zod schema needs a discriminated union or optional form to avoid agents passing ambiguous values.
- **React component:** `packages/app/src/components/TimelinePanel.tsx:280-284` has `docName` as required prop. Either overload to accept a scope descriptor (`{ kind: 'file' | 'folder' | 'project', path?: string }`) or add a sibling prop.
- **Mounting:** `packages/app/src/components/EditorPane.tsx:218-224` passes `activeDocName` directly. A scope picker needs state either in EditorPane or in a new scope context.
- **Context menus:** `packages/app/src/components/FileTree.tsx` already imports ContextMenu primitives; adding a "Show history for this folder" item on folder rows is a low-friction entry point that matches the GitHub repo-tree "History" pattern.

**Restore semantics under wider scopes:**

- The restore affordance (`packages/app/src/components/EditorPane.tsx:65-78`, `packages/cli/src/mcp/tools/rollback-to-version.ts`) operates on `activeDocName`. Under folder/project scope, a timeline entry may touch multiple files. Three design options:

1. **Navigate on click** — the entry's `contributors[].docs` lists affected files; clicking navigates to the first one (or shows a picker if multiple). Restore is available only after navigation narrows to a single file.
2. **Disable restore in multi-file scope** — entries are read-only previews until scope is a single file.
3. **Reveal a picker** — clicking an entry that touches multiple files shows an inline "Which file?" control before restore is available.

None of these are "obvious" — this is a new UX surface. Option 1 matches GitHub's pattern (click a commit in a repo-wide list → see the commit detail page with per-file diff tabs). Option 2 is simplest to ship. Option 3 adds UI without a clear precedent.

**Related research:** [reports/auto-persistence-version-history-patterns/](../auto-persistence-version-history-patterns/REPORT.md) covers per-document version history UX in depth (8-product survey, Figma / Google Docs patterns, checkpoint/WIP model). That report is the foundational context; this report extends it with the multi-scope dimension.

---

### D6 — Empty states + zero-history scope behavior

**Finding:** Empty-state design is underdeveloped across the surveyed products. Google hides empty sections entirely ("Manage access" omitted when no pending requests). Notion's 2025 database redesign shows "No filter results" + action CTA. Figma and Obsidian have no documented empty-state copy (new files always have autosaves within minutes, so the state is rare). Dropbox and GitHub Desktop have no documented empty-state UX.

**Evidence:** [d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md). [Notion 3.4 update (T3 corroboration)](https://theorganizednotebook.com/blogs/blog/notion-3-4-update).

**Implications:**

- Open Knowledge's current empty state is minimal: `TimelinePanel.tsx:426-430` shows "No history yet" as 12px muted text. This is adequate for the per-file baseline but becomes a usability issue at folder scope, where a user may have picked a scope with zero activity (e.g., a newly-created subfolder).
- The Notion "No filter results" + action CTA pattern maps well: "No activity in this folder — view project activity" with a one-click scope-broadening affordance. This gives the user a forward-motion action instead of a dead end.
- The Google "hide when empty" pattern is an anti-pattern for scope-scoped views — the point of selecting a scope is to see its activity, and hiding the panel would create a confusing "did my click register?" feeling. Prefer showing "no activity" + a way forward.

**Low priority — this is Light / P2 per rubric.** Adequate empty states can be added incrementally once the core scope-switching ships.

---

## Synthesis — three scope models, one Open Knowledge fit

Mapping the three observed scope models onto Open Knowledge's current shape:

| Model                            | Example                                  | Fit for Open Knowledge                                                                                             |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| URL-encoded scope                | GitHub, GitLab                           | Adequate but redundant — Open Knowledge's UI is not URL-first; the TimelinePanel is a right-rail Sheet, not a page |
| Entity-local activity            | VS Code Timeline, Linear, Jira issue tab | Matches the current "TimelinePanel is for the active doc" shape, but forecloses folder/project scope by design     |
| Context-bound scope-by-selection | Google Drive, Dropbox                    | Fits Open Knowledge's FileSidebar + TimelinePanel shape most naturally                                             |

The most-natural fit is **context-bound scope-by-selection with explicit fallbacks**. In this model:

- The panel's scope reflects what the user is "looking at" in the FileSidebar: a file selected = file scope, a folder selected = folder scope, no selection / explicit project button = project scope.
- **Explicit entry points** bypass the implicit binding — a "Show history for this folder" context-menu item on FileTree folder rows opens the panel with folder scope preset; a header button opens with project scope.
- **A persistent scope selector inside the panel** (segmented control: file / folder / project, or dropdown with current scope label) makes the scope explicit and lets the user pin it independently of FileSidebar selection.

This combination — implicit selection-following with explicit override — borrows from Google Drive's context-bound model while addressing its discoverability gap (users who don't know to click the info icon). The explicit scope selector inside the panel is new design work; none of the surveyed products ship it, which is what makes this unclaimed space.

**Density is the hard part, not the UI shape.** At project scope, even a well-maintained workspace can accumulate hundreds of WIP commits per day. Without aggregation, the panel becomes a wall of events and users stop opening it (Notion's withdrawn "All" tab suggests this already happened once at a major vendor). Two mechanisms are proven:

1. **Date-bucket grouping** (Figma pattern, analogous to the existing `WipGroup` component in `TimelinePanel.tsx`). Today / Yesterday / This Week / Older headers collapse old activity. Lazy-load via "Show older" button.
2. **Run-consolidation** (Google Drive Activity API pattern). Rapid edits by the same actor on the same scope collapse into one entry with a time range and aggregate count. Requires a schema extension to `TimelineEntry` (time range variant) and a consolidation pass in `getDocumentHistory()`.

Filter composition (D4) is additive: the existing type/author/excludeAuthor dimensions extend with scope as the outermost filter. A chip bar with four categories is established precedent (GitHub Activity's four dropdowns); Linear's chip bar with AND/OR is the upper bound if filter-value-within-category composition becomes desired.

The restore-semantics question under wider scopes is the **one novel UX surface** this research surfaced that has no obvious template. Option 1 (navigate-on-click, GitHub-pattern) is the most defensible default; Option 2 (disable restore in multi-file scope) is simplest to ship. A decision here is required before implementation begins.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **D3 GitLab Events API** — referenced but not verified first-hand. UNCERTAIN for exact filter semantics.
- **D3 performance numbers** — commit-graph Bloom filter speedups cited in community sources but not confirmed against a primary source in this session (some Microsoft DevBlog URLs 404'd). Do not quote specific multipliers without re-verification.
- **D2 user tolerance for density** — no empirical data on how many entries per screen becomes "too noisy." Would require UX research.

### Out of scope (per rubric)

- Cross-repo / cross-workspace history
- Permission-scoped history (multi-user ACLs)
- Final UI mockup / specific design proposal
- Performance benchmarking of `git log` at scale

### Open questions for implementation (not this research)

- Which scope-switcher affordance fits Open Knowledge's panel best — segmented control, dropdown, or selection-driven with explicit overrides? This report maps the design space but doesn't prescribe.
- What restore semantics belong under folder/project scope? Navigate, disable, or reveal-picker?
- When should Bloom-filter enablement be revisited? **Deferred as of 2026-04-20** — options documented in D3 (init-time + scheduled, lazy on-threshold, or opt-in subcommand). Trigger for revisit: measured evidence that `git log -- <path>` latency becomes a user-visible bottleneck in a real workspace.

---

## References

### Evidence Files

- [evidence/d1-d2-d4-d6-consumer-apps.md](evidence/d1-d2-d4-d6-consumer-apps.md) — Google Drive, Notion, Figma, Obsidian, Dropbox — scope UI, density, filter composition, empty states
- [evidence/d1-d2-d4-developer-tools.md](evidence/d1-d2-d4-developer-tools.md) — GitHub, GitLab, VS Code TimelineProvider, Linear, Jira, desktop git clients — scope UI, density, query layer, filter composition
- [evidence/d3-git-mechanics.md](evidence/d3-git-mechanics.md) — git pathspec, multi-ref walks, changed-path Bloom filters, compositional semantics, alternatives to query-time git log
- [evidence/d5-open-knowledge-current-state.md](evidence/d5-open-knowledge-current-state.md) — 1P catalog: API contract, query layer, UI, shadow refs, ContextMenu scaffolding

### External Sources (primary)

- [git-log man page](https://git-scm.com/docs/git-log)
- [gitglossary — pathspec](https://git-scm.com/docs/gitglossary)
- [git-commit-graph — --changed-paths](https://git-scm.com/docs/git-commit-graph)
- [VS Code 1.44 — Timeline release notes](https://code.visualstudio.com/updates/v1_44)
- [vscode.proposed.timeline.d.ts](https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.timeline.d.ts)
- [Google Drive Activity API](https://developers.google.com/drive/activity)
- [GitHub Docs — Using the activity view](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-the-activity-view-to-see-changes-to-a-repository)
- [GitHub REST — List commits](https://docs.github.com/en/rest/commits/commits)
- [Linear Docs — Filters](https://linear.app/docs/filters)
- [Notion Help — Inbox & notifications](https://www.notion.com/help/updates-and-notifications)
- [Figma Help — View a file's version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)
- [Dropbox Help — Version history overview](https://help.dropbox.com/delete-restore/version-history-overview)
- [Obsidian Help — File recovery](https://obsidian.md/help/plugins/file-recovery)

### Related Research

- [reports/auto-persistence-version-history-patterns/](../auto-persistence-version-history-patterns/REPORT.md) — Per-document version history UX (8 products), checkpoint/WIP pipeline, crash recovery. Prior research that this report extends into the multi-scope dimension.
- [reports/compiled-truth-timeline-content-conventions/](../compiled-truth-timeline-content-conventions/REPORT.md) — Adjacent topic on timeline content structure within individual entries. Not directly relevant to scope-switching UI but overlaps on the "timeline" vocabulary.

