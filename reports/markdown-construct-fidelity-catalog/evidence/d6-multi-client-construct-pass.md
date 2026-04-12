# Evidence: D6 — Multi-client concurrent construct fidelity

**Dimension:** D6 — Multi-client concurrent construct fidelity
**Type:** synthesis
**Date:** 2026-04-11
**Sources:** D1 construct catalog (118-case baseline), D4 Layer A/B equivalence, Yjs CRDT merge semantics
**Library versions:** `@tiptap/markdown@^3.22.3`, `@tiptap/core@^3.22.3`, `@tiptap/y-tiptap@^3.0.3`, `yjs@^13.6.30`
**Baseline commit:** 2d35736

---

## TLDR

**Does multi-client concurrent editing change construct fidelity?** No. All 30 constructs tested — including every P0 entity-corruption case, every backslash-escape content-loss case, complex structural constructs (nested lists, tables, blockquotes), non-idempotent constructs, and custom extensions — produce **IDENTICAL_TO_SINGLE_CLIENT** fidelity after CRDT merge. Zero convergence failures. Zero additional corruption.

The CRDT layer (`Y.Doc` + `updateYFragment` + `yXmlFragmentToProsemirrorJSON`) is a complete pass-through for construct-level fidelity, whether one client or two. All bugs remain at the `@tiptap/markdown` serializer layer.

---

## Methodology

### Two-client manual-sync harness

The probe uses two `Y.Doc` instances (clientA, clientB) with manual bidirectional sync via `Y.encodeStateAsUpdate` / `Y.applyUpdate`. No Hocuspocus server, no WebSocket, no observers — this isolates the CRDT merge semantics from all other infrastructure.

**Five-phase protocol per construct:**

1. **Load:** Parse construct markdown via `mdManager.parse` + `schema.nodeFromJSON` + `updateYFragment` into clientA's `Y.XmlFragment('default')`.
2. **Initial sync:** `Y.encodeStateAsUpdate(docA)` → `Y.applyUpdate(docB, ...)` — both clients start with identical content.
3. **Concurrent edit:** Each client applies a different modification to the construct (e.g., clientA appends "alpha", clientB appends "beta") via `updateYFragment` — NO sync during this phase. This simulates a network partition where both clients edit independently.
4. **Merge:** Bidirectional sync — `A→B` then `B→A` via `Y.encodeStateAsUpdate` / `Y.applyUpdate`. Yjs CRDT semantics resolve conflicts deterministically.
5. **Verify:** Serialize from both clients via `yXmlFragmentToProsemirrorJSON` + `mdManager.serialize`. Check convergence (A = B) and compare to single-client baseline.

### Concurrent edit design

Each construct has hand-crafted concurrent edits that exercise realistic conflict scenarios:

- **Heading/paragraph content:** Both clients modify the same text node (clientA adds "alpha"/"updated", clientB adds "beta"/"revised")
- **Table cells:** Each client modifies a different cell in the same row
- **Nested lists:** Each client modifies a different nesting level
- **Structural:** One modifies the heading, the other modifies the paragraph
- **Code blocks:** Each client adds a different line

### Classification scheme

| Label | Meaning |
|---|---|
| `IDENTICAL_TO_SINGLE_CLIENT` | Multi-client merge fidelity == single-client round-trip fidelity. Same bugs, same output characteristics. |
| `ADDITIONAL_LOSS` | CRDT merge introduces new corruption beyond what single-client already produces. Entity encoding, content loss, or structural damage that only appears under concurrent edit. |
| `CONVERGES_DIFFERENTLY` | After bidirectional sync, clientA and clientB see different final states. Yjs convergence guarantee violated (would indicate a Yjs bug). |

### Comparison methodology

For `IDENTICAL_TO_SINGLE_CLIENT` classification, we verify:
1. Both clients converge to identical content after merge (Yjs convergence guarantee)
2. Entity corruption patterns (`&amp;`, `&lt;`, `&gt;`) in merged output match what single-client already produces — no NEW entity encoding introduced by merge
3. Word-level content preservation — merged output contains the union of both clients' edits, with no unexpected content loss beyond natural CRDT conflict resolution

---

## Tested construct subset (30 cases)

### Selection rationale

Focused on the **worst candidates for multi-client divergence** from D1/D3:

| Category | Count | Why selected |
|---|---|---|
| `entity-corruption` | 10 | All P0 cases — `&`, `<`, `>`, named entities, HTML blocks. If CRDT merge compounds the entity bug, these would show it. |
| `backslash-escape` | 4 | All P0 content-loss cases — `\*`, `\_`, `\[`, `\#`. If merge amplifies the content drop, these would show it. |
| `structural` | 5 | Nested lists (2/3 levels), list-containing-code, blockquote-with-heading, heading+paragraph. Complex tree structures most likely to fragment under concurrent edit. |
| `gfm-extension` | 2 | Table (complex cell structure) + task list. Tables are the most structurally complex GFM construct. |
| `non-idempotent` | 1 | Inline code with backticks — the only non-trivial non-idempotent case from D5. |
| `custom-extension` | 2 | Wiki-links (bare + alias) — our custom extensions. |
| `commonmark-block` | 3 | Heading, code block with lang, code block with `&` in content. Regression baseline. |
| `commonmark-inline` | 2 | Nested emphasis, link reference. Regression baseline. |
| `char-content` | 1 | Unicode emoji. Regression baseline. |

**Coverage of D3 P0 hit list:** 14/14 P0 items covered (10 entity + 4 backslash escape).

---

## Classification results

| # | Construct | Category | Classification | Converged | Notes |
|---|---|---|---|---|---|
| 1 | ampersand-in-heading | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | `&amp;` present in both single and multi-client — same bug |
| 2 | ampersand-in-paragraph | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | Same `&amp;` corruption, no amplification |
| 3 | lt-gt-in-paragraph | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | `&lt;`/`&gt;` identical to single-client |
| 4 | ampersand-in-link-text | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | Link text entity encoding unchanged |
| 5 | ampersand-in-table-cell | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | Table cell `&amp;` unchanged |
| 6 | html-block-div | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | HTML→entity escaping unchanged |
| 7 | html-inline-span | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | Inline HTML escaping unchanged |
| 8 | html-br | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | `<br>` escaping unchanged |
| 9 | named-entity-copy | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | `&amp;copy;` double-encoding unchanged |
| 10 | named-entity-mdash | entity-corruption | IDENTICAL_TO_SINGLE_CLIENT | Y | `&amp;mdash;` double-encoding unchanged |
| 11 | backslash-escape-asterisk | backslash-escape | IDENTICAL_TO_SINGLE_CLIENT | Y | Content loss identical to single-client |
| 12 | backslash-escape-underscore | backslash-escape | IDENTICAL_TO_SINGLE_CLIENT | Y | Same |
| 13 | backslash-escape-bracket | backslash-escape | IDENTICAL_TO_SINGLE_CLIENT | Y | Same |
| 14 | backslash-escape-hash | backslash-escape | IDENTICAL_TO_SINGLE_CLIENT | Y | Same |
| 15 | nested-list-2-levels | structural | IDENTICAL_TO_SINGLE_CLIENT | Y | Both clients' edits preserved in correct nesting levels |
| 16 | nested-list-3-levels | structural | IDENTICAL_TO_SINGLE_CLIENT | Y | Three-level nesting survives merge |
| 17 | list-containing-code | structural | IDENTICAL_TO_SINGLE_CLIENT | Y | Code block inside list survives merge |
| 18 | blockquote-with-heading | structural | IDENTICAL_TO_SINGLE_CLIENT | Y | Heading in blockquote survives merge |
| 19 | heading-then-paragraph | structural | IDENTICAL_TO_SINGLE_CLIENT | Y | Each client edits different block; clean merge |
| 20 | gfm-table-simple | gfm-extension | IDENTICAL_TO_SINGLE_CLIENT | Y | Different cells merged correctly |
| 21 | gfm-task-list | gfm-extension | IDENTICAL_TO_SINGLE_CLIENT | Y | Each item edited separately; clean merge |
| 22 | inline-code-with-backticks | non-idempotent | IDENTICAL_TO_SINGLE_CLIENT | Y | Non-idempotent at mdManager level, but CRDT merge doesn't worsen it |
| 23 | wikilink-bare | custom-extension | IDENTICAL_TO_SINGLE_CLIENT | Y | Wiki-link preserved through merge |
| 24 | wikilink-with-alias | custom-extension | IDENTICAL_TO_SINGLE_CLIENT | Y | Alias preserved through merge |
| 25 | atx-heading-h2 | commonmark-block | IDENTICAL_TO_SINGLE_CLIENT | Y | Clean merge |
| 26 | code-block-with-lang | commonmark-block | IDENTICAL_TO_SINGLE_CLIENT | Y | Both clients' new lines appear in code block |
| 27 | code-block-with-ampersand | commonmark-block | IDENTICAL_TO_SINGLE_CLIENT | Y | `&` preserved in code block (not entity-encoded, as expected) |
| 28 | emphasis-nested | commonmark-inline | IDENTICAL_TO_SINGLE_CLIENT | Y | Nested bold/italic survives merge |
| 29 | link-reference | commonmark-inline | IDENTICAL_TO_SINGLE_CLIENT | Y | Reference→inline inlining still happens (same as single-client) |
| 30 | unicode-emoji | char-content | IDENTICAL_TO_SINGLE_CLIENT | Y | Emoji preserved through merge |

### Aggregate

| Classification | Count | % |
|---|---|---|
| `IDENTICAL_TO_SINGLE_CLIENT` | 30 | 100% |
| `ADDITIONAL_LOSS` | 0 | 0% |
| `CONVERGES_DIFFERENTLY` | 0 | 0% |

---

## Constructs where multi-client is worse than single-client

**None.** Zero additional loss across all 30 tested constructs. The CRDT merge does not introduce, amplify, or compound any fidelity bug that isn't already present in the single-client path.

### Key observations

1. **Entity corruption is idempotent through merge.** The `&amp;` encoding happens at `mdManager.serialize` time — by the time two clients' edits merge at the Y.Doc level, the text content is already in its pre-serialization form. CRDT merge operates on the text content, not on the serialized markdown. So the entity bug fires exactly once during final serialize, same as single-client.

2. **Backslash-escape content loss happens at parse time, not merge time.** The `\*` → `*` → `` content drop happens when `mdManager.parse` first processes the input. By the time the content reaches Y.Doc, the backslash and escaped character are already gone. CRDT merge can't compound what's already lost.

3. **Yjs convergence guarantee holds for all tested constructs.** After bidirectional sync, both clients have byte-identical serialized output. Zero convergence failures.

4. **CRDT merge correctly unions concurrent edits.** Both clients' additions appear in the merged output (e.g., "alpha" and "beta" both present). The merge is additive, not destructive.

5. **Complex structural constructs survive merge.** Nested lists, tables, code blocks inside lists, headings inside blockquotes — all merge cleanly with both clients' edits preserved at the correct structural level.

---

## Implications for D3 test priority ranking

**No change.** The D3 P0 hit list remains correct as-is. Multi-client does not introduce new failure modes that would change priority rankings. All P0 bugs (entity corruption, backslash escape) are `@tiptap/markdown`-layer bugs that fire identically regardless of how many clients contributed to the content.

**Test design implication:** Integration tests for multi-client construct fidelity are **not needed** as a separate test tier. The existing Layer A/B tests (D4) and the proposed P0 tightened assertions (D3) are sufficient. Multi-client integration tests add value for **timing, concurrency, and observer semantics** — not for construct-level fidelity.

---

## Gaps / follow-ups

- **Edit-same-character conflicts not tested.** Our concurrent edits modify different parts of the construct (e.g., clientA edits a heading, clientB edits the paragraph). We did NOT test both clients editing the same character range simultaneously. This is a deeper CRDT resolution scenario that could theoretically produce different fidelity outcomes — but it would affect character ordering, not construct-level fidelity.
- **Observer B interaction not tested.** This probe tests raw Y.Doc merge without the Observer A/B bidirectional sync pipeline. In production, Observer B's `updateYFragment` runs on text changes, which could interact with CRDT-merged content differently. This is a timing/ordering concern covered by the bridge-matrix integration tests, not a construct-fidelity concern.
- **Three or more concurrent clients not tested.** Yjs is designed for N-client convergence, and 2-client is sufficient to verify CRDT semantics, but we did not test 3+ clients.
- **Non-idempotent construct coverage is thin** (1/3 cases). The other 2 non-idempotent cases (html-block-div, frontmatter-yaml) were tested only as entity-corruption cases, not specifically for idempotence interaction with merge.

---

## Pointers

- `d6-multi-client-probe.ts` — the reproduction script (30 constructs, 5-phase protocol)
- `d1-construct-catalog.md` — 118-case single-client baseline this extends
- `d3-hit-list-ranked.md` — P0/P1 priority ranking (unchanged by D6 findings)
