/**
 * Extract wiki-path references from a pipeline's stdout so the exec
 * handler can enrich each one.
 *
 * Strategy per D8 / FR14:
 *   1. Find the last "path-producer" stage (cat, ls, grep, find) walking
 *      backwards through stages — later commands like head/tail/sort
 *      simply pass paths through.
 *   2. Apply that stage's extraction rule:
 *        - `cat` → paths come from ARGS (stdout is file contents, not paths)
 *        - `ls`  → each stdout line is a path (prefixed with the arg dir
 *                  if one was supplied)
 *        - `grep -rn` → `path:line:text` lines; split on first colon
 *        - `find` → each stdout line is a path
 *   3. Fallback: regex `\b[\w./-]+\.(md|mdx)\b` over stdout — only used
 *      when no producer was found (e.g., `exec("echo foo")` which isn't in
 *      the v0 allowlist anyway).
 *
 * Returns deduped project-relative paths. Each is stripped of `./` prefix
 * and trailing `/`. Extension filter is `.md` or `.mdx` only — other file
 * types aren't wiki content and aren't enriched.
 *
 * Spec: SPEC.md D8 (R2-revised: `(md|mdx)` regex), FR14.
 */
import type { Stage } from './parse-command.ts';

/** Producer stages — their stdout shape determines how we extract paths. */
const PRODUCER_COMMANDS: ReadonlySet<string> = new Set(['cat', 'ls', 'grep', 'find']);

/** Fallback regex scanning stdout for wiki-shaped paths. */
const PATH_FALLBACK_RE = /\b[\w./-]+\.(md|mdx)\b/g;

function isWikiPath(p: string): boolean {
  return /\.(md|mdx)$/.test(p);
}

function normalize(p: string): string {
  let out = p.trim();
  if (!out) return '';
  // grep -r may emit `articles//auth.md` when the search arg ends in '/'.
  // Collapse consecutive slashes.
  out = out.replace(/\/+/g, '/');
  if (out.startsWith('./')) out = out.slice(2);
  if (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function argsOf(stage: Stage): string[] {
  return stage.args.slice(1); // drop command token
}

function nonFlagArgs(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('-'));
}

function extractFromCat(stage: Stage): string[] {
  // cat paths come from ARGV, not stdout
  return nonFlagArgs(argsOf(stage)).filter(isWikiPath);
}

function extractFromLs(stdout: string, stage: Stage): string[] {
  // Determine the dir arg if any (last non-flag arg that's a path-looking thing)
  const pathArgs = nonFlagArgs(argsOf(stage));
  const baseDir = pathArgs.length > 0 ? pathArgs[pathArgs.length - 1] : '';
  const prefix = baseDir && baseDir !== '.' ? normalize(baseDir) : '';
  const out: string[] = [];
  for (const line of stdout.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    // Skip entries that are clearly non-wiki files (have a non-md extension).
    // Entries without an extension are candidate directories — exec.ts stats
    // them to classify.
    if (/\.[a-z0-9]+$/i.test(name) && !isWikiPath(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    out.push(path);
  }
  return out;
}

function extractFromGrep(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const firstColon = line.indexOf(':');
    if (firstColon < 0) continue;
    const path = normalize(line.slice(0, firstColon));
    if (isWikiPath(path)) out.push(path);
  }
  return out;
}

function extractFromFind(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split('\n')) {
    const path = normalize(line);
    if (!path) continue;
    if (isWikiPath(path)) out.push(path);
  }
  return out;
}

function fallback(stdout: string): string[] {
  const out: string[] = [];
  const matches = stdout.matchAll(PATH_FALLBACK_RE);
  for (const m of matches) out.push(normalize(m[0]));
  return out;
}

/**
 * Extract deduped wiki-path references from stdout given the pipeline
 * stages that produced it.
 */
export function extractReferencedPaths(stdout: string, stages: Stage[]): string[] {
  // Find the last producer stage.
  let producer: Stage | null = null;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (PRODUCER_COMMANDS.has(stages[i].command)) {
      producer = stages[i];
      break;
    }
  }

  let raw: string[];
  if (!producer) {
    raw = fallback(stdout);
  } else {
    switch (producer.command) {
      case 'cat':
        raw = extractFromCat(producer);
        break;
      case 'ls':
        raw = extractFromLs(stdout, producer);
        break;
      case 'grep':
        raw = extractFromGrep(stdout);
        break;
      case 'find':
        raw = extractFromFind(stdout);
        break;
      default:
        raw = fallback(stdout);
    }
    // If the producer rule returned nothing, try the fallback anyway —
    // catches edge cases like grep on non-file input.
    if (raw.length === 0) {
      raw = fallback(stdout);
    }
  }

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const n = normalize(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
