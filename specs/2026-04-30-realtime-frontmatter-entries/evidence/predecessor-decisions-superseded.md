---
date: 2026-04-30
sources:
  - "specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md"
  - "specs/2026-04-24-frontmatter-editing-ux/SPEC.md"
  - "specs/2026-04-30-realtime-frontmatter-entries/evidence/_init_worldmodel.md"
type: decision-trace
---

# Predecessor decisions — superseded vs preserved

This spec operates under user-granted greenfield permission to undo predecessor decisions. The predecessor specs are:

1. `specs/2026-04-24-frontmatter-editing-ux/SPEC.md` — original PropertyPanel UX spec (D1–D30).
2. `specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md` — predecessor that introduced `bindFrontmatterDoc` writing per-key `Y.Map('metadata')`.

## Decisions superseded by this spec

| Source | ID | Original direction | Why superseded |
|---|---|---|---|
| 04-24 | D2 (LOCKED) | Per-key Y.Map storage as canonical client-side shape | Replaced by Y.Text-region storage; Y.Map becomes derived-or-eliminated |
| 04-24 | D7 | `getFrontmatterMap` reader API (returns typed map from per-key) | Reader becomes `parseFrontmatterYaml(stripFrontmatter(ytext).frontmatter).map` |
| 04-24 | D9 | Removed `frontmatterCache` (Y.Map per-key is the cache) | Now Y.Text region IS the source — no cache layer at all |
| 04-24 | D10 | Per-key Y-types: Y.Text editable strings, Y.Array<Y.Text> lists, primitives for atomics | Replaced by single Y.Text holding YAML — character-level CRDT for free |
| 04-24 | D12 | Observer A observes metaMap deep | Becomes obsolete — metaMap no longer carries FM state |
| 04-24 | D13 | Per-key diff reconciliation in Observer B / file-watcher / load | Becomes Y.Text region replace; reconciliation moves to YAML-document level |
| 04-24 | D27 | Form ↔ source per-key LWW | Becomes Y.Text per-character last-write-wins (free) |
| 04-24 | D30 | Write-path simplification: form + frontmatter_patch touch only metaMap | Replaced by "form touches only Y.Text region" |
| 04-30 | AC-C1..C6 | Client `bindFrontmatterDoc.patch` writes per-key | **Reverse** — patch writes Y.Text region |
| 04-30 | AC-S1 | FORM_WRITE_ORIGIN non-paired touches only metaMap | **Reframe** — touches only Y.Text |
| 04-30 | AC-S3..S5 | L3 hook validates per-key metaMap and reverts via `FRONTMATTER_VALIDATION_REVERT_ORIGIN` | **Reframe or delete** — see §11 OQ on L3 hook fate |
| 04-30 | AC-Q4 | Multi-client conflict last-wins per-key metaMap | **Reframe** — Y.Text per-character semantics replace per-key LWW |
| 04-30 | AC-S2 | `FRONTMATTER_VALIDATION_REVERT_ORIGIN` from `frontmatter-edit-origin.ts` | **Delete** — origin no longer needed (FR11) |
| 04-30 | AC-S6 | `emitFrontmatterValidationRejected` + `CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED` | **Delete** — CC1 channel + broadcaster method removed (FR11) |
| 04-30 | AC-S7 | `boot.ts`/`standalone.ts` L3 wiring | **Delete** — boot wiring removed (FR11) |
| 04-30 | AC-Q1 | `bun run check` passes | **Preserve** — quality gate retained (§13 deployment) |
| 04-30 | AC-Q2 | Unit test in `bind-frontmatter-doc.test.ts` | **Reshape** — test file rewritten for new D11 API (D24 layer a) |
| 04-30 | AC-Q3 | L3 integration test | **Delete** — L3 surface removed |
| 04-30 | AC-Q5 | Playwright property-panel coverage | **Reshape** — D24 layer d covers (`packages/app/tests/stress/frontmatter-edit.e2e.ts`) |

## Decisions preserved by this spec

| Source | ID | Direction | Status |
|---|---|---|---|
| 04-24 | D1 | Top-of-doc table form layout for PropertyPanel | Preserve |
| 04-24 | D3 (LOCKED) | YAML on disk = source of truth (out-of-process editors must work) | Preserve — Y.Text mirrors disk |
| 04-24 | D5 / D22 (LOCKED) | 5 widget types (text/number/boolean/date/list) | Preserve |
| 04-24 | D8 | Canonical YAML serialization on disk write | Preserve via yaml@2 `Document.toString()` |
| 04-24 | D11 | Substrate bridge invariant kept | Preserve — invariant unchanged in shape |
| 04-24 | D14 | `FORM_WRITE_ORIGIN` non-paired | Preserve — same origin object, same non-paired status, semantics shift to "Y.Text-region edit" |
| 04-24 | D15–D21 | UX layout details (typography, spacing, hover chrome, error overlay) | Preserve |
| 04-24 | D17 | Toolbar-button-only initialization trigger | Preserve |
| 04-24 | D19 | Drag-and-drop reorder, YAML order preserved | **Promote** — central to this spec, treated as "move selected text" |
| 04-24 | D23 | Inline rename on key label | Preserve UX surface — implementation becomes Y.Text edit |
| 04-24 | D24 (LOCKED 1-way) | Forbid FM in `agent-patch`; add `frontmatter_patch` MCP tool | Preserve agent-patch FM rejection; MCP tool stays parked |
| 04-24 | D25 (LOCKED) | `yaml.parseDocument` for comment preservation | Preserve — same parser, used in region-edit primitives |
| 04-24 | D26 (LOCKED) | Position invariant — panel always above body | Preserve |
| 04-24 | D28 | Zod at boundaries | Preserve |
| 04-24 | D29 (LOCKED 1-way) | `frontmatter_patch` MCP tool shape | Tool stays parked; if un-parked later, would need to write Y.Text region instead of metaMap |
| 04-30 | AC-R1..R5 | HTTP `/api/frontmatter-patch` removed | Preserve — endpoint stays gone |

## Code surfaces affected

See `_init_worldmodel.md` §"Summary table — files that change vs files that stay" for the full enumeration. Top-level:

- **Substantial refactor / delete candidates:** `bindFrontmatterDoc`, `frontmatter-y.ts` (most fns shrink/delete), `server-observers.ts` (Observer Meta + metaDirty), `agent-sessions.ts` (read FM from Y.Text not metaMap), `persistence.ts` (onLoad/onStore simplification), `external-change.ts`, `api-extension.ts` (rollback metaMap mirror), `frontmatter-l3.ts` + `frontmatter-edit-origin.ts` (deletion candidates), CC1 broadcaster, `cc1.ts` schema, `frontmatter-validation-events.ts`, `PropertyPanel.tsx` (read pathway + drag), `TiptapEditor.tsx` (legacy slot reader), test harness probes, several test files.
- **Stay (read-only or out of scope):** Zod schemas, YAML codec, error shape, `extensions/frontmatter.ts`, `page-identity.ts`, `frontmatter-telemetry.ts`, parked MCP tools, `agent-write-md` flow.
