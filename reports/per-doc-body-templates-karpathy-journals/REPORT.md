---
title: "Per-Doc Body Templates for Karpathy-Style Journals: Mechanism Prior Art and Open Knowledge Integration"
description: "Grounding research for a per-doc body template feature in Open Knowledge, focused on the Karpathy LLM-knowledge-base + daily-journal use case. Covers Karpathy's documented workflow + adjacent LLM-power-user journaling patterns (kepano, Eric J. Ma, Daniel Pickem), the body-template mechanisms in Obsidian Daily Notes / Templater / Periodic Notes, Hugo archetypes, Logseq, GitHub issue templates, JetBrains, and Notion DB templates, and the Open Knowledge integration surface — existing folders[] glob rules, frontmatter pipeline, MCP create-page entry point, and STOP rules that bound the design."
createdAt: 2026-04-30
updatedAt: 2026-04-30
subjects:
  - Open Knowledge
  - Andrej Karpathy
  - Obsidian
  - Templater
  - Hugo
  - Logseq
  - Notion
topics:
  - body templates
  - daily notes
  - journaling for LLMs
  - folder-bound templates
  - variable substitution
  - config.yml
  - file creation hooks
---

# Per-Doc Body Templates for Karpathy-Style Journals

**Purpose:** Ground a `/spec` for adding **per-doc body templates** to Open Knowledge — the feature where creating a `.md` file at a folder-rule-matched path prefills its body with predetermined content (e.g., a daily-journal scaffold with `## Today`, `## Decisions`, `## Open questions`, `{{date}}`-substituted heading). The reader cares most about: (1) what the actual Karpathy/LLM-power-user "good template" looks like, (2) what mechanism the prior-art tools use that OK should mirror or deliberately diverge from, (3) how the feature plugs into OK's existing `folders[]` config + frontmatter pipeline, and (4) what's MVP vs deliberately-deferred.

This report builds on two prior reports and does not re-cover their ground:
- `reports/obsidian-karpathy-workflow-deep-dive/` — Karpathy's full 6-stage workflow, plugin landscape, MCP server inventory, search/Q&A, version history, Obsidian's irreducible strengths.
- `reports/config-driven-folder-frontmatter/` — the existing `folders[].frontmatter` design, the YAML schema/loader plumbing, sibling-file vs config-driven prior art for folder metadata.

---

## Executive Summary

The existing `folders[]` block in `.open-knowledge/config.yml` already encodes per-folder *frontmatter* defaults via glob-match rules. **Body templates are the natural sibling field on the same rule.** The mechanism is well-precedented across the category: Hugo archetypes, Obsidian Daily Notes (core), Obsidian Templater's folder-template-pairs, Periodic Notes, Logseq journal templates, GitHub issue templates, JetBrains File and Code Templates, Notion database templates — all variants of the same pattern with different surface choices. OK can pick the cleanest combination and ship a small surface.

The single most important framing correction is on the user's request itself: **Karpathy never publicly documented a daily-note template.** His Sept 2024 post describes a `raw/ → wiki/` compile flow ("100 articles, 400K words, LLM auto-maintains index files, anti-RAG insight"). The "daily/journal" framing is the *category-canonical* application Obsidian's Daily Notes plugin made famous, popularized by Steph Ango/kepano (Obsidian CEO) and reinforced by practitioners like Eric J. Ma (March 2026 — knowledge-management overhead 30-40% → <10% via AI sweeps over markdown notes) and Daniel Pickem (NVIDIA, Jan 2026 — PARA + Cursor + Obsidian). The spec target is therefore: **make the Karpathy-style ingest workflow *and* the Obsidian-canonical daily-journal pattern equally trivial via the same mechanism**, not "replicate a Karpathy schema" (which doesn't exist).

The de-facto "good LLM-friendly journal template" composite from surveyed sources is short:

```markdown
---
date: {{date}}
tags: [journal, daily]
---

# {{date}}

## Today
- 

## Decisions
- 

## Open questions
- 

## Links
- 
```

The recurring ingredients across sources: YAML frontmatter with `date` + `tags`, a single H1 with the date, **stable section headings repeated every entry** (so LLMs and humans pattern-match), empty bullet placeholders, `{{date}}` substitution at minimum.

The mechanism design space reduces to a small set of decisions, each with a clean precedent:

1. **Where is the binding?** Per-folder via existing `folders[]` glob rules (mirroring OK's existing `frontmatter:` shape). Hugo's type-keyed archetypes, Templater's folder-template-pairs, and Notion's per-database templates all use this pattern.
2. **Where does the template live?** Inline string in `config.yml` for short templates; **file-reference** path (e.g., `.open-knowledge/templates/daily.md`) for long ones. Both supported, file-ref wins when set. Mirrors Obsidian's Daily Notes (template file path) and Hugo's `archetypes/<type>.md`.
3. **What variable syntax?** `{{var}}` and `{{var:format}}` — the Obsidian-canonical convention. Lowest cognitive cost for users coming from Obsidian; cleaner than Templater's `<% tp.* %>`; simpler than Velocity or Go templates.
4. **What variables in MVP?** `{{date}}`, `{{date:YYYY-MM-DD}}` (moment.js format tokens), `{{title}}`, `{{path}}`, `{{user}}` (resolved via principal-identity). **No** `{{prompt:...}}` or expression evaluation in MVP.
5. **What trigger?** File creation in editor + MCP `create_page` + MCP `write_document` (when target doesn't exist and body is empty). Apply once at creation, materialize to disk, file is then ordinary content (file-over-app aligned).
6. **What precedence?** Last-match-wins among `folders[]` rules — same rule the existing `frontmatter:` field uses. Per-file body content always wins over template (template applies only when body is empty).

**Key Findings:**

- **Karpathy's "anti-RAG" insight applies directly.** Quote: *"I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files."* Templates encode the structural shape that downstream LLMs rely on — they're the input-side contract for the auto-maintenance loop. *(D1)*
- **Hugo archetypes are the cleanest single precedent.** `archetypes/<type>.md` files contain frontmatter+body, lookup is type-keyed with explicit precedence, and substitution variables (`.Date`, `.File.ContentBaseName`, `.Type`) match what OK needs. Adopting the model 1:1 (path-keyed instead of type-keyed) reuses OK's existing `folders[]` machinery. *(D2)*
- **The frontmatter+body split exists in every prior-art tool.** OK already does frontmatter; body is the missing half. Treating them as independent sibling fields on the same folder rule means a user can use frontmatter only, body only, or both — same composition the surveyed tools allow. *(D2, D3)*
- **JS execution (Templater's distinguishing feature) is a deliberate non-goal.** Every tool *except* Templater refuses arbitrary code in templates, and Templater itself ships with a security warning: *"Templater allows you to execute arbitrary JavaScript code and system commands."* OK should mirror the conservative majority. *(D2)*
- **`tp.system.prompt` (interactive prompts) is the most-asked-for power feature but a 2-way door.** It requires an editor modal surface, can't be expressed in a config field alone, and is cleanly addable in a follow-up spec without reshaping MVP. *(D2)*
- **OK's STOP rule "no sidecars in user-content paths" rules out per-folder `.template.md` files at the user's content root.** Templates live in config (inline) or under `.open-knowledge/templates/` (file-ref). *(D3)*
- **Periodic Notes ships only daily/weekly/monthly** — three periods, NOT five. The user's request is daily/journal-specific; OK's existing folder-glob system handles per-period folders trivially without inventing a "period" abstraction in MVP. *(D2)*
- **MCP `create_page` and `write_document` are the agent-write entry points where the template applies.** Existing identity tracking (precedent #25 writer-ID taxonomy) gives `{{user}}` resolution for free. *(D3)*

---

## Research Rubric

| # | Dimension | Priority | Depth | Coverage |
|---|-----------|----------|-------|----------|
| D1 | What Karpathy + LLM power-user journalers actually do | P0 | Moderate | [evidence/d1-karpathy-and-llm-power-user-journaling.md](evidence/d1-karpathy-and-llm-power-user-journaling.md) |
| D2 | Body-template mechanism prior art (Obsidian, Hugo, Logseq, Notion, GitHub, JetBrains) | P0 | Deep | [evidence/d2-template-mechanism-prior-art.md](evidence/d2-template-mechanism-prior-art.md) |
| D3 | OK integration surface (existing config, MCP create paths, STOP rules) | P0 | Moderate | [evidence/d3-ok-integration-surface.md](evidence/d3-ok-integration-surface.md) |
| D4 | Synthesis: option shapes for OK MVP | P0 | Synthesis | §below |

**Stance:** Factual + light synthesis. The spec picks among option shapes; this report enumerates the design space and surfaces tradeoffs.

**Non-goals (deliberately deferred):**
- Filename-pattern dynamism ("create today's daily journal" = a *command*, not a body-template feature; cleanly separable)
- Multi-template-per-folder + chooser UX (Notion/GitHub-style — future spec)
- Recurring template scheduling (Notion-style — future spec)
- Interactive prompts at creation time (`{{prompt:...}}` — needs editor modal)
- Arbitrary expression / JS evaluation in templates (deliberate refusal)

---

## Detailed Findings

### D1: What Karpathy + LLM power-users actually do

**Finding:** Karpathy describes a `raw/ → wiki/` compile workflow but no public daily-note template. The "daily journal" pattern in the user's request is the **category-canonical** application of body templates from Obsidian's Daily Notes, popularized by kepano and reinforced by practitioners. A body-template feature should make both Karpathy-style ingest and daily-journal scaffolding equally trivial — they're the same mechanism with different folder rules.

**Evidence:** [evidence/d1-karpathy-and-llm-power-user-journaling.md](evidence/d1-karpathy-and-llm-power-user-journaling.md)

**The composite "good LLM-friendly daily template" from surveyed sources:**

```markdown
---
date: {{date}}
tags: [journal, daily]
---

# {{date}}

## Today
- 

## Decisions
- 

## Open questions
- 

## Links
- 
```

Recurring ingredients across sources:
- YAML frontmatter with `date` + `tags` (query-friendly for both Dataview-style tools and LLMs)
- A single H1 with the date (unambiguous LLM anchor)
- **Stable section headings, same set every day, same order** (humans and LLMs pattern-match)
- Empty bullet placeholders (zero-friction start)
- `{{date}}` substitution at minimum

**Implications:**
- The spec's example config should ship with at least one daily-journal example using this composite shape — it's the canonical application and what users coming from Obsidian expect.
- **A Karpathy-mode example is ALSO worth shipping** — a `raw/` folder rule whose body template seeds clipping metadata: `---\nsource: \nclipped: {{date}}\nstatus: raw\n---\n\n## Source\n\n## Highlights\n\n## My notes\n`. This makes the report's Karpathy-thesis-friendly framing concrete.

**Decision triggers:**
- If the user's primary workflow is daily journaling → ship the journal example by default
- If the user's primary workflow is Karpathy-style ingest → ship the `raw/` ingest example by default
- The spec can ship both as commented examples in the workspace `config.yml` and let the user uncomment

**Remaining uncertainty:**
- Direct Karpathy quotes from his Sept 2024 X post not retrievable in this pass (HTTP 402 — Twitter rate-limited unauthenticated agents). The prior OK research report `obsidian-karpathy-workflow-deep-dive` captured the substance in 2026-04-03 and remains the spec's authoritative paraphrase.

---

### D2: Body-template mechanism prior art

**Finding:** Eight surveyed tools converge on a small shared design (frontmatter+body template applied at file creation, variable substitution, scope-bound by type/folder/database) with one bright-line divergence: **JS execution.** Templater is the only tool that allows it; everything else refuses. OK should refuse.

**Evidence:** [evidence/d2-template-mechanism-prior-art.md](evidence/d2-template-mechanism-prior-art.md)

| Tool | Trigger | Variable syntax | Scope binding | Frontmatter+body | JS exec |
|---|---|---|---|---|---|
| **Hugo archetypes** | `hugo new content` CLI | Go template `{{ .Date }}` | Type-keyed (filename) | Both | No |
| **Obsidian Daily Notes** | "Open today's note" cmd | `{{date}}`, `{{date:FORMAT}}` | Single global folder | Body via template path | No |
| **Obsidian Periodic Notes** | Period nav cmd | `{{date}}`, `{{sunday:FORMAT}}` | Per-period folder (D/W/M) | Body via template path | No |
| **Obsidian Templater** | File-create event in folder | `<% tp.* %>` | Folder→template literal pairs | Both | **Yes** |
| **Logseq** | Auto on journal page creation | `<% today %>` | Implicit (journal default template) | Both | No |
| **GitHub issue templates** | "New issue" UI chooser | None | Repo-level | Both | No |
| **JetBrains** | "New > File from Template" | Velocity `${VAR}` | File-type, project + IDE | Both | No |
| **Notion DB templates** | "New page" with chooser | None (manual props) | Per-database | Both | No |

**Implications for the OK spec:**

1. **Variable syntax: `{{var}}` / `{{var:format}}`.** Obsidian-canonical, lowest cognitive cost.
2. **Scope binding: per-folder glob rule.** Reuse OK's existing `folders[]` array. Sibling field next to `frontmatter:`.
3. **Trigger: file-creation event.** Apply at editor "new file," MCP `create_page`, MCP `write_document` (when target doesn't exist and body is empty).
4. **Frontmatter+body composition.** OK's existing `frontmatter:` field stays; new `bodyTemplate:` (or named whatever) is independent — user can use either or both.
5. **No JS execution.** Bright line. Templater warns; OK should refuse.
6. **Most-specific-match wins.** Same rule as existing `folders[].frontmatter`.

**Decision triggers:**
- If the user later wants prompt-for-input → addable as a new variable form (`{{prompt:label}}`) that triggers an editor modal; doesn't reshape the MVP model
- If the user later wants chooser UX (multiple templates per folder) → addable as `bodyTemplates:` (array) with optional `name:` field; doesn't reshape MVP

**Remaining uncertainty:**
- Templater's exact `folder_template_pairs` JSON shape — sub-doc URL 404'd in this pass. Spec should pull current shape from Templater settings.ts before locking field names if mirroring the structure literally (recommendation: don't mirror literally, design OK-native).

---

### D3: OK integration surface

**Finding:** OK's existing infrastructure makes this feature almost a drop-in. Schema, loader, glob matching, frontmatter pipeline, MCP create paths, identity tracking — all already exist. The new code is small.

**Evidence:** [evidence/d3-ok-integration-surface.md](evidence/d3-ok-integration-surface.md)

| Existing OK piece | Reuse for body templates |
|---|---|
| `folders[]` glob rules in `config.yml` | Add `bodyTemplate:` (or `body:`) sibling field per rule |
| `picomatch` + `ignore` path matching | No new deps; same matcher as `frontmatter:` |
| Zod schema in `packages/cli/src/config/schema.ts` | Schema extension; `.default` keeps it non-breaking |
| Deep-merge config loader (user→workspace, arrays-replace) | Templates compose like other config; user-level `~/.open-knowledge/config.yml` can carry user-default templates |
| Frontmatter "materialize to disk at create time" pipeline | Body template applies at the same point in the create-page handler |
| MCP `create_page` + `write_document` | Apply template inside the handler before first CRDT write |
| Writer-ID taxonomy (precedent #25) | `{{user}}` resolves via `principal-<UUID>` identity |
| YAML round-trip with comments preserved (`config-edit-paths`) | Editor "set template" UI uses existing pipeline |

**STOP rules and precedents that bound the design:**

| Rule | Source | How it constrains |
|---|---|---|
| No OK sidecars in user-content paths | CLAUDE.md STOP | Templates inline in config or under `.open-knowledge/templates/` only — NOT `.template.md` next to user files |
| Folder defaults via `folders[]` glob | CLAUDE.md STOP, existing config | Use the existing array; one shape, one mental model |
| File-over-app: materialize to disk | kepano stance, OK alignment | Apply at creation time, not at read time; user owns the file after |
| MCP write paths are canonical | precedent #25, `preview-nav-agent-contract` | Template applies in create-page handler, not editor-only |

**Implications for the spec:**
- The "where does the template live" decision should support **both inline strings and file references**:
  - Inline: `bodyTemplate: "# {{date}}\n\n## Today\n"` — ergonomic for short templates
  - File-ref: `bodyTemplatePath: ".open-knowledge/templates/daily.md"` — preferred for long templates, lets user edit templates in OK itself
  - When both are set, file-ref wins (file is more "active"; inline is a fallback for one-liners)
- The "when does it apply" rule should be: **template applies when creating a file matching the rule AND the body provided is empty/whitespace.** Agent-supplied non-empty body wins. This keeps the model simple and avoids surprising overwrites.

**Decision triggers:**
- If templates need to live anywhere other than `config.yml` inline or `.open-knowledge/templates/` — the spec is fighting a STOP rule, reconsider
- If templates need to apply at read time (virtual overlay) — the spec is fighting file-over-app, reconsider

---

### D4: Synthesis — option shapes for OK MVP

The design space reduces to one MVP shape with two well-precedented variants on the "where does the template live" axis. Other dimensions (variable syntax, trigger, scope binding, precedence) are convergent enough across prior art to lock cleanly.

#### Shape M (MVP, recommended)

```yaml
folders:
  # Existing frontmatter rule shape — unchanged
  - match: "specs/**"
    frontmatter:
      title: Specifications
      tags: [ spec ]

  # NEW: body template alongside frontmatter
  - match: "journals/daily/**"
    frontmatter:
      tags: [ journal, daily ]
    body: |
      # {{date}}

      ## Today
      - 

      ## Decisions
      - 

      ## Open questions
      - 

      ## Links
      - 

  # NEW: file-reference variant for long templates
  - match: "raw/**"
    frontmatter:
      tags: [ raw, ingest ]
    bodyPath: .open-knowledge/templates/raw-clipping.md
```

**Locked decisions:**

| Decision | MVP value | Why |
|---|---|---|
| Field name | `body:` (inline) + `bodyPath:` (file-ref) | Sibling of existing `frontmatter:`; minimum naming overhead |
| Variable syntax | `{{var}}` and `{{var:format}}` | Obsidian-canonical, lowest cognitive cost |
| Variables in MVP | `date`, `date:FORMAT`, `title`, `path`, `user` | Universal across prior art; resolvable from existing OK state |
| Precedence among rules | Last-match-wins (same as `frontmatter:`) | One mental model |
| Trigger | File creation in editor + MCP `create_page` + MCP `write_document` (when path doesn't exist AND body is empty) | Covers all entry points; agent-supplied body wins |
| Apply timing | At creation, materialize to disk | File-over-app |
| JS execution | None | Bright line across surveyed tools (except Templater, which warns) |
| Per-user vs per-workspace | Both, via existing config precedence | User defaults in `~/.open-knowledge/config.yml`; workspace overrides in `./.open-knowledge/config.yml` |
| When `body:` and `bodyPath:` both set | `bodyPath:` wins | File is more "active," inline is fallback |
| When matching folder rule has both `frontmatter:` and `body:` | Both apply (compose) | Independent fields, same composition as Hugo archetypes |
| Re-applying template to existing file | Not in MVP | Cleanly addable later as a "scaffold" command |

**Deferred (out of MVP, additive in future specs):**

- `{{prompt:label}}` interactive prompts at creation time (needs editor modal)
- Multi-template-per-folder + chooser UX (Notion/GitHub-style)
- Recurring scheduling (Notion-style)
- "Open today's daily note" command (filename-pattern + period semantics — separable feature)
- Filename-template ("when this rule fires, also generate filename pattern X")
- Cursor-placement marker (e.g., `{{cursor}}`) — useful but cosmetic, addable when editor supports it

#### Shape examples for the workspace `config.yml`

The spec should ship at least these two example commented blocks in workspace `config.yml`:

**Daily journal (Obsidian-canonical):**

```yaml
folders:
  - match: "journals/daily/**"
    frontmatter:
      tags: [ journal, daily ]
    body: |
      ---
      date: {{date}}
      ---

      # {{date}}

      ## Today
      - 

      ## Decisions
      - 

      ## Open questions
      - 

      ## Links
      - 
```

**Karpathy-style raw ingest:**

```yaml
folders:
  - match: "raw/**"
    frontmatter:
      tags: [ raw, ingest ]
    body: |
      ---
      source: 
      clipped: {{date}}
      status: raw
      ---

      ## Source

      ## Highlights

      ## My notes
```

These two examples cover the user's request directly: daily/journal patterns + Karpathy LLM workflow patterns, using one mechanism, configured in the same file users already know.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Verbatim Karpathy quotes from his Sept 2024 X post** — Twitter/X is paywalled to unauthenticated agents (HTTP 402 in this pass). The prior OK research `obsidian-karpathy-workflow-deep-dive` captured substance in 2026-04-03; treat as authoritative paraphrase.
- **Templater's exact `folder_template_pairs` settings JSON shape** — sub-doc 404'd in this pass. Substance preserved from prior OK research; spec should sanity-check against current Templater settings.ts before mirroring literally (which is not the recommendation anyway — design OK-native).
- **Empirical study on "best journal template shape for LLM retrieval"** — no public benchmark found. Recommendation here is structural by analogy across surveyed practitioners, not by measured retrieval accuracy.

### Out of scope (per rubric)

- Filename-pattern / "open today's note" command — separable feature
- Multi-template chooser UX — additive future feature
- Recurring template scheduling — additive future feature
- Plugin development tutorials, Obsidian-specific feature parity beyond mechanism
- General Obsidian overview (covered in `obsidian-karpathy-workflow-deep-dive`)

---

## References

### Evidence files

- [evidence/d1-karpathy-and-llm-power-user-journaling.md](evidence/d1-karpathy-and-llm-power-user-journaling.md) — Karpathy's documented workflow (no public daily-note template), kepano file-over-app stance, practitioner accounts (Eric J. Ma, Daniel Pickem), composite "good template" shape
- [evidence/d2-template-mechanism-prior-art.md](evidence/d2-template-mechanism-prior-art.md) — Hugo archetypes, Daily Notes, Templater, Periodic Notes, Logseq, GitHub issue templates, JetBrains, Notion DB templates; comparison table; cross-cutting observations
- [evidence/d3-ok-integration-surface.md](evidence/d3-ok-integration-surface.md) — Existing OK config plumbing, STOP rules, MCP create-page entry points, writer-ID taxonomy for `{{user}}` resolution

### Related research (do NOT re-cover; reference only)

- [obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/REPORT.md) — full Karpathy 6-stage workflow, Obsidian plugin landscape, MCP servers, search/Q&A, version history, Obsidian's irreducible strengths
- [config-driven-folder-frontmatter/](../config-driven-folder-frontmatter/REPORT.md) — the existing `folders[].frontmatter` design, Zod schema, deep-merge loader, sibling-file-vs-config tradeoffs, `picomatch` + `ignore` path matchers
- [config-edit-paths/](../config-edit-paths/REPORT.md) — YAML round-trip with comment preservation; the pipeline an editor "set template" UI would use
- [preview-nav-agent-contract/](../preview-nav-agent-contract/REPORT.md) — agent contract for OK MCP write paths; relevant for "template applies at create_page" mechanics

### Key external sources

- [Hugo Archetypes](https://gohugo.io/content-management/archetypes/) — fetched 2026-04-30
- [Obsidian Templater (SilentVoid13)](https://github.com/SilentVoid13/Templater) — fetched 2026-04-30
- [Obsidian Periodic Notes (liamcain)](https://github.com/liamcain/obsidian-periodic-notes) — fetched 2026-04-30
- [Obsidian Daily Notes core help](https://obsidian.md/help/plugins/daily-notes) — rendered content not retrievable in this pass; substance from prior OK research + community knowledge
- [Karpathy Sept 2024 LLM-Knowledge-Bases X post](https://x.com/karpathy/status/2039805659525644595) — paywalled to unauthenticated agents in this pass; substance via prior OK research
- [Steph Ango / kepano](https://stephango.com) — file-over-app stance, Obsidian product comms

### Worldmodel snapshot

- Existing OK reports already cover the broader landscape; no fresh worldmodel pass needed for this narrow extension. The folders[] feature surface is internal precedent already.
