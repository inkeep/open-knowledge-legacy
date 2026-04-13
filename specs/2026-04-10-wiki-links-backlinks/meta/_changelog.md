# Changelog — Wiki-Links + Backlinks (S10)

## 2026-04-10 — Session 1

### Session context
- Started spec for Bucket 7 / S10 from STORIES.md seed
- Dispatched parallel: codebase exploration + research synthesis

### Evidence created
- `evidence/editor-integration-surface.md` — Codebase trace: extension registration, JsxComponent analogue, onStoreDocument hook, Y.Doc structure, MCP tool patterns, file watcher behavior
- `evidence/research-report-key-findings.md` — Synthesis from wiki-links-backlinks-architecture report (2026-04-04): link formats, backlink index architectures, editor integration, agent tools, rename resilience

### Critical finding (pre-decision)
- `@tiptap/markdown@3.22.3` depends on `marked@^17.0.1`, NOT remark or markdown-it. Research report discusses remark-wiki-link which is **not applicable**. Wiki-link markdown round-trip requires a custom marked inline extension. Marked v17 supports this via `marked.use({ extensions: [{ name, level: 'inline', ... }] })`.
- Whether @tiptap/markdown v3 exposes the marked instance for extension injection is UNCERTAIN — marked as top-priority investigation gap.

### Pending decisions
- D1: Markdown round-trip mechanism (marked inline extension) — technical viability gap at session close
- D2: Backlink index storage (in-memory vs JSON file vs Y.Map)
- D3: Rename resilience strategy (stable IDs vs name-based vs auto-update) — 1-way door
- D4: Syntax scope for P0 (bare `[[Page]]` only vs aliases + section links)
- D5: MCP tool count — M2' decision (10 cap vs 16 vs capability flag)
- D6: Reference definitions (git portability) — P0 or Future Work
- D7: Red link + click-to-create destination path

## 2026-04-10 — Session 2

### Evidence sync
- Verified the installed `@tiptap/markdown@3.22.3` source in `node_modules/.bun/@tiptap+markdown@3.22.3+25a64fe20fbde960/node_modules/@tiptap/markdown/src/MarkdownManager.ts` and `dist/index.js`.
- Confirmed that `MarkdownManager.registerExtension()` reads an extension's `markdownTokenizer` field and registers it with `marked.use({ extensions: [...] })`.

### Spec updates
- Removed the stale uncertainty marker from `evidence/editor-integration-surface.md` for inline tokenizer registration.
- Updated `evidence/research-report-key-findings.md` to reflect that inline wiki-link tokenization is confirmed on the current stack.
- Marked D1 in `SPEC.md` as resolved rather than pending.
- Normalized the changelog's pending-decision numbering to match the current `SPEC.md` decision log.
- Recorded user decisions for rename strategy, P0 syntax scope, MCP packaging direction, red-link create flow, and fuzzy autocomplete.
- Added two newly-unlocked P0 blockers to `SPEC.md`: rename guarantee scope (managed rename vs external watcher inference) and heading-anchor policy for section links.
- Recorded additional user decisions: reference definitions move into P0, and robust external filesystem rename propagation is also in P0.
- Added a new technical blocker to `SPEC.md`: implementation path for robust external rename propagation without a first-class rename event.
- Recorded user decision to include backlink context snippets in scope and documented the extraction path from ProseMirror JSON parent context.
- Recorded `7:A`: section links use text-derived anchors, not stable per-heading IDs.
- Documented that heading rename auto-update is compatible with text-derived anchors by rewriting inbound section links, and added duplicate-heading ambiguity as a follow-up question.
- Recorded duplicate-heading policy: use GitHub-style disambiguated slugs for section-link anchors.
- Added a near-term Future Work note for a disk-backed backlink store, likely SQLite, as the probable next scaling step after this spec for very large backlink networks.
- Recorded reference-definitions fidelity choice `1:B`: use pure footer definitions in P0 and defer any stronger preprocessing/export path for alias-fidelity polish.
- Added reference-definition evidence from local parser checks: bare and section links become clickable, but alias display fidelity is not preserved by pure footer definitions alone.
- Recorded deeper rename-propagation finding: U7.5 currently lacks any managed rename/move surface, so a first-class rename flow is likely required in P0, with watcher reconciliation as fallback for external filesystem changes.
- Recorded `1:A`: P0 now explicitly includes a first-class managed rename/move flow in app/server for intentional renames.
- Added concrete watcher-side fallback guidance: keep delete tombstones, pair delete+create by confidence tiers, auto-rewrite only on high-confidence matches, and treat low-confidence cases as ambiguous rather than rewriting blindly.
- Recorded final ambiguity fallback policy: persist low-confidence external rename candidates to `.open-knowledge/cache/<branch>/rename-ambiguities.json`, do not auto-rewrite them, and defer any GUI review surface to later work.
- Resolved the remaining non-blocking product calls directly in the spec: `suggest_links` stays deterministic text-match only, the backlinks panel is always visible at article bottom, and the file-watcher path performs explicit extraction instead of waiting for `onStoreDocument`.
- Marked `SPEC.md` status as Final and closed the spec with all tracked decisions resolved for implementation.
- Added `IMPLEMENTATION_MILESTONES.md` alongside the final spec, breaking S10 into 5 self-contained, reviewable PRs with explicit scope, test plan, and manual QA steps.
