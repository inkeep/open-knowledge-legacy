/**
 * Position-slice walker: source-form recovery + escapeMark tagging.
 *
 * Runs as a unified transformer AFTER all syntax extensions produce their
 * mdast (so positions are final) and BEFORE remarkProseMirror (so handlers
 * can read node.data.*).
 *
 * Recovery matrix (§19.2):
 *   emphasis   → data.sourceDelimiter ('*' | '_')
 *   strong     → data.sourceDelimiter ('**' | '__')
 *   heading    → data.sourceStyle ('atx' | 'setext')
 *   list       → data.bulletMarker ('-' | '*' | '+')
 *                 OR data.listMarkerDelimiter ('.' | ')')
 *   code       → data.sourceFenceChar ('`' | '~') + data.sourceFenceLength
 *   thematicBreak → data.sourceRaw (verbatim string)
 *   break      → data.sourceStyle ('backslash' | 'spaces')
 *   link       → uses native linkReference.referenceType (no slicing needed)
 *
 * escapeMark tagging (D20):
 *   For text nodes whose source range contained backslash-escaped
 *   structurally-ambiguous chars (CommonMark §2.4), mark the text run
 *   with data.escapedChars — an array of { offset, char } where offset
 *   is relative to the text node value.
 */

import type { Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/**
 * CommonMark §2.4 structurally-ambiguous characters.
 * A backslash before any of these is a valid escape that mdast will consume.
 */
const ESCAPABLE_CHARS = new Set('\\`*_{}[]()#+-.!|~<>:/&$%@^'.split(''));

export interface EscapedChar {
  /** Offset within the text node value (0-based) */
  offset: number;
  /** The character that was escaped */
  char: string;
}

/**
 * Creates a unified transformer plugin that walks mdast and attaches
 * source-form recovery data to node.data.
 */
export function positionSlicePlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';
    if (!source) return;

    // Debug observability: opt-in via env var (OK_DEBUG_POSITION_SLICE=1)
    // — when set, warns on nodes with missing/out-of-bounds positions so
    // fidelity-attribute dropouts become diagnosable during development.
    const debug = typeof process !== 'undefined' && process.env?.OK_DEBUG_POSITION_SLICE === '1';

    visit(tree, (node: Nodes) => {
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

      // Bounds check — source.length is authoritative; discard malformed positions.
      if (startOff < 0 || endOff > source.length) {
        if (debug) {
          console.warn(
            `[position-slice] node type=${node.type} position out of bounds: ` +
              `start=${startOff} end=${endOff} sourceLen=${source.length}`,
          );
        }
        return;
      }

      node.data = node.data ?? {};

      switch (node.type) {
        case 'text': {
          // escapeMark tagging (D20): scan source for backslash-X sequences
          // where X is a structurally-ambiguous char
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
                ESCAPABLE_CHARS.has(raw[rawIdx + 1])
              ) {
                // This is an escape sequence: \X
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
            // Setext: mdast includes the underline in the heading node's position range.
            // Check the source slice within the node boundaries for a trailing underline.
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

        case 'mdxJsxFlowElement':
        case 'mdxJsxTextElement':
        case 'mdxFlowExpression':
        case 'mdxTextExpression':
        case 'mdxjsEsm':
        case 'containerDirective':
        case 'leafDirective':
        case 'textDirective': {
          // Capture raw source for byte-identical round-trip
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
    });
  };
}
