---
name: migration-blast-radius
description: L2 surface map of every read/write site for Y.Map('metadata')['frontmatter'] across the codebase, with migration-risk classification and sequencing for D2 (per-key Y.Map storage). Investigation only — does not propose new shape, UX, or governance.
type: spec-evidence
sources:
  - packages/core/src/bridge/frontmatter-y.ts
  - packages/core/src/extensions/frontmatter.ts
  - packages/server/src/server-observers.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/external-change.ts
  - packages/server/src/persistence.ts
  - packages/server/src/page-identity.ts
  - packages/server/src/live-derived-index.ts
  - packages/server/src/suggest-links.ts
  - packages/server/src/standalone.ts
  - packages/server/src/backlink-index.ts
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/components/EditorArea.tsx
  - packages/app/tests/integration/test-harness.ts
  - packages/app/tests/integration/attribution-sweep-coverage.test.ts
  - packages/cli/src/utils/frontmatter.ts
date: 2026-04-24
---

# Migration blast radius — Y.Map('metadata') single-string → per-key

This file maps every code site that reads or writes `Y.Map('metadata')['frontmatter']` today and classifies its migration risk under D2 (per-key Y.Map storage). Investigation is L2: each site has a precise line range, role classification, writer category (per CLAUDE.md precedent #25), composes-full-string vs. structured-data flag, risk class, and sequencing notes.

Out of scope per the explore brief: new shape design, form UX, governance panel (NG1-NG3), cross-doc concerns.

## Summary

- **27 distinct touch sites**, of which **9 production** read or write `Y.Map('metadata')` directly and **~10 production** flow through `prependFrontmatter` / `stripFrontmatter` on the composed full string.
- **Two YAML parsers coexist**: a regex-based extractor in `packages/server/src/page-identity.ts` (no `yaml` dependency, regex-only, supports `key: value`, inline `[a, b]`, and indented block lists) AND a real `yaml` 2.x parser in `packages/cli/src/utils/frontmatter.ts` (Zod-validated, full YAML 1.2). Server reads use the regex parser; CLI uses the proper parser. The CRDT layer **never** parses YAML — the string is passed through opaquely.
- **`applyAgentMarkdownWrite` is frontmatter-aware** (`packages/server/src/agent-sessions.ts:110-182`). It splits payload via `stripFrontmatter`, conditionally promotes payload FM to canonical FM under `'replace'` semantics, and writes `metaMap.set('frontmatter', ...)` only if changed. Body and FM are written in the same outer `doc.transact(..., session.origin)` block — the paired-write contract holds.
- **The patch handler at `api-extension.ts:2106-2148` is the highest-risk site.** It composes `prependFrontmatter(currentFm, currentBody)` into a single string, performs an `indexOf(find)` character-level splice across the FM/body boundary, then re-splits via `stripFrontmatter(newFull)` and writes `metaMap.set('frontmatter', newFm)`. Per-key storage breaks this model — there is no single string to splice.
- **Bridge invariant I1 is composed-string-shaped.** `attachBridgeInvariantWatcher` (`test-harness.ts:818-826`) asserts `normalizeBridge(ytext) === normalizeBridge(prependFrontmatter(fm, serialize(fragment)))`. Per-key migration must keep producing a canonical YAML string for the watcher to remain meaningful, OR the invariant must be reformulated.
- **All Y.Text serialization paths concatenate `prependFrontmatter(fm, body)`.** Y.Text continues to be the single linearized form; per-key storage is a Y.Map-only concern as long as Observer A's "compose YAML string for Y.Text mirroring" stays intact. Y.Text is never read as structured frontmatter.

## Site-by-site table

Legend:
- **Role**: `R` = read, `W` = write, `RW` = both
- **Writer** (precedent #25): `agent` = agent-<connId> (per-session origin), `principal` = principal-<UUID>, `fs` = file-system, `git` = git-upstream, `svc` = openknowledge-service, `obs` = observer-sync (cross-CRDT bridge, internal), `none` = read-only
- **Shape**: `string` = treats FM as a single YAML string, `regex` = pulls scalars via regex without parsing, `passthrough` = reads `metaMap.get('frontmatter')` and forwards opaquely
- **Risk**:
  - `H` (high): assumes single-string in a way that breaks under per-key storage
  - `M` (medium): goes through an abstraction (`getFrontmatter`, `prependFrontmatter`) that can absorb the change but needs a contract decision
  - `L` (low): purely opaque pass-through; no migration impact if the abstraction layer keeps the same surface

| # | File | Lines | Role | Writer | Shape | Composes? | Risk | Notes |
|---|------|-------|------|--------|-------|-----------|------|-------|
| 1 | `packages/core/src/bridge/frontmatter-y.ts` | 15-19 | R | none | string | yes (caller) | M | Canonical reader. Returns `string`. Decision: keep returning string OR add `getFrontmatterMap`. |
| 2 | `packages/core/src/extensions/frontmatter.ts` | 8-24 | — | — | string | yes | M | Pure utilities `stripFrontmatter` / `prependFrontmatter`. Regex `/^---\r?\n([\s\S]*?\r?\n)?---(\r?\n|$)/`. Body+FM split. Per-key needs serialize-on-demand for Y.Text mirroring. |
| 3 | `packages/server/src/server-observers.ts` (Observer A) | 320-414, 421-454, 456-477 | RW | obs | string | yes | **H** | Composes `prependFrontmatter(getFrontmatter(doc), body)` for Y.Text mirroring. Baseline `lastSyncedXmlMd` is the composed full string. Bridge invariant I1, item-preservation, and Path A/B merge all hinge on this composed shape. Under per-key storage, must serialize per-key Y.Map to canonical YAML on every fire. Risk: differing serialization output (key order, quoting, trailing whitespace) makes I1 flap. |
| 4 | `packages/server/src/server-observers.ts` (Observer B) | 490-612, 619-649 | RW | obs | string | yes | **H** | Strips FM from Y.Text, sets `metaMap.set('frontmatter', frontmatter)` as the single key. Fast-path early-exit at 506-516 compares baseline strings. Per-key requires: (a) parse stripped YAML → Y.Map per-key; (b) decide reconciliation strategy when CRDT per-key state diverges from incoming Y.Text YAML. **STOP rule**: cross-CRDT writes must use `OBSERVER_SYNC_ORIGIN` — applies equally to per-key writes. |
| 5 | `packages/server/src/api-extension.ts` (patch handler) | 2106-2148 | RW | agent | string | yes | **H** | Composes `prependFrontmatter(currentFm, currentBody)`, runs `indexOf(find)` across FM/body, splices at character level, re-splits via `stripFrontmatter`. **Cannot survive per-key without redesign.** A patch that targets `title:` line text has no per-key analogue — it crosses the boundary. Decision needed: forbid FM patches (route to property writes) OR define a "patch composes a virtual full string per-fire and re-derives per-key on commit" mode. |
| 6 | `packages/server/src/api-extension.ts` (`handleAgentWriteMd`) | 1473-1620 | RW | agent | string | yes (via `applyAgentMarkdownWrite`) | M | Delegates to `applyAgentMarkdownWrite` — frontmatter handling is centralized there. No direct `metaMap.set` here. Migrates with site #11. |
| 7 | `packages/server/src/api-extension.ts` (`readFrontmatterMetadataForDocName`) | 761-782 | R | none | regex | no | M | Reads `metaMap.get('frontmatter')`, falls back to disk, parses via `parseFrontmatterMetadata` (regex-only). Used by graph render at L1889. Under per-key, can read the structured form directly — but disk fallback still hits the regex parser. Two-shape support needed during transition. |
| 8 | `packages/server/src/api-extension.ts` (rollback handler) | 2984-3004 | RW | agent (with `agentId`) / principal (UI) | string | yes | M | `stripFrontmatter(markdown)` from git, then `metaMap.set('frontmatter', frontmatter)` under `ROLLBACK_ORIGIN` (paired). On per-key: must parse YAML and replace per-key state. STOP-rule guard at handler entry must be preserved. |
| 9 | `packages/server/src/api-extension.ts` (managed rename rewrite) | 411-430, 1063 | RW | agent (with `agentId`) | string | yes | L | `rewriteSupportedLinksForDocumentRename`: splits via `stripFrontmatter`, only mutates body, recomposes via `prependFrontmatter`. Doesn't touch `metaMap` — body-only rewrite. Per-key migration safe; just ensure FM is preserved bytewise across rewrite. |
| 10 | `packages/server/src/api-extension.ts` (handleDiff) | 2840-2841 | R | none | string | yes | L | `stripFrontmatter` to body-only diff. Read-only. Safe. |
| 11 | `packages/server/src/agent-sessions.ts` (`applyAgentMarkdownWrite`) | 110-182 | RW | agent | string | yes | **H** | Splits agent payload via `stripFrontmatter`, composes `finalFm` (replace: payloadFm OR existingFm; prepend/append: existingFm). Writes `metaMap.set('frontmatter', finalFm)` if changed. Per-key migration is non-trivial: payloadFm is a YAML string from the agent — the helper must parse, diff per-key, and apply per-key updates while preserving the single `doc.transact(..., session.origin)` block. **Paired-write contract**: both Y.Text and XmlFragment are written in the same transaction, and the same must hold for per-key Y.Map writes. |
| 12 | `packages/server/src/agent-sessions.ts` (`applyAgentUndo`) | 222-269 | RW | agent (undoOrigin) | string | yes | M | Post-undo, parses `ytext.toString()` via `stripFrontmatter`, sets `metaMap.set('frontmatter', finalFm)`. The UndoManager already tracks `getMap('metadata')` (line 472) — under per-key, UM tracks per-key writes natively (Y.UndoManager handles Y.Map deeply), so undo of per-key updates works. The reconciliation step (post-undo "make XmlFragment match Y.Text") still needs to know how to derive per-key state from the YAML in Y.Text. |
| 13 | `packages/server/src/agent-sessions.ts` (UndoManager scope) | 469-481 | — | — | passthrough | no | L | UM tracks `[Y.Text, Y.Map('metadata'), Y.Map('agent-flash')]`. Y.UndoManager handles nested Y.Map mutations; per-key migration "just works" for undo as long as writes happen under `session.origin`. |
| 14 | `packages/server/src/external-change.ts` (`applyExternalChange`) | 57-98 | W | fs | string | yes | M | File-watcher path. `stripFrontmatter(content)` → `metaMap.set('frontmatter', frontmatter)` under `FILE_WATCHER_ORIGIN` (paired). On per-key: parse YAML → reset per-key Y.Map state. Disk is the source of truth — must overwrite per-key state to match disk YAML. STOP rule: `skipStoreHooks: true` to prevent feedback loops. |
| 15 | `packages/server/src/persistence.ts` (`onLoadDocument`) | 603-654 | RW | svc (load) | string | yes | M | Reads disk, `stripFrontmatter(raw)`, sets `frontmatterCache.set(documentName, frontmatter)` AND `metaMap.set('frontmatter', frontmatter)`. Per-key: parse YAML → bulk per-key write. The frontmatterCache is a parallel string cache — on per-key migration, decide whether to keep it (single-source: Y.Map) or remove. |
| 16 | `packages/server/src/persistence.ts` (`onStoreDocument`) | 681-685 | R | svc (store) | string (passthrough) | yes | M | Reads `metaMap.get('frontmatter')`, falls back to `frontmatterCache.get(documentName)` (line 684). Per-key: serialize per-key Y.Map → YAML string for disk. **YAML serialization choice is load-bearing**: round-trip stability requires deterministic key order, quoting, and whitespace. The `yaml` 2.x library (already in `packages/server/package.json`) is the natural choice. |
| 17 | `packages/server/src/page-identity.ts` (`extractPageTitle`, `extractPageAliases`) | 82-137 | R | none | regex | no (operates on FM string) | M | Regex-based extraction of `title:`, `aliases:` from raw YAML string. Used by managed rename and other page-identity flows. Per-key: read directly from per-key Y.Map; fallback path (disk-only contexts) keeps regex parser OR migrates to `yaml` library. |
| 18 | `packages/server/src/page-identity.ts` (`parseFrontmatterMetadata`) | 139-196 | R | none | regex | no | L | Returns `{cluster, category, tags}`. Used by `readFrontmatterMetadataForDocName`. Per-key: trivially adapted to read per-key Y.Map. |
| 19 | `packages/server/src/live-derived-index.ts` (`serializeLiveDocument`) | 28-34 | R | none | string | yes | L | Reads `metaMap.get('frontmatter')`, prepends to body for backlink-index input. `getFrontmatter(doc)` would centralize. Migrates with site #1. |
| 20 | `packages/server/src/suggest-links.ts` (`serializeLiveDocument`) | 499-505 | R | none | string | yes | L | Identical pattern to site #19. Migrates with #1. |
| 21 | `packages/server/src/suggest-links.ts` (`scanMarkdownForMentions`) | 449-450 | R | none | string | yes | L | `stripFrontmatter` to compute body offsets. `bodyStartOffset = frontmatter.length` — depends on FM byte length. Per-key: serialize per-key → measure length; or restructure offset accounting. Low blast since it operates on already-composed markdown strings, not Y.Map. |
| 22 | `packages/server/src/standalone.ts` (`serializeDoc`) | 367-377 | R | none | string | yes | L | Reads `metaMap.get('frontmatter')`, prepends. Migrates with #1. |
| 23 | `packages/server/src/backlink-index.ts` (`updateDocumentFromMarkdown`) | 836-840 | R | none | string | yes | L | Receives composed markdown, body-only scan. No `metaMap` touch. Per-key callers must compose before calling. |
| 24 | `packages/app/src/editor/TiptapEditor.tsx` | 624-638 | R | none | passthrough | no | M | `metaMap.observe(observer)` — caches `frontmatter` string in `frontmatterRef`. Per-key: observe the Y.Map directly; per-key changes fire one observer event per key. Decision: keep ref shape OR migrate consumers. (Currently the cached value isn't read elsewhere in this file — a downstream consumer would need confirming.) |
| 25 | `packages/app/src/components/EditorArea.tsx` | 143-146 | R | none | string | yes | L | `stripFrontmatter` on Y.Text(`source`) and historical content. Body-only diff. Y.Text continues to carry composed YAML under per-key, so this is unchanged. |
| 26 | `packages/app/tests/integration/test-harness.ts` (`getServerState`, `attachBridgeInvariantWatcher`) | 717-734, 791-829 | R | none | string | yes | **H** | `attachBridgeInvariantWatcher` asserts I1 as composed-string equality (line 819-826: `prependFrontmatter(fm, fragBody)`). Per-key: either (a) keep watcher composing the YAML string (canonical serialization required) OR (b) reformulate I1 to assert per-key Y.Map equality with stripped Y.Text. Choice affects all bridge-correctness tests. |
| 27 | `packages/app/tests/integration/attribution-sweep-coverage.test.ts` | 1-126 | — | — | — | no | M | Static analysis of `api-extension.ts` route registry. **Future form-driven write endpoints must be added to `REQUIRED_HANDLERS` (line 16) AND must call `extractAgentIdentity` per precedent #24 (D42).** No code change here for storage migration; affected only when the spec adds a new route (e.g. `handleSetProperty`). |

## Test sites (FYI — must update with migration but don't shape contract)

| File | Role |
|---|------|
| `packages/server/src/server-observers.test.ts` | Asserts current single-string Observer A/B contract |
| `packages/server/src/api-agent-frontmatter.test.ts` | 11 occurrences — all assert `metaMap.get('frontmatter')` as single string after agent writes |
| `packages/server/src/external-change.test.ts` | Asserts file-watcher → metaMap sync |
| `packages/server/src/page-identity.test.ts` | YAML regex parser tests |
| `packages/app/src/editor/observers.test.ts` | Client observer baseline tracking |
| `packages/app/tests/integration/session-undo-manager.test.ts` | Asserts UM tracks metaMap |
| `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` | I1-I11 PBTs — composed-string shape baked in |

## Bridge invariants I1-I11 — impact on migration

Per `CLAUDE.md` "Editor substrate" section, three runtime invariants:

1. **Bridge invariant** (I1 / R-watcher): `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`. The watcher (`test-harness.ts:818-826`) implements this as `normalizeBridge(ytext) === normalizeBridge(prependFrontmatter(fm, serialize(fragment)))` — explicitly composed. **Per-key migration risk**: watcher must compose YAML on every check; serializer must be deterministic. If `yaml.stringify(perKeyMap)` produces different bytes than the original disk-side YAML (key reordering, quote-style normalization, indent style), the watcher will report violations on round-trip. **Mitigation**: bake canonical serialization into `getFrontmatter(doc): string` and verify `parse(serialize(perKeyMap)) === perKeyMap` round-trip.

2. **Baseline invariant** (Observer A): `lastSyncedXmlMd` matches current XmlFragment + FM serialization. **Per-key risk**: every per-key Y.Map mutation must trigger a baseline refresh — Observer A currently only refreshes on XmlFragment events. If a form sets a property without touching XmlFragment, Observer A's baseline goes stale and Path B's three-way merge gets a wrong reference. **Mitigation**: Observer A must observe Y.Map('metadata') deep changes too, or the paired-write origin contract must be expanded to include per-key writes.

3. **Item-preservation invariant**: Sync ops must not replace Items at matching positions. **Per-key risk**: low — frontmatter is in Y.Map, not Y.XmlFragment, so Item identity is unaffected.

The PBTs in `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` (Chain C: `stripFrontmatter → parseWithFallback → updateYFragment`, plus reconstitution via `prependFrontmatter`) all operate on the composed string. Any per-key migration must ship a parallel set of PBTs that assert per-key equivalence after round-trip.

## Observer A & B contract changes

**Observer A** (`server-observers.ts:319-454`):
- Today: reads `getFrontmatter(doc)` (single string); writes Y.Text via `applyIncrementalDiff` or `applyFastDiff` after composing `prependFrontmatter(fm, body)`.
- Per-key contract change: `getFrontmatter(doc)` continues to return a string but synthesizes it from per-key Y.Map. Trigger gating (`xmlDirty` flag) must extend to detect per-key mutations OR the per-key writer paired-origin contract must short-circuit Observer A's baseline refresh symmetrically (analogous to `isPairedWriteOrigin` branch at L433-451).

**Observer B** (`server-observers.ts:490-649`):
- Today: `stripFrontmatter(md)` extracts string FM; `metaMap.set('frontmatter', frontmatter)` writes the slot.
- Per-key contract change: must parse stripped YAML and reconcile with per-key Y.Map. **Conflict resolution decision**: when a user types in source mode (Y.Text mirror) AND a form writes a per-key value concurrently, which wins? Today Y.Text wins on debounce. Per-key needs a defined merge: parse Y.Text YAML → diff per-key against Y.Map state → apply only adds/removes (CRDT-friendly). Naive `clear() + setAll()` causes per-key clientID churn and breaks UM attribution.
- Fast-path early-exit (L506-516): currently compares string FM. Under per-key, comparing serialized YAML strings still works but is wasteful.

## MCP write paths — impact summary

| Endpoint | Handler | Touches metaMap | Migration |
|----------|---------|-----------------|-----------|
| `POST /api/agent-write-md` | `handleAgentWriteMd` (L1473) | via `applyAgentMarkdownWrite` | indirect — migrate the helper |
| `POST /api/agent-patch` | `handleAgentPatch` (L2013, body L2106-2148) | yes — direct `metaMap.set` after FM/body re-split | **Highest risk: redesign required** |
| `POST /api/agent-undo` | `handleAgentUndo` (L2239) | via `applyAgentUndo` | indirect — migrate the helper; UM compatibility free |
| `POST /api/save-version` | `handleSaveVersion` | does not touch metaMap | none |
| `POST /api/rollback` | `handleRollback` (L2984) | yes — `metaMap.set` from git content | reformulate as parse-and-apply |
| `POST /api/rename` | `handleRename` (links to `rewriteSupportedLinksForDocumentRename`) | no (body-only rewrite) | none |
| `POST /api/create-page` | `handleCreatePage` | minimal | low |

## YAML library + tolerance

| Library | Where | Used for | Tolerance |
|---------|-------|----------|-----------|
| **None (regex-only)** | `packages/server/src/page-identity.ts` | `extractPageTitle`, `extractPageAliases`, `parseFrontmatterMetadata`. Server reads frontmatter scalars and arrays via line-by-line regex. | `key: value` scalars (with optional quotes), inline `[a, b]` arrays, indented `- item` block lists. **Does not** parse anchors, multi-line scalars, comments, custom tags, or any non-trivial YAML. |
| **`yaml` 2.x** | `packages/cli/src/utils/frontmatter.ts` (parseFrontmatter / serializeFrontmatter), `packages/cli/src/auth/token-store.ts`, `packages/cli/src/config/loader.ts`, `packages/server/src/seed/{plan,apply}.ts`, `packages/app/src/server/hocuspocus-plugin.ts` | Config loading, seed scaffolding, dev plugin. Real YAML 1.2 parsing with Zod validation. | Full YAML 1.2: anchors, multi-line, comments (preserved by `parseDocument`), custom tags. |
| **None (CRDT layer)** | `packages/core/src/extensions/frontmatter.ts` | `stripFrontmatter`, `prependFrontmatter`. Pure regex split + concat. No parsing. | N/A — opaque pass-through. |

The `yaml` package is already a dependency in `packages/server/package.json`, `packages/cli/package.json`, `packages/app/package.json` (versions pinned at `^2.7.1` / `^2.8.3`). No new dependency cost to use it for per-key serialization. **However**, the regex parser in `page-identity.ts` is intentionally narrow — it tolerates malformed YAML by silently returning `undefined` for missing fields. If migration switches that path to the real `yaml` library, error semantics change: malformed YAML throws instead of returning `undefined`. The fail-closed regex behavior is load-bearing for graph-display surfaces that accept any frontmatter.

**`yaml` library quirks that affect per-key round-trip**:
- Default `parse(...)` returns plain JS objects/arrays. Comments are dropped.
- `parseDocument(...)` retains comments and preserves source order via `Document.contents` — required if the spec wants comment preservation.
- `stringify(...)` reorders keys alphabetically by default unless `sortMapEntries: false` is passed.
- Single-quoted vs. double-quoted vs. unquoted scalar choice can differ from disk source — produces noise diffs unless disk is canonicalized once on-load.
- Multi-line literal blocks (`|`, `>`) and folded scalars are roundtrip-able via `parseDocument` but easy to corrupt with `parse → stringify`.

## Sequencing recommendation

A safe migration order, derived from the dependency graph:

**Phase 0: Add the abstraction (no behavior change)**
1. Extend `packages/core/src/bridge/frontmatter-y.ts` to expose both `getFrontmatter(doc): string` (preserved contract) and `getFrontmatterMap(doc): Record<string, unknown>` (new structured reader). Both read from a single new schema location (e.g. `metaMap.get('properties')` as a Y.Map<string, Y.value>, with `frontmatter` as a derived YAML serialization).
2. Add `setFrontmatterFromYaml(doc, yaml: string)` and `setFrontmatterProperty(doc, key, value)` writer helpers — single API-boundary point analogous to `applyAgentMarkdownWrite` for body writes (mirrors precedent #10's pattern). Add a `recordContributor`-style attribution call inside.
3. Pick canonical YAML serialization (recommend `yaml@2.x` with explicit options: `sortMapEntries: false`, default scalar style, no anchors). Add a unit-test PBT: `parse(serialize(map)) === map` AND `serialize(parse(yamlStr)) === normalize(yamlStr)`.

**Phase 1: Migrate write paths to use the helpers (still single-string-on-wire)**
4. Convert `applyAgentMarkdownWrite` (`agent-sessions.ts:110-182`) to call the new helpers. It accepts a YAML string today — internally parse it and call `setFrontmatterFromYaml`. Behavior identical, indirection added.
5. Convert `applyExternalChange` (`external-change.ts:57-98`) to use `setFrontmatterFromYaml`. Same pattern.
6. Convert `persistence.ts:onLoadDocument` (L603-654) to use `setFrontmatterFromYaml`. Drop `frontmatterCache` once Y.Map is the single source.
7. Convert `persistence.ts:onStoreDocument` (L681-685) to read via `getFrontmatter(doc): string` (synthesized YAML from per-key Map). Round-trip test for byte stability.
8. Convert `handleRollback` (`api-extension.ts:2984-3004`) to use `setFrontmatterFromYaml` under `ROLLBACK_ORIGIN`.

**Phase 2: Observer migration**
9. Update Observer A (`server-observers.ts:319-454`) to: (a) read FM via `getFrontmatter(doc)` (already does); (b) observe `Y.Map('metadata')` deep changes and refresh `lastSyncedXmlMd` baseline; (c) preserve paired-write short-circuit semantics for new per-key origins.
10. Update Observer B (`server-observers.ts:490-649`) to parse stripped YAML and apply per-key diffs to Y.Map (not bulk replace). Add an early-exit when YAML parse fails (transient mid-edit YAML is invalid; XmlFragment keeps last valid state).

**Phase 3: Patch handler redesign**
11. **The patch handler at `api-extension.ts:2106-2148` cannot survive per-key without a redesign decision.** Options:
    - (a) Forbid patches that touch FM region; route FM updates to a new `setFrontmatterProperty` endpoint.
    - (b) Compose virtual full-string per-fire (`prependFrontmatter(serialize(perKeyMap), body)`), do the splice, re-parse FM region into per-key updates.
    - (c) Route patches whose `find` text matches FM lines to per-key writes; body-only patches stay as-is.
    Decision needed before this site can move.

**Phase 4: Form write surface**
12. Add `handleSetProperty` (or similar) HTTP route. Add to `REQUIRED_HANDLERS` in `attribution-sweep-coverage.test.ts:16`. Must call `extractAgentIdentity` (precedent #24, D42). Use `setFrontmatterProperty` helper internally.
13. Wire form UX in `packages/app/` with `Y.Map('metadata')` observer for live updates.

**Phase 5: Read-only consumers cleanup**
14. Convert `live-derived-index.ts`, `suggest-links.ts`, `standalone.ts` to use `getFrontmatter(doc)` from `frontmatter-y.ts` instead of inlined `metaMap.get('frontmatter')`.
15. Convert `readFrontmatterMetadataForDocName` (`api-extension.ts:761-782`) to read from per-key Y.Map directly (avoid YAML re-parse); keep regex disk-fallback for closed-doc reads OR migrate the disk-side fallback to `yaml` 2.x.
16. Update `TiptapEditor.tsx:624-638` if structured access is needed by downstream consumers.

**Phase 6: Test infrastructure**
17. Update `attachBridgeInvariantWatcher` (`test-harness.ts:791-829`) — keep composed-string equality (recommended) so I1 stays unchanged; canonical YAML serialization carries the burden.
18. Update PBTs in `bridge-observer-conversion.test.ts` to also assert per-key Y.Map round-trip.
19. Update `api-agent-frontmatter.test.ts` to assert per-key state (additive; keep string-based assertions until Observer B is fully migrated).

## Sites that must change together (atomic groups)

- **Group A (single PR, recommended)**: sites #1 + #2 (`getFrontmatter`, `stripFrontmatter` / `prependFrontmatter` extension to per-key-aware). All callers see no behavior change; new structured readers exist alongside.
- **Group B**: sites #14 (`applyExternalChange`) + #15 (`onLoadDocument`) + #16 (`onStoreDocument`). The disk → Y.Doc → disk cycle must be byte-stable. If only one of these changes, round-trip diverges.
- **Group C**: sites #3 + #4 (Observer A + B). Observer A and B are dispatched together via `afterAllTransactions`; their baselines must agree. Migrating one without the other guarantees flap.
- **Group D**: site #5 (patch handler) requires #11 (`applyAgentMarkdownWrite`) to already accept structured input. Patch handler is downstream.
- **Group E**: site #11 + #12 (`applyAgentMarkdownWrite` and `applyAgentUndo`). Both compose `prependFrontmatter(finalFm, canonicalBody)` for Y.Text mirroring; they share the bridge-mirror pattern.

## Sites that can change independently

- All read-only consumers (#7, #18, #19, #20, #21, #22, #23, #24, #25). Each can switch to `getFrontmatterMap(doc)` independently as long as the abstraction is in place.
- Site #9 (managed rename rewrite) — body-only, no metaMap touch.
- Site #10 (handleDiff) — read-only string operation.
- Site #27 (attribution-sweep-coverage.test.ts) — only changes when new routes are added.

## Contract surfaces requiring explicit decisions

1. **`getFrontmatter(doc)` return shape**: keep `string` (synthesized on demand), add `getFrontmatterMap`, or replace? Recommend: keep `string` + add structured reader. ~22 callers depend on the string shape.
2. **Canonical YAML serialization**: which library, which options? Recommend `yaml@2.x` with `sortMapEntries: false`, default scalar style. Output stability is load-bearing for I1.
3. **Disk → per-key reconciliation strategy**: bulk-replace (clear + set all), per-key diff (parse YAML, compute add/remove/modify per key), or two-phase (snapshot + diff)? Affects per-key clientID churn and UM attribution.
4. **Y.Text → per-key reconciliation in Observer B**: same question. Today Y.Text wins on parse; under per-key, define merge with concurrent form writes.
5. **Patch handler scope**: forbid FM patches, redesign as virtual-string splice, or route by content? Decision shapes whether `applyAgentMarkdownWrite` needs to accept per-key updates as a payload variant.
6. **Frontmatter cache (`persistence.ts`) lifecycle**: keep as a fallback or remove (single source: Y.Map)? Removal simplifies; keeping handles the "doc never opened" case that currently uses `frontmatterCache`.
7. **Attribution for form-driven writes**: define a new origin (e.g. `FORM_WRITE_ORIGIN` paired) or use the per-session agent origin? Per-key writes from a form must satisfy paired-write contract for Observer A/B short-circuit.
8. **Comment preservation in YAML**: does the spec require preserving `# comment` lines on round-trip? `yaml.parseDocument` preserves; `yaml.parse` drops. Decision changes serialization API.
9. **Type of per-key values**: native Y types (strings, numbers, Y.Array for lists) or always strings? Native Y types give field-level CRDT merge (the whole point of D2); strings collapse back to LWW-on-cell.
10. **Bridge invariant I1 reformulation**: keep composed-string equality (recommended — least churn) or assert per-key Y.Map equality? Either works; the choice affects ~10 test sites.

## Risk register

| # | Risk | What could break silently | Tests that would catch |
|---|------|---------------------------|------------------------|
| R1 | Non-deterministic YAML serialization | I1 violations on every store cycle (round-trip diff > 0). Persistence repeatedly rewrites disk with reordered keys. Polluted git diffs. | `attachBridgeInvariantWatcher`-watching integration tests (already there). Add: round-trip PBT `parse(serialize(map)) === map AND serialize(parse(disk)) === disk_canonicalized`. |
| R2 | Observer B parses concurrent agent's FM YAML, overwrites form-driven per-key writes | Form properties silently revert when source-mode YAML is re-typed. UndoManager attribution lost. | New: integration test — concurrent form-write + source-mode YAML edit, assert form value preserved. |
| R3 | Per-key migration trigger ambiguity (when does a single-string doc become per-key?) | Mixed-state Y.Docs in production: some docs single-string, some per-key. Reader code branches forever. | Migration trigger gate test — assert all loaded docs reach per-key state on first observable read. |
| R4 | YAML library "tolerance" mismatch | `page-identity.ts` regex parser silently tolerates malformed YAML; `yaml` library throws. Switching graph display to `yaml` introduces panics on user-typed garbage. | Existing tests in `page-identity.test.ts` cover happy path; add malformed-YAML PBT. |
| R5 | Patch handler character-offset drift | `handleAgentPatch` finds `find` at offset N in composed string; per-key serialization shifts FM byte-length, agent's offset stale. 409 staleTarget storms. | Add: agent-patch tests with FM mutations between `find` computation and `replace` apply. |
| R6 | UM attribution loss across per-key writes | UndoManager tracks `Y.Map('metadata')` (line 472), but if a writer uses bulk `clear()+setAll()` instead of per-key diff, undo replays the clear+set as a single frame — undoing one property reverts ALL. | Add: undo-of-property test — write 3 properties, undo last, assert other 2 retained. |
| R7 | Bridge-invariant watcher false-positive on canonical-YAML mismatch | I1 violations during transition; integration tests fail flakily on disk-vs-Y.Map serialization differences. | Existing watcher will catch — but the test-harness needs a one-time canonicalization on doc-load to align baselines. |
| R8 | Attribution sweep: new form-driven endpoint slips past meta-test | Form writes attributed to default `claude-1` fallback, not the human user. Shadow repo writer-ID taxonomy contaminated. | `attribution-sweep-coverage.test.ts` — add `handleSetProperty` (or eq.) to `REQUIRED_HANDLERS`. Existing meta-test will fail until added. |
| R9 | Y.Text mirror divergence under per-key writes that don't touch XmlFragment | A pure form write (per-key Y.Map only) doesn't fire Observer A; Y.Text's FM region stays stale; next source-mode edit sees mismatch and Observer B reconciles by overwriting per-key state. | New: integration test — form write only, no body edit, assert Y.Text reflects new FM after settlement. |
| R10 | Comment / blank-line preservation regression | Users hand-author rich YAML (comments, blank lines, multi-line strings). Storage layer's per-key model normalizes these away on round-trip. NG6 already deferred (rich text in values), but plain `# comment` preservation may be a user expectation. | New: corpus test — load a doc with comments, write a property via form, assert comments preserved. |
| R11 | `frontmatterCache` (persistence.ts) becomes a stale parallel store | Cache holds string FM after Y.Map per-key migration; readers that fall through to cache see outdated state. | Remove cache OR add a write-through path. |
| R12 | Bridge-invariant `paired: true` contract leaked | A new per-key write origin without `context.paired: true` triggers Observer A/B amplification on every property edit. | Existing T8/T9/T10 regression tests — but only if exercised via the new write surface. Add coverage. |

## Pointers

- Read sites: 14 distinct files mention `getMap('metadata')` directly (per `current-storage-trace.md` initial scan, verified via grep this pass).
- Write sites that mutate `metaMap`: 7 production files (server-observers, agent-sessions, api-extension at 3 spots, external-change, persistence). All others are read-only.
- All paired-write origins satisfy `PairedWriteOrigin` (precedent #1 + bridge-correctness SPEC §6 R0). Today: `AGENT_WRITE_ORIGIN` (per-session via `createSessionOrigin`), `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`, `agent-undo` (per-session via `createUndoOrigin`). Per-key form writes will need a 6th paired origin OR reuse the per-session `session.origin` if writes happen via a session-bound endpoint.

> **_Resolved by D14 (DIRECTED) in SPEC.md:_** new `FORM_WRITE_ORIGIN`, **not** reuse of existing agent origin. The reuse alternative is closed.
