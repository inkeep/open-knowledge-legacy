# Wiki-Links + Backlinks (S10) — Implementation Milestones

**Status:** Ready
**Last updated:** 2026-04-10
**Parent spec:** `./SPEC.md`

---

## Goal

Break S10 into a short series of self-contained PRs that are easy to review and easy to manually test before approval.

Principles:
- each PR should produce a user-visible or testable increment
- each PR should avoid mixing foundational parser/storage risk with higher-level product UX where possible
- rename resilience ships last because it has the highest ambiguity and operational risk

---

## Milestone 1 — WikiLink Foundation

**Goal:** Prove the storage format and markdown round-trip path end to end.

**Scope**
- Add `wikiLink` as a first-class TipTap inline node in core
- Support markdown parse/render for:
  - `[[Page]]`
  - `[[Page|Alias]]`
  - `[[Page#Heading]]`
  - `[[Page#Heading|Alias]]`
- Register the node in the shared schema used by core, app, and persistence
- Add a minimal app-side rendering layer so wikilinks render as distinct inline chips rather than raw text
- Keep the node non-interactive for now

**Out of scope**
- autocomplete
- resolved vs red-link styling
- click-to-create
- backlink indexing
- rename handling

**Primary files**
- `packages/core/src/extensions/wiki-link.ts`
- `packages/core/src/extensions/shared.ts`
- `packages/core/src/index.ts`
- `packages/app/src/editor/extensions/wiki-link.ts`
- `packages/app/src/editor/extensions/shared.ts`
- `packages/app/src/editor/TiptapEditor.tsx`

**Tests**
- `packages/core/src/extensions/wiki-link.test.ts`
- extend shared-schema round-trip tests if needed
- add one app bridge regression test only if the node does not already survive the normal observer path

**Manual QA**
- In source mode, enter:
  ```md
  Alpha [[Page]]
  Beta [[Page|Alias]]
  Gamma [[Page#Heading]]
  Delta [[Page#Heading|Alias]]
  ```
- Switch to WYSIWYG and confirm the wikilinks render as chips
- Save and reload
- Confirm the markdown on disk is unchanged

**Approval bar**
- Wikilinks survive parse -> editor -> serialize -> reload with no syntax loss
- Shared schema remains aligned across core and app

---

## Milestone 2 — Writer UX

**Goal:** Make wikilinks pleasant to author in the editor.

**Scope**
- Add `[[` suggestion flow with fuzzy ranking
- Add `/api/pages` endpoint for page-title suggestions
- Render resolved vs unresolved wikilinks distinctly
- Add red-link click-to-create dialog
- Suggested create path defaults to the current page's directory, with editable override
- After create, navigate to the new page

**Out of scope**
- backlink index
- graph MCP tools
- rename propagation

**Primary files**
- `packages/app/src/editor/extensions/wiki-link.ts`
- `packages/app/src/editor/plugins/` for suggestion integration
- `packages/server/src/api-extension.ts`
- `packages/app/src/components/` for create-page dialog wiring

**Tests**
- suggestion inserts the expected node attrs
- unresolved targets render as red links
- create-page flow creates the file at the chosen path
- page list endpoint returns current page set

**Manual QA**
- Type `[[Pro` and select an existing page
- Type a nonexistent target and confirm it renders as a red link
- Click the red link, accept or change the suggested path, and confirm the new file is created and opened

**Approval bar**
- Link creation is keyboard-first and reliable
- Unresolved links are obvious without being destructive

---

## Milestone 3 — Backlink Graph Core

**Goal:** Ship the first full graph-capable vertical slice for writers and agents.

**Scope**
- Add `BacklinkIndex` in server
- Extract wikilinks from ProseMirror JSON in `onStoreDocument`
- Rebuild index on startup from disk
- Add explicit extraction in the file-watcher path for external edits
- Store context snippets with backlink entries
- Persist derived index cache to `.openknowledge/cache/<branch>/backlinks.json`
- Add backlinks panel at the bottom of articles
- Add HTTP endpoints:
  - `/api/backlinks`
  - `/api/forward-links`
  - `/api/orphans`
  - `/api/hubs`
- Add MCP tools:
  - `get_backlinks`
  - `get_forward_links`
  - `get_orphans`
  - `get_hubs`

**Out of scope**
- rename propagation
- reference-definition portability footer
- `suggest_links`

**Primary files**
- `packages/server/src/backlink-index.ts`
- `packages/server/src/persistence.ts`
- `packages/server/src/file-watcher.ts`
- `packages/server/src/external-change.ts`
- `packages/server/src/api-extension.ts`
- `packages/cli/src/mcp/tools.ts`
- `packages/app/src/components/BacklinksPanel.tsx`

**Tests**
- backlink extraction from saved documents
- startup rebuild from markdown on disk
- file-watcher-triggered reindex
- HTTP/MCP endpoint coverage
- context snippet extraction behavior

**Manual QA**
- Create 3-5 pages with links between them
- Verify backlinks panel contents and snippets
- Restart the server and confirm the graph rebuilds correctly
- Query the HTTP or MCP endpoints and confirm they match the files

**Approval bar**
- Backlinks panel is trustworthy
- Core graph endpoints produce stable, correct answers

---

## Milestone 4 — Portability + Graph Polish

**Goal:** Improve plain-markdown portability and add graph utility beyond raw degree queries.

**Scope**
- Generate deterministic reference-definition footers on save
- Regenerate the footer block on every save without duplicating stale entries
- Add deterministic `suggest_links(page)` implementation
- Finalize section-link resolution polish, including duplicate-heading slug behavior

**Out of scope**
- rename resilience implementation
- ambiguity review UI

**Primary files**
- `packages/server/src/persistence.ts`
- `packages/server/src/backlink-index.ts`
- `packages/cli/src/mcp/tools.ts`
- tests around reference-definition generation and section-link slugging

**Tests**
- footer generation is deterministic and idempotent
- bare and section links get usable reference definitions
- duplicate headings resolve using GitHub-style disambiguated slugs
- `suggest_links` finds unlinked mentions deterministically

**Manual QA**
- Save a page with wikilinks and inspect the generated footer definitions
- Confirm bare and section links are clickable in a standard markdown renderer
- Run `suggest_links` on a page with obvious unlinked mentions

**Approval bar**
- Source files stay readable
- Portability layer is useful without changing the authored wikilink format

---

## Milestone 5 — Rename Resilience

**Goal:** Make page and section links survive renames in the supported P0 flows.

**Scope**
- Add first-class managed rename/move flow in app/server
- Rewrite inbound page links atomically on managed rename
- Rewrite inbound section links atomically on managed heading rename
- Add watcher-side reconciliation for external filesystem renames:
  - delete tombstones
  - last-known document metadata
  - high-confidence delete/create pairing
  - auto-rewrite only on high-confidence matches
- Persist low-confidence ambiguity records to:
  - `.openknowledge/cache/<branch>/rename-ambiguities.json`
- No GUI review flow in this milestone

**Primary files**
- `packages/server/src/file-watcher.ts`
- `packages/server/src/external-change.ts`
- `packages/server/src/persistence.ts`
- new server rename/move API surface
- app rename/move trigger surface

**Tests**
- managed page rename updates inbound links
- managed heading rename updates inbound section links
- exact-match external file rename is auto-reconciled
- ambiguous delete/create does not rewrite links and produces an ambiguity record

**Manual QA**
- Rename a page through the managed flow and confirm inbound links update
- Rename a heading and confirm inbound section links update
- Rename a file on disk with unchanged contents and confirm high-confidence rewrite
- Trigger an ambiguous external case and confirm no rewrite occurs, but an ambiguity record is written

**Approval bar**
- Managed rename path is trustworthy
- External rename fallback is conservative and does not corrupt links

---

## Recommended sequence

1. Milestone 1 proves the irreversible storage and round-trip decisions.
2. Milestone 2 makes the feature usable for writers.
3. Milestone 3 delivers the first meaningful graph feature set for both UI and MCP.
4. Milestone 4 improves portability and utility without increasing operational risk.
5. Milestone 5 adds the highest-risk operational resilience work after the graph foundation is already working.

---

## Review guidance

- PR 1 should be reviewed mainly as a schema/markdown contract change.
- PR 2 should be reviewed mainly as an editor UX change.
- PR 3 should be reviewed mainly as a server-derived-data and MCP correctness change.
- PR 4 should be reviewed mainly by inspecting generated markdown and deterministic graph behavior.
- PR 5 should be reviewed mainly as an operational safety and reconciliation change.
