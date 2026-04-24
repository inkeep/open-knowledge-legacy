# Evidence: Classifier taxonomy cleanup for server-absolute asset hrefs

**Status:** Deferred to follow-up PR (2026-04-24b amendment chose Option B — localized guard-softening)
**Dimension:** `classifyMarkdownHref` + downstream consumers (backlink-index, md-link-source, asset-context-menu, InternalLinkPropPanel)
**Sources:** Explore agent traces (2026-04-24 session), peer-editor research at [`reports/editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md`](../../../reports/editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md).

---

## Problem statement

`classifyMarkdownHref` at `packages/core/src/utils/link-targets.ts:59-96` treats ANY href starting with `/` as `{kind: 'external'}`, including same-origin paths pointing at local assets (e.g. `/vale_15.m4v`). Pre-Commit-3 of the 2026-04-24a amendment, hrefs were doc-relative and correctly classified as `asset`. Commit 3 flipped to server-absolute URLs to fix hash-routing resolution, and the classifier's leading-slash guard started conflating "same-origin absolute asset" with "external URL."

The 2026-04-24b amendment closes the dogfood bug via Option B — localized guard-softening at `internal-link.ts:131-133` + `resolveAssetProjectPath` leading-slash handling. This document captures why Option A (classifier taxonomy cleanup) was deferred + what a follow-up PR would entail.

## Root cause — deeper than the classifier

OK is half-web, half-vault. The classifier inherited an `external` kind from a markdown-native web-compatible model (where `[text](https://example.com)` is common) but didn't inherit Obsidian's pure-vault simplification (where every reference is a filesystem path). The leading-slash conflation is the seam where the two models collide.

## Option A — fold into 2026-04-24b (rejected)

Move the asset-ext branch above the leading-slash guard in the classifier:

```ts
if (isExternalHref(trimmed)) {
  return { kind: 'external', url: trimmed };
}
if (trimmed.startsWith('/')) {
  const ext = extractAssetExtension(trimmed);
  if (ext && ext !== 'md' && ext !== 'mdx') {
    return { kind: 'asset', url: trimmed, ext };
  }
  return { kind: 'external', url: trimmed };
}
// ...existing relative-path logic...
```

The classifier change looks tiny. The coordinated edits it forces downstream:

| File | Line | What changes |
|---|---|---|
| `packages/core/src/utils/link-targets.ts` | 59-96 | Classifier branch reorder |
| `packages/core/src/utils/link-targets.ts` | 119-171 | `resolveAssetProjectPath` — accept leading-slash paths (already done in 2026-04-24b) |
| `packages/core/src/utils/link-targets.test.ts` | 70-75, 124-138 | Tests locking `/docs/file.pdf` → external. Flip to asset. |
| `packages/server/src/backlink-index.ts` | 431, 496 | **Silent semantic drop risk.** Asset kind has no graph bucket. Needs new `asset` node kind OR external-fallthrough. |
| `packages/server/src/backlink-index.test.ts` | (new) | Asset-href test assertions for leading-slash paths |
| `packages/app/src/editor/plugins/md-link-source.ts` | 97-105 | Parallel `asset` branch in source-mode click handler |
| `packages/app/src/editor/plugins/asset-context-menu.ts` | 87-101 | Already dispatches asset; ripples through `resolveAssetProjectPath` extension |
| `packages/app/src/editor/extensions/InternalLinkPropPanel.tsx` | 287, 315-332, 377-383 | Same ripple |
| `packages/app/src/components/graph-view-utils.ts` | 41, 65 | Only if backlink-index exposes new `asset` kind |
| `packages/cli/src/mcp/tools/get-forward-links.test.ts` | 103 | Forward-links API output update |
| `packages/app/tests/integration/link-graph-metadata.test.ts` | 107 | External count drifts |

Total: ~8-10 files, ~150-250 LOC, requires a **backlink-graph design decision** (new `asset` node kind vs external-fallthrough).

## Option B — guard-softening in 2026-04-24b (chosen)

Leave classifier alone. Soften guard at `internal-link.ts:131-133` + extend `resolveAssetProjectPath` for leading-slash handling. Total: 2 files, ~30 LOC. Zero impact on backlink-index / graph / forward-links.

## Peer-editor comparison — why this is OK-specific

### Docmost

Docmost uses namespaced URLs (`/api/files/{fileId}`). Assets live on a dedicated URL prefix; the URL shape itself tells the server "this is a file, not a route." Docmost has no classifier disambiguation problem because free-form markdown hrefs for assets are converted to `/api/files/` on insertion. They pay the cost upfront (every asset insertion emits an opaque ID URL) and get taxonomic clarity for free.

Server-side, `/api/files/*` routes through an extension-gated `Content-Disposition` dispatcher (inline for `.jpg/.png/.jpeg/.pdf/.mp4/.mov`, attachment for the rest). Adopted in this amendment's Commit A for the same stored-XSS defense reason — Docmost's posture post-HedgeDoc GHSA-x74j-jmf9-534w.

### Obsidian

Pure Electron. No web server. Assets read directly via `fs.readFileSync`. The link taxonomy has two axes:

- Wiki-link syntax: `[[` (doc reference) vs `![[` (embed)
- Target extension: image / pdf / video / audio / unknown

But NO third axis for "same-origin-web-absolute." The leading-slash conflation can't occur because there's no web origin concept at all. Click on `![[image.png]]` → Obsidian reads the file directly via `fs.readFileSync` → renders in its bundled viewer (for supported types) or delegates to OS via `shell.openPath(filePath)` for unknown types (verified via Obsidian 1.12.7 reconstruction in `reports/electron-os-integration-patterns/` D10).

### OK — the half-web / half-vault seam

Web-capable (Vite + Hocuspocus), but also vault-interop (files are plain paths on disk, Obsidian-compatible). The classifier inherited:
- The web-native `external` kind from markdown (for `https://...` links)
- The vault-native path-shape handling from Obsidian (for `[[page]]` refs + relative `./photo.png`)

And ran into the seam when Commit 3 of 2026-04-24a started emitting server-absolute hrefs (`/docs/sub/photo.pdf`). The classifier couldn't distinguish "URL that happens to point at localhost:5174" from "path that points at disk under the vault root."

## Long-term resolution paths

1. **Fully embrace Obsidian syntactic-only classification.** Drop the `external` kind; derive from href-shape at each consumer. Simpler classifier, more per-consumer logic. Aligned with Obsidian refugee fidelity (our P2 persona). Trade-off: consumers duplicate the shape-derivation logic; scheme allowlist (reject `javascript:` / `data:` / etc.) has to live somewhere.

2. **Fully embrace Docmost URL namespacing.** Emit assets as `/api/files/{id}` on insertion; classifier discriminates by URL prefix. Obsidian-hostile (vaults no longer interoperate on relative file paths). Would require a migration for existing content. Trade-off: clean taxonomy forever; refugee-migration cost is one-time.

3. **Narrow fix: treat server-absolute as asset when ext matches (Option A above).** Preserves the existing taxonomy but corrects the leading-slash conflation. Small surface in the classifier itself (~5 LOC) but requires the backlink-graph design decision. Doesn't address the half-web/half-vault seam for scenarios that don't carry an extension (e.g. `[text](/some-doc)` — should that be `doc` kind or `external`?).

The narrow fix (Option A) is the likely immediate follow-up. Paths 1 + 2 are architectural pivots requiring their own spec.

## Why deferred from 2026-04-24b

1. The dogfood bug is fixed either way — Option B (in 2026-04-24b) closes the user-visible click failure for server-absolute asset hrefs.
2. Option A is taxonomic improvement, not a bug fix. The `external` kind is wrong for `/vale_15.m4v`, but downstream consumers behave correctly for the dogfood path when the guard-softening catches `sourceForm==='wikiembed' + has-extension`.
3. Option A demands a backlink-graph design choice (new `asset` node kind vs external-fallthrough) that deserves its own focused review rather than being bundled with other fixes.
4. The root cause (half-web, half-vault) is deeper than the classifier. Properly fixing it long-term probably warrants a spec, not a PR.
5. The amendment's scope was already 4 distinct defects + SPEC amendment + AGENTS.md STOP rules + changeset; adding classifier taxonomy cleanup would have inflated the review surface meaningfully.

## Trigger for follow-up

- User surfaces that server-absolute asset hrefs aren't being tracked by backlinks / graph view. (Observable via `/api/backlinks/{docName}` missing entries for `[text](/foo.pdf)`-style refs that exist in the doc body.)
- Third classifier-seam bug surfaces — signal that the taxonomy needs a deeper fix, not just another localized guard.
- Explicit product decision to prioritize one of the long-term resolution paths (Obsidian-pure vs Docmost-namespaced).

## Cross-references

- Classifier current shape: `packages/core/src/utils/link-targets.ts:59-96`
- Guard-softening site (chosen fix): `packages/app/src/editor/extensions/internal-link.ts:131-150`
- Leading-slash handling in `resolveAssetProjectPath`: `packages/core/src/utils/link-targets.ts:142-196`
- 2026-04-24b amendment: [`../SPEC.md`](../SPEC.md) §Post-finalization amendment (2026-04-24b)
- Peer-editor click-behavior research: [`../../../reports/editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md`](../../../reports/editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md)
- Electron-side shell.openPath research: [`../../../reports/electron-os-integration-patterns/REPORT.md`](../../../reports/electron-os-integration-patterns/REPORT.md) D4 + D5
- Obsidian 1.12.7 reconstruction: [`../../../reports/electron-os-integration-patterns/evidence/d10-obsidian-limits.md`](../../../reports/electron-os-integration-patterns/evidence/d10-obsidian-limits.md)
