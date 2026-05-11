/**
 * CodeMirrorPropInput — multi-line, syntax-highlighted PropPanel control
 * for `PropDefString` props that declare a `language` field.
 *
 * Used in place of the plain `<Input type="text">` for prop values that
 * are inherently multi-line or syntax-shaped — Mermaid `chart`, Math
 * `formula` (LaTeX), HTML / JSON / YAML payloads. Single-line strings
 * (titles, labels, URLs, alt text) keep the plain input — declaring
 * `language` is opt-in.
 *
 * ── Lifecycle ────────────────────────────────────────────────────────────
 *
 * Controlled-input pattern: the `value` prop is the source of truth (held
 * in the parent's PM node attrs). On every CM document change, the
 * editor's plaintext content is read out and forwarded via `onChange`
 * — same shape as the `<Input>` it replaces. External value changes
 * (undo/redo, multi-client sync) are reconciled into the editor's doc
 * via `computeChange` (the sibling `RawMdxFallbackCMView`'s minimal-diff
 * helper) so cursor position is preserved instead of collapsing to 0
 * after every external sync. User typing does NOT trigger a
 * value-driven dispatch because we set the editor's doc-then-onChange
 * in the same effect cycle and `computeChange` returns `null` when the
 * doc already matches.
 *
 * Mount effect runs once with `[]` deps — biome's
 * `useExhaustiveDependencies` doesn't flag it because every captured
 * value is a ref (the sibling `RawMdxFallbackCMView` needs a
 * `biome-ignore` because its mount effect captures non-ref values; we
 * don't). All four runtime-mutable inputs flow through dedicated
 * effects:
 *   - `value`       → `computeChange`-based doc dispatch
 *   - `language`    → `Compartment.reconfigure` dispatch (so a runtime
 *                     language change — rare; registry descriptors are
 *                     mount-time-fixed today but HMR + future hot-reload
 *                     paths could touch it — reconfigures in place
 *                     instead of rebuilding and dropping doc/selection/
 *                     history)
 *   - `ariaLabelledBy` → attribute mutation on `view.contentDOM`
 *   - `onChange`    → ref mirror so the updateListener closes over the
 *                     freshest handler without re-mounting
 *
 * Same Compartment pattern as the sibling `RawMdxFallbackCMView` (which
 * uses one for theme hot-swap).
 *
 * ── Why a custom CM6 mount and not `@uiw/react-codemirror` ──────────────
 *
 * The `RawMdxFallbackCMView` NodeView in `editor/extensions/` already
 * mounts CM6 manually inside React for the same reasons: tighter control
 * over the extension array (no double-mount on prop changes), no extra
 * dep in the bundle, and consistency with the source-mode editor's
 * lifecycle. This component follows the same vanilla-CM6 + React
 * `useEffect` pattern, scoped down to the simpler controlled-input case
 * (no PM transactions, no NodeView contracts).
 *
 * ── Accessibility ───────────────────────────────────────────────────────
 *
 * `<label htmlFor>` only associates with native labelable elements
 * (input/button/select/textarea/output/meter/progress) — pointing it at
 * a `<div>` wrapper is a no-op. PropPanel passes `ariaLabelledBy` (the
 * sibling label's id) and we forward it to CM's inner content DOM
 * (`view.contentDOM`, the `[contenteditable role="textbox"]`) after
 * mount so screen readers announce the editor with the right name.
 *
 * ── Language modes ──────────────────────────────────────────────────────
 *
 * Loaded eagerly per `propDef.language` value:
 *   `'mermaid'`    — `codemirror-lang-mermaid` (Lezer grammar; emits
 *                    standard `tags.keyword` / `tags.tagName` / etc. so
 *                    it plugs into the shared `propEditorHighlight` style)
 *   `'latex'`      — `@codemirror/legacy-modes/mode/stex` via
 *                    `StreamLanguage.define` — emits `keyword` (`\frac`,
 *                    `\begin{...}`), `bracket`, `string`, `comment`
 *   `'html'`       — `@codemirror/lang-html`
 *   `'json'`       — `@codemirror/lang-json`
 *   `'yaml'`       — `@codemirror/lang-yaml`
 *   `'javascript'` — `@codemirror/lang-javascript` (also covers TS / JSX
 *                    / TSX expressions inside MDX prop values)
 *   `'markdown'`   — `@codemirror/lang-markdown`
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import {
  bracketMatching,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import type { PropDefString } from '@inkeep/open-knowledge-core';
import { tags } from '@lezer/highlight';
import { mermaid } from 'codemirror-lang-mermaid';
import { useEffect, useRef } from 'react';
import { computeChange } from '../extensions/RawMdxFallbackCMView';

type LanguageName = NonNullable<PropDefString['language']>;

function resolveLanguageExtension(language: LanguageName): Extension {
  switch (language) {
    case 'html':
      return html();
    case 'json':
      return json();
    case 'yaml':
      return yaml();
    case 'javascript':
      return javascript({ jsx: true, typescript: true });
    case 'markdown':
      return markdown();
    case 'latex':
      return StreamLanguage.define(stex);
    case 'mermaid':
      return mermaid();
  }
}

const propEditorHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.controlKeyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.modifier, color: 'var(--syntax-keyword)' },
  { tag: tags.tagName, color: 'var(--syntax-tag)' },
  { tag: tags.typeName, color: 'var(--syntax-tag)' },
  { tag: tags.className, color: 'var(--syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--syntax-attr)' },
  { tag: tags.propertyName, color: 'var(--syntax-attr)' },
  { tag: tags.variableName, color: 'var(--syntax-attr)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.bool, color: 'var(--syntax-number)' },
  { tag: tags.null, color: 'var(--syntax-number)' },
  { tag: tags.atom, color: 'var(--syntax-atom)' },
  { tag: tags.literal, color: 'var(--syntax-number)' },
  { tag: tags.operator, color: 'var(--syntax-keyword)' },
  { tag: tags.punctuation, color: 'var(--foreground)' },
  { tag: tags.bracket, color: 'var(--foreground)' },
  { tag: tags.brace, color: 'var(--foreground)' },
  { tag: tags.meta, color: 'var(--muted-foreground)' },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
]);

interface CodeMirrorPropInputProps {
  value: string;
  language: LanguageName;
  onChange: (value: string) => void;
  id?: string;
  ariaLabelledBy?: string;
  autoFocus?: boolean;
}

export function CodeMirrorPropInput({
  value,
  language,
  onChange,
  id,
  ariaLabelledBy,
  autoFocus,
}: CodeMirrorPropInputProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const initialValueRef = useRef(value);
  const initialLanguageRef = useRef(language);
  const initialAutoFocusRef = useRef(autoFocus);
  const initialAriaLabelledByRef = useRef(ariaLabelledBy);

  // needs a `biome-ignore` because its mount effect captures non-ref
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      syntaxHighlighting(propEditorHighlight),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const next = update.state.doc.toString();
        onChangeRef.current(next);
      }),
      EditorState.tabSize.of(2),
      languageCompartmentRef.current.of(resolveLanguageExtension(initialLanguageRef.current)),
    ];

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions,
      }),
      parent: wrapper,
    });
    viewRef.current = view;

    if (initialAriaLabelledByRef.current) {
      view.contentDOM.setAttribute('aria-labelledby', initialAriaLabelledByRef.current);
    }
    view.contentDOM.setAttribute('aria-multiline', 'true');

    if (initialAutoFocusRef.current) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (ariaLabelledBy) {
      view.contentDOM.setAttribute('aria-labelledby', ariaLabelledBy);
    } else {
      view.contentDOM.removeAttribute('aria-labelledby');
    }
  }, [ariaLabelledBy]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(resolveLanguageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const change = computeChange(current, value);
    if (!change) return;
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.text },
    });
  }, [value]);

  return (
    <div
      ref={wrapperRef}
      id={id}
      className="ok-prop-codemirror"
      data-prop-codemirror=""
      data-prop-language={language}
    />
  );
}
