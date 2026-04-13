/**
 * Position-slice walker. Runs after remark-parse, before remark-prosemirror
 * dispatch. Reads node.position.{start,end}.offset against source string to
 * recover delimiters mdast drops, attaches to node.data.
 */
import { visit } from 'unist-util-visit';
import type { Root, Nodes } from 'mdast';

export function walkRecoverDelimiters(source: string): (tree: Root) => void {
  return (tree: Root) => {
    visit(tree, (node: any, _index, parent: any) => {
      const pos = node.position;
      if (!pos || typeof pos.start?.offset !== 'number') return;
      const startOff = pos.start.offset;
      const endOff = pos.end?.offset ?? startOff;

      node.data = node.data ?? {};

      switch (node.type) {
        case 'text': {
          // Recover any backslash escapes: if source slice is longer than node.value,
          // the extra characters are likely backslashes that were consumed.
          const raw = source.slice(startOff, endOff);
          if (raw !== node.value) {
            node.data.sourceRaw = raw;
          }
          break;
        }
        case 'emphasis': {
          const ch = source[startOff];
          if (ch === '*' || ch === '_') node.data.sourceDelimiter = ch;
          break;
        }
        case 'strong': {
          const s = source.slice(startOff, startOff + 2);
          if (s === '**' || s === '__') node.data.sourceDelimiter = s;
          break;
        }
        case 'heading': {
          const prefix = source[startOff];
          if (prefix === '#') {
            node.data.sourceStyle = 'atx';
          } else {
            // Look for underline after end.offset or inside range
            const segment = source.slice(startOff, endOff + 20);
            if (/\n[=]+/.test(segment)) node.data.sourceStyle = 'setext';
            else if (/\n[-]+/.test(segment)) node.data.sourceStyle = 'setext';
            else node.data.sourceStyle = 'atx';
          }
          break;
        }
        case 'list': {
          const firstItem = node.children?.[0];
          if (firstItem?.position?.start?.offset != null) {
            const itemStart = firstItem.position.start.offset;
            const ch = source[itemStart];
            if (!node.ordered && (ch === '-' || ch === '*' || ch === '+')) {
              node.data.bulletMarker = ch;
            } else if (node.ordered) {
              const tail = source.slice(itemStart, itemStart + 10);
              const m = tail.match(/^\d+([.)])/);
              if (m) node.data.listMarkerDelimiter = m[1];
            }
          }
          break;
        }
        case 'code': {
          const ch = source[startOff];
          if (ch === '`' || ch === '~') {
            node.data.sourceFenceChar = ch;
            // count consecutive same chars
            let n = 0;
            while (source[startOff + n] === ch) n++;
            if (n >= 3) node.data.sourceFenceLength = n;
          } else {
            // Indented code block (4-space indent)
            node.data.sourceFenceChar = 'indent';
          }
          break;
        }
        case 'thematicBreak': {
          node.data.sourceRaw = source.slice(startOff, endOff);
          break;
        }
        case 'break': {
          // Hard break. Check char before end.offset
          // If ends with "\\\n", sourceStyle = 'backslash'
          const slice = source.slice(startOff, endOff);
          if (slice.includes('\\')) node.data.sourceStyle = 'backslash';
          else node.data.sourceStyle = 'spaces';
          break;
        }
      }
    });
  };
}
