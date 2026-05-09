import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendOkIgnoreSync } from './append-okignore.ts';

describe('appendOkIgnoreSync', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ok-append-okignore-'));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  test('empty-string patterns is a no-op (file is not created)', () => {
    appendOkIgnoreSync(dir, '');
    expect(existsSync(join(dir, '.okignore'))).toBe(false);
  });

  test('whitespace-only patterns is a no-op (file is not created)', () => {
    appendOkIgnoreSync(dir, '   \n\t  ');
    expect(existsSync(join(dir, '.okignore'))).toBe(false);
  });

  test('file-doesn-t-exist path: writes the patterns followed by exactly one trailing newline (no leading blank line)', () => {
    appendOkIgnoreSync(dir, 'tmp/\n*.draft.md');
    const out = readFileSync(join(dir, '.okignore'), 'utf8');
    expect(out).toBe('tmp/\n*.draft.md\n');
    expect(out.startsWith('\n')).toBe(false);
  });

  test('existing file with trailing newline: a one-line gap separates the prior content from the new patterns', () => {
    writeFileSync(join(dir, '.okignore'), 'node_modules/\n', 'utf8');
    appendOkIgnoreSync(dir, 'tmp/');
    const out = readFileSync(join(dir, '.okignore'), 'utf8');
    expect(out).toBe('node_modules/\n\ntmp/\n');
  });

  test('existing file without trailing newline: prior line is closed before the one-line gap', () => {
    writeFileSync(join(dir, '.okignore'), 'node_modules/', 'utf8');
    appendOkIgnoreSync(dir, 'tmp/');
    const out = readFileSync(join(dir, '.okignore'), 'utf8');
    expect(out).toBe('node_modules/\n\ntmp/\n');
  });

  test('whitespace at the edges of patterns is trimmed before append', () => {
    appendOkIgnoreSync(dir, '   tmp/\n*.draft.md   ');
    const out = readFileSync(join(dir, '.okignore'), 'utf8');
    expect(out).toBe('tmp/\n*.draft.md\n');
  });
});
