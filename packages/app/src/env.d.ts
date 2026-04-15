declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { EditorView } from '@codemirror/view';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __providerPool: ProviderPool | undefined;
  var __activeProvider: HocuspocusProvider | null;
  /** Active source-view CodeMirror EditorView for E2E/perf tests (§10.7 R9). */
  var __activeEditorView: EditorView | null;
  /** Polish engine first-paint duration (ms) for the first ViewPlugin
   * instantiation of the session; test-seam for R9 perf verification. */
  var __polishFirstPaintMs: (() => number) | undefined;
}
