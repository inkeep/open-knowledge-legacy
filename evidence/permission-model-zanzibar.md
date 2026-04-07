---
title: "Permission model — Zanzibar-style relationship-based access control for content"
type: synthesis
created: 2026-04-03
---

## TLDR
Content protection and draft behavior determined by relationship-based permissions (Zanzibar model), not content type labels. Agents are subjects with permissions on content objects. Permission determines behavior: editor → writes to main, proposer → creates draft, maintainer → can overwrite entirely. Resolves PQ7, PQ9, and the human-primary vs AI-primary content distinction in one model.

## The model

**Objects:** article (file), folder (directory, permissions inherit to children), project (entire KB)

**Subjects:** user (human), agent:personal (user's Claude Code), agent:skill:<name> (specific skill), agent:autonomous (scheduled), agent:team (shared — Later)

**Relations:**
| Relation | Meaning | Write behavior |
|---|---|---|
| owner | Full control | Writes to main, can delete |
| editor | Can edit directly | Writes to main CRDT (co-edit) |
| proposer | Can only propose | Writes create a draft |
| maintainer | Can overwrite entirely | For regenerable content |
| viewer | Read only | Write tools rejected |

**Inheritance:** Folder permissions flow to articles within. `folder:sops/#proposer@agent:*` protects every article in /sops/.

## How it resolves open questions

**PQ9 (draft defaults):** Dissolved. The behavior (main vs draft) follows from the permission, not from a user toggle or skill request. Agent has `editor` → main. Agent has `proposer` → draft. The skill can request permissions; the product enforces them.

**PQ7 (project structure):** Simplified. Instead of "what content type goes where," the question is "what default permissions apply to each folder." The folder structure is a permission boundary.

**CC4 (editing contexts):** The context (main vs draft) is determined by resolved permission. The user can always override (they're owner). The skill can request a draft even when it has editor permission (for isolation during iterative work).

**Human-primary vs AI-primary:** Not a content label. It's a permission relationship. Human-written articles: agents are proposers (protected). AI-maintained indexes: the maintaining skill is maintainer (can overwrite). The same article can have different permissions for different agents.

## Example tuples
```
project:my-kb#owner@user:edwin
project:my-kb#editor@agent:personal
folder:sops/#proposer@agent:personal        ← agents propose to SOPs
article:_index.md#maintainer@agent:skill:index
folder:compiled/#maintainer@agent:skill:compile
project:my-kb#proposer@agent:autonomous     ← cron agents always propose
```

## MCP behavior follows permission
Agent calls `write_article(path, content)`. Product resolves permission for this agent on this path. Returns behavior:
- `{ "status": "written", "context": "main" }` — editor/maintainer
- `{ "status": "draft_created", "draft_id": "...", "reason": "protected content" }` — proposer

Agent doesn't need to know the permission model. It just writes. Product handles the rest.

## P0 implementation (open — TQ decision)
Three options for the permission store, not yet decided:
1. **Frontmatter only** — `maintained_by: agent`, `protected: true` per file. Folder policies stored as frontmatter in a folder-level index file (e.g., `sops/_policy.md`).
2. **Config file** — `.openknowledge/permissions.yaml` defines folder-level policies. Frontmatter overrides per file.
3. **Full Zanzibar** — SpiceDB, OpenFGA, or Permify. Relationship tuples in a database. For teams/enterprise (Later).

All three implement the same conceptual model. P0 likely starts with option 1 or 2. Teams upgrade to option 3.

## Init/getting-started defaults (open — PQ decision)
The permission model needs sensible defaults that make a new project work without configuration:
- New project: human is owner. Personal agent is editor on everything.
- No frontmatter on a file → default: agent is editor (not proposer) — optimistic default for IC workflow, agent can write freely.
- User can tighten: add `protected: true` to frontmatter, or set folder policy.
- Skills that create AI-maintained content set `maintained_by: agent` in frontmatter automatically.
- The init command could scaffold example folder policies or leave it open.

The default should be "everything works with zero config, agent writes freely." Protection is opt-in. This matches Karpathy's workflow where the agent maintains the wiki and the user trusts it. For teams (Later), defaults flip: protection is opt-out, review is default.
