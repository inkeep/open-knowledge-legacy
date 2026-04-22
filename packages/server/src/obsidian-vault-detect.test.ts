import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { detectObsidianVault } from './obsidian-vault-detect.ts';

let baseDir: string;
let contentDir: string;
let obsidianDir: string;
let appJsonPath: string;

function writeAppJson(payload: object | string): void {
  mkdirSync(obsidianDir, { recursive: true });
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  writeFileSync(appJsonPath, body, 'utf-8');
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'obsidian-detect-'));
  contentDir = join(baseDir, 'vault');
  obsidianDir = join(contentDir, '.obsidian');
  appJsonPath = join(obsidianDir, 'app.json');
  mkdirSync(contentDir, { recursive: true });
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('detectObsidianVault — missing or malformed input', () => {
  test('missing .obsidian/app.json returns null silently', () => {
    expect(detectObsidianVault(contentDir)).toBeNull();
  });

  test('missing parent .obsidian/ directory returns null', () => {
    // No .obsidian dir at all — same null path.
    expect(detectObsidianVault(contentDir)).toBeNull();
  });

  test('empty .obsidian/app.json (no fields) returns an empty partial', () => {
    writeAppJson({});
    expect(detectObsidianVault(contentDir)).toEqual({});
  });

  test('malformed JSON returns null and logs a WARN', () => {
    writeAppJson('this is not json {');
    const result = detectObsidianVault(contentDir);
    expect(result).toBeNull();
  });

  test('extra unknown fields tolerated', () => {
    writeAppJson({
      attachmentFolderPath: 'attachments',
      foldHeading: true,
      autoPairBrackets: false,
      mysteriousFutureField: { nested: 'thing' },
    });
    const result = detectObsidianVault(contentDir);
    expect(result).toEqual({
      attachmentFolderPath: 'attachments',
    });
  });
});

describe('detectObsidianVault — attachmentFolderPath (D-J 1:1 passthrough)', () => {
  // INV1 confirmed the four shapes Obsidian users have in the wild.
  const cases = [
    { value: '/', label: 'vault root' },
    { value: './', label: 'co-located with note' },
    { value: './attachments', label: 'co-located subdir' },
    { value: 'attachments', label: 'global path' },
  ];

  for (const { value, label } of cases) {
    test(`passes through "${value}" (${label}) verbatim`, () => {
      writeAppJson({ attachmentFolderPath: value });
      expect(detectObsidianVault(contentDir)?.attachmentFolderPath).toBe(value);
    });
  }

  test('non-string value (e.g. null) is dropped', () => {
    writeAppJson({ attachmentFolderPath: null });
    expect(detectObsidianVault(contentDir)?.attachmentFolderPath).toBeUndefined();
  });

  test('empty string is dropped (treated as "no preference")', () => {
    writeAppJson({ attachmentFolderPath: '' });
    expect(detectObsidianVault(contentDir)?.attachmentFolderPath).toBeUndefined();
  });
});

describe('detectObsidianVault — useMarkdownLinks → emitFormat', () => {
  test('useMarkdownLinks: true → emitFormat: "markdown-image"', () => {
    writeAppJson({ useMarkdownLinks: true });
    expect(detectObsidianVault(contentDir)?.emitFormat).toBe('markdown-image');
  });

  test('useMarkdownLinks: false → emitFormat: "wikiembed"', () => {
    writeAppJson({ useMarkdownLinks: false });
    expect(detectObsidianVault(contentDir)?.emitFormat).toBe('wikiembed');
  });

  test('useMarkdownLinks omitted → emitFormat undefined (caller falls back to schema default)', () => {
    writeAppJson({ attachmentFolderPath: 'attachments' });
    expect(detectObsidianVault(contentDir)?.emitFormat).toBeUndefined();
  });

  test('non-boolean useMarkdownLinks is dropped', () => {
    writeAppJson({ useMarkdownLinks: 'sometimes' });
    expect(detectObsidianVault(contentDir)?.emitFormat).toBeUndefined();
  });
});

describe('detectObsidianVault — newLinkFormat surfaced but not consumed', () => {
  for (const value of ['shortest', 'relative', 'absolute'] as const) {
    test(`accepts ${value}`, () => {
      writeAppJson({ newLinkFormat: value });
      expect(detectObsidianVault(contentDir)?.newLinkFormat).toBe(value);
    });
  }

  test('unknown enum value dropped', () => {
    writeAppJson({ newLinkFormat: 'wikilink' });
    expect(detectObsidianVault(contentDir)?.newLinkFormat).toBeUndefined();
  });
});

describe('detectObsidianVault — symlink-escape rejected', () => {
  test('app.json that resolves outside contentDir returns null', () => {
    // Plant a real app.json outside contentDir, then symlink .obsidian/app.json
    // to it. realpath must catch the escape and refuse the read.
    const outsideDir = join(baseDir, 'outside');
    mkdirSync(outsideDir, { recursive: true });
    const outsideJson = join(outsideDir, 'app.json');
    writeFileSync(outsideJson, JSON.stringify({ attachmentFolderPath: 'evil' }), 'utf-8');
    mkdirSync(obsidianDir, { recursive: true });
    symlinkSync(outsideJson, appJsonPath);

    expect(detectObsidianVault(contentDir)).toBeNull();
  });
});

describe('detectObsidianVault — full real-world fixture (P2.1 scenario)', () => {
  test('Obsidian-refugee config maps to expected partial', () => {
    // P2.1 fixture: attachmentFolderPath="attachments", useMarkdownLinks=false,
    // newLinkFormat="shortest". This is the most common Obsidian default
    // shape sampled in INV1.
    writeAppJson({
      attachmentFolderPath: 'attachments',
      useMarkdownLinks: false,
      newLinkFormat: 'shortest',
      // Plus other fields the user happens to have set.
      foldHeading: true,
      defaultViewMode: 'preview',
    });
    expect(detectObsidianVault(contentDir)).toEqual({
      attachmentFolderPath: 'attachments',
      emitFormat: 'wikiembed',
      newLinkFormat: 'shortest',
    });
  });
});

describe('detectObsidianVault — non-destructive', () => {
  test('does not write to .obsidian/ on detection', () => {
    writeAppJson({ attachmentFolderPath: 'assets' });
    const beforeRaw = require('node:fs').readFileSync(appJsonPath, 'utf-8');
    const beforeMtime = require('node:fs').statSync(appJsonPath).mtimeMs;

    detectObsidianVault(contentDir);

    const afterRaw = require('node:fs').readFileSync(appJsonPath, 'utf-8');
    const afterMtime = require('node:fs').statSync(appJsonPath).mtimeMs;

    expect(afterRaw).toBe(beforeRaw);
    // Mtime is the last hard signal of "did anything write?".
    expect(afterMtime).toBe(beforeMtime);
  });

  test('does not create .open-knowledge/config.yml or any other file', () => {
    writeAppJson({ attachmentFolderPath: 'assets' });
    detectObsidianVault(contentDir);
    expect(require('node:fs').existsSync(resolve(contentDir, '.open-knowledge'))).toBe(false);
    expect(require('node:fs').existsSync(resolve(contentDir, '.open-knowledge/config.yml'))).toBe(
      false,
    );
  });
});
