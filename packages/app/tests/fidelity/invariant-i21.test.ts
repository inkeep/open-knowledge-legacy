/**
 * I21 — CommonMark `image` → `<img>` round-trip (M15 remediation).
 *
 * Delivers the "MDX as a strict superset of the markdown form" invariant
 * for media — parallels I18 (GFM alerts → Callout) and I19 (HTML5
 * <details> → Accordion).
 *
 * Invariant: a block-context CommonMark image (a paragraph whose single
 * inline child is an `image` node) parses to the same PM tree shape as
 * the equivalent `<img src=... alt=...>` MDX JSX form.
 *
 * γ preservation: the promoter copies the paragraph's `.position` onto
 * the emitted `mdxJsxFlowElement`, so Phase B's position-slice walker
 * attaches `data.sourceRaw` with the original `![alt](src "title")`
 * bytes. On pristine save the custom to-markdown handler emits that
 * verbatim (precedent #12 γ hybrid serialization).
 *
 * Scope:
 * - Promotes: block-context paragraphs `![alt](src)` + `![alt](src "title")`.
 * - Does NOT promote: inline images inside prose (a paragraph with
 *   multiple inline children). This preserves the paragraph structure.
 * - Does NOT promote: Obsidian `![[file.png]]` — that's PR #270's
 *   wikiLinkEmbed territory (NG23).
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { mdManager, NUM_RUNS } from './helpers';

function findFirstJsxComponent(
  json: unknown,
): { type: string; attrs?: Record<string, unknown> } | null {
  if (!json || typeof json !== 'object') return null;
  const node = json as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
  if (node.type === 'jsxComponent')
    return node as { type: string; attrs?: Record<string, unknown> };
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const hit = findFirstJsxComponent(child);
      if (hit) return hit;
    }
  }
  return null;
}

describe('I21: CommonMark `![alt](src)` → `<img>` block-context promotion', () => {
  test('bare image paragraph → jsxComponent(CommonMarkImage)', () => {
    const json = mdManager.parse('![Architecture](/assets/diagram.png)\n');
    const image = findFirstJsxComponent(json);
    expect(image).not.toBeNull();
    expect(image?.attrs?.componentName).toBe('CommonMarkImage');
    const props = image?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/assets/diagram.png');
    expect(props?.alt).toBe('Architecture');
  });

  test('image with title attribute → jsxComponent(Image) with title prop', () => {
    const json = mdManager.parse('![alt text](/img.png "Tooltip content")\n');
    const image = findFirstJsxComponent(json);
    expect(image).not.toBeNull();
    const props = image?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/img.png');
    expect(props?.alt).toBe('alt text');
    expect(props?.title).toBe('Tooltip content');
  });

  test('empty alt preserves empty string and promotes', () => {
    // Empty alt is legitimate for decorative images — don't emit the `alt`
    // attribute but still promote. (The transformer skips empty alt per
    // `if (image.alt)` so the attribute is absent; descriptor default wins.)
    const json = mdManager.parse('![](/pure.png)\n');
    const image = findFirstJsxComponent(json);
    expect(image).not.toBeNull();
    const props = image?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/pure.png');
    expect(props?.alt).toBeUndefined();
  });

  test('CommonMark image props === MDX JSX <img> props (render-time equivalence)', () => {
    // CommonMark `![alt](src)` parses to `componentName: 'CommonMarkImage'`
    // (compat) while MDX `<img ...>` parses to `componentName: 'img'`
    // (canonical). Both render through the same React component via
    // `rendersAs: 'img'` on CommonMarkImage; the load-bearing equivalence is
    // the props bag — not byte-equal PM trees. Source-form preservation is
    // the whole point of the split.
    const fromCommonMark = mdManager.parse('![Arc](/a.png "X")\n');
    const fromMdxJsx = mdManager.parse('<img src="/a.png" alt="Arc" title="X" />\n');
    const cmImage = findFirstJsxComponent(fromCommonMark);
    const mdxImage = findFirstJsxComponent(fromMdxJsx);
    expect(cmImage?.attrs?.componentName).toBe('CommonMarkImage');
    expect(mdxImage?.attrs?.componentName).toBe('img');
    const cmProps = cmImage?.attrs?.props as Record<string, unknown> | undefined;
    const mdxProps = mdxImage?.attrs?.props as Record<string, unknown> | undefined;
    expect(cmProps?.src).toBe(mdxProps?.src);
    expect(cmProps?.alt).toBe(mdxProps?.alt);
    expect(cmProps?.title).toBe(mdxProps?.title);
  });

  test('inline image inside prose stays as inline image (scope)', () => {
    // A paragraph with mixed content — image + surrounding text — should
    // NOT be promoted (would break paragraph structure).
    const json = mdManager.parse('Prose with an ![inline](/img.png) image inside.\n');
    const image = findFirstJsxComponent(json);
    expect(image).toBeNull();
  });

  test('multiple block images each get their own jsxComponent', () => {
    const json = mdManager.parse('![a](/a.png)\n\n![b](/b.png)\n');
    // Walk the tree collecting jsxComponents.
    const found: Array<{ src: string; alt?: string }> = [];
    (function walk(n: unknown) {
      if (!n || typeof n !== 'object') return;
      const node = n as {
        type?: string;
        attrs?: Record<string, unknown>;
        content?: unknown[];
      };
      if (node.type === 'jsxComponent') {
        const props = node.attrs?.props as Record<string, unknown> | undefined;
        found.push({
          src: props?.src as string,
          alt: props?.alt as string | undefined,
        });
      }
      if (Array.isArray(node.content)) node.content.forEach(walk);
    })(json);
    expect(found).toHaveLength(2);
    expect(found[0]?.src).toBe('/a.png');
    expect(found[0]?.alt).toBe('a');
    expect(found[1]?.src).toBe('/b.png');
    expect(found[1]?.alt).toBe('b');
  });

  test('pristine byte-identity on round-trip (γ preservation)', () => {
    // γ pristine path: unedited Image block preserves the authored form.
    // CommonMark `![alt](src)` stays `![alt](src)` on round-trip; the
    // position-slice walker attaches the original bytes as sourceRaw and
    // the to-markdown handler emits sourceRaw verbatim.
    const input = '![Diagram](/assets/arch.png "Service topology")\n';
    const parsed = mdManager.parse(input);
    const serialized = mdManager.serialize(parsed);
    // Pristine (no edit) → bytes survive verbatim modulo trailing newline.
    expect(serialized.trim()).toBe(input.trim());
  });
});

describe('I21 PBT: fuzz CommonMark image → descriptor structural equivalence', () => {
  test('promoted image always carries src; alt/title when present', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          // Alt: alphanumeric + spaces only. Emphasis markers (`_`, `*`)
          // inside alt trigger CommonMark emphasis tokenization — that's
          // a known markdown sharp edge, not a promoter bug. Authors
          // using those characters escape them; the PBT stays in the
          // unambiguous zone.
          fc.stringMatching(/^[a-zA-Z0-9 -]{1,20}$/),
          fc.stringMatching(/^\/[a-zA-Z0-9./-]{1,40}\.(png|jpg|svg)$/), // src
          fc.option(fc.stringMatching(/^[a-zA-Z0-9 -]{1,20}$/), { nil: undefined }), // title?
        ),
        ([alt, src, title]) => {
          const md = title ? `![${alt}](${src} "${title}")\n` : `![${alt}](${src})\n`;
          const parsed = mdManager.parse(md);
          const image = findFirstJsxComponent(parsed);
          if (!image) return false;
          const props = image.attrs?.props as Record<string, unknown> | undefined;
          if (image.attrs?.componentName !== 'CommonMarkImage') return false;
          if (props?.src !== src) return false;
          if (alt && props?.alt !== alt) return false;
          if (title && props?.title !== title) return false;
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
