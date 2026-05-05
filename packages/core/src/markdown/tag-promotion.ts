import type { Parent, Text } from 'mdast';
import type { TagMdast } from './mdast-augmentation.ts';

export const TAG_IN_TEXT_PATTERN_SOURCE = '(^|\\s)#([a-zA-Z][\\w/-]*)';
export function createTagInTextRegex(): RegExp {
  return new RegExp(TAG_IN_TEXT_PATTERN_SOURCE, 'g');
}
const TAG_IN_TEXT_RE = createTagInTextRegex();

function isEscapedHash(source: string, sourceOffsetOfHash: number): boolean {
  if (sourceOffsetOfHash <= 0) return false;
  if (source[sourceOffsetOfHash - 1] !== '\\') return false;
  let cursor = sourceOffsetOfHash - 1;
  let count = 0;
  while (cursor >= 0 && source[cursor] === '\\') {
    count++;
    cursor--;
  }
  return count % 2 === 1;
}

export function promoteTagsInParent(parent: Parent, source: string = ''): void {
  const newChildren: Parent['children'] = [];
  let changed = false;

  for (const child of parent.children) {
    if (child.type !== 'text') {
      newChildren.push(child);
      continue;
    }

    const text = (child as Text).value;
    const childTextStart =
      typeof (child as Text).position?.start?.offset === 'number'
        ? ((child as Text).position?.start?.offset ?? 0)
        : 0;
    TAG_IN_TEXT_RE.lastIndex = 0;

    const segments: Parent['children'] = [];
    let lastIndex = 0;

    for (;;) {
      const match = TAG_IN_TEXT_RE.exec(text);
      if (match === null) break;
      const boundary = match[1] ?? ''; // the `^` empty match or one char
      const tagValue = match[2] ?? '';
      const tagStart = match.index + boundary.length; // position of `#` in value

      if (source && childTextStart >= 0) {
        let sourceCursor = childTextStart;
        let valueCursor = 0;
        let hashSourceOffset = -1;
        while (valueCursor <= tagStart && sourceCursor < source.length) {
          const isEscape =
            source[sourceCursor] === '\\' &&
            sourceCursor + 1 < source.length &&
            text[valueCursor] === source[sourceCursor + 1];
          const valueByteSourceOffset = isEscape ? sourceCursor + 1 : sourceCursor;
          if (valueCursor === tagStart) {
            hashSourceOffset = valueByteSourceOffset;
            break;
          }
          sourceCursor = isEscape ? sourceCursor + 2 : sourceCursor + 1;
          valueCursor += 1;
        }
        if (hashSourceOffset >= 0 && isEscapedHash(source, hashSourceOffset)) {
          continue;
        }
      }

      if (tagStart > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, tagStart) } as Text);
      }

      const tagNode: TagMdast = { type: 'tag', value: tagValue };
      segments.push(tagNode as unknown as Parent['children'][number]);

      lastIndex = tagStart + 1 + tagValue.length; // 1 for `#`
      changed = true;
    }

    if (segments.length === 0) {
      newChildren.push(child);
    } else {
      if (lastIndex < text.length) {
        segments.push({ type: 'text', value: text.slice(lastIndex) } as Text);
      }
      newChildren.push(...segments);
    }
  }

  if (changed) {
    parent.children = newChildren;
  }
}
