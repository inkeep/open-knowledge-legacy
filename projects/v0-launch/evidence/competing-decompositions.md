---
title: "Consolidation of 4 prior planning surfaces into v0-launch"
type: synthesis
created: 2026-04-13
---

## TLDR

Four senior planners independently produced overlapping decompositions of the same problem space. This file records the consolidation into one master project.

## The four surfaces

### 1. `projects/desktop-readiness/PROJECT.md` (Andrew)
- Branch: `chore/restore-scoped-reports` — not merged to main
- Scope: 5 stories framed as "ship desktop-ready foundations in web app and CLI"
- Framing: Electron prep as the forcing function; fixes real current bugs along the way
- Stories:
  - Story 1: Server process safety (lock file + graceful shutdown + MCP auto-discovery)
  - Story 2a: Document CRUD (create, rename, delete from sidebar)
  - Story 2b: Clipboard image paste + attachments model
  - Story 3: First-run + return-visit (starter doc + session persistence)
  - Story 4: Visual polish (dark mode + persistence failure indicator)
  - Story 5: Desktop build pipeline prep (dynamic port + CJS build)

### 2. `projects/day-0-editor-completeness/PROJECT.md` (this branch, my earlier work)
- Branch: `worktree-stories+init-and-project-switching` (this PR #75)
- Scope: 7 stories (ED-1 through ED-7b) framed as "close day-0 editor gaps for knowledge-tool parity"
- Framing: Obsidian/Notion parity audit (47 features, 30 missing)
- Stories:
  - ED-1: Real-time sidebar updates
  - ED-2: File organization ops (delete, move, duplicate, new folder)
  - ED-3: Rename + backlink rewriting
  - ED-4: First-run onboarding flow
  - ED-5: Quick switcher (Cmd+K) + recents
  - ED-6: Surface existing graph APIs (outline, forward links, orphans, hubs)
  - ED-7a: Find/replace
  - ED-7b: Sort + word count

### 3. `stories/wiki-links-next/STORY.md` (Mike)
- Branch: `feat/backlinks-landscape-and-stories` (PR #72, draft)
- Scope: 4 sub-stories bundled for prioritization; framed as "Wiki-links M4/M5 next steps"
- Stories:
  - Story 1: Slug correctness (Unicode-safe + duplicate heading disambig)
  - Story 2: `suggest_links` MCP tool (unlinked mentions for agents)
  - Story 3: Managed rename + inbound link rewrite (M5a)
  - Story 4: BacklinksPanel push-over-awareness

### 4. `stories/collaboration-capabilities-audit/STORY.md` (Miles)
- Branch: `feat/backlinks-landscape-and-stories` (PR #72)
- Scope: Decision brief for Miles covering 4 S5 collaboration areas
- Nature: Audit/prioritization brief, not an implementation story
- Areas:
  - Area A: Timeline & Rollback (in-flight PR #39)
  - Area B: Per-origin Undo (spec'd broken, reframed path exists)
  - Area C: Live Presence (baseline partial, cursor rendering dropped, activity flash unverified)
  - Area D: Suggestions / Tracked Changes (PARKED with branching UX bundle)

## Overlap map

| Concern | Desktop-readiness | Day-0-editor-completeness | Wiki-links-next | Collaboration audit |
|---------|-------------------|---------------------------|-----------------|---------------------|
| File ops (delete/move/etc.) | Story 2a | ED-2 | — | — |
| File rename + link rewrite | — | ED-3 | Story 3 | — |
| Real-time sidebar | — (deferred) | ED-1 | — | — |
| Sidebar/backlinks push | — | — | Story 4 | — |
| First-run / onboarding | Story 3 | ED-4 | — | — |
| Slug correctness | — | — | Story 1 | — |
| suggest_links | — | — | Story 2 | — |
| Server process safety | Story 1 | — | — | — |
| Image paste | Story 2b (PR #41) | — | — | — |
| Session persistence | Story 3 | — | — | — |
| Timeline / rollback | — | carved out as separate bet | — | Area A (PR #39) |
| Per-origin undo | — | — | — | Area B |
| Activity flash / presence | — | — | — | Area C |
| Dark mode | Story 4 (SHIPPED) | — | — | — |
| Persistence indicator | Story 4 | — | — | — |
| Desktop build prep | Story 5 | — | — | — |
| Find/replace | — | ED-7a | — | — |
| Sort + word count | — | ED-7b | — | — |
| Quick switcher (Cmd+K) | — | ED-5 | — | — |
| Surface existing graph APIs | — | ED-6 | — | — |
| Suggestions / tracked changes | — | — | — | Area D (PARKED) |

## Consolidation into v0-launch

Absorbed (with mapping):

| v0-launch story | Absorbs from | Phase |
|-----------------|--------------|-------|
| V0-1 process safety | desktop-readiness Story 1 | Now |
| V0-2 real-time sidebar | day-0 ED-1 | Now |
| V0-3 BacklinksPanel push | wiki-links Story 4 | Next |
| V0-4 file ops | desktop-readiness Story 2a + day-0 ED-2 | Now |
| V0-5 rename + link rewrite | day-0 ED-3 + wiki-links Story 3 | Next |
| V0-6 image paste | desktop-readiness Story 2b (PR #41) | Now |
| V0-7 onboarding + session + starter | day-0 ED-4 + desktop-readiness Story 3 | Now |
| V0-10 quick switcher | day-0 ED-5 | Next |
| V0-11 graph panels | day-0 ED-6 | Next |
| V0-12 slug correctness | wiki-links Story 1 | Now |
| V0-13 suggest_links | wiki-links Story 2 | Later |
| V0-14 per-origin undo | collaboration audit Area B | Now |
| V0-15 activity flash verify | collaboration audit Area C | Later |
| V0-16 Timeline | collaboration audit Area A (PR #39) | Now |
| V0-17 persistence indicator | desktop-readiness Story 4 (persistence indicator half) | Next |
| V0-18 find/replace | day-0 ED-7a | Later |
| V0-19 sort + word count | day-0 ED-7b | Later |
| V0-20 desktop build prep | desktop-readiness Story 5 | Later |

Dropped:
- **Dark mode** (desktop-readiness Story 4 part): SHIPPED via PR #60, #63. Not a story anymore.
- **Area D suggestions** (collaboration audit): PARKED per PQ11 with the combined "agent-proposal review" design bundle.

Not absorbed (stay as sibling bets):
- **`stories/init-and-project-switching/` Part B** (multi-project switching): cross-project navigation, separate bet.
- **`projects/server-bridge-hardening/`**: narrow wedge (test coverage), separate concern.

## Why consolidation made sense

- **40% direct overlap** (file rename in 3 surfaces; real-time sidebar pattern in 2; first-run experience in 2)
- **Different lenses, same work**: Andrew framed as "Electron prep"; I framed as "Obsidian parity"; Mike framed as "wiki-link hardening"; Miles framed as "S5 collaboration"
- **Team coordination gap**: Four decompositions in parallel with no single source of truth would duplicate spec work and fragment implementation
- **Staleness risk**: Each surface was unmerged, each 1-2 days old, none visible to the rest of the team

## Coordination footprint

- **Andrew's `desktop-readiness/`**: should be removed from `chore/restore-scoped-reports` when that branch lands (redundant with v0-launch)
- **Mike's PR #72**: contains source-of-truth detail for Stories 1, 3, 4 (absorbed as V0-12, V0-5, V0-3). v0-launch references his STORY.md; Mike should review the scoping reflects his intent.
- **Miles's audit**: not restructured (it's decision support, not implementation). v0-launch references areas A/B/C as V0-16, V0-14, V0-15. Miles's decision-making on those areas is preserved.
- **This PR (#75)**: carries the v0-launch master PROJECT.md + deletes `day-0-editor-completeness/`.

## Implications for the team

- **Single planning surface**: `projects/v0-launch/PROJECT.md` is authoritative for "what ships for v0 launch"
- **Stories still live in source-of-truth locations**: v0-launch references the detailed STORY.md files where they exist (Mike's bundle, init-and-project-switching, collaboration audit), adds its own stories where needed
- **No re-specification**: if an author already scoped a story in detail, v0-launch doesn't rewrite — it references
