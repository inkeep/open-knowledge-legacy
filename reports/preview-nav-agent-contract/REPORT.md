---
title: "Preview-Nav Agent Contract — From Per-Edit Mandate to Once-Per-Session Setup"
description: "Should Open Knowledge's agent-facing contract switch from per-edit `get_preview_url` + navigate to a once-per-session 'ensure preview attached' setup? What breaks, what improves, and what are the viable shapes across MCP clients (Claude Code, Cursor, Claude Desktop, Codex, generic stdio)? Analyzes the dual-mechanism overlap between the per-edit tool pattern and the existing server-pushed `AgentFocusBroadcaster`, names four candidate designs, and recommends a specific migration."
createdAt: 2026-04-24
updatedAt: 2026-04-24
subjects:
  - Open Knowledge
  - Claude Code Desktop
  - Cursor
  - MCP
  - AgentFocusBroadcaster
  - get_preview_url
topics:
  - agent UX contract
  - preview navigation
  - CRDT collaboration
  - MCP instructions design
---
# Preview-Nav Agent Contract — From Per-Edit Mandate to Once-Per-Session Setup

**Purpose:** Today Open Knowledge mandates that agents call `get_preview_url(docName)` and navigate their preview browser to that URL **before every** `write_document` / `edit_document`. The user wants to flip this: have agents open the preview **once at session start** as a pre-requisite, then stop navigating — let the server push focus to wherever the agent is editing. This report evaluates whether that flip is sound, names the candidate shapes, and recommends a migration path.

---

## Executive summary

**Headline finding: the flip is sound and low-risk.** Open Knowledge already ships the full server-side push-nav substrate (`AgentFocusBroadcaster` + `__system__` awareness + client-side `SystemDocSubscriber`) that makes per-edit agent-driven navigation **strictly redundant after the first edit of a session**. The per-edit pattern was designed before the server-push substrate existed; the two now overlap. Moving to "open once, then write freely" reuses existing infrastructure, reduces tool-call overhead by \~50% on edit-heavy sessions, and strictly *improves* user sovereignty (server-push honors pin + typing-guard; agent-driven nav does not).

**Recommended shape: D — Hybrid (server hint + once-per-session static instruction).** Agents open the preview once via their host's preview-opening tool, guided by (1) a compact one-line rule in the Agent Skill / MCP instructions and (2) a structured `action: "attach-preview-once"` hint that the server injects into write-tool responses whenever `subscriberCount === 0`. After the first attachment, `AgentFocusBroadcaster.setFocus` drives all subsequent navigation automatically. The `get_preview_url` tool stays — demoted from mandatory-per-edit to advisory (useful for embedding preview links in doc content and manual re-navigation).

**Five load-bearing findings:**

1. **Two independent nav mechanisms coexist today** — the per-edit `get_preview_url` + skill mandate path AND the server-side `setFocus` broadcaster that auto-navigates any attached editor tab. They are duplicative after the first edit.
2. **Claude Code's `preview_start` is semantically wrong for per-edit use.** It takes a launch-config **name**, not a URL; the pane is persistent; calling it per edit is slow and re-opens a server. Cursor's `Navigate` tool takes a URL directly, but it too persists state across turns — one call covers the session.
3. **Server-push-nav honors the 3-second typing guard; agent-driven nav bypasses it.** Moving the navigation burden to the server improves UX, not just efficiency.
4. **The subscriber-presence warning already exists** (`api-extension.ts:815-830` + `write-document.ts:107-112`). Shape D is \~80% implementable by editing static instructions in four places and adding \~10 lines of structured-hint plumbing to the write tools.
5. **Spec -15 (the original per-edit spec) does not need retraction** — its resolver design (env → lock → config → null) remains correct; only FR-9 (the agent mandate) and M1 (70% compliance target) need a corrigendum annotation per the project's post-ship convention.

**Non-obvious implications:**

- The "user watches every edit land in real time" UX is **preserved without change**. The CRDT stream and focus signal arrive together (the focus upsert and the write commit are in adjacent server-side code — see [[d5-d6-ux-preservation-and-warning]] Finding 1). The user sees no difference between agent-driven pre-nav and server-driven post-nav — both land the stream on the right doc within \~300ms.
- The current subscriber warning is **per-doc**, but the once-per-session mandate cares about **any tab being open**. A refinement (switching to `__system__` subscriber count) makes the warning align with the new contract.
- Agents that keep the old behavior silently continue working — the tool and the URL resolver remain functional. Rollout is non-coordinated.

---

## Research rubric

| #  | Dimension                              | Priority | Depth    | Evidence                                 |
| -- | -------------------------------------- | -------- | -------- | ---------------------------------------- |
| D1 | Current contract inventory             | P0       | Deep     | [[d1-current-contract-inventory]]        |
| D2 | Failure modes of the per-edit pattern  | P0       | Deep     | [[d2-failure-modes]]                     |
| D3 | Viable replacement shapes              | P0       | Deep     | [[d3-d4-replacement-shapes-and-clients]] |
| D4 | Cross-client compatibility             | P0       | Deep     | [[d3-d4-replacement-shapes-and-clients]] |
| D5 | UX impact on "watch every edit land"   | P0       | Moderate | [[d5-d6-ux-preservation-and-warning]]    |
| D6 | Subscriber-presence warning redesign   | P1       | Moderate | [[d5-d6-ux-preservation-and-warning]]    |
| D7 | Agent self-nav vs server-driven follow | P1       | Moderate | [[d7-d8-self-nav-and-migration]]         |
| D8 | Migration path                         | P1       | Moderate | [[d7-d8-self-nav-and-migration]]         |

**Stance:** Conclusions — the user asked for a recommendation, and the report names one with traced evidence. **Framing:** mixed 1P (Open Knowledge code + specs) and 3P (cross-client behavior of Claude Code, Cursor, etc.) — clearly labeled per section.

---

## Detailed findings per dimension

### D1 — Current contract inventory (P0, Deep, 1P)

**Finding:** Two mechanisms coexist today that both solve "preview follows the agent's edits":

- **Per-edit, client-driven:** Agent calls `get_preview_url(docName)` → receives a URL → navigates its host's preview browser (e.g., `preview_start("open-knowledge-ui")` on Claude Code, `Navigate(url)` on Cursor) → calls `write_document`. This is mandated in ≥4 surfaces: `buildInstructions()` in the MCP `instructions` field (`packages/cli/src/mcp/server.ts:194`), the Agent Skill at `packages/server/assets/skills/open-knowledge/SKILL.md:37-49`, the CLAUDE.md injection at `packages/cli/src/content/init.ts:144`, and the `get_preview_url` tool description at `packages/cli/src/mcp/tools/get-preview-url.ts:30-37`. A shared `PREVIEW_GUIDANCE` constant (spec -15 D11) keeps two of the four surfaces in sync.

- **Post-write, server-driven:** After every CRDT commit, `api-extension.ts:1547-1555` calls `agentFocusBroadcaster.setFocus(agentId, { currentDoc, writeKind, ts })` which upserts into the `__system__` Y.Doc awareness map. Any connected editor tab's `SystemDocSubscriber` (`packages/app/src/components/SystemDocSubscriber.tsx`) observes the change, runs through a 300ms debounce + pin check + typing guard, then calls `window.location.hash = hashFromDocName(primary)` to navigate. The React app's hashchange handler swaps the active doc; the CRDT streams the new content.

**Implications:** The per-edit contract solves "navigate the agent's preview (or a cold-start tab)." The server-push contract solves "keep any already-open editor tab following the agent." They overlap on every case EXCEPT "first edit of a session, no preview open anywhere."

**Decision triggers:**

- If your answer to "is a preview reliably open at session start?" is yes → server-push alone suffices.
- If no → you need one action somewhere (skill mandate, structured hint, or MCP resource) to trigger the opening.
- For every edit after the first, both paths are redundant — pick one.

**Remaining uncertainty:** Quantified overhead of the redundant path (tool-call count, token cost) is not measured. Spec -15 M1 target was 70% compliance with explicit instrumentation gap.

### D2 — Failure modes of the per-edit pattern (P0, Deep, 1P)

**Finding:** The per-edit pattern has six structural weaknesses against a once-per-session alternative. Full per-finding evidence in [[d2-failure-modes]]:

| # | Failure mode                                                                                            | Severity | Notes                                                                                                 |
| - | ------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| 1 | \~2 redundant tool calls per edit (`get_preview_url` + host nav)                                        | Medium   | Scales linearly; \~50% overhead on edit-heavy sessions                                                |
| 2 | Compliance drift across 4 instruction surfaces                                                          | Medium   | Spec -15 audit explicitly flagged no measurable success metric                                        |
| 3 | "Navigate the preview" means different things per client                                                | Medium   | Claude Code `preview_start` ≠ Cursor `Navigate` ≠ Codex (no tool)                                     |
| 4 | Claude Code's `preview_start` takes a launch-config `name`, not a URL — wrong semantic for per-edit nav | High     | Documented in [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop); pane is persistent |
| 5 | Per-edit nav **bypasses the 3-second typing guard** that server-push honors                             | High     | Strict UX regression vs server-push path                                                              |
| 6 | Small models drop the mandate under context pressure; large models comply                               | Medium   | Preferences high-capability customers                                                                 |

**Implications:** The per-edit pattern's only load-bearing value is handling the cold-start case ("no preview anywhere"). Every other case is better served by server-push. Finding 5 (typing-guard bypass) is the strongest argument for the flip — it means the current design is *worse* on the sovereignty dimension the broader agent UX landscape research already recommends pushing on ([[reports/agent-follow-and-edit-visibility-ux/REPORT]] D8, user sovereignty during follow).

**Remaining uncertainty:** Real-world compliance rate and small-model vs large-model drift rate are both unmeasured.

### D3 — Viable replacement shapes (P0, Deep)

Four candidate designs, evaluated in [[d3-d4-replacement-shapes-and-clients]]:

| Shape                                                      | Mechanism                                                                             | Cost                        | Pros                                                        | Cons                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **A — Ensure attached (skill-mandated, once per session)** | Single rule in Agent Skill: "open preview at session start"                           | Low (instruction-only edit) | Simple, reuses all existing infra                           | Compliance risk (but once, not per edit) |
| **B — First-write auto-attach via server hint**            | Write-tool response includes `action: "attach-preview-once"` when no preview attached | Low (\~10 lines new code)   | Just-in-time; server-authored                               | Doesn't help if agent ignores the hint   |
| **C — MCP resource-link with subscribe**                   | Preview URL as MCP resource, server pushes `notifications/resources/updated`          | High (new protocol work)    | Protocol-native, MCP Apps compatible                        | Overkill today; client support varies    |
| **D — Hybrid (A + B)**                                     | Compact skill rule AT session start, server hint reinforces at first write            | Low                         | Best of both — static guidance + just-in-time reinforcement | Still needs 4-surface edit               |

**Recommendation: Shape D.** It reuses the existing `getSubscriberCount` + warning infrastructure, codifies the mandate once (in the skill + MCP instructions) instead of per-edit, and has a server-driven fallback for agents that miss the static guidance. Shape C (MCP resources) is the right long-term direction for MCP Apps–capable clients but the incremental payoff today doesn't justify the engineering cost; revisit when MCP Apps iframe embedding is a product direction ([[reports/ai-coding-tools-embedded-browsers/REPORT]] covers the embedding landscape).

### D4 — Cross-client compatibility (P0, Deep, 3P)

Matrix in detail at [[d3-d4-replacement-shapes-and-clients]]; summary:

| Client                   | Embedded preview?                      | Once-per-session shape works?                         | Failure mode                          |
| ------------------------ | -------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Claude Code Desktop      | ✅ `preview_start("open-knowledge-ui")` | ✅ Yes — pane persists, hash changes drive in-pane nav | —                                     |
| Cursor (v3+)             | ✅ `Navigate(url)`                      | ✅ Yes — state persists across agent sessions per docs | —                                     |
| Claude Desktop (chat)    | ⚠️ Localhost-only preview              | ⚠️ Limited — needs MCP Apps for richer UX             | Falls back to human-opens-URL         |
| Codex desktop            | ❌ No embedded browser                  | ⚠️ Fallback only — user opens URL manually            | Server-push silent until human joins  |
| VS Code + MCP            | ✅ Via MCP Apps + webview               | ✅ Yes                                                 | Quality depends on MCP extension      |
| Generic stdio MCP client | ❌ No browser concept                   | ❌ No preview at all                                   | Out of scope — agent edits still work |

**Key takeaway:** The flip is a strict improvement on the richest clients (Claude Code, Cursor) and strictly neutral on weaker ones (Claude Desktop chat, Codex, generic stdio) — the degraded experience on weak clients is identical whether the agent is mandated to nav per-edit or once-per-session.

### D5 — UX impact on "watch every edit land" (P0, Moderate)

**Finding:** The "live edit-watching" UX is preserved. The CRDT stream and the focus signal are in adjacent server-side code (`api-extension.ts:1545 flushDocToGit` followed immediately by `api-extension.ts:1550 setFocus`); they reach the client within one network round-trip. From the user's perspective, the \~300ms debounce + pin + typing-guard path arrives **at the same time as the content** — no perceptible difference between "agent pre-navigated" and "server post-navigated."

**Additionally preserved or improved:**

- **Pin:** unchanged (client-side only).
- **Typing guard:** server-push honors it; agent-driven nav doesn't → improvement.
- **Cadence norms (spec -14 §N1):** orthogonal to the nav contract; still apply.
- **Cold-start case:** handled by the once-per-session skill mandate + first-write warning hint.

**Implications:** The instinct that "the user watches every edit land in real time" will be lost is not grounded in the code paths. Server-push delivers the same outcome with strictly better sovereignty properties.

### D6 — Subscriber-presence warning redesign (P1, Moderate)

**Finding:** Today the warning fires when `perDocSubscriberCount === 0` — i.e., no editor tab is currently subscribed to **this specific doc**. Under the per-edit contract, this is correct: the agent should have navigated the preview before writing. Under a once-per-session contract, this threshold is noisy — an agent writing 10 docs in sequence will see `warning` on docs #2-#10 even though a preview IS open (on doc #1, waiting for server-push to carry it).

**Proposed refinement:** Add a `systemDocSubscriberCount` check. The warning that drives the `action: "attach-preview-once"` hint should fire on `systemDocSubscriberCount === 0` (no editor at all), not `perDocSubscriberCount === 0`. The per-doc count remains useful for other diagnostics (e.g., debug messages).

**Implications:** One \~5-line change to `getSubscriberCount`'s callers — read the `__system__` doc's connection count instead of (or in addition to) the target doc's. Full 1P detail in [[d5-d6-ux-preservation-and-warning]] Finding 4.

**Decision trigger:** if the refined threshold isn't implemented, the first-write-after-attachment-elsewhere case will trigger a spurious warning once per new doc. Not catastrophic — the warning text is still true ("no preview is attached to THIS doc") — but less useful.

### D7 — Agent self-navigation vs server-driven follow (P1, Moderate, cross-ref 3P)

**Finding:** External UX prior art ([[reports/agent-follow-and-edit-visibility-ux/REPORT]] §D1) recommends the **VS Code Live Share pushpin model** for agent follow: sticky, explicit unpin only, survives scrolls. Open Knowledge's server-push-nav IS this model. Agent-driven per-edit navigation is the inverse — a push-from-agent pattern that no cited prior art uses.

The ONE legitimate agent-driven nav use case ("highlight something the user isn't currently looking at") is covered by spec -14 §FW-3 as multi-agent disambiguation future work — and even there, the affordance is user-side (click avatar in presence bar) not agent-side.

**Implications:** Don't delete `get_preview_url`. Rescope it:

- Advisory resolver for agents who want to embed preview links in content.
- Fallback for manual re-navigation.
- NOT the primary nav mechanism.

### D8 — Migration path (P1, Moderate)

**Finding:** Migration requires coordinated edits in four places + one new code path + one corrigendum annotation:

1. **Edit `buildInstructions()`** in `packages/cli/src/mcp/server.ts:194` — replace per-edit mandate with once-per-session rule.
2. **Edit SKILL.md** at `packages/server/assets/skills/open-knowledge/SKILL.md:37-49` — same rewrite, host-specific examples.
3. **Edit `CLAUDE_MD_SECTION`** at `packages/cli/src/content/init.ts:144` — leverage the existing shared `PREVIEW_GUIDANCE` constant per spec -15 D11.
4. **Edit `get_preview_url` tool description** at `packages/cli/src/mcp/tools/get-preview-url.ts:30-37` — advisory, not mandatory.
5. **Add structured hint** to `packages/cli/src/mcp/tools/write-document.ts:132` + the matching `edit-document.ts` site — `action: "attach-preview-once"` when `subscriberCount === 0`.
6. **Annotate spec -15** FR-9 + M1 with a corrigendum breadcrumb per the CLAUDE.md convention, pointing at either a new SPEC or an updated section of the existing one.

**Backwards compatibility:** Agents running the old contract silently continue to work — `get_preview_url` remains functional; per-edit `Navigate` calls are no-ops-second-time (same URL) or redundant-but-harmless (new URL that server-push would have delivered anyway). No coordinated rollout needed.

**Full migration sketch with code snippets** in [[d7-d8-self-nav-and-migration]] Finding 5.

**Decision triggers:**

- If the team wants a clean retroactive spec → write a new SPEC for the once-per-session contract and annotate -15 as superseded.
- If the team prefers incremental amendment → add a §11 "Post-ship amendment" to -15 directly with breadcrumbs on FR-9 + M1.

---

## Cross-dimension synthesis — the integrated recommendation

**Ship Shape D (Hybrid). Do it in two small PRs:**

**PR 1 (instruction-only, zero runtime change):**

- Update SKILL.md preview section (1 block replaced).
- Update `PREVIEW_GUIDANCE` constant → propagates to MCP instructions + CLAUDE.md.
- Update `get_preview_url` tool description.
- Annotate spec -15 with corrigendum on FR-9 + M1.

**PR 2 (runtime change, small):**

- Add `action: "attach-preview-once"` to write-tool `warning` payload when `subscriberCount === 0`.
- Optionally refine threshold to `systemDocSubscriberCount === 0` (D6 proposal) — safe and aligns warning with the new contract.
- Add unit tests verifying the structured hint fires correctly.

**Under the hood, nothing else changes:**

- `AgentFocusBroadcaster` already does the work.
- `SystemDocSubscriber` already honors pin + typing guard + debounce.
- The `previewUrl` in tool responses stays — humans click it, agents embed it.
- `preview_start("open-knowledge-ui")` (the `.claude/launch.json` entry already committed to the repo) continues to work for Claude Code Desktop as the once-per-session open.

**What the agent actually does per session (new contract):**

1. Read docs freely via `exec` / `read_document` / `search`.
2. **First** `write_document` / `edit_document`: server responds with `warning: { action: "attach-preview-once", previewUrl }`. Agent calls host's preview-opening tool ONCE with the URL.
3. Subsequent writes: no navigation action required. Server-push carries the open preview to each new doc. Agent just writes.

---

## Limitations and caveats

1. **Framing:** This report mixes 1P (OK code + specs) and 3P (cross-client behavior). 1P findings cite specific file:line locations; 3P findings cite vendor docs. The `/research` skill default is 3P-only; 1P was explicitly requested at scoping.

2. **No telemetry:** The analysis is structural + docs-driven. Actual per-edit tool-call overhead and compliance rates are not measured. Spec -15 M1's 70% compliance target was aspirational with no instrumentation; this report does not fix that gap but flags it as a follow-up.

3. **Claude Code `preview_start` exact semantics:** The docs confirm the pane is persistent and `preview_start` takes a launch-config name. Whether there is a separate `preview_nav(url)` tool to re-point an open pane to a different URL without re-calling `preview_start` is not publicly documented — the hash-route + `window.location.hash` pattern used by `SystemDocSubscriber` sidesteps the question (the React app navigates itself). If a future Claude Code release exposes explicit URL navigation, the shape is forward-compatible.

4. **MCP Apps / resource-link integration (Shape C):** deferred. The protocol substrate exists; OK could adopt it later for richer MCP Apps–capable clients without re-doing the Shape D work. Shape D does not block Shape C.

5. **Multi-agent case:** orthogonal. The spec -14 discussion of "latest wins" + FW-3 ("click to follow specific agent") still applies. Under the once-per-session contract, multi-agent focus thrashing is still a concern — but the same concern exists under the per-edit contract. This report does not worsen it.

6. **Security / privacy:** unchanged. `previewUrl` is still emitted in tool responses; no tokens or sensitive data are added to the hint payload.

---

## Related prior research in this repo

- [[reports/agent-follow-and-edit-visibility-ux/REPORT]] — 3P UX landscape. Explicitly names "push-nav-via-MCP-tool constraint that the follow-mode UX replaces." Recommends VS Code Live Share pushpin model for agent follow, which OK's server-push substrate already implements.
- [[reports/ai-coding-tools-embedded-browsers/REPORT]] — cross-client embedded-browser capabilities (Claude Code: yes; Cursor: yes; Claude Desktop chat: localhost-only; Codex: no). MCP Apps standard as the iframe-embedding path for Shape C.
- [[reports/mcp-agent-attribution-implementation/REPORT]] — 1P implementation plan for agent identity attribution, which the `AgentFocusBroadcaster` builds on (`agentId` is a first-class parameter).
- [[specs/2026-04-14-agent-nav-and-cadence/SPEC]] — the spec that SHIPPED the server-push-nav substrate. Load-bearing for this report's recommendation.
- [[specs/2026-04-15-preview-url-pre-edit/SPEC]] — the spec that SHIPPED `get_preview_url` + the per-edit mandate this report recommends superseding.

---

## References — external sources cited

- [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop) — preview pane semantics, `preview_start`, launch.json.
- [Daniel Avila — Claude Code Desktop's built-in Preview MCP](https://medium.com/@dan.avila7/claude-code-desktop-has-a-built-in-preview-mcp-heres-how-it-works-774809ff676f) — `preview_start` entry point, headless-browser integration.
- [Cursor browser tool docs](https://cursor.com/docs/agent/tools/browser) — Navigate / Click / Screenshot, state persistence.
- [Cursor 3 release notes](https://cursor.com/blog/cursor-3) — April 2026 agent-first interface.
- [MCP — Resources concepts](https://modelcontextprotocol.info/docs/concepts/resources/) — resource URIs, subscribe, `notifications/resources/updated`.
- [MCP — Notifications (FastMCP)](https://gofastmcp.com/clients/notifications) — client-side notification handling patterns.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — reference implementation of navigate/screenshot/click tool surface used by multiple AI coding tools.

---

## Evidence files

- [[d1-current-contract-inventory]]
- [[d2-failure-modes]]
- [[d3-d4-replacement-shapes-and-clients]]
- [[d5-d6-ux-preservation-and-warning]]
- [[d7-d8-self-nav-and-migration]]
