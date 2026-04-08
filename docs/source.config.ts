import path from 'node:path';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable } from 'fumadocs-typescript';
import { mdxSnippet } from 'remark-mdx-snippets';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      sidebarTitle: z.string().optional(),
      keywords: z.string().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkAutoTypeTable,
      remarkMdxMermaid,
      [mdxSnippet, { snippetsDir: path.resolve(process.cwd(), '_snippets') }],
    ],
    rehypeCodeOptions: {
      inline: 'tailing-curly-colon',
      themes: {
        dark: 'houston',
        light: 'slack-ochin',
      },
    },
  },
});
