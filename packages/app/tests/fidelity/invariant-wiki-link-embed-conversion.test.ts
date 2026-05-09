import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdManager, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const stem = fc.stringMatching(/^[a-z][a-z0-9_-]{0,12}$/).filter((s) => s.length > 0);

const imageExt = fc.constantFrom('png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg');
const nonImageExt = fc.constantFrom('mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a');
const fileAttachmentExt = fc.constantFrom('pdf', 'zip', 'docx', 'csv');
const opaqueExt = fc.constantFrom('xyz', 'qux', 'wat');

const renderableExt = fc.oneof(imageExt, nonImageExt, fileAttachmentExt);
const allExts = fc.oneof(imageExt, nonImageExt, fileAttachmentExt, opaqueExt);

const anchor = fc.option(fc.stringMatching(/^[a-zA-Z0-9_=-]{1,12}$/), { nil: null });
const alias = fc.option(fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/), { nil: null });

function buildEmbed(s: string, e: string, a: string | null, l: string | null): string {
  let out = `![[${s}.${e}`;
  if (a) out += `#${a}`;
  if (l) out += `|${l}`;
  return `${out}]]`;
}

const renderableEmbedMd = fc
  .tuple(stem, renderableExt, anchor, alias)
  .map(([s, e, a, l]) => buildEmbed(s, e, a, l));
const anyEmbedMd = fc
  .tuple(stem, allExts, anchor, alias)
  .map(([s, e, a, l]) => buildEmbed(s, e, a, l));

describe('wiki-embed conversion invariants — mdManager path (US-010)', () => {
  test(
    'I1 — parse → serialize is byte-identical for renderable extensions (image + non-image wikiembed)',
    () => {
      assertAcrossSeeds(
        fc.property(renderableEmbedMd, (md) => {
          const out = normalize(mdRoundTrip(md));
          expect(out).toBe(md);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'I4 — double round-trip is stable across all extension classes',
    () => {
      assertAcrossSeeds(
        fc.property(anyEmbedMd, (md) => {
          const once = normalize(mdRoundTrip(md));
          const twice = normalize(mdRoundTrip(once));
          expect(twice).toBe(once);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('truly-opaque wikiembed round-trip normalizes to plain markdown link', () => {
    expect(normalize(mdRoundTrip('![[archive.xyz]]'))).toBe('[archive.xyz](archive.xyz)');
    expect(normalize(mdRoundTrip('![[archive.xyz|Download]]'))).toBe('[Download](archive.xyz)');
  });

  test('block-context image-extension embed dispatches to jsxComponent(WikiEmbedImage)', () => {
    const json = mdManager.parse('![[photo.png]]');
    const node = json.content?.[0];
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedImage');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('photo.png');
    expect(props?.src).toBe('photo.png'); // resolver omitted → literal fallback
    expect(props?.anchor).toBeNull();
    expect(props?.alias).toBeNull();
  });

  test('PDF wikiembed dispatches to WikiEmbedFile descriptor (unified attachment chrome)', () => {
    const json = mdManager.parse('![[draft.pdf#page=3|Draft]]');
    const node = json.content?.[0];
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedFile');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.target).toBe('draft.pdf');
    expect(props?.anchor).toBe('page=3');
    expect(props?.alias).toBe('Draft');
  });

  test('US-013 — truly-opaque extensions dispatch to plain link (no sourceForm)', () => {
    const json = mdManager.parse('![[archive.xyz]]');
    const para = json.content?.[0];
    const text = para?.content?.[0];
    expect(text?.type).toBe('text');
    const linkMark = text?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark?.attrs?.sourceForm).toBeNull();
    expect(linkMark?.attrs?.href).toBe('archive.xyz');
  });

  test('US-013 — resolveEmbed callback overrides the literal target for src/href', () => {
    const resolved = mdManager.parse('![[photo.png]]', {
      resolveEmbed: (target) => (target === 'photo.png' ? 'attachments/photo.png' : null),
      sourcePath: 'docs/meeting.md',
    });
    const node = resolved.content?.[0];
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedImage');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/attachments/photo.png');
    expect(props?.target).toBe('photo.png');

    const resolvedPdf = mdManager.parse('![[draft.pdf]]', {
      resolveEmbed: (target) => (target === 'draft.pdf' ? 'attachments/draft.pdf' : null),
      sourcePath: 'docs/meeting.md',
    });
    const pdfNode = resolvedPdf.content?.[0];
    expect(pdfNode?.type).toBe('jsxComponent');
    expect(pdfNode?.attrs?.componentName).toBe('WikiEmbedFile');
    const pdfProps = pdfNode?.attrs?.props as Record<string, unknown> | undefined;
    expect(pdfProps?.src).toBe('/attachments/draft.pdf');
    expect(pdfProps?.target).toBe('draft.pdf');
  });

  test('US-013 — unresolvable target falls back to literal (broken-ref placeholder)', () => {
    const json = mdManager.parse('![[unknown.png]]', {
      resolveEmbed: () => null,
      sourcePath: 'docs/meeting.md',
    });
    const node = json.content?.[0];
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedImage');
    const props = node?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('unknown.png');
  });

  test('I7 — hand-authored parse and drop-emitted serialize→parse produce equivalent PM', () => {
    const cases = [
      '![[photo.png]]',
      '![[draft.pdf]]',
      '![[song.mp3]]',
      '![[archive.zip]]',
      '![[diagram.svg]]',
    ];
    for (const md of cases) {
      const handPm = mdManager.parse(md);

      const target = md.slice(3, -2); // strip leading `![[` + trailing `]]`
      const dropPm: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'wikiLinkEmbed',
                attrs: { target, alias: null, anchor: null },
              },
            ],
          },
        ],
      };
      const dropMd = mdManager.serialize(dropPm);
      const dropPmCanonical = mdManager.parse(dropMd);

      expect(normalize(dropMd)).toBe(md);
      expect(dropPmCanonical).toEqual(handPm);
    }
  });

  test('coexistence with wikiLink — same body, neither captures the other', () => {
    const md = 'See [[Index]] and ![[diagram.png]] together.\n';
    const out = normalize(mdRoundTrip(md));
    expect(out).toBe(md.trimEnd());
  });
});
