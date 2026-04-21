---
title: Bug Bash Triage — Launch Blockers & Coverage
description: Consolidated tracking of 2026-04-17 Bug Bash findings (written sheet + Granola transcript) with coverage status per item.
tags: [launch, triage, bug-bash]
---
# Bug Bash Triage — Launch Blockers & Coverage

**Source meeting:** [Bug Bash — Open Knowledge](https://notes.granola.ai/d/983d2bb0-3d98-4c2d-b3cf-da3d89ea38ad) (2026-04-17)
**Sources merged:** written bug-report spreadsheet + Granola verbal transcript
**Last updated:** 2026-04-20
**Owner:** [[projects/v0-launch/PROJECT]]
**Related:** [[specs/2026-04-17-multi-agent-presence/SPEC]]

---

## Legend

- ✅ **Shipped** — PR merged, believed complete
- 🟡 **Partial** — some work landed; acceptance gap or follow-up known
- 🔵 **In progress** — spec or PR open, not yet merged
- ⬜ **Not addressed** — no spec, no PR, no Linear ticket found
- 🗣️ **Verbal-only** — surfaced in Granola transcript but NOT logged on the written sheet

---

## 1) Not addressed — launch-blocking candidates

Prioritize these for V0 launch scope decisions. No PR, no in-flight spec, no ticket found.

| #  | Item                                                              | Reporter(s)   | Status | Notes                                                                          | Owner                                                                                                           |
| -- | ----------------------------------------------------------------- | ------------- | ------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1  | Collab icon and Claude icon overlapping in top-right              | Justin        | ⬜      | Visual bug; independent of multi-agent-presence wire-level fix                 | Andrew                                                                                                          |
| 2  | `index.md` hard to locate as sidebar fills with pages             | Justin        | ⬜      | Needs distinct root affordance (pinned, bold, separator, icon)                 | Tim                                                                                                             |
| 3  | Can't scroll when many nested files in sidebar                    | Shagun        | ⬜      | Sidebar scroll container broken past viewport height                           | Sarah                                                                                                           |
| 4  | "Outgoing Links" panel opens empty tab                            | HeeGun        | ⬜      | ForwardLinks panel bug; nav target missing or wrong                            | Mike"failed to fetch"\
reproduce                                                                                |
| 5  | Cmd+R flashes "waiting for collab server" orange banner           | Nick          | ⬜      | Repro: rapid refresh. Likely `provider.status` transient on remount            | Dima                                                                                                            |
| 6  | Spellcheck squigglies too aggressive (e.g. "Inngest", file paths) | Nick          | ⬜      | Needs custom dictionary + off-in-code-paths heuristic                          | Sarah(skip)                                                                                                     |
| 7  | Agent wraps wiki-links in backticks (`` `[[welcome]]` ``)         | Abraham       | ⬜      | Agent-prompting / AGENTS.md fix, not a parser bug                              | TimMike (Look at prefrencing reg md links not wiki links                                                        |
| 8  | Doc outline doesn't appear until I click the sidebar/page         | Abraham       | ⬜      | Paired with #1 sidebar-update cluster; verify after CC1 backlinks channel      | Nick                                                                                                            |
| 9  | Timeline granularity too coarse (30-min session → 2 saves)        | Andrew        | ⬜      | CLAUDE.md claims 30s + per-agent-write cadence — verify actual debounce        | Skip                                                                                                            |
| 10 | Timeline needs filter by file / folder / project                  | Miles         | ⬜      | TimelinePanel enhancement                                                      | Nick                                                                                                            |
| 11 | JPEGs not rendering                                               | Miles         | ⬜      | V0-6 image paste shipped for PNG; JPEG-specific gap                            | Nick                                                                                                            |
| 12 | Agent emits HTML `<img>` tags instead of markdown `![]()`         | Shagun        | ⬜      | Agent-prompting / ~~AGENTS.md fix~~                                            | Tim (but not Agents.md)                                                                                         |
| 13 | LLM generates content without actually running web searches       | Nick          | ⬜      | Agent-prompting issue; may need MCP-level grounding nudge                      | Tim Note: don't create knowledge without evidence (reference a URL, including web urls) like our research skill |
| 14 | GitHub device sign-in success modal never shows                   | Miles         | ⬜      | Callback window doesn't close post-auth (confirmed in transcript)              | Miles (Andrew will verify)                                                                                      |
| 15 | "Install MCP for all coding agents at once"                       | Nick          | ⬜      | PR #209 added Codex; no one-shot multi-editor install yet                      | Andrew                                                                                                          |
| 16 | "Why do we need MCP opt-in at all?"                               | Nick          | ⬜      | Cursor security model blocks auto-enable (noted in transcript)                 | Andrew (requires investigation) Nick has notes                                                                  |
| 17 | Agent control from UI (tell agent to create page for broken link) | Justin, Miles | ⬜      | Requires UI→MCP back-channel; no spec                                          | defer                                                                                                           |
| 18 | Multi-parallel-agent follow-along UX not designed                 | Andrew        | ⬜      | Related to [[specs/2026-04-17-multi-agent-presence/SPEC]] but distinct problem |                                                                                                                 |
| 19 | Tool for agent to know what page you are looking at               |               |        | potential future, user activity tool, not just current page                    | Tim                                                                                                             |

## 2) Not addressed — verbal-only (missing from written sheet)

Surfaced in the Granola transcript but not logged on the spreadsheet. Each is a reproducible single-user bug, not a design discussion.

| #   | Item                                                             | Reporter(s)     | Status | Notes                                                                                        | Owner                  |
| --- | ---------------------------------------------------------------- | --------------- | ------ | -------------------------------------------------------------------------------------------- | ---------------------- |
| V1  | Cursor "Show localhost links in browser" setting off by default  | Abraham, Justin | 🗣️⬜   | Major onboarding blocker — preview browser silently fails to open in Cursor until toggled    | Andrew                 |
| V2  | Claude Code users can't see preview browser                      | multiple        | 🗣️⬜   | Requires separate Chrome + extension; no in-product guidance                                 | Andrew                 |
| V3  | `npx init` fails silently on machines without Node               | multiple        | 🗣️⬜   | No pre-flight check; users without Node hit opaque errors                                    | Andrew (Docs)          |
| V4  | Agent installed into root / read whole home dir                  | 1 participant   | 🗣️⬜   | CWD sandbox gap; init ran outside expected directory                                         | Skip                   |
| V5  | `bun x` vs `npx` confusion in shared quickstart                  | Miles noted     | 🗣️⬜   | Docs inconsistency; non-dev users don't have bun                                             | Andrew                 |
| V6  | "Create" button on broken-link placeholder gets stuck            | Abraham         | 🗣️⬜   | Distinct from Miles's "tell agent to create page" — this is the Create button UX itself      | Mike                   |
| V7  | Table header toggle doesn't persist across refresh               | Abraham         | 🗣️⬜   | Agent likely strips formatting on next write; schema or serialization issue                  | Sarah                  |
| V8  | Mermaid diagrams render as raw text                              | Gaurav          | 🗣️⬜   | Nick said "coming soon" verbally — no ticket on sheet                                        | Nick                   |
| V9  | Graph legend only visible in fullscreen Explore mode             | Nick            | 🗣️⬜   | Discoverability gap — per CLAUDE.md, `GraphLegend.tsx` is fullscreen-only by design; revisit | Mike                   |
| V10 | Port / server-lock collision requires manual restart             | 1 participant   | 🗣️⬜   | `ServerLockCollisionError` path fires but no guided recovery                                 | Andrew                 |
| V11 | Opus 4.7 succeeds where 4.2 / lower-tier models fail silently    | Andrew (self)   | 🗣️⬜   | Agent gets stuck in broken-link loop; no user-facing signal                                  | Tim (Docs)             |
| V12 | 3FA GitHub accounts hit extra friction, no UI messaging          | Andrew (self)   | 🗣️⬜   | Device flow works but user isn't prepared                                                    | Skip                   |
| V13 | `open-knowledge clone` blocked by "not permitted" for some users | Andrew (self)   | 🗣️⬜   | Required `--bypass-permissions` workaround; CLI should detect + prompt                       | Andrew                 |
| V14 | Auto-sync disabled by default, toggle is obscure                 | Miles/Andrew    | 🗣️⬜   | Discussed as GitHub Sync default-behavior concern, not flagged as ticket                     | Miles (may just close) |
| V15 | No dry-run / preview when running `init` on existing repo        | Miles           | 🗣️⬜   | Andrew agreed in-meeting to add a breakpoint                                                 | Skip                   |

## 3) Cross-cutting clusters proposed for single-shot resolution

Two design proposals in flight that would collapse multiple items from sections 1–2.

### Cluster A — Multi-agent presence + navigation (Slack proposal 2026-04-20)

**Covers:** #17, #18, sheet-rows for Tim/Andrew presence overlap, Justin divert-current-page, Miles Cursor-nav-slow, Nick agent-shouldn't-navigate.

**Prerequisite:** [[specs/2026-04-17-multi-agent-presence/SPEC]] (Draft) must land — FR1-FR5 on awareness wire format.

**Proposal:** Kill auto-navigation. Detect embedded viewer via User-Agent (`Cursor/`, `Claude/`, `Codex/`). If embedded → open Activity sidebar (live git-diff of the agent's edits, click to navigate). If standalone → agent glows in top-right presence indicators.

**Leaves open:** #17 (agent control from UI) — Activity panel is read-only in the proposal; control input is v2.

### Cluster B — Sidebar / outline live-update

**Covers:** Abraham #8 (outline), plus related "sidebar-needs-click-to-refresh" family.

**Substrate:** CC1 broadcaster (PRD-6499 shipped). [[packages/server/src/cc1-broadcast]] already emits `ch:'files'`; a `ch:'outline'` channel is a small add.

**Status:** Server substrate exists; client consumer for outline channel not written.

---

## 4) Covered / shipped

These are in the sheet but have been addressed by recent commits or Linear tickets. Verify against the original reproductions before closing.

| Item                                                                   | Reporter              | Coverage                                                                                                  | Status                                                                                                            |
| ---------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sidebar not updating on agent-created files                            | Andrew                | PRD-6499 (V0-2 CC1 broadcaster); `FileTree.tsx` subscribes to `documents-events`                          | ✅                                                                                                                 |
| Narrow-window UI / embedded view sidebar double-nav                    | Nick                  | PRD-6568 / PR #205 (embedded view auto-collapse)                                                          | ✅                                                                                                                 |
| Sidebar click-to-expand / collapse-on-select                           | Nick                  | PR #169 (sidebar + editor UX polish) + PR #200 (folder view polish)                                       | ✅                                                                                                                 |
| Reload needed when folders added                                       | Miles                 | Same CC1 push primitive (PRD-6499)                                                                        | ✅                                                                                                                 |
| `<!-- open-knowledge:begin -->` confusion                              | Nick                  | Clarified in-meeting as intentional init marker — not a bug                                               | ✅                                                                                                                 |
| GitHub auth — `allowUnsafeCredentialHelper`, keychain, callback window | Andrew, HeeGun, Miles | PR #219 (fix simple git auth and stream reader, 2026-04-20)                                               | 🟡 Verify against original reproductions — HeeGun's `exit code 1` and device-modal-no-success may still reproduce |
| Multi-agent presence — Claude + Cursor share one slot                  | Tim, Andrew           | [[specs/2026-04-17-multi-agent-presence/SPEC]]                                                            | 🔵 Draft spec, not implemented                                                                                    |
| Auto-navigation diverts current page                                   | Justin, Miles, Nick   | `pinnedDoc` / `pin` / `unpin` in `DocumentContext.tsx` exists; Slack proposal (Cluster A) is the full fix | 🟡 Workaround shipped, root fix not built                                                                         |
| Single-shot "install MCP for coding agent"                             | Nick                  | PR #209 (Codex MCP), PR #179 (multi-editor injection)                                                     | 🟡 Per-agent install; "all at once" still open                                                                    |

---

## 5) Suggested next actions

1. **Scope decision:** decide which of section 1 + 2 are V0-launch blockers vs post-launch. Candidates for blocker: V1, V2, V3, V6, V7, V10, V11 — each is a flat-out failure during a fresh onboarding.
2. **Promote verbal items to Linear:** section 2 (V1–V15) should get tickets so they stop living only here. Each row maps 1:1 to a ticket.
3. **Advance multi-agent-presence spec** ([[specs/2026-04-17-multi-agent-presence/SPEC]]) from Draft → Scope Frozen. Cluster A can't proceed without FR1-FR5.
4. **Agent-prompting sweep** (items #7, #12, #13): consolidate into one pass on `AGENTS.md` + init-injected instructions — these are prompt fixes, not code fixes, and can ship same-day.
5. **Verify PR #219 coverage** against the three original GitHub-auth reproductions before closing the cluster.

---

## 6) Cross-references

- Granola meeting: [Bug Bash — Open Knowledge](https://notes.granola.ai/d/983d2bb0-3d98-4c2d-b3cf-da3d89ea38ad)
- Project hub: [[projects/v0-launch/PROJECT]]
- Presence spec: [[specs/2026-04-17-multi-agent-presence/SPEC]]
- Related precedent: [[AGENTS]] §8 (long-lived agent identity vs short-lived session concerns)
- Related subsystem: [[packages/server/src/agent-sessions]], [[packages/server/src/cc1-broadcast]]

