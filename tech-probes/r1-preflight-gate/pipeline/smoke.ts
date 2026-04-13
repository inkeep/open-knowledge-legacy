import { parse, serialize } from './pipeline';

const cases = [
  '# Hello\n',
  '## H\n\nP\n',
  '**bold**\n',
  '_italic_\n',
  '- a\n- b\n- c\n',
  '1. one\n2. two\n',
  '```js\nx = 1;\n```\n',
  '> quote\n',
  '[text](https://example.com)\n',
  'H&M Store\n',
  '[text][label]\n\n[label]: https://example.com\n',
];

for (const md of cases) {
  try {
    const doc = parse(md);
    const out = serialize(doc);
    console.log(`--- IN:  ${JSON.stringify(md)}`);
    console.log(`    OUT: ${JSON.stringify(out)}`);
  } catch (err: any) {
    console.log(`--- IN:  ${JSON.stringify(md)}`);
    console.log(`    ERR: ${err.message}`);
  }
}
