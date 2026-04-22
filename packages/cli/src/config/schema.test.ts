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

describe('ConfigSchema.upload (FR-5)', () => {
  test('upload section omitted: all defaults populate', () => {
    const config = ConfigSchema.parse({});
    expect(config.upload.attachmentFolderPath).toBe('./');
    expect(config.upload.emitFormat).toBe('wikiembed');
    expect(config.upload.maxBytes).toBe(25 * 1024 * 1024);
    expect(config.upload.dedup.mode).toBe('same-dir');
    expect(config.upload.dedup.ui).toBe('toast');
    expect(config.upload.wikiEmbedExtensions).toEqual([
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'avif',
      'svg',
      'pdf',
      'mp4',
      'webm',
      'mov',
      'mp3',
      'wav',
      'ogg',
      'm4a',
    ]);
  });

  test('partial upload override preserves other defaults', () => {
    const config = ConfigSchema.parse({
      upload: { maxBytes: 104857600 },
    });
    expect(config.upload.maxBytes).toBe(104857600);
    expect(config.upload.emitFormat).toBe('wikiembed');
    expect(config.upload.dedup.mode).toBe('same-dir');
  });

  test('upload.maxBytes with string value fails with a Zod error naming the field', () => {
    const result = ConfigSchema.safeParse({
      upload: { maxBytes: 'big' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('maxBytes'))).toBe(true);
    }
  });

  test('upload.maxBytes with non-integer fails', () => {
    const result = ConfigSchema.safeParse({
      upload: { maxBytes: 10.5 },
    });
    expect(result.success).toBe(false);
  });

  test('upload.maxBytes with negative number fails', () => {
    const result = ConfigSchema.safeParse({
      upload: { maxBytes: -1 },
    });
    expect(result.success).toBe(false);
  });

  test('upload.emitFormat accepts markdown-image', () => {
    const config = ConfigSchema.parse({
      upload: { emitFormat: 'markdown-image' },
    });
    expect(config.upload.emitFormat).toBe('markdown-image');
  });

  test('upload.emitFormat rejects unknown values', () => {
    const result = ConfigSchema.safeParse({
      upload: { emitFormat: 'html-image' },
    });
    expect(result.success).toBe(false);
  });

  test('upload.dedup.mode accepts off', () => {
    const config = ConfigSchema.parse({
      upload: { dedup: { mode: 'off' } },
    });
    expect(config.upload.dedup.mode).toBe('off');
    expect(config.upload.dedup.ui).toBe('toast');
  });

  test('upload.dedup.ui accepts silent (D-B escape hatch)', () => {
    const config = ConfigSchema.parse({
      upload: { dedup: { ui: 'silent' } },
    });
    expect(config.upload.dedup.ui).toBe('silent');
    expect(config.upload.dedup.mode).toBe('same-dir');
  });

  test('upload.dedup.ui accepts confirm (D-B escape hatch)', () => {
    const config = ConfigSchema.parse({
      upload: { dedup: { ui: 'confirm' } },
    });
    expect(config.upload.dedup.ui).toBe('confirm');
  });

  test('upload.dedup.ui rejects unknown values', () => {
    const result = ConfigSchema.safeParse({
      upload: { dedup: { ui: 'loud' } },
    });
    expect(result.success).toBe(false);
  });

  test('upload.attachmentFolderPath accepts Obsidian-style values', () => {
    // Per D-J, this is a free-form string matching Obsidian's literal schema.
    // "/" (vault root), "./" (co-located), "./subdir", "attachments" (global).
    const cases = ['/', './', './attachments', 'attachments'];
    for (const value of cases) {
      const config = ConfigSchema.parse({
        upload: { attachmentFolderPath: value },
      });
      expect(config.upload.attachmentFolderPath).toBe(value);
    }
  });

  test('upload.wikiEmbedExtensions accepts a custom allowlist', () => {
    const config = ConfigSchema.parse({
      upload: { wikiEmbedExtensions: ['png', 'pdf', 'mp4'] },
    });
    expect(config.upload.wikiEmbedExtensions).toEqual(['png', 'pdf', 'mp4']);
  });

  test('upload.wikiEmbedExtensions accepts empty array', () => {
    // Empty allowlist is a valid operator choice — every drop emits as
    // opaque markdown-link, which is a defensible posture for strict vaults.
    const config = ConfigSchema.parse({
      upload: { wikiEmbedExtensions: [] },
    });
    expect(config.upload.wikiEmbedExtensions).toEqual([]);
  });

  test('D-M no longer exposes allowedMimeTypes (removed 2026-04-21)', () => {
    // Operator cannot tune a MIME allowlist post-D-M accept-all. If this
    // test fails because the schema accepts the field, D-M was reversed
    // without updating this guard — reopen the decision.
    const config = ConfigSchema.parse({
      // biome-ignore lint/suspicious/noExplicitAny: intentional cast to assert shape
      upload: { allowedMimeTypes: ['image/png'] } as any,
    });
    // Zod strip mode silently drops unknown keys by default; assert the
    // parsed output does NOT carry the removed field.
    expect(Object.hasOwn(config.upload, 'allowedMimeTypes')).toBe(false);
  });
});
