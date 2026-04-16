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
});
