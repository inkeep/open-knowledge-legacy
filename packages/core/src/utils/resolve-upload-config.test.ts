import { describe, expect, test } from 'bun:test';
import { DEFAULT_UPLOAD_CONFIG } from '../constants/upload.ts';
import { type PartialUserUploadConfig, resolveUploadConfig } from './resolve-upload-config.ts';

describe('resolveUploadConfig — precedence user > vault > default (US-018)', () => {
  test('all undefined → returns DEFAULT_UPLOAD_CONFIG shape', () => {
    const resolved = resolveUploadConfig(undefined, undefined);
    expect(resolved).toEqual(DEFAULT_UPLOAD_CONFIG);
  });

  test('user sets attachmentFolderPath AND vault sets it → user wins', () => {
    const resolved = resolveUploadConfig(
      { attachmentFolderPath: 'user-path' },
      { attachmentFolderPath: 'vault-path' },
    );
    expect(resolved.attachmentFolderPath).toBe('user-path');
  });

  test('user unset AND vault sets attachmentFolderPath → vault fills the gap', () => {
    const resolved = resolveUploadConfig(undefined, {
      attachmentFolderPath: 'attachments',
    });
    expect(resolved.attachmentFolderPath).toBe('attachments');
  });

  test('user unset AND vault unset → default "./"', () => {
    const resolved = resolveUploadConfig(undefined, null);
    expect(resolved.attachmentFolderPath).toBe('./');
  });

  test('user sets emitFormat AND vault sets it → user wins', () => {
    const resolved = resolveUploadConfig(
      { emitFormat: 'markdown-image' },
      { emitFormat: 'wikiembed' },
    );
    expect(resolved.emitFormat).toBe('markdown-image');
  });

  test('user unset AND vault: useMarkdownLinks=true → emitFormat="markdown-image"', () => {
    const resolved = resolveUploadConfig(undefined, {
      emitFormat: 'markdown-image',
    });
    expect(resolved.emitFormat).toBe('markdown-image');
  });

  test('user unset AND vault unset → default "wikiembed"', () => {
    const resolved = resolveUploadConfig(undefined, undefined);
    expect(resolved.emitFormat).toBe('wikiembed');
  });

  test('remaining fields resolve user → default only (vault cannot supply them)', () => {
    // `dedup` and `wikiEmbedExtensions` are not mapped from
    // `.obsidian/app.json` — vault detection only fills
    // `attachmentFolderPath` and `emitFormat`. Anything else either comes
    // from user config or falls to the canonical default.
    const resolved = resolveUploadConfig(
      {
        dedup: { mode: 'off' },
        wikiEmbedExtensions: ['png', 'pdf'],
      },
      null,
    );
    expect(resolved.dedup.mode).toBe('off');
    expect(resolved.dedup.ui).toBe('toast'); // filled from default
    expect(resolved.wikiEmbedExtensions).toEqual(['png', 'pdf']);
  });

  test('user partial dedup supplies mode, ui falls to default', () => {
    const resolved = resolveUploadConfig({ dedup: { mode: 'off' } }, null);
    expect(resolved.dedup).toEqual({ mode: 'off', ui: 'toast' });
  });

  test('user partial dedup supplies ui, mode falls to default', () => {
    const resolved = resolveUploadConfig({ dedup: { ui: 'silent' } }, null);
    expect(resolved.dedup).toEqual({ mode: 'same-dir', ui: 'silent' });
  });

  test('wikiEmbedExtensions: empty user array is a legitimate override (allows "narrow every drop to opaque")', () => {
    const resolved = resolveUploadConfig({ wikiEmbedExtensions: [] }, null);
    expect(resolved.wikiEmbedExtensions).toEqual([]);
  });

  test('wikiEmbedExtensions: user is copied, not referenced (defensive — caller mutation should not affect callee)', () => {
    const userExts = ['png', 'jpg'];
    const resolved = resolveUploadConfig({ wikiEmbedExtensions: userExts }, null);
    userExts.push('pdf');
    expect(resolved.wikiEmbedExtensions).toEqual(['png', 'jpg']);
  });

  test('vault supplies emitFormat but user overrides attachmentFolderPath — mixed precedence', () => {
    const user: PartialUserUploadConfig = { attachmentFolderPath: 'custom' };
    const vault: PartialUserUploadConfig = { emitFormat: 'markdown-image' };
    const resolved = resolveUploadConfig(user, vault);
    expect(resolved.attachmentFolderPath).toBe('custom');
    expect(resolved.emitFormat).toBe('markdown-image');
  });

  test('resolver does not mutate inputs (immutable semantics)', () => {
    const user: PartialUserUploadConfig = {
      dedup: { mode: 'same-dir' },
      wikiEmbedExtensions: ['png'],
    };
    const beforeUser = JSON.stringify(user);
    const vault: PartialUserUploadConfig = { attachmentFolderPath: 'v' };
    const beforeVault = JSON.stringify(vault);
    resolveUploadConfig(user, vault);
    expect(JSON.stringify(user)).toBe(beforeUser);
    expect(JSON.stringify(vault)).toBe(beforeVault);
  });
});
