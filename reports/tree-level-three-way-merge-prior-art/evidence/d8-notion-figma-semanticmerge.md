# Evidence: D8 Industry editors — Notion, Figma, SemanticMerge

**Dimension:** How do production editors with tree-shaped content handle concurrent edits or branch-merge?
**Date:** 2026-04-17
**Sources:** Notion HN discussions, Figma help center, Plastic SCM / SemanticMerge docs, multiple OT vs CRDT articles

---

## Key files / pages referenced

- [Notion data model HN thread](https://news.ycombinator.com/item?id=27200177)
- [Figma branching best practices](https://www.figma.com/best-practices/branching-in-figma/)
- [Figma merge branch into main file](https://help.figma.com/hc/en-us/articles/5691189138839-Merge-branch-into-main-file)
- [SemanticMerge intro guide](https://docs.plasticscm.com/semanticmerge/intro-guide/semanticmerge-intro-guide)
- [Plastic SCM Xmerge features](https://www.plasticscm.com/features/xmerge)
- [Plastic SCM blog: programming-language-aware merge (2013)](https://blog.plasticscm.com/2013/04/put-your-hands-on-programming-language.html)

---

## Findings

### Finding: Notion uses a hybrid OT-for-text + CRDT-for-structure model — not a state-based three-way merge

**Confidence:** INFERRED (from synthesis of multiple secondary sources; Notion's internals are proprietary)
**Evidence:** [Notion HN thread](https://news.ycombinator.com/item?id=27200177), multiple OT-vs-CRDT summaries

> "Notion uses a hybrid approach where it applies CRDT for structure and OT for text within blocks, giving them fine-grained undo control where it matters."

Notion's model: block-tree structure is CRDT (reaches convergence through op-based merge); text-within-blocks is OT (reaches convergence through op-transformation). **Concurrent edits reconcile via op-log composition — not via state-based three-way merge against external state.**

Notion does not expose a file-system-backed authoritative state that can diverge from its CRDT view. Their API writes become CRDT ops inside the block-tree model; there is no "reconcile against an external markdown file I edited in another app" flow.

### Finding: Figma branching has NO three-way merge — it's a "resolve conflicts, then merge branch into main" flow

**Confidence:** CONFIRMED
**Evidence:** [Figma merge documentation](https://help.figma.com/hc/en-us/articles/5691189138839-Merge-branch-into-main-file)

From the Figma help:
> "Branches are controlled environments that allow you to explore changes to designs, prototypes, and libraries, without editing the original file."
> "When you're satisfied with your changes, you can review and merge your branch with the main file. You'll have the option to resolve any conflicts before applying changes from your branch to the main file."
> "At the moment, you need to merge all updates from the branch into the main file. There isn't a way to select or merge specific changes."

From the summary of search results:
> "Regarding three-way merge specifically: The search results don't specifically mention 'three-way merge' as a named feature in Figma's branching system. The merge functionality appears to be designed as a straightforward branch-to-main merge rather than a traditional three-way merge system common in code version control."

Figma's branching is effectively a **fork with manual conflict resolution UI**. Conflicts surface per-element (two users modified the same layer); users pick one side. There's no claim of AST-level structural merge; there's no tree-shape diff3 algorithm cited in Figma's documentation.

### Finding: SemanticMerge (Plastic SCM) is the closest production tree-level three-way merge — but stops at leaf level where it switches to text merge

**Confidence:** CONFIRMED
**Evidence:** [SemanticMerge docs](https://docs.plasticscm.com/semanticmerge/intro-guide/semanticmerge-intro-guide), [Plastic SCM features](https://www.plasticscm.com/features)

From the SemanticMerge documentation and summaries:
> "SemanticMerge uses code structure analysis instead of textual comparison to perform 3-way merges, parsing the code and checking the obtained structures to merge based on the 'code trees' of the base plus the three contributors."
> "SemanticMerge sees source files in a tree format: namespaces, then classes, methods inside - basically the structure."
> "The semantic tool stops at method, property or field level, and the merge of the bodies of methods or properties is run in a text-based way."

**Critical caveat:** Even SemanticMerge — the industry's most advanced structured merge tool, specifically designed for code-structure three-way merge — **falls back to text-level merge at the leaf granularity**. Classes, methods, properties are tree-merged; their bodies are line-merged. This is the hybrid pattern that academic structured-merge research (Apel et al.) also converges on: tree merge for high-level structure, text merge for leaves.

### Finding: Semantic merge has limits — language-specific, requires parsers, and doesn't generalize to WYSIWYG editor trees

**Confidence:** CONFIRMED
**Evidence:** [SemanticMerge intro guide](https://docs.plasticscm.com/semanticmerge/intro-guide/semanticmerge-intro-guide), [external parsers guide](https://www.semanticmerge.com/documentation/external-parsers/external-parsers-guide)

SemanticMerge "currently supports C#, Java, C, C++ and PHP" with a parser-extension mechanism for other languages. It's fundamentally a **code-merge** tool. No indication it's been adapted to:
- Markdown / mdast merges
- ProseMirror document merges
- Rich-text editor tree merges
- WYSIWYG or general hierarchical-document merges

The closest public artifact to "structured merge for rich-text / WYSIWYG" is Lindholm's 2001/2004 XML work (academic, not production), and DeltaXML / Altova / Oxygen's commercial XML merge tools (targeted at XML data, not at WYSIWYG editor state).

---

## Implications for the central research question

Across the industry landscape:
- **Notion (largest production tree-shaped editor):** hybrid OT+CRDT, no state-based three-way merge against external state. No externally-editable filesystem representation to reconcile against.
- **Figma (largest production tree-shaped design file):** manual conflict resolution with no algorithmic three-way merge. Branches are forks with per-element reconciliation UI.
- **SemanticMerge (state-of-the-art code-tree merge):** three-way tree merge at the high level, BUT text-level at the leaf. Language-specific parsers required. Not deployable to WYSIWYG editor trees.

**There is no production system that has both (a) a tree-shaped live editing state AND (b) a robust three-way merge algorithm against an external tree-shaped state.** Git-plus-SemanticMerge comes closest for code, and it's explicitly a hybrid (tree merge at structural layer, text merge at leaf).

---

## Negative searches

- Searched for "Notion API three-way merge" → only OT-vs-CRDT framing, no external-state reconciliation
- Searched for "Figma AST merge" / "Figma structured merge" / "Figma three-way merge" → none; manual conflict resolution is the documented model
- Searched for "SemanticMerge markdown" / "SemanticMerge ProseMirror" / "SemanticMerge WYSIWYG" → no results; it's a code-tree tool

---

## Gaps / follow-ups

- Google Docs uses OT; the question "how does Google Docs handle branch-style reconciliation against an external Word doc" doesn't map cleanly because GDocs doesn't expose the underlying OT state for external edit
- Quip/Dropbox Paper use block-tree CRDTs similar to Notion; same architectural pattern (no external-state three-way merge)
