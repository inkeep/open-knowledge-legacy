import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { isKnownConfigError } from './errors.ts';
import { readConfigSafely } from './read-config-safely.ts';

let testDir: string;

beforeEach(() => {
  testDir = resolve(
    tmpdir(),
    `ok-readconfig-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readConfigSafely', () => {
  test('missing file → valid=true, value is schema defaults', () => {
    const result = readConfigSafely({ absPath: resolve(testDir, 'absent.yml') });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.source).toBeUndefined();
      expect(result.value.content.dir).toBe('.');
      expect(result.value.autoSync.enabled).toBeNull();
    }
  });

  test('valid file → valid=true, value is parsed config', () => {
    const path = resolve(testDir, 'good.yml');
    writeFileSync(path, 'content:\n  dir: docs\n', 'utf-8');
    const result = readConfigSafely({ absPath: path });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.content.dir).toBe('docs');
      expect(result.source).toBe(path);
    }
  });

  test('malformed YAML → valid=false, error.code=YAML_PARSE, file sidelined, value is defaults', () => {
    const path = resolve(testDir, 'broken.yml');
    writeFileSync(path, 'content:\n  dir: [invalid yaml', 'utf-8');
    const warnings: string[] = [];
    const result = readConfigSafely({
      absPath: path,
      timestamp: '2026-04-29T00-00-00-000Z',
      warn: (msg) => warnings.push(msg),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('YAML_PARSE');
      expect(result.value.content.dir).toBe('.'); // defaults
      expect(existsSync(path)).toBe(false);
      expect(result.sidelinedTo).toBeDefined();
      if (result.sidelinedTo) {
        expect(existsSync(result.sidelinedTo)).toBe(true);
        expect(result.sidelinedTo).toContain('.invalid-');
      }
    }
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('schema-invalid YAML → valid=false, error.code=SCHEMA_INVALID with structured issues + source', () => {
    const path = resolve(testDir, 'bad.yml');
    const yaml = `appearance:
  theme: midnight
`;
    writeFileSync(path, yaml, 'utf-8');
    const result = readConfigSafely({
      absPath: path,
      warn: () => {}, // silence
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      if (isKnownConfigError(result.error) && result.error.code === 'SCHEMA_INVALID') {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const issue = result.error.issues[0];
        expect(issue.path).toEqual(['appearance', 'theme']);
        expect(issue.source).toBeDefined();
        expect(issue.source?.file).toBe(path);
        expect(issue.source?.line).toBe(2);
      }
      expect(existsSync(path)).toBe(false);
      expect(result.sidelinedTo).toBeDefined();
    }
  });

  test('sideline=false leaves file in place when invalid', () => {
    const path = resolve(testDir, 'broken.yml');
    writeFileSync(path, 'content:\n  dir: [invalid yaml', 'utf-8');
    const result = readConfigSafely({
      absPath: path,
      sideline: false,
      warn: () => {},
    });
    expect(result.valid).toBe(false);
    expect(existsSync(path)).toBe(true);
    if (!result.valid) {
      expect(result.sidelinedTo).toBeUndefined();
    }
  });

  test('sideline rename failure logs warning and falls through (file stays in place)', () => {
    const path = resolve(testDir, 'broken.yml');
    writeFileSync(path, 'appearance:\n  theme: midnight\n', 'utf-8');
    const warnings: string[] = [];
    const result = readConfigSafely({
      absPath: path,
      sideline: false,
      warn: (m) => warnings.push(m),
    });
    expect(result.valid).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join('\n')).toContain('schema validation');
  });

  test('sidelined filename is filesystem-safe (no colons or dots from ISO timestamp)', () => {
    const path = resolve(testDir, 'broken.yml');
    writeFileSync(path, 'appearance:\n  theme: midnight\n', 'utf-8');
    const result = readConfigSafely({
      absPath: path,
      timestamp: '2026-04-29T01:23:45.678Z',
      warn: () => {},
    });
    expect(result.valid).toBe(false);
    if (!result.valid && result.sidelinedTo) {
      const tail = result.sidelinedTo.split('.invalid-')[1] ?? '';
      expect(tail.includes(':')).toBe(false);
    }
  });

  test('schema defaults are used regardless of failure mode', () => {
    const path = resolve(testDir, 'broken.yml');
    writeFileSync(path, 'appearance:\n  theme: midnight\n', 'utf-8');
    const result = readConfigSafely({ absPath: path, warn: () => {} });
    expect(result.valid).toBe(false);
    expect(result.value.content.dir).toBe('.'); // schema default
  });

  test('valid YAML with unknown fields (looseObject) is accepted', () => {
    const path = resolve(testDir, 'loose.yml');
    writeFileSync(path, 'sync:\n  pushIntervalSeconds: 30\ncontent:\n  dir: docs\n', 'utf-8');
    const result = readConfigSafely({ absPath: path });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.content.dir).toBe('docs');
    }
  });

  test('sideline does not run if input is valid', () => {
    const path = resolve(testDir, 'good.yml');
    writeFileSync(path, 'content:\n  dir: docs\n', 'utf-8');
    const result = readConfigSafely({ absPath: path });
    expect(result.valid).toBe(true);
    expect(existsSync(path)).toBe(true);
    const siblings = readdirSync(testDir).filter((f) => f.includes('.invalid-'));
    expect(siblings).toEqual([]);
    expect(readFileSync(path, 'utf-8')).toContain('dir: docs');
  });
});
