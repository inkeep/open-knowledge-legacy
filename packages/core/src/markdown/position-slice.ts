import type { Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

const ESCAPABLE_CHARS = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));

interface EscapedChar {
  offset: number;
  char: string;
}

export function applyPositionSliceToNode(
  node: Nodes,
  source: string,
  debug: boolean = false,
): void {
  if (!source) return;
  const pos = node.position;
  if (!pos || typeof pos.start?.offset !== 'number') {
    if (debug) {
      console.warn(
        `[position-slice] node type=${node.type} has no position — fidelity defaults apply`,
      );
    }
    return;
  }

  const startOff = pos.start.offset;
  const endOff = pos.end?.offset ?? startOff;

  if (startOff < 0 || endOff > source.length) {
    if (debug) {
      console.warn(
        `[position-slice] node type=${node.type} position out of bounds: ` +
          `start=${startOff} end=${endOff} sourceLen=${source.length}`,
      );
    }
    return;
  }

  node.data ??= {};

  switch (node.type) {
    case 'text': {
      const raw = source.slice(startOff, endOff);
      const value: string = node.value ?? '';
      if (raw.length > value.length && raw.includes('\\')) {
        const escaped: EscapedChar[] = [];
        let rawIdx = 0;
        let valIdx = 0;
        while (rawIdx < raw.length && valIdx < value.length) {
          if (
            raw[rawIdx] === '\\' &&
            rawIdx + 1 < raw.length &&
            ESCAPABLE_CHARS.has(raw[rawIdx + 1]) &&
            value[valIdx] === raw[rawIdx + 1]
          ) {
            escaped.push({ offset: valIdx, char: raw[rawIdx + 1] });
            rawIdx += 2; // skip backslash + char
            valIdx += 1; // the char appears in value without backslash
          } else {
            rawIdx++;
            valIdx++;
          }
        }
        if (escaped.length > 0) {
          node.data.escapedChars = escaped;
        }
      }

      if (raw.endsWith('\\') && value.endsWith('\\')) {
        node.data.sourceRaw = raw;
      }
      break;
    }

    case 'emphasis': {
      const ch = source[startOff];
      if (ch === '*' || ch === '_') {
        node.data.sourceDelimiter = ch;
      }
      break;
    }

    case 'strong': {
      const s = source.slice(startOff, startOff + 2);
      if (s === '**' || s === '__') {
        node.data.sourceDelimiter = s;
      }
      break;
    }

    case 'heading': {
      const prefix = source[startOff];
      if (prefix === '#') {
        node.data.sourceStyle = 'atx';
      } else {
        const segment = source.slice(startOff, endOff);
        if (/\n[=]+\s*$/.test(segment) || /\n[-]+\s*$/.test(segment)) {
          node.data.sourceStyle = 'setext';
        } else {
          node.data.sourceStyle = 'atx';
        }
      }
      break;
    }

    case 'list': {
      const firstItem = node.children?.[0];
      if (firstItem?.position?.start?.offset != null) {
        const itemStart = firstItem.position.start.offset;
        if (itemStart >= 0 && itemStart < source.length) {
          const ch = source[itemStart];
          if (!node.ordered && (ch === '-' || ch === '*' || ch === '+')) {
            node.data.bulletMarker = ch;
          } else if (node.ordered) {
            const tail = source.slice(itemStart, Math.min(itemStart + 10, source.length));
            const m = tail.match(/^\d+([.)])/);
            if (m) node.data.listMarkerDelimiter = m[1];
          }
        }
      }
      break;
    }

    case 'code': {
      const ch = source[startOff];
      if (ch === '`' || ch === '~') {
        node.data.sourceFenceChar = ch;
        let count = 0;
        while (startOff + count < source.length && source[startOff + count] === ch) {
          count++;
        }
        if (count >= 3) {
          node.data.sourceFenceLength = count;
        }
      }
      break;
    }

    case 'thematicBreak': {
      node.data.sourceRaw = source.slice(startOff, endOff);
      break;
    }

    case 'link':
    case 'linkReference': {
      if ('children' in node && node.children.length === 0) {
        node.data.sourceRaw = source.slice(startOff, endOff);
      }
      break;
    }

    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement':
    case 'mdxFlowExpression':
    case 'mdxTextExpression': {
      node.data.sourceRaw = source.slice(startOff, endOff);
      break;
    }

    case 'break': {
      const slice = source.slice(startOff, endOff);
      if (slice.includes('\\')) {
        node.data.sourceStyle = 'backslash';
      } else {
        node.data.sourceStyle = 'spaces';
      }
      break;
    }
  }
}

export function positionSlicePlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';
    if (!source) return;

    const debug = typeof process !== 'undefined' && process.env?.OK_DEBUG_POSITION_SLICE === '1';

    visit(tree, (node: Nodes) => {
      applyPositionSliceToNode(node, source, debug);
    });
  };
}
