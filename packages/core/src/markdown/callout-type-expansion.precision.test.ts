import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findCalloutType(json: JSONContent): string | null {
  if (json.attrs?.componentName === 'Callout' || json.attrs?.componentName === 'GFMCallout') {
    const props = (json.attrs.props as Record<string, unknown> | undefined) ?? {};
    return typeof props.type === 'string' ? props.type : null;
  }
  for (const child of json.content ?? []) {
    const t = findCalloutType(child);
    if (t !== null) return t;
  }
  return null;
}

function findCalloutAuthoredAs(json: JSONContent): string | null {
  if (json.attrs?.componentName === 'Callout' || json.attrs?.componentName === 'GFMCallout') {
    const props = (json.attrs.props as Record<string, unknown> | undefined) ?? {};
    const v = props['data-authored-as'];
    return typeof v === 'string' ? v : null;
  }
  for (const child of json.content ?? []) {
    const v = findCalloutAuthoredAs(child);
    if (v !== null) return v;
  }
  return null;
}

const NEW_FIRST_CLASS_TYPES = [
  'abstract',
  'info',
  'todo',
  'success',
  'question',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const;

describe('callout type expansion — first-class round-trip', () => {
  for (const type of NEW_FIRST_CLASS_TYPES) {
    test(`\`> [!${type}]\` parses + round-trips byte-stable`, () => {
      const src = `> [!${type}]\n> body\n`;
      const json = mdManager.parse(src);
      expect(findCalloutType(json)).toBe(type);
      expect(mdManager.serialize(json)).toBe(src);
    });
  }

  test('GFM 5 types still round-trip byte-stable (regression guard)', () => {
    for (const type of ['note', 'tip', 'important', 'warning', 'caution']) {
      const src = `> [!${type}]\n> body\n`;
      const json = mdManager.parse(src);
      expect(findCalloutType(json)).toBe(type);
      expect(mdManager.serialize(json)).toBe(src);
    }
  });

  test('first-class type with title round-trips', () => {
    const src = '> [!success] Step complete\n> body\n';
    const json = mdManager.parse(src);
    expect(findCalloutType(json)).toBe('success');
    expect(mdManager.serialize(json)).toBe(src);
  });
});

describe('callout type expansion — alias resolution', () => {
  const ALIAS_CASES: Array<[alias: string, canonical: string]> = [
    ['summary', 'abstract'],
    ['tldr', 'abstract'],
    ['check', 'success'],
    ['done', 'success'],
    ['help', 'question'],
    ['faq', 'question'],
    ['fail', 'failure'],
    ['missing', 'failure'],
    ['error', 'danger'],
    ['cite', 'quote'],
    ['idea', 'tip'],
    ['hint', 'tip'],
    ['warn', 'warning'],
    ['attention', 'warning'],
  ];

  for (const [alias, canonical] of ALIAS_CASES) {
    test(`alias \`${alias}\` resolves to \`${canonical}\` on parse`, () => {
      const json = mdManager.parse(`> [!${alias}]\n> body\n`);
      expect(findCalloutType(json)).toBe(canonical);
      expect(findCalloutAuthoredAs(json)).toBe(alias);
    });

    test(`alias \`${alias}\` round-trips byte-stable (data-authored-as preserved)`, () => {
      const src = `> [!${alias}]\n> body\n`;
      expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
    });
  }
});

describe('callout type expansion — foldable markers on new types', () => {
  for (const type of NEW_FIRST_CLASS_TYPES) {
    test(`\`> [!${type}]+\` (open foldable) round-trips`, () => {
      const src = `> [!${type}]+\n> body\n`;
      expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
    });

    test(`\`> [!${type}]-\` (closed foldable) round-trips`, () => {
      const src = `> [!${type}]-\n> body\n`;
      expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
    });
  }

  test('`> [!quote]+ Title` (open foldable + title) round-trips', () => {
    const src = '> [!quote]+ A pull-quote\n> body\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('callout type expansion — GFM/Obsidian conflict resolution', () => {
  test('`important` stays first-class (OK keeps GFM semantics, not Obsidian alias to `tip`)', () => {
    const json = mdManager.parse('> [!important]\n> body\n');
    expect(findCalloutType(json)).toBe('important');
  });

  test('`caution` stays first-class (OK keeps GFM semantics, not Obsidian alias to `warning`)', () => {
    const json = mdManager.parse('> [!caution]\n> body\n');
    expect(findCalloutType(json)).toBe('caution');
  });
});

describe('callout type expansion — unknown tokens still fall back', () => {
  test('unknown type `> [!mystery]` falls back to `note` (existing contract)', () => {
    const json = mdManager.parse('> [!mystery]\n> body\n');
    expect(findCalloutType(json)).toBe('note');
    expect(findCalloutAuthoredAs(json)).toBe('mystery');
  });
});
