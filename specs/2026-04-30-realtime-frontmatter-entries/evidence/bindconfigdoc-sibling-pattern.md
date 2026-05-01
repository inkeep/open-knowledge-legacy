---
date: 2026-04-30
sources:
  - "packages/core/src/config/bind-config-doc.ts"
  - "packages/core/src/config/yaml-patch.ts"
  - "specs/2026-04-30-realtime-frontmatter-entries/evidence/_init_worldmodel.md"
type: pattern
---

# bindConfigDoc — sibling pattern for "structured editor view over Y.Text"

The architectural template the new `bindFrontmatterDoc` collapses to. `bindConfigDoc(provider, scope)` already binds a typed read/patch/subscribe API directly to a Y.Text whose content IS YAML — no separate per-key Y.Map. The new frontmatter binding is the same shape, but operating on a **sub-region** (the `---\n…\n---\n` block) of `Y.Text('source')` rather than the entire Y.Text.

## What bindConfigDoc does (verified, code-referenced)

- **Read** — parses the current Y.Text content as YAML via `yaml@2.x` `parseDocument`. Returns the merged `Config` (Zod defaults filled). Self-heals corrupt YAML by falling back to schema defaults — never throws from `current()`.
- **Patch** — accepts a deep-partial `ConfigPatch`. Validates the merged-document-after-patch against `ConfigSchema` BEFORE mutating Y.Text. On schema failure, returns `Result.err` with no Y.Text mutation.
- **Apply** — inside `ydoc.transact(fn, origin)`, calls `applyPatchToDocument(doc, patch)` on the parsed `Document` AST (preserving comments + source order via yaml@2's CST), then replaces Y.Text content with `Document.toString()`.
- **Subscribe** — `ytext.observe` deep + provider `'synced'` listener for reconnect-fresh-value.
- **L1/L2/L3 defense** — L1 schema parse before write; L2 `writeConfigPatch` headless writer for non-UI paths; L3 persistence-hook revert.

## What changes for frontmatter

- **Binding target:** sub-region of `Y.Text('source')` matched by `FRONTMATTER_RE` from `packages/core/src/extensions/frontmatter.ts`, not the full Y.Text.
- **Region detection:** `stripFrontmatter(ytext.toString())` returns `{ frontmatter, body }`. The FM region is `[0, frontmatter.length]` in Y.Text byte coordinates.
- **Patch shape:** `FrontmatterPatch` (RFC 7396 JSON Merge Patch) already exists in `packages/core/src/frontmatter/schema.ts`. Reuse.
- **Schema:** `FrontmatterMapSchema` / `FrontmatterPatchSchema` already gate L1.
- **Edit operation:** parse FM region YAML to `Document`, apply edit (set/delete/rename/reorder), re-serialize, replace Y.Text bytes `[0, frontmatter.length]` atomically inside `doc.transact(fn, FORM_WRITE_ORIGIN)`.
- **No paired write:** `FORM_WRITE_ORIGIN` stays non-paired. Only `Y.Text` is touched. Observer B fires normally and propagates to XmlFragment.

## Helpers we'd reuse vs add

| Helper | Source | Reuse? |
|---|---|---|
| `parseFrontmatterYaml` | `packages/core/src/frontmatter/yaml-codec.ts` | Yes |
| `applyPatchToDocument` (Document-AST patcher) | `packages/core/src/config/yaml-patch.ts` | **Move or duplicate to `frontmatter/yaml-patch.ts`** — currently config-shape-specific |
| `stripFrontmatter` / `prependFrontmatter` / `withFences` | `packages/core/src/extensions/frontmatter.ts`, `frontmatter/yaml-codec.ts` | Yes |
| `FrontmatterPatchSchema` (Zod L1 gate) | `packages/core/src/frontmatter/schema.ts` | Yes |

New helper module candidate: `packages/core/src/bridge/frontmatter-region.ts` — primitives for parse-edit-stringify operations on the FM region (set / delete / rename / reorder / add). The contract is "atomic Y.Text byte-range replace inside one transact".

## Why this matters for scope

The architectural delta from the predecessor spec is small in shape (collapse `Y.Map('metadata')` into a Y.Text-region edit), but large in code-blast-radius (8+ readers of the legacy slot, Observer Meta, L3 hook, ~7 surfaces of validation infra). The **full-Y.Text version** of this pattern is established in the codebase via `bindConfigDoc` (binds an entire Y.Text whose content is YAML — `__config__/workspace`, `__user__/config.yml`). The **sub-region version** — where another collaborative writer (CodeMirror's `yCollab` in source mode) and the bridge (Observer B in `server-observers.ts`) write to the same Y.Text concurrently with the binding — is novel within this codebase. It follows the same parse-edit-stringify primitive shape, but the multi-writer + sub-region scoping requires verifying that:

1. Observer B's normalize-gate doesn't loop on FM-only edits (D2 implication).
2. Observer A's `lastSyncedXmlMd` baseline refreshes correctly after FM-only edits (D32, audit Finding 4).
3. The byte-range replace inside `doc.transact` recomputes the FM region offset rather than using a stale snapshot (STOP_IF, challenge Finding #7).

The worldmodel's 3P-landscape framing — "no widely-cited precedent for an Obsidian-style Properties view rendered specifically over a CRDT-synced Y.Text region — the topic is at the frontier" — applies here. The full-Y.Text-as-YAML pattern is established; the sub-region multi-writer pattern is a careful extension.
