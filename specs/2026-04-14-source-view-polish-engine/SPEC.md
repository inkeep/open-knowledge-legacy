# Source-View Per-Construct Polish Engine

**Status:** Finalized — ready for implementation
**Baseline commit:** f17ad00 (verified unchanged on spec-relevant files at finalize)
**Created:** 2026-04-14
**Last updated:** 2026-04-14 (finalized — 27 decisions logged with LOCKED / DIRECTED / DELEGATED resolution status; §15 open questions = none; verification layer §10.7–§10.9 sealed; baseline drift check passed)

## 1. Problem statement (SCR)

**Situation.** Open Knowledge's source view uses CodeMirror 6 with `EditorView.lineWrapping` enabled. Developers see raw markdown source as typed. Prose wraps naturally. Structured constructs (pipe tables, long code lines, HTML blocks with many attributes, nested blockquotes, lists with long items) also wrap because horizontal scroll is disallowed.

**Complication.** Wrap-under-structure produces visual pathology: a 2973-char pipe-table row in PROJECT.md wraps to 37 visual lines (745 px), losing row/cell identity. The gutter line number appears only at the logical-line start, so consecutive rows become indistinguishable from each other's wrapped continuations. This class of problem affects 16 other supported markdown constructs. No surveyed OSS markdown editor addresses source-view polish in the S2 ("text-canonical with per-construct decoration") lane as a default; products commit to either S1 (raw wrap or h-scroll) or S3 (widget replacement hiding source).

**Resolution.** Build a declarative per-construct polish engine on CM6's decoration primitives. Per-line tinting and hanging indent for Tier 1 identity; syntax-level or token-level coloring for Tier 2 internal structure; compactness for Tier 3 density. **Source text always addressable** — every authored character remains in the document, cursor-reachable, `Cmd/Ctrl+A` → copy yields byte-identical source, and find-replace / multi-cursor / column-select behave exactly as they would with the engine removed. Per-construct decoration may reduce pixel-visibility of syntactic delimiters (e.g., fading a thematic-break's `---` to let the rule dominate) where doing so does not compromise addressability. No horizontal scroll; no cursor-entry mode switching; all standard editor ergonomics unchanged.

## 2. Users

**Primary:** Developers editing markdown source directly in Open Knowledge. Expect find/replace, column-select, multi-cursor. Lean text-canonical. Mix of prose-heavy and structure-heavy content.

**Secondary:** Power users who author both kinds of content and switch fluidly between source and WYSIWYG.

**Out of scope as primary persona:** Users who want pure rendered-markdown editing (TipTap WYSIWYG is their path, not this one).

## 3. Success criteria

### Must pass

- **Visual regression (measurable):** PROJECT.md table region height ≤ 40% of baseline after Phase 1. Baseline: current pathology (235,320 px total across 60 rows).
- **Zero horizontal scroll** on any document content (hard invariant).
- **Source addressability preserved** — every authored character remains in the document and is cursor-reachable, select-copy-replaceable, and find-replaceable. No `Decoration.replace({ block: true })` in the engine. Pixel-level fading of syntactic delimiters (e.g., `color: transparent` on a `thematicBreak`'s `---`) is permitted IFF the underlying characters remain addressable by the criteria above.
- **Editing parity** — verified via **§10.7 browser-automated test matrix** (R1–R14). Engine-present must produce identical behavior to engine-removed baseline for: `Cmd/Ctrl+A` → copy (byte-identical clipboard), find/replace, multi-cursor, column-select, rectangular-on-wrapped-code (with documented quirk bounds), cursor-walk through every construct, y-codemirror.next collab convergence + origin attribution, agent-write integration, auto-bail boundary behavior. Mechanism note: engine uses only `Decoration.line` / `Decoration.mark` / `Decoration.widget({side})` — none of which affect the selection model or the copy source-text path (`state.sliceDoc(from, to)`). `Decoration.replace` is forbidden (§6.3); no `atomicRanges` used. Anything that would break this is explicitly out of the engine's primitive set.
- **Zero console errors / pageerrors** during the full-construct composition-doc session — see §10.9.
- **Performance:** Engine with all constructs active adds ≤ 30 ms to first-paint on a 2000-line document, and ≤ 5 ms per-keystroke overhead at viewport-typical decoration count (~200 active decorations).
- **Opacity / size ceilings (numerical):** Tier 1 line tints ≤5% alpha; Tier 2 cell/token bands ≤4% alpha; structural borders mixed ≤30% of accent; heading size hierarchy capped at 1.25× base.
- **Rectangular selection on wrapped preserve-source-indent code:** selection rectangle visually tracks the selected source text across ≥3 wrapped lines; copied text matches selected source exactly. Visually imperfect selection rendering (ghost cells) is acceptable IF copied text is correct.

### Qualitative

- **3-meter test:** decorations are barely visible standing 3 meters from the screen; emerge as structural cues at normal reading distance.
- **Glance test:** developer can identify construct type (table, code, blockquote, list, etc.) in <300 ms without conscious decoding.
- **Prose-unaffected rule:** a paragraph with no structured children receives zero decoration.
- **No mode-switching surprise:** cursor position changes never trigger visual rearrangement of surrounding content.

## 4. Scope

### In scope

**Engine:**
- Declarative construct registry keyed by `@lezer/markdown` node types
- ViewPlugin dispatch for inline + line decorations (no vertical-structure change)
- StateField dispatch for cross-scan decorations (broken-ref indicators)
- `Decoration.widget({ side })` for non-hiding hints only
- Syntax-tree visitor with viewport-scoped iteration
- CSS-variable + theme-level styling (light/dark split)

**Constructs (17 non-MDX):**
- Block: `blockquote`, `code` (fenced), `thematicBreak`, `list`+`listItem` (bullet/ordered/task), `html` block, `yaml` frontmatter, `definition`, `heading`, `table` + row/header/cell/delimiter
- Inline: `emphasis`, `strong`, `inlineCode`, `link`, `linkReference`, `image`, `delete` (strikethrough), `highlight`, `wikiLink`

Table treatment is the already-agreed Tier 1+2+3 stack.

**User preferences:** none. Engine ships always-on; no toggle, no settings UI, no shortcut. See §9 for rationale.

**Accessibility:**
- Color-alone never carries unique information (every Tier 2 cue has a border/position/weight complement)
- Contrast ratios meet WCAG AA for any tinted text

### Out of scope

**MDX constructs** (user directive; addressed elsewhere): `mdxJsxFlowElement`, `mdxJsxTextElement`, MDX expressions, `rawMdxFallback`

**WYSIWYG concerns** (TipTap's domain): inline table preview, rendered headings, clickable chip widgets that replace source, interactive task widgets that hide the `[ ]` text

**Orthogonal surfaces** (other specs / components):
- Source ↔ WYSIWYG toggle UX
- CRDT / y-codemirror internals
- Print stylesheets
- Server-side rendering of source view

**Deferred (Future Work — see §12):**
- Rainbow-HTML attribute colorization — NOT NOW, A/B-tested in Phase 3 (see §5 non-goal row + §11 Phase 3)
- Hardbreak `↵` glyph as default (opt-in only)
- Definition block auto-group at document bottom
- Fold/collapse for constructs beyond YAML frontmatter
- Outline panel integration with heading decorations

## 5. Non-goals

| Non-goal | Type | Why |
|---|---|---|
| Render any markdown construct as HTML in source view | NEVER | Breaks addressability (characters removed from document); violates text-canonical stance |
| Support horizontal scroll as a fallback | NEVER | Hard product constraint |
| Replicate Obsidian Live Preview's cursor-reveal pattern | NEVER | Mode-switching friction on cursor move; visual rearrangement surprises |
| Achieve rendered-document visual fidelity in source | NEVER | That's TipTap's job; source is source |
| Interactive widgets that modify source on click (task checkbox toggle) | NOT NOW | Out of Phase 1-5; re-evaluate based on user demand |
| Per-cell cursor-reveal within tables | NOT NOW | Top Obsidian community request unshipped anywhere; high complexity, low proven value for this product position |
| Image inline thumbnails | NEVER | WYSIWYG territory |
| Rainbow-HTML attribute colorization | NOT NOW | Pre-test self-assessment flagged as distracting, but other visual decisions get Phase 3 A/B tests — asymmetry corrected. Included in Phase 3 composition-page A/B (plain syntax highlighting vs. +rainbow grouping). Ships only if testers prefer it on multi-line wrapped HTML blocks. |

## 5b. Prerequisites (must land before Phase 1)

Validation pass surfaced prerequisites the engine assumes but which don't exist yet in the codebase. Per Design Challenge #2, PR1 is split into two first-class changes (each with its own acceptance criteria). The challenger's framing: "5-10 LOC change" is accurate in LOC but understates blast radius — GFM enablement changes tokenization for every existing source-view session, and `codeLanguages: languages` pulls 150+ language chunks. Treating PR1a as its own reviewable change with a regression gate is cheap insurance.

### PR1a — Enable GFM on the CM6 side, with explicit `codeLanguages` allowlist

**Current state (verified 2026-04-14, baseline f17ad00):** `markdown()` is called bare in `SourceEditor.tsx`. The remark-side pipeline loads `remark-gfm`, but `@codemirror/lang-markdown` does not. Consequences: `Table`, `TableRow`, `TableCell`, `TableDelimiter`, `Strikethrough`, `StrikethroughMark`, `TaskMarker`, and GFM autolink nodes are ABSENT from the syntax tree the polish engine consumes. The whole table Tier 1+2+3 stack depends on these nodes.

**Fix:**

```ts
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { LanguageDescription } from '@codemirror/language';
// NOTE: NOT `import { languages } from '@codemirror/language-data'`. That import
// statically references all 150+ LanguageDescription entries, which Vite turns
// into 150+ lazy chunks regardless of whether any code block uses them.
// See: github.com/mdx-editor/editor#896 — confirmed as a real build-pipeline concern.

// Explicit allowlist (~12 entries, covers ~95% of code blocks in developer docs).
// Each entry is a lazy-loaded grammar; chunk emitted only when referenced.
const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({ name: 'javascript', alias: ['js', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript()) }),
  LanguageDescription.of({ name: 'typescript', alias: ['ts'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })) }),
  LanguageDescription.of({ name: 'tsx',
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })) }),
  LanguageDescription.of({ name: 'json',
    load: () => import('@codemirror/lang-json').then(m => m.json()) }),
  LanguageDescription.of({ name: 'yaml', alias: ['yml'],
    load: () => import('@codemirror/lang-yaml').then(m => m.yaml()) }),
  LanguageDescription.of({ name: 'css',
    load: () => import('@codemirror/lang-css').then(m => m.css()) }),
  LanguageDescription.of({ name: 'html',
    load: () => import('@codemirror/lang-html').then(m => m.html()) }),
  LanguageDescription.of({ name: 'bash', alias: ['sh', 'shell'],
    load: () => import('@codemirror/legacy-modes/mode/shell').then(m => StreamLanguage.define(m.shell)) }),
  LanguageDescription.of({ name: 'python', alias: ['py'],
    load: () => import('@codemirror/lang-python').then(m => m.python()) }),
  LanguageDescription.of({ name: 'rust',
    load: () => import('@codemirror/lang-rust').then(m => m.rust()) }),
  LanguageDescription.of({ name: 'go',
    load: () => import('@codemirror/legacy-modes/mode/go').then(m => StreamLanguage.define(m.go)) }),
  LanguageDescription.of({ name: 'markdown', alias: ['md', 'mdx'],
    load: () => import('@codemirror/lang-markdown').then(m => m.markdown()) }),
];

markdown({
  base: markdownLanguage,
  extensions: [GFM],
  codeLanguages,
  // `htmlTagLanguage` expects `LanguageSupport`, not `LRLanguage`. Default already
  // applies `html({matchClosingTags:false})`; pass explicitly when overriding.
})
```

**Acceptance gate (PR1a exit criteria):**
- **Bundle-size delta:** build manifest diff shows ≤20 new chunks vs. baseline (allowlist has 12 langs + some duplicate loaders collapse; ≤20 is the upper bound). Absolute gzipped size for the markdown + code-lang cluster documented in the PR description.
- **Regression pass — existing source-view UX:** run a representative doc (PROJECT.md + a doc with bare URLs + a doc with wikilinks) through manual inspection AND Playwright `ux-interactions.e2e.ts`. Verify no visible change to: wiki-link chip rendering, md-link-source decoration, agent-flash, cursor behavior, find-replace. Specific risk: GFM autolink tokens may intersect with `md-link-source.ts` regex over `view.visibleRanges` — check for double-decoration or missing decoration.
- **GFM tokenization spot-check:** open a doc with a pipe table, strikethrough, and tasklist. Inspect CodeMirror DOM via `document.querySelectorAll('.ͼ*')` — confirm `Table`/`TableRow`/`Strikethrough`/`TaskMarker` tokens render (class names may differ; verify nodes appear in `syntaxTree().topNode` when iterated).

**Dependency adds (direct, pinned):**
- `@codemirror/lang-javascript`, `@codemirror/lang-json`, `@codemirror/lang-yaml`, `@codemirror/lang-css`, `@codemirror/lang-html`, `@codemirror/lang-python`, `@codemirror/lang-rust`, `@codemirror/lang-markdown` (already present)
- `@codemirror/legacy-modes` — for bash + go (no first-class grammars)
- NOT adding: `@codemirror/language-data` — replaced by the explicit allowlist above

**Out of this PR:** the polish engine itself. PR1a lands as a standalone change. Phase 1 starts only after PR1a merges cleanly and the regression pass is green.

### PR1b — `syntaxTreeAvailable()` gate convention

No existing CM6 plugin in the codebase consumes `syntaxTree()`. The polish engine introduces that pattern. Best practice (verified via `discuss.codemirror.net`): gate every syntax-tree consumer on `syntaxTreeAvailable(view.state)` to avoid reading from a partial/incremental tree during initial parse of large documents.

```ts
import { syntaxTreeAvailable, syntaxTree } from '@codemirror/language';

function buildDecorations(view: EditorView) {
  if (!syntaxTreeAvailable(view.state, view.viewport.to)) {
    // schedule a re-run when the tree is ready; return empty set for now
    return Decoration.none;
  }
  // proceed with syntaxTree().iterate(...)
}
```

This is a convention enforced in the engine's internal ViewPlugin dispatcher. It rides with the engine PR rather than landing as its own change.

## 6. Architecture

### 6.1 Engine topology

```
┌─────────────────────────────────────────────────────────────┐
│  constructPolishEngine(registry)   (always-active)          │
│  Returns Extension[] = [                                    │
│    ViewPlugin<InlineAndLineDecorations>,                    │
│    StateField<CrossScanDecorations>,                        │
│    EditorView.theme({ ... CSS from registry ... })          │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────┐  ┌──────────────────────────┐
│  ViewPlugin.fromClass(...)   │  │  StateField.define({...}) │
│  - iterates syntaxTree       │  │  - cross-scan on doc load │
│  - emits Decoration.line +   │  │    + change               │
│    Decoration.mark per       │  │  - provides decorations   │
│    registry entry            │  │    for broken-ref family  │
│  - viewport-scoped           │  └──────────────────────────┘
└──────────────────────────────┘
```

### 6.2 Registry schema

```ts
type ConstructConfig = {
  // Detection
  nodeName?: string | string[] | RegExp;
  customDetect?: (tree: SyntaxTree, state: EditorState) => NodeRange[];

  // Decoration kind (block-replace explicitly absent — hides source)
  kind: 'line' | 'mark' | 'widget-side' | 'cross-scan-mark';

  // CSS class(es) to apply
  class?: string | ((node: SyntaxNode) => string);
  markerClass?: string;    // for constructs with distinguished markers (HeaderMark, ListMark, etc.)

  // Depth-aware (blockquote, list nesting)
  depthClass?: (node: SyntaxNode) => string;  // e.g., 'cm-blockquote-depth-2'

  // Hanging indent behavior
  hangingIndent?:
    | 'none'
    | 'content'                // align continuation under content, not under marker
    | 'preserve-source-indent'; // for code: track line's leading whitespace

  // Widget (non-hiding only)
  widget?: new () => WidgetType;
  widgetSide?: -1 | 1;

  // Cross-scan (for broken-ref indicators)
  crossScan?: {
    collect: (state: EditorState) => Map<string, CollectedInfo>;
    check: (node: SyntaxNode, collected: Map<string, CollectedInfo>) => 'ok' | 'broken';
    brokenClass: string;
  };

  // Wrap policy (currently all 'inherit' per constraint, but engine supports override)
  wrapBehavior?: 'inherit' | 'pre' | 'pre-wrap';

  // Theme (CSS variables + class rules)
  theme: Record<string, CSSObject>;

  // Feature-flag key (for preference granularity)
  featureKey: string;  // e.g., 'blockquote', 'table', 'heading-hierarchy'
};
```

### 6.3 Dispatch rules (load-bearing per Marijn Haverbeke)

- `kind: 'line' | 'mark' | 'widget-side'` → ViewPlugin path. Safe because none change vertical structure.
- `kind: 'cross-scan-mark'` → StateField path. Necessary because cross-scan state is document-wide + amortized across updates.
- `Decoration.replace({ block: true })` **never used**. Explicit engine-level constraint to preserve source visibility.

### 6.4 Performance characteristics

- **ViewPlugin.update** runs on `docChanged || viewportChanged || selectionSet`. Iteration is viewport-scoped via `view.visibleRanges`. Expected decoration count at steady state: ~200 per viewport.
- **Group ViewPlugins by trigger profile**, not per-construct. A single `ViewPlugin` does one syntaxTree walk per update cycle and dispatches line/mark decorations for all non-cursor-aware constructs; a second `ViewPlugin` handles cursor-aware constructs (currently: none in v1 — cursor-reveal is explicitly out of scope). Sharing the tree walk avoids N-fold iteration cost with N providers. (Verified pattern via Subagent 2 evidence.)
- **StateField cross-scan** — MUST early-return on `!tr.docChanged` because StateField.update fires on every transaction (selection, focus, viewport scroll, etc.). Without the gate, cross-scan work runs on every cursor move.
- **StateField full rescan is idiomatic.** Marijn-endorsed default: re-iterate the syntax tree on each docChanged update; don't attempt incremental `RangeSet.map`-based patching until benchmarks prove it necessary. Reference: discuss.codemirror.net thread #4372.
- **`syntaxTreeAvailable()` gate on every syntax-tree consumer** (see §5b / PR2).
- **Decoration count ceiling — UNRESOLVED:** no maintainer-published number. Phase 1 exit gate includes a benchmark on a 2000-line synthetic doc. **Auto-bail (see §6.6)** is the safety net: if a document exceeds the benchmark-calibrated threshold at load time, the engine's Compartment reconfigures to `[]` and the doc renders as plain CM6 source. No user-visible UI; internal mechanism only.
- **CSS-variable theming** — all color values driven by CSS custom properties. Open Knowledge uses Tailwind v4 `@theme { --color-* }` tokens without `--ok-*` prefix (verified); spec follows that convention. Theme swap is instant (no decoration rebuild).

### 6.5 Extension wiring

```ts
// In SourceEditor.tsx (after PR1a + PR1b land):
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { Compartment } from '@codemirror/state';
// `codeLanguages` allowlist defined in PR1a — NOT `languages` from @codemirror/language-data.
import { codeLanguages } from './markdown-code-languages';
// Optional for inline HTML highlighting:
import { html } from '@codemirror/lang-html';  // factory fn, not LRLanguage export

// Internal-only Compartment wrapping the engine. No user UI surfaces this.
// Reconfigured only by the auto-bail predicate (§6.6).
const polishCompartment = new Compartment();

// DELTA FROM CURRENT SourceEditor.tsx — preserves every existing extension
// (basicSetup, yCollab, createAgentFlashSourceExtension, createWikiLinkSourceExtension,
//  createMdLinkSourceExtension, themeCompartment, the EditorView.theme {'&':{height:'100%'}} block).
// Shown below: only the markdown() call gets changes + polish engine insertion.
extensions: [
  basicSetup,
  markdown({
    base: markdownLanguage,
    extensions: [GFM],
    codeLanguages,  // ~12-entry allowlist from PR1a; NOT the 150+ `languages` import
    // `htmlTagLanguage` expects a `LanguageSupport`, not `LRLanguage`. Pass the
    // `html()` factory (or omit — default applies `html({matchClosingTags:false})` already).
    htmlTagLanguage: html({ matchClosingTags: false }),
  }),
  yCollab(ytext, provider.awareness),
  createAgentFlashSourceExtension(provider.document),
  createWikiLinkSourceExtension(),
  createMdLinkSourceExtension(),
  // Engine is unconditional at construction. The Compartment is internal-only —
  // exists solely so §6.6's auto-bail can reconfigure to `[]` on pathological docs.
  polishCompartment.of(constructPolishEngine(registry)),
  themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
  EditorView.lineWrapping,
  EditorView.theme({ '&': { height: '100%' } }),
]
```

**Compartment is internal, not user-facing.** §9 locks no user toggle, no settings UI, no shortcut — those are the product decisions. The Compartment here is a ~5-line internal-reconfigurability primitive that §6.6's auto-bail needs. Conflating user-facing toggle (rejected) with internal reconfigurability (this) was the design-challenge finding that reopened this subdecision.

### 6.6 Auto-bail predicate (internal safety net)

**Trigger conditions.** Evaluated on doc load (after `syntaxTreeAvailable()` returns true for the first viewport) and re-evaluated on each cross-branch `BatchBegin` (new doc content):

1. **Line-count ceiling:** `view.state.doc.lines > 5000` — calibrated from Phase 1 benchmark (§11). Refined if benchmark reveals a sharper threshold.
2. **First-paint latency:** If the ViewPlugin's first `update()` exceeds 200 ms wall-clock on a measured perf frame, bail.

Either trigger → `view.dispatch({ effects: polishCompartment.reconfigure([]) })`. The document renders as plain CM6 source with existing plugins (basicSetup, yCollab, agent-flash, wiki/md-link) still active.

**No user UI.** The user is not informed the engine bailed. The product stance is "ships always-on"; a silent fallback on pathology is the belt-and-suspenders implementation of that stance, not a user-facing mode. If users report distracting silence (e.g., "polish didn't activate on this doc and I want to know why"), revisit in a follow-up.

**Not reversible in-session.** Once bailed for a doc, the engine stays off for that doc until reload. This keeps the predicate simple (no hysteresis, no re-enable path).

**Note on plugin-pattern coexistence:** existing `wiki-link-source.ts` and `md-link-source.ts` use regex over `view.visibleRanges` (not syntaxTree). They stay as-is; the polish engine's wikilink/link handling is SEPARATE and based on regex `customDetect` (not syntaxTree), matching the existing convention. This avoids depending on a non-existent `WikiLink` node in `@lezer/markdown`.

## 7. Per-construct decisions

Each construct specifies: lezer node(s), decoration kind, CSS values, visual outcome, trade-off. All come from the /analyze self-assessed verdicts. Table uses prior agreement.

*(This section is deliberately long — it's the per-construct implementation playbook.)*

### 7.1 Family A — Prefix / marker block

#### Blockquote (KEEP + TUNE)

- **Nodes:** `Blockquote` (container), `QuoteMark` (the `>` chars)
- **Kind:** `line` with depth-aware class
- **Depth ramp (TUNE from /analyze):** monochromatic opacity shifts only, not hue shifts. Cap visible differentiation at depth 3.
- **CSS:**
  ```css
  .cm-blockquote-line {
    border-left: 3px solid color-mix(in oklab, var(--muted-foreground) 50%, transparent);
    background: color-mix(in oklab, var(--muted) 4%, transparent);
    padding-inline-start: calc(8px + 2ch);
    text-indent: -2ch;
  }
  .cm-blockquote-depth-2 { border-left-color: color-mix(in oklab, var(--muted-foreground) 65%, transparent); }
  .cm-blockquote-depth-3 { border-left-color: color-mix(in oklab, var(--muted-foreground) 80%, transparent); }
  /* depth 4+ inherits depth 3 */
  ```
- **Outcome:** tinted zone with left bar; wrapped continuation aligns under content not `>`; nesting distinguishable up to 3 levels
- **Trade-off:** doesn't render as quote-card; deep nesting beyond 3 collapses visually (acceptable)

#### List / listItem (KEEP)

- **Nodes (verified):** `BulletList`, `OrderedList`, `ListItem`, `ListMark` (standard) + `TaskMarker` (GFM — requires PR1)
- **Kind:** `line` with hanging indent + `mark` on `ListMark`
- **Depth-indexed padding:** `padding-inline-start: calc(2ch * var(--list-depth, 1))` where `--list-depth` is computed from syntax-tree ancestor count and attached via inline style on the line decoration
- **CSS:**
  ```css
  .cm-list-item-line { padding-inline-start: calc(2ch * var(--list-depth, 1)); text-indent: -2ch; }
  .cm-list-marker { color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  ```
- **Outcome:** wrapped list-item content aligns under text, not marker; markers muted
- **Trade-off:** no auto-renumber (out of scope)

#### Task item (REVISED per /analyze)

- **Nodes:** `TaskMarker` (the `[ ]` / `[x]`)
- **Kind:** `mark` (no side-widget — revision from original proposal)
- **Treatment:** style the `[ ]` in place via `.cm-task-marker` with `border: 1px solid; border-radius: 2px; background: transparent` for unchecked; `background: var(--accent)` for checked. The brackets and `x` remain visible underneath as text; CSS draws a box "around" them via inline-block sizing.
- **Interactivity (Phase 1 scope):** visual only. Click handler deferred to Future Work (§12) since it requires care around source rewrite + CRDT + cursor.
- **Trade-off:** checkbox is visual hint, not interactive in Phase 1-3. Functional toggle via edit-character-directly.

### 7.2 Family B — Container block

#### Fenced code (KEEP with validation gate)

- **Nodes:** `FencedCode`, `CodeMark` (fence chars), `CodeInfo` (language name), `CodeText` (body)
- **Kind:** `line` with preserve-source-indent hanging + `widget-side` for language badge
- **Preserve-source-indent (novel, needs prototype):** compute each line's leading whitespace; set `--line-indent: <N>` via inline style; apply `padding-inline-start: calc(8px + var(--line-indent) * 1ch); text-indent: calc(-1 * var(--line-indent) * 1ch)`. Wrapped continuation aligns under the code's own indentation.
- **Syntax highlighting:** `markdown({ codeLanguages })` with `@codemirror/language-data`. The registry entry for FencedCode doesn't duplicate this — it's a `markdown()` constructor arg, configured once at editor init.
- **Language badge:** `Decoration.widget({ side: 1 })` at `CodeInfo` position rendering small badge.
- **CSS:**
  ```css
  .cm-code-block {
    background: color-mix(in oklab, var(--muted) 40%, transparent);
    border-left: 2px solid var(--border);
    font-family: var(--font-mono);
    padding-inline-start: calc(8px + var(--line-indent, 0) * 1ch);
    text-indent: calc(-1 * var(--line-indent, 0) * 1ch);
    font-size: 0.9em;
    line-height: 1.4;
  }
  .cm-code-block-first { border-top: 1px solid var(--border); }
  .cm-code-block-last { border-bottom: 1px solid var(--border); }
  .cm-code-language-badge {
    display: inline-block;
    padding: 0 4px;
    margin-left: 4px;
    font-size: 0.75em;
    color: var(--muted-foreground);
    background: var(--muted);
    border-radius: 2px;
  }
  ```
- **Preserve-source-indent — no UX gate (reclassified as verified community-standard pattern).** Validation updated 2026-04-14:
  - Community prior art: [dralletje gist](https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e), [codemirror-wrapped-line-indent](https://www.npmjs.com/package/codemirror-wrapped-line-indent), Pluto.jl production use. The pattern (`text-indent: -N*1ch; padding-inline-start: N*1ch`) works in CM6.
  - **Known caveat:** rectangular selection across wrapped-preserve-indent lines has visual quirks. Documented alternative is `border-left + ::before` variant, but it's a different visual effect (not true hanging indent). Decision: accept the rectangular-selection quirk; add to Future Work if users complain.
  - Implementation check in Phase 1: ensure `text-indent + padding-inline-start` composes correctly with other line-decoration classes that also set padding (blockquote, list). CSS custom property approach (`--line-indent` set via inline style) scopes the computation cleanly.
- **Outcome:** distinct code zones with syntax colors, language label, indent-preserving wrap
- **Trade-off:** truly long single-line content (minified JS) still wraps to many lines; rectangular selection has visual quirks

#### Inline code (KEEP)

- **Node:** `InlineCode`
- **Kind:** `mark`
- **CSS:**
  ```css
  .cm-inline-code {
    font-family: var(--font-mono);
    background: color-mix(in oklab, var(--muted) 30%, transparent);
    padding: 0 0.25em;
    border-radius: 3px;
    word-break: break-all;
  }
  ```
- **Outcome:** visibly styled inline code; long inline code breaks anywhere to fit
- **Trade-off:** mid-token breaks for long tokens (unavoidable under no-h-scroll)

#### HTML block (KEEP + A/B Rainbow-HTML in Phase 3)

- **Node:** `HTMLBlock`
- **Kind:** `line` + conventional syntax highlighting via nested `@codemirror/lang-html` parser (wired through `markdown({ htmlTagLanguage: html({ matchClosingTags: false }) })` — verified API, see §6.5).
- **CSS (baseline — ships Phase 2):**
  ```css
  .cm-html-block {
    background: color-mix(in oklab, oklch(55% 0.06 300) 4%, transparent);
    border-left: 2px solid color-mix(in oklab, oklch(55% 0.06 300) 30%, transparent);
    padding-inline-start: 8px;
    font-family: var(--font-mono);
    font-size: 0.95em;
  }
  ```
- **Syntax hl:** via `@codemirror/lang-html` nested parser. Attribute names, values, tag names get distinct token colors via the standard highlight theme.
- **Rainbow-HTML — DEFERRED to Phase 3 A/B (per Design Challenge #4):** alternating attribute-pair background tints for multi-line wrapped HTML blocks (the challenger's argument: when an HTML element wraps across many lines due to no-h-scroll, a pair-grouping color cue identifies which attributes belong to which tag — unlike single-line HTML where token color alone suffices). Phase 3 composition-page A/B tests `baseline` vs `baseline + rainbow attribute pairs`. Ship rainbow only if testers prefer it on realistic multi-line HTML content; otherwise ship baseline and re-classify Rainbow-HTML as NEVER with evidence backing.
- **Outcome (baseline):** HTML blocks are distinct purple-tinted zones with proper HTML syntax coloring.
- **Trade-off:** the pre-test self-assessed verdict ("distracting") was the rationale for dropping Rainbow-HTML earlier; the challenger correctly flagged that every other visual decision in this spec gets an A/B, and this one didn't. Asymmetry now resolved.

#### YAML frontmatter (KEEP — scope-reduced for Phase 2)

- **Detection:** custom — `@lezer/markdown` doesn't ship a frontmatter node by default (verified). Registry uses `customDetect` matching `/^---\s*\n/` at document start and running until closing `---`.
- **Kind:** `line` — Phase 2 ships line-tint + borders ONLY. No nested YAML syntax highlighting in Phase 2 (requires `@codemirror/lang-yaml` + custom `parseCode` wiring; deferred to Phase 4 or Future Work).
- **CSS:**
  ```css
  .cm-frontmatter-line {
    background: color-mix(in oklab, var(--accent) 5%, transparent);
    font-family: var(--font-mono);
    font-size: 0.95em;
    line-height: 1.4;
  }
  .cm-frontmatter-fence-open { border-top: 1px solid var(--border); }
  .cm-frontmatter-fence-close { border-bottom: 1px solid var(--border); }
  ```
- **Fold:** deferred — requires `foldNodeProp` on a custom node; since we use `customDetect` (regex), we'd need a separate fold provider. Phase 4 or later.
- **Outcome (Phase 2):** clearly-bounded metadata zone at doc top; plain monospace text inside
- **Trade-off:** no YAML syntax coloring in Phase 2 (deferred); no collapse toggle in Phase 2 (deferred)

#### Table (PRIOR AGREEMENT — unchanged)

- **Nodes:** `Table`, `TableHeader`, `TableRow`, `TableDelimiter`, `TableCell`
- **Tier 1:** row tint + left accent bar + top border + hanging indent (same CSS family as blockquote but table-tuned hue)
- **Tier 2:** per-cell alternating color bands via `MatchDecorator` on `TableCell` ranges. 4-color cycle, ≤4% opacity per band. `box-decoration-break: clone` for wrap-spanning.
- **Tier 3:** `font-size: 0.9em; line-height: 1.4`

CSS already specified in prior ASCII-rendering discussion (see §7 of `codemirror-markdown-source-view-rendering` evidence for full refs).

#### Definition block (KEEP — node-name corrected)

- **Node (verified):** `LinkReference` — same node name `@lezer/markdown` uses for BOTH inline reference-links (`[text][ref]`) AND block-level reference definitions (`[label]: url "title"`). **`LinkReferenceDefinition` does NOT exist as a distinct node.** Disambiguate by inspecting the parent node (block-level = document-child; inline = paragraph-child) or by position (at line start vs mid-paragraph).
- **Kind:** `line`
- **CSS:**
  ```css
  .cm-link-ref-def {
    background: color-mix(in oklab, var(--muted) 15%, transparent);
    border-left: 2px solid var(--muted-foreground);
    padding-inline-start: 6px;
    font-size: 0.95em;
  }
  .cm-link-ref-def-label { color: var(--accent); }
  .cm-link-ref-def-url { color: var(--muted-foreground); word-break: break-all; }
  ```
- **Outcome:** metadata-tinted zone for definition blocks; label/URL visually distinct
- **Trade-off:** doesn't physically relocate definitions to doc end (not this spec)

### 7.3 Family C — Short-range styled

#### Heading (TUNE — scaled-back hierarchy)

- **Nodes:** `ATXHeading1`–`ATXHeading6`, `HeaderMark`
- **Kind:** `line` per level + `mark` on HeaderMark
- **CSS:**
  ```css
  .cm-heading-1 { font-size: 1.25em; font-weight: 700; margin-block: 0.3em; }
  .cm-heading-2 { font-size: 1.15em; font-weight: 700; }
  .cm-heading-3 { font-size: 1.1em;  font-weight: 600; }
  .cm-heading-4 { font-size: 1em;    font-weight: 600; }
  .cm-heading-5 { font-size: 1em;    font-weight: 500; }
  .cm-heading-6 { font-size: 1em;    font-weight: 500; color: var(--muted-foreground); }
  .cm-header-mark { color: var(--muted-foreground); font-weight: 400; }
  ```
- **Outcome:** subtle size hierarchy; `#` markers visible but recede
- **Trade-off:** not dramatic like rendered markdown (intentional)

#### Thematic break (TUNE — rule dominates, text fades)

- **Node:** `HorizontalRule`
- **Kind:** `line`
- **CSS:**
  ```css
  .cm-thematic-break {
    border-bottom: 1px solid var(--border);
    margin-block: 0.4em;
    color: transparent;   /* fade the --- text; rule is the signal */
    line-height: 0;
  }
  ```
- **Outcome:** visual horizontal rule; `---` chars fade to transparent.
- **Addressability note (per §1 invariant):** the `---` characters remain in the document, cursor-reachable, selectable, copyable, find-replaceable. Pixel-visibility is reduced but addressability is preserved — consistent with the §1 invariant ("addressable, not necessarily inked"). This is the worked example that motivated reframing the invariant from "always visible" to "always addressable" (Design Challenge #5).
- **Trade-off:** a user who visually expects to see `---` may be briefly surprised. Alternative is `opacity: 0.3` (preserves some ink) — included in Phase 3 composition-page A/B alongside `color: transparent`. Ship whichever wins; both are addressability-preserving.

#### Emphasis / strong / delete (KEEP — node-name corrected)

- **Nodes (verified):** `Emphasis`, `StrongEmphasis`, `Strikethrough` (GFM), `EmphasisMark`. **`StrongMark` does NOT exist** — both `*` and `**` mark characters are `EmphasisMark` tokens; disambiguate by the enclosing node (`Emphasis` vs `StrongEmphasis`). `Strikethrough`'s marks are `StrikethroughMark`.
- **Prerequisite for Strikethrough:** GFM enablement (see §5b PR1).
- **Kind:** `mark` on content + `mark` on markers
- **CSS:**
  ```css
  .cm-em     { font-style: italic; }
  .cm-strong { font-weight: 700; }
  .cm-del    { text-decoration: line-through; color: var(--muted-foreground); }
  .cm-em-marker, .cm-del-marker {  /* same class for * and ** — disambiguated via parent-node lookup at decoration time, styled identically */
    color: var(--muted-foreground);
    opacity: 0.65;
  }
  ```
- **Outcome:** content styled, markers visible but muted
- **Trade-off:** some users may prefer markers invisible (Obsidian-LP style); no toggle is provided per §9 — if this becomes a real complaint, iterate on marker opacity rather than introducing a toggle

#### Highlight (TUNE — low opacity or underline)

- **Node:** `Highlight` (requires custom parser extension — @lezer/markdown doesn't ship it natively per D10 evidence)
- **Kind:** `mark`
- **Option A (preferred):** low-opacity yellow background
  ```css
  .cm-highlight { background: color-mix(in oklab, oklch(85% 0.13 85) 25%, transparent); }
  ```
- **Option B (fallback if bg feels loud):** underline-as-highlight
  ```css
  .cm-highlight { text-decoration: underline; text-decoration-color: oklch(75% 0.13 85); text-decoration-thickness: 2px; }
  ```
- **Decision:** ship Option A at 25% opacity; tune to B in Phase 3 if composition-page test flags it
- **Parser gate:** requires `==highlight==` parser extension; if not present in Phase 1, defer to Phase 3

#### Link / image (KEEP + REVISE — node-name corrected)

- **Nodes (verified):** `Link`, `Image`, `LinkMark`, `URL`, `LinkReference`. **`ImageReference` does NOT exist** — reference-style images `![alt][ref]` reuse the `Image` node name with a `LinkReference` child. Disambiguate via child-node inspection.
- **Kind:** `mark` on content, markers, URL — all separate classes
- **CSS:**
  ```css
  .cm-link-text { color: var(--accent); text-decoration: underline; text-decoration-style: dotted; }
  .cm-link-url  { color: var(--muted-foreground); word-break: break-all; /* NO font-size — preserves baseline alignment */ }
  .cm-link-mark { color: var(--muted-foreground); opacity: 0.6; }
  .cm-image-mark { color: oklch(55% 0.15 60); }  /* distinguish images from links */
  ```
- **Outcome:** link text styled with accent + dotted underline; URL muted; brackets/parens dim; long URLs break at any char
- **Trade-off:** no image inline thumbnail (WYSIWYG)

#### WikiLink (SCOPE REDUCED — existing plugin stays; broken-state added TO the plugin, not engine)

- **Current behavior (verified live via DOM inspection 2026-04-14):** `packages/app/src/editor/plugins/wiki-link-source.ts` is a 243-LOC ViewPlugin that owns the full wikilink surface: mark decoration via `WIKI_LINK_RE` regex over `view.visibleRanges`, Ctrl/Cmd+click navigation, async completion source backed by `getPages()` + `getHeadings(docName)` with a 5-second TTL cache, and a theme emitting `cm-wiki-link` class. Wikilinks ARE already visually distinguished in source mode today. Predates the polish engine by months; works correctly.

- **Decision for Phase 4: wikilinks stay owned by `wiki-link-source.ts`; broken-wikilink detection is added INTO that plugin, not into the polish engine.** (Per Design Challenge #3 resolution — option C.)

- **Why not consolidate into engine (option B rejected):** investigation during /analyze showed the "50 LOC port" assumption was wrong. The 243 LOC covers completion source (~150 LOC), click navigation (~30 LOC), theme (~10 LOC), and mark decoration (~30 LOC). The non-decoration concerns (completion via `markdownLanguage.data.of({autocomplete:...})`, click handler, async page cache) have no home in the registry schema — they're language-data extensions and DOM event handlers, not decorations. Consolidation either bloats the engine schema with cross-cutting concerns or splits the file artificially. Neither pays off.

- **Why not skip broken-state entirely (option A rejected):** the engine's signature feature is cross-scan broken-reference detection for `[text][missing-label]`. If that ships but `[[Missing Page]]` gets no broken indicator, users see wavy-red on link-refs and nothing on wikilinks — inconsistent, and wikilinks are the Open Knowledge-native primitive (users will notice the gap first).

- **Implementation (~30 LOC added to `wiki-link-source.ts`):**
  1. The plugin already has `pagesCache` (5-second TTL, populated by `getPages()`). Reuse it.
  2. Add a second `Decoration.mark` pass (or extend the existing one) that checks each wikilink target against the cached page list. If the page isn't in the index, apply `cm-wiki-link-broken` class alongside `cm-wiki-link`.
  3. Handle the cache-cold path: first paint on a cold cache → don't emit broken marks yet (false positives); wait for cache population, then trigger decoration rebuild via `view.dispatch({})` effect.
  4. CSS: wavy red underline (LSP convention, matches link-ref broken style from §7.4 for visual consistency).

- **CSS (lives in the plugin's theme, NOT the engine's):**
  ```css
  .cm-wiki-link { color: oklch(52.7% 0.154 228.4); font-weight: 500; }  /* existing */
  .cm-wiki-link-broken {
    text-decoration: underline wavy;
    text-decoration-color: oklch(55% 0.15 25);
  }
  ```

- **Outcome:** wikilinks visibly distinct (color + weight, existing behavior); broken wikilinks additionally wavy-red-underlined (new, this spec).
- **Trade-off:** two decoration sources in the editor (engine for 17 constructs, plugin for wikilinks). Architectural precedent #4 ("shared computation, per-surface rendering") is specifically about SHARING detection across WYSIWYG + source — not about forcing source-view decorations into a single engine. Keeping the plugin as construct-owner doesn't violate that precedent; it aligns with it.
- **Engine registry consequence:** no `wikiLink` entry. No `cm-wikilink*` class names in the engine CSS. The §7.4 cross-scan StateField handles `LinkReference` only.

### 7.4 Family D — Broken-reference checkers

#### Broken link-reference (link-ref only; wikilinks handled by existing plugin)

- **Detection:** cross-scan StateField
- **Kind:** `cross-scan-mark`
- **Node (verified):** `LinkReference` — same node name for BOTH block-level definitions (`[label]: url "title"`) AND inline reference-links (`[text][ref]`). Disambiguate by parent-node inspection: document-child at line start = definition; paragraph-descendant = inline reference.
- **Logic:**
  1. `collect` pass: iterate `syntaxTree()` for document-level `LinkReference` nodes (the definitions); harvest each label from the node's `LinkLabel` child
  2. `check` pass: iterate paragraph-level `LinkReference` nodes (the inline references); if the referenced label isn't in the collected map, emit `Decoration.mark` with class `cm-link-ref-broken`
- **CSS:** wavy red underline (LSP convention)
- **Early-return:** `!tr.docChanged` gates rescan (per §6.4 convention)
- **syntaxTreeAvailable() gate** (per §5b PR2) before reading the tree
- **Wikilink broken-state: owned by `wiki-link-source.ts`, not this engine.** See §7.3 — the existing plugin gets a ~30-LOC addition to reuse its `pagesCache` for broken-state detection. Cross-scan StateField here covers `LinkReference` only. Design Challenge #3 resolved to option C (add to plugin, don't consolidate into engine).

### 7.5 Family E — Non-hiding hint widgets

#### HardBreak glyph (DROPPED from default; KEPT as opt-in)

- **Node:** `HardBreak`
- **Kind:** `widget-side` with `side: 1`
- **Preference gate:** `settings.sourcePolish.hardBreakGlyph = false` (default); user can enable
- **CSS:**
  ```css
  .cm-hard-break-glyph { color: var(--muted-foreground); opacity: 0.5; font-size: 0.8em; }
  ```
- **Outcome (when enabled):** subtle `↵` hint distinguishes hard breaks from soft wraps
- **Trade-off:** visual noise when prevalent — opt-in only

## 8. Non-decorating constructs (explicitly)

These are registered in the registry with `kind: 'none'` (or simply not registered) because they need no source-view polish:

- `paragraph` — baseline prose; the master prose rule demands zero decoration
- `text` — baseline text
- `escapeMark` — fidelity / storage concern; not a rendering concern
- `hardBreak` — no glyph by default (opt-in only); no line/mark decoration

## 9. Preferences UX

**The engine ships always-on. No user-facing toggles.**

No settings surface, no keyboard shortcut, no localStorage, no transient toast. Phase 1-5 ship the polish engine as part of the source editor's default extension array, unconditional. If polish is valuable, every user should benefit without opt-in friction; if polish is too aggressive for a user, their complaint is a signal we'd iterate on the polish itself (make it subtler), not a preference we'd expose.

**No user-facing Compartment surface.** There is, however, an internal-only Compartment (§6.5 + §6.6) wired from day one. It exists solely for the auto-bail predicate — if a pathological document exceeds the benchmark-calibrated threshold, the engine reconfigures to `[]` and the doc renders as plain CM6 source. No user UI, no preference, no shortcut exposes this; it is a silent safety net. The earlier stance ("Compartment is NOT used, pre-emptive wiring is unneeded complexity") conflated user-facing toggle (still rejected) with internal reconfigurability (different concern). Design Challenge #1 resolution.

**Hardbreak glyph — dropped from engine entirely for Phase 1-5.** Not a preference, not a feature. If demand emerges post-ship, revisit as its own feature with its own surface.

**Trigger to revisit this decision:** if user feedback through normal product channels (GitHub issues, Discord, etc. — follow whatever channel Open Knowledge uses for editor feedback) indicates the polish is distracting, revisit in a dedicated follow-up. Options at that point: (a) soften the polish itself; (b) introduce a toggle; (c) localized construct-level disables. Don't pre-build for speculative cases. Dropped the arbitrary "≥3 users" threshold — no instrumentation behind it, better to watch qualitatively.

## 10. Testing strategy

### 10.1 Unit
- Registry config parsing: each `ConstructConfig` shape validates correctly
- Dispatch correctness: `kind: 'line'` entries land in ViewPlugin; `kind: 'cross-scan-mark'` land in StateField
- Viewport scoping: synthetic large doc → ViewPlugin only iterates visible lines
- Cross-scan: broken-ref detection with add/remove definition, incremental correctness

### 10.2 Visual regression (Playwright)
- Golden images per construct on a fixture document
- Light and dark theme variants
- Mobile viewport (narrow) variant
- Composition-page test: a single fixture (`fixtures/all-constructs.md`) with every construct active — compare against reference image
- Special fixture: `PROJECT.md` render → table region pixel-height measured against threshold

### 10.3 Integration
- y-codemirror.next smoke test: two peers edit same doc with polish on, verify convergence
- Multi-cursor / column-select smoke test: operations produce identical results polish-on vs polish-off
- Find/replace smoke test: text matches preserve across decoration changes

### 10.4 Performance
- Benchmark harness: 2000-line synthetic doc with 100+ constructs active
- First-paint: ≤ 30 ms target
- Per-keystroke overhead at viewport: ≤ 5 ms
- Cross-scan rebuild on large doc: ≤ 100 ms for a 10,000-line doc with 500 references

### 10.5 Accessibility
- axe-core check on rendered editor DOM
- Manual screen-reader walkthrough: decoration classes don't leak visual-only info
- Color-contrast check per theme: WCAG AA minimum for tinted text

### 10.6 Prototype validation (Phase 1 gate)
- Preserve-source-indent hanging: subjective tester verdict on "reads natural" vs "reads weird." If ≥2 of 3 testers say weird, fall back to standard non-hanging. **Humans only** per §10.8.

### 10.7 Automated browser verification (/qa + Playwright)

This is the objective verification layer. Every row maps a risk to a Playwright assertion a /qa agent can execute without making aesthetic judgments. Each row names the fixture, the assertion, the threshold, and which phase's exit gate it blocks.

| ID | Risk | Fixture | Assertion | Threshold / oracle | Gates phase |
|---|---|---|---|---|---|
| **R1** | CRDT collab regression | two-client Playwright harness on composition doc | Client A types N chars → Client B types M chars → stop. After sync settles (≥500ms), `docA.toString() === docB.toString()`. Separate run: MCP `agent-write-md` → both clients show `.cm-agent-flash-*` class within 200ms. | Byte-equal; flash class observed on both | Phase 1 |
| **R2** | PR1a regression on existing plugins | PROJECT.md + fixture with bare URLs + wikilinks | Before/after PR1a on identical doc: count `.cm-wiki-link`, `.cm-md-link`, `.cm-agent-flash*`. Ctrl+click on `[[Page]]` → URL changes as expected. `[[` triggers completion popup. | Counts unchanged; click + completion behave identically | PR1a exit (before Phase 1) |
| **R3** | Cmd+A → copy corruption | per-construct fixture (17) + composition doc | Focus editor → `Cmd/Ctrl+A` → `Cmd/Ctrl+C` → `await page.evaluate(() => navigator.clipboard.readText())` → compare to `view.state.doc.toString()`. | Byte-equal | Phase 1 (table, blockquote, code) + per-phase for constructs added |
| **R4** | Auto-bail misfires | synthetic 4999-line and 5001-line docs | 4999-line: `polishCompartment.get(view.state)` resolves to a non-empty extension set. 5001-line: resolves to `[]`. | Boolean, exact | Phase 1 |
| **R5** | Uncaught errors / console errors | composition doc + 10-minute interaction script (type, scroll, theme swap, agent write, undo/redo) | `page.on('pageerror')` and `page.on('console', msg => msg.type()==='error')` accumulate a list. | List length === 0. **Zero tolerance.** | Every phase (§10.9) |
| **R6** | Cursor-walk correctness | per-construct fixture | Place cursor at construct start. Press `ArrowRight` until past end. After each press, record `state.selection.main.head`. Sequence must be strictly monotonic and cover every character position. Backspace from construct end removes exactly one code-point. | Strictly monotonic, no skipped positions | Phase 1 (tables, blockquote, code), Phase 2 (list, heading, frontmatter), Phase 3 (inline set), Phase 4 (links, broken-ref) |
| **R7** | Find/replace parity | composition doc | Type a substring present N times. Open find panel (`Cmd+F`) → count `.cm-searchMatch` spans. Compare to engine-removed baseline on identical doc. Replace-all → resulting doc text identical in both. | Count equal; post-replace doc equal | Phase 3 |
| **R8** | Multi-cursor / column-select / rectangular-on-wrap | wrapped fenced code fixture (3+ visual lines per logical line) | Alt-drag a vertical rectangle across 3 wrapped lines. `Cmd+C` → clipboard. Assert clipboard is the expected character grid (same as engine-removed baseline). Multi-cursor via `Cmd+click` at 3 positions → type `X` → assert 3 `X` insertions at correct offsets. | Clipboard string exact match | Phase 1 (rectangular); Phase 3 (multi-cursor) |
| **R9** | Performance — first paint, keystroke, scroll | synthetic 2000-line doc with ≥100 constructs | `performance.mark` around editor mount → first `requestAnimationFrame` callback after paint. Type 100 chars with `performance.now()` delta per keystroke. Viewport scroll 50 pages, measure frame budget. | First-paint ≤ 30ms; per-keystroke p95 ≤ 5ms; scroll p95 frame ≤ 16ms | Phase 1 exit |
| **R10** | Decoration class correctness + nested composition | fixture with each construct + nested construct (blockquote > fenced code > strikethrough) | For each construct: assert expected class present on correct line/mark ranges. Nested fixture: assert both parent and child classes coexist on nested lines. | Expected classes present; no extra classes leaked | Phase 1–4, construct-by-construct |
| **R11** | Theme swap cleanliness | composition doc | Sequence: light → ThemeToggle → dark → ThemeToggle → light. After each swap: decorations still present (class count unchanged); no console errors (R5 subset); no layout shift >1px on non-theme-affected regions. | Counts unchanged, zero errors | Phase 5 |
| **R12** | Agent-write sync | running dev server with agent-sim harness | POST `/api/agent-write-md` with known markdown → wait for client sync (≤2s) → assert Y.Text content matches payload AND `.cm-agent-flash-source-*` class appeared on mutated lines during the window. | Content match + flash observed | Phase 1 |
| **R13** | WCAG AA contrast | composition doc, both themes | `@axe-core/playwright` scan filtered to `color-contrast` rule. | Zero violations | Phase 5 |
| **R14** | box-decoration-break across wrap | narrow-viewport table fixture forcing cell wrap | Measure `.cm-table-cell` (or per-cell class) `getBoundingClientRect()` across both visual lines. Assert both have non-empty `backgroundColor` AND no 1px gap at the wrap boundary (compare computed styles + Y positions). | Both segments styled; bg color equal; no gap | Phase 1 (table) |

**Usage.** `/qa` runs the subset relevant to the current phase's exit gate. Each phase's exit gate in §11 names the specific R-rows that must pass. A phase cannot exit without all its named rows green.

**What /qa does NOT do.** Render a screenshot, look at it, decide if it "feels right." That's §10.8. /qa MAY capture screenshots (§10.7b) for humans to review; it MUST NOT grade them.

### 10.7b Artifact capture — cropped screenshots for human review

Separate from pass/fail assertions. Every /qa run produces a directory of tightly-cropped screenshots covering every construct the engine touches, so a human can flip through them and catch anything the objective assertions missed. This is **capture only** — no agent verdict on the images.

**Capture protocol:**
- One fixture file per construct family (17 entries, plus composition doc + nested-construct doc).
- For each: navigate to the fixture, wait for paint, snapshot a `bounding-box` crop around the decorated region — not the full viewport, not the full editor chrome. Use Playwright's `locator.screenshot({ path })` on the specific DOM element (e.g., first `.cm-table`, first `.cm-blockquote-line`, etc.), not `page.screenshot`.
- Light theme AND dark theme for each construct → 2 images per construct.
- For constructs with multiple visual states (Emphasis has content + markers; Table has Tier 1 row + Tier 2 cells + Tier 3 compactness; Link has text + URL + brackets), take one crop per state.

**Output location:** `tmp/qa-screenshots/<YYYY-MM-DD>-phase-<N>/<construct>/<variant>-<theme>.png`. Index the directory with a flat `MANIFEST.md` listing every file with a one-line description. Agents may include this manifest in their run report; humans review the images.

**What to NOT capture:** anything that relies on motion (agent-flash animation — a single-frame snapshot misses it; covered by R1/R12 assertions instead), anything requiring mouse hover state (hover decorations — covered by class-presence assertions instead).

**Image review is human territory.** Agents hand off the directory; they do not write "LGTM" about the contents.

### 10.8 Human-only judgments (NO LLM aesthetic calls)

The following are **prohibited from /qa or any agent-driven verification**. An LLM looking at a screenshot and calling it "subtle enough" or "busy" produces noise, not signal. These items require a human tester with eyes on the composition doc in a real browser:

- **3-meter test** — decorations barely visible standing 3 meters away (§3 qualitative).
- **Glance test** — construct identification in <300ms (§3 qualitative).
- **"Reads natural" judgment** for preserve-source-indent hanging (§10.6).
- **"Composition page feels busy"** holistic aesthetic assessment (§14 top-HIGH risk).
- **Phase 3 A/B winners** — thematic-break `color: transparent` vs `opacity: 0.3`; Rainbow-HTML baseline vs +rainbow-attribute-pairs; Highlight Option A vs B. Humans pick; /qa only verifies the winning variant ships correctly (R10).

Agents may **prepare fixtures and capture screenshots for human review** but MUST NOT render a verdict on aesthetic outcomes. If an agent finds itself writing "looks good" or "this reads nicely," it is outside its mandate.

### 10.9 Error surface (zero tolerance)

All Playwright runs in §10.7 register `page.on('pageerror')` and `page.on('console')` filters. At the end of every /qa run, the collected list of errors must be empty. Any non-empty list = the run fails regardless of which R-rows passed.

Specific errors to flag loudly (all → test failure):

- Uncaught exceptions in ViewPlugin / StateField update cycles.
- React hydration warnings.
- Yjs delete warnings (`Item.delete()` on content the user is editing).
- `y-prosemirror` schema-throw fallbacks (from the patch we maintain; if we see one, the engine introduced an MDX-adjacent regression).
- CM6 `"requestMeasure"`-loop warnings.
- CSS parse errors (color-mix syntax, oklch syntax — browser-dependent; catches CI target regressions).

Warnings that DO NOT fail:
- `console.warn` lines with the bracket-prefix convention (`[file-watcher]`, `[CC1]`, etc.) — these are operational warnings by design (CLAUDE.md logging conventions).

## 11. Implementation phases

### Phase 1 — Engine + 3 pilot constructs (P0)

**Phase 1 is blocked by §5b prerequisites (PR1a + PR1b).** PR1a lands first as its own reviewable change (enables GFM on CM6 side; adds explicit `codeLanguages` allowlist — NOT the 150+ `languages` import from `@codemirror/language-data`; regression gate on existing source-view UX). PR1b is a convention, rides with the engine PR.

- Registry type + ViewPlugin dispatcher (shared syntaxTree walk, grouped by trigger profile) + StateField dispatcher (cross-scan with `!tr.docChanged` early-return + `syntaxTreeAvailable()` gate)
- Theme via globals.css classes (plugin-pattern-convention choice locked to match `agent-flash-source.ts` pattern)
- Tables (all 5 node types: `Table`, `TableHeader`, `TableRow`, `TableDelimiter`, `TableCell`) with Tier 1+2+3 stack and dual-write `-webkit-box-decoration-break: clone` + unprefixed
- Blockquote (Family A reference, depth-aware via opacity ramp only)
- Fenced code with preserve-source-indent (per-line `--line-indent` CSS custom property) + language badge via `Decoration.widget({ side: 1 })`
- Visual regression harness: Playwright golden-image fixtures for each construct in light + dark themes + §10.7b cropped screenshots for human review
- **Exit gate (§10.7 rows):** R1 (CRDT), R3 (Cmd+A — tables/blockquote/code), R4 (auto-bail boundaries), R5 (zero errors), R6 (cursor-walk through tables/blockquote/code), R8 (rectangular-on-wrap), R9 (perf: first-paint ≤30ms, keystroke p95 ≤5ms), R10 (decoration classes for tables/blockquote/code + nested composition), R12 (agent-write sync), R14 (box-decoration-break).
- **Plus:** PROJECT.md table height ≤40% baseline (235,320 px → ≤94,000 px); §10.7b screenshot set captured for human review.

### Phase 2 — Block-construct completeness (P0)
- List + listItem + task marker in-place styling
- Heading with tuned size hierarchy
- YAML frontmatter (line-tint + borders only; fold deferred — see §7.2)
- **Exit gate (§10.7 rows):** R3 (Cmd+A on list/heading/frontmatter fixtures), R5 (zero errors), R6 (cursor-walk through lists/headings/frontmatter), R10 (decoration classes correct). All block constructs present; no composition-page regression; §10.7b screenshots captured for list / heading / frontmatter / nested-list in both themes.

### Phase 3 — Inline polish (P0)
- Emphasis / strong / delete / inline code
- Link / image / linkReference / definition
- Thematic break — composition-page A/B: `color: transparent` vs `opacity: 0.3` on `---` chars. Ship whichever testers prefer; both are addressability-preserving per §1 invariant.
- HTML block with conventional nested syntax highlighting — composition-page A/B: baseline syntax highlighting vs baseline + Rainbow-HTML attribute-pair backgrounds on multi-line wrapped HTML (per §5 + §7.2, Design Challenge #4 resolution). Ship rainbow only if testers prefer it. If plain wins, reclassify Rainbow-HTML as NEVER in §5 with evidence backing.
- Highlight decision (Option A vs B) based on composition-page test
- **Exit gate (§10.7 rows):** R3 (Cmd+A on every inline construct), R5 (zero errors), R6 (cursor-walk through inline constructs — especially thematic-break with faded chars), R7 (find/replace parity on composition doc), R8 (multi-cursor across inline marks), R10 (all 17 inline constructs' decoration classes). **Plus human-only (§10.8):** 3-meter test on composition page; thematic-break A/B outcome recorded; Rainbow-HTML A/B outcome recorded (ship or reclassify-NEVER); Highlight A/B outcome recorded. §10.7b screenshots captured for every inline construct + winning A/B variants.

### Phase 4 — Novel techniques + cross-scan (P0)
- ~~WikiLink color-only styling~~ — **dropped from the engine**: existing `wiki-link-source.ts` plugin already decorates wikilinks in source mode.
- **Broken-wikilink indicator — added INTO `wiki-link-source.ts`** (~30 LOC), not the engine. Reuses the plugin's existing `pagesCache` to check each wikilink target; applies `cm-wiki-link-broken` wavy-red-underline class when the target isn't in the page index. Design Challenge #3 resolution (option C). Engine stays construct-focused; plugin stays construct-owner.
- Broken-reference indicators in the engine for `[text][missing-label]` via `cross-scan-mark` StateField (link-ref only; wikilink broken-state lives in the plugin per above).
- Syntax highlighting inside fenced code (language allowlist config already wired up in PR1a; this phase validates it renders correctly under the engine on a representative doc)
- **Exit gate (§10.7 rows):** R5 (zero errors), R10 (broken-ref class applied to link-ref targets where the label is missing; broken-wikilink class applied in plugin after pagesCache population). **Custom:** cross-scan perf ≤100 ms on 10k-line doc; no p99 degradation; broken-wikilink spot-check — fixture with a known-missing `[[Target]]` shows `.cm-wiki-link-broken` class within 5s of doc load (pagesCache TTL). §10.7b screenshots: link-ref-broken + wikilink-broken states captured for human review.

### Phase 5 — Polish pass (P0)
- Dark-mode color tuning pass
- Performance validation pass (benchmark against §3 targets)
- Tester-subjective 3-meter / glance test on composition page (human-only per §10.8)
- Full run of §10 testing strategy
- **Exit gate (§10.7 rows):** R9 (full perf re-run on final build), R11 (theme swap cleanliness), R13 (WCAG AA contrast — zero axe-core violations in both themes), plus re-run of all prior phases' R-rows on the final build. **Human (§10.8):** 3-meter + glance tests signed off by ≥2 testers. All success criteria (§3) demonstrably met. §10.7b full screenshot set (every construct × both themes × A/B winners) captured and archived.

Note: this phase does NOT add user preferences. §9 commits to no toggle. If a toggle is ever warranted (see §14 risks / triggers), that's a follow-up feature, not part of this engine's rollout.

## 12. Future Work

### Explored (investigated, not in scope now)
- **Rainbow-HTML attribute-pair coloring.** Phase 3 composition-page A/B decides whether to ship. If A/B outcome is "plain wins," reclassify as NEVER in §5 with evidence backing. If outcome is "rainbow wins," it ships as part of Phase 3 (no Future Work entry needed). This entry exists only as a placeholder until the A/B resolves.
- **Interactive task checkbox toggle** — click `[ ]` to rewrite source. Requires care around cursor position, CRDT sync, IME. Feasible; deferred until Phase 1-5 ship and user demand is clear. Triggers to revisit: >N user requests; evidence that visual-only checkbox is insufficient.
- **Cell-by-cell cursor reveal within tables** — Obsidian's top community request; unshipped anywhere. Would require per-cell StateField granularity. High complexity; low proven value for text-canonical positioning. Re-evaluate if tables are actively edited in source vs. WYSIWYG.
- **Definition block auto-group at doc bottom** — relocate all `[label]: url` lines to doc end (DOM rendering, not source). Complex to get right without source mutation; out of this spec's scope.
- **Outline panel ↔ heading decoration integration** — live update of outline sidebar from heading decoration state. Separate surface; separate spec.

### Identified (known to matter, not investigated deeply)
- **Lint-style diagnostics** — LSP-style underlines for markdown style violations (e.g., duplicate headings, missing alt text). Same `cross-scan-mark` family; future extension.
- **Commit-stamp decorations** — git-blame-inspired per-line commit stamps. Orthogonal surface.

### Noted (brief, parking)
- Custom syntax highlighting themes for code blocks beyond default
- Math / footnotes / alerts support (blocked on parser — not in Open Knowledge's schema)
- Print stylesheet for source view

## 13. Agent Constraints

- **SCOPE:** `packages/app/src/editor/` (SourceEditor.tsx + new polish-engine submodule); `packages/app/src/globals.css` (CSS classes + theme vars); `packages/core/src/extensions/` (if a new parser extension is needed for `Highlight` or `WikiLink` — check first, reuse existing where present)
- **EXCLUDE:** `packages/app/src/editor/TiptapEditor.tsx` (WYSIWYG — not this spec); `packages/core/src/markdown/` (pipeline — not rendering); `packages/server/` (persistence / CRDT — not rendering)
- **STOP_IF:** implementation requires a new grammar extension to @lezer/markdown (parser extensions are 1-way doors affecting fidelity); implementation requires touching `packages/core/src/markdown/pipeline.ts`; implementation requires changes to `shared.ts` extension list
- **ASK_FIRST:** any change that affects MDX handling or rawMdxFallback; any change that affects y-codemirror.next integration; any change to CRDT origin strings; any introduction of a new Highlight or WikiLink parser extension; **any change to `markdown()` call in `SourceEditor.tsx` beyond PR1a's specified allowlist** (GFM/base/codeLanguages/htmlTagLanguage options are load-bearing; changes affect every source-view session); **any change to `wiki-link-source.ts` beyond the Phase 4 broken-state addition** (that plugin owns completion, navigation, and cache concerns the engine deliberately does not).

## 14. Risks (updated post-validation 2026-04-14)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Preserve-source-indent has rectangular-selection visual quirk | MEDIUM | LOW | Accept as known; documented in §7.2. Future Work if users complain. |
| Composition-page feels busy despite individual construct subtlety | MEDIUM | HIGH | Strict opacity ceilings (§3 Must-pass: Tier 1 ≤5%, Tier 2 ≤4%, borders ≤30%); composition-page visual-regression test in Phase 1-3 exit gates; no runtime escape hatch (per §9); if composite feels busy, iterate on the polish itself |
| Cross-scan StateField performance degrades on very large docs | LOW | MEDIUM | Early-return on `!tr.docChanged`; `syntaxTreeAvailable()` gate; viewport-scoped iteration; benchmark on 10k-line doc in Phase 4 |
| ~~y-codemirror.next interaction with widgets breaks CRDT invariants~~ | ~~LOW~~ NONE | ~~HIGH~~ N/A | **Resolved via source inspection** (Subagent 2): `y-codemirror.next/src/y-sync.js:236-303` observes only Y.Text events and reads only `update.changes` from CM. Never inspects decorations. No action needed. |
| Tier 2 cell coloring in tables fails contrast for color-blind users | LOW | MEDIUM | Every Tier 2 cue pairs with non-color signal (cell border, position); axe-core check in testing; contrast math cleared WCAG AA at ≤4% opacity (Subagent 3) |
| Unpublished decoration-count ceiling — engine bogs down on pathological docs | MEDIUM | ~~MEDIUM~~ LOW | **Auto-bail Compartment (§6.6) is the belt-and-suspenders mitigation** (Design Challenge #1): if `doc.lines > 5000` or first-paint exceeds 200 ms, engine reconfigures to `[]` and doc renders as plain CM6 source. No user UI. Threshold calibrated by Phase 1 exit benchmark on 2000-line synthetic doc. |
| `markdown()` currently lacks GFM on CM6 side — tables won't tokenize | ~~MEDIUM~~ RESOLVED | HIGH | §5b PR1a prerequisite (enables GFM + explicit `codeLanguages` allowlist + regression gate on existing source-view UX — Design Challenge #2) — must land cleanly before Phase 1 starts |
| PR1a blast radius — GFM enablement changes tokenization for every existing source-view session; full `@codemirror/language-data` set would emit 150+ lazy chunks | ~~UNKNOWN~~ MEDIUM | MEDIUM | PR1a promoted to first-class change (own §3-style acceptance: bundle-delta ≤20 chunks, regression pass on existing plugins). Design Challenge #2 resolution. |
| Broken-wikilink indicator not shipped in v1 | ~~MEDIUM~~ RESOLVED | LOW | Phase 4 adds ~30 LOC to existing `wiki-link-source.ts` plugin (reuses its `pagesCache` for target-exists check). Design Challenge #3 (option C) resolution. |
| Existing 1P plugin-pattern split (inline theme vs globals.css) causes inconsistency | MEDIUM | LOW | Engine MANDATES globals.css approach for consistency; existing plugins (wiki/md-link) stay as-is but don't set precedent for new code |

## 15. Open questions

**None remaining.** All P0 decisions resolved to LOCKED / DIRECTED / DELEGATED with evidence or explicit resolution path. See §16.

Items that might look like open questions but are not:
- Phase 3 A/B outcomes (thematic-break, Rainbow-HTML, Highlight) — DELEGATED to tester verdict, not open for pre-implementation debate.
- Auto-bail threshold constants (currently `doc.lines > 5000`, first-paint > 200ms) — DIRECTED starting values; Phase 1 benchmark can refine within bounded range.
- Exact codeLanguages allowlist composition — DIRECTED to start with the 12 listed; Phase 1 may add based on actual Open Knowledge corpus, but never regress to `import { languages }` from @codemirror/language-data.

## 16. Decision log

**Resolution status convention.**
- **LOCKED** — decision is final; implementers must follow exactly; changes require new spec round-trip.
- **DIRECTED** — preferred approach specified; implementer has bounded latitude within the specified constraints.
- **DELEGATED** — decision left to implementer's judgment, usually because empirical data (benchmark, A/B) determines the answer.

| # | Decision | Status | Evidence / rationale |
|---|---|---|---|
| D1 | Declarative per-construct registry + ViewPlugin (inline/mark/line/widget-side) + StateField (cross-scan) dispatch, Marijn's block-from-StateField / inline-from-ViewPlugin rule | **LOCKED** | §6.1–§6.3; evidence/technical-validation-crossscan-perf-yjs.md; Marijn discuss.codemirror.net #4372 |
| D2 | Always-on; no user toggle, no settings UI, no keyboard shortcut | **LOCKED** | §9; user directive |
| D3 | Internal Compartment wrapping engine + auto-bail predicate (doc.lines > 5000 OR first-paint > 200ms → reconfigure([])) | **DIRECTED** | §6.5–§6.6; Design Challenge #1. Threshold constants refinable within Phase 1 benchmark data. |
| D4 | S2 (per-line/per-mark decoration) only. `Decoration.replace({block:true})` forbidden. No `atomicRanges`. | **LOCKED** | §6.3; invariant per §1 (addressability) |
| D5 | 17 non-MDX constructs in scope; MDX addressed elsewhere | **LOCKED** | §4 scope boundary |
| D6 | Wikilinks owned by existing `wiki-link-source.ts` plugin. Engine does NOT decorate wikilinks. | **LOCKED** | §7.3; Design Challenge #3 resolution (option C after /analyze revised cost estimate from 50 LOC to 243 LOC) |
| D7 | Broken-wikilink indicator added to `wiki-link-source.ts` (~30 LOC); reuses existing `pagesCache` for target-exists check | **DIRECTED** | §7.3; Phase 4. Implementer decides exact class-application approach (extend existing mark pass vs. second pass). |
| D8 | PR1a as first-class PR: GFM + explicit 12-entry `codeLanguages` allowlist + regression gate. NOT `import { languages }` from @codemirror/language-data (150+ chunks). | **DIRECTED** | §5b PR1a; Design Challenge #2. Allowlist composition may adjust within Phase 1 to match actual Open Knowledge corpus; MUST NOT regress to full `languages` import. |
| D9 | Invariant framing: "source always **addressable**" (characters remain in document, cursor-reachable, Cmd+A→copy byte-identical, find-replace/multi-cursor/column-select parity) — NOT "source always visible" | **LOCKED** | §1, §3, §5; Design Challenge #5 resolution |
| D10 | Cross-scan via StateField for broken link-refs only (link-ref = `[text][missing-label]`). Wikilink broken-state owned by plugin (D6/D7). | **LOCKED** | §7.4, §6.3 |
| D11 | No new `@lezer/markdown` parser extensions. Detection via `customDetect` (regex) for frontmatter (existing wiki-link-source pattern precedent). | **LOCKED** | §13 STOP_IF; §16b |
| D12 | CSS via Tailwind v4 `@theme { --color-* }` tokens; no `--ok-*` prefix | **LOCKED** | §6.4; 1P convention verified |
| D13 | Browser target = Vite 8 baseline-widely-available (Chrome 111+, Safari 16.4+, Firefox 114+). All proposed CSS features (color-mix oklab, oklch, box-decoration-break with -webkit-) supported. | **LOCKED** | §17 A11; evidence/technical-validation-css-browser-support.md |
| D14 | §10.7 R1–R14 test matrix as the editing-parity verification path (replaces hand-wave "editing parity" acceptance criteria) | **DIRECTED** | §3, §10.7. Implementer MAY add rows; MUST cover every named R item. Fixture paths and helper implementations delegated. |
| D15 | §10.7b cropped screenshot capture per construct × both themes, human-reviewed | **DIRECTED** | §10.7b. Output path convention specified; Playwright helper implementation delegated. |
| D16 | §10.8 explicit prohibition on LLM aesthetic judgments (3-meter, glance, "feels busy," A/B winners) | **LOCKED** | §10.8; load-bearing discipline |
| D17 | §10.9 zero-tolerance console/pageerror surface during /qa runs | **LOCKED** | §10.9; specific error signatures enumerated |
| D18 | Table Tier 1 (row tint + accent bar + hanging indent) + Tier 2 (per-cell color bands ≤4% opacity, box-decoration-break) + Tier 3 (0.9em / line-height 1.4) | **LOCKED** | §7 prior agreement; core product position |
| D19 | Preserve-source-indent for fenced code (per-line `--line-indent` CSS custom property) | **DIRECTED** | §7.2; fall-back to non-hanging if §10.6 tester verdict is ≥2/3 "weird" |
| D20 | Rainbow-HTML: NOT NOW, Phase 3 A/B decides ship-or-NEVER-with-evidence | **DELEGATED** | §5, §7.2, §11 Phase 3; Design Challenge #4. Tester verdict is oracle. |
| D21 | Thematic-break treatment: `color: transparent` vs `opacity: 0.3` — Phase 3 A/B | **DELEGATED** | §7.3; both are addressability-preserving per D9. Tester verdict. |
| D22 | Highlight: Option A (low-opacity yellow bg) vs Option B (underline) | **DELEGATED** | §7.3; Phase 3 A/B. Ship Option A unless tester flag. |
| D23 | YAML frontmatter Phase 2 scope: line-tint + borders only. NO nested YAML syntax highlighting, NO fold. | **LOCKED** | §7.2, §11 Phase 2; `@codemirror/lang-yaml` + `foldNodeProp` work out of scope |
| D24 | HardBreak glyph DROPPED from engine entirely for Phase 1-5 (not opt-in, not a preference) | **LOCKED** | §7.5, §9 |
| D25 | Numerical opacity ceilings: Tier 1 ≤5%, Tier 2 ≤4%, borders mixed ≤30%, heading size ≤1.25× base | **DIRECTED** | §3 Must-pass. Implementer may tune WITHIN caps; exceeding any ceiling requires re-approval (spec round-trip). |
| D26 | Phase ordering: PR1a → Phase 1 (tables, blockquote, code) → Phase 2 (block completeness) → Phase 3 (inline) → Phase 4 (cross-scan + broken-wiki in plugin) → Phase 5 (polish) | **DIRECTED** | §11. PR1a → Phase 1 dependency is hard. Phases 2–5 ordering is recommended but may re-order if dependencies permit. |
| D27 | Agent Constraints: SCOPE to `packages/app/src/editor/`, `packages/app/src/globals.css`. STOP_IF on new @lezer grammar extension or pipeline changes. ASK_FIRST on MDX, y-codemirror.next, CRDT origins, `markdown()` call beyond allowlist, `wiki-link-source.ts` beyond broken-state addition. | **LOCKED** | §13 |

**Pressure-test applied:** each LOCKED decision was challenged with "does this truly need to be locked?" — i.e., would implementer latitude here produce a worse spec outcome? Every LOCKED above represents either (a) a 1-way architectural door, (b) a load-bearing invariant, or (c) a user-directive scope boundary. DIRECTED decisions have room to tune within named constraints. DELEGATED decisions are resolved by empirical oracle (benchmark, tester A/B), not by the implementer's preference.

**Conversely:** every DIRECTED / DELEGATED decision was challenged with "could this safely be LOCKED?" — LOCKING more would either pretend to know what we won't know until Phase 1 ships (thresholds, allowlist, A/B outcomes) or over-constrain an implementer who's closer to the code than this spec.

**No decision sits without a resolution status.** Resolution completeness gate: ✓.

## 16b. Constructs without native @lezer/markdown nodes — detection strategy

Several constructs have no standard lezer node. Each has a strategy:

| Construct | Base grammar? | Strategy in this spec | Lezer extension required? |
|---|---|---|---|
| `Table` + variants | GFM extension | Enable GFM via PR1 | No (bundled) |
| `Strikethrough` | GFM extension | Enable GFM via PR1 | No (bundled) |
| `TaskMarker` | GFM extension | Enable GFM via PR1 | No (bundled) |
| Frontmatter | NO | `customDetect` via regex matching `/^---\s*\n/` at doc start, running until closing `---` — NOT a lezer extension | No |
| WikiLink (`[[x]]`) | NO | `customDetect` via regex — matches existing `wiki-link-source.ts` pattern | No |
| Highlight (`==x==`) | NO | **Deferred entirely** (per prior decision Q4) | — |

**Key insight:** we avoid needing ANY new `@lezer/markdown` parser extensions by using `customDetect` (regex over `view.visibleRanges`) for frontmatter and wikilinks. This matches the existing 1P plugin conventions (verified in wiki-link-source.ts + md-link-source.ts). If future constructs need syntax-tree precision (e.g., highlight becomes in-scope), a ~30 SLOC `MarkdownConfig` extension is a known pattern but out of scope for v1.

## 17. Assumptions (updated post-validation 2026-04-14)

| # | Assumption | Confidence | Verification status | Expiry |
|---|---|---|---|---|
| A1 | `@lezer/markdown` provides `Table`, `TableRow`, `TableHeader`, `TableDelimiter`, `TableCell`, `Strikethrough`, `StrikethroughMark`, `TaskMarker` when GFM extension is loaded via `markdown({ extensions: GFM })` | CONFIRMED | Source-verified (Subagent 1) | — |
| A2 | Open Knowledge's current `markdown()` call includes GFM | REFUTED → FIXED IN PR1a | Verified bare (Subagent 4); §5b PR1a adds it (with explicit `codeLanguages` allowlist, not full `languages` import) | Phase 1 prereq |
| A3 | `@codemirror/lang-markdown` integrates nested HTML highlighting via `htmlTagLanguage` option (NOT `htmlParser`) | CONFIRMED | Source-verified (Subagent 1) | — |
| A4 | Preserve-source-indent CSS pattern works in CM6 | CONFIRMED | Community-standard (Subagent 1 — dralletje, codemirror-wrapped-line-indent, Pluto.jl) | — |
| A5 | Cross-scan StateField performance on 10k-line docs ≤100 ms rebuild | UNCERTAIN | No maintainer-published number; benchmark in Phase 4 | Phase 4 exit gate |
| A6 | `Highlight` (`==x==`) parsing — not in standard @lezer/markdown | CONFIRMED | Source-verified | — (deferred) |
| A7 | `@codemirror/language-data` NOT currently a direct dep | CONFIRMED | 1P verified (Subagent 4) — **NOT added** per Design Challenge #2; PR1a uses explicit allowlist of direct lang packages instead (lang-javascript, lang-json, lang-yaml, lang-css, lang-html, lang-python, lang-rust, legacy-modes for bash/go) | — |
| A8 | `@codemirror/lang-yaml` NOT currently a direct dep | CONFIRMED | 1P verified — deferred to Phase 4 | — |
| A9 | `y-codemirror.next` never inspects decorations | CONFIRMED | Source-verified `y-sync.js:236-303` (Subagent 2) | — |
| A10 | CM6 packages at versions supporting all required APIs | CONFIRMED | `@codemirror/view@6.41.0` > 6.39.4 block-widget fix (Subagent 4) | — |
| A11 | Open Knowledge's browser target supports `color-mix(oklab)`, `oklch()`, `box-decoration-break: clone` (w/ `-webkit-` prefix) | CONFIRMED | Vite 8 baseline-widely-available = Chrome 111+, Safari 16.4+, FF 114+; all features supported in target (Subagent 3) | — |
| A12 | Tailwind v4 CSS token naming convention `--color-*` (no `--ok-*` prefix) | CONFIRMED | 1P verified (Subagent 4) — spec follows this convention | — |
