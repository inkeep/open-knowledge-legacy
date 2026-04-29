import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema';

describe('ConfigSchema', () => {
  test('empty object returns all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.content.exclude).toEqual([]);
    expect(config.server.host).toBe('localhost');
    expect(config.server.openOnAgentEdit).toBe(false);
    expect(config.mcp.autoStart).toBe(true);
    expect(config.appearance.theme).toBeUndefined();
    expect(config.appearance.editorModeDefault).toBeUndefined();
  });

  test('stale dropped fields (sync.*, persistence.debounceMs, server.port) pass loose-mode without throwing (D34)', () => {
    // Per D29 the schema dropped these fields. With z.looseObject (D34) the
    // loader accepts them; users mid-upgrade aren't broken. The codemod
    // (`ok config migrate`) is the proactive cleanup path.
    const result = ConfigSchema.safeParse({
      sync: { pushIntervalSeconds: 30, autoCommit: true },
      persistence: { debounceMs: 2000 },
      server: { port: 3000, host: 'example.dev' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Known fields still resolve normally.
      expect(result.data.server.host).toBe('example.dev');
    }
  });

  test('mcp.autoStart: false is accepted', () => {
    const config = ConfigSchema.parse({ mcp: { autoStart: false } });
    expect(config.mcp.autoStart).toBe(false);
  });

  test('mcp section absent parses with autoStart: true default', () => {
    const config = ConfigSchema.parse({});
    expect(config.mcp.autoStart).toBe(true);
  });

  test('partial override preserves other defaults', () => {
    const config = ConfigSchema.parse({
      server: { host: '0.0.0.0' },
    });
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.openOnAgentEdit).toBe(false); // default preserved
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']); // other section default preserved
  });

  test('invalid host type produces error', () => {
    const result = ConfigSchema.safeParse({
      server: { host: 12345 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('host');
    }
  });

  test('appearance.theme accepts the enum values', () => {
    for (const theme of ['light', 'dark', 'system'] as const) {
      const config = ConfigSchema.parse({ appearance: { theme } });
      expect(config.appearance.theme).toBe(theme);
    }
  });

  test('appearance.theme rejects values outside the enum', () => {
    const result = ConfigSchema.safeParse({ appearance: { theme: 'midnight' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('theme');
    }
  });

  test('appearance.editorModeDefault accepts wysiwyg | source', () => {
    for (const mode of ['wysiwyg', 'source'] as const) {
      const config = ConfigSchema.parse({ appearance: { editorModeDefault: mode } });
      expect(config.appearance.editorModeDefault).toBe(mode);
    }
  });

  test('custom include patterns override defaults', () => {
    const config = ConfigSchema.parse({
      content: {
        include: ['**/*.md', '**/*.mdx'],
      },
    });
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.content.exclude).toEqual([]);
  });

  test('empty include array produces error', () => {
    const result = ConfigSchema.safeParse({
      content: { include: [] },
    });
    expect(result.success).toBe(false);
  });

  test('custom exclude patterns', () => {
    const config = ConfigSchema.parse({
      content: {
        exclude: ['node_modules/**', '.claude/**'],
      },
    });
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']); // default preserved
    expect(config.content.exclude).toEqual(['node_modules/**', '.claude/**']);
  });

  test('preview block absent parses to empty default', () => {
    const config = ConfigSchema.parse({});
    expect(config.preview).toEqual({});
  });

  test('preview.baseUrl with valid URL is accepted', () => {
    const config = ConfigSchema.parse({
      preview: { baseUrl: 'https://wiki.acme.com' },
    });
    expect(config.preview?.baseUrl).toBe('https://wiki.acme.com');
  });

  test('preview.baseUrl with invalid URL fails parsing', () => {
    const result = ConfigSchema.safeParse({
      preview: { baseUrl: 'not a url' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('baseUrl');
    }
  });

  test('preview object without baseUrl is accepted', () => {
    const config = ConfigSchema.parse({ preview: {} });
    expect(config.preview?.baseUrl).toBeUndefined();
  });

  test('folders omitted parses to empty array default', () => {
    const config = ConfigSchema.parse({});
    expect(config.folders).toEqual([]);
  });

  test('valid folders rule with all frontmatter fields parses', () => {
    const config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: {
            title: 'Specs',
            description: 'Specification docs',
            tags: ['spec', 'doc'],
          },
        },
      ],
    });
    expect(config.folders).toHaveLength(1);
    expect(config.folders[0]).toEqual({
      match: 'specs/**',
      frontmatter: {
        title: 'Specs',
        description: 'Specification docs',
        tags: ['spec', 'doc'],
      },
    });
  });

  test('folders rule with only some frontmatter fields parses', () => {
    const config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { title: 'Specs' } }],
    });
    expect(config.folders[0].frontmatter.title).toBe('Specs');
    expect(config.folders[0].frontmatter.description).toBeUndefined();
    expect(config.folders[0].frontmatter.tags).toBeUndefined();
  });

  test('folders rule with unknown frontmatter field passes (loose-mode per D34)', () => {
    // Per D34 every z.object → z.looseObject. Unknown keys pass through and
    // (when round-tripped via yaml@2 Document layer) are preserved on disk.
    // Round-trip preservation is verified in `applyFolderRulesUpsert` tests.
    const result = ConfigSchema.safeParse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs', icon: 'book' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('folders rule with unknown top-level field passes (loose-mode per D34)', () => {
    const result = ConfigSchema.safeParse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs' },
          extra: 'nope',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('folders rule with empty match string fails', () => {
    const result = ConfigSchema.safeParse({
      folders: [{ match: '', frontmatter: { title: 'Specs' } }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('match'))).toBe(true);
    }
  });

  test('folders rule missing frontmatter field fails', () => {
    const result = ConfigSchema.safeParse({
      folders: [{ match: 'specs/**' }],
    });
    expect(result.success).toBe(false);
  });
});
