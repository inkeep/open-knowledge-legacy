# E6: Known Bugs and Limitations in mdast-util-to-markdown

**Source:** GitHub issues at `syntax-tree/mdast-util-to-markdown`, source code analysis of v2.1.2

## Critical Open Issues

### Issue #12 — Nested Emphasis Round-trip Breakage (OPEN)

**Status:** Open, confirmed by maintainer
**Trigger:** Nested emphasis where delimiter runs interact ambiguously under CommonMark's "rule of three"
**Reproduction:**
```markdown
***emphasis*in emphasis*
```
**Behavior:** Serializer outputs `\***emphasis*in emphasis*`. When re-parsed, the nested emphasis node disappears — AST changes structurally.
**Root cause:** CommonMark's emphasis rules make delimiter runs interdependent. Escaping a marker at one position cascades to how other delimiter runs resolve. The maintainer described it as "pulling a thread somewhere will have something happen somewhere entirely different."
**Scope:** Edge cases with triple-or-more delimiter runs containing nested emphasis. More common in programmatically constructed ASTs than hand-written markdown.
**Workaround:** None within the library. AST producers can avoid generating deeply nested emphasis with abutting delimiter runs.
**Our impact:** LOW — our CRDT editor produces clean nesting from user input; programmatic construction (agent writes) can be constrained.

### Issue #68 — Emoji Characters Cause Broken Output (OPEN)

**Status:** Open, under investigation
**Trigger:** Emoji characters (multi-byte Unicode, surrogate pairs) adjacent to emphasis/strong markers
**Reproduction:** Paragraph with `💡` followed by `**Some tex**t`
**Root cause:** `container-phrasing.js` uses `.slice(0, 1)` and `.charCodeAt(0)` which split surrogate pairs. The half-surrogate gets passed to `encodeCharacterReference()`, producing meaningless encoded output.
**Affected code:**
- `container-phrasing.js` lines 91-93, 107-112 (`.slice()`)
- `emphasis.js` / `strong.js` lines 33/40/43 (`.charCodeAt()`)
**Scope:** Any content with emoji adjacent to emphasis markers — **increasingly common**.
**Workaround:** Ensure emoji are separated from emphasis markers by a space.
**Our impact:** MEDIUM — emoji in content is common. If using mdast-util-to-markdown for serialization, we need to either patch or post-process.

## Resolved Issues (Fixed in v2.1.x)

### Issue #66/65 — Needless Character Reference Escapes (CLOSED, by design)

**Status:** Closed, maintainer considers it working-as-intended
**Trigger:** Since v2.1.1, characters adjacent to `*`/`**` emphasis markers get encoded as HTML character references
**Reproduction:**
```javascript
toMarkdown(fromMarkdown('foo***bar***buz'))
// Output: fo&#x6F;***bar***&#x62;uz
```
**Root cause:** Commit `97fb818` introduced `encodeInfo()` which uses `classifyCharacter()` to determine if boundary characters need encoding for correct emphasis parsing. When a letter abuts a delimiter, it encodes the letter as `&#x<hex>;` to shift its classification from "letter" to "punctuation."
**Purpose:** Fixes Discussion #60 — whitespace inside emphasis (`** bold **`) producing invalid markdown.
**Our impact:** HIGH for source-text fidelity. The character references don't exist in original source. Our pipeline would need a post-processing step to decode unnecessary references, or we'd need to handle serialization ourselves for emphasis-adjacent content.

### Issue #8 — Underscore Escapes in Link URLs (CLOSED, intentional)

**Status:** Closed, intentional behavior
**Trigger:** Underscores in link URLs get backslash-escaped
**Example:** `[text](https://example.com/foo_bar)` → `[text](https://example.com/foo\_bar)`
**Root cause:** URL passed through `state.safe()` which applies phrasing-context unsafe patterns to `_`
**Our impact:** LOW — cosmetic, URLs still work. For fidelity, we'd use angle-bracket destinations or custom handler.

### Issue #53 — Ampersand Escapes in URLs (CLOSED, intentional)

**Trigger:** `&` in URLs gets escaped: `?a=1&b=2` → `?a=1\&b=2`
**Same mechanism as #8.**

### Issue #6 — Empty Lists Become Thematic Breaks (FIXED v1.2.6)

**Trigger:** Three empty nested lists using `+ * -` serialized to `* * *` which re-parses as thematic break.
**Fix:** `bulletOther` option added to alternate bullet characters.

### Issue #25 — Underscore Round-trip Creates False Emphasis (FIXED)

**Trigger:** Parsing `(____` and serializing produced `(\\__\\__` which re-parsed with spurious emphasis.
**Fix:** PR #43 implemented smarter escape logic respecting CommonMark delimiter run rules.

### Issue #62 — Bold with Boundary Spaces (PARTIALLY RESOLVED)

**Trigger:** `**A &#32;**` serializes to `**A **` which re-parses as plain text.
**Status:** Partially addressed by `encodeInfo()` approach in v2.1.1.

## Systemic Round-Trip Fidelity Gaps

1. **Character reference injection** — `encodeInfo()` pipeline converts literal chars to `&#x<hex>;` at emphasis boundaries. These don't survive parse→serialize→parse in the same form.
2. **Underscore/ampersand over-escaping** — `safe()` applies phrasing-context patterns inside URL destinations.
3. **Surrogate pair breakage** — `.slice()`, `.charAt()`, `.charCodeAt()` throughout serializer are not Unicode-aware.
4. **Nested emphasis is fundamentally unsolvable** — The escape-one-character-at-a-time approach in `safe.js` cannot handle interdependent delimiter matching.
5. **Whitespace normalization at emphasis boundaries** — `encodeInfo()` introduces character references not in original source.

## Implications for Our Pipeline

| Issue | Mitigation Strategy |
|-------|-------------------|
| #12 (nested emphasis) | Low risk — editor produces clean nesting |
| #68 (emoji) | Patch `.charCodeAt()` → `.codePointAt()` or use custom emphasis handler |
| #66 (char references) | Use source-text position slicing instead of relying on serializer output for delimiters |
| #8/#53 (URL escaping) | Custom link handler or angle-bracket destinations |
| General round-trip | Source-text fidelity via position-based slicing eliminates most serializer artifacts |
