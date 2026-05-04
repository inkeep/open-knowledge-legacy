import type { Link, Parent, Text } from 'mdast';

const AUTOLINK_IN_TEXT_RE = /<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]+)>/g;

export function promoteInParent(parent: Parent): void {
  const newChildren: Parent['children'] = [];
  let changed = false;

  for (const child of parent.children) {
    if (child.type !== 'text') {
      newChildren.push(child);
      continue;
    }

    const text = (child as Text).value;
    AUTOLINK_IN_TEXT_RE.lastIndex = 0;

    const segments: Parent['children'] = [];
    let lastIndex = 0;

    for (;;) {
      const match = AUTOLINK_IN_TEXT_RE.exec(text);
      if (match === null) break;
      const fullMatch = match[0]; // `<scheme:uri>`
      const uri = match[1]; // `scheme:uri`
      const matchStart = match.index;

      if (matchStart > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) } as Text);
      }

      const linkNode: Link & { data: { sourceStyle: string } } = {
        type: 'link',
        url: uri,
        title: null,
        children: [{ type: 'text', value: uri } as Text],
        data: { sourceStyle: 'autolink' },
      };
      segments.push(linkNode);

      lastIndex = matchStart + fullMatch.length;
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
