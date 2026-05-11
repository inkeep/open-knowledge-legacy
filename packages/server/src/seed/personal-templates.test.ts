import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { PERSONAL_TEMPLATE_NAMES, PERSONAL_TEMPLATES } from './personal-templates.ts';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

describe('PERSONAL_TEMPLATES — frontmatter parses cleanly', () => {
  let originalWarn: typeof console.warn;
  let warnings: unknown[][];

  beforeEach(() => {
    originalWarn = console.warn;
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  test.each(
    PERSONAL_TEMPLATE_NAMES,
  )('%s — frontmatter parses without YAML warnings, title is a string', (name) => {
    const raw = PERSONAL_TEMPLATES[name];
    expect(raw).toBeDefined();
    const match = raw?.match(FRONTMATTER_RE);
    expect(match).not.toBeNull();
    if (!match) return;

    let parsed: unknown;
    expect(() => {
      parsed = parseYaml(match[1] ?? '');
    }).not.toThrow();

    expect(warnings).toEqual([]);

    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
    expect(Array.isArray(parsed)).toBe(false);

    const fm = parsed as Record<string, unknown>;
    expect(typeof fm.title).toBe('string');
    expect((fm.title as string).length).toBeGreaterThan(0);

    const fmRaw = match[1] ?? '';
    const unquotedToken = fmRaw.match(/^[^:#\n]+:\s+[^'"#\n]*\{\{[^}]+\}\}/m);
    expect(unquotedToken).toBeNull();
  });
});
