import { getTableOfContents } from 'fumadocs-core/content/toc';
import { getSlugs } from 'fumadocs-core/source';
import { printErrors, readFiles, scanURLs, validateFiles } from 'next-validate-link';

async function checkLinks() {
  const docsFiles = await readFiles(['content/**/*.{md,mdx}', '!content/_legacy/**/*']);

  const scanned = await scanURLs({
    populate: {
      'docs/[...slug]': docsFiles.map((file) => {
        return {
          value: getSlugs(file.path.replace(/^content\//, '')),
          hashes: getTableOfContents(file.content).map((item) => item.url.slice(1)),
        };
      }),
    },
  });

  const standardErrors = await validateFiles(docsFiles, {
    scanned,
  });

  printErrors(standardErrors, true);
}

void checkLinks();
