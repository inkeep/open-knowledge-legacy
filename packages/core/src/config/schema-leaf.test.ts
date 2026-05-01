import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema.ts';
import { getLeafFieldMeta, resolveLeafSchema } from './schema-leaf.ts';

describe('resolveLeafSchema', () => {
  test('descends through .default() wrappers to top-level section', () => {
    const leaf = resolveLeafSchema(ConfigSchema, ['mcp']);
    expect(leaf).toBeDefined();
  });

  test('descends through nested wrappers to a registered scalar leaf', () => {
    const leaf = resolveLeafSchema(ConfigSchema, ['mcp', 'tools', 'search', 'maxResults']);
    expect(leaf).toBeDefined();
  });

  test('returns undefined for a missing key in the middle of the path', () => {
    const leaf = resolveLeafSchema(ConfigSchema, ['mcp', 'nope', 'maxResults']);
    expect(leaf).toBeUndefined();
  });

  test('returns undefined for a missing top-level key', () => {
    const leaf = resolveLeafSchema(ConfigSchema, ['nonExistentSection']);
    expect(leaf).toBeUndefined();
  });

  // `folders` array leaf was removed in spec
  // 2026-05-01-folder-level-metadata-and-templates (FR8). The
  // resolveLeafSchema implementation still needs to handle missing keys
  // (covered by 'returns undefined for a missing top-level key' above).
});

describe('getLeafFieldMeta', () => {
  test('returns metadata for an agent-settable scalar leaf', () => {
    const meta = getLeafFieldMeta(ConfigSchema, ['mcp', 'tools', 'search', 'maxResults']);
    expect(meta).toEqual({
      scope: 'either',
      agentSettable: true,
      defaultScope: 'user',
    });
  });

  // `folders` removed in FR8 of spec 2026-05-01-folder-level-metadata-and-templates.

  test('returns metadata for the project-strict preview.baseUrl leaf', () => {
    const meta = getLeafFieldMeta(ConfigSchema, ['preview', 'baseUrl']);
    expect(meta).toEqual({
      scope: 'project',
      agentSettable: false,
    });
  });

  test('returns metadata for non-agent-settable github.oauthAppClientId', () => {
    const meta = getLeafFieldMeta(ConfigSchema, ['github', 'oauthAppClientId']);
    expect(meta).toEqual({
      scope: 'either',
      agentSettable: false,
      defaultScope: 'user',
    });
  });

  test('returns undefined for an unresolved path', () => {
    const meta = getLeafFieldMeta(ConfigSchema, ['mcp', 'nonexistent']);
    expect(meta).toBeUndefined();
  });

  test('returns undefined for a non-leaf intermediate (object container without registered metadata)', () => {
    // `mcp.tools` is a container; its inner shape carries no fieldRegistry entry.
    const meta = getLeafFieldMeta(ConfigSchema, ['mcp', 'tools']);
    expect(meta).toBeUndefined();
  });
});
