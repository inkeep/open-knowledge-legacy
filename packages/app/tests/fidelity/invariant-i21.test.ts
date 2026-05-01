
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
    const json = mdManager.parse('![](/pure.png)\n');
    const image = findFirstJsxComponent(json);
    expect(image).not.toBeNull();
    const props = image?.attrs?.props as Record<string, unknown> | undefined;
    expect(props?.src).toBe('/pure.png');
    expect(props?.alt).toBeUndefined();
  });

  test('CommonMark image props === MDX JSX <img> props (render-time equivalence)', () => {
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
    const json = mdManager.parse('Prose with an ![inline](/img.png) image inside.\n');
    const image = findFirstJsxComponent(json);
    expect(image).toBeNull();
  });

  test('multiple block images each get their own jsxComponent', () => {
    const json = mdManager.parse('![a](/a.png)\n\n![b](/b.png)\n');
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
    const input = '![Diagram](/assets/arch.png "Service topology")\n';
    const parsed = mdManager.parse(input);
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(input.trim());
  });
});

describe('I21 PBT: fuzz CommonMark image → descriptor structural equivalence', () => {
  test('promoted image always carries src; alt/title when present', () => {
    fc.assert(
      fc.property(
        fc.tuple(
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
