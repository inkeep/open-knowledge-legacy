# Evidence: GBrain Skills Architecture & Resolver (D4 + D11)

**Dimension:** D4 (Skills parity) + D11 (Identity & persona artifacts)
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README; docs/ethos/THIN_HARNESS_FAT_SKILLS.md; docs/GBRAIN_SKILLPACK.md (summary fetched)

---

## Findings

### Finding: 29 shipped skills, organized into 7 conceptual groups (per README)
**Confidence:** CONFIRMED
**Evidence:** README "Skills Shipped (29 Total; 25 in Curated Bundle)":

**Always-On (2):**
- `signal-detector` — fires on every message; captures original thinking + entity mentions in parallel
- `brain-ops` — brain-first lookup before any external API

**Content Ingestion (4):**
- `ingest` — router that detects input type and delegates
- `idea-ingest` — links/articles/tweets → brain pages with author people pages
- `media-ingest` — video/audio/PDF/books/screenshots/GitHub repos → transcripts + entity extraction
- `meeting-ingestion` — transcripts → brain pages with enriched attendees + company timelines

**Brain Operations (8):**
- `enrich` — tiered enrichment (Tier 1/2/3); creates/updates person/company pages
- `query` — 3-layer search with synthesis and citations
- `maintain` — periodic health: stale, orphans, dead links, citation audit, back-link enforcement, tag consistency
- `citation-fixer` — scans pages for missing/malformed citations; fixes format
- `repo-architecture` — decision protocol for where new brain files go
- `publish` — share brain pages as password-protected HTML (zero LLM calls)
- `data-research` — structured data research with parameterized YAML recipes

**Operational (11):**
- `daily-task-manager` — task lifecycle (P0–P3), stored as searchable brain pages
- `daily-task-prep` — morning prep with calendar + brain context + open threads
- `cron-scheduler` — schedule staggering (5-min offsets), quiet hours, idempotency
- `reports` — timestamped reports with keyword routing
- `cross-modal-review` — quality gate via second model; refusal routing
- `webhook-transforms` — external events (SMS, meetings, social) → brain pages
- `testing` — validates every skill has SKILL.md, manifest coverage, resolver coverage
- `skill-creator` — create new skills following conformance standard; MECE check
- `skillify` — orchestrates 10-step loop so failures become durable skills
- `skillpack-check` — agent-readable health report; exit code for CI; JSON for debugging
- `smoke-test` — 8 post-restart health checks with auto-fix
- `minion-orchestrator` — background work via shell jobs and LLM subagents

**Identity & Setup (4):**
- `soul-audit` — 6-phase interview generating SOUL.md (agent identity), USER.md, ACCESS_POLICY.md (4-tier privacy), HEARTBEAT.md (operational cadence)
- `setup` — auto-provision PGLite or Supabase; first import; GStack detection
- `migrate` — universal migration from Obsidian, Notion, Logseq, markdown, CSV, JSON, Roam
- `briefing` — daily briefing with meeting context, active deals, citation tracking

**Total enumerated:** 29 skills across 7 groupings.

**Implications:** This is a much bigger surface area than OK currently plans. OK's PQ14 lists "ingest, compile, Q&A, lint, index-maintenance" as the v1 reference skills — 5 vs. GBrain's 29. The categories OK is missing entirely:
- **Always-on** (signal-detector, brain-ops)
- **Operational cadence** (daily-task-manager/prep, cron-scheduler, reports, briefing)
- **Webhook/external-event ingestion** (webhook-transforms)
- **Skill self-management** (skill-creator, skillify, skillpack-check, smoke-test, testing, minion-orchestrator)
- **Identity** (soul-audit + the SOUL/USER/ACCESS_POLICY/HEARTBEAT artifacts)

### Finding: Resolver pattern — `skills/RESOLVER.md` is the agent's first read
**Confidence:** CONFIRMED
**Evidence:** README: "Resolver: `skills/RESOLVER.md` (or agent's `AGENTS.md`); tells agent which skill to read for any task." Docs/ethos: "Resolver: A routing table determining which context loads when. Matches task types to appropriate documents automatically."

CLI verbs:
- `gbrain check-resolvable [--strict]` — Resolver audit (reachability, MECE, DRY, routing, filing, SKILLIFY_STUB)
- `gbrain routing-eval [--llm] [--json]` — Intent→skill routing accuracy on fixtures

**Implications:** RESOLVER.md is a **single explicit dispatch table**, not implicit-by-skill-frontmatter. Agents read it first, then load the targeted skill. Two contracts emerge:
1. **Reachability** — every skill must be referenced by RESOLVER.md (else it's an orphan).
2. **MECE** — no two skills should claim overlapping intents (else routing is ambiguous).

OK currently uses skill-by-skill frontmatter (`name`, `description`, `triggers`) per Claude Code's skill convention. There is no explicit RESOLVER manifest. Adopting the pattern would require either: (a) generating RESOLVER.md from skill frontmatter at install time, or (b) authoring it by hand and lint-checking against the skills directory.

### Finding: "Thin harness, fat skills" — the architectural principle that justifies the skill count
**Confidence:** CONFIRMED
**Evidence:** docs/ethos/THIN_HARNESS_FAT_SKILLS.md:

> Three-layer system:
> 1. **Fat Skills** (top): markdown procedures encoding judgment and domain knowledge
> 2. **Thin CLI Harness** (middle): ~200 lines managing the model loop, file I/O, context, safety
> 3. **Deterministic Foundation** (bottom): QueryDB, ReadDoc, Search operations
>
> "Push reasoning up into skills. Push execution down into deterministic tooling. The harness remains minimal."
>
> Anti-pattern: "fat harness, thin skills — 40+ tool definitions consuming context, MCP round-trips taking 2-5 seconds, REST wrappers inflating tokens and latency. Build purpose-built deterministic tools (Playwright CLI at 200ms vs. Chrome MCP at 15 seconds)."

**Implications:**
- This is **fully aligned with Open Knowledge's PQ13/PQ14**. Both projects independently converged on the pattern.
- The contrast with OK is **scope, not direction**. GBrain has shipped 29 skills; OK has shipped one (`open-knowledge` skill bundling the wiki conventions). The principle is the same; the question is volume + organization.
- The Playwright/Chrome MCP example reinforces a design rule: **prefer deterministic CLI calls over MCP tool round-trips when the operation is mechanical**. This argues for keeping OK's MCP tool count tight rather than expanding it.

### Finding: Skillify — "say 'skillify it!' and the fix becomes a durable skill"
**Confidence:** CONFIRMED
**Evidence:** README "Skillify: Durable Skill Creation (v0.19)":

> Four verbs:
> - `gbrain skillify scaffold <name>` — 5 stub files + resolver row
> - `gbrain skillify check [path]` — 10-item audit
> - `gbrain check-resolvable` — Resolver audit (reachability, MECE, DRY, routing, filing, SKILLIFY_STUB)
> - `gbrain routing-eval [--llm]` — Routing accuracy on fixtures

The 10-item skill audit (per README): SKILL.md, script, unit + E2E tests, LLM evals, resolver entry, trigger eval, check-resolvable gate, brain filing.

**Implications:**
- This is a **knowledge-engineering workflow** baked into the CLI. The agent learns from a one-off solve, then promotes the solve into a tested, versioned, resolver-registered skill.
- The "10-item audit" turns skill authoring into a **conformance contract**. OK has nothing like this — OK skills are markdown files with frontmatter, but no enforced test/eval/resolver pairing.
- Adopting `skillify` would require OK to define: (1) the canonical skill folder layout (SKILL.md + script + tests + evals + filing target), (2) a resolver convention, (3) a CLI command to scaffold + audit.

### Finding: Skillpack — 25 curated skills installable as a bundle, with per-skill diff
**Confidence:** CONFIRMED
**Evidence:** README:

```bash
gbrain skillpack list                          # 25 curated skills
gbrain skillpack install brain-ops             # one skill + conventions
gbrain skillpack install --all                 # full bundle
gbrain skillpack diff brain-ops                # local vs bundle diff
```

Properties:
- Per-file diff protection
- File lock (serializes concurrent installs)
- Atomic managed-block updates to AGENTS.md (so installer can update agent's routing table without overwriting user's customizations)

**Implications:**
- Skillpack is the **distribution mechanism for fat skills**. Without it, every user reinvents skills from scratch.
- OK's `install-skill` CLI command exists (`packages/cli/src/commands/install-skill.ts`) but is single-skill, not bundle-aware. Extending to a bundle + diff workflow is the parity-cost.
- Atomic AGENTS.md managed-block updates is a **specific engineering pattern** worth replicating — installers that mutate a user-edited file need fenced "managed regions" to avoid overwriting customizations.

### Finding: Conventions — cross-cutting rules in `skills/conventions/`
**Confidence:** CONFIRMED
**Evidence:** README "Conventions System":

> `skills/conventions/`:
> - `quality.md` — citations, back-links, notability gate, source attribution
> - `brain-first.md` — 5-step lookup before external API
> - `model-routing.md` — which model for which task
> - `test-before-bulk.md` — test 3–5 items before batch ops
> - `cross-modal.yaml` — review pairs, refusal routing chain

**Implications:**
- Conventions are **factored-out skills** referenced by multiple other skills. DRY at the skill level.
- This is a useful pattern for OK's wiki conventions (closed-loop grounding, wiki-link discipline, hub-update interleaving). Today these are inlined in the `open-knowledge` skill; factoring them out would let other skills reference them without duplication.
- `brain-first.md` (5-step lookup before external API) is **the meta-skill that makes the brain useful**. Without an explicit rule that says "check the brain first", agents default to web search and the brain stays cold.

### Finding: Identity artifacts — soul-audit generates SOUL.md / USER.md / ACCESS_POLICY.md / HEARTBEAT.md
**Confidence:** CONFIRMED
**Evidence:** README:

> `soul-audit` — 6-phase interview generating:
> - SOUL.md (agent identity)
> - USER.md (user profile)
> - ACCESS_POLICY.md (4-tier privacy)
> - HEARTBEAT.md (operational cadence)

**Implications:**
- These four artifacts together define **what the brain is**, **who owns it**, **what it can/can't share**, and **how often it does what**. They're the identity-and-policy layer above the data.
- OK has no analog. Closest is CLAUDE.md / AGENTS.md (role-of-the-agent) and `.open-knowledge/principal.json` (writer identity). The privacy/ACL dimension is absent in OK.
- ACCESS_POLICY.md's "4-tier privacy" likely structures: public-publishable / share-with-named-people / private-to-user / never-share-with-LLM. This is increasingly important as KBs ingest meeting transcripts and personal data.

### Finding: AGENTS.md as a cross-vendor instruction file (not gbrain-specific)
**Confidence:** CONFIRMED
**Evidence:** README repo tree shows `AGENTS.md` and `CLAUDE.md` both present at root. Comment: "Agent operating protocol (non-Claude; read first)".

**Implications:** Same convention as OK (CLAUDE.md → AGENTS.md symlink in OK's repo). Cross-vendor compatibility is shared.

---

## Negative searches

- Searched for "skill marketplace", "external skill registry", "skill versioning" → NOT FOUND. The skillpack is in-repo curated; no external registry.
- Searched for "RESOLVER.md schema" or formal grammar → NOT FOUND. RESOLVER.md is markdown with conventions, not a structured manifest.
- Searched for whether GBrain skills accept parameters / arguments → README mentions "method calls accepting parameters that reshape outputs without changing process" but doesn't specify the parameter-passing mechanism.

---

## Gaps / follow-ups

- The exact contents of RESOLVER.md (routing rules, format) not in fetched content. Source of truth: `skills/RESOLVER.md` in repo.
- The 10-item skillify audit details (what each item checks) inferred from README but not enumerated step-by-step.
- Whether skill files have a formal frontmatter schema (similar to Claude Code's name/description/trigger schema) or are free-form markdown — would need to read individual SKILL.md files in repo.
