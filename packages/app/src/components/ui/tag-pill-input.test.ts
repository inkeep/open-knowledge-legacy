/**
 * Source-level guards for TagPillInput.
 *
 * Repo convention (see `SettingsPane.test.ts`, `CommandPalette.test.ts`):
 * full DOM + interaction coverage lives in Playwright stress tests; unit
 * tests assert the export shape and structural invariants that a
 * non-keyboard-aware refactor would silently break.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'tag-pill-input.tsx'), 'utf8');

describe('TagPillInput module', () => {
  test('exports TagPillInput component', async () => {
    const mod = await import('./tag-pill-input');
    expect(typeof mod.TagPillInput).toBe('function');
  });
});

describe('TagPillInput source-level guards', () => {
  test('handles Enter / comma / Tab key commits', () => {
    expect(SRC).toContain("e.key === 'Enter'");
    expect(SRC).toContain("e.key === ','");
    expect(SRC).toContain("e.key === 'Tab'");
  });

  test('Tab with non-empty draft commits AND prevents default focus shift', () => {
    // Locate the Tab branch and verify both `addTag(draft)` and
    // `e.preventDefault()` live inside it. A refactor that drops the
    // preventDefault would silently break the "commit on Tab" UX (focus
    // jumps before commit registers).
    const tabIdx = SRC.indexOf("e.key === 'Tab'");
    expect(tabIdx).toBeGreaterThan(-1);
    // The matching `else if` block runs from `} else if (e.key === 'Tab')`
    // through the next `} else if`. Slice that range and assert.
    const after = SRC.slice(tabIdx);
    const nextElseIdx = after.indexOf('} else if');
    const branch = nextElseIdx > -1 ? after.slice(0, nextElseIdx) : after;
    expect(branch).toContain('e.preventDefault()');
    expect(branch).toContain('addTag(draft)');
  });

  test('handles Backspace-on-empty pill removal', () => {
    expect(SRC).toContain("e.key === 'Backspace'");
    expect(SRC).toContain("draft === ''");
    expect(SRC).toContain('value.length > 0');
    expect(SRC).toContain('removeAt(value.length - 1)');
  });

  test('dedupes duplicate tags', () => {
    expect(SRC).toContain('value.includes(tag)');
  });

  test('renders Badge pills with Remove buttons and aria-label', () => {
    expect(SRC).toContain('Badge');
    // Regex (not toContain) to avoid biome's noTemplateCurlyInString warning
    // on a string literal containing `${...}`.
    expect(SRC).toMatch(/aria-label=\{`Remove \$\{tag\}`\}/);
  });

  test('inner input forwards id + aria-describedby + aria-invalid', () => {
    // Each must land on the JSX `<input>` — locate the element opening
    // (with a newline-attribute pattern so the `<input>` mention in the
    // docstring is skipped), then slice through to the closing `/>`.
    const inputOpen = SRC.search(/<input\n\s+/);
    expect(inputOpen).toBeGreaterThan(-1);
    const inputClose = SRC.indexOf('/>', inputOpen);
    const inputBody = SRC.slice(inputOpen, inputClose);
    expect(inputBody).toContain('id={id}');
    expect(inputBody).toContain('aria-describedby={ariaDescribedBy}');
    expect(inputBody).toContain('aria-invalid={ariaInvalid}');
  });

  test('wrapper carries data-slot="tag-pill-input" and aria-invalid for visual ring', () => {
    expect(SRC).toContain('data-slot="tag-pill-input"');
    // The wrapper-level aria-invalid is the one that controls the
    // destructive ring via Tailwind `aria-invalid:` selectors. A refactor
    // that drops it (keeping only the input-level one) would visually
    // regress.
    expect(SRC).toMatch(
      /<div[\s\S]*?data-slot="tag-pill-input"[\s\S]*?aria-invalid=\{ariaInvalid\}/,
    );
  });

  test('auto-commits on blur with non-empty draft and forwards onBlur', () => {
    // Find the input's onBlur handler and assert it both commits and
    // forwards to the consumer's onBlur.
    const blurIdx = SRC.indexOf('onBlur={() =>');
    expect(blurIdx).toBeGreaterThan(-1);
    const after = SRC.slice(blurIdx);
    const blockEnd = after.indexOf('}}');
    const block = after.slice(0, blockEnd);
    expect(block).toContain('addTag(draft)');
    expect(block).toContain('onBlur?.()');
  });

  test('addTag clears the draft on dedup hit (no double commit)', () => {
    // The dedup branch must clear the draft so the input clears even
    // when the duplicate isn't appended. Without this, the input would
    // stay populated and feel broken.
    const includesIdx = SRC.indexOf('value.includes(tag)');
    expect(includesIdx).toBeGreaterThan(-1);
    const after = SRC.slice(includesIdx);
    const blockEnd = after.indexOf('}\n');
    const block = after.slice(0, blockEnd);
    expect(block).toContain("setDraft('')");
  });

  test('does NOT use forwardRef / memo / useMemo / useCallback (React Compiler)', () => {
    expect(SRC).not.toContain('forwardRef');
    // Tolerate the word `memo` appearing only inside comments/strings — but
    // the actual `memo(...)` import would be a regression.
    expect(SRC).not.toMatch(/\bmemo\s*\(/);
    expect(SRC).not.toContain('useMemo');
    expect(SRC).not.toContain('useCallback');
  });
});
