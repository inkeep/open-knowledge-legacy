---
topic: handleRollback principal attribution symmetry
sources:
  - packages/server/src/api-extension.ts (handleRollback ~3013)
  - packages/app/src/components/TimelinePanel.tsx (Restore button 656-677)
  - specs/2026-04-21-agent-write-summaries/SPEC.md (D22)
confidence: HIGH
date: 2026-04-29
status: investigated
---

# OQ-8: handleRollback symmetry with handleRenamePath

## Findings

### UI Restore button location and payload

The Restore button lives in `packages/app/src/components/TimelinePanel.tsx:656-677`, NOT in `EditorPane.tsx` (the spec args were inaccurate on this — the button moved during the recent timeline-to-docpanel work). It's the `Undo2` icon in each timeline entry row. On click → confirmation dialog → POST to `/api/rollback`.

**Payload today:**

```json
{ "docName": "<docName>", "commitSha": "<sha>" }
```

No identity fields. UI rollback is intentionally anonymous today per D22.

### handleRollback identity handling today

`handleRollback` (api-extension.ts ~3013):
- Calls `extractAgentIdentity(body)` unconditionally (~3054)
- Guards `recordContributor` on `hasAgentId` (~3086):
  ```ts
  const hasAgentId = typeof bodyObj.agentId === 'string' && bodyObj.agentId.length > 0;
  ```
- If `hasAgentId`, records contributor with agent identity + summary (~3189-3201)

**Does NOT parse `principalId` today.**

### Symmetry with handleRenamePath

Both handlers share an identical structural pattern under D22:
- Call `extractAgentIdentity` unconditionally for validation (catches malformed `summary: 42` regardless of identity)
- Guard `recordContributor` on `hasAgentId`
- Pass summaries through `normalizeSummary` → truncate → `recordContributor` → L2 flush
- UI-driven (no `agentId`) stays anonymous

## Conclusion

**Rollback needs the same amendment.** Reasons:

1. **Agents call rollback too** (`rollback_to_version` MCP tool). Asymmetry would mean an agent's rollback gets attributed (today), but a principal's rollback wouldn't (post-spec) — strictly worse than today's anonymity.
2. **Same 1-way-door guard structure.** D22's `hasAgentId` check is reusable; the amendment adds a parallel `hasPrincipalId` check.
3. **Single-primary-doc operations.** Rollback affects only the rolled-back doc; no side-effect docs to anonymize. Simpler than rename's side-effect carve-out.
4. **Future-refactor cost.** Diverging the codepaths now would force a follow-up spec to converge them later.

## Implication for the spec

- Extend D22 amendment scope: `handleRenamePath` AND `handleRollback`.
- Add FR for rollback principal attribution.
- ~~TimelinePanel Restore button payload should include `principalId`.~~ **SUPERSEDED by OQ-7 / D-A11.** See update note below.
- OQ-8 resolves with new Decision D-A10: extend rollback symmetrically.
- Tests must pin: rollback with no `agentId` records `getPrincipal()`-derived principal contributor; rollback with `agentId` records the agent; rollback when no principal is loaded stays anonymous (FR6 edge case).

## Update 2026-04-29

OQ-7 resolution (D-A11) supersedes the payload-change recommendation in this file. The symmetry conclusion (rollback uses the same `extractActorIdentity` helper as rename) STANDS — but the helper reads `agentId` from body and `getPrincipal()` from server-side, NEVER `principalId` from body. TimelinePanel's Restore button payload remains `{docName, commitSha}` unchanged. See `oq-7-principal-trust-boundary.md` and SPEC §10 D-A11.
