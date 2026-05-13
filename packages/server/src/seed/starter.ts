export type PackId =
  | 'knowledge-base'
  | 'software-lifecycle'
  | 'plain-notes'
  | 'worldbuilding'
  | 'writing-pipeline'
  | 'gbrain';

export const DEFAULT_PACK_ID: PackId = 'knowledge-base';

export interface StarterFolder {
  path: string;
  title: string;
  description: string;
  tags: string[];
  starterTemplate: string;
  extraTemplates?: readonly string[];
}

export interface StarterPack {
  id: PackId;
  name: string;
  description: string;
  defaultSubfolder?: string;
  folders: readonly StarterFolder[];
  templates: Readonly<Record<string, string>>;
  rootFiles?: Readonly<Record<string, string>>;
}

const KNOWLEDGE_BASE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'external-sources',
    title: 'External Sources',
    description:
      'Raw sources SAVED verbatim — not just cited. The actual fetched text of URLs, extracted text of PDFs, and copies of any referenced files live as .md files here, each with frontmatter carrying the original URL, access date, and any publisher / author metadata. Produced by `ingest` — applies whether the user shared the URL OR the agent fetched it itself to ground a knowledge-base claim. The KB is closed-loop: downstream docs cite local paths in this folder, never bare web URLs. Immutable after capture (update only to refresh a stale fetch). No analysis in these files — that belongs in `research/`. Downstream articles cite specific docs here by path so every claim is traceable to preserved evidence rather than a dead link.',
    tags: ['source', 'immutable', 'layer-ingest'],
    starterTemplate: 'clip',
  },
  {
    path: 'research',
    title: 'Research',
    description:
      'Provisional analysis synthesizing external sources. Produced by the `research` tool. Every factual claim cites a specific doc in `external-sources/` (or an inline URL if ingest was skipped) — no unsourced assertions. Each article has `status: provisional` and a `sources:` frontmatter list of cited paths. Promoted to `articles/` via `consolidate` once the team decides the findings are stable.',
    tags: ['research', 'provisional', 'layer-research'],
    starterTemplate: 'research-log',
  },
  {
    path: 'articles',
    title: 'Articles',
    description:
      'Canonical knowledge committed after a team decision. Produced by `consolidate`. Carries `status: canonical` plus a `supersedes:` chain tying back to the `research/` docs it replaces, which in turn cite `external-sources/` — the full evidence chain is traceable without leaving the repo. Source-of-truth for the domain; update only when a new decision supersedes it.',
    tags: ['article', 'canonical', 'layer-consolidate'],
    starterTemplate: 'article',
  },
] as const;

const KNOWLEDGE_BASE_TEMPLATES: Readonly<Record<string, string>> = {
  clip: `---
title: External Source
description: Capture a URL, PDF, or referenced file verbatim. Update title to match the actual source after instantiation.
source:
clipped: {{date}}
status: raw
tags: [source]
---

## Source

(Paste / fetch the verbatim source text here. Keep it raw — analysis goes in research/.)

## Highlights

(Direct quotes worth pulling out.)

## My notes

(Your reactions, questions, follow-ups. NOT analysis — that belongs in research/.)
`,
  'research-log': `---
title: Research Log
description: Provisional analysis synthesizing external sources. Every factual claim cites a doc in external-sources/. Promoted to articles/ via consolidate once findings are stable.
status: provisional
sources: []
created: {{date}}
author: {{user}}
tags: [research, provisional]
---

## Question

(What are you trying to figure out?)

## Sources cited

(List paths from external-sources/ this log synthesizes. Mirror in the \`sources:\` frontmatter list.)

## Findings

(Provisional. Every claim traces back to a specific source above.)

## Open questions

(Threads to chase next.)
`,
  article: `---
title: Canonical Article
description: Canonical knowledge committed after a team decision. Carries status:canonical plus a supersedes chain tying back to the research/ docs it replaces. Source-of-truth for the domain.
status: canonical
supersedes: []
authored: {{date}}
author: {{user}}
tags: [article, canonical]
---

## Summary

(One-paragraph summary of the canonical position. The decision in plain English.)

## Body

(The full canonical knowledge. Cite research/ entries (which in turn cite external-sources/) so the evidence chain is traceable.)

## References

(Markdown links to the research/ + external-sources/ docs this article rests on.)
`,
};

const KNOWLEDGE_BASE_LOG_MD = `---
title: Work Log
description: Append-only audit trail. After each turn that creates, edits, or restructures content in the knowledge base, append one dated entry here (one per turn, not per file). Silent edits break the audit trail.
---

# Work Log

Append-only audit trail. **Append a dated entry after any turn that creates, edits, or restructures content in the knowledge base** — one entry per turn, not per file. Silent edits break the chain that makes knowledge-base changes auditable.

What to log:

- \`ingest\` runs (new external sources captured)
- \`research\` / \`consolidate\` runs (provisional or canonical articles produced)
- Direct \`write_document\` / \`edit_document\` / renames / deletions outside the three workflow tools
- Folder restructures (\`ok seed\`, manual reorganization)
- \`.ok/config.yml\` changes

**Reference docs as markdown links, not bare paths.** Every doc you touched should appear as \`[path/to/doc](./path/to/doc.md)\` so the log shows up in \`get_backlinks\` for those docs. A bare path string (\`Files touched: foo/bar.md\`) does not register in the doc graph — the audit trail compounds only when the log is a real linker.

<!-- Example entry shape:

## YYYY-MM-DD — <short title>

- <what was done>
- Files touched: [path/to/doc-a](./path/to/doc-a.md), [path/to/doc-b](./path/to/doc-b.md)
- Sources ingested: [source-slug](./external-sources/source-slug.md)
- Open follow-ups: <topic-1>, <topic-2>

-->
`;

const SOFTWARE_LIFECYCLE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'proposals',
    title: 'Proposals',
    description:
      'In-flight design proposals (RFC-shape). One file per proposal (`0001-feature-name.md`). Status flows `draft → fcp → accepted/rejected`. Accepted proposals graduate to a record in `decisions/`. Shape mirrors Rust RFCs / Astro proposals — Motivation / Design / Drawbacks / Alternatives / Unresolved questions. Folder named `proposals/` (not `rfcs/`) because "RFC" is overloaded across IETF / npm / Rust dialects; `dotnet/designs`, `withastro/roadmap`, and `kubernetes/enhancements` all converged on `proposals/`. Agent: when a proposal sits at `status: draft` >14 days, surface for the author to advance, park, or close.',
    tags: ['proposal', 'design', 'in-flight'],
    starterTemplate: 'proposal',
  },
  {
    path: 'decisions',
    title: 'Decisions',
    description:
      "Architecture Decision Records (MADR / Nygard shape). Frozen decisions. One file per decision (`NNNN-title.md`). Status: `proposed/accepted/deprecated/superseded`. When a new decision supersedes an older one, the new record's `Supersedes:` field links back. Folder named `decisions/` (not `adrs/`) — reads as English; Google Cloud's ADR doc and MADR v3 both accept it interchangeably. Agent: on a new decision, scan existing records touching the same subsystem and surface candidates for `Supersedes:` before commit.",
    tags: ['decision', 'adr', 'frozen'],
    starterTemplate: 'decision',
  },
  {
    path: 'specs',
    title: 'Specs',
    description:
      "Implementation specs derived from accepted proposals. Prefer the `github/spec-kit` shape: one folder per spec (`specs/NNN-name/`) with `spec.md` + `plan.md` + `tasks.md`. Date-stamped flat files (`YYYY-MM-DD-name.md`) also fine for smaller specs. The folder ships THREE templates so you can build the triple — `spec` (Goals / Non-goals / Design / Migration / Test plan), `spec-plan` (per-spec implementation plan), and `spec-tasks` (the per-spec task checklist). References the parent proposal. Agent: when a spec moves to `status: shipped`, suggest a postmortem template if the owner reports an incident touching the spec's subsystem.",
    tags: ['spec', 'implementation'],
    starterTemplate: 'spec',
    extraTemplates: ['spec-plan', 'spec-tasks'],
  },
  {
    path: 'postmortems',
    title: 'Postmortems',
    description:
      'Blameless incident write-ups. One file per incident (`YYYY-MM-DD-name.md`). Sections: Summary / Timeline / Root cause / What went well / Action items (Google SRE shape; `dastergon/postmortem-templates` is the canonical template source). Agent: extract repeated subsystems mentioned across postmortems and surface a `Related:` block pointing at prior postmortems with shared subsystems.',
    tags: ['postmortem', 'incident', 'blameless'],
    starterTemplate: 'postmortem',
  },
  {
    path: 'guides',
    title: 'Guides',
    description:
      'How-to guides, onboarding docs, and service-bound runbooks. Diátaxis "how-to" bucket — concrete tasks the reader wants to accomplish. Ships THREE templates: `guide` (generic how-to), `onboarding-guide` (new-hire / new-contributor setup), and `runbook` (service-symptom shape, for runbooks that stay next to the service code). Carries `last_verified` so stale guides surface in periodic sweeps. Modern incident tools (incident.io / Rootly) own dedicated runbooks now — keep service-symptom runbooks here only when they ship next to the service code. Agent: when a postmortem is published, scan its Action items for guide-shaped follow-ups and stub a guide here pre-filled with the symptom and timeline excerpt.',
    tags: ['guide', 'how-to', 'onboarding'],
    starterTemplate: 'guide',
    extraTemplates: ['onboarding-guide', 'runbook'],
  },
] as const;

const SOFTWARE_LIFECYCLE_TEMPLATES: Readonly<Record<string, string>> = {
  proposal: `---
title: Proposal Title
description: One-line summary of the proposal.
status: draft
authors: [{{user}}]
created: {{date}}
tags: [proposal]
---

## Motivation

(What problem does this solve? Why now?)

## Design

(How will it work? Diagrams welcome.)

## Drawbacks

(What does this make harder? What does it preclude?)

## Alternatives

(What else was considered, and why was this picked?)

## Unresolved questions

(What's still open? What needs to be decided before the proposal is accepted?)
`,
  decision: `---
title: Decision Title
description: One-line decision summary.
status: proposed
date: {{date}}
deciders: [{{user}}]
supersedes: []
tags: [decision]
---

## Context

(What's the situation that forced a decision? What forces are at play?)

## Decision

(What did we decide? In one paragraph.)

## Consequences

(What becomes easier? What becomes harder? What's the long tail?)
`,
  spec: `---
title: Spec Title
description: One-line description of what's being built.
status: draft
owner: {{user}}
target_release:
created: {{date}}
parent_proposal:
tags: [spec]
---

## Goals

(What does success look like? Bulleted, numbered if useful.)

## Non-goals

(What we're explicitly NOT doing. Tag NOT NOW vs NEVER.)

## Design

(Vertical slice: user journey → UX → API → data → runtime → ops.)

## Migration

(How do we get from current state to target state? Backward compat?)

## Test plan

(What's the verification story? Unit / integration / manual / load?)
`,
  'spec-plan': `---
title: Plan — <Spec Title>
description: Implementation plan derived from the parent spec. Pairs with spec.md and tasks.md (github/spec-kit triple shape).
parent_spec:
created: {{date}}
author: {{user}}
tags: [spec, plan]
---

## Approach

(High-level approach. How we'll get from current state to the spec's target state.)

## Phases

(Break the work into phases. Each phase produces a verifiable artifact.)

## Risks + unknowns

(What could go wrong? What do we still need to learn? Trigger conditions for revisiting the plan.)

## Dependencies

(What other work blocks or is blocked by this? Cross-team coordination.)

## Rollout

(How does this ship? Feature flag? Migration? Gradual rollout? Rollback plan.)
`,
  'spec-tasks': `---
title: Tasks — <Spec Title>
description: Task checklist for the parent spec. Pairs with spec.md and plan.md (github/spec-kit triple shape).
parent_spec:
created: {{date}}
author: {{user}}
tags: [spec, tasks]
---

## Tasks

(Concrete, checkbox-tracked work items. Each should be small enough to ship as one PR.)

- [ ] <Task 1 — what + verification>
- [ ] <Task 2>
- [ ] <Task 3>

## Done when

(What does "spec implemented" look like? Acceptance criteria. Should match the spec's Goals.)

## Out of scope

(Tasks that surfaced during planning but won't ship in this spec. Link to follow-up specs if any.)
`,
  guide: `---
title: <Topic> — <Action>
description: One-line summary of what the reader will accomplish.
category: how-to
last_verified: {{date}}
tags: [guide]
---

## Goal

(What does the reader want to accomplish? Stated as a concrete outcome.)

## Steps

(Numbered, imperative. Each step verifiable; commands welcome.)

## Troubleshooting

(Common failure modes + how to recover.)

## Links

(Related proposals, decisions, specs, postmortems.)
`,
  'onboarding-guide': `---
title: Onboarding — <Audience>
description: First-N-days setup path for <audience> (e.g. new engineer, new contributor, new oncall).
category: onboarding
audience:
last_verified: {{date}}
tags: [guide, onboarding]
---

## Who this is for

(Role / persona / first-day situation. Be specific.)

## Day 1 — get set up

(Concrete account / access / install steps. Commands welcome.)

## Day 1-3 — first useful contribution

(Smallest meaningful change a newcomer can ship. Link the issue / good-first-task list.)

## Week 1 — orient

(Key services, where docs live, who to ping, how the team communicates.)

## When you're stuck

(Escalation path. Channels, on-call rotation, "ask this person about X" mapping.)

## Links

(Glossary, architecture overview, key decisions/proposals worth reading first.)
`,
  runbook: `---
title: <Service> — <Symptom>
description: Oncall procedure for diagnosing and remediating <symptom> in <service>.
category: runbook
service:
severity:
last_verified: {{date}}
tags: [guide, runbook, oncall]
---

## Symptom

(What does the user / monitoring see? What page fires?)

## Diagnosis

(Steps to confirm the symptom + isolate the cause. Commands welcome.)

## Remediation

(Steps to fix. If multiple options, list in escalation order.)

## Escalation

(Who to page if remediation fails. Rotation links, on-call contact.)

## Links

(Related postmortems, dashboards, prior incidents.)
`,
  postmortem: `---
title: Incident — <short name>
description: Blameless postmortem for <incident>.
severity:
duration:
services: []
status: draft
date: {{date}}
authors: [{{user}}]
tags: [postmortem]
---

## Summary

(Two-paragraph executive summary. What happened, what was the impact, what's the followup.)

## Timeline

(\`HH:MM\` UTC entries. What was observed, what was done, in order.)

## Root cause

(Five-whys or causal chain. Be precise; "deploy went wrong" is not a root cause.)

## What went well

(What worked? Tooling that helped, decisions that paid off.)

## Action items

(Concrete TODOs with owners. Each should ladder to a runbook or doc change.)
`,
};

const PLAIN_NOTES_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'notes',
    title: 'Notes',
    description:
      'Flat notes folder. One file per topic. No structure imposed. Use `[[wiki-links]]` to connect notes; OK\'s link graph builds itself from those edges. The "I just want to write" home base — promote a note into a more structured folder layout later if you outgrow this.',
    tags: ['notes', 'flat'],
    starterTemplate: 'note',
  },
  {
    path: 'daily',
    title: 'Daily',
    description:
      'Daily journal entries. One file per day (`YYYY-MM-DD.md`). Pre-templated with morning intentions and evening reflections. Use `[[wiki-links]]` to anything worth its own page. Agent: on first instantiation each day, link `[[YYYY-MM-DD-1|yesterday]]` and pre-fill the date so the linear journal is also a navigable graph.',
    tags: ['daily', 'journal'],
    starterTemplate: 'daily',
  },
] as const;

const PLAIN_NOTES_TEMPLATES: Readonly<Record<string, string>> = {
  note: `---
title: Note title
description: One-line summary.
created: {{date}}
author: {{user}}
tags: []
---

(Write here. Use [[wiki-links]] to connect to other notes.)
`,
  daily: `---
title: {{date}}
description: Daily journal entry.
date: {{date}}
author: {{user}}
mood:
top3: []
gratitude: []
tags: [daily]
---

## Morning — intentions

(What's the one thing today is for? Top 3 below in frontmatter.)

## Throughout — log

(Capture as you go. Use [[wiki-links]] for anything worth its own page.)

## Evening — reflection

- What shipped:
- What stalled:
- Gratitude (also in frontmatter for sweeps):
`,
};

const WORLDBUILDING_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'characters',
    title: 'Characters',
    description:
      'One file per character (PC + NPC). Frontmatter carries `type`, status, faction membership, first appearance. Agent: when a chapter excerpt or session log mentions a name not yet captured, stub a file here with backlinks to where they were mentioned. Do NOT add dialog stat-block fields (`xp_awarded`, etc.) — those belong in a future TTRPG variant.',
    tags: ['character', 'fiction', 'entity'],
    starterTemplate: 'character',
  },
  {
    path: 'settings',
    title: 'Settings',
    description:
      'Locations, regions, world-rules, atmospheric notes. Frontmatter carries region, controlling faction, danger level. The "where" of the story — physical and felt. Agent: when a new location is referenced, stub it here; when a setting is described in two places with conflicting details, surface the conflict.',
    tags: ['setting', 'location', 'world'],
    starterTemplate: 'setting',
  },
  {
    path: 'themes',
    title: 'Themes',
    description:
      'Recurring narrative concerns — love, betrayal, redemption, identity, etc. The "why" of the story. Themes work via opposition; each entry captures the theme + its tension. Agent: surface theme links when characters or settings repeatedly invoke a concept; suggest theme entries when a recurring symbol or motif emerges across chapters.',
    tags: ['theme', 'narrative', 'meaning'],
    starterTemplate: 'theme',
  },
  {
    path: 'factions',
    title: 'Factions',
    description:
      'Political, social, criminal, magical, religious groups. Frontmatter carries leader, members, rivals, alignment. The "who-vs-who" of the story. Ships three templates — `faction` (generic group), `political-faction` (states / houses / parties with holdings + ideology), `religion` (deity / beliefs / rituals / schisms). Agent: extract faction membership when characters declare allegiance; flag when a character\'s `faction` field contradicts their actions in narrative chapters.',
    tags: ['faction', 'group', 'politics'],
    starterTemplate: 'faction',
    extraTemplates: ['political-faction', 'religion'],
  },
  {
    path: 'lore',
    title: 'Lore',
    description:
      'History, mythology, cosmology, magic systems. Long-form prose; the foundational fabric the story stands on. Ships three templates — `lore` (generic entry), `magic-system` (source / costs / limits / practitioners), `historical-event` (when / where / causes / consequences / sources-cited). Agent: when characters or settings reference the same historical event, link them through the relevant lore entry; flag when in-story tellings contradict the canonical lore (themselves a story-shaping detail worth noting).',
    tags: ['lore', 'history', 'world'],
    starterTemplate: 'lore',
    extraTemplates: ['magic-system', 'historical-event'],
  },
] as const;

const WORLDBUILDING_TEMPLATES: Readonly<Record<string, string>> = {
  character: `---
title: Character Name
description: One-line characterization.
type: character
status: alive
faction: []
first_appeared:
created: {{date}}
author: {{user}}
tags: [character]
---

## Appearance

(Physical description. What stays consistent across scenes.)

## Voice & motives

(How they talk. What they want. What they're afraid of.)

## Arc

(Where they start, where they go. Update as the story evolves.)

## Links

(\`[[Faction X]]\`, \`[[Setting Y]]\`, related characters, etc.)
`,
  setting: `---
title: Setting Name
description: One-line atmospheric summary.
type: setting
region:
controlling_faction:
danger_level:
created: {{date}}
author: {{user}}
tags: [setting]
---

## Sense of place

(What does it look, sound, feel, smell like? The hooks a reader latches onto.)

## What happens here

(Significant events tied to this setting. Link to \`[[characters/...]]\`.)

## What's hidden

(Secrets, undercurrents, what the setting conceals from casual visitors.)
`,
  theme: `---
title: Theme Name
description: One-line statement of the recurring concern.
type: theme
created: {{date}}
author: {{user}}
tags: [theme]
---

## Statement

(What is this theme actually saying? In a sentence.)

## Manifestations

(How does it show up? Which characters embody it, which settings amplify it.)

## Tension

(What does this theme push against? Themes work via opposition.)
`,
  faction: `---
title: Faction Name
description: One-line description of who they are and what they want.
type: faction
alignment:
leader:
members: []
rivals: []
created: {{date}}
author: {{user}}
tags: [faction]
---

## Agenda

(What do they want? What are they willing to do for it?)

## Resources

(What do they bring to bear — wealth, force, knowledge, network?)

## Internal tensions

(What divides them? Where would a wedge work?)
`,
  'political-faction': `---
title: Faction Name
description: One-line summary of their politics and their ambition.
type: political-faction
form: monarchy
seat:
leader:
holdings: []
allies: []
rivals: []
ideology:
created: {{date}}
author: {{user}}
tags: [faction, politics]
---

## Ideology

(What do they actually believe? What's the rhetoric vs. what's the practice?)

## Holdings

(What territory / resources / institutions do they control? How do they tax / extract?)

## Power structure

(Who decides? Who advises? Who enforces? Where are the succession risks?)

## Relations

(Allies — bound by what? Rivals — over what? Who would shift sides under pressure?)

## Pressure points

(What internal fault lines could fracture them? What external shocks would they fail under?)
`,
  religion: `---
title: Religion Name
description: One-line summary of the faith and its central tension.
type: religion
deity:
pantheon: []
clergy_structure:
founded_era:
followers_count_rough:
holy_sites: []
schisms: []
created: {{date}}
author: {{user}}
tags: [faction, religion]
---

## Core belief

(What do adherents actually believe about the divine, the world, and their place in it? In a paragraph.)

## Practices

(Rituals, observances, taboos. What does it look like to be a practitioner day-to-day?)

## Hierarchy

(Clergy structure, lay leadership, succession of authority. Who speaks for the faith?)

## Schisms + heresies

(Internal splits — doctrinal or political? Which factions reject the canonical reading?)

## Relations with power

(Aligned with which states / nobles? Persecuted by whom? What's the political weight of conversion?)
`,
  lore: `---
title: Lore Topic
description: One-line summary.
type: lore
era:
scope: history
created: {{date}}
author: {{user}}
tags: [lore]
---

## Core

(The foundational claim or fact this lore article asserts.)

## Variants

(How is this told differently in different settings/factions? Whose version is "true"?)

## Implications

(What does this enable or constrain in the story? Links out.)
`,
  'magic-system': `---
title: Magic System Name
description: One-line summary of the source and the cost.
type: magic-system
source:
cost:
discoverable_by: []
practitioners: []
forbidden_acts: []
created: {{date}}
author: {{user}}
tags: [lore, magic]
---

## Source

(Where does the power come from? An external well, an internal capacity, a bargain with something else?)

## Costs + limits

(What does using it take? Physical, social, moral, spiritual price. What can it NOT do? Costs are what make magic dramatically useful — Sanderson's Second Law.)

## Practitioners

(Who has access? Born with it / trained into it / chosen by it / bought into it? What does the broader society make of them?)

## Forbidden acts

(What can you do but mustn't? Who enforces? What happens to transgressors?)

## How it shapes the world

(What does the existence of this magic make trivial that would otherwise be hard? What does it make impossible that would otherwise be easy? The world should look different because magic exists.)
`,
  'historical-event': `---
title: Event Name
description: One-line summary of what happened and why it mattered.
type: historical-event
when:
where:
duration:
key_figures: []
factions_involved: []
sources_cited: []
created: {{date}}
author: {{user}}
tags: [lore, history]
---

## What happened

(Concrete events in order. Who did what, when, with what.)

## Causes

(Why now? What forces, grievances, or accidents combined? Avoid single-cause narratives.)

## Consequences

(What changed because of this? Geopolitical, social, technological, mythic. How is the world different after?)

## In-world tellings

(How is this event remembered or retold by different factions? Whose version is canonical, whose is suppressed?)

## Source

(Reference works inside the world — chronicles, oral traditions, eyewitness accounts. Mark contested vs. accepted.)
`,
};

const WRITING_PIPELINE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'ideas',
    title: 'Ideas',
    description:
      'One-line ideas, captured before they fade. Premises, headlines, fragments — anything that might earn a draft. Promote an idea into `drafts/` when you commit to writing the piece. Agent: sweep ideas idle >30 days and surface for park-or-push triage. NOT a draft folder — these are pre-drafts, kept short on purpose. Named `ideas/` (not `seeds/`) — "seeds" in PKM usage means evergreen-note maturity, not pre-drafts.',
    tags: ['idea', 'inbox', 'pre-draft'],
    starterTemplate: 'idea',
  },
  {
    path: 'drafts',
    title: 'Drafts',
    description:
      "Active prose. Frontmatter tracks `status: drafting/review`, word count, parent idea. Iterate freely — OK's CRDT history tracks every save, so named-revision folders aren't needed. The Jekyll `_drafts` → `_posts` convention has been load-bearing since 2008; we follow it. Agent: sweep drafts idle >14 days; for drafts in review, suggest publication targets based on `target_form`. If you need per-piece research notes, create `drafts/<slug>/research/` on demand rather than a top-level folder.",
    tags: ['draft', 'prose'],
    starterTemplate: 'draft',
  },
  {
    path: 'published',
    title: 'Published',
    description:
      "Shipped work. Carries `published_at`, `canonical_url`, `channel`. Source-of-truth for what's gone live. Treat as immutable; if you need to revise, fork to a new draft. Agent: on publish, auto-fill `canonical_url` when a Substack / Ghost / Mirror URL is pasted into the file.",
    tags: ['published', 'live'],
    starterTemplate: 'published',
  },
] as const;

const WRITING_PIPELINE_TEMPLATES: Readonly<Record<string, string>> = {
  idea: `---
title: Idea title
description: One-line hook.
captured_at: {{date}}
hook:
tags: [idea]
---

(Write the premise. What's the idea?)

## Stimulus

(What sparked this? Article, conversation, observation. Link if applicable.)
`,
  draft: `---
title: Draft title
description: What's this piece about?
status: drafting
target_form:
target_words:
parent_idea:
created: {{date}}
author: {{user}}
tags: [draft]
---

(Write here. Iterate. OK's CRDT history tracks every save — no need to manually fork revisions.)
`,
  published: `---
title: Published title
description: One-line summary.
status: published
published_at:
canonical_url:
channel:
parent_draft:
author: {{user}}
tags: [published]
---

(Final version. Treat as immutable; if you need to revise, fork to a new draft.)
`,
};

const GBRAIN_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'people',
    title: 'People',
    description:
      'Person dossiers. Compiled-truth section above `---` (overwritten as new evidence arrives); append-only timeline below (`YYYY-MM-DD:` entries, never edit existing ones — only append). Frontmatter `type: person`. Linked to `companies/` (affiliations, founders, investors) and `meetings/` (attendance). Agent: when a meeting note mentions a person not yet captured, stub a file here; route new facts into either compiled-truth (if they update current understanding) or timeline (raw evidence). Never rewrite the timeline.',
    tags: ['person', 'entity', 'dossier'],
    starterTemplate: 'person',
  },
  {
    path: 'companies',
    title: 'Companies',
    description:
      'Company dossiers. Same body convention as `people/`: compiled-truth above `---`, append-only timeline below. Frontmatter `type: company`. Linked to `people/` (founders, employees, investors) and `meetings/`. Agent: when a person dossier references a company not yet captured, stub a file here; surface company-to-person edges when both exist.',
    tags: ['company', 'entity', 'dossier'],
    starterTemplate: 'company',
  },
  {
    path: 'meetings',
    title: 'Meetings',
    description:
      'Meeting notes. Filename `YYYY-MM-DD-<slug>.md`. Frontmatter carries `date`, `attendees: [[wikilinks]]`, and `type: meeting`. Body is raw notes with `[[wiki-links]]` to people, companies, concepts mentioned. Agent: after a meeting note lands, extract entity mentions and append timeline entries to each referenced dossier. Do NOT rewrite the meeting note — it is the verbatim record.',
    tags: ['meeting', 'note'],
    starterTemplate: 'meeting',
  },
  {
    path: 'concepts',
    title: 'Concepts',
    description:
      'Evergreen idea pages — abstract patterns, frameworks, recurring concepts that surface across people / companies / meetings. Compiled-truth + timeline convention. Frontmatter `type: concept`. Agent: when a meeting note or person dossier references a concept (e.g. "agent-runtime observability") not yet captured, stub a file here; thread links so the concept becomes a hub for everywhere it appears.',
    tags: ['concept', 'idea', 'evergreen'],
    starterTemplate: 'concept',
  },
  {
    path: 'originals',
    title: 'Originals',
    description:
      "Your own thinking — untransformed. Frontmatter `type: idea`. Use freely; use `[[wiki-links]]` for anything that should become its own entity. Agent: treat originals as authoritative source material when extracting facts — these are the user's words, not inferences. Append timeline entries to referenced dossiers when a clear new claim appears, citing the original by wikilink.",
    tags: ['original', 'thinking', 'user'],
    starterTemplate: 'original',
  },
  {
    path: 'media',
    title: 'Media',
    description:
      'Bulk transcripts, voice notes, articles, large attachments. Frontmatter `type: transcript` (template provided). Often `.okignore`-d so the OK index stays light. If gbrain is installed alongside OK, the `media-ingest` skill produces transcripts + backlinks here (video / audio / PDF / books), and the `voice-note-ingest` skill captures voice memos verbatim while routing the extracted content into the right entity dossier. Without gbrain, the agent does both on request. Keep raw — analysis belongs in dossiers, not here.',
    tags: ['media', 'transcript', 'bulk'],
    starterTemplate: 'transcript',
  },
] as const;

const GBRAIN_TEMPLATES: Readonly<Record<string, string>> = {
  person: `---
title: Person Name
description: One-line characterization — who they are, why they matter to you.
type: person
created: {{date}}
author: {{user}}
tags: [person]
---

## Compiled truth

(Your current best understanding. Overwritten as new evidence arrives.)

---

## Timeline

{{date}}: First entry. Append-only — never edit existing entries, only add new \`YYYY-MM-DD:\` lines.
`,
  company: `---
title: Company Name
description: One-line company summary — what they do, who's involved.
type: company
created: {{date}}
author: {{user}}
tags: [company]
---

## Compiled truth

(Your current best understanding of the company. Overwritten as new evidence arrives.)

---

## Timeline

{{date}}: First entry.
`,
  meeting: `---
title: Meeting Title
description: One-line meeting summary — fill in after the meeting.
type: meeting
date: {{date}}
attendees: []
author: {{user}}
tags: [meeting]
---

## Notes

(Raw notes from the meeting. Use \`[[wiki-links]]\` for people, companies, concepts mentioned.)

## Action items

- [ ]
`,
  concept: `---
title: Concept Name
description: One-line concept summary — what it names and why it recurs.
type: concept
created: {{date}}
author: {{user}}
tags: [concept]
---

## Compiled truth

(Your current best understanding of the concept. Rewrite as evidence accumulates.)

---

## Timeline

{{date}}: First entry.
`,
  original: `---
title: Idea Title
description: One-line summary of the idea or take.
type: idea
date: {{date}}
author: {{user}}
tags: [original]
---

(Your own thinking. Use \`[[wiki-links]]\` for anything that should become its own entity.)
`,
  transcript: `---
title: Transcript
description: One-line transcript summary — source and key topic.
type: transcript
date: {{date}}
source:
duration:
author: {{user}}
tags: [transcript, media]
---

## Source

(URL, file, or device captured from.)

## Transcript

(Paste raw transcript. The gbrain \`media-ingest\` skill — if installed — produces structured transcripts with backlinks to mentioned entities (video / audio / PDF / books). For voice memos specifically, gbrain's \`voice-note-ingest\` captures verbatim then routes into the right entity dossier. Without gbrain, ask your agent to do it on demand.)
`,
};

const GBRAIN_LOG_MD = `---
title: Work Log
description: Append-only audit trail. After each turn that creates, edits, or restructures content in the vault, append one dated entry here (one per turn, not per file). gbrain users — your dream-cycle runs land here too.
---

# Work Log

Append-only audit trail. **Append a dated entry after any turn that creates, edits, or restructures content in the vault** — one entry per turn, not per file.

What to log:

- New entity dossiers stubbed (\`people/\` / \`companies/\` / \`concepts/\`)
- Meeting notes captured
- \`dream\` runs (if gbrain is installed alongside) — gbrain writes the phase summary here
- Original-thinking captures
- Folder restructures or rule changes

**Reference docs as markdown links, not bare paths.** Every doc you touched should appear as \`[name](./path/to/doc.md)\` so the log shows up in \`get_backlinks\` for those docs.

<!-- Example entry shape:

## YYYY-MM-DD — <short title>

- <what was done>
- Dossiers updated: [Jane Founder](./people/jane-founder.md), [Jane Co](./companies/jane-co.md)
- Meetings logged: [2026-05-12 coffee](./meetings/2026-05-12-jane-founder-coffee.md)
- Open follow-ups: <topic-1>, <topic-2>

-->
`;

const GBRAIN_USER_MD = `---
title: User profile
description: Who you are. Agent reads this on every briefing / enrichment pass. Keep current.
---

# User profile

**Name:**

**Role:**

**Current focus areas:**

- ...

**Network anchors:** (people you talk to most; use \`[[wikilinks]]\` once \`people/\` dossiers exist)

- [[]]

**Communication style:** (how you prefer briefings, summaries, suggestions)

`;

const GBRAIN_SOUL_MD = `---
title: Agent identity
description: Agent persona, values, voice. If you run gbrain alongside, this is the output of its \`soul-audit\` skill — a 6-phase interview. Fill in by hand or run \`gbrain soul-audit\`.
---

# Agent identity (SOUL.md)

**Persona name:**

**Voice + tone:** (how the agent speaks — formal / casual / direct / hedged / etc.)

**Values:** (what the agent optimizes for when faced with trade-offs)

- ...

**What to avoid:** (postures / framings / topics the agent should never adopt)

- ...

**Run \`gbrain soul-audit\` to populate this via a guided interview.** Or write it by hand — anything here informs every gbrain skill that loads SOUL.md on each call.
`;

const GBRAIN_ACCESS_POLICY_MD = `---
title: Access policy
description: What the agent may read, write, and surface. gbrain's 4-tier privacy model — but useful even without gbrain.
---

# Access policy

## Tier 1 — Public

(Things the agent may surface in any briefing or shared context.)

## Tier 2 — Internal / professional

(Things the agent may use to inform briefings + dossiers, but should not surface to external parties without prompting.)

## Tier 3 — Personal

(Things the agent may use to anchor briefings, but should never write into a dossier that might be shared.)

## Tier 4 — Restricted

(Things the agent should never read or surface. Use \`.okignore\` to enforce hard exclusion at the file level.)

`;

const GBRAIN_HEARTBEAT_MD = `---
title: Operational cadence
description: When the agent does scheduled work — daily briefings, end-of-day dossier maintenance, weekly audits. If gbrain is installed, its \`dream\` schedule also lands here.
---

# Heartbeat

## Daily

- **Morning briefing** (\`gbrain briefing\` or ad-hoc agent prompt): today's calendar + per-attendee dossier context.
- **End of day**: ingest the day's meeting notes; let \`dream\` (or a manual agent prompt) extract entity mentions and update dossiers overnight.

## Nightly (\`gbrain dream\` if installed)

- 11-phase maintenance cycle: lint → backlinks → sync → synthesize → extract → patterns → recompute_emotional_weight → consolidate → embed → orphans → purge.

## Weekly

- Audit: dossiers untouched in 30+ days, contradictions between compiled-truth and recent timeline entries.

## Monthly

- Run OK's \`get_dead_links\` across the vault — triage redlinks into new entities (gbrain creates dossiers), typo fixes (OK edits in place), or intentional placeholders.

`;

export const STARTER_PACKS: Readonly<Record<PackId, StarterPack>> = {
  'knowledge-base': {
    id: 'knowledge-base',
    name: 'Knowledge base',
    description:
      'Source-grounded canonical articles. Three layers — sources → research → articles — wired to the ingest / research / consolidate MCP tools.',
    defaultSubfolder: 'brain',
    folders: KNOWLEDGE_BASE_FOLDERS,
    templates: KNOWLEDGE_BASE_TEMPLATES,
    rootFiles: { 'log.md': KNOWLEDGE_BASE_LOG_MD },
  },
  'software-lifecycle': {
    id: 'software-lifecycle',
    name: 'Software lifecycle',
    description:
      'Proposals, decisions, specs, postmortems, guides — the doc lifecycle for an engineering team or OSS project.',
    defaultSubfolder: 'project-docs',
    folders: SOFTWARE_LIFECYCLE_FOLDERS,
    templates: SOFTWARE_LIFECYCLE_TEMPLATES,
  },
  'plain-notes': {
    id: 'plain-notes',
    name: 'Plain notes',
    description:
      'Just notes/ + daily/. The "I just want to write" escape hatch — no posture imposed, link freely.',
    defaultSubfolder: undefined,
    folders: PLAIN_NOTES_FOLDERS,
    templates: PLAIN_NOTES_TEMPLATES,
  },
  worldbuilding: {
    id: 'worldbuilding',
    name: 'Worldbuilding',
    description:
      'Encyclopedia for fiction: characters, settings, themes, factions, lore. The graph is the product — agent excels at auto-stub creation and dead-link sweeps.',
    defaultSubfolder: 'world',
    folders: WORLDBUILDING_FOLDERS,
    templates: WORLDBUILDING_TEMPLATES,
  },
  'writing-pipeline': {
    id: 'writing-pipeline',
    name: 'Writing pipeline',
    description:
      'Three-stage drafting flow: ideas → drafts → published. Lean by default; CRDT history covers per-file revisions.',
    defaultSubfolder: 'writing',
    folders: WRITING_PIPELINE_FOLDERS,
    templates: WRITING_PIPELINE_TEMPLATES,
  },
  gbrain: {
    id: 'gbrain',
    name: 'Gbrain',
    description:
      "Track people, companies, and meetings — each gets a dossier with a rewritable summary and an append-only timeline. Inspired by Garry Tan's gbrain.",
    defaultSubfolder: 'vault',
    folders: GBRAIN_FOLDERS,
    templates: GBRAIN_TEMPLATES,
    rootFiles: {
      'log.md': GBRAIN_LOG_MD,
      'USER.md': GBRAIN_USER_MD,
      'SOUL.md': GBRAIN_SOUL_MD,
      'ACCESS_POLICY.md': GBRAIN_ACCESS_POLICY_MD,
      'HEARTBEAT.md': GBRAIN_HEARTBEAT_MD,
    },
  },
};

export const STARTER_PACK_IDS: readonly PackId[] = Object.keys(STARTER_PACKS) as PackId[];

export function resolvePack(packId?: PackId): StarterPack {
  if (!packId) return STARTER_PACKS[DEFAULT_PACK_ID];
  const pack = STARTER_PACKS[packId];
  if (!pack) {
    return STARTER_PACKS[DEFAULT_PACK_ID];
  }
  return pack;
}

export function isKnownPackId(value: unknown): value is PackId {
  return typeof value === 'string' && (STARTER_PACK_IDS as readonly string[]).includes(value);
}

export function coercePackId(value: unknown): PackId | undefined {
  return isKnownPackId(value) ? value : undefined;
}

export interface StarterPackFolderInfo {
  path: string;
  summary: string;
}

export interface StarterPackEntryCounts {
  files: number;
  folders: number;
}

export interface StarterPackInfo {
  id: PackId;
  name: string;
  description: string;
  defaultSubfolder?: string;
  folders: StarterPackFolderInfo[];
  entryCounts: StarterPackEntryCounts;
}

function deriveFolderSummary(description: string): string {
  const trimmed = description.trim();
  const match = /^([^.!?]+[.!?])/.exec(trimmed);
  const firstSentence = (match?.[1] ?? trimmed).trim();
  if (firstSentence.length <= 140) return firstSentence;
  return `${firstSentence.slice(0, 137)}…`;
}

export function listStarterPacks(): StarterPackInfo[] {
  return STARTER_PACK_IDS.map((id) => {
    const pack = STARTER_PACKS[id];
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      defaultSubfolder: pack.defaultSubfolder,
      folders: pack.folders.map((f) => ({
        path: f.path,
        summary: deriveFolderSummary(f.description),
      })),
      entryCounts: computePackEntryCounts(pack),
    };
  });
}

function computePackEntryCounts(pack: StarterPack): StarterPackEntryCounts {
  const folders = pack.folders.length;
  let files = 0;
  for (const folder of pack.folders) {
    files += 1 + (folder.extraTemplates?.length ?? 0);
  }
  files += pack.rootFiles ? Object.keys(pack.rootFiles).length : 0;
  return { files, folders };
}

export const STARTER_FOLDERS: readonly StarterFolder[] = KNOWLEDGE_BASE_FOLDERS;

export const STARTER_TEMPLATES: Readonly<Record<string, string>> = KNOWLEDGE_BASE_TEMPLATES;

export const LOG_MD_TEMPLATE = KNOWLEDGE_BASE_LOG_MD;

export const STARTER_FOLDER_FRONTMATTER_FILENAME = 'frontmatter.yml';

export function buildStarterFolderFrontmatterYaml(folder: StarterFolder): string {
  const lines: string[] = [];
  lines.push(`title: ${yamlScalar(folder.title)}`);
  lines.push(`description: ${yamlScalar(folder.description)}`);
  lines.push('tags:');
  for (const tag of folder.tags) {
    lines.push(`  - ${yamlScalar(tag)}`);
  }
  return `${lines.join('\n')}\n`;
}

function yamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[:#\n"'\\]|^\s|\s$/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}
