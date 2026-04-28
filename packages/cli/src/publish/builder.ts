import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import {
  ASSET_EXTENSIONS,
  classifyMarkdownHref,
  classifyWikiLinkTarget,
  markdownToHtml,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import {
  BacklinkIndex,
  createContentFilter,
  isSupportedDocFile,
  stripDocExtension,
} from '@inkeep/open-knowledge-server';
import picomatch from 'picomatch';

export interface PublishManifest {
  siteTitle: string;
  basePath: string;
  outputDir: string;
  exclude: string[];
}

interface PublishBuildOptions {
  projectDir: string;
  contentDir: string;
  include: string[];
  contentExclude: string[];
  manifest: PublishManifest;
  clean?: boolean;
}

export interface PublishBuildWarning {
  kind: 'dead-link' | 'stale-disk' | 'empty-site';
  message: string;
  source?: string;
  target?: string;
}

export interface PublishBuildPage {
  docName: string;
  title: string;
  url: string;
  sourcePath: string;
  outputPath: string;
}

export interface PublishBuildResult {
  outputDir: string;
  pages: PublishBuildPage[];
  assets: string[];
  warnings: PublishBuildWarning[];
}

interface SourceDocument {
  docName: string;
  relPath: string;
  absPath: string;
  title: string;
  markdown: string;
}

interface AssetFile {
  relPath: string;
  absPath: string;
}

const DEFAULT_SITE_TITLE = 'Open Knowledge';

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') return '';
  const noLeading = trimmed.replace(/^\/+/, '');
  return `/${noLeading.replace(/\/+$/, '')}`;
}

export function defaultPublishManifest(): PublishManifest {
  return {
    siteTitle: DEFAULT_SITE_TITLE,
    basePath: '',
    outputDir: '.open-knowledge/site',
    exclude: [],
  };
}

function docNameToPublicPath(docName: string): string {
  const clean = docName.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean || clean === 'index') return 'index.html';
  if (clean.endsWith('/index')) return `${clean.slice(0, -'/index'.length)}/index.html`;
  return `${clean}/index.html`;
}

export function docNameToPublicUrl(
  docName: string,
  basePath = '',
  anchor: string | null = null,
): string {
  const normalizedBase = normalizeBasePath(basePath);
  const clean = docName.replace(/^\/+/, '').replace(/\/+$/, '');
  const path =
    !clean || clean === 'index'
      ? '/'
      : clean.endsWith('/index')
        ? `/${clean.slice(0, -'/index'.length)}/`
        : `/${clean}/`;
  return `${normalizedBase}${path}${anchor ? `#${anchor}` : ''}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function extractTitle(markdown: string, docName: string): string {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const titleMatch = frontmatter.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  if (titleMatch?.[1]?.trim()) return titleMatch[1].trim();
  const headingMatch = body.match(/^# (.+)$/m);
  return headingMatch?.[1]?.trim() || docName.split('/').at(-1) || docName;
}

function isAssetPath(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase();
  return ASSET_EXTENSIONS.has(ext);
}

function walkContentFiles(options: PublishBuildOptions): {
  docs: SourceDocument[];
  assets: AssetFile[];
} {
  const filter = createContentFilter({
    projectDir: options.projectDir,
    contentDir: options.contentDir,
    includePatterns: options.include,
    excludePatterns: options.contentExclude,
  });
  const isManifestExcluded = picomatch(options.manifest.exclude, { dot: true });
  const docs: SourceDocument[] = [];
  const assets: AssetFile[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absPath = join(dir, entry.name);
      const relPath = relative(options.contentDir, absPath);
      if (entry.isDirectory()) {
        if (!filter.isDirExcluded(relPath)) walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (filter.isExcluded(relPath)) continue;
      if (isManifestExcluded(relPath) || isManifestExcluded(stripDocExtension(relPath))) continue;

      if (isSupportedDocFile(relPath)) {
        const markdown = readFileSync(absPath, 'utf-8');
        const docName = stripDocExtension(relPath);
        docs.push({
          docName,
          relPath,
          absPath,
          markdown,
          title: extractTitle(markdown, docName),
        });
      } else if (isAssetPath(relPath)) {
        assets.push({ relPath, absPath });
      }
    }
  }

  if (existsSync(options.contentDir)) walk(options.contentDir);
  docs.sort((a, b) => {
    if (a.docName === 'index') return -1;
    if (b.docName === 'index') return 1;
    return a.docName.localeCompare(b.docName);
  });
  assets.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { docs, assets };
}

function rewriteLinks(
  html: string,
  sourceDocName: string,
  docNames: ReadonlySet<string>,
  basePath: string,
): string {
  let next = html.replace(
    /<a\b([^>]*?)\bhref="([^"]*)"([^>]*)>/g,
    (match, before: string, href: string, after: string) => {
      const classified = classifyMarkdownHref(href, sourceDocName);
      if (classified?.kind !== 'doc') return match;
      const targetDocName = stripDocExtension(classified.docName);
      if (!docNames.has(targetDocName)) return match;
      return `<a${before}href="${docNameToPublicUrl(targetDocName, basePath, classified.anchor)}"${after}>`;
    },
  );

  next = next.replace(
    /<a\b([^>]*?)\bdata-target="([^"]*)"([^>]*?)\bdata-anchor="([^"]*)"([^>]*)>/g,
    (match, before: string, target: string, middle: string, anchor: string, after: string) => {
      const classified = classifyWikiLinkTarget(target, anchor || null);
      if (classified?.kind !== 'doc') return match;
      const targetDocName = stripDocExtension(classified.docName);
      if (!docNames.has(targetDocName)) return match;
      const href = docNameToPublicUrl(targetDocName, basePath, classified.anchor);
      return `<a${before}data-target="${target}"${middle}data-anchor="${anchor}"${after.replace(/\bhref="[^"]*"/, `href="${href}"`)}>`;
    },
  );

  return next;
}

function renderPage(args: {
  siteTitle: string;
  page: SourceDocument;
  bodyHtml: string;
  nav: SourceDocument[];
  basePath: string;
}): string {
  const nav = args.nav
    .map(
      (page) =>
        `<a href="${docNameToPublicUrl(page.docName, args.basePath)}">${escapeHtml(page.title)}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(args.page.title)} · ${escapeHtml(args.siteTitle)}</title>
  <link rel="stylesheet" href="${normalizeBasePath(args.basePath)}/assets/open-knowledge.css">
</head>
<body>
  <header class="ok-site-header"><a href="${docNameToPublicUrl('index', args.basePath)}">${escapeHtml(args.siteTitle)}</a></header>
  <div class="ok-site-shell">
    <nav class="ok-site-nav">${nav}</nav>
    <main class="ok-site-main">
      ${args.bodyHtml}
    </main>
  </div>
</body>
</html>
`;
}

function siteCss(): string {
  return `:root{color-scheme:light dark;--ok-bg:#fbfaf8;--ok-fg:#1f2933;--ok-muted:#64748b;--ok-line:#d8dee6;--ok-accent:#0f766e;--ok-panel:#ffffff}*{box-sizing:border-box}body{margin:0;background:var(--ok-bg);color:var(--ok-fg);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.ok-site-header{height:56px;display:flex;align-items:center;border-bottom:1px solid var(--ok-line);padding:0 24px;background:var(--ok-panel);font-weight:700}.ok-site-header a{color:inherit;text-decoration:none}.ok-site-shell{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,760px);gap:32px;max-width:1180px;margin:0 auto;padding:28px 24px}.ok-site-nav{display:flex;flex-direction:column;gap:6px}.ok-site-nav a{color:var(--ok-muted);text-decoration:none;border-radius:6px;padding:4px 8px}.ok-site-nav a:hover{background:rgba(15,118,110,.08);color:var(--ok-accent)}.ok-site-main{min-width:0}.ok-site-main a{color:var(--ok-accent)}pre{overflow:auto;padding:12px;border:1px solid var(--ok-line);border-radius:6px}code{font-family:"SFMono-Regular",Consolas,monospace}@media (max-width:760px){.ok-site-shell{display:block}.ok-site-nav{border-bottom:1px solid var(--ok-line);padding-bottom:18px;margin-bottom:24px}}`;
}

export async function buildStaticSite(options: PublishBuildOptions): Promise<PublishBuildResult> {
  const manifest = {
    ...defaultPublishManifest(),
    ...options.manifest,
    basePath: normalizeBasePath(options.manifest.basePath),
  };
  const outputDir = resolve(options.projectDir, manifest.outputDir);
  if (options.clean !== false) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const { docs, assets } = walkContentFiles({ ...options, manifest });
  const docNames = new Set(docs.map((doc) => doc.docName));
  const admittedLinkTargets = new Set<string>();
  for (const docName of docNames) {
    admittedLinkTargets.add(docName);
    admittedLinkTargets.add(`${docName}.md`);
    admittedLinkTargets.add(`${docName}.mdx`);
  }
  const warnings: PublishBuildWarning[] = [];
  if (docs.length === 0) {
    warnings.push({
      kind: 'empty-site',
      message: 'No publishable documents matched the configured scope.',
    });
  }

  const backlinks = new BacklinkIndex({
    projectDir: options.projectDir,
    contentDir: options.contentDir,
    contentFilter: createContentFilter({
      projectDir: options.projectDir,
      contentDir: options.contentDir,
      includePatterns: options.include,
      excludePatterns: options.contentExclude,
    }),
  });
  for (const doc of docs) backlinks.updateDocumentFromMarkdown(doc.docName, doc.markdown);
  for (const dead of backlinks.getDeadLinks(admittedLinkTargets)) {
    for (const source of dead.sources) {
      warnings.push({
        kind: 'dead-link',
        message: `${source.source} links to missing document ${dead.target}`,
        source: source.source,
        target: dead.target,
      });
    }
  }

  const pages: PublishBuildPage[] = [];
  for (const doc of docs) {
    const bodyHtml = rewriteLinks(
      markdownToHtml(doc.markdown),
      doc.docName,
      docNames,
      manifest.basePath,
    );
    const html = renderPage({
      siteTitle: manifest.siteTitle,
      page: doc,
      bodyHtml,
      nav: docs,
      basePath: manifest.basePath,
    });
    const outputPath = join(outputDir, docNameToPublicPath(doc.docName));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, html);
    pages.push({
      docName: doc.docName,
      title: doc.title,
      url: docNameToPublicUrl(doc.docName, manifest.basePath),
      sourcePath: doc.absPath,
      outputPath,
    });
  }

  const copiedAssets: string[] = [];
  for (const asset of assets) {
    const outputPath = join(outputDir, asset.relPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(asset.absPath, outputPath);
    copiedAssets.push(asset.relPath);
  }

  mkdirSync(join(outputDir, 'assets'), { recursive: true });
  writeFileSync(join(outputDir, 'assets', 'open-knowledge.css'), siteCss());
  writeFileSync(
    join(outputDir, 'search-index.json'),
    JSON.stringify(
      {
        pages: docs.map((doc) => ({
          title: doc.title,
          url: docNameToPublicUrl(doc.docName, manifest.basePath),
          text: stripFrontmatter(doc.markdown).body.replace(/\s+/g, ' ').trim(),
        })),
      },
      null,
      2,
    ),
  );

  return { outputDir, pages, assets: copiedAssets, warnings };
}
