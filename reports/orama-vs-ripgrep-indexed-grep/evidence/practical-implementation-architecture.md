# Evidence: Practical Implementation Architecture

**Dimension:** D5 — Practical implementation of enriched_grep
**Date:** 2026-04-02
**Sources:** Analysis of Orama internals, ripgrep architecture, code search systems, ChromaFs

---

## Key files / pages referenced

- /Users/edwingomezcuellar/reports/orama-deep-dive/REPORT.md — Orama v3 source-code analysis
- https://cursor.com/blog/fast-regex-search — Cursor's two-stage architecture
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs pattern
- https://swtch.com/~rsc/regexp/regexp4.html — Trigram-to-regex conversion theory

---

## Findings

### Finding: An enriched_grep backed by Orama would need 3 distinct code paths based on pattern type
**Confidence:** INFERRED
**Evidence:** Analysis of pattern types vs Orama capabilities

**Path 1: Simple term queries (Orama can help)**
Pattern: `"config"`, `"database"`, `"migration"`
- Extract literal terms from regex
- Query Orama for documents containing those terms
- Run regex on candidate documents only
- Speedup: significant (skip files without terms)

**Path 2: Multi-term regex (Orama can partially help)**
Pattern: `"database.*migration"`, `"import.*from"`, `"function\s+\w+"`
- Extract literal substrings from regex (e.g., "database" and "migration")
- Query Orama for documents containing ALL extracted terms (AND)
- Run regex on candidates
- Speedup: moderate (Orama reduces candidates, but false positive rate higher)

**Path 3: Complex regex (Orama cannot help — fall back to ripgrep)**
Pattern: `"\b\d{3}-\d{4}\b"`, `"[A-Z][a-z]+(?=[^a-z])"`, `"(.)\1{2,}"`
- No useful literal substrings to extract
- Must scan all files
- Fall back to running ripgrep directly (or equivalent linear scan)
- Speedup: none (index is useless for these patterns)

### Finding: The literal extraction problem is well-solved but Orama's tokenizer doesn't match
**Confidence:** CONFIRMED
**Evidence:** Russ Cox trigram paper, Orama source code analysis

Trigram indexes extract overlapping 3-char substrings from both content and query. This works because trigrams capture arbitrary substrings including punctuation and whitespace.

Orama's BM25 index is fundamentally different:
- Tokenizes on word boundaries (splits on spaces, punctuation)
- Applies stemming (e.g., "functions" → "function")
- May remove stop words (e.g., "if", "the", "for")
- Stores tokens, NOT character-level substrings

This means:
- `rg "function"` → Orama can find docs with token "function" ✓
- `rg "func"` → Orama CANNOT find docs with substring "func" (not a full token) ✗
- `rg "if"` → Orama may have removed "if" as a stop word ✗
- `rg "hello_world"` → Orama may tokenize this differently than expected ✗

**Implication:** Orama's BM25 index is a POOR match for grep-style substring matching. A trigram index would be far more appropriate.

### Finding: A practical architecture would look like this
**Confidence:** INFERRED
**Evidence:** Synthesis of all code search system architectures

```
enriched_grep(pattern, path, options):
  1. Parse regex pattern
  2. Extract literal fragments (using regex-to-literals analysis)
  3. Decision:
     a. If good literals found (≥3 chars, specific):
        - Query Orama/index for candidate files containing those literals
        - For each candidate: load content, run regex line-by-line
        - Collect matches with line numbers + context
     b. If no good literals (complex regex, short patterns):
        - Fall back to ripgrep (spawn `rg` subprocess)
        - Parse ripgrep output
     c. For any match set:
        - Enrich with: frontmatter metadata, section headings, relevance score
        - Format as ripgrep-compatible output (or enriched format)
  4. Apply head_limit, offset
  5. Return formatted results
```

### Finding: The enrichment layer (not the index) is the actual value add over ripgrep
**Confidence:** INFERRED
**Evidence:** Analysis of what Claude Code's Grep tool misses

ripgrep returns: `filename:line:content`

An enriched grep could return:
- ripgrep-compatible base output (for backward compatibility)
- PLUS: document title (from frontmatter)
- PLUS: section heading the match falls under
- PLUS: BM25 relevance score for the document
- PLUS: document summary/description
- PLUS: related documents (by embedding similarity)

This enrichment is valuable for agent tools regardless of whether the underlying search uses an index. The index is a performance optimization; the enrichment is a capability upgrade.

### Finding: At 1,000 markdown files, the index provides negligible speedup but enrichment is still valuable
**Confidence:** INFERRED
**Evidence:** Performance analysis

At 1,000 files:
- ripgrep: ~15-50ms (fast enough)
- Orama BM25 → filter → regex: ~5ms (Orama) + ~2-10ms (regex on candidates) = ~7-15ms
- Savings: 5-35ms — not perceptible to the user

The index-backed grep becomes valuable at 10K+ files. Below that, the real value is enrichment (frontmatter, section headings, relevance), not speed.

### Finding: Edge cases that would break an Orama-backed grep
**Confidence:** CONFIRMED
**Evidence:** Analysis of grep use patterns

1. **Binary files:** ripgrep detects and skips binary files. Orama has no binary detection.
2. **Encoding issues:** ripgrep handles UTF-8/non-UTF-8 gracefully. Orama assumes text.
3. **Regex features Orama can't filter:** Lookahead, backreferences, anchors, byte-level patterns.
4. **Empty pattern / very broad patterns:** `rg "."` matches everything — Orama can't help.
5. **Inverted matches (`-v`):** ripgrep's `--invert-match` has no Orama equivalent.
6. **Multiline patterns:** ripgrep's `-U` mode spans lines — Orama's per-document search can help identify candidates but not verify.
7. **Symlinks, special files:** ripgrep handles these; Orama indexes what you give it.

---

## Gaps / follow-ups

* The literal extraction from regex is a solved problem (see Russ Cox's paper) but no TypeScript library exists for it
* A hybrid approach that uses Orama for ranked/semantic search AND ripgrep for exact regex search (as separate tools) may be more practical than trying to merge them
* The enrichment layer could wrap ripgrep output without replacing it
