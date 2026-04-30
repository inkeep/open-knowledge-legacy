---
date: 2026-04-30
sources: user (Nick) direct framing during /spec light intake
type: user-outcomes
---

# User outcomes — captured framing

## Seed (verbatim from intake)

> "api design hardening — typescript-api-design audit findings on PR #270's contract surfaces (POST /api/upload error shape, ClassifiedLinkTarget exhaustiveness, AssetViewerRegistry plugin patterns, IPC reason unions, UploadResponse schema-as-SSOT)"

## Trigger framing (user direction)

> "code-health polish AND general hardening before the next round of capability work touches these surfaces — pick a defensible cut"

**Interpretation:** The cut is bounded by *next-round capability work*, not by speculative future-proofing. Items earn their way in if the next surface that touches these contracts would either (a) inherit the inconsistency, (b) silently propagate the gap, or (c) require re-deriving the discipline. Items where the trigger is "going public" or "MCP exposure of upload" without a concrete next surface stay as Future Work pointers.

**Implicit constraints (carried from prior conversation):**
- PR #270 just merged; this is post-ship cleanup, not a new feature spec.
- Greenfield/pre-production status applies — no production user contracts to preserve.
- The codebase has explicit STOP/WARN rules + numbered `precedent #N` patterns; new contract patterns should align with that discipline.

## Who benefits

Internal devs writing the next surface that touches `/api/*`, `ClassifiedLinkTarget`, `IpcChannelMap`, or descriptor types. Worldmodel will surface which next-round work is concretely planned (typed-component-nodes Phase 2 viewers, agent-presence extensions, MCP tool exposure of upload, etc.).

## Outcomes (in user terms — to be refined post-worldmodel)

- "When I write the next HTTP route, I shouldn't have to invent the error shape — there's one canonical pattern I can copy."
- "When I add a new variant to a discriminated union, the compiler points to every consumer that needs updating, not just some of them."
- "When viewer plugins start registering against `AssetViewerRegistry`, I don't have to retrofit ordering / unregister mechanics later."
- "When I add an IPC channel, the reason-union policy is documented once, not re-derived per channel."

## What's NOT in the user's framing

- No public-API trigger named (no imminent SDK generation, no public docs ship). RFC 9457 Problem Details + Idempotency-Key support stay deferred.
- No third-party descriptor registration named. `PropDef` Zod-ification stays deferred unless surfaces.
- No specific perf or scale concern surfaced. Streaming dedup hash optimization stays a perf-engineering item, not contract hardening.

## Open elicitation gap

User did not name *which specific next-round capability work* is on deck. Worldmodel will scan recent commits, open PRs, and `STORIES.md` / `PROJECT.md` / `stories/` for concretely-planned next work that touches the audited surfaces.
