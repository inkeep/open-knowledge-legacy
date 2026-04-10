import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema';

describe('ConfigSchema', () => {
  test('empty object returns all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.content.dir).toBe('./content');
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('localhost');
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.persistence.maxDebounceMs).toBe(10000);
    expect(config.wiki.roots).toHaveLength(3);
    expect(config.wiki.include).toEqual(['**/*.md']);
    expect(config.wiki.exclude).toEqual([]);
  });

  test('partial override preserves other defaults', () => {
    const config = ConfigSchema.parse({
      server: { port: 4000 },
    });
    expect(config.server.port).toBe(4000);
    expect(config.server.host).toBe('localhost'); // default preserved
    expect(config.content.dir).toBe('./content'); // other section default preserved
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

  test('custom roots override defaults', () => {
    const config = ConfigSchema.parse({
      wiki: {
        roots: [{ path: './custom', label: 'Custom' }],
      },
    });
    expect(config.wiki.roots).toHaveLength(1);
    expect(config.wiki.roots[0]).toEqual({ path: './custom', label: 'Custom' });
  });

  test('empty roots array produces error', () => {
    const result = ConfigSchema.safeParse({
      wiki: { roots: [] },
    });
    expect(result.success).toBe(false);
  });

  test('root missing label produces error', () => {
    const result = ConfigSchema.safeParse({
      wiki: { roots: [{ path: './articles' }] },
    });
    expect(result.success).toBe(false);
  });
});
