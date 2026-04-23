import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema';

describe('ConfigSchema', () => {
  test('empty object returns all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.content.exclude).toEqual([]);
    // Default 0 means kernel-allocated — `ok start` advertises the resolved
    // port via server.lock for MCP discovery.
    expect(config.server.port).toBe(0);
    expect(config.server.host).toBe('localhost');
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.persistence.maxDebounceMs).toBe(10000);
    expect(config.mcp.autoStart).toBe(true);
  });

  test('explicit server.port: 3000 still parses (backward compat)', () => {
    const config = ConfigSchema.parse({ server: { port: 3000 } });
    expect(config.server.port).toBe(3000);
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
      server: { port: 4000 },
    });
    expect(config.server.port).toBe(4000);
    expect(config.server.host).toBe('localhost'); // default preserved
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']); // other section default preserved
  });

  test('invalid port type produces error', () => {
    const result = ConfigSchema.safeParse({
      server: { port: 'not-a-number' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('port');
    }
  });

  test('port out of range produces error', () => {
    const result = ConfigSchema.safeParse({
      server: { port: 99999 },
    });
    expect(result.success).toBe(false);
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

  test('folders rule with unknown frontmatter field fails with field-path error', () => {
    const result = ConfigSchema.safeParse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs', icon: 'book' },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.code === 'unrecognized_keys');
      expect(issue).toBeDefined();
      expect((issue as { keys: string[] }).keys).toContain('icon');
      expect(issue?.path.join('.')).toBe('folders.0.frontmatter');
    }
  });

  test('folders rule with unknown top-level field fails (strict)', () => {
    const result = ConfigSchema.safeParse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specs' },
          extra: 'nope',
        },
      ],
    });
    expect(result.success).toBe(false);
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

describe('ConfigSchema (upload surface removed per 2026-04-24 amendment)', () => {
  test('legacy upload.* keys parse cleanly — Zod strips the whole section', () => {
    // The `upload.*` user-facing config surface was removed entirely in the
    // 2026-04-24 amendment (zero user-facing upload config; all values are
    // module-level constants in `@inkeep/open-knowledge-core`). Legacy
    // configs still carrying any `upload.*` shape parse cleanly because the
    // top-level object schema strips unknown keys by default. The input
    // object is typed as `unknown` rather than the Zod-inferred shape
    // because the point of the test is to exercise unknown-key stripping.
    const legacyInput: unknown = {
      upload: {
        attachmentFolderPath: 'attachments',
        emitFormat: 'markdown-image',
        maxBytes: 104857600,
        dedup: { mode: 'off', ui: 'silent' },
        wikiEmbedExtensions: ['png', 'pdf'],
      },
    };
    const config = ConfigSchema.parse(legacyInput);
    expect(Object.hasOwn(config, 'upload')).toBe(false);
  });
});
