<!-- open-knowledge:begin -->
## Open Knowledge

This repo uses Open Knowledge — agent-collaborative wiki tooling exposed via MCP. The scope of tracked content is `.open-knowledge/config.yml` (default: every `**/*.md` under the repo root).

**Reading (wiki markdown).** Prefer the `exec` MCP tool over native `Read` / `Grep` / `Glob`. `exec` runs `cat` / `ls` / `grep` / `find` / `head` / `tail` / `wc` / `sort` / `uniq` / `cut` with pipes, and every returned path is enriched with frontmatter (title, description, tags), backlink count, and recent shadow-repo activity with agent-vs-human attribution. One tool covers read/list/search with attribution that native tools don't see. Examples: `exec("cat docs/auth.md")`, `exec("ls articles/")`, `exec("grep -rn oauth . | head -5")`.

**Writing (wiki markdown).** Route all edits through `write_document` / `edit_document`. Native `Edit` / `sed` land as anonymous `upstream` imports — you lose agent attribution in the shadow-repo log.

**Linking.** When authoring, link liberally with `[[Page Title]]` wiki-links. Redlinks are fine — they signal "this should exist." Every noun-phrase naming another document should be a link. Backlink density is how this knowledge base stays navigable for the next agent.

**Cadence — maintain hubs as you go.** When you create or edit a child doc in a folder that has a hub doc (`INDEX.md`, `README.md`, `REPORT.md`, `SPEC.md`, or a file whose name matches the folder name — e.g. `reports/r1/r1.md`), update the hub to reflect the change before the next child. Interleaved child → hub → child → hub makes the hub the live progress bar and the browser-based editor follows your focus cleanly. Orphan writes get a soft hint in the `write_document` response pointing to the likely hub.

**Non-wiki code (`.ts`, `.py`, configs, etc.).** Keep using native `Read` / `Edit` / `Grep` / `Bash`. The MCP tools are for markdown in `content.include`.
<!-- open-knowledge:end -->
