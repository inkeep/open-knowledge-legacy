import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema';

describe('ConfigSchema', () => {
  test('empty object returns all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.content.dir).toBe('.');
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
    expect(config.content.dir).toBe('.'); // other section default preserved
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

  test('content.include and content.exclude pass loose-mode (removed from schema)', () => {
    // `content.include` / `content.exclude` were removed from `ConfigSchema`;
    // path rules now live in `.okignore` files. Existing keys parse silently
    // via `z.looseObject` so existing configs don't crash; the loader's
    // REMOVED_KEY check rejects them at the YAML layer with a migration hint.
    const result = ConfigSchema.safeParse({
      content: { include: ['**/*.md'], exclude: ['drafts/**'] },
    });
    expect(result.success).toBe(true);
  });

  test('content.dir is preserved', () => {
    const config = ConfigSchema.parse({
      content: { dir: 'docs' },
    });
    expect(config.content.dir).toBe('docs');
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

  // `folders` was removed from ConfigSchema in spec
  // 2026-05-01-folder-level-metadata-and-templates (FR8). Folder defaults
  // live in nested `<folder>/.ok/frontmatter.yml` files; FolderRuleSchema
  // + FolderFrontmatterSchema exports remain for set_folder_rule's helper
  // shapes, but they no longer correspond to a top-level config field.
  // Loose-mode behavior on unknown top-level keys is covered separately.
});

describe('ConfigSchema (upload surface removed per 2026-04-24 amendment)', () => {
  test('legacy upload.* keys parse cleanly without throwing', () => {
    // The `upload.*` user-facing config surface was removed entirely in the
    // 2026-04-24 amendment (zero user-facing upload config; all values are
    // module-level constants in `@inkeep/open-knowledge-core`). Legacy
    // configs still carrying any `upload.*` shape parse cleanly because the
    // schema is `z.looseObject` (post-#356 config-edit-paths) — unknown
    // keys are preserved on the parsed result rather than stripped, but
    // they are not consumed by any code that reads the schema. The
    // `loader.ts` deprecation WARN surfaces them at load time so users
    // notice the dead config. The input is typed as `unknown` rather than
    // the Zod-inferred shape because the point of the test is to exercise
    // legacy-key acceptance.
    const legacyInput: unknown = {
      upload: {
        attachmentFolderPath: 'attachments',
        emitFormat: 'markdown-image',
        maxBytes: 104857600,
        dedup: { mode: 'off', ui: 'silent' },
        wikiEmbedExtensions: ['png', 'pdf'],
      },
    };
    expect(() => ConfigSchema.parse(legacyInput)).not.toThrow();
  });
});
