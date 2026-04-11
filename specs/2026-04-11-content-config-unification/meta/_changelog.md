# Changelog

## 2026-04-11 -- Retroactive spec written

### Context

This spec was written retroactively to document decisions and rationale for the `refactor/wiki-to-content-config` branch (PR #47), which was already implemented and tested at the time of writing.

### What the branch implements

1. **Config unification:** Removed separate `content: { dir }` and `wiki: { roots, include, exclude }` config sections. Replaced with unified `content: { dir, include, exclude }`. `dir` defaults to `.` (project root); `include` defaults to `["**/*.md"]`; `exclude` defaults to `[]`.

2. **Mirrored catalog generation:** New `mirror-catalog.ts` scans the project using glob patterns, builds a directory tree, and writes INDEX.md catalogs inside `.open-knowledge/catalogs/` mirroring the repo's directory structure. Links use project-root-relative paths. Sticky title/description metadata preserved. Content-hash dedup prevents unnecessary writes. `catalogs/` is gitignored.

3. **Directory/naming rename:** `packages/cli/src/wiki/` became `packages/cli/src/content/`. Types, functions, constants, and MCP tool names all renamed from `wiki` to `content`. All user-facing text updated from "wiki" to "content" / "knowledge base".

4. **Old code retained:** `catalog.ts`, `watcher.ts`, `paths.ts` kept in `packages/cli/src/content/` but not called at runtime. The new `mirror-catalog.ts` and inline watcher in `server.ts` handle the mirrored approach.

### Why retroactive

The implementation was a refactoring change where the design decisions were clear from the problems encountered with the original `roots`-based config (users had to enumerate directories explicitly, in-place INDEX.md files polluted the source tree, "wiki" terminology was too narrow). A spec was not written prospectively because the change was a natural evolution of the existing catalog system rather than a new feature requiring upfront design exploration.

### Evidence base

- Parent spec: `specs/2026-04-08-project-wiki-mcp-surface/SPEC.md` (D6, D16)
- PR #47 diff: 46 files changed, 1299 insertions, 565 deletions
- PR #9 (Tim's original catalog system design)
- Validated on open-knowledge repo: 907 articles cataloged across specs, reports, evidence directories
