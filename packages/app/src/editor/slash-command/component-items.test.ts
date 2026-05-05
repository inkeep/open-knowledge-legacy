import { describe, expect, test } from 'bun:test';
import {
  consumeAutoOpen,
  createChildNode,
  getComponentItems,
  getInlineComponentItems,
} from './component-items';

describe('getComponentItems (descriptor-driven slash menu)', () => {
  test('returns exactly the canonical descriptors (5-pack + Math + Pdf)', () => {
    const items = getComponentItems();
    const labels = items.map((i) => i.label).sort();
    expect(labels).toEqual(
      ['Accordion', 'Audio', 'Callout', 'Image', 'Math', 'PDF', 'Video'].sort(),
    );
  });

  test('every entry exposes the SlashCommandItem contract', () => {
    const items = getComponentItems();
    for (const item of items) {
      expect(item.name).toMatch(/^component-/);
      expect(item.label).toBeString();
      expect(item.icon).toBeDefined();
      expect(item.category).toBeString();
      expect(item.command).toBeFunction();
    }
  });

  test('compat descriptors are absent — fresh inserts are canonical-only', () => {
    const items = getComponentItems();
    for (const compatName of ['CommonMarkImage', 'GFMCallout', 'HtmlDetailsAccordion']) {
      expect(items.some((i) => i.name === `component-${compatName}`)).toBe(false);
    }
  });
});

describe('createChildNode — default props on slash insert', () => {
  test('img: only declared defaults are pre-populated, no synthetic 0 / "" / first-enum', () => {
    const node = createChildNode('img');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.loading).toBe('lazy');
    expect(props.decoding).toBe('auto');
    expect(props.fetchpriority).toBe('auto');
    expect(props.alt).toBe('');
    expect(props.src).toBe('');
    expect(props.width).toBeUndefined();
    expect(props.height).toBeUndefined();
    expect(props.srcset).toBeUndefined();
    expect(props.sizes).toBeUndefined();
    expect(props.title).toBeUndefined();
    expect(props.crossorigin).toBeUndefined();
    expect(props.referrerpolicy).toBeUndefined();
  });

  test('video: src="" (empty default for placeholder) and controls=true (declared); everything else unset', () => {
    const node = createChildNode('video');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.controls).toBe(true);
    expect(props.src).toBe('');
    expect(props.poster).toBeUndefined();
    expect(props.width).toBeUndefined();
    expect(props.height).toBeUndefined();
    expect(props.title).toBeUndefined();
  });

  test('audio: src="" (empty default for placeholder) and controls=true (declared); everything else unset', () => {
    const node = createChildNode('audio');
    const props = (node.attrs as { props?: Record<string, unknown> }).props ?? {};
    expect(props.controls).toBe(true);
    expect(props.src).toBe('');
    expect(props.title).toBeUndefined();
  });
});

describe('getInlineComponentItems (D-T11 / FR-T14)', () => {
  test('returns the Tag entry with the SlashCommandItem contract', () => {
    const items = getInlineComponentItems();
    expect(items.length).toBe(1);
    const tag = items[0];
    expect(tag.name).toBe('component-Tag');
    expect(tag.label).toBe('Tag');
    expect(tag.category).toBe('content');
    expect(tag.icon).toBeDefined();
    expect(tag.command).toBeFunction();
    expect(tag.aliases).toContain('hashtag');
  });

  test('command inserts an empty `tag` atom and queues auto-open', () => {
    let inserted = false;
    let setNodeSelectionCalled = -1;
    let setPendingPos = -1;

    const originalRAF = globalThis.requestAnimationFrame;
    try {
      globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      }) as typeof globalThis.requestAnimationFrame;

      const tagNode = { type: { name: 'tag' }, attrs: { value: '' } };
      const doc = {
        descendants: (cb: (node: typeof tagNode, pos: number) => boolean | undefined) => {
          if (!inserted) return; // pre-insert: no tag nodes
          cb(tagNode, 5); // post-insert: one new tag at pos 5
        },
      };
      const editor = {
        state: { doc },
        chain: () => ({
          focus: () => ({
            insertTag: (_value: string) => ({
              run: () => {
                inserted = true;
              },
            }),
          }),
        }),
        commands: {
          setNodeSelection: (pos: number) => {
            setNodeSelectionCalled = pos;
          },
        },
      };

      const items = getInlineComponentItems();
      items[0].command(editor as never);

      expect(inserted).toBe(true);
      expect(setNodeSelectionCalled).toBe(5);

      setPendingPos = 5;
      expect(consumeAutoOpen(setPendingPos)).toBe(true);
      expect(consumeAutoOpen(setPendingPos)).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });
});
