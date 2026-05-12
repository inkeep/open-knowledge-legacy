import { describe, expect, test } from 'bun:test';
import SRC from './tag-pill-input?raw';

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
    const tabIdx = SRC.indexOf("e.key === 'Tab'");
    expect(tabIdx).toBeGreaterThan(-1);
    const after = SRC.slice(tabIdx);
    const nextElseIdx = after.indexOf('} else if');
    const branch = nextElseIdx > -1 ? after.slice(0, nextElseIdx) : after;
    expect(branch).toContain('e.preventDefault()');
    expect(branch).toContain('addTag(draft)');
  });

  test('comma always prevents default — even on empty draft (no literal comma in input)', () => {
    const commaIdx = SRC.indexOf("e.key === ','");
    expect(commaIdx).toBeGreaterThan(-1);
    const after = SRC.slice(commaIdx);
    const nextElseIdx = after.indexOf('} else if');
    const branch = nextElseIdx > -1 ? after.slice(0, nextElseIdx) : after;
    const preventIdx = branch.indexOf('e.preventDefault()');
    const trimIdx = branch.indexOf('draft.trim()');
    expect(preventIdx).toBeGreaterThan(-1);
    expect(trimIdx).toBeGreaterThan(-1);
    expect(preventIdx).toBeLessThan(trimIdx);
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
    expect(SRC).toMatch(/aria-label=\{`Remove \$\{tag\}`\}/);
  });

  test('inner input forwards id + ref + aria-describedby + aria-invalid', () => {
    const inputOpen = SRC.search(/<input\n\s+/);
    expect(inputOpen).toBeGreaterThan(-1);
    const inputClose = SRC.indexOf('/>', inputOpen);
    const inputBody = SRC.slice(inputOpen, inputClose);
    expect(inputBody).toContain('id={id}');
    expect(inputBody).toContain('ref={ref}');
    expect(inputBody).toContain('aria-describedby={ariaDescribedBy}');
    expect(inputBody).toContain('aria-invalid={ariaInvalid}');
  });

  test('wrapper carries data-slot="tag-pill-input" and aria-invalid for visual ring', () => {
    expect(SRC).toContain('data-slot="tag-pill-input"');
    expect(SRC).toMatch(
      /<div[\s\S]*?data-slot="tag-pill-input"[\s\S]*?aria-invalid=\{ariaInvalid\}/,
    );
  });

  test('auto-commits on blur with non-empty draft and forwards onBlur', () => {
    const blurIdx = SRC.indexOf('onBlur={() =>');
    expect(blurIdx).toBeGreaterThan(-1);
    const after = SRC.slice(blurIdx);
    const blockEnd = after.indexOf('}}');
    const block = after.slice(0, blockEnd);
    expect(block).toContain('addTag(draft)');
    expect(block).toContain('onBlur?.()');
  });

  test('addTag clears the draft on dedup hit (no double commit)', () => {
    const includesIdx = SRC.indexOf('value.includes(tag)');
    expect(includesIdx).toBeGreaterThan(-1);
    const after = SRC.slice(includesIdx);
    const blockEnd = after.indexOf('}\n');
    const block = after.slice(0, blockEnd);
    expect(block).toContain("setDraft('')");
  });
});
