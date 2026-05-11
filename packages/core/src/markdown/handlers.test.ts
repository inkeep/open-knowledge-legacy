import { describe, expect, mock, spyOn, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

interface PmMarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findInJson(json: JSONContent, type: string): JSONContent | null {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, type);
    if (found) return found;
  }
  return null;
}

function findMarkInJson(json: JSONContent, markType: string): PmMarkJson | null {
  if (json.marks) {
    const mark = json.marks.find((m) => m.type === markType) as PmMarkJson | undefined;
    if (mark) return mark;
  }
  for (const child of json.content ?? []) {
    const found = findMarkInJson(child, markType);
    if (found) return found;
  }
  return null;
}

function findJsxComponentInJson(json: JSONContent, componentName: string): JSONContent | null {
  if (json.type === 'jsxComponent' && json.attrs?.componentName === componentName) return json;
  for (const child of json.content ?? []) {
    const found = findJsxComponentInJson(child, componentName);
    if (found) return found;
  }
  return null;
}

describe('Tier B fidelity: emphasis delimiter', () => {
  test('underscore emphasis carries sourceDelimiter = "_"', () => {
    const json = mdManager.parse('_word_\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('_');
  });

  test('asterisk emphasis carries sourceDelimiter = "*"', () => {
    const json = mdManager.parse('*word*\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('*');
  });
});

describe('Tier B fidelity: strong delimiter', () => {
  test('double-underscore strong carries sourceDelimiter = "__"', () => {
    const json = mdManager.parse('__word__\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('__');
  });

  test('double-asterisk strong carries sourceDelimiter = "**"', () => {
    const json = mdManager.parse('**word**\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('**');
  });
});

describe('Tier B fidelity: heading style', () => {
  test('ATX heading carries headingStyle = "atx"', () => {
    const json = mdManager.parse('## Title\n');
    const heading = findInJson(json, 'heading');
    expect(heading).toBeDefined();
    expect(heading.attrs.level).toBe(2);
    expect(heading.attrs.headingStyle).toBe('atx');
  });
});

describe('Tier B fidelity: code block fence', () => {
  test('backtick fence carries fenceDelimiter and fenceLength', () => {
    const json = mdManager.parse('```js\ncode\n```\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.language).toBe('js');
    expect(code.attrs.fenceDelimiter).toBe('`');
    expect(code.attrs.fenceLength).toBe(3);
  });

  test('tilde fence carries fenceDelimiter = "~"', () => {
    const json = mdManager.parse('~~~\ncode\n~~~\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.fenceDelimiter).toBe('~');
  });
});

describe('Tier B fidelity: thematic break', () => {
  test('--- carries sourceRaw = "---"', () => {
    const json = mdManager.parse('---\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('---');
  });

  test('*** carries sourceRaw = "***"', () => {
    const json = mdManager.parse('***\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('***');
  });
});

describe('Tier B fidelity: hard break', () => {
  test('backslash hard break carries hardBreakStyle = "backslash"', () => {
    const json = mdManager.parse('line\\\nbreak\n');
    const brk = findInJson(json, 'hardBreak');
    expect(brk).toBeDefined();
    expect(brk.attrs.hardBreakStyle).toBe('backslash');
  });
});

describe('Tier B fidelity: list markers', () => {
  test('dash bullet list carries bulletMarker = "-"', () => {
    const json = mdManager.parse('- item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('-');
  });

  test('plus bullet list carries bulletMarker = "+"', () => {
    const json = mdManager.parse('+ item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('+');
  });

  test('ordered list with dot carries listMarkerDelimiter = "."', () => {
    const json = mdManager.parse('1. item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.listMarkerDelimiter).toBe('.');
  });
});

describe('Tier B fidelity: listItem PM-schema artifact stripping (R6d / US-011)', () => {
  test('listItem with code as first child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n\n   bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with code as only child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with paragraph first stays unchanged (no spurious strip)', () => {
    const input = '1. foo\n\n   ```\n   bar\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('genuinely empty listItem (single empty para child) is preserved', () => {
    const input = '1.\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    const json = mdManager.parse(input);
    const listItem = findInJson(json, 'listItem');
    expect(listItem).toBeDefined();
  });

  test('listItem with thematicBreak as first child round-trips', () => {
    const input = '1. ---\n\n   foo\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('listItem with blockquote as first child round-trips', () => {
    const input = '1. > foo\n   > bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('nested listItem with code block round-trips', () => {
    const input = '1. - ```\n     foo\n     ```\n\n     bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });
});

describe('Tier C: link style', () => {
  test('inline link carries linkStyle = "inline"', () => {
    const json = mdManager.parse('[text](https://example.com)\n');
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark.attrs.href).toBe('https://example.com');
    expect(linkMark.attrs.linkStyle).toBe('inline');
  });

  test('empty-label inline links stay literal text (no link mark)', () => {
    const json = mdManager.parse('[]()\n');
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe('[]()');
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('empty-label inline link with destination stays literal text (no link mark)', () => {
    const json = mdManager.parse('[](https://example.com)\n');
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe('[](https://example.com)');
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('trailing backslash runs carry sourceLiteral mark', () => {
    const triple = '\\'.repeat(3);
    const json = mdManager.parse(`text ${triple}\n`);
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content).toHaveLength(1);
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe(`text ${'\\'.repeat(2)}`);
    const sourceLiteral = findMarkInJson(json, 'sourceLiteral');
    expect(sourceLiteral?.attrs?.sourceRaw).toBe(`text ${triple}`);
  });

  test('sourceRaw takes priority when escapedChars and trailing backslash coexist', () => {
    const trailing = '\\';
    const json = mdManager.parse(`\\[text${trailing}\n`);
    const paragraph = findInJson(json, 'paragraph');
    expect(paragraph?.content).toHaveLength(1);
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe(`[text${trailing}`);
    const sourceLiteral = findMarkInJson(json, 'sourceLiteral');
    expect(sourceLiteral?.attrs?.sourceRaw).toBe(`\\[text${trailing}`);
    expect(findMarkInJson(json, 'escapeMark')).toBeNull();
  });

  test('image with empty alt remains image syntax', () => {
    const json = mdManager.parse('![](https://example.com/img.png)\n');
    expect(findInJson(json, 'image')).toBeDefined();
  });
});

describe('Tier A: passthrough', () => {
  test('blockquote round-trip', () => {
    const md = '> Quote text.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('inline code produces code mark', () => {
    const json = mdManager.parse('Use `code` here.\n');
    const codeMark = findMarkInJson(json, 'code');
    expect(codeMark).toBeDefined();
  });

  test('paragraph round-trip', () => {
    const md = 'Hello world.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});

describe('handlers.wikiLinkEmbed — server-absolute URL contract (Bug B/C)', () => {
  test('image wiki-embed emits server-absolute src when resolveEmbed provides contentDir-relative path', () => {
    const json = mdManager.parse('![[IMG.PNG]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'IMG.PNG') return 'stories/wiki-links-next/IMG.PNG';
        return null;
      },
      sourcePath: 'stories/wiki-links-next/README.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toMatch(/^\//);
    expect(props?.src).toBe('/stories/wiki-links-next/IMG.PNG');
  });

  test('PDF wiki-embed emits server-absolute src on jsxComponent(WikiEmbedFile)', () => {
    const json = mdManager.parse('![[doc.pdf]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'doc.pdf') return 'docs/sub/doc.pdf';
        return null;
      },
      sourcePath: 'docs/sub/notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedFile');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/docs/sub/doc.pdf');
  });

  test('WikiEmbedFile stamps formatted size when resolveSize returns bytes', () => {
    const json = mdManager.parse('![[doc.pdf]]\n', {
      resolveEmbed: (target: string) => (target === 'doc.pdf' ? 'docs/sub/doc.pdf' : null),
      resolveSize: (target: string) => (target === 'doc.pdf' ? 909_312 : null),
      sourcePath: 'docs/sub/notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedFile');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.size).toBe('888 KiB');
  });

  test('WikiEmbedFile size prop is null when resolveSize is omitted (renderer omits the size span)', () => {
    const json = mdManager.parse('![[doc.pdf]]\n', {
      resolveEmbed: (target: string) => (target === 'doc.pdf' ? 'docs/sub/doc.pdf' : null),
      sourcePath: 'docs/sub/notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedFile');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.size).toBeNull();
  });

  test('WikiEmbedFile size prop is null when resolveSize returns null (file moved / unreadable)', () => {
    const json = mdManager.parse('![[doc.pdf]]\n', {
      resolveEmbed: (target: string) => (target === 'doc.pdf' ? 'docs/sub/doc.pdf' : null),
      resolveSize: () => null,
      sourcePath: 'docs/sub/notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedFile');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.size).toBeNull();
  });

  test('video wiki-embed (MP4) emits server-absolute src on jsxComponent(WikiEmbedVideo)', () => {
    const json = mdManager.parse('![[clip.mp4]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'clip.mp4') return 'media/clip.mp4';
        return null;
      },
      sourcePath: 'notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/media/clip.mp4');
  });

  test('unresolved embed (resolveEmbed returns null) falls back to bare target', () => {
    const json = mdManager.parse('![[missing.png]]\n', {
      resolveEmbed: () => null,
      sourcePath: 'notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('missing.png');
  });

  test('image dispatch lands on WikiEmbedImage compat descriptor with absolute src', () => {
    const json = mdManager.parse('![[photo.png]]\n', {
      resolveEmbed: () => 'assets/photo.png',
      sourcePath: 'notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/assets/photo.png');
    expect(props?.target).toBe('photo.png');
    expect(props?.anchor).toBeNull();
    expect(props?.alias).toBeNull();
    expect(node?.attrs?.kind).toBe('element');
    expect(node?.attrs?.sourceDirty).toBe(false);
  });
});

describe('handlers.wikiLinkEmbed — WikiEmbedImage dispatch (US-002)', () => {
  test('![[photo.png]] → jsxComponent(WikiEmbedImage) with target/alias/anchor on props', () => {
    const json = mdManager.parse('![[photo.png]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('photo.png');
    expect(props?.alias).toBeNull();
    expect(props?.anchor).toBeNull();
    expect(findInJson(json, 'image')).toBeNull();
  });

  test('![[photo.png|caption]] → props.alias === "caption"', () => {
    const json = mdManager.parse('![[photo.png|caption]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('photo.png');
    expect(props?.alias).toBe('caption');
    expect(props?.anchor).toBeNull();
  });

  test('![[photo.png#frag]] → props.anchor === "frag"', () => {
    const json = mdManager.parse('![[photo.png#frag]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('photo.png');
    expect(props?.anchor).toBe('frag');
    expect(props?.alias).toBeNull();
  });

  test('![[photo.png#frag|caption]] preserves both anchor and alias', () => {
    const json = mdManager.parse('![[photo.png#frag|caption]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.alias).toBe('caption');
    expect(props?.anchor).toBe('frag');
  });

  test('PDF extension (![[doc.pdf]]) routes to WikiEmbedFile descriptor', () => {
    const json = mdManager.parse('![[doc.pdf]]\n');
    expect(findJsxComponentInJson(json, 'WikiEmbedImage')).toBeNull();
    expect(findJsxComponentInJson(json, 'WikiEmbedFile')).not.toBeNull();
  });

  test('round-trip: ![[photo.png]] is byte-identical', () => {
    const md = '![[photo.png]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[photo.png|caption]] preserves alias byte-identical', () => {
    const md = '![[photo.png|caption]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[photo.png#frag]] preserves anchor byte-identical', () => {
    const md = '![[photo.png#frag]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[photo.png#frag|caption]] preserves anchor + alias byte-identical', () => {
    const md = '![[photo.png#frag|caption]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('inline-position ![[photo.png]] (mid-prose) → text+link-mark chip, no PM image node', () => {
    const json = mdManager.parse('text ![[photo.png]] more text\n');
    expect(findJsxComponentInJson(json, 'WikiEmbedImage')).toBeNull();
    expect(findInJson(json, 'image')).toBeNull();
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).not.toBeNull();
    expect(linkMark?.attrs?.sourceForm).toBe('wikiembed');
    expect(linkMark?.attrs?.target).toBe('photo.png');
  });

  test('round-trip: inline mid-prose ![[photo.png]] is byte-identical', () => {
    const md = 'text ![[photo.png]] more text\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});

describe('handlers.wikiLinkEmbed — WikiEmbedVideo dispatch (US-008)', () => {
  test('![[clip.mp4]] → jsxComponent(WikiEmbedVideo) with target/alias/anchor on props', () => {
    const json = mdManager.parse('![[clip.mp4]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('clip.mp4');
    expect(props?.alias).toBeNull();
    expect(props?.anchor).toBeNull();
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('![[clip.mp4|introduction]] → props.alias === "introduction"', () => {
    const json = mdManager.parse('![[clip.mp4|introduction]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('clip.mp4');
    expect(props?.alias).toBe('introduction');
    expect(props?.anchor).toBeNull();
  });

  test('![[clip.mp4#t=10]] → props.anchor === "t=10"', () => {
    const json = mdManager.parse('![[clip.mp4#t=10]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('clip.mp4');
    expect(props?.anchor).toBe('t=10');
    expect(props?.alias).toBeNull();
  });

  test('all video extensions (mp4/webm/mov/m4v/mkv) dispatch to WikiEmbedVideo', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'm4v', 'mkv']) {
      const json = mdManager.parse(`![[clip.${ext}]]\n`);
      const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
      expect(node, `${ext} should dispatch to WikiEmbedVideo`).not.toBeNull();
    }
  });

  test('video dispatch carries server-absolute src when resolveEmbed returns a hit', () => {
    const json = mdManager.parse('![[clip.mp4]]\n', {
      resolveEmbed: (target: string) => (target === 'clip.mp4' ? 'media/clip.mp4' : null),
      sourcePath: 'notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedVideo');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/media/clip.mp4');
    expect(props?.target).toBe('clip.mp4');
  });

  test('round-trip: ![[clip.mp4]] is byte-identical', () => {
    const md = '![[clip.mp4]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[clip.mp4|caption]] preserves alias byte-identical', () => {
    const md = '![[clip.mp4|caption]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[clip.mp4#t=10]] preserves anchor byte-identical', () => {
    const md = '![[clip.mp4#t=10]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});

describe('handlers.wikiLinkEmbed — WikiEmbedAudio dispatch (US-008)', () => {
  test('![[song.mp3]] → jsxComponent(WikiEmbedAudio) with target/alias/anchor on props', () => {
    const json = mdManager.parse('![[song.mp3]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedAudio');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('song.mp3');
    expect(props?.alias).toBeNull();
    expect(props?.anchor).toBeNull();
    expect(findMarkInJson(json, 'link')).toBeNull();
  });

  test('![[song.mp3|jingle]] → props.alias === "jingle"', () => {
    const json = mdManager.parse('![[song.mp3|jingle]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedAudio');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('song.mp3');
    expect(props?.alias).toBe('jingle');
  });

  test('![[song.mp3#chorus]] → props.anchor === "chorus"', () => {
    const json = mdManager.parse('![[song.mp3#chorus]]\n');
    const node = findJsxComponentInJson(json, 'WikiEmbedAudio');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('song.mp3');
    expect(props?.anchor).toBe('chorus');
  });

  test('all audio extensions (mp3/wav/ogg/m4a/flac/aac/opus) dispatch to WikiEmbedAudio', () => {
    for (const ext of ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus']) {
      const json = mdManager.parse(`![[song.${ext}]]\n`);
      const node = findJsxComponentInJson(json, 'WikiEmbedAudio');
      expect(node, `${ext} should dispatch to WikiEmbedAudio`).not.toBeNull();
    }
  });

  test('audio dispatch carries server-absolute src when resolveEmbed returns a hit', () => {
    const json = mdManager.parse('![[song.mp3]]\n', {
      resolveEmbed: (target: string) => (target === 'song.mp3' ? 'media/song.mp3' : null),
      sourcePath: 'notes.md',
    });
    const node = findJsxComponentInJson(json, 'WikiEmbedAudio');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/media/song.mp3');
    expect(props?.target).toBe('song.mp3');
  });

  test('round-trip: ![[song.mp3]] is byte-identical', () => {
    const md = '![[song.mp3]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[song.mp3|jingle]] preserves alias byte-identical', () => {
    const md = '![[song.mp3|jingle]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('round-trip: ![[song.mp3#chorus]] preserves anchor byte-identical', () => {
    const md = '![[song.mp3#chorus]]\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});

describe('handlers.image / imagePromoter — server-absolute URL contract (doc-relative image src)', () => {
  test('block-context ![alt](../../path) → CommonMarkImage with server-absolute src resolved against sourcePath', () => {
    const json = mdManager.parse('![Aang](../../assets/images/characters/aang.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.alt).toBe('Aang');
    expect(props?.src).toMatch(/^\//);
    expect(props?.src).toBe('/assets/images/characters/aang.png');
  });

  test('inline ![alt](../../path) mid-prose → PM image node with server-absolute src', () => {
    const json = mdManager.parse(
      'Some prose with ![Aang](../../assets/images/characters/aang.png) inline.\n',
      { sourcePath: 'characters/air-nomads/aang.md' },
    );
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    expect(image?.attrs?.src).toMatch(/^\//);
    expect(image?.attrs?.src).toBe('/assets/images/characters/aang.png');
  });

  test('block-context ./img.png resolves to /<doc-dir>/img.png', () => {
    const json = mdManager.parse('![pic](./img.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/characters/air-nomads/img.png');
  });

  test('block-context bare-basename img.png resolves to /<doc-dir>/img.png', () => {
    const json = mdManager.parse('![pic](img.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/characters/air-nomads/img.png');
  });

  test('absolute path /abs/x.png passes through unchanged', () => {
    const json = mdManager.parse('![x](/abs/x.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/abs/x.png');
  });

  test('http(s) URL passes through unchanged', () => {
    const json = mdManager.parse('![x](https://example.com/x.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('https://example.com/x.png');
  });

  test('data: URI passes through unchanged', () => {
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const json = mdManager.parse(`![pixel](${dataUri})\n`, {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe(dataUri);
  });

  test('relative path to a non-existent file still produces a server-absolute src', () => {
    const json = mdManager.parse('![x](../missing/ghost.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/characters/missing/ghost.png');
  });

  test('no sourcePath in parse context → src left verbatim (no resolution attempted)', () => {
    const json = mdManager.parse('![x](../../assets/x.png)\n');
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('../../assets/x.png');
  });

  test('round-trip: block-context relative image src is byte-identical on save', () => {
    const md = '![Aang](../../assets/images/characters/aang.png)\n';
    expect(
      mdManager.serialize(mdManager.parse(md, { sourcePath: 'characters/air-nomads/aang.md' })),
    ).toBe(md);
  });

  test('round-trip: inline relative image src is byte-identical on save', () => {
    const md = 'Some prose with ![Aang](../../assets/images/characters/aang.png) inline.\n';
    expect(
      mdManager.serialize(mdManager.parse(md, { sourcePath: 'characters/air-nomads/aang.md' })),
    ).toBe(md);
  });

  test('dirty-path block round-trip: edited CommonMarkImage re-emits the authored doc-relative URL', () => {
    const json = mdManager.parse('![Aang](../../assets/images/characters/aang.png)\n', {
      sourcePath: 'characters/air-nomads/aang.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown>;
    expect(props.src).toBe('/assets/images/characters/aang.png');
    expect(props.sourceUrl).toBe('../../assets/images/characters/aang.png');
    if (node?.attrs) node.attrs.sourceDirty = true;
    props.alt = 'Aang kneeling';
    expect(mdManager.serialize(json)).toBe(
      '![Aang kneeling](../../assets/images/characters/aang.png)\n',
    );
  });

  test('dirty-path inline round-trip: edited PM image node re-emits the authored doc-relative URL', () => {
    const json = mdManager.parse(
      'Some prose with ![Aang](../../assets/images/characters/aang.png) inline.\n',
      { sourcePath: 'characters/air-nomads/aang.md' },
    );
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    const attrs = image?.attrs as Record<string, unknown>;
    expect(attrs.src).toBe('/assets/images/characters/aang.png');
    expect(attrs.sourceUrl).toBe('../../assets/images/characters/aang.png');
    attrs.alt = 'Aang kneeling';
    expect(mdManager.serialize(json)).toBe(
      'Some prose with ![Aang kneeling](../../assets/images/characters/aang.png) inline.\n',
    );
  });

  test('escape: block-context relative path climbing above contentDir stays raw', () => {
    const json = mdManager.parse('![x](../../../../etc/passwd)\n', {
      sourcePath: 'docs/page.md',
    });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('../../../../etc/passwd');
  });

  test('escape: inline mid-prose relative path climbing above contentDir stays raw', () => {
    const json = mdManager.parse('Hello ![x](../../../etc/passwd) world.\n', {
      sourcePath: 'a/b.md',
    });
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    expect(image?.attrs?.src).toBe('../../../etc/passwd');
  });

  test('exact-depth climb to contentDir root normalizes to server-absolute path', () => {
    const json = mdManager.parse('![x](../img.png)\n', { sourcePath: 'a/b.md' });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/img.png');
  });

  test('exact-depth-plus-one climb escapes contentDir and stays raw', () => {
    const json = mdManager.parse('![x](../../img.png)\n', { sourcePath: 'a/b.md' });
    const node = findJsxComponentInJson(json, 'CommonMarkImage');
    expect(node).not.toBeNull();
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('../../img.png');
  });

  test('escape diagnostic: emits a console.warn under NODE_ENV=test', () => {
    const warn = spyOn(console, 'warn').mockImplementation(mock(() => {}));
    try {
      mdManager.parse('![x](../../../../etc/passwd)\n', { sourcePath: 'docs/page.md' });
      expect(warn).toHaveBeenCalled();
      const message = String(warn.mock.calls[0]?.[0] ?? '');
      expect(message).toContain('[resolve-image-url]');
      expect(message).toContain('escapes contentDir');
      expect(message).toContain('../../../../etc/passwd');
    } finally {
      warn.mockRestore();
    }
  });

  test('escape diagnostic: silent under NODE_ENV=production', () => {
    const warn = spyOn(console, 'warn').mockImplementation(mock(() => {}));
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mdManager.parse('![x](../../../../etc/passwd)\n', { sourcePath: 'docs/page.md' });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prior;
      warn.mockRestore();
    }
  });
});
