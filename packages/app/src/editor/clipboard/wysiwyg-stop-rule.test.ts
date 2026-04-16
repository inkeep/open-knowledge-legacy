/**
 * Mechanical guard for precedent #15(b) / D14 LOCKED:
 *
 *   "DOM-level `handleDOMEvents.copy/cut/dragstart` is prohibited on the
 *    WYSIWYG editor. WYSIWYG uses PM's documented clipboard hooks
 *    (`clipboardTextSerializer` + `clipboardSerializer` subclass) instead.
 *    Reverting to DOM-level override re-introduces the drag-and-drop
 *    coupling problem that caused D14 to flip to PM hooks."
 *
 * Other STOP rules in this codebase are enforced mechanically (e.g.
 * `syncTextToFragment` was deleted, `schema-invariant.test.ts` guards
 * schema narrowing). This test converts the prose rule into a grep-based
 * assertion so regressions fail CI instead of relying on reviewer vigilance.
 *
 * The assertion is intentionally string-based (not a full ProseMirror
 * instantiation) because the prohibition is about source-text presence in
 * a specific file, not about runtime behavior. A regex match is the
 * cheapest enforcement that catches both spellings (`.copy =` and
 * `copy:`).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIPTAP_EDITOR_PATH = join(__dirname, '..', 'TiptapEditor.tsx');

describe('WYSIWYG STOP rule — no handleDOMEvents.copy/cut/dragstart (precedent #15(b))', () => {
  const source = readFileSync(TIPTAP_EDITOR_PATH, 'utf-8');

  test('TiptapEditor.tsx does NOT register handleDOMEvents.copy', () => {
    // Both object-literal shorthand (`copy: handler`) inside a
    // `handleDOMEvents: { ... }` block and dotted-assignment
    // (`handleDOMEvents.copy = ...`) count as a violation.
    expect(source).not.toMatch(/handleDOMEvents\s*:\s*\{[^}]*\bcopy\s*:/);
    expect(source).not.toMatch(/handleDOMEvents\.copy\s*=/);
  });

  test('TiptapEditor.tsx does NOT register handleDOMEvents.cut', () => {
    expect(source).not.toMatch(/handleDOMEvents\s*:\s*\{[^}]*\bcut\s*:/);
    expect(source).not.toMatch(/handleDOMEvents\.cut\s*=/);
  });

  test('TiptapEditor.tsx does NOT register handleDOMEvents.dragstart', () => {
    expect(source).not.toMatch(/handleDOMEvents\s*:\s*\{[^}]*\bdragstart\s*:/);
    expect(source).not.toMatch(/handleDOMEvents\.dragstart\s*=/);
  });

  test('TiptapEditor.tsx DOES wire clipboardTextSerializer (PM-hook path)', () => {
    // Positive assertion: the replacement pattern must still be in place.
    expect(source).toContain('clipboardTextSerializer');
    expect(source).toContain('clipboardSerializer');
  });
});
