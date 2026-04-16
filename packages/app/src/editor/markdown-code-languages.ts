import { LanguageDescription } from '@codemirror/language';

/**
 * Hand-written allowlist of fenced-code languages for CM6 nested syntax highlighting.
 * Each entry uses a lazy `load()` so only the grammars actually encountered in the doc
 * are fetched — avoids the 150+ Vite chunks that `@codemirror/language-data` would emit.
 */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'jsx'],
    extensions: ['js', 'mjs', 'cjs', 'jsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts', 'tsx'],
    extensions: ['ts', 'mts', 'cts', 'tsx'],
    load: () =>
      import('@codemirror/lang-javascript').then((m) =>
        m.javascript({ typescript: true, jsx: true }),
      ),
  }),
  LanguageDescription.of({
    name: 'json',
    alias: ['jsonc'],
    extensions: ['json', 'jsonc'],
    load: () => import('@codemirror/lang-json').then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: 'yaml',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'css',
    alias: ['scss', 'less'],
    extensions: ['css', 'scss', 'less'],
    load: () => import('@codemirror/lang-css').then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: 'html',
    alias: ['htm'],
    extensions: ['html', 'htm'],
    load: () => import('@codemirror/lang-html').then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: 'python',
    alias: ['py'],
    extensions: ['py', 'pyw'],
    load: () => import('@codemirror/lang-python').then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: 'rust',
    alias: ['rs'],
    extensions: ['rs'],
    load: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: 'markdown',
    alias: ['md', 'mdx'],
    extensions: ['md', 'mdx', 'markdown'],
    load: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
  }),
  LanguageDescription.of({
    name: 'bash',
    alias: ['sh', 'shell', 'zsh'],
    extensions: ['sh', 'bash', 'zsh'],
    load: async () => {
      const { StreamLanguage } = await import('@codemirror/language');
      const { shell } = await import('@codemirror/legacy-modes/mode/shell');
      return new (await import('@codemirror/language')).LanguageSupport(
        StreamLanguage.define(shell),
      );
    },
  }),
  LanguageDescription.of({
    name: 'go',
    alias: ['golang'],
    extensions: ['go'],
    load: async () => {
      const { StreamLanguage } = await import('@codemirror/language');
      const { go } = await import('@codemirror/legacy-modes/mode/go');
      return new (await import('@codemirror/language')).LanguageSupport(StreamLanguage.define(go));
    },
  }),
];
