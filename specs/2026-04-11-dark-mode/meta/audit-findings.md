# Audit findings — dark mode spec

Reviewed: 2026-04-11
Auditor: cold reader, /audit discipline

## High severity (verified — must address)

- **A2 is FALSE; the inline FOUC script as written will throw and silently fall back to light theme for every dark user.** Spec §9 (line 131), `vite-spa-fouc.md:34-44`, A2 (line 205), and risks (line 243) all assert next-themes stores theme as JSON-stringified value. Verified by reading `/Users/andrew/Documents/code/agents/agents/agents-manage-ui/node_modules/next-themes/dist/index.mjs`: `localStorage.setItem(m, r)` stores the **raw string** (e.g. `system`, `dark`, `light`), not `JSON.stringify(r)`. Correspondingly, `localStorage.getItem(i) || s` consumes the value directly with no `JSON.parse`. Calling `JSON.parse("system")` in the inline script will throw a SyntaxError, which the `try/catch` swallows — meaning `theme` is never assigned, the `if (resolved === 'dark')` branch never runs, and dark users see a guaranteed light flash on every cold load. This defeats R3, R4 (the central FOUC requirement), and the entire vertical slice's polish argument. Fix: drop `JSON.parse`; read `stored` directly. — Why it matters: this is the single load-bearing technical assumption of the spec; getting it wrong silently regresses the headline goal.

- **`vite-spa-fouc.md:58-59` claims "Storage key compatibility verified by inspecting next-themes source" and even quotes the (incorrect) `JSON.stringify` line — yet the actual source contradicts the quote.** The evidence file presents fabricated verification. Either the verification was never done or it misread the file. This is the kind of claim an auditor relies on; it must be corrected and the actual code quoted.

## Medium severity (verified — should address)

- **D9 / §9 placement contradicts the existing right-cluster ordering convention in the reference.** Spec says ThemeToggle is leftmost in the right cluster, before PresenceBar and AgentUndoButton (lines 116, 186). The reference `agents-manage-ui` `theme-toggle.tsx` is sidebar-styled (`hover:bg-sidebar-accent`, `text-sidebar-foreground`) — i.e., not styled for an editor header. Mirror parity with the reference's *visual* contract is therefore partial; the spec should call out that the className will diverge from the reference (use header-appropriate classes, not `sidebar-*`).

- **Alternatives Considered (line 171) misstates CodeMirror behavior.** The spec claims "CM6's `basicSetup` injects styles that override `prefers-color-scheme`." `basicSetup` provides a default light theme, but it does not actively *override* `prefers-color-scheme`; the issue is simply absence of a dark theme. Minor framing issue but the rejection rationale should be stated accurately ("basicSetup ships a fixed light theme; no `prefers-color-scheme` query is consulted").

- **Q1 is marked "No (can iterate)" but is also load-bearing for R9 acceptance.** R9 demands "rgba opacity boosted for `.dark` mode". The exact alpha is unresolved (0.18-0.30 range). Until a value is chosen, R9 has no objective acceptance criterion — only a visual judgement call. Either pin a default in the spec or downgrade R9 from "Must" with measurable acceptance to "Must (visual review acceptance)".

- **Q6 phrased as a question but the answer is given inside the question.** "Use `light dark`" — that's a decision, not an open question. Move to D11 in §10 or strike from §11.

## Low severity / nits

- §13 next actions list step 1 says "+ `@codemirror/state` already present" — true (verified in package.json line 26), so the parenthetical is informative, not contradictory. Fine.

- §16 EXCLUDE says "Do not touch `globals.css` `.dark` token block (lines 710-742) — extend with new selectors only." Verified the line range matches exactly. Good.

- Reference to "baseline commit 2e27338" — not verified against `git rev-parse`; auditor did not check. Worth a `git log -1 2e27338` confirmation in the implementation phase.

- §15 Future Work "Explored" entry on token-mapped CodeMirror theme says "~50-line theme module" — no evidence file expands this. Reasonable to leave under "Explored" since `codemirror-dark-theme.md` does discuss it briefly, but the depth is closer to "Identified" by the depth-of-investigation criterion.

- A4 ("CodeMirror Compartment-based theme swap doesn't disrupt active y-codemirror.next collaboration") is rated MEDIUM but has no resolution path before merging — it's a runtime test only. Fine to leave but acknowledge it can only be discharged by running the implementation.

## Coherence findings (internal consistency)

- §6 R7 acceptance reads "All HIGH and MEDIUM severity items in `evidence/gap-inventory.md` resolved (per D10)" — this is consistent with D10 and §13 "All MEDIUM-severity items are now In Scope per D10." Good, no drift.

- §6 R12 ("smooth transition") vs D8 ("disableTransitionOnChange") and R12's own "Could" with "Reference uses disableTransitionOnChange; mirror that" — consistent: R12 is documented as deferred; D8 locks the choice. Coherent.

- §3 NG4 ("brand color tokens not theme-responsive UNLESS a content-surface usage fails") vs gap-inventory items #14 (azure-blue link), #15 (azure-100 selectedCell) — these *are* content-surface usages with MEDIUM-severity flags. Per D10 they are now In Scope. So NG4's "[NOT UNLESS]" trigger has fired and NG4 is effectively partially relaxed. The spec should either clarify (NG4 still applies to *defining* new theme-responsive brand tokens, not to *overriding* the few content surfaces that use them) or strike NG4. As written there is ambiguity.

- Q2 (azure-blue link contrast) is "Open" but its resolution is inside gap-inventory item #14 ("override to `--color-sky-blue`") which D10 marks as In Scope. Q2 should be closed and folded into the gap-inventory fix list, not left open.

- Q5 (transition flash) and R12 (smooth transition) reference each other but neither closes the loop: the spec defaults to D8's `disableTransitionOnChange`. So Q5 has a default answer. Should be marked Closed-with-default.

- §9 system design says "FOUC script in `index.html` `<head>` (before CSS link)" but `vite-spa-fouc.md:52` says "Place it as the first child of `<head>` (before `<link rel=...>` to CSS)." These agree — but the spec should also specify that Vite's HTML transform must not reorder the script. Mild operational gap.

- 1-way-door classification looks correct: D1 (three-state model), D4 (scope), D7 (storage key) all marked No / Forward-only appropriately. D3 (next-themes) marked Reversible — accurate.

## Verified factual claims (no issue)

- `packages/app/src/globals.css:710-742` contains the full `.dark` token block. Confirmed exact line range.
- `@custom-variant dark (&:is(.dark *));` is at `globals.css:8`.
- `packages/app/package.json` does NOT depend on `next-themes` or `@codemirror/theme-one-dark`. `@codemirror/state` is present (line 26).
- `packages/app/src/main.tsx` mount structure: `StrictMode > TooltipProvider > App` (lines 10-15). Matches spec's described nesting; the planned `<ThemeProvider>` insertion between StrictMode and TooltipProvider is unobstructed.
- `packages/app/src/components/EditorHeader.tsx` has a right cluster (`<div className="ml-auto flex items-center gap-2 px-3">`) containing `<PresenceBar />` and `<AgentUndoButton />` (lines 57-60). Matches spec description.
- `packages/app/src/editor/SourceEditor.tsx:34-47` constructs `EditorState.create` with `basicSetup`, `markdown()`, `yCollab(...)`, agent-flash extension, and a single height-only `EditorView.theme` — no syntax-highlighting theme. Matches the spec's claim exactly.
- Gap inventory spot-checks (HIGH severity):
  - #1 `globals.css:228` `color: #fff;` on `.collaboration-cursor__label` — verified.
  - #2 `globals.css:254` `color: #fff;` on `.cm-ySelectionInfo` — verified.
  - #3 agent-flash/breathing rgba(217,119,87, 0.04..0.14) — verified at lines 75, 80, 94, 97, 105, 109, 580.
  - #4 `globals.css:423-428` blockquote with `--color-gray-300` border + `--color-gray-600` color — verified (lines 422-428).
  - #5 `globals.css:431-440` `.ProseMirror pre { background: var(--color-gray-100); }` — verified (lines 431-440).
  - #7 `globals.css:472-475` `.ProseMirror hr { border-top: 1px solid var(--color-gray-200); }` — verified.
  - #9 `globals.css:509-513` `.ProseMirror th { background: var(--color-gray-50); }` — verified.
  - #10 SourceEditor no theme — verified above.
  - #11 `WikiLinkSuggestionMenu.tsx:70` hardcoded `text-amber-700` — verified.
- Gap inventory spot-check (MEDIUM): #12 `globals.css:372-373` `border: 1.5px solid var(--color-gray-400)` — verified.
- Reference `theme-toggle.tsx`: ghost icon Button with `<Sun className="dark:hidden" />` and `<Moon className="not-dark:hidden" />`, three-state DropdownMenu over `{light, dark, system}` with lucide Sun/Moon/Monitor icons — verified at the cited path.

## Could not verify

- `next-themes` is not present in `open-knowledge`'s `node_modules` (it isn't a dep yet), so the JSON-storage check was performed against the agents-manage-ui workspace's installed copy at version `^0.4.6`. If open-knowledge ends up installing a different next-themes version, the storage format should be re-checked — but versions <1.0 are unlikely to have flipped JSON serialization quietly.

- Baseline commit `2e27338` was not verified by `git log` — assumed correct.

- A4 (Compartment swap during live y-codemirror.next collaboration) is intrinsically a runtime claim; cannot be verified statically.

- Q3 (HUMAN_COLORS pastel readability on dark) is a visual judgement; not verifiable without rendering.
