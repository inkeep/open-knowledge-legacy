import { describe, expect, test } from 'bun:test';
import {
  AUDIO_EXTENSIONS,
  FILE_ATTACHMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  mediaKindForSidebarAssetExtension,
  VIDEO_EXTENSIONS,
  WIKI_EMBED_EXTENSIONS,
} from './upload.ts';

describe('upload extension sets', () => {
  test('VIDEO_EXTENSIONS contains expected browser-renderable containers', () => {
    expect(VIDEO_EXTENSIONS.has('mp4')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('webm')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('mov')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('m4v')).toBe(true);
    expect(VIDEO_EXTENSIONS.has('mkv')).toBe(true);
  });

  test('AUDIO_EXTENSIONS contains expected browser-renderable codecs', () => {
    expect(AUDIO_EXTENSIONS.has('mp3')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('wav')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('ogg')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('m4a')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('flac')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('aac')).toBe(true);
    expect(AUDIO_EXTENSIONS.has('opus')).toBe(true);
  });

  test('VIDEO_EXTENSIONS and AUDIO_EXTENSIONS are disjoint from IMAGE_EXTENSIONS', () => {
    for (const ext of VIDEO_EXTENSIONS) {
      expect(IMAGE_EXTENSIONS.has(ext)).toBe(false);
    }
    for (const ext of AUDIO_EXTENSIONS) {
      expect(IMAGE_EXTENSIONS.has(ext)).toBe(false);
    }
  });

  test('VIDEO_EXTENSIONS and AUDIO_EXTENSIONS are disjoint from each other', () => {
    for (const ext of VIDEO_EXTENSIONS) {
      expect(AUDIO_EXTENSIONS.has(ext)).toBe(false);
    }
  });

  test('IMAGE ∪ VIDEO ∪ AUDIO ∪ FILE_ATTACHMENT === WIKI_EMBED_EXTENSIONS (set equality)', () => {
    const union = new Set<string>([
      ...IMAGE_EXTENSIONS,
      ...VIDEO_EXTENSIONS,
      ...AUDIO_EXTENSIONS,
      ...FILE_ATTACHMENT_EXTENSIONS,
    ]);

    for (const ext of union) {
      expect(WIKI_EMBED_EXTENSIONS.has(ext)).toBe(true);
    }

    for (const ext of WIKI_EMBED_EXTENSIONS) {
      expect(union.has(ext)).toBe(true);
    }

    expect(union.size).toBe(WIKI_EMBED_EXTENSIONS.size);
  });

  test('FILE_ATTACHMENT_EXTENSIONS is disjoint from IMAGE / VIDEO / AUDIO', () => {
    for (const ext of FILE_ATTACHMENT_EXTENSIONS) {
      expect(IMAGE_EXTENSIONS.has(ext)).toBe(false);
      expect(VIDEO_EXTENSIONS.has(ext)).toBe(false);
      expect(AUDIO_EXTENSIONS.has(ext)).toBe(false);
    }
  });
});

describe('mediaKindForSidebarAssetExtension', () => {
  test.each([
    ['png', 'image'],
    ['jpg', 'image'],
    ['jpeg', 'image'],
    ['gif', 'image'],
    ['webp', 'image'],
    ['avif', 'image'],
    ['mp4', 'video'],
    ['webm', 'video'],
    ['mov', 'video'],
    ['m4v', 'video'],
    ['mp3', 'audio'],
    ['wav', 'audio'],
    ['ogg', 'audio'],
    ['m4a', 'audio'],
    ['flac', 'audio'],
    ['aac', 'audio'],
    ['opus', 'audio'],
    ['pdf', 'pdf'],
  ] as const)('classifies %s → %s', (ext, expected) => {
    expect(mediaKindForSidebarAssetExtension(ext)).toBe(expected);
  });

  test.each([
    'csv',
    'docx',
    'json',
    'zip',
    'mkv', // in INLINE_RENDERABLE_EXTENSIONS but excluded from sidebar video set
    'svg', // intentionally excluded from sidebar image set (XSS posture)
    'tiff',
  ])('returns null for non-sidebar-renderable extension %s', (ext) => {
    expect(mediaKindForSidebarAssetExtension(ext)).toBeNull();
  });

  test('normalizes leading dot + case', () => {
    expect(mediaKindForSidebarAssetExtension('.MP3')).toBe('audio');
    expect(mediaKindForSidebarAssetExtension('.PDF')).toBe('pdf');
    expect(mediaKindForSidebarAssetExtension('.PnG')).toBe('image');
    expect(mediaKindForSidebarAssetExtension('PDF')).toBe('pdf');
  });
});
