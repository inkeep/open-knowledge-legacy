---
dimension: D1.2 — Mutation operators on parser-shaped code
date: 2026-04-19
sources: stryker-mutator.io/docs, github.com/stryker-mutator/weapon-regex, academic papers (arxiv, Wiley STVR, ACM ISSTA)
---

# Evidence: D1.2 — Mutation Operators on Parser-Shaped Code

## Key files / pages referenced

- [Stryker Supported Mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)
- [Stryker Mutant States and Metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
- [Stryker TypeScript Checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/)
- [weapon-regex README](https://github.com/stryker-mutator/weapon-regex/blob/main/README.md) — 21 regex operators
- [Arcaini et al. 2019 — Fault-based regex test generation](https://onlinelibrary.wiley.com/doi/abs/10.1002/stvr.1664)
- [Groce et al. 2018 — Universal Mutator](https://mir.cs.illinois.edu/marinov/publications/GroceETAL18UniversalMutator.pdf)
- [Kaufmann et al. 2024 — Equivalent mutant classification](https://arxiv.org/html/2404.09241v1)
- [Chen et al. 2024 — Equivalent Mutants in the Wild](https://dl.acm.org/doi/10.1145/3650212.3680310)

---

## Findings

### Finding: Stryker-js ships 15 mutator categories + 21 regex sub-operators
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)

| Category | Example |
|---|---|
| **ArithmeticOperator** | `a + b` → `a - b`; `a * b` → `a / b`; `a % b` → `a * b` |
| **ArrayDeclaration** | `[1,2,3,4]` → `[]`; `new Array(1,2,3,4)` → `new Array()` |
| **BlockStatement** | `function x() { doThing(); }` → `function x() {}` |
| **BooleanLiteral** | `true` → `false`; `!expr` → `expr` (not-removal) |
| **ConditionalExpression** | `if (a > b)` → `if (true)` / `if (false)`; loop conds forced to `false` |
| **EqualityOperator** | `<` ↔ `>=`, `<=` ↔ `<`, `===` ↔ `!==` |
| **LogicalOperator** | `&&` ↔ `\|\|`, `??` ↔ `&&` |
| **MethodExpression** | `endsWith` ↔ `startsWith`; `toUpperCase` ↔ `toLowerCase`; `.filter` removal |
| **ObjectLiteral** | `{ foo: 'bar' }` → `{}` |
| **OptionalChaining** | `foo?.bar` → `foo.bar`; `foo?.()` → `foo()` |
| **Regex** (weapon-regex, 21 operators) | see below |
| **StringLiteral** | `"foo"` → `""` |
| **UnaryOperator** | `+a` → `-a`; `-a` → `+a` |
| **UpdateOperator** | `a++` → `a--`; `++a` → `--a` |

Regex sub-operators (21, from [weapon-regex](https://github.com/stryker-mutator/weapon-regex/blob/main/README.md)): BOLRemoval, EOLRemoval, BOL2BOI, EOL2EOI, CharClassNegation, CharClassChildRemoval, CharClassAnyChar, CharClassRangeModification, PredefCharClassNegation, PredefCharClassNullification, PredefCharClassAnyChar, UnicodeCharClassNegation, QuantifierRemoval, QuantifierNChange, QuantifierNOrMoreModification, QuantifierNOrMoreChange, QuantifierNMModification, QuantifierShortModification, QuantifierShortChange, QuantifierReluctantAddition, GroupToNCGroup, LookaroundNegation.

### Finding: Mutation score denominator excludes `CompileError` mutants
**Confidence:** CONFIRMED
**Evidence:** [Stryker Mutant States and Metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)

```
mutation_score = detected / valid * 100
valid = total - invalid    # invalid = CompileError + RuntimeError
```

TypeScript mutants that don't type-check are excluded. Practical consequence for TS parsers: stricter tsconfig ejects more mutants upstream, so reported scores may appear higher on TS vs. equivalent JS.

### Finding: High-signal mutators for identity/round-trip parser oracles
**Confidence:** INFERRED (from mutator semantics applied to parser code shape; no published domain-ranking study)
**Evidence:** Synthesis of Stryker mutator docs + standard parser code patterns

| Mutator | Parser code site | Why high signal vs. round-trip oracle |
|---|---|---|
| **EqualityOperator** | `pos < input.length`, `tokenType === X`, `depth <= max` | Flipping `<` ↔ `<=` produces off-by-one; identity oracle catches mis-slices on boundary inputs |
| **ArithmeticOperator** | `input.slice(i, i + n)`, `pos += len` | `+` ↔ `−` in index math almost always breaks round-trip |
| **ConditionalExpression** | Token dispatch: `if (token.type === 'heading')` | Forcing to `true`/`false` unconditionally admits or drops a token class |
| **UpdateOperator** | `pos++`, `depth++` in state machines | Parser can't advance or unwinds nesting backward |
| **LogicalOperator** | Guard clauses: `if (isOpen && !escaped)` | Admit/reject flip on delimiter handling |
| **BooleanLiteral / not-removal** | Escape flags: `escaped`, `inCodeBlock` | Inverts entire escape-handling branch |
| **StringLiteral → ""** | Delimiters in serializer: `"**"`, `"`"`, `"\n"` | Serializer emits empty marker → parser can't reconstruct |
| **Regex operators** | Lexer patterns: `/^#+ /`, `/\s+/` | Anchor removal, quantifier change affect token boundary detection; **but highest equivalent-mutant rate** (see below) |
| **MethodExpression** | `startsWith` ↔ `endsWith`, `toUpperCase` ↔ `toLowerCase` | Directly flips scanner delimiter detection |
| **BlockStatement** | Switch-case body for token class | Emptying a dispatch branch catastrophically breaks round-trip |

**Lower-signal in this domain:** ArrayDeclaration, ObjectLiteral, OptionalChaining removal (surfaces as runtime error; still detected but coarse), UnaryOperator (rare in parsers).

### Finding: No published mutation-score benchmark for markdown/AST parsers in TS/JS
**Confidence:** NOT FOUND (after searching arxiv, Stryker blog, dev.to, medium, GitHub)
**Evidence:** Negative search results + Stryker's own refusal to publish a threshold

> "The higher, the better!" — [Stryker mutant-states-and-metrics docs](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)

Third-party tutorials citing "80% is good" (e.g., oneuptime.com example reports `parser.ts` at 90%, aggregate 92.45%) are tutorial examples, not production benchmarks. Do not treat as baseline.

### Finding: Equivalent-mutant rate is elevated for parser code — 6 specific patterns
**Confidence:** INFERRED (pattern synthesis; backed by Kaufmann et al. 2024 for general rates)
**Evidence:** [Kaufmann et al. 2024, arxiv:2404.09241](https://arxiv.org/html/2404.09241v1)

Kaufmann et al. report humans correctly classified ~64% of equivalent mutants vs. ~92% non-equivalent — i.e., equivalence is hard to detect and common. Parser-specific equivalence hotspots:

**A. Regex mutations with semantically identical alternatives.** `[abc]` → `[\w\W]` (`CharClassAnyChar`) in a position where surrounding grammar already restricts matching admits the same inputs. `(abc)` → `(?:abc)` (`GroupToNCGroup`) when the capture group isn't consumed. **Very common** in parsers that use capturing groups for readability without downstream capture use.

**B. Short-circuited logical operators.** `if (cache[key] && expensiveCheck(key))` → `if (cache[key] || expensiveCheck(key))` survives whenever cache is always populated. Common in memoized tokenizers.

**C. Pretty-printing / whitespace-only serializer outputs.** `"**" + text + "**"` vs. `"__" + text + "__"` may pass through a remark round-trip if the config normalizes emphasis style. StringLiteral mutation survives because the oracle tolerates variant renderings.

**D. Dead branches / defensive code.** BlockStatement emptying of an "impossible" error branch (`if (!node) throw`) that property-based generators never reach.

**E. Off-by-one that identity-oracle can't reach.** EqualityOperator flips on boundary checks in code paths whose shrinking generator never hits the boundary. If fast-check generates only lengths ≥ 2, flipping `length < 2` ↔ `length <= 2` survives.

**F. Idempotent string operations.** MethodExpression swap `toUpperCase` ↔ `toLowerCase` on input that is already ASCII-lowercase and only used for case-insensitive comparison.

### Finding: Academic mutation testing research on parsers/regex exists but is not TS-specific
**Confidence:** CONFIRMED
**Evidence:** Three canonical papers

- Arcaini et al., "Fault-based test generation for regular expressions by mutation" ([Wiley STVR 2019, DOI 10.1002/stvr.1664](https://onlinelibrary.wiley.com/doi/abs/10.1002/stvr.1664)) — mutation testing methodology for regex
- Groce et al., "Universal Mutator: regex-based multi-language tool" ([paper PDF](https://mir.cs.illinois.edu/marinov/publications/GroceETAL18UniversalMutator.pdf)) — cross-language tool
- Chen et al., "Equivalent Mutants in the Wild" ([DOI 10.1145/3650212.3680310](https://dl.acm.org/doi/10.1145/3650212.3680310)) — general equivalent-mutant prevalence

None publish headline mutation scores for markdown / unified / remark / ProseMirror-shaped pipelines.

---

## Negative searches

- "mutation testing markdown parser" on arxiv → no hits
- "stryker mutation score remark / unified / markdown-it / prosemirror" on Google + site:github.com → no hits
- Stryker dashboard.stryker-mutator.io search for markdown-adjacent projects → no hits as of 2026-04-19

---

## Gaps / follow-ups

- Empirical mutator-signal ranking specific to TS parsers would require running Stryker against a sample markdown parser corpus.
- Equivalent-mutant rate for parsers vs. business logic: no published ratio.
