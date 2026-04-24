# Evidence: D1 — Current Contract Inventory

**Dimension:** What `get_preview_url` + CLAUDE.md guidance does, what `AgentFocusBroadcaster` does, and where they overlap/conflict.
**Date:** 2026-04-24
**Sources:** 1P code in `packages/cli/src/mcp/`, `packages/server/src/`, `packages/server/assets/skills/open-knowledge/SKILL.md`, and the two governing specs under `specs/`.

---

## Key files referenced

- `packages/cli/src/mcp/tools/get-preview-url.ts:1-127` — the per-edit preview URL resolver tool.
- `packages/cli/src/mcp/tools/preview-url.ts:171-227` — shared resolver used by `get_preview_url` AND write tools.
- `packages/cli/src/mcp/tools/write-document.ts:91-143` — write tool's per-call preview handling + subscriber warning.
- `packages/cli/src/mcp/tools/edit-document.ts:105-137` — same pattern as write-document.
- `packages/cli/src/mcp/server.ts:187-214` — `buildInstructions()` sends preview guidance in MCP `instructions` field on every client handshake.
- `packages/server/assets/skills/open-knowledge/SKILL.md:37-49` — the user-facing "Preview-before-edit (REQUIRED)" skill section.
- `packages/server/src/agent-focus.ts:1-109` — `AgentFocusBroadcaster` implementation.
- `packages/server/src/api-extension.ts:1547-1555, 2284-2288, 3032-3036` — where the server calls `agentFocusBroadcaster.setFocus()` on every write.
- `packages/server/src/api-extension.ts:815-830, 1563-1571` — `getSubscriberCount()` + the `subscriberCount: 0` warning emitted on writes.
- `specs/2026-04-14-agent-nav-and-cadence/SPEC.md` — the server-push-nav spec.
- `specs/2026-04-15-preview-url-pre-edit/SPEC.md` — the per-edit `get_preview_url` spec.

---

## Findings

### Finding 1: Two independent nav mechanisms coexist today
**Confidence:** CONFIRMED
**Evidence:**
- `get_preview_url` MCP tool (client-driven, pre-edit): `packages/cli/src/mcp/tools/get-preview-url.ts:30-37` — tool description says: _"Agents should call this IMMEDIATELY BEFORE `write_document` / `edit_document` so they can navigate the preview browser to the doc first and watch the CRDT edit land live."_
- `AgentFocusBroadcaster.setFocus()` (server-pushed, post-write): `packages/server/src/api-extension.ts:1547-1555` — every agent write in `handleAgentWriteMd` ends with `agentFocusBroadcaster?.setFocus(agentId, { agentName, currentDoc, writeKind, ts })`, which publishes to `__system__` Y.Doc awareness. Client-side subscriber (`SystemDocSubscriber`) listens and drives browser navigation via hash.

```typescript
// packages/server/src/api-extension.ts:1547-1555
// Focus (attribution) on __system__ awareness. Focus drives browser
// push-navigation to the doc the agent just wrote (writeKind); presence
// is separately maintained via setPresence/touchMode pairs above.
agentFocusBroadcaster?.setFocus(agentId, {
  agentName,
  currentDoc: resolvedDocName,
  writeKind: 'write',
  ts: Date.now(),
});
```

**Implications:** The server already pushes focus to any attached editor tab on every write. The per-edit `get_preview_url` tool is **not** what causes existing tabs to follow — it's what causes the *agent's* preview browser (Claude Code's `preview_start`-owned pane) to navigate. These are two different surfaces solving two different problems: (A) the agent-side preview that the agent itself controls, (B) the human-side editor tab that follows regardless of agent action.

### Finding 2: `get_preview_url` does pure URL resolution — it does not actually navigate anything
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/get-preview-url.ts:50-108` — the tool resolves a URL from `env → lock → config` and returns it. The *agent* (as LLM reasoning) is responsible for then using its host's preview-opening tool (e.g., Claude Code's `preview_start` / `preview_nav`) with that URL.

```typescript
// packages/cli/src/mcp/tools/get-preview-url.ts:92-107
const resolved = resolvePreviewUrl(docName, { config, lockDir, contentDir });
if (!resolved) {
  return {
    ok: true,
    result: { previewUrl: null },
    text: `No preview URL resolvable for "${docName}". The server is likely not running yet. ...`,
  };
}
return {
  ok: true,
  result: { previewUrl: resolved.url, previewUrlSource: resolved.source },
  text: `Preview URL for "${docName}" (source: ${resolved.source}):\n${resolved.url}`,
};
```

**Implications:** The contract has three parts: (1) the MCP tool returns a URL, (2) the Agent Skill / CLAUDE.md tells the LLM _"now navigate your preview browser there,"_ (3) the LLM's host exposes a navigation tool (`preview_start`, `preview_nav`, or equivalent). Removing the per-edit obligation doesn't require removing the tool — the URL resolver has other uses (e.g., write tools still emit `previewUrl` in their responses so the HUMAN can click them).

### Finding 3: Subscriber-presence warning is emitted on every write
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:815-830, 1563` — `getSubscriberCount(docName)` reads `hocuspocus.documents.get(docName)?.connections.size`. The count is returned in every `agent-write-md` response at `api-extension.ts:1568`. The write tool then surfaces it:

```typescript
// packages/cli/src/mcp/tools/write-document.ts:107-112
if (noPreviewAttached) {
  lines.push(
    preview
      ? `Warning: no preview is currently attached to "${normalized.docName}". Open ${preview.url} to watch future edits live.`
      : `Warning: no preview is currently attached to "${normalized.docName}".`,
  );
}
```

**Implications:** This warning is the signal that enables a "setup-time open" contract. If `subscriberCount > 0`, we know the user IS watching (somewhere in the editor UI), and server push-nav will carry them to the right doc. If `subscriberCount === 0`, the agent can be told to "open the preview browser now" — but just once, not per edit. The signal infrastructure is already in place.

### Finding 4: The per-edit obligation is encoded in three places (drift risk)
**Confidence:** CONFIRMED
**Evidence:**
- **MCP `instructions` field** — sent to every connecting MCP client at handshake time. `packages/cli/src/mcp/server.ts:202-206`:
  > _"Every `write_document` / `edit_document` MUST be preceded by `get_preview_url(docName)` → open returned URL in your preview browser → call write tool."_
- **Agent Skill SKILL.md** — installed per-user in `~/.claude/skills/open-knowledge/`. `packages/server/assets/skills/open-knowledge/SKILL.md:37-49`:
  > _"Every call to `write_document` / `edit_document` MUST follow this sequence: 1. Call `get_preview_url(docName)`. 2. Open that URL in your preview browser. 3. Only then call `write_document` / `edit_document`."_
- **CLAUDE.md injection** — appended to user projects via `open-knowledge init`. Referenced at `packages/cli/src/content/init.ts:144` as `CLAUDE_MD_SECTION`; both surfaces share the `PREVIEW_GUIDANCE` constant per spec -15 D11.
- **Tool description** on `get_preview_url` itself — sent via `tools/list`. `packages/cli/src/mcp/tools/get-preview-url.ts:30-37`.

**Implications:** Any redesign must edit all four surfaces in lockstep, or the agent will see conflicting instructions across tools/list, instructions, skill, and CLAUDE.md. This is manageable but fragile — the original spec -15 D11 already acknowledged it by extracting a shared `PREVIEW_GUIDANCE` constant.

### Finding 5: `AgentFocusBroadcaster` operates WITHOUT any agent-side cooperation
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:1550` — `setFocus` is called from the server-side write handler, after the CRDT transaction commits. The agent never touches awareness state; it just calls the write tool. `packages/server/src/agent-focus.ts:33-36` shows the broadcaster upserts the agent's entry into the `__system__` awareness map; any connected client already observing that map will see the change and navigate.

```typescript
// packages/server/src/agent-focus.ts:34-36
setFocus(agentId, entry): void {
  this.mutateAgentFocus((current) => ({ ...current, [agentId]: entry }));
}
```

**Implications:** The server-push-nav path does NOT require any agent instruction change. It's already fully automatic for any client subscribed to `__system__` awareness (i.e., any open editor tab). The per-edit `get_preview_url` obligation exists ONLY to handle the case where the client isn't subscribed because no tab is open yet.

### Finding 6: The current contract DUPLICATES work when both paths fire
**Confidence:** INFERRED (from code reading; not quantified)
**Evidence:** For a typical agent write to `docs/foo.md`:

1. Agent calls `get_preview_url("docs/foo")` → returns URL.
2. Agent calls `preview_start` or `preview_nav` with the URL → Claude Code opens or navigates its preview pane.
3. Agent calls `write_document("docs/foo", ...)` → server commits the write and calls `setFocus(..., currentDoc="docs/foo")`.
4. Any editor tab already subscribed to `__system__` awareness (including Claude Code's preview if it's open) observes the focus change and **also** navigates to `docs/foo`.

Steps 1-2 and step 4 both achieve the same end state (preview on `docs/foo`). For any doc after the first, step 4 alone is sufficient.

**Implications:** Per-edit navigation is **redundant after the first edit** of a session, assuming the preview browser was opened once at the start. The duplicated work has a real cost: ~1 extra MCP round-trip + ~1 preview-nav call per edit + agent tokens to reason about both.

---

## Gaps / follow-ups

- **Quantified token / latency overhead** of per-edit `get_preview_url + preview_nav` vs once-per-session: not measured. Would need agent session transcript analysis.
- **Debouncing behavior of `SystemDocSubscriber`**: spec -14 IS-3 mentions "300ms debounce + latest-wins" but I haven't read the client subscriber code yet. Relevant to D5 (UX preservation).
- **Client-specific `preview_start` semantics**: does Claude Code's `preview_start` reuse an existing pane, or open a new one per call? Needs D4 investigation.
