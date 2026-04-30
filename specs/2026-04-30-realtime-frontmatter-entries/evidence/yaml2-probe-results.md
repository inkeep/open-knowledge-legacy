---
date: 2026-04-30
sources:
  - "yaml@2.8.3 (cached at ~/.bun/install/cache)"
  - "$TMPDIR/yaml-probe.ts (inline probe, see SPEC.md §10 D4 + A1 + A6)"
type: probe-result
---

# yaml@2 probe results — A1 (comment preservation) + A6 (dup-key emission)

Both probes ran inline against `yaml@2.8.3` (current pinned version per `bun.lock`).

## A1 — Comment preservation under Pair reorder

**Probe:** parse YAML containing top-level comment, inline trailing comment, blank-line-then-comment, and trailing comment; round-trip without reorder; then move the third Pair to position 0 via `doc.contents.items.splice` + `unshift`; re-stringify.

**Result:** PASS with documented caveat.

- **Round-trip without reorder:** preserved cleanly. Only normalization is whitespace on the inline trailing comment (`Aang  # inline trailing` → `Aang # inline trailing`). Acceptable.
- **After moving `born` to position 0:**
  - The comment **above** `born` (`# blank-line then this comment`) traveled with the Pair — appears immediately above `born` in the new position. ✓
  - The inline trailing comment on `title` (` # inline trailing`) traveled with `title`. ✓
  - The document-start comment (`# top-level comment`) did not move; it now appears between `born` and `title` because `born` was inserted before it. **Caveat — acceptable.** Document-start free-floating comments are rare in frontmatter; user-attached "comment above key X" comments do travel correctly.
  - The trailing document-end comment stayed at the end. ✓

**Verdict:** A1 holds for the common frontmatter cases (comment-above-key, inline trailing). Document-start free-floating comments may shift if reorder moves a key to position 0; this is an edge case worth noting in the implementation but does not block D12 (full-region replace on drop).

**Promote A1 from MED to HIGH confidence.**

## A6 — Duplicate-key emission

**Probe:** parse YAML containing two `title:` lines via `parseDocument`; observe `doc.contents.items.length`; call `doc.toString()`. Also: programmatically construct `Document` with two same-key `Pair`s.

### First attempt (default options)

```
Errors: 1 (DUPLICATE_KEY)
doc.toString() throws: "Document with errors cannot be stringified"
```

yaml@2's default behavior: `uniqueKeys: true`. Detects duplicate keys at parse time and refuses to stringify a Document with errors.

### Second attempt (`uniqueKeys: false` explicit option)

```
Errors: 0
doc.contents.items.length = 3   // both titles preserved
doc.toString() = "title: original\ndescription: foo\ntitle: duplicate\n"
```

Programmatic construction also succeeds:

```
new Document(undefined, { uniqueKeys: false })
// then map.items.push two same-key Pairs
// → toString() emits both lines, no error
```

Round-trip parse of the dup-key output:

```
parseDocument(output, { uniqueKeys: false })
items.length = 3
toJSON() = {"title": "second", "description": "foo"}   // last-wins via Map identity
```

**Verdict:** A6 holds **with the explicit `uniqueKeys: false` option** at every parseDocument call site in the new binding + region helpers. yaml@2 emits both lines, downstream readers see last-wins via `toJSON()`, but iterating `doc.contents.items` gives both entries — exactly the behavior D17/D18 need.

**Spec implication:** D4 (`yaml@2.x parseDocument` for the FM region) needs to specify `uniqueKeys: false` as a binding-level convention. Without this, the predecessor's default-strict behavior would re-engage and silently fail dup-name handling.

**Promote A6 from MED to HIGH confidence, conditional on the `uniqueKeys: false` option being set everywhere FM YAML is parsed in the new binding.**

## Spec actions from these probes

1. **D4 update:** add `{ uniqueKeys: false }` as the canonical option for FM-region `parseDocument` calls in the new binding and `frontmatter-region.ts`. Out-of-binding parsers (e.g. `page-identity.ts` regex reader, MCP edit-document) are unaffected — they don't go through `parseDocument`.
2. **A1 / A6 promote to HIGH:** both can move from `MED` to `HIGH` in §12 with this evidence cited.
3. **Edge case to test in D24 (PBT layer):** reorder of a key currently at position 0 with a document-start comment — verify the resulting comment placement is acceptable (comment may shift to between Pairs but does not vanish).

## Probe scripts

Probe 1 (A1): `$TMPDIR/yaml-probe.ts`
Probe 2 (A6): `$TMPDIR/yaml-probe2.ts`

Both are <60 LOC and would land in `packages/core/src/frontmatter/yaml-codec.test.ts` as `describe('yaml@2 dup-key + comment behavior')` cases during implementation.
