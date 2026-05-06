import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yazl from 'yazl';

const MAX_ZIP_BYTES = 102_400;

export interface BuildSkillZipOptions {
  sourceDir?: string;
  outputPath?: string;
  skipVersionCheck?: boolean;
}

export interface BuildSkillZipResult {
  outputPath: string;
  size: number;
  sha256: string;
  cliVersion: string;
  skillVersion?: string;
}

export function resolveBundledSkillDir(): string {
  const candidates = ['../assets/skills/open-knowledge', './assets/skills/open-knowledge'];
  const tried: string[] = [];
  for (const rel of candidates) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(candidate)) return candidate;
    tried.push(candidate);
  }
  throw new Error(
    `Bundled skill asset directory not found. Tried: ${tried.join(', ')}. ` +
      'This usually means the CLI build did not copy packages/server/assets into dist/assets. ' +
      'Run `cd packages/cli && bun run build` before publishing.',
  );
}

async function readCliVersion(): Promise<string> {
  const candidates = [
    '../../cli/package.json', // dev: packages/server/src/../../cli/package.json → packages/cli/package.json
    '../package.json', // published cli: .../dist/chunks/... → .../package.json
  ];
  for (const rel of candidates) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(candidate)) continue;
    const raw = await readFile(candidate, 'utf-8');
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    if (parsed.name === '@inkeep/open-knowledge' && typeof parsed.version === 'string') {
      return parsed.version;
    }
  }
  throw new Error(
    'Could not resolve @inkeep/open-knowledge CLI version — no package.json with matching name found in candidate paths.',
  );
}

async function* walkFiles(dir: string, base: string = dir): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, base);
    } else if (entry.isFile()) {
      yield relative(base, full);
    }
  }
}

function computeWrapperFolderName(
  sourceDir: string,
  pathBasename: (p: string) => string = basename,
): string {
  return pathBasename(sourceDir) || 'open-knowledge';
}

function toPosixZipPath(rel: string, pathSep: string = sep): string {
  return pathSep === '/' ? rel : rel.split(pathSep).join('/');
}

async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  const wrapperFolderName = computeWrapperFolderName(sourceDir);
  const zipfile = new yazl.ZipFile();

  zipfile.addEmptyDirectory(`${wrapperFolderName}/`);

  const files: string[] = [];
  for await (const rel of walkFiles(sourceDir)) files.push(rel);
  files.sort(); // stable ordering — reproducible ZIPs.

  for (const rel of files) {
    const absolute = join(sourceDir, rel);
    const entryName = `${wrapperFolderName}/${toPosixZipPath(rel)}`;
    zipfile.addFile(absolute, entryName);
  }
  zipfile.end();

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(outputPath);
    zipfile.outputStream.pipe(out);
    out.on('close', () => resolve());
    out.on('error', reject);
    zipfile.outputStream.on('error', reject);
  });
}

async function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function extractMetadataVersion(markdown: string): string | undefined {
  const frontmatterEnd = markdown.indexOf('\n---', 4);
  if (!markdown.startsWith('---\n') || frontmatterEnd < 0) return undefined;
  const frontmatter = markdown.slice(4, frontmatterEnd);

  const metaStart = frontmatter.search(/^metadata:/m);
  if (metaStart < 0) return undefined;
  const rest = frontmatter.slice(metaStart);
  const lines = rest.split('\n').slice(1);
  for (const line of lines) {
    if (/^[^\s]/.test(line)) break; // left-flush line ends the block
    const m = line.match(/^\s+version:\s*["']?([^"'\s]+)["']?$/);
    if (m) return m[1];
  }
  return undefined;
}

export async function validateSkillZip(
  outputPath: string,
  expectedCliVersion: string,
  opts: { skipVersionCheck?: boolean } = {},
): Promise<{ size: number; sha256: string; skillVersion?: string }> {
  const size = statSync(outputPath).size;
  if (size > MAX_ZIP_BYTES) {
    throw new Error(`Built ${outputPath} is ${size} bytes, exceeds ${MAX_ZIP_BYTES}-byte ceiling`);
  }

  const sha256 = await sha256OfFile(outputPath);

  const sourceDir = resolveBundledSkillDir();
  const skillMd = await readFile(join(sourceDir, 'SKILL.md'), 'utf-8');

  if (!/^name:\s+open-knowledge$/m.test(skillMd.slice(0, 1000))) {
    throw new Error(
      `SKILL.md frontmatter \`name:\` does not match 'open-knowledge'. Check packages/server/assets/skills/open-knowledge/SKILL.md frontmatter.`,
    );
  }

  const skillVersion = extractMetadataVersion(skillMd);
  if (!opts.skipVersionCheck) {
    if (!skillVersion) {
      throw new Error(
        `SKILL.md metadata.version missing. Add it to packages/server/assets/skills/open-knowledge/SKILL.md or run \`bash scripts/sync-skill-version.sh\`.`,
      );
    }
    if (skillVersion !== expectedCliVersion) {
      throw new Error(
        `SKILL.md metadata.version (${skillVersion}) does not match CLI version (${expectedCliVersion}). Run \`bash scripts/sync-skill-version.sh\` after bumping package versions.`,
      );
    }
  }

  return { size, sha256, skillVersion };
}

export async function buildSkillZip(opts: BuildSkillZipOptions = {}): Promise<BuildSkillZipResult> {
  const sourceDir = opts.sourceDir ?? resolveBundledSkillDir();
  const outputPath = opts.outputPath ?? join(process.cwd(), 'openknowledge.skill');
  const cliVersion = await readCliVersion();

  await zipDirectory(sourceDir, outputPath);
  const { size, sha256, skillVersion } = await validateSkillZip(outputPath, cliVersion, {
    skipVersionCheck: opts.skipVersionCheck,
  });

  return { outputPath, size, sha256, cliVersion, skillVersion };
}

export const __testing = { extractMetadataVersion, computeWrapperFolderName, toPosixZipPath };
