# Audit findings — Per-Doc Body Templates SPEC

**Audited:** specs/2026-04-30-per-doc-body-templates/SPEC.md
**Audit date:** 2026-04-30
**Auditor:** self-audit (cold-reader subprocess permission denied; performed by primary author with cold-reader discipline)

## High severity

### A-H1: FR-10 frontmatter merge direction is inverted relative to existing OK semantics

**Severity:** HIGH
**Type:** Coherence + Factual
**Location:** §6 FR-10, §10 D12

**Finding:** FR-10 states: *"rule scalars override template-body frontmatter; tags concatenate."* This contradicts the existing OK rule documented in `.open-knowledge/config.yml` header: *"Scalars: last-match wins. Tags: concat... **File frontmatter wins per-scalar.**"*

The template body's `---` frontmatter block, once materialized to disk, IS the file's frontmatter at that moment. By the existing rule, file frontmatter wins over folder-rule frontmatter — not the other way around. So template-body scalars should win over rule scalars, not be overridden by them.

**Evidence:** `.open-knowledge/config.yml:55-58`:
```
# Scalars: last-match wins. Tags: concat across all matching rules + file
# tags last, first-occurrence preserved on dedup. File frontmatter wins
# per-scalar.
```

**Recommended fix:** Invert FR-10 to: *"If the rendered template begins with a `---` YAML frontmatter block AND the rule's `frontmatter:` field is also set, merge per existing semantics: **template-body scalars override rule scalars** (template body is the file's initial frontmatter, and file frontmatter wins per-scalar). Tags concatenate (rule tags + template tags, dedup, first-occurrence preserved). Result is one merged frontmatter block in the materialized file."* Update D12 wording to match. Add a coverage test.

**Resolution:** Apply the inversion. Mark D12 corrected; add a test in the implementation phase. **APPLIED** — spec edits below.

---

## Medium severity

### A-M1: FR-9 wording mismatch with D11

**Severity:** MED
**Type:** Coherence

**Finding:** FR-9 says `{{user}}` resolves to "the principal-identity UUID (or falls back to a documented default)." D11 says it resolves to the principal's *display name*. UUIDs would be unfriendly in user-facing template output (`author: 7f3a-...`); display names are the correct behavior per the writer-ID taxonomy.

**Recommended fix:** Update FR-9 to read: *"`{{user}}` resolves to the principal-identity display name (or falls back per D11 chain: agent display name → `"file-system"` → empty)."* **APPLIED** below.

### A-M2: FR-3 "agent-supplied body is empty" — edge case for frontmatter-only payloads

**Severity:** MED
**Type:** Coherence + Test coverage

**Finding:** FR-3 + D5 define empty as "whitespace-only after `stripFrontmatter()`." This means an agent that sends `"---\nfoo: bar\n---\n"` (frontmatter only, no body) gets the template body merged in. This is reasonable but worth surfacing as an explicit case, especially because it interacts with FR-10's frontmatter merge logic — the agent's frontmatter would compose with the rule's `frontmatter:` AND the template body's `---` block (if any).

**Recommended fix:** Add a clarification line to D5: *"When the agent sends frontmatter-only with no body, the agent's frontmatter is preserved and the template body is appended; the template body's own `---` block (if any) merges with the agent frontmatter per FR-10 semantics."* Add a test case. **APPLIED** below.

### A-M3: Template max size not specified

**Severity:** MED
**Type:** Spec gap

**Finding:** §9 Failure modes (line 249) mentions "1MB+" as illustrative for "too large" but no limit is locked. Without a limit, an adversarial config could render hundreds of MB into create-page.

**Recommended fix:** Add to FR-2 (or as new FR-13): *"Template content (after `bodyPath:` load if applicable) MUST be ≤64KB. Larger templates → reject + warn + fall back to empty."* 64KB is well above any realistic markdown scaffold; matches typical limits in similar fields. **APPLIED** below.

### A-M4: D2/NG9 phrasing tension

**Severity:** MED
**Type:** Coherence

**Finding:** D2 is LOCKED ("frontmatter REMAINS virtual overlay") while NG9 is `[NOT UNLESS]` ("only if user directs in Q1"). LOCKED + [NOT UNLESS] creates ambiguity: is the migration locked-out or merely deferred? The intent is clearly "deferred to a future spec," so the framing should match.

**Recommended fix:** Reword D2 to: *"This spec does NOT migrate `folders[].frontmatter` to materialize-at-create — that is a separate concern with its own 1-way-door risk and gets a follow-up spec."* Mark D2 LOCKED **for this spec's scope**. NG9's `[NOT UNLESS]` framing is fine — leaves room for the follow-up spec. **APPLIED** below.

---

## Low severity

### A-L1: §5 P1 journey shows YAML with `-·` (interpunct as trailing-space marker) — could confuse readers

**Severity:** LOW
**Type:** Style

**Finding:** The middot character is a clever way to denote trailing spaces in a literal-display medium, but a reader scanning the spec might think `-·` is literal markdown. The footnote explains it but the visual is unfamiliar.

**Recommended fix:** Replace `-·` with `-` (no trailing space) in the user-journey example. Trailing spaces in template empty bullets are a nicety, not a hard requirement; users can edit. Drop the footnote. (Or alternatively keep but clarify.) **APPLIED below — drop the trailing-space convention from the example to keep it readable.**

### A-L2: NFR Cost references Q4 ("dayjs OR inline") but Q4 is delegated

**Severity:** LOW
**Type:** Style

**Finding:** Mostly fine — Q4 is explicitly delegated to implementer choice. The forward-reference works. Optional nit: phrasing is OK. No fix needed.

### A-L3: §10 D14 evidence link references `reports/config-edit-paths/REPORT.md` — verify it exists

**Severity:** LOW
**Type:** Evidence link integrity

**Finding:** The spec links to `reports/config-edit-paths/REPORT.md`. Per the catalogue scan in the worldmodel step, this report does exist (created 2026-04-25). Link valid.

**No fix needed.**

### A-L4: §6 NFR mentions "≤1ms median latency" but no measurement plan

**Severity:** LOW
**Type:** Verifiability

**Finding:** Claim is reasonable but no instrumentation/benchmark is cited. For MVP this is acceptable as an aspirational target — actual measurement could happen during QA. No fix needed.

---

## Coherence cross-checks

- All FRs trace back to goals (G1-G5) ✓
- All decisions referenced in FR Notes column have entries in §10 ✓
- All non-goals (NG1-NG9) have revisit triggers documented ✓
- All assumptions (A1-A5) have verification plans ✓
- §13 In Scope items reference §6 FRs and §9 design ✓
- §16 Agent Constraints SCOPE files match the create-page handler + MCP tool inventory ✓
- §16 STOP_IF includes the D2 boundary (don't touch virtual overlay) ✓

## Cross-finding consistency

- "body is empty" definition (D5) consistent across FR-3, P3 success criterion, §9 failure modes, §5 P3 journey ✓
- Variable inventory (D6/FR-4) consistent across §5 examples, §6 FRs, §11 Q4 ✓
- Last-match-wins (D10/FR-8) consistent with existing folder-rule semantics ✓

---

## Summary

- **1 HIGH severity finding** (A-H1: frontmatter merge direction inverted)
- **4 MED severity findings** (A-M1: FR-9/D11 mismatch; A-M2: edge case clarification; A-M3: template max size missing; A-M4: D2/NG9 phrasing tension)
- **4 LOW severity findings** (style + verifiability nits)

All HIGH and MED findings are surgical and applied below in §10 D12-rewrite, FR-10 fix, FR-9 fix, D5 clarification, NEW FR-13, D2 reword. No findings reopen prior LOCKED decisions; all are corrections + clarifications.
