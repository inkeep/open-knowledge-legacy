import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content',
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      inline: 'tailing-curly-colon',
      themes: {
        dark: 'houston',
        light: 'slack-ochin',
      },
    },
  },
});
