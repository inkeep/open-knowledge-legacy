import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const cases = [
  '---\n\n---', // empty frontmatter, no content
  '---\n---', // empty frontmatter, no blank line
  '---\n\ntext\n\n---', // looks like frontmatter but content is markdown
  '---\ntitle: x\n---', // valid YAML frontmatter
  '---\n', // unclosed — falls through?
];

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);

for (const c of cases) {
  try {
    const tree = processor.parse(c);
    console.log('Input:', JSON.stringify(c));
    console.log('Tree:', JSON.stringify(tree, null, 2));
    console.log('---');
  } catch (e: any) {
    console.log('Input:', JSON.stringify(c), 'ERROR:', e.message);
  }
}
