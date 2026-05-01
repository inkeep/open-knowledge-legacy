
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIPTAP_EDITOR_PATH = join(__dirname, '..', 'TiptapEditor.tsx');

describe('WYSIWYG STOP rule — no handleDOMEvents.copy/cut/dragstart (precedent #19(b))', () => {
  const source = readFileSync(TIPTAP_EDITOR_PATH, 'utf-8');

  test('TiptapEditor.tsx does NOT register handleDOMEvents.copy', () => {
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
    expect(source).toContain('clipboardTextSerializer');
    expect(source).toContain('clipboardSerializer');
  });
});
