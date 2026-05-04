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
    const result = ConfigSchema.safeParse({
      sync: { pushIntervalSeconds: 30, autoCommit: true },
      persistence: { debounceMs: 2000 },
      server: { port: 3000, host: 'example.dev' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
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
});

describe('ConfigSchema (upload surface removed per 2026-04-24 amendment)', () => {
  test('legacy upload.* keys parse cleanly without throwing', () => {
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
