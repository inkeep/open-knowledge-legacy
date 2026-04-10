---
title: "Source Code Analysis: Replit MCP, filesystem-mcp-rs, and Official MCP Filesystem Server"
description: "Deep source-code analysis of three MCP filesystem servers — exact tool signatures, parameter schemas, response formats, implementation mechanics, and gap analysis against Claude Code's native tools (Read, Write, Edit, Grep, Glob)."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Replit MCP
  - filesystem-mcp-rs
  - Official MCP Filesystem Server
  - Claude Code
topics:
  - MCP tool schemas
  - filesystem tool comparison
  - source code analysis
---

# Evidence: Source Code Analysis of Three MCP Filesystem Servers

**Dimension:** D2 (Virtualized/proxy MCP servers) — deep source-code update
**Date:** 2026-04-02
**Sources:**
- https://github.com/NOVA-3951/Replit-MCP (commit on main, 2 source files)
- https://github.com/ssoj13/filesystem-mcp-rs (commit on main, 6905-line main.rs + 50+ module files)
- https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem (official MCP filesystem server)

---

## Key files referenced

- `NOVA-3951/Replit-MCP/src/index.ts` — Server entry, all 24 tool definitions with exact schemas
- `NOVA-3951/Replit-MCP/src/replit-client.ts` — GraphQL client, all API translation logic (814 lines)
- `ssoj13/filesystem-mcp-rs/src/main.rs` — All tool registrations and handlers (6905 lines, 80+ tools)
- `ssoj13/filesystem-mcp-rs/src/tools/edit.rs` — Edit implementation with regex + whitespace fallback
- `ssoj13/filesystem-mcp-rs/src/tools/grep.rs` — Grep implementation with 4 output modes
- `ssoj13/filesystem-mcp-rs/src/tools/search.rs` — Search/glob with extended filters
- `ssoj13/filesystem-mcp-rs/src/tools/fs_ops.rs` — Core read/head/tail with encoding detection
- `modelcontextprotocol/servers/src/filesystem/index.ts` — Official server, 14 tool registrations
- `modelcontextprotocol/servers/src/filesystem/lib.ts` — Official server implementation

---

## Server 1: Replit MCP (NOVA-3951/Replit-MCP)

### Architecture

- **Language:** TypeScript (56.2% TS, 42.7% JS)
- **Dependencies:** `@modelcontextprotocol/sdk ^1.0.0`, `node-fetch ^3.3.2`, `zod ^3.22.4`
- **Transport:** Stdio only
- **Auth:** `REPLIT_TOKEN` env var (Replit `connect.sid` cookie)
- **Backend:** Replit GraphQL API at `https://replit.com/graphql`
- **Source files:** 2 (index.ts + replit-client.ts)

### Complete Tool Inventory (24 tools)

**Filesystem tools (7):**

| Tool | Parameters | Required | Response |
|------|-----------|----------|----------|
| `read_file` | `path: string`, `replId?: string` | `path` | Raw file content as string (JSON-stringified if object) |
| `write_file` | `path: string`, `content: string`, `replId?: string` | `path`, `content` | `{success: true, message: "File written: <path>"}` |
| `create_file` | `path: string`, `content?: string`, `replId?: string` | `path` | `{success: true, message: "File created: <path>"}` |
| `delete_file` | `path: string`, `replId?: string` | `path` | `{success: true, message: "File deleted: <path>"}` |
| `list_files` | `path?: string`, `replId?: string` | none | `[{path: string, type: "file"|"directory"}, ...]` |
| `create_directory` | `path: string`, `replId?: string` | `path` | `{success: true, message: "Directory created: <path>"}` |
| `search_files` | `query: string`, `replId?: string` | `query` | `[{path: string, matches: string[]}, ...]` |

**Repl management tools (10):**
- `get_current_user`, `list_repls`, `get_repl_by_url`, `set_active_repl`, `run_repl`, `stop_repl`, `create_repl`, `fork_repl`, `delete_repl`, `get_repl_details`

**User tools (2):** `get_user_by_id`, `get_user_by_username`
**Secret tools (3):** `get_secrets`, `set_secret`, `delete_secret`
**Deployment tools (2):** `get_deployment`, `create_deployment`

### read_file: Exact Implementation

```typescript
async readFile(path: string, replId?: string): Promise<string> {
    const query = `
      query ReadFile($replId: String!, $path: String!) {
        repl(id: $replId) {
          ... on Repl {
            fileByPath(path: $path) {
              ... on File { content }
            }
          }
        }
      }
    `;
    // Returns: data.repl.fileByPath.content (raw string)
}
```

**Confidence:** CONFIRMED
**Finding:** `read_file` returns RAW content as a plain string. NO line numbers, NO `cat -n` format, NO offset/limit pagination. The entire file content is returned in one shot.

**Implications:** An agent expecting Claude Code's `cat -n` format (line number + tab + content) would receive raw content without line numbers. Subsequent Edit operations that depend on line-number context would not have that context.

### write_file: Exact Implementation

```typescript
async writeFile(path: string, content: string, replId?: string): Promise<boolean> {
    const query = `
      mutation WriteFile($replId: String!, $path: String!, $content: String!) {
        writeFile(replId: $replId, path: $path, content: $content) {
          __typename
          ... on WriteFileError { message }
        }
      }
    `;
    // Checks __typename === 'WriteFileSuccess'
    // Returns: true (boolean)
}
```

**Confidence:** CONFIRMED
**Finding:** No read-before-write enforcement. No atomic write semantics visible. The GraphQL mutation directly overwrites. `create_file` delegates to `writeFile` (they are the same operation).

### search_files: Exact Implementation

```typescript
async searchFiles(query_str: string, replId?: string): Promise<Array<{ path: string; matches: string[] }>> {
    const gqlQuery = `
      query SearchFiles($replId: String!, $query: String!) {
        repl(id: $replId) {
          ... on Repl {
            search(query: $query) {
              results { path, matches }
            }
          }
        }
      }
    `;
    // Returns: [{path: "src/index.ts", matches: ["matching line 1", ...]}, ...]
}
```

**Confidence:** CONFIRMED
**Finding:** `search_files` is a CONTENT search (not path search). It uses Replit's built-in `search` GraphQL field. The `query` parameter is a plain string (not regex). Returns file paths with matching line snippets. No regex support, no context lines, no output modes, no file type filters. Single parameter: `query`.

### list_files: Exact Implementation

```typescript
async listFiles(path: string = '.', replId?: string): Promise<FileInfo[]> {
    const query = `
      query ListFiles($replId: String!, $path: String!) {
        repl(id: $replId) {
          ... on Repl {
            fileByPath(path: $path) {
              ... on Directory {
                children { filename, ... on File { __typename }, ... on Directory { __typename } }
              }
            }
          }
        }
      }
    `;
    // Returns: [{path: "filename", type: "file"|"directory"}, ...]
}
```

**Confidence:** CONFIRMED
**Finding:** Non-recursive. Lists immediate children only. No glob patterns, no sorting, no filtering.

### Error Handling

```typescript
// In the server's tool handler:
} catch (error) {
    if (error instanceof McpError) { throw error; }
    throw new McpError(
        ErrorCode.InternalError,
        `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
}

// In the client (file not found):
if (!data.repl.fileByPath) {
    throw new Error(`File not found: ${path}`);
}
// Permission/access error:
if (!data.repl) {
    throw new Error(`Repl not found or no access: ${targetReplId}`);
}
```

**Confidence:** CONFIRMED
**Finding:** Errors propagate as McpError with ErrorCode.InternalError wrapping the original error message. File-not-found throws "File not found: <path>". Access errors throw "Repl not found or no access: <replId>".

### Response Format (All Tools)

```typescript
return {
    content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    }],
};
```

**Confidence:** CONFIRMED
**Finding:** All tools return a single `text` content block. Strings are returned as-is (e.g., `read_file` returns raw content). Objects are JSON.stringify'd with 2-space indent. No structured content, no metadata, no pagination info.

### What Replit MCP Does NOT Have

- **No edit/patch tool** (no old_string -> new_string)
- **No regex search** (search_files uses plain string query)
- **No glob/pattern matching** for file paths
- **No line numbers** in read output
- **No offset/limit pagination** for reading
- **No context lines** for search results
- **No read-before-write enforcement**
- **No dry-run mode** for any operation
- **No bash/command execution**

---

## Server 2: filesystem-mcp-rs (ssoj13/filesystem-mcp-rs)

### Architecture

- **Language:** Rust (Cargo workspace)
- **RMCP SDK:** Uses `rmcp` crate (Rust MCP SDK) with `#[tool]` attribute macros
- **Transport:** Stdio (default) or Streamable HTTP (`--stream` flag)
- **Feature flags:** `http-tools`, `s3-tools`, `screenshot-tools` (optional at compile time)
- **Source:** 6905-line main.rs + 50+ module files for tool implementations
- **Security:** AllowedDirs whitelist, symlink escape protection, path validation

### Complete Core Filesystem Tool Inventory

| Tool | Parameters | Notable Features |
|------|-----------|-----------------|
| `read_text_file` | `path`, `head?`, `tail?`, `offset?`, `limit?`, `max_chars?`, `line_numbers?` | Pagination, line numbers, truncation |
| `read_media_file` | `path` | Base64 + MIME type |
| `read_multiple_files` | `paths: string[]` | Parallel read, fault-tolerant |
| `write_file` | `path`, `content` | Atomic write (temp file + rename) |
| `edit_file` | `path`, `edits: [{oldText, newText, isRegex?, replaceAll?}]`, `dryRun?` | Regex, replace_all, dry-run, unified diff |
| `edit_lines` | `path`, `operations: [{op, line/startLine/endLine, text?}]`, `dryRun?` | Line-number-based surgical edits |
| `bulk_edits` | `pattern`, `edits: [...]`, `root?`, `excludePatterns?`, `dryRun?`, `failOnNoMatch?` | Cross-file search/replace |
| `create_directory` | `path` | mkdir -p |
| `list_directory` | `path` | [FILE]/[DIR] prefix format |
| `list_directory_with_sizes` | `path`, `sortBy?` | Size + sort |
| `directory_tree` | `path`, `excludePatterns?`, `maxDepth?`, `showSize?`, `showHash?` | JSON tree |
| `move_file` | `source`, `destination` | Rename/move |
| `copy_file` | `source`, `destination`, `overwrite?` | Copy with overwrite option |
| `delete_path` | `path`, `recursive?` | rm / rm -rf |
| `search_files` | `path`, `pattern`, `excludePatterns?`, `fileType?`, `minSize?`, `maxSize?`, `modifiedAfter?`, `modifiedBefore?` | Glob patterns, extended filters |
| `grep_files` | `path`, `pattern`, `filePattern?`, `excludePatterns?`, `caseInsensitive?`, `contextBefore?`, `contextAfter?`, `maxMatches?`, `invertMatch?`, `outputMode?` | Regex, 4 output modes, context lines |
| `grep_context` | Same as grep_files + `nearbyPatterns`, `nearbyIsRegex?`, `nearbyCaseInsensitive?`, `nearbyDirection?`, `nearbyWindowWords?`, `nearbyWindowChars?`, `nearbyMatchMode?` | Context-aware grep (proximity search) |
| `get_file_info` | `path` | stat metadata |
| `list_allowed_directories` | (none) | Security info |

**Additional tool categories (not filesystem):**
- Binary: `read_binary`, `write_binary`, `extract_binary`, `patch_binary`
- Hash: `file_hash`, `file_hash_multiple`
- Compare: `compare_files`, `compare_directories`
- Archive: `extract_archive`, `create_archive`
- Stats: `file_stats`, `find_duplicates`
- Process: `run_command`, `kill_process`, `list_processes`, `search_processes`
- Log: `tail_file`, `watch_file`
- Structured: `read_json`, `read_pdf`, `read_docx`, `read_xlsx`
- HTTP (feature-gated): `http_request`, `http_request_batch`, `http_download`, `http_download_batch`
- S3 (feature-gated): `s3_list_buckets`, `s3_list`, `s3_stat`, `s3_get`, `s3_put`, `s3_copy`, `s3_delete`, `s3_delete_batch`, `s3_presign`, `s3_get_batch`, `s3_put_batch`, `s3_copy_batch`
- Screenshot (feature-gated): `screenshot_list_monitors`, `screenshot_list_windows`, `screenshot_capture_screen`, `screenshot_capture_window`, `screenshot_capture_region`, `screenshot_copy_to_clipboard`
- Memory: `mem_put`, `mem_get`, `mem_search`, `mem_update`, `mem_link`, `mem_get_summary`
- Thinking: `seq_think`
- Text manipulation: `extract_lines`, `extract_symbols`
- LLM: `llm_transform` (AI-powered text transformation)

**Total tool count: 80+ tools** (varies by feature flags)

### read_text_file: Exact Parameter Schema

```rust
struct ReadTextFileArgs {
    path: String,
    head: FlexU32,      // Optional: first N lines
    tail: FlexU32,      // Optional: last N lines
    offset: FlexU32,    // Optional: start from line N (1-indexed)
    limit: FlexU32,     // Optional: read at most N lines
    max_chars: FlexUsize, // Optional: truncate at N chars
    line_numbers: FlexBool, // Optional: prefix with line numbers
}
```

**Confidence:** CONFIRMED
**Finding:** When `line_numbers: true`, output format is `{line_number:>width} | {content}` (right-aligned number, pipe separator, space, content). This is NOT `cat -n` format (which uses tab separator). The structured response includes a `lines` array with `{lineNumber, text}` objects.

**Response format (with line_numbers: true):**
```json
{
  "content": "  1 | first line\n  2 | second line",
  "meta": {
    "totalLines": 100,
    "lineNumbers": true,
    "startLine": 1,
    "endLine": 2,
    "lineCount": 2
  },
  "lines": [
    {"lineNumber": 1, "text": "first line"},
    {"lineNumber": 2, "text": "second line"}
  ]
}
```

**Response format (without line_numbers):**
```json
{
  "content": "raw file content here",
  "meta": {
    "totalLines": 100
  }
}
```

**Comparison to Claude Code Read:**
- Claude Code returns `cat -n` format: `{line_number}\t{content}` (tab-separated, lines starting at 1)
- filesystem-mcp-rs returns `{line_number} | {content}` (pipe-separated) — different separator
- filesystem-mcp-rs has `offset`/`limit` pagination matching Claude Code's signature
- filesystem-mcp-rs adds `max_chars` truncation and `head`/`tail` (Claude Code does not have these)

### edit_file: Exact Parameter Schema

```rust
struct EditFileArgs {
    path: String,
    edits: Vec<EditOperation>,  // Array of edits
    dry_run: FlexBool,          // Optional: preview only
}
struct EditOperation {
    old_text: String,    // camelCase in JSON: "oldText"
    new_text: String,    // camelCase in JSON: "newText"
    is_regex: FlexBool,  // camelCase: "isRegex", default false
    replace_all: FlexBool, // camelCase: "replaceAll", default false
}
```

**Edit algorithm (from edit.rs):**
1. Normalize line endings (CRLF -> LF)
2. If `is_regex`: compile regex, match against content, replace first or all
3. If literal + `replace_all`: use `String::replace`
4. If literal + single replacement: use `String::find` + `replace_range`
5. **Whitespace-tolerant fallback** (single replacement only): compare line-by-line with `trim()` on each side
6. If no match found: error with helpful message ("Text not found in file...")
7. Return unified diff of changes

**Confidence:** CONFIRMED
**Finding:** The edit implementation is MORE capable than Claude Code's Edit:
- Supports regex patterns with capture groups (`$1`, `$2`)
- Supports `replace_all` (matches Claude Code)
- Has whitespace-tolerant fallback matching (Claude Code requires exact match)
- Supports `dry_run` mode (Claude Code does not)
- Accepts multiple edits in one call (Claude Code accepts one edit per call)
- Returns unified diff (Claude Code does not return a diff)

**Critical difference:** Claude Code's Edit rejects if `old_string` matches multiple times (unless `replace_all`). filesystem-mcp-rs's edit replaces the FIRST occurrence by default and only errors if `old_text` matches ZERO times.

### grep_files: Exact Parameter Schema

```rust
struct GrepFilesArgs {
    path: String,                      // Root directory to search
    pattern: String,                   // Regex pattern
    file_pattern: Option<String>,      // Glob for files to include
    exclude_patterns: Vec<String>,     // Glob patterns to exclude
    case_insensitive: FlexBool,        // -i flag
    context_before: usize,             // -B lines
    context_after: usize,              // -A lines
    max_matches: usize,               // Default 100 (0 = unlimited)
    invert_match: FlexBool,           // -v flag
    output_mode: Option<String>,       // "content"|"count"|"files_with_matches"|"files_without_match"
}
```

**Output modes:**
- `Content`: Returns `[{path, line_number, line, before_context[], after_context[]}, ...]`
- `CountOnly`: Returns `[{path, count}, ...]`
- `FilesWithMatches`: Returns `[path, ...]` (like `grep -l`)
- `FilesWithoutMatch`: Returns `[path, ...]` (like `grep -L`)

**Confidence:** CONFIRMED
**Finding:** 10 parameters, 4 output modes. Uses Rust's `regex` crate with `RegexBuilder` for case-insensitive support. Walks directory tree manually (not using ripgrep binary). Respects AllowedDirs security boundary.

**Comparison to Claude Code Grep (13+ params):**

| Feature | Claude Code Grep | filesystem-mcp-rs grep_files | Match? |
|---------|-----------------|------------------------------|--------|
| Regex pattern | Yes | Yes | YES |
| Case insensitive | `-i` param | `case_insensitive` param | YES |
| Context before | `-B` param | `context_before` param | YES |
| Context after | `-A` param | `context_after` param | YES |
| Context both | `-C` param | Not present (use before+after) | PARTIAL |
| File glob filter | `glob` param | `file_pattern` param | YES (different name) |
| Exclude patterns | Not present | `exclude_patterns` param | filesystem-mcp-rs BETTER |
| File type filter | `type` param (e.g., "js", "py") | Not present (use file_pattern) | Claude Code BETTER |
| Output mode: content | `output_mode: "content"` | `output_mode: "content"` | YES |
| Output mode: files | `output_mode: "files_with_matches"` | `output_mode: "files_with_matches"` | YES |
| Output mode: count | `output_mode: "count"` | `output_mode: "count"` | YES |
| Multiline | `multiline: true` | Not present | Claude Code BETTER |
| Pagination head_limit | `head_limit` (default 250) | `max_matches` (default 100) | SIMILAR (different name/default) |
| Pagination offset | `offset` param | Not present | Claude Code BETTER |
| Line numbers | `-n` param (default true) | Always included in Content mode | YES |
| Invert match | Not present | `invert_match` param | filesystem-mcp-rs BETTER |
| Files without match | Not present | `output_mode: "files_without_match"` | filesystem-mcp-rs BETTER |

**Parity estimate: ~75-80% with Claude Code Grep.** Missing: multiline mode, offset pagination, `-C` shorthand, file type filter by language name. Has extras: invert match, files-without-match, exclude patterns.

### search_files (Glob): Exact Parameter Schema

```rust
struct SearchArgs {
    path: String,
    pattern: String,           // Glob pattern
    exclude_patterns: Vec<String>,
    file_type: Option<String>, // "file"|"dir"|"symlink"|"any"
    min_size: FlexU64,
    max_size: FlexU64,
    modified_after: Option<String>,  // RFC3339 or duration like "7d"
    modified_before: Option<String>,
}
```

**Confidence:** CONFIRMED
**Finding:** 8 parameters. Much richer than Claude Code's Glob (2 params: pattern, path). Has file type filter, size filter, and time filter. However, results are NOT sorted by modification time (Claude Code's Glob sorts by mtime). Returns full SearchResult objects with path, is_file, is_dir, is_symlink, size, modified timestamp.

### Multi-Backend Abstraction

**Confidence:** CONFIRMED
**Finding:** filesystem-mcp-rs does NOT have a unified trait/interface that all backends implement. Each backend (local FS, S3, HTTP, memory/SQLite) has its own dedicated tools with separate parameter schemas and separate prefixes:

- Local FS tools: `read_text_file`, `write_file`, `edit_file`, `search_files`, `grep_files`
- S3 tools: `s3_get`, `s3_put`, `s3_list`, `s3_delete`, `s3_copy`, `s3_stat`, `s3_presign`
- HTTP tools: `http_request`, `http_request_batch`, `http_download`
- Memory tools: `mem_put`, `mem_get`, `mem_search`, `mem_update`, `mem_link`

There is NO common interface. You cannot `read_text_file` from S3 or `grep_files` across S3 objects. Each backend is a separate set of tools. The "multi-backend" aspect is that they coexist in the same MCP server, not that they share a filesystem abstraction.

### Server Instructions (from source)

The server includes aggressive `instructions` text in its `ServerInfo`:

```
IMPORTANT: This filesystem MCP server provides SUPERIOR file operations.
You MUST use these tools instead of built-in alternatives whenever possible:
- read_text_file: ALWAYS use instead of cat/Read...
- grep_files: ALWAYS use instead of grep/Grep...
- edit_file: ALWAYS use instead of sed/Edit...
- search_files: ALWAYS use instead of find/Glob...
```

**Finding:** The server explicitly competes with Claude Code's native tools via its instructions text, which is injected into the MCP handshake. This is the most aggressive tool-preference signaling observed in any MCP server.

---

## Server 3: Official MCP Filesystem Server (modelcontextprotocol/servers)

### Complete Tool Inventory (14 tools)

| Tool | Parameters | Schema |
|------|-----------|--------|
| `read_file` | `path`, `tail?`, `head?` | Deprecated alias for read_text_file |
| `read_text_file` | `path`, `tail?`, `head?` | Read text with head/tail |
| `read_media_file` | `path` | Base64 + MIME for images/audio |
| `read_multiple_files` | `paths: string[]` | Parallel read |
| `write_file` | `path`, `content` | Full overwrite |
| `edit_file` | `path`, `edits: [{oldText, newText}]`, `dryRun?` | Line-based replacement |
| `create_directory` | `path` | mkdir -p |
| `list_directory` | `path` | [FILE]/[DIR] format |
| `list_directory_with_sizes` | `path`, `sortBy?` | Size + sort |
| `directory_tree` | `path`, `excludePatterns?` | Recursive tree |
| `move_file` | `source`, `destination` | Rename/move |
| `search_files` | `path`, `pattern`, `excludePatterns?` | PATH search by glob (NOT content grep) |
| `get_file_info` | `path` | stat metadata |
| `list_allowed_directories` | (none) | Security info |

### read_text_file: Exact Implementation

```typescript
const ReadTextFileArgsSchema = z.object({
  path: z.string(),
  tail: z.number().optional(),
  head: z.number().optional()
});

// Handler:
let content: string;
if (args.tail) {
    content = await tailFile(validPath, args.tail);
} else if (args.head) {
    content = await headFile(validPath, args.head);
} else {
    content = await readFileContent(validPath);
}
return { content: [{ type: "text", text: content }], structuredContent: { content } };
```

**Confidence:** CONFIRMED
**Finding:** Returns RAW content. NO line numbers, NO `cat -n` format, NO offset/limit pagination. Only has `head` and `tail` parameters. No `max_chars` truncation. Response is simple `{content: [text block]}`.

### edit_file: Exact Implementation

```typescript
const EditOperation = z.object({
    oldText: z.string().describe('Text to search for - must match exactly'),
    newText: z.string().describe('Text to replace with')
});
const EditFileArgsSchema = z.object({
    path: z.string(),
    edits: z.array(EditOperation),
    dryRun: z.boolean().default(false)
});
```

**Edit algorithm (from lib.ts):**
1. Normalize line endings
2. For each edit: try exact match first with `String.includes` + `String.replace`
3. If no exact match: try whitespace-tolerant line-by-line comparison (trim each line)
4. If still no match: throw Error "Could not find exact match for edit"
5. Return unified diff

**Confidence:** CONFIRMED
**Finding:** The official server's edit has NO `isRegex` option and NO `replaceAll` option. It accepts multiple edits in one call. Has whitespace-tolerant fallback matching. Has `dryRun`. Returns unified diff.

### search_files: Confirmed as PATH search only

```typescript
server.registerTool("search_files", {
    description: "Recursively search for files and directories matching a pattern...",
    inputSchema: { path: z.string(), pattern: z.string(), excludePatterns: z.array(z.string()) }
});
// Implementation uses minimatch for glob pattern matching against file PATHS
```

**Confidence:** CONFIRMED
**Finding:** `search_files` searches file PATHS by glob pattern, NOT file CONTENTS. There is NO content grep in the official MCP filesystem server. This is the single largest gap.

### What the Official Server Does NOT Have

- **No content grep/search** — critical gap
- **No offset/limit pagination** for read (only head/tail)
- **No line numbers** in read output
- **No regex in edit** (literal match only)
- **No replaceAll** in edit
- **No max_chars truncation**
- **No bash/command execution**
- **No file type filtering** in search
- **No invert match** in search
- **No copy_file** tool
- **No delete_path** tool

---

## Synthesis: Gap Analysis Against Claude Code Native Tools

### Claude Code's Built-in Tool Signatures (for reference)

```
Read(file_path: string, offset?: number, limit?: number)
  → Returns: cat -n format (line_number\tcontent), lines starting at 1

Write(file_path: string, content: string)
  → Requires: prior Read of the file (enforced by the system)
  → Returns: success/failure

Edit(file_path: string, old_string: string, new_string: string, replace_all?: boolean)
  → Requires: old_string must be unique (unless replace_all)
  → Returns: success/failure

Grep(pattern: string, path?: string, output_mode?: string, glob?: string, type?: string,
     -A?: number, -B?: number, -C?: number, -i?: boolean, -n?: boolean,
     multiline?: boolean, head_limit?: number, offset?: number, context?: number)
  → Returns: matches in content/files_with_matches/count modes
  → Default head_limit: 250

Glob(pattern: string, path?: string)
  → Returns: matching file paths sorted by modification time
```

### Closest MCP Match: filesystem-mcp-rs

| Claude Code Tool | filesystem-mcp-rs Equivalent | Parity % | Key Differences |
|-----------------|------------------------------|----------|-----------------|
| Read | `read_text_file` | **80%** | Has offset/limit ✓, line_numbers option ✓, BUT different separator (pipe vs tab), has extra max_chars/head/tail |
| Write | `write_file` | **70%** | No read-before-write enforcement, uses atomic write (temp+rename) |
| Edit | `edit_file` | **90%** | Supports regex (extra), replaceAll ✓, dryRun (extra), batch edits (extra), whitespace fallback (extra). Missing: Claude Code's uniqueness check |
| Grep | `grep_files` | **75-80%** | Has regex ✓, context lines ✓, 4 output modes ✓, case insensitive ✓. Missing: multiline, offset pagination, -C shorthand, type filter |
| Glob | `search_files` | **60%** | Has glob ✓, exclude patterns (extra), type/size/time filters (extra). Missing: mtime sorting, simpler interface |

### Compared to Replit MCP

| Claude Code Tool | Replit MCP Equivalent | Parity % | Key Differences |
|-----------------|----------------------|----------|-----------------|
| Read | `read_file` | **20%** | Raw content only, no pagination, no line numbers |
| Write | `write_file` | **30%** | No read-before-write, no error diff, basic success/fail |
| Edit | (none) | **0%** | No edit tool at all |
| Grep | `search_files` | **15%** | Plain text search only, no regex, no context, no output modes |
| Glob | `list_files` | **10%** | Directory listing only, no recursive glob, no patterns |

### Compared to Official MCP Filesystem Server

| Claude Code Tool | Official MCP Equivalent | Parity % | Key Differences |
|-----------------|------------------------|----------|-----------------|
| Read | `read_text_file` | **40%** | Has head/tail but no offset/limit, no line numbers |
| Write | `write_file` | **50%** | No read-before-write, atomic write via temp+rename |
| Edit | `edit_file` | **60%** | Batch edits ✓, dryRun ✓, whitespace fallback ✓. Missing: regex, replaceAll |
| Grep | (none) | **0%** | No content search at all |
| Glob | `search_files` | **40%** | Path glob matching ✓, exclude patterns ✓. No mtime sort, no extended filters |

### What Would Need to Be Built to Close the Gap

Starting from filesystem-mcp-rs (the closest):

1. **Line number format:** Change `{n} | {content}` to `{n}\t{content}` (tab separator) to match `cat -n`
2. **Multiline grep:** Add `multiline` flag to `grep_files` with `RegexBuilder::dot_matches_new_line`
3. **Grep offset pagination:** Add `offset` parameter to skip first N results
4. **Grep `-C` shorthand:** Add `context` param that sets both before and after
5. **Grep type filter:** Map language names (js, py, rs) to glob patterns
6. **Glob mtime sorting:** Sort search_files results by modification time
7. **Edit uniqueness check:** Add mode that rejects when old_text matches multiple times (unless replace_all)
8. **Read-before-write enforcement:** Track read state per file path in server state

Items 1-6 are straightforward modifications to existing code. Items 7-8 require behavioral changes that may conflict with how other agents use the same tools. The total gap from filesystem-mcp-rs to Claude Code behavioral parity is approximately 8 discrete changes.

---

## Negative Searches

- Searched for: `cat -n` format in all three servers → NOT FOUND in any
- Searched for: common trait/interface across backends in filesystem-mcp-rs → NOT FOUND (each backend is independent)
- Searched for: content grep in official MCP filesystem server → NOT FOUND (search_files is path-only)
- Searched for: read-before-write enforcement in any MCP server → NOT FOUND

---

## Gaps / Follow-ups

- The `FlexBool`/`FlexU32`/`FlexUsize` types in filesystem-mcp-rs implement flexible deserialization (accepting strings like "true"/"false"/"42" alongside native types) — this is a significant LLM-friendliness feature not seen in other servers
- filesystem-mcp-rs's `grep_context` tool (proximity-aware search) has no equivalent in Claude Code or any other MCP server — this is a novel capability
- The `mem_*` tools (SQLite memory) in filesystem-mcp-rs provide agent memory persistence not found in filesystem servers — a convergent evolution toward agent infrastructure
