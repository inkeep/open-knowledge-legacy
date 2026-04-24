# Evidence: D7 + D8 — Agent Self-Navigation Semantics + Migration Path

**Dimension:** When (if ever) does agent-driven navigation beat server-push, and how do we get from the current dual design to the recommended one without breaking existing agent contracts?
**Date:** 2026-04-24
**Sources:** Existing 3P UX landscape research, 1P instruction surfaces, current spec -15 D11 drift-mitigation pattern.

---

## D7 — Agent self-navigation vs server-driven follow

### Finding 1: Server-push-nav matches "pushpin follow" prior art (VS Code Live Share pattern)
**Confidence:** CONFIRMED (via [`reports/agent-follow-and-edit-visibility-ux/REPORT.md`](../../agent-follow-and-edit-visibility-ux/REPORT.md))
**Evidence:** The prior-art survey at D1/D2 of that report: _"Adopt VS Code Live Share's pushpin follow model, not Google Docs' aggressive-auto-break. Agent work is long-running; auto-break on every scroll is wrong."_ Server-push-nav + pin + typing-guard IS this model: follow is sticky (explicit unpin only), survives scrolls/clicks, broken only by explicit pin or active typing.

**Implications:** Open Knowledge's server-push substrate is already the right shape per external UX convention. Agent self-nav is the inverse pattern (pull-push-pull per edit), which no cited prior art uses.

### Finding 2: Agent self-navigation has ONE legitimate use case — disambiguation
**Confidence:** INFERRED
**Evidence:** Spec -14 §FW-3 ("Presence-bar click-to-follow for specific agent"): _"deferred until multi-agent parallel sessions become common."_ In a multi-agent setting, server-push-nav uses "latest wins" — agent A's write is followed, then agent B's, then A's again. If a human wants to pin to agent A specifically, that's client-side logic on their presence-bar, not agent-driven.

**Implications:** Agent-driven nav has no unique affordance in Open Knowledge. Every use case covered by per-edit `get_preview_url + Navigate` is covered by server-push + cold-start-open. The single case where an agent might legitimately want to force a specific preview URL is "I want to show the user something they're not currently looking at" — but spec -14 J1 §6 argues pin behavior is a user's call, not an agent's. An agent overriding a pinned tab would be a UX regression.

### Finding 3: The `get_preview_url` tool has legitimate non-nav uses
**Confidence:** CONFIRMED
**Evidence:** The tool returns a URL. Agents can embed that URL in doc content (e.g., a PR description linking to the preview), in activity-feed entries, in tool responses for HUMAN click-through. The write tools themselves already emit `previewUrl` in their `structuredContent` — so an agent doesn't need to call `get_preview_url` to get the URL for their own writes; it comes back in the response. But agents writing ABOUT a doc they didn't edit (e.g., "see the draft at `docs/foo`") still need the URL resolver.

**Implications:** Don't delete the tool. Rescope it: it becomes an advisory resolver, not a navigation trigger. The mandate is what changes, not the surface.

---

## D8 — Migration path

### Finding 4: Four coordinated surfaces to change
**Confidence:** CONFIRMED
**Evidence:** Per D1 Finding 4, the per-edit mandate lives in:
1. `packages/cli/src/mcp/server.ts:194, 202-206` (`buildInstructions` → MCP instructions field).
2. `packages/server/assets/skills/open-knowledge/SKILL.md:37-49` ("Preview-before-edit (REQUIRED)" section).
3. `packages/cli/src/content/init.ts:144` (`CLAUDE_MD_SECTION` appended to user CLAUDE.md).
4. `packages/cli/src/mcp/tools/get-preview-url.ts:30-37` (tool description sent via `tools/list`).

Spec -15 D11 already extracted the shared `PREVIEW_GUIDANCE` constant so surfaces 1 and 3 stay in sync.

**Implications:** A single constant edit can update 2-of-4 surfaces; 2 and 4 need separate edits. If a structured `action: "attach-preview-once"` hint is added to write-tool responses (Shape B/D), `write-document.ts:107-112` + `edit-document.ts` parallel change needs to land in the same PR.

### Finding 5: Proposed rewrite (minimal)
**Confidence:** N/A — recommendation, not evidence
**Sketch:**

**New skill section (replaces lines 37-49 of SKILL.md):**
```markdown
## Writing — open preview once, then edit freely

**At session start** (before your first `write_document` or `edit_document` in this repo), ensure a preview browser is attached so the user can watch:
- Claude Code Desktop: `preview_start("open-knowledge-ui")`.
- Cursor: `Navigate(previewUrl)` where `previewUrl` comes from a write-tool response or `get_preview_url`.
- Other hosts: use the host's "open URL" tool with the `previewUrl` the server returns.

**After that, edit freely.** The server pushes focus to the open preview on every write, so it follows you. No per-edit navigation is required.

If a write tool response includes a `warning: { action: "attach-preview-once" }` hint, that means no preview is attached yet — open the URL and continue. The warning will disappear once a preview is listening.

**Never construct preview URLs by hand.** Use `get_preview_url` or the `previewUrl` returned in write-tool responses.

Native `Edit` / `sed` / `Write` on in-scope markdown is forbidden — it bypasses the CRDT and loses agent attribution.
```

**New MCP instructions (`buildInstructions`, replaces lines 202-206):**
```
## Preview (once per session)

Before your first write, open the preview URL in your host's preview browser so the user can watch. After that, the server pushes focus to the open preview on every write — no per-edit navigation needed. See the `open-knowledge` Agent Skill for host-specific commands.
```

**Structured hint on writes (add to `write-document.ts:132` + `edit-document.ts`):**
```typescript
if (noPreviewAttached) {
  structured.warning = {
    message: `No preview attached. Open ${preview?.url ?? '<server URL>'} in your preview browser once to watch future edits.`,
    action: 'attach-preview-once',
    previewUrl: preview?.url ?? null,
  };
}
```

**`get_preview_url` description update (replaces lines 30-37):**
```
Return a browser URL for the given wiki docName. Useful when embedding preview links in doc content or when a manual re-navigation is needed. Per-edit navigation is not required — the server pushes focus to the attached preview on every write. Use `preview_start` / Navigate once at session start; after that, just write.
```

### Finding 6: Backwards compatibility is free
**Confidence:** CONFIRMED
**Evidence:** If any existing agent continues to call `get_preview_url + Navigate` per edit, everything still works. The tool remains functional; the per-call navigation is a no-op the second time (same URL, or a new URL that server-push would have delivered anyway); the write still commits. No breakage.

**Implications:** Rollout can be gradual. Ship the skill/instructions change first; agents update at their own pace. No coordinated migration needed.

### Finding 7: Spec -15 does NOT need to be retracted
**Confidence:** INFERRED
**Evidence:** Spec -15's FR-1 through FR-8 are all about resolver correctness (env → lock → config, URL encoding, adversarial coverage). Those remain valid. Only FR-9 (the agent-side `PREVIEW_GUIDANCE` mandate) and its target M1 (70% compliance) change — from "call `get_preview_url` before every edit" to "open preview once per session."

Per CLAUDE.md's post-ship corrigendum pattern:
> _"Never rewrite prose in shipped specs. Append a breadcrumb on the same line: `<original><br>_[Corrected YYYY-MM-DD post-ship: <one-sentence correction>. Authoritative fix in <pointer>.]_`."_

Apply that pattern to spec -15's FR-9 + M1, pointing at a new spec or addendum that encodes the once-per-session mandate. Migration is a doc-annotation + 4-surface edit + 1 structured-hint addition.

---

## Gaps / follow-ups

- **Telemetry instrumentation for the new mandate** (Finding M1 analog): same audit gap as before. Could add a counter on `__system__` subscriber-count transitions and emit "no-preview-at-write" metric on writes.
- **Corrigendum exact location:** spec -15 §§6 (FR-9) and §7 (M1) need the annotation; specific line-level breadcrumb is implementation detail.
- **Cross-client client-detection logic** (whether OK should try to auto-select the right preview-opening tool name): NOT NOW — force the agent + skill to handle per-host differences via the static skill guidance. Harnesses differ too much for auto-detection to be reliable.
