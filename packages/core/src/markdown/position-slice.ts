import type { Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

const ESCAPABLE_CHARS = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));

interface EscapedChar {
  offset: number;
  char: string;
}

export function splitGfmCellSegments(rowSrc: string): string[] {
  const segments: string[] = [];
  let cur = '';
  for (let i = 0; i < rowSrc.length; i++) {
    const c = rowSrc[i];
    if (c === '\\' && i + 1 < rowSrc.length && rowSrc[i + 1] === '|') {
      cur += `${c}|`;
      i++;
      continue;
    }
    if (c === '|') {
      segments.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments;
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
      const segment = source.slice(startOff, endOff);
      if (prefix === '#') {
        node.data.sourceStyle = 'atx';
        const trailing = /^.*?[ \t](#+)[ \t]*$/.exec(segment);
        if (trailing) {
          node.data.sourceTrailingHashes = trailing[1].length;
        }
      } else {
        const setextH1 = /\n(=+)[ \t]*$/.exec(segment);
        const setextH2 = /\n(-+)[ \t]*$/.exec(segment);
        const setextMatch = setextH1 ?? setextH2;
        if (setextMatch) {
          node.data.sourceStyle = 'setext';
          node.data.sourceUnderlineLength = setextMatch[1].length;
        } else {
          node.data.sourceStyle = 'atx';
        }
      }
      break;
    }

    case 'blockquote': {
      let lineStart = startOff;
      while (lineStart > 0 && source[lineStart - 1] !== '\n') lineStart--;
      let isNested = false;
      for (let i = lineStart; i < startOff; i++) {
        if (source[i] === '>') {
          isNested = true;
          break;
        }
      }

      const slice = source.slice(startOff, endOff);
      const lines = slice.split('\n');
      const markerSpacings: Array<'single' | 'none'> = [];
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (line.length === 0) continue;
        if (isNested && lineIdx > 0) break;
        const stripped = line.replace(/^ {1,3}/, '');
        if (stripped[0] !== '>') continue;
        const restAfterMarker = stripped.slice(1).trimEnd();
        if (restAfterMarker === '') continue;
        const afterMarker = stripped[1];
        if (afterMarker === ' ' || afterMarker === '\t') {
          markerSpacings.push('single');
        } else {
          markerSpacings.push('none');
        }
      }
      if (markerSpacings.length > 0) {
        node.data.sourceMarkerSpacings = markerSpacings;
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
        node.data.sourceStyle = 'fenced';
        node.data.sourceFenceChar = ch;
        let count = 0;
        while (startOff + count < source.length && source[startOff + count] === ch) {
          count++;
        }
        if (count >= 3) {
          node.data.sourceFenceLength = count;
        }
      } else {
        node.data.sourceStyle = 'indented';
      }
      break;
    }

    case 'inlineCode': {
      const ch = source[startOff];
      if (ch === '`' || ch === '~') {
        node.data.sourceFenceChar = ch;
        let count = 0;
        while (startOff + count < source.length && source[startOff + count] === ch) {
          count++;
        }
        if (count >= 1) {
          node.data.sourceFenceLength = count;
        }
      }
      break;
    }

    case 'thematicBreak': {
      node.data.sourceRaw = source.slice(startOff, endOff);
      break;
    }

    case 'table': {
      const tableSrc = source.slice(startOff, endOff);
      const newlineIdx = tableSrc.indexOf('\n');
      if (newlineIdx === -1) break;
      const afterHeader = tableSrc.slice(newlineIdx + 1);
      const nextNewlineIdx = afterHeader.indexOf('\n');
      const alignmentLine =
        nextNewlineIdx === -1 ? afterHeader : afterHeader.slice(0, nextNewlineIdx);

      const inner = alignmentLine.trim().replace(/^\|/, '').replace(/\|$/, '');
      const cells = inner.split('|');
      const dashCounts: number[] = [];
      for (const cell of cells) {
        const matches = cell.match(/-/g);
        dashCounts.push(matches ? matches.length : 0);
      }
      if (dashCounts.some((c) => c > 0)) {
        node.data.sourceDashCounts = dashCounts;
      }

      for (const row of node.children ?? []) {
        if (row.type !== 'tableRow' || !row.position) continue;
        const rowStart = row.position.start.offset;
        const rowEnd = row.position.end.offset;
        if (typeof rowStart !== 'number' || typeof rowEnd !== 'number') continue;
        let rowSrc = source.slice(rowStart, rowEnd);
        const lineBreak = rowSrc.indexOf('\n');
        if (lineBreak !== -1) rowSrc = rowSrc.slice(0, lineBreak);

        const segments = splitGfmCellSegments(rowSrc);
        if (segments.length > 0 && segments[0] === '' && rowSrc.startsWith('|')) {
          segments.shift();
        }
        if (segments.length > 0 && segments[segments.length - 1] === '' && rowSrc.endsWith('|')) {
          segments.pop();
        }

        const rowCells = row.children ?? [];
        const limit = Math.min(rowCells.length, segments.length);
        for (let i = 0; i < limit; i++) {
          const cell = rowCells[i];
          if (cell.type !== 'tableCell') continue;
          const seg = segments[i];
          let leftPad = 0;
          while (leftPad < seg.length && seg[leftPad] === ' ') leftPad++;
          let rightPad = 0;
          while (rightPad < seg.length - leftPad && seg[seg.length - 1 - rightPad] === ' ') {
            rightPad++;
          }
          if (!cell.data) cell.data = {};
          cell.data.sourcePadding = { left: leftPad, right: rightPad };
        }
      }
      break;
    }

    case 'link':
    case 'linkReference': {
      if ('children' in node && node.children.length === 0) {
        node.data.sourceRaw = source.slice(startOff, endOff);
      }
      if (node.type === 'link') {
        const first = source[startOff];
        if (first !== '[' && first !== '<' && !node.title) {
          node.data.sourceStyle = 'gfm-autolink';
        } else if (first === '[') {
          const slice = source.slice(startOff, endOff);
          const closeBracketIdx = slice.lastIndexOf('](');
          if (closeBracketIdx !== -1) {
            let cursor = closeBracketIdx + 2;
            while (cursor < slice.length && (slice[cursor] === ' ' || slice[cursor] === '\t')) {
              cursor++;
            }
            if (slice[cursor] === '<') {
              node.data.sourceUrlForm = 'angle-bracketed';
            }
            if (
              node.title !== undefined &&
              node.title !== null &&
              slice[slice.length - 1] === ')'
            ) {
              let i = slice.length - 2; // skip the link's closing `)`
              while (
                i > closeBracketIdx + 1 &&
                (slice[i] === ' ' || slice[i] === '\t' || slice[i] === '\n')
              ) {
                i--;
              }
              if (slice[i] === '"') {
                node.data.sourceTitleMarker = 'double';
              } else if (slice[i] === "'") {
                node.data.sourceTitleMarker = 'single';
              } else if (slice[i] === ')') {
                node.data.sourceTitleMarker = 'paren';
              }
            }
          }
        }
      }
      break;
    }

    case 'definition': {
      const slice = source.slice(startOff, endOff);
      node.data.sourceLayout = slice.includes('\n') ? 'multiline' : 'inline';
      if (typeof node.title === 'string' && slice.length > 0) {
        const lastChar = slice[slice.length - 1];
        if (lastChar === '"') {
          node.data.sourceTitleMarker = 'double';
        } else if (lastChar === "'") {
          node.data.sourceTitleMarker = 'single';
        } else if (lastChar === ')') {
          node.data.sourceTitleMarker = 'paren';
        }
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
