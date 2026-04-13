# Changelog

## 2026-04-12 — Initial report

**Why this report exists:** Complement to the existing `wiki-links-backlinks-architecture/` report. The prior report covered link format, index architecture, editor integration deeply across Obsidian/Logseq/Outline/AFFiNE/Foam/Dendron/Marksman. User wanted to fill gaps with tools exhibiting architectural choices not yet covered — typed links, transclusion-as-primitive, distinctive UX patterns, ML-augmented linking.

**Tools covered:** Roam Research, Org-roam, TiddlyWiki, Tana, Anytype, Notion (deeper than prior-table mention), Heptabase, Reflect, SilverBullet.

**Structure:**
- 8 evidence files (Tana + Anytype grouped into one as they exhibit the same typed-link architecture)
- REPORT.md with cross-cutting comparison tables along 4 axes + per-tool brief synthesis

**Research method:** 5 parallel subagents, one per tool or tool-pair. All findings primary-source-cited.

### Subagent anomaly noted
One subagent (Org-roam + TiddlyWiki) flagged a prompt-injection attempt in a fetched page — an extraneous "available skills" block unrelated to documentation content. Subagent correctly ignored it and continued.

### Confidence caveats
- Reflect findings are all vendor marketing; no independent verification
- Tana/Heptabase internals not externally documented; findings from behavior + official help
- Notion internals inferred from developer API + official Data Model blog post
