# Evidence: Gaps — What Is NOT Covered

**Dimension:** Inventory of content-quality concerns the current workflow does not detect
**Date:** 2026-04-27
**Sources:** Synthesis from `code-linting.md`, `content-linting.md`, `link-and-graph-health.md`, `enforcement-surfaces.md` — every gap below is supported by a negative search documented in those files.

---

## Findings

### Finding: Stale wiki content — no detection
**Confidence:** CONFIRMED
**Evidence:** `enforcement-surfaces.md` §`stale.yml` only operates on PRs.

No automation flags:
- Specs whose implementation has shipped but whose status field still says "in progress" / "in flight."
- Reports whose evidence URLs have rotted or whose conclusions were superseded.
- Docs that have not been touched in N months in a fast-moving area.
- `consolidate`-produced canonical docs that have been silently superseded but not chained via `supersedes:`.

**Implications:** Staleness becomes visible only when an agent or human reads the doc and notices. The `git log` per-file is the only signal — there is no "freshness dashboard," no "stale doc" label, no scheduled audit.

### Finding: Frontmatter schema conformance — no validator
**Confidence:** CONFIRMED
**Evidence:** `content-linting.md` §No frontmatter schema validator is wired in.

The OK skill recommends `title`, `description`, `tags` per file. `.open-knowledge/config.yml` defines folder-level *defaults* that merge at read time. But there is no checker that:
- Confirms a file's frontmatter parses as valid YAML.
- Confirms required fields are present (per the OK skill convention).
- Confirms `tags:` values are strings (not accidentally numbers / booleans).
- Confirms `source_url:` (used by ingested external sources) is a valid URL.
- Confirms `supersedes:` chains terminate.
- Confirms `status:` ∈ {`provisional`, `canonical`, ...} (the values the `research` and `consolidate` workflow tools depend on).

**Implications:** Frontmatter typos and field-name drift accumulate silently; downstream tools that depend on the field shape (e.g., `consolidate` chains, `research` sources) start failing on individual docs without any aggregate signal.

### Finding: Hub freshness — no check
**Confidence:** CONFIRMED
**Evidence:** OK skill `Cadence` and `Organization` sections prescribe hub maintenance, but no automation enforces it.

```text
# SKILL.md:196-198
If a hub doc exists in a folder, update it as you change children.
Don't batch five child edits and then update the hub — write child →
update hub → write next child.
```

A "hub doc" = `INDEX.md`, `README.md`, `REPORT.md`, `SPEC.md`, or a file matching the folder name. The skill says to interleave hub updates with child writes. Nothing checks whether the hub was actually updated when children changed.

**Implications:** Hub-rot is invisible. A folder whose children have all been rewritten while the hub still cites the original outline is indistinguishable from a fresh folder, until a reader notices.

### Finding: Orphan accumulation — detection exists, no scheduled audit
**Confidence:** CONFIRMED
**Evidence:** `link-and-graph-health.md` §No CI workflow invokes any of these tools.

`get_orphans` is callable but is not run on any cadence. Orphans drift until someone runs the tool. Same posture for `get_dead_links`, `get_hubs`.

**Implications:** Wiki-health degradation is monotonic between manual audits. There is no signal of *rate of degradation* — by the time someone runs the audit, the backlog could be arbitrarily large.

### Finding: Dead links — agent-discipline-only enforcement, no CI gate
**Confidence:** CONFIRMED
**Evidence:** `link-and-graph-health.md`, `content-linting.md`.

The OK skill prescribes calling `get_dead_links({ sourceDocNames: ['your/doc'] })` after every write. Compliance is unverifiable. Direct human edits via the editor are not subject to the skill at all.

**Implications:** The user already knew about dead-link detection — but the *enforcement* story is much weaker than the *detection* story. The gate is "Claude (or another agent) running this skill remembers to call the tool." External-web link integrity (the OK skill's Grounding rule says external URLs should be `ingest`-ed, not inlined) is not even checked by the existing dead-link tool — `get_dead_links` finds *internal* missing targets only.

### Finding: External-URL rot — no detection
**Confidence:** CONFIRMED
**Evidence:** `get-dead-links.ts:14` — "missing internal page targets"; OK skill §Grounding requires external URLs to be ingested-then-cited but does not provide a checker.

`get_dead_links` scope = "internal page targets" (i.e., `[text](./other-doc.md)` references that don't resolve to a doc in the corpus). Inline `[source](https://example.com/...)` URLs are not validated against the live web at all.

**Implications:** Even an external-link integrity check (HEAD requests against every web URL in the wiki) is absent. The skill's closed-loop grounding rule is designed to *prevent* the problem (force external URLs into ingested local docs) — but legacy inlined URLs are not flagged.

### Finding: Closed-loop grounding — no enforcement
**Confidence:** CONFIRMED
**Evidence:** `SKILL.md:63-77` (Grounding rule), `content-linting.md` §Content discipline is delegated entirely to the OK agent skill.

The grounding rule says every factual claim must trace to a local source via internal links, not to the live web. Compliance is agent-discipline only.

**Implications:** This is the highest-stakes content-quality rule (per the user's project memory: "Source-grounded LLM reasoning") and it has the weakest enforcement. A doc with bare `[source](https://...)` URLs and no ingest chain looks indistinguishable from a doc with proper `[source](./external-sources/...)` citations under existing tooling.

### Finding: Prose quality / spell-check / inclusive language — no tooling
**Confidence:** CONFIRMED
**Evidence:** `content-linting.md` §Negative search for `cspell`, `vale`, `alex`, `write-good`.

No prose lint of any kind. Typos in user-facing docs (the `docs/` Fumadocs site is published; reports and specs land in agent context) are not detected pre-commit.

**Implications:** Lower-stakes than the content-grounding gaps but still relevant for the published docs site.

### Finding: Markdown style consistency — no tooling
**Confidence:** CONFIRMED
**Evidence:** `content-linting.md` §No markdown linter is configured.

No `markdownlint` / `remark-lint` config. Style drift accumulates: heading-level skips, list-marker mixing (`-` vs `*`), unbalanced fenced code, trailing whitespace, empty alt text on images (the OK skill prohibits empty alt — but only in agent guidance, not in a checker).

**Implications:** The OK skill's image alt-text rule, link-not-backticked rule, and HTML-not-allowed rules (SKILL.md §Anti-patterns) are agent-only. A human editing markdown directly with empty alt text or HTML `<img>` tags will not trip any check.

---

## Summary table — gaps by category

| Gap | Detection capability | Enforcement | Mitigation today |
|---|---|---|---|
| Stale wiki content | none | none | none |
| Doc-age decay | none | none | none |
| Frontmatter schema conformance | none | none | folder defaults mask absence at read time |
| Hub freshness | none | none | OK skill prescribes interleaving; agent-discipline only |
| Orphan accumulation | `get_orphans` (MCP tool) | none | manual ad-hoc invocation |
| Internal dead links | `get_dead_links` (MCP tool) | none | OK skill prescribes per-write call; agent-discipline only |
| External URL rot | none | none | OK skill closed-loop grounding rule (agent-discipline) |
| Closed-loop grounding | none | none | OK skill rule (agent-discipline) |
| Prose quality / typos | none | none | Claude PR review bot (advisory only) |
| Markdown style consistency | none | none | none |
| Image alt-text | none | none | OK skill rule (agent-discipline) |
| `supersedes:` chain validity | none | none | none |

---

## Negative searches

- `grep -rE "(stale|fresh|drift|decay).*(doc|wiki|md|content)" .github/ scripts/ package.json` → no results.
- `grep -rE "(hubFreshness|hub-freshness|hub_stale)" packages/ docs/` → no results.
- `grep -rE "(supersedes|status: provisional|status: canonical).*(check|validate|test)" packages/cli/` → no results in test files (the workflow tools enforce status at *creation*, not at periodic re-validation).
