# Evidence: D5 — Obsidian/Wiki-Links Package Source Analysis

**Dimension:** fumadocs-obsidian — wiki-link resolution and vault processing
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/obsidian/src/

---

## Key files referenced

- `packages/obsidian/src/remark/remark-wikilinks.ts` (225 lines) — Wiki-link remark plugin
- `packages/obsidian/src/build-resolver.ts` (79 lines) — VaultResolver for name/path resolution
- `packages/obsidian/src/index.ts` (46 lines) — Vault reading and conversion
- `packages/obsidian/package.json` — Dependencies

---

## Findings

### Finding: remarkWikilinks supports full Obsidian syntax including embeds
**Confidence:** CONFIRMED
**Evidence:** remark-wikilinks.ts lines 17, 139-224

Regex patterns:
- `RegexWikilink = /!?\[\[(?<content>([^\]]|\\])+)]]/g` — matches `[[...]]` and `![[...]]`
- `RegexContent = /^(?<name>...)(?:#(?<heading>...))?(?:\|(?<alias>.+))?$/` — parses name, heading, alias

Supported syntax:
- `[[page]]` — link to page by name
- `[[page#heading]]` — link to page with heading anchor
- `[[page|alias]]` — link with display text
- `![[page]]` — embed content (resolves to `<include>` MDX element)
- `![[image.png]]` — embed image (resolves to image node)
- `[[#heading]]` — same-page heading link (heading-only, empty name)

### Finding: Resolution requires VaultResolver which needs a file inventory
**Confidence:** CONFIRMED
**Evidence:** build-resolver.ts lines 28-69, remark-wikilinks.ts line 23

`remarkWikilinks` requires a `VaultResolver` in its options. The resolver is built from a `VaultStorage` (the set of all vault files). It creates two maps:

1. `nameToFile` — maps filename (with and without extension) to file
2. `pathToFile` — maps full vault path (with and without extension) to file

Resolution algorithm (`resolveAny`):
1. If name starts with `./` or `../` — resolve as relative path from current file
2. Otherwise — try full path match, then name match

This means it works with a flat list of known pages — no need for a full Fumadocs page tree. You just need `Map<filename, fileInfo>`.

Alias support: frontmatter `aliases` array is indexed into `nameToFile`.

### Finding: Error handling is console.warn, not thrown errors
**Confidence:** CONFIRMED
**Evidence:** remark-wikilinks.ts lines 160, 203

When resolution fails: `console.warn('failed to resolve ${name} wikilink')` and returns `undefined` (silently drops the link). No broken-link error collection. No callback for custom error handling.

### Finding: Backlink computation does NOT exist anywhere in the package
**Confidence:** CONFIRMED (NOT FOUND)
**Evidence:** Full directory listing of packages/obsidian/src/

Files: `build-resolver.ts`, `build-storage.ts`, `convert.ts`, `index.ts`, `read-vaults.ts`, `remark/` (4 plugins), `ui/`, `utils/`. No file computes reverse links. The VaultResolver is read-only (name -> file), not bidirectional (file -> [files that link to it]).

### Finding: fumadocs-obsidian has significant dependencies but can be pattern-copied
**Confidence:** CONFIRMED
**Evidence:** obsidian/package.json

Hard dependencies: `github-slugger`, `gray-matter`, `js-yaml`, `remark-math`, `remark-mdx`, `remark-parse`, `remark-stringify`, `tailwind-merge`, `tinyglobby`, `unified`, `unist-util-visit`, `vfile`, `zod`.

Peer dependency: `fumadocs-core` (for Source types and the VaultResolver output feeds into fumadocs-core's VirtualFile[] system).

The remarkWikilinks plugin itself only needs: `unist-util-visit`, `mdast` types, `mdast-util-mdx` types, and the local `VaultResolver`. The resolver needs only `node:path`. These could be extracted as a ~300-line standalone module.

### Finding: The plugin is NOT a standard remark plugin — it requires file-level context
**Confidence:** CONFIRMED
**Evidence:** remark-wikilinks.ts lines 26-28

```typescript
return (tree, file) => {
  if (!file.data.source) return;
  const sourceFile = file.data.source;
```

The plugin reads `file.data.source` (a `ParsedFile` set by the vault processing pipeline). This is NOT a generic remark plugin — it requires pre-processing to attach source metadata to the VFile. For standalone use, you'd need to set `file.data.source` yourself with `{ path, format, frontmatter }`.

---

## Gaps / follow-ups

- `build-storage.ts` and `convert.ts` not read (vault reading/conversion pipeline)
- `remark-block-id.ts`, `remark-convert.ts`, `remark-obsidian-comment.ts` not read
- UI components in `ui/` directory not read
