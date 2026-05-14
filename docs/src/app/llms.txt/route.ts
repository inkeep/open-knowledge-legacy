import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  return new Response(
    [
      '# Open Knowledge',
      '## Docs',
      ...source
        .getPages()
        .map((page) => `- [${page.data.title}](https://openknowledge.ai${page.url})`),
    ].join('\n\n'),
  );
}
