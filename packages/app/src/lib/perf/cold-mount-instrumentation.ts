/**
 * Cold-mount instrumentation — prototype-level monkey-patches that emit
 * `ok/cold/*` perf marks around the synchronous cost centers of the
 * `<TiptapEditor>` cold-mount call chain on large docs.
 *
 * Motivated by `/tmp/ok-perf-validation/cold-mount-profile/evidence/call-chain.md`
 * — a 9.7s cold-pool-warm on PROJECT.md has an INFERRED 5-component breakdown;
 * this instrumentation decomposes it into measured spans.
 *
 * Wrapped entry points:
 *   - `Editor.prototype.mount`                → `ok/cold/editor-mount`
 *   - `Editor.prototype.createView`           → `ok/cold/editor-create-view`
 *   - `Editor.prototype.createNodeViews`      → `ok/cold/create-node-views`
 *   - `EditorView.prototype.updateState`      → `ok/cold/pm-update-state` (per call)
 *   - `EditorView.prototype.setProps`         → `ok/cold/pm-set-props` (per call)
 *   - `ProsemirrorBinding.prototype._forceRerender` → `ok/cold/force-rerender`
 *   - `PureEditorContent.prototype.init`      → `ok/cold/ec-init`
 *
 * Also installs a PerformanceObserver for `paint` entries that re-emits
 * first-paint / first-contentful-paint via marks so they land in the
 * collector's data stream alongside the monkey-patched spans.
 *
 * The patch is a DIAGNOSTIC artifact — called ONCE from `main.tsx` before
 * any editor constructs. Safe to leave in production builds (the `mark()`
 * helper no-ops its collector push in PROD; `performance.measure` is cheap)
 * but the V2 spec should decide whether to promote a curated subset to
 * permanent telemetry.
 */

import { Editor } from '@tiptap/core';
import { EditorView } from '@tiptap/pm/view';
import { PureEditorContent } from '@tiptap/react';
import { ProsemirrorBinding } from '@tiptap/y-tiptap';
import { mark } from './mark';

let installed = false;

function wrapMethod<T extends Record<string, unknown>>(
  target: T,
  key: keyof T & string,
  markName: string,
  propsBuilder?: (
    instance: T,
    result: unknown,
    start: number,
    durationMs: number,
  ) => Record<string, unknown>,
): void {
  const original = target[key] as unknown as (...args: unknown[]) => unknown;
  if (typeof original !== 'function') {
    // eslint-disable-next-line no-console -- diagnostic
    console.warn(`[cold-mount-instrumentation] target missing method "${key}"`);
    return;
  }
  const wrapped = function patched(this: T, ...args: unknown[]): unknown {
    const start = performance.now();
    let result: unknown;
    try {
      result = original.apply(this, args);
      return result;
    } finally {
      const now = performance.now();
      const durationMs = now - start;
      const extraProps = propsBuilder ? propsBuilder(this, result, start, durationMs) : undefined;
      mark(
        markName,
        { durationMs: Math.round(durationMs * 1000) / 1000, ...extraProps },
        { startTime: start, duration: durationMs },
      );
    }
  };
  // biome-ignore lint/suspicious/noExplicitAny: prototype patch
  (target as any)[key] = wrapped;
}

interface EditorInstanceShape {
  options?: { element?: unknown };
  editorState?: { doc?: { nodeSize?: number; content?: { size?: number } } };
}

interface PmViewShape {
  state?: { doc?: { nodeSize?: number; content?: { size?: number } } };
  dom?: Element;
}

interface ProsemirrorBindingShape {
  prosemirrorView?: PmViewShape;
  type?: { toArray?: () => unknown[]; length?: number };
}

interface EditorContentShape {
  props?: { editor?: unknown };
  // biome-ignore lint/suspicious/noExplicitAny: react component internal
  [k: string]: any;
}

function docSizeOf(
  x: { doc?: { nodeSize?: number; content?: { size?: number } } } | undefined,
): number | null {
  if (!x?.doc) return null;
  if (typeof x.doc.nodeSize === 'number') return x.doc.nodeSize;
  if (x.doc.content && typeof x.doc.content.size === 'number') return x.doc.content.size;
  return null;
}

let forceRerenderCount = 0;
let pmUpdateStateCount = 0;
let pmSetPropsCount = 0;
let createNodeViewsCount = 0;

export function installColdMountInstrumentation(): void {
  if (installed) return;
  installed = true;

  // -------- Editor (TipTap) ----------
  wrapMethod(
    Editor.prototype as unknown as Record<string, unknown>,
    'mount',
    'ok/cold/editor-mount',
    (self) => {
      const ei = self as unknown as EditorInstanceShape;
      return {
        elementDefault: (ei.options?.element as Element | undefined)?.nodeName ?? null,
        docSize: docSizeOf(
          ei.editorState as { doc?: { nodeSize?: number; content?: { size?: number } } },
        ),
      };
    },
  );

  // @tiptap/core marks createView as private in TS but it's a runtime prototype method
  wrapMethod(
    Editor.prototype as unknown as Record<string, unknown>,
    'createView' as 'mount',
    'ok/cold/editor-create-view',
    (self) => {
      const ei = self as unknown as EditorInstanceShape;
      return {
        docSize: docSizeOf(
          ei.editorState as { doc?: { nodeSize?: number; content?: { size?: number } } },
        ),
      };
    },
  );

  wrapMethod(
    Editor.prototype as unknown as Record<string, unknown>,
    'createNodeViews',
    'ok/cold/create-node-views',
    (self, _r, _s, duration) => {
      createNodeViewsCount += 1;
      const ei = self as unknown as { view?: PmViewShape };
      return {
        docSize: docSizeOf(ei.view as { doc?: { nodeSize?: number; content?: { size?: number } } }),
        seq: createNodeViewsCount,
        durationMs: duration,
      };
    },
  );

  // -------- EditorView (ProseMirror) ----------
  wrapMethod(
    EditorView.prototype as unknown as Record<string, unknown>,
    'updateState',
    'ok/cold/pm-update-state',
    (self, _r, _s, duration) => {
      pmUpdateStateCount += 1;
      return {
        seq: pmUpdateStateCount,
        docSize: docSizeOf((self as unknown as PmViewShape).state),
        durationMs: duration,
      };
    },
  );

  wrapMethod(
    EditorView.prototype as unknown as Record<string, unknown>,
    'setProps',
    'ok/cold/pm-set-props',
    (self, _r, _s, duration) => {
      pmSetPropsCount += 1;
      return {
        seq: pmSetPropsCount,
        docSize: docSizeOf((self as unknown as PmViewShape).state),
        durationMs: duration,
      };
    },
  );

  // -------- ProsemirrorBinding (y-prosemirror via @tiptap/y-tiptap) ----------
  wrapMethod(
    ProsemirrorBinding.prototype as unknown as Record<string, unknown>,
    '_forceRerender',
    'ok/cold/force-rerender',
    (self, _r, _s, duration) => {
      forceRerenderCount += 1;
      const b = self as unknown as ProsemirrorBindingShape;
      const topLevelCount = (() => {
        try {
          return b.type?.toArray ? b.type.toArray().length : null;
        } catch {
          return null;
        }
      })();
      return {
        seq: forceRerenderCount,
        topLevelYElements: topLevelCount,
        durationMs: duration,
      };
    },
  );

  // -------- PureEditorContent.init (TipTap React) ----------
  wrapMethod(
    PureEditorContent.prototype as unknown as Record<string, unknown>,
    'init',
    'ok/cold/ec-init',
    (self) => {
      const ec = self as unknown as EditorContentShape;
      return { editorPresent: Boolean(ec.props?.editor) };
    },
  );

  // -------- Paint observer ----------
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const name = entry.name;
          // first-paint or first-contentful-paint
          if (name === 'first-paint' || name === 'first-contentful-paint') {
            mark(
              name === 'first-paint' ? 'ok/cold/paint-fp' : 'ok/cold/paint-fcp',
              { entryType: entry.entryType, startTime: Math.round(entry.startTime * 1000) / 1000 },
              { startTime: entry.startTime, duration: 0 },
            );
          }
        }
      });
      obs.observe({ type: 'paint', buffered: true });
    }
  } catch (_err) {
    // Paint observer unsupported — not fatal.
  }

  // Diagnostic flag — Playwright scenario can assert via window
  (globalThis as unknown as Record<string, unknown>).__okColdMountInstrumented = true;
}
