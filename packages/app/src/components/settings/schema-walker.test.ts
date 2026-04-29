/**
 * Pure tests for the schema-walker helpers. Runs against the real
 * `ConfigSchema` from `@inkeep/open-knowledge-core` (US-002), so any drift
 * between the published schema and the form's introspection surfaces here.
 */

import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from '@inkeep/open-knowledge-core';
import {
  buildPatch,
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  pathHasValue,
  readPath,
  resolveLeafSchema,
} from './schema-walker';

describe('buildPatch', () => {
  test('single-segment path', () => {
    expect(buildPatch(['theme'], 'dark')).toEqual({ theme: 'dark' });
  });

  test('nested path produces nested object', () => {
    expect(buildPatch(['mcp', 'tools', 'search', 'maxResults'], 100)).toEqual({
      mcp: { tools: { search: { maxResults: 100 } } },
    });
  });

  test('null preserved (RFC 7396 spirit)', () => {
    expect(buildPatch(['appearance', 'theme'], null)).toEqual({
      appearance: { theme: null },
    });
  });

  test('throws on empty path', () => {
    expect(() => buildPatch([], 'x')).toThrow();
  });
});

describe('readPath / pathHasValue', () => {
  const sample = {
    mcp: { tools: { search: { maxResults: 50 } } },
    appearance: {},
  };

  test('readPath traverses object path', () => {
    expect(readPath(sample, ['mcp', 'tools', 'search', 'maxResults'])).toBe(50);
  });

  test('readPath returns undefined for missing leaf', () => {
    expect(readPath(sample, ['mcp', 'tools', 'missing'])).toBeUndefined();
  });

  test('pathHasValue is true for set keys', () => {
    expect(pathHasValue(sample, ['mcp', 'tools'])).toBe(true);
    expect(pathHasValue(sample, ['mcp', 'tools', 'search', 'maxResults'])).toBe(true);
  });

  test('pathHasValue is false for missing keys', () => {
    expect(pathHasValue(sample, ['appearance', 'theme'])).toBe(false);
    expect(pathHasValue(sample, ['github', 'oauthAppClientId'])).toBe(false);
  });
});

function requireLeaf(path: readonly string[]) {
  const leaf = resolveLeafSchema(ConfigSchema, path);
  if (!leaf) throw new Error(`expected leaf at ${path.join('.')}`);
  return leaf;
}

describe('resolveLeafSchema against ConfigSchema', () => {
  test('descends through .default() wrappers', () => {
    expect(getLeafTypeTag(requireLeaf(['content', 'dir']))).toBe('string');
  });

  test('descends to a number leaf', () => {
    const tag = getLeafTypeTag(requireLeaf(['mcp', 'tools', 'search', 'maxResults']));
    // Could be 'number' or 'int' depending on Zod's representation
    expect(['number', 'int', 'integer'].includes(tag ?? '')).toBe(true);
  });

  test('descends to a boolean leaf', () => {
    expect(getLeafTypeTag(requireLeaf(['mcp', 'autoStart']))).toBe('boolean');
  });

  test('descends to an enum leaf and returns options', () => {
    const leaf = requireLeaf(['appearance', 'theme']);
    expect(getLeafTypeTag(leaf)).toBe('enum');
    expect(getEnumOptions(leaf)).toEqual(['light', 'dark', 'system']);
  });

  test('descends to an array leaf', () => {
    expect(getLeafTypeTag(requireLeaf(['content', 'include']))).toBe('array');
  });

  test('returns undefined for non-existent path', () => {
    expect(resolveLeafSchema(ConfigSchema, ['does', 'not', 'exist'])).toBeUndefined();
  });
});

describe('getFieldDefault against ConfigSchema', () => {
  test('returns scalar defaults for defaulted leaves', () => {
    expect(getFieldDefault(requireLeaf(['content', 'dir']))).toBe('.');
    expect(getFieldDefault(requireLeaf(['server', 'host']))).toBe('localhost');
    expect(getFieldDefault(requireLeaf(['mcp', 'tools', 'search', 'maxResults']))).toBe(50);
  });

  test('returns array defaults', () => {
    expect(getFieldDefault(requireLeaf(['content', 'exclude']))).toEqual([]);
  });

  test('returns undefined for fields without .default() (D55 dual-track)', () => {
    expect(getFieldDefault(requireLeaf(['appearance', 'theme']))).toBeUndefined();
    expect(getFieldDefault(requireLeaf(['appearance', 'editorModeDefault']))).toBeUndefined();
  });
});
