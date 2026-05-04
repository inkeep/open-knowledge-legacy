import { describe, expect, test } from 'bun:test';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
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

  test('IMAGE ∪ VIDEO ∪ AUDIO ∪ {pdf} === WIKI_EMBED_EXTENSIONS (set equality)', () => {
    const union = new Set<string>([
      ...IMAGE_EXTENSIONS,
      ...VIDEO_EXTENSIONS,
      ...AUDIO_EXTENSIONS,
      'pdf',
    ]);

    for (const ext of union) {
      expect(WIKI_EMBED_EXTENSIONS.has(ext)).toBe(true);
    }

    for (const ext of WIKI_EMBED_EXTENSIONS) {
      expect(union.has(ext)).toBe(true);
    }

    expect(union.size).toBe(WIKI_EMBED_EXTENSIONS.size);
  });
});
