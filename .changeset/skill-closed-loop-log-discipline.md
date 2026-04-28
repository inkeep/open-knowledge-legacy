---
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-server": minor
---

feat(skill, ingest): closed-loop grounding, broadened `ingest` trigger, log-discipline rule, and project-shape-neutral terminology.

Three behavioral additions to the bundled `open-knowledge` Agent Skill and the `ingest` MCP tool, driven by a wiki author's diagnostic of two recurring lapses (citing web sources inline instead of ingesting them; not appending to the project log after KB-changing turns).

- **Closed-loop grounding.** External sources don't get cited *out* to the live web — they get pulled *in* via `ingest`, then cited locally. A bare `[source](https://...)` URL inside a knowledge-base doc is now explicitly a TODO, not a finished citation. Self-fetched URLs (`WebFetch` / `WebSearch` from the agent itself) trigger `ingest` exactly like a user share does.
- **Broadened `ingest` trigger.** Both the SKILL.md workflow-tools row and the MCP tool's discoverable `DESCRIPTION` now name agent-initiated fetches as a first-class trigger. Prior framing was user-share-only, which let agents downgrade to inline-URL citation when they did the fetch themselves.
- **Log-discipline rule.** New SKILL.md section: after any turn that creates / edits / restructures KB content, check for a project `log.md` (project root or seed `rootDir`) and follow whatever its frontmatter `description:` and in-file comment say. The skill carries the **trigger**; the seeded file owns the **policy** (cadence, entry shape, categories) — so projects that don't run `ok seed` can opt out by simply not having a `log.md`. The seeded `LOG_MD_TEMPLATE` (`packages/server/src/seed/starter.ts`) now spells the contract out in its frontmatter description so it surfaces in every `exec("ls")` enrichment, and the example entry shape uses real markdown links (`[path](./path.md)`) instead of bare path strings — so log entries register in `get_backlinks` for the docs they reference and the audit trail compounds inside the doc graph.
- **Project-shape-neutral terminology.** Open Knowledge knowledge bases serve multiple shapes — wiki, LLM brain, spec collection, research log, project notes. Replaced "wiki" with "knowledge base" / "KB doc" everywhere it had been used as a project-shape claim (skill grounding section, workflow-tools layer column, hub-candidates JSDoc). Kept the term where it's a legitimate technical reference (the `[[Page]]` "wiki-link" syntax, `ARCHITECTURE.md` competitive-landscape rows naming Notion/Confluence/Wiki.js).

The change is additive on the install side: the skill `metadata.version` and `@inkeep/open-knowledge-server` package version both control the install gate (`~/.open-knowledge/skill-installed-version` sidecar), so this version bump triggers a fresh skill install in environments where 0.2.0 was previously cached.
