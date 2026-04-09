import { describe, expect, test } from 'bun:test';
import { ConfigSchema } from './schema';

describe('ConfigSchema', () => {
  test('empty object returns all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.content.dir).toBe('./content');
    expect(config.content.exclude).toEqual([]);
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('localhost');
    expect(config.git.enabled).toBe(true);
    expect(config.git.autosave).toBe(true);
    expect(config.git.commitDebounceMs).toBe(30000);
    expect(config.git.wipRef).toBe('refs/wip/main');
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.persistence.maxDebounceMs).toBe(10000);
    expect(config.editor.defaultMode).toBe('wysiwyg');
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

  test('invalid editor mode produces error', () => {
    const result = ConfigSchema.safeParse({
      editor: { defaultMode: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  test('accepts valid editor mode source', () => {
    const config = ConfigSchema.parse({
      editor: { defaultMode: 'source' },
    });
    expect(config.editor.defaultMode).toBe('source');
  });
});
