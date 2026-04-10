# Evidence: Dataview, Templater, and Maps of Content

## Dataview Plugin

### Core Facts
- **GitHub**: [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) (~8,700 stars)
- **Maintenance status**: Effectively in maintenance mode as of April 2026. Last commit >10 months ago (as of Feb 2026). Maintainer's focus shifted to Datacore.
- **Successor**: [blacksmithgu/datacore](https://github.com/blacksmithgu/datacore) — 2-10x better query/rendering, WYSIWYG editable tables, React-based JS views. Available via BRAT for beta testing.
- **Alternative**: Obsidian Bases (built-in core plugin from Obsidian team) — native database views, expected to replace many Dataview use cases.

### DQL (Dataview Query Language)
- SQL-inspired with 4 query types: TABLE, LIST, TASK, CALENDAR
- Data commands: FROM (tags, folders, links), WHERE, SORT, GROUP BY, FLATTEN, LIMIT
- FROM supports Boolean logic: `FROM #status/open OR #status/wip`

### DataviewJS
- Full JavaScript execution in `dataviewjs` codeblocks
- `dv` object exposes: `dv.pages()`, `dv.table()`, `dv.list()`, `dv.taskList()`, `dv.header()`, `dv.paragraph()`
- **Security concern**: Runs at plugin privilege level — can rewrite/create/delete files, make network calls
- Can generate complex multi-section output with loops and conditionals

### Inline Queries
- `` `= expression` `` syntax for embedding single values in text
- Examples: `` `= this.file.ctime` ``, `` `= date(today) `` ``
- DataviewJS variant: `$= dv.expression`

### Frontmatter Integration
- All YAML frontmatter fields automatically available as queryable fields
- Inline fields via `Key:: Value` syntax in note body
- Implicit fields: `file.name`, `file.path`, `file.tags`, `file.inlinks`, `file.outlinks`, `file.ctime`, `file.mtime`, etc.

### Performance at Scale
- In-memory cache of all metadata
- Official claim: "hundreds of thousands of notes without issue"
- **Real reports contradict this:**
  - ~4,000 notes: "really heavy"
  - ~6,000 notes: disabled on mobile
  - ~9,000 notes: CPU 199.6%, "barely usable" ([Issue #1280](https://github.com/blacksmithgu/obsidian-dataview/issues/1280))
- Exclusionary queries (`FROM -"folder"`) perform worse than inclusionary
- **Cannot index note body text** — only metadata. Full vault body text would be 800MB-2GB.

### MOC Generation Capability
- Tag-based MOCs: query all notes with specific tags
- Folder-based MOCs: query all notes in folder hierarchy
- Backlink-based MOCs: query notes linking back to the MOC itself
- Same note can appear in multiple MOCs without duplication

### Limitations
1. **Output is read-only** — displays data, doesn't edit notes
2. **Cannot query note body text** — only metadata
3. **Rendering inconsistencies** — inline queries fail in Live Preview, work in Reading mode
4. **DQL cannot create/modify files** (DataviewJS can)
5. **Not real-time** — re-evaluates on note switch or reload
6. **Maintenance risk** — effectively in maintenance mode

## Templater Plugin

### Core Facts
- **GitHub**: [SilentVoid13/Templater](https://github.com/SilentVoid13/Templater) (~4,700 stars)
- **Latest**: v2.18.1 (January 29, 2026) — actively maintained

### Template Syntax
- `<% expression %>` — interpolation (evaluates + inserts)
- `<%* code %>` — execution (runs JS without inserting)
- `<% tp.module.function() %>` — built-in function calls

### Built-in Modules
- `tp.date` — date manipulation
- `tp.file` — file operations (create, move, rename, path, title)
- `tp.system` — prompts, suggesters, clipboard
- `tp.obsidian` — Obsidian API functions including `requestUrl` (bypasses CORS)
- `tp.user` — custom user-defined functions

### Automation Mechanisms
1. **Folder Templates** — auto-apply template when creating note in designated folder
2. **Trigger on new file** — regex-based path matching rules (mutually exclusive with Folder Templates)
3. **Startup Templates** — execute once on Obsidian load, can set up event hooks
4. **`tp.file.create_new()`** — programmatic multi-file creation
5. **`tp.file.move()`** — move current file to new location

### JavaScript Execution
- **Arbitrary JS** via `<%* %>` tags
- **File system access**: create, move, rename files via `tp.file.*`
- **External APIs**: `tp.obsidian.requestUrl(url)` (recommended, bypasses CORS)
- **System commands**: Execute shell commands via "System Command User Functions" setting

### User Scripts
- `.js` files in configured Scripts folder
- CommonJS modules: `module.exports = async function(tp) { ... }`
- Called as: `<% tp.user.my_script(tp) %>`
- `tp` must be explicitly passed as argument

### Integration with Other Plugins
- **Dataview**: Access Dataview API from Templater via `app.plugins.getPlugin("templater-obsidian")`
- **Events**: Startup Templates can register hooks to Obsidian events
- **Any plugin**: Access to `app` global enables interaction with any plugin's API

### Critical Distinction
Templater executes **once** and replaces template commands with output. It is NOT dynamic like Dataview. For wiki compilation:
- **Templater** = generator (creates/scaffolds notes)
- **Dataview** = indexer (creates dynamic cross-references)

## Maps of Content (MOCs)

### Definition
A note primarily containing links to other notes, serving as navigational hub / index. Popularized by Nick Milo ([Linking Your Thinking](https://www.linkingyourthinking.com/) framework).

### Manual vs Automated Approaches

| Approach | Tools | Pros | Cons |
|----------|-------|------|------|
| **Manual** | Hand-curated links | Intentional, aids understanding | Doesn't scale |
| **Semi-automated** | Manual + Dataview queries | Best of both | Still requires initial structure |
| **Fully automated** | Waypoint, AutoMOC, InsightA | Scales, always current | May lack intentionality |

### Automated MOC Plugins

1. **Waypoint** ([IdreesInc/Waypoint](https://github.com/IdreesInc/Waypoint)): Dynamic MOCs within folder notes. Auto-detects note changes. Developer now recommends Obsidian Folder Overview.

2. **AutoMOC** ([dalcantara7/obsidian-auto-moc](https://github.com/dalcantara7/obsidian-auto-moc)): Imports missing linked/tagged mentions into current note. Supports headings, list formats, folder exclusions.

3. **InsightA** ([HongjianTang/obsidian-insighta](https://github.com/HongjianTang/obsidian-insighta)): LLM-powered. Transforms long articles into atomic notes + MOCs. Zettelkasten method. **Closest existing plugin to wiki compilation.**

### Nick Milo's LYT Principles
- Create MOC when you feel overwhelmed ("Mental Squeeze Point")
- Linking over categorizing (brain works by association)
- MOCs as thinking tools, not just indexes
- Home note → high-level MOCs → specific MOCs (navigable hierarchy)

## Karpathy Workflow Relevance

**For wiki compilation:**
- Dataview generates dynamic indexes/cross-references automatically
- Templater can scaffold articles from templates + call LLM APIs
- MOC patterns provide structural model for compiled wiki
- InsightA most closely approximates the "raw → atomic notes → MOC" pipeline

**Gaps:**
- Dataview is in maintenance mode (risk for long-term investment)
- No built-in "compile raw sources into wiki article" workflow
- Templater executes once — no continuous compilation loop
- MOC generation is either manual or simplistic (folder/tag-based)
- Nobody has automated the full Karpathy compile loop end-to-end
