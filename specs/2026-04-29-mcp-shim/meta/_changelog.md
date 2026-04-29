# Changelog — 2026-04-29 mcp-shim spec

## 2026-04-29 — Initial spec drafted from todo.txt

- Structured the existing analysis in `todo.txt` into `SPEC.md` (sections 1–14).
- Pre-decisions from the todo recorded in §9 Decision Log: D-1..D-8.
- Remaining judgment calls surfaced in §10 Open Questions: OQ-1..OQ-5.
- Verified the load-bearing claims in the todo against the codebase before structuring:
  - `mcp-http.ts:6-8` does the cross-package import — confirmed.
  - `preview-url.ts:29` carries the relative-path workaround — confirmed.
  - `decideAutoStart` / `ensureServerRunning` / `createProjectServerUrlResolver` /
    `classifyMcpLaunchPath` / `describeProtocolMismatchRemedy` are only referenced
    inside `server-discovery.ts` (and its test) — confirmed.
  - `protocolVersion` field on `ServerLockMetadata` is only consumed by
    `server-discovery.ts:209-260` — confirmed.
  - `computeForce` / `isHistoricalNpxVariant` / `isPriorCliPathShape` exist in
    `desktop/src/main/mcp-wiring.ts` — confirmed.
- LOC numbers in the todo (cli/src/mcp/server.ts ~395; server-discovery.ts ~637;
  shim.ts 260; mcp-http.ts 221) verified via `wc -l`.

## 2026-04-29 — OQ-1..OQ-4 resolved

- OQ-1 → D-9: schema + path helpers move to `packages/server`.
- OQ-2 → D-10: identity from `clientInfo.name` (verified mandatory in MCP SDK
  schema — `clientInfo: ZodObject`, `name: ZodString`, neither optional);
  `connectionId` disambiguates same-name sessions; `AGENT_LABEL` removed.
- OQ-3 → D-11: drop parent-death watch entirely; `idle-shutdown.ts` is the
  sole teardown trigger.
- OQ-4 → D-12: bundle IS-1 + IS-2 in one PR. The interlock is real —
  `server-discovery.ts:209-260` is the only reader of `lock.protocolVersion`,
  so removing the field requires deleting that code first; splitting buys
  nothing and risks a stranded field.

IS-6 and IS-8 acceptance criteria updated to reflect the chosen mechanisms.

## Carry-forward

- OQ-5 (parseSpawnTimeoutEnv location) is P2, non-blocking — implementer's call.
- IS-12 stream-timing risk (R-5) flagged for the implementer.

Spec is ready for /implement starting at phase P1 (IS-1 + IS-2 bundled).
