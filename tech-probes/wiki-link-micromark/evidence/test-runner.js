import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { wikiLink } from './wikilink-syntax.js';
import { wikiLinkFromMarkdown, wikiLinkToMarkdown } from './wikilink-mdast.js';

const cases = [
  // Functional shapes
  { id: 'F1', md: '[[Page]]', kind: 'functional' },
  { id: 'F2', md: '[[Page|Alias]]', kind: 'functional' },
  { id: 'F3', md: '[[Page#Heading]]', kind: 'functional' },
  { id: 'F4', md: '[[Page#Heading|Alias]]', kind: 'functional' },

  // Edge cases
  { id: 'E1', md: '[[Page Name With Spaces]]', kind: 'edge', shouldTokenize: true },
  { id: 'E2', md: '[[Page]]-adjacent-text', kind: 'edge', shouldTokenize: true },
  { id: 'E3', md: 'text-before-[[Page]]-text-after', kind: 'edge', shouldTokenize: true },
  { id: 'E4', md: '[[Page]] [[Another]]', kind: 'edge', shouldTokenize: true, expectCount: 2 },
  { id: 'E5', md: '\\[[Not-a-link\\]]', kind: 'edge', shouldTokenize: false },
  { id: 'E6', md: '[Not a wiki [link]]', kind: 'edge', shouldTokenize: false },
  { id: 'E7', md: '[[]]', kind: 'edge', shouldTokenize: false },
  { id: 'E8', md: '[[Page with `code` inside]]', kind: 'edge', shouldTokenize: true },
  { id: 'E9', md: '[[Página]]', kind: 'edge', shouldTokenize: true },
  { id: 'E10', md: '[[Page\\|Alias]]', kind: 'edge', shouldTokenize: true, note: 'escaped pipe' },
  { id: 'E11', md: '[[Page#H#H]]', kind: 'edge', shouldTokenize: true, note: 'double hash' },

  // Integration
  { id: 'I1', md: '# See [[Page]] for details', kind: 'integration' },
  { id: 'I2', md: '- See [[Page]]', kind: 'integration' },
  { id: 'I3', md: '*See [[Page]]*', kind: 'integration' },
  { id: 'I4', md: '**See [[Page]]**', kind: 'integration' },
  { id: 'I5', md: '[[Page]] and [inline](link)', kind: 'integration' },
];

function findWikiLinks(tree, out = []) {
  if (!tree) return out;
  if (tree.type === 'wikiLink') out.push(tree);
  if (tree.children) for (const c of tree.children) findWikiLinks(c, out);
  return out;
}

const rows = [['id', 'kind', 'input', 'parsed_count', 'round_trip', 'serialized', 'pass', 'notes']];
let passes = 0;
let total = 0;

for (const c of cases) {
  total++;
  let parsedCount = 0;
  let serialized = '';
  let rt = false;
  let pass = false;
  let notes = c.note ?? '';
  let errMsg = '';
  try {
    const tree = fromMarkdown(c.md, {
      extensions: [wikiLink()],
      mdastExtensions: [wikiLinkFromMarkdown],
    });
    const links = findWikiLinks(tree);
    parsedCount = links.length;
    serialized = toMarkdown(tree, { extensions: [wikiLinkToMarkdown] }).replace(/\n+$/, '');

    // Derive round-trip expectation per case
    // Normalize: strip trailing newlines; compare.
    const input = c.md;
    rt = serialized === input;

    if (c.kind === 'functional') {
      pass = parsedCount === 1 && rt;
    } else if (c.kind === 'edge') {
      if (c.shouldTokenize === false) {
        pass = parsedCount === 0;
      } else if (c.expectCount !== undefined) {
        pass = parsedCount === c.expectCount;
      } else {
        pass = parsedCount >= 1;
      }
    } else if (c.kind === 'integration') {
      pass = parsedCount >= 1;
    }
  } catch (e) {
    errMsg = String(e.message || e);
    notes = notes ? `${notes}; ERROR: ${errMsg}` : `ERROR: ${errMsg}`;
  }
  if (pass) passes++;
  rows.push([
    c.id,
    c.kind,
    JSON.stringify(c.md),
    String(parsedCount),
    String(rt),
    JSON.stringify(serialized),
    pass ? 'PASS' : 'FAIL',
    notes,
  ]);
}

console.log(`\n${passes}/${total} passed\n`);
for (const r of rows) console.log(r.join('\t'));
