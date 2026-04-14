---
name: Observability pattern for parse events
description: Industry research grounding the R14 design choice (structured stderr + aggregate counter, not Y.Map per-doc event log). Explicit record because codebase patterns are AI-generated and shouldn't anchor decisions.
date: 2026-04-13
sources:
  - ~/.claude/oss-repos/outline/server/collaboration/MetricsExtension.ts
  - ~/.claude/oss-repos/outline/server/collaboration/PersistenceExtension.ts
  - ~/.claude/oss-repos/blocksuite/packages/affine/shared/src/adapters/markdown/markdown.ts
  - https://biomejs.dev/guides/migrate-eslint-prettier/
  - https://docs.astro.build/en/reference/error-reference/
  - https://github.com/evanw/esbuild/issues/3348
  - https://forum.obsidian.md/t/how-to-access-the-console/67416
---

# Observability pattern: why R14 uses stderr + aggregate counter, NOT per-doc Y.Map

## The question

For MDX parse-failure events (R6 block-level fallback firing, R13 y-prosemirror schema-throw patch firing), what observability pattern is architecturally correct?

Candidates considered:
1. Aggregate counters only (matches existing `metrics.ts`)
2. Per-doc `Y.Map('parse-events')` (matches existing `Y.Map('conflicts')` pattern)
3. Both aggregate + per-doc
4. OpenTelemetry / external pipeline

## Why the codebase's patterns aren't authoritative

The existing `packages/server/src/metrics.ts` (aggregate) and `Y.Map('conflicts')` / `Y.Map('lifecycle')` / `Y.Map('activity')` patterns are AI-agent-generated. They work and they're real; but they haven't been subjected to "would two staff engineers design this the same way from scratch" pressure. So anchoring R14 on "matches the conflicts pattern" is a weak argument.

## What production CRDT editors actually do

**Outline** (37K stars, production Yjs + Postgres ProseMirror):
- `server/collaboration/MetricsExtension.ts:12-71` emits StatsD counters for operational events (`collaboration.load_document`, `.change`, `.connect`) — never for parse/conversion.
- `server/collaboration/PersistenceExtension.ts:138` on persistence failure: `Logger.error("Unable to persist document", err, {...})`. No event into Y.Doc.
- `ProsemirrorHelper.toYDoc()` is unguarded — if it throws, the connection fails and Sentry catches it.
- Stack: `winston` structured logs + StatsD + Sentry. No CRDT-embedded event log.

**BlockSuite / AFFiNE** (67K stars, CRDT-native):
- `packages/affine/shared/src/adapters/markdown/markdown.ts:213`: bare `processor.parse(markdown)`. No try/catch, no event emission.
- `telemetry-service` is application-level product analytics (feature usage), not a parse-error channel.

**Tiptap, Milkdown**: throw on parse failure. No onError hook, no event log.

**Hocuspocus**: zero telemetry dependencies in core.

**Universal pattern**: production CRDT editors treat parse/conversion as a pure function — either succeeds or throws. Failures → structured logs → exception tracking. The CRDT is for document state, not parse telemetry.

## What CLI dev tools do

All use structured stderr + exit codes. None ship metrics endpoints.

- **esbuild**: stderr + exit code. Explicitly declines OTEL embedding ([issue #3348](https://github.com/evanw/esbuild/issues/3348)).
- **Biome, Prettier, ESLint**: single binary, diagnostics to stderr.
- **Vite, Astro**: build errors with source location + code frame to stderr. Astro's [error reference](https://docs.astro.build/en/reference/error-reference/) documents errors as exit-code-based, not metrics-based.
- **Obsidian** (1.5M users): toast banner + plugin logs to devtools console.
- **MDXEditor**: `onError` callback for embedding apps to opt in.

Our product (`@inkeep/open-knowledge` CLI on npm) is in this reference class, not the Datadog-instrumented-SaaS class.

## Why per-doc `Y.Map` is wrong for parse events specifically

1. **CRDT replication cost.** Every peer receives every event forever. Y.Doc state grows monotonically. A document with 500 historical parse warnings pays that cost on every new peer's initial sync payload.

2. **No consumer justifies the cost.** The stated potential consumer ("hypothetical future debug panel") isn't a consumer — it's a maybe. The dominant design principle in CRDT systems: **put in the CRDT only what needs multi-peer convergence.** Parse failures don't need convergence; each client reparses the source and arrives at the same result independently.

3. **Schema drift.** Structured event entries in a Y.Map become a de facto schema subject to CRDT backward-compatibility rules. Changing the shape of `parse-events` entries becomes a migration problem because old peers may hold old entries. Aggregate counters in server memory have zero schema commitment.

4. **Confuses two surfaces.** `Y.Map('activity')` is legitimate because remote peers need CRDT sync for line-flash decorations — real per-peer UI consumer. Parse failures have no analogous per-peer UI need. The `rawMdxFallback` node in `XmlFragment` already propagates visually to peers; no separate event log needed.

## The R14 design that emerged

| Channel | Consumer | Shape |
|---|---|---|
| `console.warn` at event site | Local dev: dev-server console. Hosted: stderr piped to operator's log aggregator. | Structured JSON matching dev-tool convention: `{ event, docName, offset/reason/cascade }` |
| Aggregate counter in `metrics.ts` | Tests (assert R6/R13 fired); optional ops dashboard via `/api/metrics/parse-health` | Named counters matching existing `reconciliation` pattern |
| `rawMdxFallback` node in XmlFragment | End user sees R7 chrome inline | Already in R5/R7 — peer-visible via CRDT |
| **NOT** `Y.Map('parse-events')` | — | — |
| **NOT** OpenTelemetry | — | Customer-hostile for local CLI |

Clean separation:
- **Y.Doc** = document content (needs peer convergence)
- **Server memory** = operational counters (aggregate, ops-consumable)
- **stderr** = developer-facing warnings (per-event, non-replicated, no schema commitment)

## Adjacent finding (not scope-creep, but worth flagging)

The research's adversarial pass raised a legitimate question about `Y.Map('conflicts')` as it exists today. A conflict resolution surface that's per-doc AND has a per-peer UI consumer IS a Y.Map candidate, but only if peers need to coordinate on which blocks are in conflict. If the server is the authoritative conflict arbiter and clients just need a read-only view, `Y.Map('conflicts')` could instead be a server-owned state surfaced via HTTP.

This spec doesn't touch that. But if the parallel Observer A spec's `Y.Map('safety-events')` proposal is re-examined, the same question applies there: is there a real per-peer UI consumer, or is it per-doc forensics that could equally be a server-side log?

Not our spec's problem to solve. Flagging in case either spec is still live.
