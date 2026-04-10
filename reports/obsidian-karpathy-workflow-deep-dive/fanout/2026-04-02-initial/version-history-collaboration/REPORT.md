# Version History & Collaboration in Obsidian for the Karpathy LLM Knowledge Base Workflow

**Date:** 2026-04-03
**Scope:** Deep dive into D7 (Version History and Persistence) and D8 (Collaboration and Sharing) dimensions
**Context:** Evaluating Obsidian's fitness for a workflow where an LLM agent continuously compiles, updates, and maintains a wiki while a human reviews, edits, and queries it

---

## Executive Summary

Obsidian's version history story is **layered but fragmented** — four independent mechanisms (auto-save, File Recovery, Obsidian Sync, Git) each cover part of the problem, but none was designed for an agent+human collaborative wiki. The critical gap is **agent attribution**: no built-in mechanism distinguishes LLM-authored changes from human edits. Git integration via the Obsidian Git plugin (10K+ stars, 2.3M+ downloads) is the strongest option for the Karpathy workflow, but requires discipline to encode agent provenance in commit metadata. For sharing the compiled wiki, Quartz (free, full-text search) is superior to Obsidian Publish ($8-10/mo, no full-text search) for a knowledge base use case.

---

## D7: Version History and Persistence

### 7.1 Auto-Save Behavior

Obsidian auto-saves with a **2-second debounce** — it saves ~2 seconds after the start of user input, then every 2 seconds until changes stop. This is handled by an internal `requestSave` debounce event that also blocks the `vault.process` and `vault.modify` plugin APIs during the debounce window ([Forum: requestSave debounce](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)).

**For the Karpathy workflow:** The 2-second debounce is fast enough that agent writes flush to disk quickly. However, this only applies to changes made *through Obsidian's editor* — direct filesystem writes by an external agent bypass this mechanism entirely.

**Crash recovery is weak.** A documented case from August 2024 shows a user losing ~4 days of notes after a forced shutdown, with daily journal files showing no changes despite days of editing ([Forum: Lost notes](https://forum.obsidian.md/t/lost-about-a-day-of-notes-no-autosave/87223)). Auto-save is present but not crash-proof.

### 7.2 File Recovery (Core Plugin)

Obsidian ships with a **File Recovery** core plugin that takes periodic snapshots:

| Setting | Default | Configurable? |
|---------|---------|---------------|
| Snapshot interval | 5 minutes | Yes |
| Retention period | 7 days | Yes |
| File types | `.md` and `.canvas` only | No |

Snapshots capture **full file content** (not diffs) and are stored **outside the vault** in Obsidian's global settings directory, protecting against vault-level data loss ([Obsidian Help: File Recovery](https://help.obsidian.md/plugins/file-recovery)).

**For the Karpathy workflow:** The 5-minute interval may miss rapid LLM compilation bursts. The 7-day default retention is far too short for a compounding knowledge base. Both are configurable, but there's a storage trade-off — full snapshots at high frequency accumulate significant disk usage. Critically, **snapshots carry no attribution** — you cannot distinguish which snapshots contain agent changes vs. human edits.

### 7.3 Obsidian Sync Version History

For users on Obsidian Sync ($4-8/mo), version history provides cloud-backed versioning:

| Plan | Retention | Storage |
|------|-----------|---------|
| Standard ($4/mo) | 1 month | 1 GB |
| Plus ($8/mo) | 12 months | 10 GB |

The UI shows a chronological list of versions on the left with content preview on the right. Users can restore any version (replaces current and syncs to all devices) or copy version contents to clipboard. **No native diff view** — the third-party [Version History Diff plugin](https://github.com/kometenstaub/obsidian-version-history-diff) by kometenstaub adds line-by-line or side-by-side diff comparison.

Conflict resolution uses Google's **diff-match-patch** algorithm for three-way merge on Markdown files, with last-modified-wins for binary files ([DeepWiki: Sync Conflict Resolution](https://deepwiki.com/obsidianmd/obsidian-help/2.3-filters-and-views)). This has known failure modes — documented cases of entire note contents being replaced or deleted during automatic merge ([Forum: modified externally erasing text](https://forum.obsidian.md/t/bug-modified-externally-message-constantly-appears-erasing-my-text/26090)).

**For the Karpathy workflow:** Sync's version history is designed for human-across-devices, not human+agent. The 12-month maximum retention is insufficient for permanent wiki history. The automatic three-way merge is dangerous when an agent is continuously writing — merge failures could silently corrupt wiki articles. **No agent attribution.**

### 7.4 Git Integration (The Best Option)

The [Obsidian Git](https://github.com/Vinzent03/obsidian-git) plugin is the most mature version control solution:

| Metric | Value |
|--------|-------|
| Stars | 10,200+ |
| Downloads | 2,300,000+ |
| Active development | Yes (repo moved Jul 2024) |
| Platforms | Desktop: full; Mobile: experimental |

**Key capabilities for the Karpathy workflow:**

1. **Auto-commit intervals** — Configurable from minutes to hours. Recommended 10-15 min for normal use; could be tuned lower for agent compilation bursts.

2. **Source Control View** — Stage/unstage individual files, commit with messages, see changed/staged/untracked files — all within Obsidian.

3. **Diff capabilities:**
   - Unified diff view (added/deleted/modified lines)
   - Split diff view (side-by-side comparison)
   - In-editor gutter signs showing line changes (desktop only)
   - Stage/reset hunks directly from gutter signs

4. **History View** — Browse commit logs with message, author, date, and changed files per commit.

5. **Git revert power** — Standard Git commands (`git checkout <commit> -- <file>`, `git revert`) work through terminal. The plugin's History View helps locate the target commit, then you revert outside the plugin.

**Merge conflict limitation:** No visual merge conflict resolution UI in Obsidian. Conflicts produce standard Git conflict markers that must be resolved in source mode or an external tool ([Issue #803](https://github.com/Vinzent03/obsidian-git/issues/803)).

### 7.5 Additional Version Control Plugins

| Plugin | Approach | Best For |
|--------|----------|----------|
| [Time Machine](https://github.com/dsebastien/obsidian-time-machine) | Visual timeline slider merging File Recovery + Git history; selective restore | Best UX for browsing history |
| [Edit History](https://github.com/antoniotejada/obsidian-edit-history) | Per-note `.edtz` compressed diff files; activity calendar | Continuous local history |
| [Version Control](https://www.obsidianstats.com/plugins/version-control) | Intentional snapshots with names; in-file branching; writing stats | Writers who want named checkpoints |
| [Version History Diff](https://github.com/kometenstaub/obsidian-version-history-diff) | Adds diff view to Sync, File Recovery, and Git history | Essential companion plugin |

### 7.6 Version History for Agent-Compiled Wiki: Recommended Architecture

The strongest version control setup for the Karpathy workflow combines multiple layers:

```
Layer 1: File Recovery (safety net)
  - Increase interval to 2 minutes
  - Increase retention to 30+ days
  - Catches changes between Git commits

Layer 2: Git via Obsidian Git (primary version control)
  - Auto-commit every 5-10 minutes
  - Commit messages encode source: "[agent] Compiled article: Quantum Computing"
  - Separate branches for agent work vs. human edits (optional)
  - Full history, permanent, diffable

Layer 3: Time Machine plugin (review UX)
  - Visual timeline combining File Recovery + Git
  - Selective restore for reverting specific agent changes
  - Colored diff view for quick scanning

Layer 4: Obsidian Sync (optional, for multi-device)
  - Useful for accessing wiki on mobile/other devices
  - Version history as additional safety layer
  - Conflict resolution is risky with agent writes — use with caution
```

### 7.7 The Agent Attribution Gap

**This is the single biggest unresolved problem.** No Obsidian mechanism natively tracks who or what made a change:

| Mechanism | Attribution? | Workaround |
|-----------|-------------|------------|
| Auto-save | None | N/A |
| File Recovery snapshots | None | N/A |
| Sync version history | None | N/A |
| Git commits | **Author field** | Agent commits with distinct author: `LLM Agent <agent@vault>` |
| Git commits | **Message convention** | Prefix: `[agent]` or `[human]` in commit messages |
| Frontmatter | **Custom metadata** | Add `last_edited_by: agent` to YAML frontmatter |

Git is the only mechanism that CAN encode attribution, but it requires disciplined tooling — the agent must commit with a distinct identity, and commit messages must follow a convention. This is achievable but not turnkey.

---

## D8: Collaboration and Sharing

### 8.1 Obsidian Publish

Obsidian Publish ($8-10/mo) turns selected vault notes into a public website:

**Strengths:**
- Custom domain support
- Graph view for visitors (navigable knowledge connections)
- Backlinks (automatic cross-references)
- 100% Lighthouse accessibility score
- Full CSS/JS customization
- Password protection (site-wide)
- First-class SEO

**Critical limitation for knowledge base use:** Search only covers **titles, aliases, and headings** — NOT full-text content. For a compiled LLM wiki where users need to search across article bodies, this is a dealbreaker. This has been a feature request since 2023 with no resolution ([Forum: Full-text search request](https://forum.obsidian.md/t/have-obsidian-publish-search-feature-search-the-full-text-of-notes/62188)).

**Source:** [Obsidian Publish](https://obsidian.md/publish)

### 8.2 Quartz: Superior for Compiled Wiki Publishing

[Quartz](https://quartz.jzhao.xyz/) (free, open-source, by jackyzha0) is a static site generator purpose-built for Obsidian vaults:

| Feature | Obsidian Publish | Quartz |
|---------|-----------------|--------|
| Full-text search | No (titles/headings only) | **Yes** |
| Graph view | Yes | Yes |
| Backlinks | Yes | Yes |
| Wikilinks | Yes | Yes |
| Transclusions | Partial | Yes |
| Custom domain | Yes | Yes (self-hosted) |
| Cost | $96-120/year | Free |
| Auto-deploy | Manual publish | **GitHub Actions on push** |
| LaTeX | Yes | Yes |
| Syntax highlighting | Basic | Full |
| Popover previews | Yes | Yes |

**For the Karpathy workflow:** Quartz + GitHub Actions creates a fully automated pipeline: agent compiles wiki article → Obsidian Git commits → push triggers Quartz build → site auto-deploys. Full-text search means consumers can actually find content across the compiled knowledge base.

**Source:** [Quartz 4](https://quartz.jzhao.xyz/)

### 8.3 Agent + Human Simultaneous Editing

This is the highest-risk area for the Karpathy workflow. Research reveals specific failure modes:

#### Direct Filesystem Writes (Dangerous)
When an external program modifies a file that's open in Obsidian:
1. Changes won't display until the file is closed and reopened
2. If the user edits before seeing external changes, **external changes are overwritten**
3. The "modified externally, merging changes automatically" notification uses diff-match-patch, which has documented failure modes including complete content deletion

**Source:** [Forum: Monitoring for External Changes](https://forum.obsidian.md/t/monitoring-for-external-changes/51660)

#### Obsidian CLI (Recommended for Agents)
The official [Obsidian CLI](https://obsidian.md/cli) (2026) routes writes through Obsidian's internal APIs, bypassing filesystem watcher issues:
- `obsidian create` — create notes
- `obsidian read` — read notes
- `obsidian daily:append` — append to daily notes
- `obsidian search` — search vault
- `obsidian serve` — start MCP server for AI assistants

The CLI is explicitly designed for agentic use cases: "Give agentic tools access to a vault without access to your full computer" ([Obsidian CLI](https://obsidian.md/cli)).

#### MCP Servers (Alternative)
Multiple MCP server implementations exist for safe agent-vault interaction:
- [MCPVault](https://github.com/bitbonsai/mcpvault) — Universal AI bridge, v0.11.0 (March 2026)
- [Obsidian CLI MCP Server](https://lobehub.com/mcp/cks850711-obsidian-cli-mcp-server) — Wraps official CLI
- REST API-based servers — Require Obsidian running with Local REST API plugin

#### The Claudian Approach
The [Claudian](https://github.com/YishenTu/claudian) plugin embeds Claude Code directly as an Obsidian sidebar chat, making the vault Claude's working directory with full read/write/search capabilities. This represents the most integrated agent-in-editor approach.

### 8.4 Recommended Safe Architecture for Agent+Human Editing

```
┌─────────────────────────────────────────────────┐
│                  Human (Obsidian)                │
│  - Edits wiki articles in editor                │
│  - Reviews agent diffs via Obsidian Git          │
│  - Accepts/reverts via Source Control View       │
│  - Browses history via Time Machine              │
└───────────────────┬─────────────────────────────┘
                    │ Obsidian Git auto-commit
                    │ Author: "Human <human@vault>"
                    ▼
            ┌───────────────┐
            │   Git Repo    │ ◄── Single source of truth
            │  (local/.git) │     Full history, attribution
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  GitHub/Remote │ ◄── Push triggers Quartz build
            └───────┬───────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Quartz  │  │  Agent   │  │  CI/CD       │
│ Deploy  │  │  Writes  │  │  (optional)  │
│ (site)  │  │  via CLI │  │  Wiki lint   │
└─────────┘  └──────────┘  └──────────────┘
                    │
                    │ obsidian CLI / MCP
                    │ Author: "Agent <agent@vault>"
                    ▼
            ┌───────────────┐
            │   Git Repo    │
            │  (agent branch│ ◄── Separate branch optional
            │   or main)    │
            └───────────────┘
```

**Key principles:**
1. Agent writes via Obsidian CLI or MCP — **never direct filesystem writes**
2. Git commits with distinct agent author identity
3. Human reviews agent diffs in Obsidian before accepting
4. Auto-deploy compiled wiki via Quartz + GitHub Actions
5. File Recovery as safety net for between-commit changes

---

## Key Findings Summary

### What Works Well

1. **Git via Obsidian Git** is the strongest version control option — permanent history, full diff/revert, 2.3M+ downloads proving maturity
2. **Obsidian CLI** (2026) is purpose-built for agentic vault access and bypasses dangerous filesystem race conditions
3. **Quartz** provides superior wiki publishing with full-text search, free, and auto-deployable
4. **Time Machine plugin** provides excellent UX for browsing combined File Recovery + Git history
5. **Layered safety nets** (File Recovery + Git + Sync) can provide comprehensive coverage

### What Doesn't Work

1. **No agent attribution** in any native mechanism — must be manually encoded in Git metadata
2. **Obsidian Publish search** is titles/headings only — unusable for knowledge base discovery
3. **Simultaneous agent+human editing** of the same file is dangerous regardless of mechanism
4. **Sync conflict resolution** (diff-match-patch) has documented corruption failure modes
5. **File Recovery** default settings (5 min interval, 7 day retention) are inadequate for active agent compilation

### What's Missing

1. **Agent-aware version control** — A system that natively tracks "this change was made by LLM agent X at prompt Y"
2. **Semantic merge for Markdown** — diff-match-patch operates on character sequences, not document structure
3. **File-level locking** — No way to prevent agent writes while human is editing, or vice versa
4. **Review-before-apply workflow** — No native "agent proposes changes, human approves" mechanism (must build with Git branches + PR workflow)

---

## Evidence Files

| File | Contents |
|------|----------|
| [evidence/autosave-and-file-recovery.md](evidence/autosave-and-file-recovery.md) | Auto-save debounce mechanism, File Recovery core plugin, Time Machine plugin |
| [evidence/obsidian-sync-version-history.md](evidence/obsidian-sync-version-history.md) | Sync version history by plan, conflict resolution algorithm, limitations |
| [evidence/git-integration-plugins.md](evidence/git-integration-plugins.md) | Obsidian Git features/stats, Version History Diff, Edit History, Version Control plugins |
| [evidence/agent-filesystem-interaction.md](evidence/agent-filesystem-interaction.md) | Filesystem watcher behavior, race conditions, CLI/MCP safe access, real-world agentic workflows |
| [evidence/publish-and-sharing.md](evidence/publish-and-sharing.md) | Obsidian Publish features/limitations, Quartz comparison, free alternatives |

---

## Source Index

### Official Documentation
- [Obsidian Help: File Recovery](https://help.obsidian.md/plugins/file-recovery)
- [Obsidian Help: Version History](https://help.obsidian.md/Obsidian+Sync/Version+history)
- [Obsidian Help: Publish](https://help.obsidian.md/publish)
- [Obsidian CLI](https://obsidian.md/cli)
- [Obsidian Publish](https://obsidian.md/publish)

### GitHub Repositories
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) — 10.2K stars, primary Git plugin
- [kometenstaub/obsidian-version-history-diff](https://github.com/kometenstaub/obsidian-version-history-diff) — Version history diff views
- [dsebastien/obsidian-time-machine](https://github.com/dsebastien/obsidian-time-machine) — Visual timeline for File Recovery + Git
- [antoniotejada/obsidian-edit-history](https://github.com/antoniotejada/obsidian-edit-history) — Per-note edit history
- [mihasm/obsidian-autosave-control](https://github.com/mihasm/obsidian-autosave-control) — Autosave frequency control
- [YishenTu/claudian](https://github.com/YishenTu/claudian) — Claude Code sidebar in Obsidian
- [bitbonsai/mcpvault](https://github.com/bitbonsai/mcpvault) — MCP server for Obsidian vaults
- [cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server) — REST API-based MCP server
- [jackyzha0/quartz](https://quartz.jzhao.xyz/) — Static site generator for Obsidian vaults

### Community Discussions
- [Forum: requestSave debounce](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)
- [Forum: Lost notes on crash](https://forum.obsidian.md/t/lost-about-a-day-of-notes-no-autosave/87223)
- [Forum: Modified externally erasing text](https://forum.obsidian.md/t/bug-modified-externally-message-constantly-appears-erasing-my-text/26090)
- [Forum: Vault files overwritten](https://forum.obsidian.md/t/obsidian-vault-files-overwritten/72527)
- [Forum: Sync conflict resolution](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)
- [Forum: Manual sync conflict resolution request](https://forum.obsidian.md/t/option-to-let-user-manually-resolve-sync-conflicts/94468)
- [Forum: Full-text search for Publish](https://forum.obsidian.md/t/have-obsidian-publish-search-feature-search-the-full-text-of-notes/62188)
- [Forum: Indefinite version history request](https://forum.obsidian.md/t/make-the-sync-version-history-longer-indefinite/72694)

### Plugin Statistics
- [ObsidianStats: Git plugin](https://www.obsidianstats.com/plugins/obsidian-git)
- [ObsidianStats: Version Control plugin](https://www.obsidianstats.com/plugins/version-control)
- [ObsidianStats: Edit History plugin](https://www.obsidianstats.com/plugins/edit-history)

### Real-World Agentic Workflows
- [Stefan Imhoff: Agentic Note-Taking with Claude Code](https://www.stefanimhoff.de/agentic-note-taking-obsidian-claude-code/)
- [Kenneth Reitz: Obsidian Vaults & Claude Code](https://kennethreitz.org/essays/2026-03-06-obsidian_vaults_and_claude_code)
- [Daniel Pickem: LLM-Powered Work Notes](https://danielpickem.com/posts/2026_01_13_obsidian_note_taking_system/)

### Technical References
- [DeepWiki: Sync Conflict Resolution](https://deepwiki.com/obsidianmd/obsidian-help/2.3-filters-and-views)
- [Charles Desneuf: Custom Git Merge Driver for Obsidian](https://blog.charlesdesneuf.com/articles/solving-obsidian-readwise-merge-conflicts-with-a-custom-git-driver/)
- [GitHub: obsidian-git Issue #803 — Conflict Handling](https://github.com/Vinzent03/obsidian-git/issues/803)
