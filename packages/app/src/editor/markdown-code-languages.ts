/**
 * Explicit allowlist of code-block language grammars for the CM6 markdown() parser.
 *
 * Each entry is a lazily-loaded LanguageDescription — Vite emits a chunk only
 * when a fenced-code block actually references the language. This replaces
 * `import { languages } from '@codemirror/language-data'` which statically
 * references 150+ grammars and produces 150+ lazy chunks regardless of usage.
 *
 * Coverage: ~95% of code blocks observed in developer docs (js/ts/tsx/json/
 * yaml/css/html/bash/python/rust/go/markdown).
 */

import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';

export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts'],
    load: () =>
      import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  }),
  LanguageDescription.of({
    name: 'tsx',
    load: () =>
      import('@codemirror/lang-javascript').then((m) =>
        m.javascript({ jsx: true, typescript: true }),
      ),
  }),
  LanguageDescription.of({
    name: 'jsx',
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'json',
    load: () => import('@codemirror/lang-json').then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: 'yaml',
    alias: ['yml'],
    load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'css',
    load: () => import('@codemirror/lang-css').then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: 'html',
    load: () => import('@codemirror/lang-html').then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: 'bash',
    alias: ['sh', 'shell'],
    load: () =>
      import('@codemirror/legacy-modes/mode/shell').then(
        (m) => new LanguageSupport(StreamLanguage.define(m.shell)),
      ),
  }),
  LanguageDescription.of({
    name: 'python',
    alias: ['py'],
    load: () => import('@codemirror/lang-python').then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: 'rust',
    alias: ['rs'],
    load: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: 'go',
    alias: ['golang'],
    load: () =>
      import('@codemirror/legacy-modes/mode/go').then(
        (m) => new LanguageSupport(StreamLanguage.define(m.go)),
      ),
  }),
  LanguageDescription.of({
    name: 'markdown',
    alias: ['md', 'mdx'],
    load: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
  }),
];
