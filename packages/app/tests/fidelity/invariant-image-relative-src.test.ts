import { describe, expect, test } from 'bun:test';
import { posix } from 'node:path';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { assertAcrossSeeds, mdManager, PBT_TIMEOUT_MS } from './helpers';

/** Recursively find the rendered image `src` — block-context images land on
 * `jsxComponent('CommonMarkImage')` (`attrs.props.src`); inline images land
 * on the plain PM `image` node (`attrs.src`). */
function findImageSrc(json: JSONContent): string | null {
  if (json.type === 'jsxComponent' && json.attrs?.componentName === 'CommonMarkImage') {
    const props = json.attrs?.props as { src?: unknown } | undefined;
    return typeof props?.src === 'string' ? props.src : null;
  }
  if (json.type === 'image') {
    return typeof json.attrs?.src === 'string' ? json.attrs.src : null;
  }
  for (const child of json.content ?? []) {
    const found = findImageSrc(child);
    if (found !== null) return found;
  }
  return null;
}

const seg = fc.stringMatching(/^[a-z][a-z0-9_-]{0,8}$/).filter((s) => s.length > 0);
const ext = fc.constantFrom('png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif');
const altText = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/), { minLength: 1, maxLength: 3 })
  .map((w) => w.join(' '));

const docRelativeImage = fc
  .record({
    docDirSegs: fc.array(seg, { minLength: 1, maxLength: 3 }),
    docStem: seg,
    climb: fc.nat(),
    descendSegs: fc.array(seg, { minLength: 0, maxLength: 3 }),
    fileStem: seg,
    fileExt: ext,
    alt: altText,
    inline: fc.boolean(),
  })
  .map((r) => {
    const docDir = r.docDirSegs.join('/');
    const sourcePath = `${docDir}/${r.docStem}.md`;
    const climb = Math.min(r.climb, r.docDirSegs.length);
    const remainingDir = r.docDirSegs.slice(0, r.docDirSegs.length - climb);
    const relPrefix = climb === 0 ? './' : '../'.repeat(climb);
    const tail = [...r.descendSegs, `${r.fileStem}.${r.fileExt}`].join('/');
    const relSrc = `${relPrefix}${tail}`;
    const resolvedDir = [...remainingDir, ...r.descendSegs].join('/');
    const resolved =
      resolvedDir.length > 0
        ? `${resolvedDir}/${r.fileStem}.${r.fileExt}`
        : `${r.fileStem}.${r.fileExt}`;
    const expectedSrc = `/${resolved}`;
    const md = r.inline ? `Prose ![${r.alt}](${relSrc}) inline.\n` : `![${r.alt}](${relSrc})\n`;
    return { md, sourcePath, expectedSrc, relSrc };
  });

describe('image relative-src — server-absolute render src + byte-identical round-trip', () => {
  test(
    'I-src: doc-relative image src resolves to a server-absolute path rooted at contentDir',
    () => {
      assertAcrossSeeds(
        fc.property(docRelativeImage, ({ md, sourcePath, expectedSrc }) => {
          const json = mdManager.parse(md, { sourcePath });
          const src = findImageSrc(json);
          expect(src).not.toBeNull();
          expect(src as string).toMatch(/^\//);
          expect(src).toBe(expectedSrc);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'I-rt: serialize(parse(md, { sourcePath })) is byte-identical (on-disk path not rewritten)',
    () => {
      assertAcrossSeeds(
        fc.property(docRelativeImage, ({ md, sourcePath }) => {
          expect(mdManager.serialize(mdManager.parse(md, { sourcePath }))).toBe(md);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('anchor case: aang.md → ../../assets/images/characters/aang.png', () => {
    const md = '![Aang](../../assets/images/characters/aang.png)\n';
    const sourcePath = 'characters/air-nomads/aang.md';
    const json = mdManager.parse(md, { sourcePath });
    expect(findImageSrc(json)).toBe('/assets/images/characters/aang.png');
    expect(mdManager.serialize(json)).toBe(md);
    expect(findImageSrc(json)).toBe(
      `/${posix.normalize(posix.join(posix.dirname(sourcePath), '../../assets/images/characters/aang.png'))}`,
    );
  });
});
