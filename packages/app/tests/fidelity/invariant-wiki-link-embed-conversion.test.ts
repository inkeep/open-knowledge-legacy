/**
 * Fidelity invariants for wiki-embed `![[file.ext]]` round-trip through
 * the full mdManager parse/serialize pipeline (mdast → PM → mdast →
 * markdown). This is the cross-path invariant set US-010 + US-013 close:
 *
 *   I1 (Identity)        — `serialize(parse(md)) === md` byte-identical
 *   I4 (Idempotence)     — `serialize(parse(X))` applied twice equals once
 *   I5 (Layer A === B)   — mdManager's path agrees with the mdast-util-only
 *                           path tested in wiki-link-micromark.test.ts
 *   I7 (Cross-path)      — drop-emit shape (FR-3d — client builds a PM
 *                           `wikiLinkEmbed` node directly, serializes
 *                           through mdManager) and hand-authored shape
 *                           (user types `![[photo.png]]`, mdManager parses)
 *                           produce equivalent mdast + PM.
 *
 * mdast→PM dispatches by extension and position. Block-context image /
 * video / audio embeds materialize as `jsxComponent('WikiEmbed*')`;
 * inline-position embeds (and allowlisted extensions without a registered
 * descriptor) materialize as PM link-marked text with `sourceForm='wikiembed'`;
 * opaque extensions materialize as plain link-marked text.
 *
 * Tier-2 1K samples; tier-3 10K via `STRESS_FIDELITY=1`.
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdManager, mdRoundTrip, normalize, PBT_TIMEOUT_MS } from './helpers';

const stem = fc.stringMatching(/^[a-z][a-z0-9_-]{0,12}$/).filter((s) => s.length > 0);

// All allowlisted extensions share the same dispatch contract:
// block-context → `jsxComponent('WikiEmbed*')` (image/video/audio have a
// descriptor); inline-position → text+link-mark chip with
// `sourceForm='wikiembed'`; opaque ext → plain text+link. The image vs
// non-image partition below is a label for sample distribution — both
// classes go through identical chip / descriptor logic in this PBT.
const imageExt = fc.constantFrom('png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg');
const nonImageExt = fc.constantFrom('pdf', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a');
const opaqueExt = fc.constantFrom('zip', 'docx', 'xyz', 'csv');

const renderableExt = fc.oneof(imageExt, nonImageExt);
const allExts = fc.oneof(imageExt, nonImageExt, opaqueExt);

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
      // Scope: extensions in the `wikiEmbedExtensions` allowlist (images +
      // pdf/video/audio). PBT samples drive standalone-paragraph embeds, so
      // image/video/audio promote to `jsxComponent('WikiEmbed*')` and pdf
      // lands on the link-mark chip path; both serialize back through the
      // descriptor `serialize` / `markHandlers.link` path byte-identically.
      //
      // Opaque extensions (zip, docx, …) are NOT covered here — per SPEC §6
      // emit-dispatch matrix they normalize to `[name.ext](name.ext)` on
      // round-trip (documented deviation; see opaque test below).
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
      // Idempotence holds for every extension class. For renderable exts,
      // the first round-trip is a no-op (byte-identical). For opaque exts
      // the first round-trip normalizes `![[name.zip]]` → `[name.zip](name.zip)`
      // and the second round-trip is stable on that normalized form.
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

  test('opaque wikiembed round-trip normalizes to plain markdown link', () => {
    // Per SPEC §6 emit-dispatch matrix: opaque extensions (not in
    // `wikiEmbedExtensions`) materialize as plain markdown links and lose
    // the `![[...]]` source form on save. Users who want wikiembed for a
    // custom extension add it to `upload.wikiEmbedExtensions` config.
    expect(normalize(mdRoundTrip('![[archive.zip]]'))).toBe('[archive.zip](archive.zip)');
    expect(normalize(mdRoundTrip('![[archive.zip|Download]]'))).toBe('[Download](archive.zip)');
  });

  test('block-context image-extension embed dispatches to jsxComponent(WikiEmbedImage)', () => {
    // Standalone `![[photo.png]]` (single-child paragraph) promotes to a
    // block-level jsxComponent carrying the WikiEmbedImage compat
    // descriptor — renders through Image.tsx, exposes only `alias` in
    // PropPanel, and round-trips back to wikiLinkEmbed mdast via the
    // descriptor's `serialize`.
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

  test('US-013 — non-image wikiembed dispatches to PM link-marked text with sourceForm=wikiembed', () => {
    // pdf/mp4/etc. are in `wikiEmbedExtensions` but not image-ext — they
    // render as clickable link text (Phase 2 promotes to typed-component
    // nodes at render time).
    const json = mdManager.parse('![[draft.pdf#page=3|Draft]]');
    const para = json.content?.[0];
    expect(para?.type).toBe('paragraph');
    const text = para?.content?.[0];
    expect(text?.type).toBe('text');
    expect(text?.text).toBe('Draft');
    const linkMark = text?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark?.attrs?.sourceForm).toBe('wikiembed');
    expect(linkMark?.attrs?.target).toBe('draft.pdf');
    expect(linkMark?.attrs?.anchor).toBe('page=3');
    expect(linkMark?.attrs?.alias).toBe('Draft');
  });

  test('US-013 — opaque extensions dispatch to plain link (no sourceForm)', () => {
    // .zip is not in the `wikiEmbedExtensions` allowlist — renders as a
    // plain markdown link. Round-trip normalizes to `[archive.zip](archive.zip)`
    // on serialize (documented deviation per SPEC §6 emit-dispatch matrix).
    const json = mdManager.parse('![[archive.zip]]');
    const para = json.content?.[0];
    const text = para?.content?.[0];
    expect(text?.type).toBe('text');
    const linkMark = text?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark?.attrs?.sourceForm).toBeNull();
    expect(linkMark?.attrs?.href).toBe('archive.zip');
  });

  test('US-013 — resolveEmbed callback overrides the literal target for src/href', () => {
    // When the caller passes a resolver (server-side Observer B path), the
    // resolved disk-relative path replaces the literal target in src/href.
    // Target/anchor/alias attrs still carry the original target for reverse
    // round-trip.
    //
    // 2026-04-24 amendment (Bug B/C fix): the emitted src/href is
    // server-absolute (`/<contentDir-relative>`) so under hash routing the
    // browser resolves the URL against origin, not against the doc's
    // subdirectory. Pre-fix the literal `resolveEmbed` output was used
    // verbatim — doc-relative paths worked only at content root; subdir
    // docs rendered broken images + blank PDF tabs via the Vite SPA
    // fallback.
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

    // Non-image case: href is the server-absolute resolved path, target
    // keeps the literal.
    const resolvedLink = mdManager.parse('![[draft.pdf]]', {
      resolveEmbed: (target) => (target === 'draft.pdf' ? 'attachments/draft.pdf' : null),
      sourcePath: 'docs/meeting.md',
    });
    const text = resolvedLink.content?.[0]?.content?.[0];
    const linkMark = text?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark?.attrs?.href).toBe('/attachments/draft.pdf');
    expect(linkMark?.attrs?.target).toBe('draft.pdf');
  });

  test('US-013 — unresolvable target falls back to literal (broken-ref placeholder)', () => {
    // When `resolveEmbed` returns null, the PM `src`/`href` is the literal
    // target. Browsers surface the missing asset via `<img onerror>` / the
    // link 404s on click — no thrown error.
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
    // FR-3d emits `![[name.ext]]` at drop time: the client-side
    // `pickInsertShape` builds a PM `wikiLinkEmbed` node directly. That
    // node-handler path (US-010 nodeHandlers.wikiLinkEmbed) serializes
    // to `![[...]]` markdown, which then round-trips through mdManager.
    // The resulting PM (via the server-side handlers.wikiLinkEmbed
    // dispatch) must be equivalent to hand-authored `![[...]]` parsed
    // directly.
    //
    // This is what makes storage interchangeable — a doc written by the
    // drop path is indistinguishable from a doc written by hand once it
    // lands back on disk and re-loads.
    const cases = [
      '![[photo.png]]',
      '![[draft.pdf]]',
      '![[song.mp3]]',
      '![[archive.zip]]',
      '![[diagram.svg]]',
    ];
    for (const md of cases) {
      // Path A: hand-authored — user types the string, mdManager parses.
      const handPm = mdManager.parse(md);

      // Path B: drop-emitted — client builds the intermediate PM
      // `wikiLinkEmbed` node (matches pickInsertShape output in US-011),
      // then mdManager serializes it back to markdown, then parses again
      // through mdManager to reach the canonical PM shape.
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

      // The serialize output ends with a trailing newline from remark-stringify;
      // the hand-authored literal doesn't. Normalize strips that so the
      // comparison is about content equivalence, not whitespace.
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
