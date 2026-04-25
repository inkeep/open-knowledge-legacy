# Evidence D2: Open Knowledge frontmatter pipeline & consumers

**Dimension:** 1P — per-file frontmatter: parsing, CRDT storage, consumer surfaces
**Date:** 2026-04-16
**Sources:** Open Knowledge monorepo (main branch as of 2026-04-16)

---

## Key files / pages referenced

- `packages/core/src/extensions/frontmatter.ts:1-25` — `stripFrontmatter` / `prependFrontmatter` regex utilities (markdown-pipeline edge)
- `packages/core/src/bridge/frontmatter-y.ts:1-20` — `getFrontmatter(doc)` canonical accessor from `Y.Map('metadata').get('frontmatter')`
- `packages/cli/src/utils/frontmatter.ts:1-70` — `parseFrontmatter<Schema>()` + `serializeFrontmatter()` YAML utilities (with optional Zod)
- `packages/server/src/page-identity.ts:11-90` — `extractPageTitle`, `extractPageAliases`, scalar/aliases extraction
- `packages/server/src/server-observers.ts` — Observer A/B write `metadata.frontmatter` during CRDT sync
- `packages/server/src/suggest-links.ts:447-505` — serializer uses `prependFrontmatter` to re-attach frontmatter on XmlFragment→markdown serialization
- `packages/cli/src/mcp/tools/read-document.ts:5-30` — MCP `read_document` returns `title / description / tags` extracted from frontmatter
- `packages/app/src/components/FileSidebar.tsx:1-72` — sidebar shell (does NOT consume frontmatter today)
- `docs/source.config.ts:1-34` — Fumadocs docs-site frontmatter schema (project-scoped, not shared with editor)
- `docs/content/meta.json`, `docs/content/guides/meta.json`, `docs/content/internals/meta.json` — **Fumadocs `meta.json` folder files already in use in this repo**

---

## Findings

### Finding: Frontmatter is stored in Y.Map('metadata')['frontmatter'] as a **raw string**, not parsed
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/bridge/frontmatter-y.ts:14-19`

```ts
export function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}
```

The string includes the `---` delimiters; it's the verbatim block that was stripped off the markdown body. Observer B writes it on source-mode parses; Observer A reads it on XmlFragment→Y.Text serialization to prepend.

**Implications for folder-frontmatter:**
- The CRDT side stores frontmatter as an opaque string. Any **merged** (file + folder defaults) frontmatter that we'd want to surface to consumers must be computed at read time — OR stored as a derived second field on `Y.Map('metadata')` (e.g. `'effectiveFrontmatter'`).
- A spec should decide: is the "effective" frontmatter (file + inherited) a **derived view** (computed per-read) or a **cached second slot** in the metadata Y.Map (write-on-change, risk of staleness).

---

### Finding: Frontmatter parsing is split across two utilities — generic YAML + ad-hoc regex
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/utils/frontmatter.ts:44-70` (generic YAML + Zod); `packages/server/src/page-identity.ts:11-90` (regex-based extract for title/aliases)

The CLI has a proper `parseFrontmatter(content, schema?)` helper using `yaml` + optional Zod. But `page-identity.ts` still parses with regex for `title:` and `aliases:` lines (likely pre-dates the generic helper; inherited tech debt).

**Implications:**
- Any folder-frontmatter implementation should consolidate on `parseFrontmatter` from `cli/utils` — not introduce a third parser.
- Consolidating regex-based `page-identity.ts` reads to the YAML helper is an adjacent refactor, not a blocker.

---

### Finding: Consumers of frontmatter today (complete enumeration)
**Confidence:** CONFIRMED

| Consumer | What it reads | How |
|---|---|---|
| `read_document` MCP tool | `title`, `description`, `tags` | `parseFrontmatter(content, schema)` — reports extracted fields alongside file contents + activity |
| `page-identity.extractPageTitle` | `title:` scalar | regex line match; fallback to first `#` heading, then filename |
| `page-identity.extractPageAliases` | `aliases:` list | regex line match, block scalar split |
| `suggest-links` serializer | full frontmatter string | `prependFrontmatter(fm, body)` — re-attaches on serialize |
| Server Observer A (`server-observers.ts`) | full frontmatter string | `getFrontmatter(doc)` to prepend during XmlFragment→Y.Text sync |
| Server Observer B | full frontmatter string | `stripFrontmatter(md)` → writes to `Y.Map('metadata')` |
| `docs/source.config.ts` (docs site) | `title`, `description`, `sidebarTitle`, `keywords` | Fumadocs `frontmatterSchema.extend({...})` (Zod) — **separate schema, not shared with editor** |
| `FileSidebar` / `FileTree` (editor UI) | **NOTHING** | Sidebar today shows filenames only; no frontmatter-driven title/icon |

**Implications:**
- The editor sidebar is a **greenfield consumer** for folder frontmatter (no existing rendering to migrate).
- The MCP `read_document` tool is the most structured consumer — it'd be the natural place to return an `effectiveFrontmatter` field (file merged with folder defaults).
- Docs-site frontmatter schema and editor frontmatter schema are **not shared today**. A folder-frontmatter spec could either (a) continue the duality (docs uses Fumadocs `meta.json`, editor uses config.yml) or (b) unify them (single config drives both).

---

### Finding: Open Knowledge's OWN docs site already uses Fumadocs `meta.json` for folder metadata
**Confidence:** CONFIRMED
**Evidence:** `docs/content/meta.json`, `docs/content/guides/meta.json`, `docs/content/internals/meta.json`

```json
// docs/content/meta.json
{ "title": "Open Knowledge", "icon": "LuBookOpen", "pages": ["overview", "guides", "internals"] }

// docs/content/guides/meta.json
{ "title": "Guides", "icon": "LuBookText", "pages": ["getting-started", "configuration", "mcp-integration", "content-filtering"] }
```

Three fields are in use: `title`, `icon` (lucide component name), `pages` (explicit ordering — also controls which children are visible).

**Implications:**
- There's internal precedent for *colocated sibling files* for folder metadata in this repo — just not in the editor package, only in the docs site.
- A `/spec` can't ignore this: either (a) the editor adopts the same `meta.json` convention (colocated) and `config.yml` stays out of it, OR (b) `config.yml` becomes the unified source of truth and somehow interops with the docs site (write-through codegen of `meta.json`? sidecar?), OR (c) the two stay independent and the spec scopes to the editor only.
- The three fields already in use (`title`, `icon`, `pages`) are a strong **minimum viable feature set** for folder-metadata in the editor too — they map cleanly to sidebar rendering.

---

### Finding: No per-folder "default frontmatter for new files" concept exists today
**Confidence:** CONFIRMED (negative — explicit search performed)
**Evidence:** Searched `packages/app/src/components/NewItemDialog.tsx` and server `/api/create-page` handler for any "apply default frontmatter" logic — none. New files are created empty.

**Implications:**
- A "folder frontmatter" feature that injects defaults into *newly-created files* in that folder would be net-new behavior.
- The MCP `write_document` / `create-page` handler is the insertion point.

---

### Finding: `hub-candidates` is the closest 1P analogue to folder-level awareness today
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/hub-candidates.ts:1-60`

```ts
// Walk from dirname(targetPath) up to the content root.
// At each level, look for: INDEX.md, README.md, REPORT.md, SPEC.md, OR
// a file whose basename matches the folder name (e.g. reports/r1/r1.md).
const FIXED_HUB_BASENAMES = ['INDEX', 'README', 'REPORT', 'SPEC'];
```

This runs at `POST /api/agent-write-md` — if a new doc has zero backlinks, the server nudges the agent toward a hub doc for that folder subtree. It uses the **folder tree walk** pattern (nearest ancestor wins) which folder-frontmatter inheritance would mirror.

**Implications:**
- The "walk up the folder tree, nearest match wins" pattern is already validated in 1P code.
- A folder-frontmatter resolver can reuse the same walk shape, replacing "look for hub filenames" with "look up rules in config.yml whose glob matches the current folder path."
- Alternatively: if the spec goes sibling-file-first, `hub-candidates.ts` could be generalized to also detect `_folder.md` or similar.

---

## Negative searches

- Searched `packages/app/src/components` for any frontmatter or metadata reading — none. Editor UI is unaware of frontmatter today.
- Searched for "category" / "folder metadata" in tests — only hub-candidate tests, no folder-frontmatter coverage.
- Searched for existing Zod schema shared between docs-site and editor — `docs/source.config.ts` defines its own `frontmatterSchema.extend(...)` independent of `packages/core/`.

---

### Finding: D19 rejected *INDEX.md-as-folder-metadata-carrier* specifically — for the "shadow folder structure in files" reason, not folder metadata as a concept
**Confidence:** CONFIRMED (via product-owner clarification, 2026-04-16)

The `packages/cli/src/mcp/tools/read-document.ts:15` comment `"folder INDEX.md frontmatter was deprecated in D19"` refers to a rejected design that proposed using an `INDEX.md` file's own frontmatter to carry folder-scoped metadata. The rejection reason (confirmed by product owner): using a markdown **file** as a proxy for folder-scoped metadata creates a "shadow folder structure in files" — the file pretends to BE the folder, conflating document content with folder configuration. The preferred discipline is that folder metadata should be **colocated with the folder itself**, not embedded in a file that doubles as a content document.

**Implications for the current spec:**
- **Hugo's `_index.md` pattern is exactly the rejected shape.** Hugo overloads a single markdown file as both the folder's landing page AND the cascade-frontmatter carrier. That's the "shadow folder structure in files" anti-pattern D19 rejected.
- **A dedicated sibling file (Fumadocs `meta.json`, Docusaurus `_category_.json`, Nextra `_meta.json`) is NOT the rejected shape** — these are purpose-dedicated folder-metadata files, not overloaded content docs. They satisfy "colocated with the folder" without the shadow-structure problem.
- **`config.yml`-driven rules are also not the rejected shape** — they're centralized, not masquerading as a document.
- **The current `hub-candidates.ts` mechanism is orthogonal** — it detects hub *docs* (INDEX/README/REPORT/SPEC) as navigation aids, NOT as metadata carriers. No frontmatter is read from hub files for folder-level purposes.

**The key spec-shaping takeaway:** any new folder-metadata design must NOT put metadata in a frontmatter block of a content-bearing markdown file (so Hugo `_index.md` is out). It CAN use a dedicated sibling file (Fumadocs/Docusaurus style) or centralized config — both satisfy the "colocated, not shadow-structured" discipline.

---

## Gaps / follow-ups

- **Open design question:** should the effective (file + folder-defaults) frontmatter be derived-on-read or cached-as-second-slot in the Y.Map? Derived is simpler; cached enables CRDT awareness consumers (e.g. "file X's effective tags changed"). Spec decides.
- **Open design question:** editor-only scope vs unified with docs site. Fumadocs `meta.json` is locked-in for the docs site; unifying would mean either codegen or adoption on both sides.
- Consolidate `page-identity.ts` regex-based frontmatter reads onto `parseFrontmatter()` (adjacent cleanup; not a blocker).
