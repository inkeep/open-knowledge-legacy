---
name: r21-schema-rename-smoke
date: 2026-04-13
sources:
  - tmp/ship/qa-progress.json (Phase 7 automated QA results)
  - packages/core/src/extensions/emphasis-fidelity.ts (renamed source)
  - packages/core/src/extensions/thematic-break-fidelity.ts (renamed source)
  - R21, D16, D17 in SPEC.md
---

# R21 Schema Rename Smoke Test Evidence

**Requirement:** R21 acceptance — "smoke test the editor end-to-end after the rename: Cmd-B bolds, bubble menu highlights, serialization emits `**x**`, round-trip byte-identical — all 4 pass. Land smoke results as evidence."

## Verification method

Automated Playwright-driven QA run (Phase 7 of the ship loop) drove the live editor on the migration branch after the rename commit landed. The QA harness exercised each R21 smoke item as a standalone scenario against `cd packages/app && bun run dev` (http://localhost:5173).

## Results (all 4 items: PASS)

### QA-009 — Cmd-B applies bold with schema name `'strong'`

- **Given:** Editor loaded, cursor placed in non-formatted text
- **When:** User presses Cmd-B, types characters, releases Cmd-B
- **Then:** Typed characters have `strong` mark applied (verified via `editor.isActive('strong')` → `true`; `editor.isActive('bold')` → `false` — confirming D16 rename is live)
- **Status:** VALIDATED

### QA-010 — Cmd-I applies italic with schema name `'emphasis'`

- **Given:** Editor loaded, cursor in non-formatted text
- **When:** User presses Cmd-I, types characters
- **Then:** `emphasis` mark applied; `editor.isActive('emphasis')` → `true`; `editor.isActive('italic')` → `false`
- **Status:** VALIDATED

### QA-011 — Bubble menu highlights bold/italic buttons when cursor is in formatted text

- **Given:** Editor loaded with a bolded and italicized run present
- **When:** Cursor is placed inside the bolded run; bubble menu opens
- **Then:** The bold button renders in active state (styled per `.is-active` CSS class); same for italic button when cursor is in emphasized run
- **Component path:** `packages/app/src/components/bubble-menu/InlineFormatButtons.tsx` — updated in US-010 cutover to call `editor.isActive('strong')` / `editor.isActive('emphasis')` against the new schema names
- **Status:** VALIDATED

### R21(4) — Serialization of a bolded run emits `**text**`; round-trip byte-identical

- **Path tested:** WYSIWYG bold → Y.XmlFragment → Observer A → Y.Text (markdown source) → disk
- **Expected output:** `**bolded text**` on disk
- **Actual output:** `**bolded text**` — byte-identical
- **Reload round-trip:** Opening the saved file re-hydrates the bolded run in WYSIWYG with no diff (verified by bridge-matrix integration tests `packages/app/tests/integration/bridge-matrix.test.ts`, 17/17 tests pass against the new pipeline)
- **Status:** VALIDATED

## Surrounding QA scenarios (also validated)

- **QA-012** Thematic break via `---` input rule renders correctly (D17 rename `horizontalRule`→`thematicBreak` verified end-to-end)
- **QA-001** Full editing session: format, switch modes, verify round-trip (complete flow with renamed schema)

## StarterKit disable-key verification

The R21 rationale asserted that `StarterKit.configure({ bold: false, italic: false, horizontalRule: false })` disable keys remain **extension keys** (unchanged by the rename) rather than schema names. This was verified at cutover (commit `d9f24b4`) — the `packages/core/src/extensions/shared.ts` `StarterKit.configure` call retains `bold: false, italic: false, horizontalRule: false` and the renamed fidelity extensions (`StrongFidelity`, `EmphasisFidelity`, `ThematicBreakFidelity`) provide the actual schema nodes/marks. All 13 turbo tasks pass — if the assertion had been wrong (key was schema name), StarterKit's built-in extensions would still be registered and schema conflicts would have surfaced in `getSchema()`. They did not.

## Conclusion

All four R21 smoke items pass end-to-end on the live editor. The rename is functionally complete; WYSIWYG input (Cmd-B / Cmd-I / `---` input rule), bubble-menu state detection, on-disk serialization, and round-trip fidelity all operate correctly under the new `strong` / `emphasis` / `thematicBreak` schema names.

R21 acceptance: **PASS**.
