# Design challenge — `/specs/2026-04-14-file-sidebar-new-file/SPEC.md`

Senior-designer + staff-engineer cold read. I did not trust the Decision Log's rationale; I independently tested each decision against prior art, the codebase, and U1 ("known path at creation"). Findings ordered by severity.

---

## [Challenge #1] — D2 "New folder" demands a filename up-front — worst UX tradeoff in the spec

**Challenge.** Forcing the user to name both the folder AND its first file in a single dialog is the most un-conventional thing in the spec. Every comparable app (Finder, VS Code, Obsidian, Notion, GitHub web UI, Linear's docs) lets you create a folder as a pure container. Requiring a filename contradicts the mental model ("I'm making a folder, not a file"). It also doubles the cognitive load at the moment the user wants to organise, not author.

**Evidence / reasoning.**
- `evidence/folder-creation-gap.md` lays out three strategies and picks #2 on the grounds that "tree only reflects files." That is a statement about current *server* behaviour, not about correct UX.
- The spec's own "Non-goals" item acknowledges this: "New empty folder (folder with no initial file)… Deferred to a future pass." In other words, the product shape Strategy 1 unlocks is the *desired* end-state; Strategy 2 is scaffolding dressed as product.
- Composite creation breaks the reversibility of the action: user cannot "just make a folder and decide later." The only way to get an empty folder in the product ends up being to create `scratch/.keep.md` or similar — which re-introduces exactly the placeholder-file pattern U1 was meant to rule out (just with a different name).
- R6 ("Empty folder when user cancels mid-flow") reads as if it's a risk of Strategy 1, but it's actually a symptom of the fact that Strategy 2 *doesn't solve* the problem — it just pushes it to the user's patience threshold.

**Options.**
- **A.** Ship Strategy 2 as specified (composite file+folder dialog).
- **B.** Drop "New folder" from v1 entirely. Ship only "New file" with a path input (user can type `new-folder/note.md` to create a folder inline — which is how VS Code and most power-user editors actually work). Defer the real empty-folder feature.
- **C.** Ship Strategy 1 now: add `POST /api/create-folder` + surface empty folders in `/api/documents`. Correct long-term shape, costs ~1 day of server work.
- **D.** Compromise: ship "New file" with path input in v1; defer "New folder" entirely. Measure how many users actually need empty folders before committing to a surface.

**Your recommendation.** **B or D.** Strategy 2 is a false economy — it ships a confusing UX to avoid server work that the spec already admits is needed eventually. "New file" with a path input (`folder/subfolder/name.md`) covers the 95% case cleanly and is how developers already think about paths. Surface to user: is "create a folder without a file" an actual observed user need, or a symmetry intuition? If no evidence of the former, drop it.

---

## [Challenge #2] — D5 blank input is user-hostile; U1 does not forbid editable suggestions

**Challenge.** D5 says "blank input + `name.md` placeholder, submit disabled when empty." The spec cites U1 as the justification. But U1 forbids *silent* placeholder creation ("Untitled-1.md gets written to disk"), not a *pre-filled editable suggestion* the user must confirm. Finder, VS Code, Notion, Google Docs, and macOS all pre-fill with a selected "untitled" string — the user types over it, and the file they get is the one they named. No silent placeholder is ever committed.

**Evidence / reasoning.**
- U1's text in the Decision Log: "No silent Untitled placeholders." A pre-filled, text-selected input where the user either types a new name or presses Enter-to-accept is neither silent nor auto-generated from the user's perspective — it is an explicit suggestion the user affirms.
- Blank-input + disabled-submit adds friction every time: user must click into input, think of a name, type it. Finder-style (pre-selected "untitled folder") is one keystroke away from the user's intent.
- The "power user" persona (Cmd/Alt+N) especially loses here — they want to hit the shortcut and immediately start typing. Blank input works for that; but so does pre-filled-selected, and the latter provides better affordance for new users who don't know what to type.
- The composite "New folder" dialog has TWO blank inputs. Two disabled-submit states. That's a lot of friction.

**Options.**
- **A.** Keep blank + placeholder (current spec).
- **B.** Pre-fill with `${initialDir}/` + empty filename, cursor placed after slash. (Small win: user never has to re-type the directory.)
- **C.** Pre-fill with `${initialDir}/untitled.md`, with `untitled` portion text-selected for immediate overtype. (Finder pattern; strongest UX.)
- **D.** Pre-fill only when `suggestedName` is provided (keeps the wiki-link path) but leave blank otherwise.

**Your recommendation.** **Surface to user.** The tension between U1 and standard OS patterns deserves an explicit reading. My read: U1 is about not committing phantom files to disk, not about UI ergonomics. C is the strongest UX. If the user reads U1 strictly (no suggested text whatsoever, even unsubmitted), then B is the minimum acceptable compromise — at least stop re-typing the directory.

---

## [Challenge #3] — D1 dropdown for two items is over-engineered; prior art disagrees

**Challenge.** A two-item dropdown for a header affordance is the worst of both worlds: it adds a click and a menu for an action that should be one tap, and it hides the less-common action (folder) behind the more-common one (file) anyway. Every meaningful precedent uses either a single "+" (file only; folder via context menu) or two separate icons.

**Evidence / reasoning.**
- **VS Code.** Two separate header icons: "New File" and "New Folder." Always visible.
- **Obsidian.** Single "New note" in the header; folder creation is context-menu only.
- **Notion.** "+" adds a page (most common action); subpages/folders come from context menu.
- **Finder.** New Folder button in toolbar; files are created by apps, not Finder.
- All four precedents avoid a dropdown for this exact two-item menu. Dropdowns make sense when there are 3+ options or when grouping is semantic. Two items = just show both.
- Cost of dropdown: extra component, extra focus ring, extra keyboard navigation, extra aria state. For a feature where "the dropdown menu" is one of the primary interaction gestures on the page, it's a disproportionate burden.

**Options.**
- **A.** Dropdown (current spec).
- **B.** Single "+" = new file; folder only via context menu. (Obsidian pattern; cleanest.)
- **C.** Two icons: "+" file + folder-plus icon. (VS Code pattern; most discoverable.)
- **D.** Single "+" opens the `NewItemDialog` with a kind toggle at the top of the dialog itself (radix-ui tabs or a segmented control). One click, one surface.

**Your recommendation.** **B if folder support stays in v1, otherwise drop the question.** If Challenge #1 lands (defer folder support), the dropdown evaporates and you just ship a "+" button. If folder stays, B is Obsidian-proven and matches the reality that files >> folders in creation frequency. C is also defensible but adds icon clutter to a tight header. D is a worse version of A.

---

## [Challenge #4] — D8 "New file here" on a file row is ambiguous

**Challenge.** Right-clicking a file row and seeing "New file here" forces the user to guess: does "here" mean "in this file's directory" or "replacing this file" or "next to this file" (which… is the directory, but the mental model is linear)? The uniformity argument (same menu on files and folders) is engineering-symmetric but user-confusing.

**Evidence / reasoning.**
- In VS Code, right-clicking a file offers "New File" (at the same directory) but the label is plain "New File" not "New file here" — the disambiguation is in the context of the menu opening, not in the label.
- In Obsidian, the file-row context menu does *not* show "New note here" — creation is folder-only or header-only.
- The word "here" is what does the damage. Users reading "New file here" on a file row will reasonably wonder whether it means "the system's idea of here" (parent dir) or "literally this place" (which is nonsensical for a file).
- Uniformity between file and folder rows solves a spec-writer's problem, not a user's. Different row types legitimately support different operations.

**Options.**
- **A.** Keep "New file here" / "New folder here" on both row types (current spec).
- **B.** Change label to "New file in this folder" (folders) / "New file in parent folder" (files) — explicit but wordy.
- **C.** Context menu only on folder rows. Right-click a file → Rename / Delete only. Right-click a folder → New file / New folder / Rename / Delete.
- **D.** Keep on both, but use unambiguous label: "New sibling file" on file rows, "New file" on folder rows.

**Your recommendation.** **C.** Simplest, least ambiguous, matches user mental model (folders are containers, files aren't). The "discoverability loss" from not being able to right-click a file is minimal — users right-click folders when they think "where do I put this?" and right-click files when they think "what do I do with this thing?"

---

## [Challenge #5] — D4 Cmd/Ctrl+Alt+N is a three-key chord for a frequent action

**Challenge.** Three-finger chords for primary actions are an anti-pattern. Cmd+N is the universal "new" shortcut; if it collides with the browser's "new window" when the app has focus (which it does in web apps), the right answer is usually either (a) accept the collision inside app focus scope (most web apps rebind Cmd+N only when the tree/sidebar has focus) or (b) use Cmd+K-style command palette. Defaulting to Cmd+Alt+N because it "has no reserved mapping" optimizes for non-conflict, not for ergonomics.

**Evidence / reasoning.**
- **Browser reality.** Cmd+N *cannot* be intercepted on the web (browser-reserved). So the spec's author correctly ruled it out — but then reached for Cmd+Alt+N instead of exploring alternatives.
- **Obsidian:** Cmd+N (desktop app, can intercept). Web apps commonly use Cmd+Shift+N or a focus-scoped letter key.
- **Linear, Notion, Superhuman:** Use single-letter shortcuts when focus is on a non-editor surface (`c` for create). This requires focus-scope infrastructure.
- The spec itself acknowledges no app-level keybind system exists — so any choice here requires building infrastructure. The cost of building focus-scoped `n` is comparable to global Cmd/Ctrl+Alt+N.
- Cmd+Alt+N on a laptop: left thumb on Cmd, left pinky on Alt, right middle on N. That's a claw. For a feature meant to be *power-user ergonomic* (Persona D), it fails the claw test.

**Options.**
- **A.** Cmd/Ctrl+Alt+N (current spec).
- **B.** Cmd/Ctrl+Shift+N — two-key chord, no browser collision, standard "new X" pattern in web apps (Google Drive: Shift+F for folder, Shift+T for doc).
- **C.** Focus-scoped single-letter: `n` when sidebar/tree has focus. Matches Linear/Notion pattern. Requires focus-scope plumbing.
- **D.** Put it behind a command palette (Cmd+K → "new file"). Defers keybind question entirely; adds discovery surface.
- **E.** Do both B and C: Cmd+Shift+N globally, `n` when sidebar-focused.

**Your recommendation.** **B** as baseline, **E** if effort is available. Cmd+Shift+N is the web-app convention (Gmail, Drive, Slack all use Shift-modifier for create). Cmd+Alt+N is an engineering choice pretending to be a design choice. Surface to user: is the "no browser collision" constraint actually binding, or can we test Shift+N?

---

## [Challenge #6] — Empty-state CTA says "page" but sidebar header says "Files"

**Challenge.** The app's vocabulary is inconsistent, and this spec adds more inconsistency without addressing the root. "Create your first page" (new CTA) sits underneath a sidebar labeled "Files," in a tree rendering `.md` files, inside a dropdown that says "New file" / "New folder." Users will see four different nouns for the same thing in one screen.

**Evidence / reasoning.**
- `FileSidebar.tsx:17` renders the header label `Files`.
- `CreatePageDialog.tsx:66,68,99` uses `Create page` / `Create a new page for` / `Create page` (button label).
- Existing `PageListContext.tsx` uses "page list."
- `WikiLinkSuggestionMenu` uses `mode: 'page' | 'anchor'` throughout.
- The README / product voice should arbitrate, but this spec doesn't pick a side — it uses "file" for the sidebar dropdown and "page" for the empty-state CTA.
- This isn't a minor polish issue — vocabulary drift compounds. Six months from now a third surface will say "note" and the product becomes word-soup.

**Options.**
- **A.** Ship spec as-is (mixed vocabulary).
- **B.** Standardize on "page" throughout this feature: "New page" / "New folder" / "Create your first page" / sidebar header → "Pages". One-line product decision, cross-cutting.
- **C.** Standardize on "file": "New file" / "Create your first file." Matches filesystem-as-source-of-truth mental model.
- **D.** Split deliberately: filesystem-y labels on filesystem-y surfaces (tree, dialog path input), product-y labels on narrative surfaces (empty-state CTA). Document the rule.

**Your recommendation.** **Surface to user.** This is a product-voice decision, not an engineering decision. But the spec should not ship until it's picked. My bias: **B (page)** for user-facing, keep "file" only in devtools and the path input field. "Page" is what users author; ".md file" is how it's persisted.

---

## [Challenge #7] — D3 one dialog with `kind` prop: two specialized forms would be cleaner

**Challenge.** `NewItemDialog` with a `kind` prop that switches between a single-input layout and a two-input layout will accumulate conditionals. Today it's `if (kind === 'folder')` rendering a second input; tomorrow it's template picker for files only, or "copy from" option for folders, etc. A single component with mode-switching becomes a god-component.

**Evidence / reasoning.**
- The spec's interface already has `suggestedName?: string` that is only relevant for `kind='file'` (wiki-link flow) — the prop is mode-mixed from day one.
- `packages/app/src/components/` shows clean separation of responsibilities elsewhere (`FileTree` / `FileSidebar` / `FileTreeNode`). One-component-two-modes would be the first such pattern here.
- The refactor from `CreatePageDialog` → `NewItemDialog` *breaks* the existing wiki-link E2E test surface (STOP_IF: "dialog refactor breaks an existing wiki-link E2E"). A shared wrapper + two specialized forms has a smaller blast radius on existing tests.

**Options.**
- **A.** Single `NewItemDialog` with `kind` (current spec).
- **B.** `<NewItemDialog>` wrapper (focus trap, close handling, error display) with `<NewFileForm>` and `<NewFolderForm>` children. Separate forms = separate test files, independent evolution.
- **C.** Two top-level dialogs: `NewFileDialog`, `NewFolderDialog`. Simplest, most duplication. Worth it if "file" and "folder" really diverge.

**Your recommendation.** **B.** The dialog chrome IS shared (title, description, error slot, submit button, cancel, focus trap). The *form* is what differs. Splitting at the form level matches where the actual divergence is. Low effort, meaningfully cleaner.

---

## [Challenge #8] — Mobile / touch: the feature is desktop-only by construction

**Challenge.** The spec is silent on touch and mobile. Context menu is right-click-only — touch devices have no right-click. Keyboard shortcut is irrelevant on mobile. The header dropdown is the *only* entry point on touch. That's fine if it's a product decision — but the spec should say so.

**Evidence / reasoning.**
- `FileTreeNode` wraps in `<ContextMenu>` (radix) — mobile long-press support in radix context menu is known-flaky.
- Empty-state CTA saves mobile (touchable) but assumes the tree is empty, so it's not a general-purpose creation path.
- No mention of `@media (pointer: coarse)` or mobile design.
- If the product is meant to be desktop-only, say so in non-goals. If it's meant to work on tablets (likely, given it's a web editor), the context-menu fallback for touch needs a design.

**Options.**
- **A.** Document "desktop-first, touch unsupported" in non-goals.
- **B.** Ensure header "+" is the primary entry point on touch; long-press on tree rows opens the context menu (radix default; needs verification).
- **C.** Add a "…" (kebab) button to each tree row on touch for Rename/Delete/New-here — proven pattern.

**Your recommendation.** **A** explicitly for v1 — add to non-goals. Revisit with **C** when touch becomes a real target. Silence on this is worse than either.

---

## [Challenge #9] — Accessibility: focus-restore after dialog close is unaddressed

**Challenge.** After the dialog closes (whether via create, cancel, or Esc), where does focus go? The spec says "close dialog → navigate to new file → focus editor" for the success path, but doesn't specify cancel/Esc. If focus is lost to `<body>`, keyboard users are stranded and screen readers lose context.

**Evidence / reasoning.**
- Acceptance criterion "Dialog is focus-trapped (inherits from radix-ui/Dialog)" addresses focus *during* dialog open, not *after* close.
- Radix Dialog by default restores focus to the trigger element on close. If the trigger was the header "+", that works. If the trigger was a context menu item that has since closed, focus restoration may fail (trigger no longer in DOM) and focus falls to `<body>`.
- The keyboard shortcut path has NO trigger element — focus-on-close behavior is entirely undefined.

**Options.**
- **A.** Rely on radix defaults; test and document edge cases.
- **B.** Explicitly restore focus to the header "+" button as a fallback when the original trigger is gone.
- **C.** Restore focus to the tree row that was the context (new file's row after create; previously-active row on cancel).

**Your recommendation.** **C** for create paths (focus follows the user's intent — the new file), **B** for cancel paths (focus returns to a stable, always-present anchor). Add an acceptance criterion for each.

---

## [Challenge #10] — Unreported alternative: command palette

**Challenge.** The spec doesn't consider a command palette (Cmd+K) as the primary entry point. Many modern editors (Linear, Raycast, Obsidian's quick switcher + command palette, VS Code) use command palettes as the unified creation + navigation surface. This would unify "+ New file," "new folder," and future actions (new template, new from clipboard, etc.) behind one discoverable, keyboard-first affordance, and obviate the dropdown debate (Challenge #3) entirely.

**Evidence / reasoning.**
- The codebase already has wiki-link suggestion infrastructure (`WikiLinkSuggestionMenu`) — palette-like UI is not a net-new pattern.
- Command palette scales as more commands are added; the dropdown doesn't.
- It solves the keyboard-shortcut problem (Challenge #5): just Cmd+K → type "new" → choose.
- It's unambiguously deferrable — ship the header "+" now, add palette later — but the spec should mention it as a roadmap item so future work is framed correctly.

**Options.**
- **A.** Don't mention; leave as unexplored.
- **B.** Add to "Future work" section explicitly.
- **C.** Consider shipping a minimal command palette as v1 instead of the header button.

**Your recommendation.** **B.** The spec is right to ship the visible button first (discoverability > elegance for v1). But "Future work" should name the command palette explicitly so the next iteration doesn't build another one-off surface.

---

## [Challenge #11] — Inline-rename-style create is "deferred" with weak justification

**Challenge.** The spec defers inline-create-in-tree to "NOT NOW — Identified" citing "collaborative-edit complexity." That rationale is thin. The tree rows aren't collaborative in the Y.Doc sense — the filename is a client-local edit until Submit. Rename already works inline; "create" is structurally the same operation against an empty row.

**Evidence / reasoning.**
- Rename in the tree works (acceptance criterion: "Existing Rename / Delete menu entries… unchanged"). Inline-create is morphologically identical to rename on a fresh empty row.
- The "collaborative-edit complexity" concern: presumably, what happens if another client creates `foo.md` while User A is typing `foo` inline? Answer: same thing that happens with the dialog — 409 EEXIST from the server on submit. The dialog doesn't make this easier; it just makes the failure happen inside a modal instead of a tree row.
- Inline-create is the dominant modern pattern (VS Code, Finder, macOS, GitHub web). Users expect it.
- Dialogs are heavier: modal overlay, focus trap, escape key, larger hit area disruption. Inline is cheaper at the moment of use.

**Options.**
- **A.** Keep deferred (current spec).
- **B.** Challenge the deferral: build inline-create now. Dialog as fallback (Cmd/Ctrl+Alt+N, wiki-link flow, empty-state CTA).
- **C.** Defer but strengthen the rationale: specifically, the reason is not "collab complexity" but "we don't yet have an inline-editing primitive in the tree" or similar. Be honest about the blocker.

**Your recommendation.** **C in v1, plan B for v2.** The deferral is probably correct for scope reasons, but the stated rationale is weak. "We need to build the inline-input primitive first" is a fine reason; "collab complexity" sounds hand-wavy. If the user wants v1 shipped quickly, keep deferred — but rewrite the rationale so the next iteration knows what's actually blocking.

---

## Summary recommendation table

| # | Decision | Severity | Recommendation |
|---|----------|----------|----------------|
| 1 | D2 composite folder | HIGH | Drop folder or ship real Strategy 1 |
| 2 | D5 blank input | HIGH | Surface to user — U1 may not require this |
| 3 | D1 dropdown | MED-HIGH | Obsidian pattern: single "+" = file, context menu for folder |
| 4 | D8 "new file here" on files | MED | Folder-only context menu |
| 5 | D4 Cmd/Ctrl+Alt+N | MED | Cmd/Ctrl+Shift+N, or focus-scoped single letter |
| 6 | "page" vs "file" vocabulary | MED | Surface to user — pick one |
| 7 | D3 single dialog, kind prop | MED-LOW | Shared wrapper + specialized forms |
| 8 | Mobile silence | LOW | Add to non-goals explicitly |
| 9 | Focus-restore unaddressed | LOW | Add acceptance criteria |
| 10 | Command palette unconsidered | LOW | Add to Future work |
| 11 | Inline-create deferral rationale | LOW | Rewrite rationale, keep deferred |
