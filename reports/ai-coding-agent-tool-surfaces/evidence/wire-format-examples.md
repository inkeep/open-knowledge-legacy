# Evidence: Wire Format Examples — Concrete Tool Call Request/Response

**Dimension:** Exact JSON/text that flows between agent and tool for every core operation
**Date:** 2026-03-20
**Sources:** Claude Code self-documentation (running system), OSS repos (opencode, aider, continue, OpenHands), leaked system prompts (x1xhlol/system-prompts-and-models-of-ai-tools) for Cursor, Windsurf, Lovable, Devin, Cline official docs

---

## 1. READ FILE

### Claude Code — Read

**Request:**
```json
{
  "file_path": "/Users/you/project/src/Button.tsx",
  "offset": 1,
  "limit": 50
}
```

**Response (cat -n format — spaces + line number + tab + content):**
```
     1	import React from 'react';
     2
     3	interface ButtonProps {
     4	  label: string;
     5	  variant?: 'primary' | 'secondary';
     6	}
     7
     8	export function Button({ label, variant = 'primary' }: ButtonProps) {
     9	  return (
    10	    <button className={`px-4 py-2 rounded-lg ${
    11	      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    12	    }`}>
    13	      {label}
    14	    </button>
    15	  );
    16	}
```

**Partial read (offset=8, limit=5):**
```
     8	export function Button({ label, variant = 'primary' }: ButtonProps) {
     9	  return (
    10	    <button className={`px-4 py-2 rounded-lg ${
    11	      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    12	    }`}>
```

### OpenCode — read

**Request:**
```json
{
  "filePath": "/home/user/project/src/index.ts",
  "offset": 1,
  "limit": 100
}
```

**Response (XML-wrapped, numbered `N: content`):**
```
<path>/home/user/project/src/index.ts</path>
<type>file</type>
<content>
1: import express from "express"
2: const app = express()
3: app.get("/", (req, res) => res.send("hello"))

(End of file - total 3 lines)
</content>
```

### Continue — read_file / read_file_range

**Request (full):**
```json
{ "filepath": "src/utils/helpers.ts" }
```

**Request (range):**
```json
{ "filepath": "src/app.ts", "startLine": 10, "endLine": 25 }
```

### OpenHands — str_replace_editor (command: view)

**Request:**
```json
{
  "command": "view",
  "path": "/workspace/src/app.py",
  "view_range": [1, 50],
  "security_risk": "low"
}
```

### Cursor — read_file

**Request:**
```json
{
  "target_file": "src/Button.tsx",
  "start_line_one_indexed": 1,
  "end_line_one_indexed_inclusive": 50,
  "should_read_entire_file": false
}
```

Max 250 lines per call.

### MCP Filesystem Server — read_file

**JSON-RPC Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/Users/you/project/src/Button.tsx" }
  }
}
```

**JSON-RPC Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "import React from 'react';\n\nexport function Button..." }],
    "isError": false
  }
}
```

### Lovable — lov-view (XML tag format)

```xml
<lov-view file_path="src/components/Button.tsx" />
```

With line range:
```xml
<lov-view file_path="src/components/Button.tsx" lines="1-50, 100-150" />
```

---

## 2. EDIT FILE — String Replace

### Claude Code — Edit

**Request (successful):**
```json
{
  "file_path": "/Users/you/project/src/Button.tsx",
  "old_string": "    <button className={`px-4 py-2 rounded-lg ${\n      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'\n    }`}>",
  "new_string": "    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${\n      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'\n    }`}>"
}
```

**Response (success):**
```
The file /Users/you/project/src/Button.tsx has been edited successfully.
```

**Response (not found):**
```
Error: The old_string was not found in the file. Make sure it matches exactly, including whitespace and indentation.
```

**Response (multiple matches):**
```
Error: The old_string appears multiple times in the file. Please provide a larger, more unique string to match, or use replace_all: true.
```

**Request (replace_all):**
```json
{
  "file_path": "/Users/you/project/src/theme.ts",
  "old_string": "#3b82f6",
  "new_string": "#2563eb",
  "replace_all": true
}
```

### OpenCode — edit

**Request:**
```json
{
  "filePath": "/home/user/project/src/index.ts",
  "oldString": "const app = express()",
  "newString": "const app = express()\napp.use(express.json())"
}
```

**Response (with LSP diagnostics):**
```
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="/home/user/project/src/index.ts">
Line 5: error TS2304: Cannot find name 'foo'.
</diagnostics>
```

Note: OpenCode has a 9-level fuzzy replacer chain (SimpleReplacer → LineTrimmedReplacer → BlockAnchorReplacer → WhitespaceNormalizedReplacer → IndentationFlexibleReplacer → EscapeNormalizedReplacer → TrimmedBoundaryReplacer → ContextAwareReplacer → MultiOccurrenceReplacer). Claude Code uses strict exact match only.

### Continue — single_find_and_replace

**Request:**
```json
{
  "filepath": "src/Button.tsx",
  "old_string": "bg-blue-500 text-white",
  "new_string": "bg-blue-500 text-white hover:bg-blue-600",
  "replace_all": false
}
```

### Continue — multi_edit (batch)

**Request:**
```json
{
  "filepath": "src/Button.tsx",
  "edits": [
    { "old_string": "bg-blue-500", "new_string": "bg-indigo-500" },
    { "old_string": "rounded-lg", "new_string": "rounded-xl", "replace_all": true }
  ]
}
```

### OpenHands — str_replace_editor (command: str_replace)

**Request:**
```json
{
  "command": "str_replace",
  "path": "/workspace/src/app.py",
  "old_str": "def hello():\n    return \"Hello, World!\"",
  "new_str": "def hello(name: str = \"World\"):\n    return f\"Hello, {name}!\"",
  "security_risk": "low"
}
```

### Devin — str_replace (from leaked system prompt)

**Request:**
```json
{
  "command": "str_replace",
  "path": "/home/user/repos/project/src/auth.py",
  "old_str": "    token = generate_token(user_id)\n    return token",
  "new_str": "    token = generate_token(user_id, expires_in=3600)\n    logger.info(f\"Token generated for user {user_id}\")\n    return token"
}
```

### MCP Filesystem Server — edit_file

**JSON-RPC Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "edit_file",
    "arguments": {
      "path": "/Users/you/project/src/Button.tsx",
      "edits": [
        {
          "oldText": "bg-blue-500 text-white",
          "newText": "bg-blue-500 text-white hover:bg-blue-600"
        }
      ],
      "dryRun": false
    }
  }
}
```

---

## 3. EDIT FILE — Semantic Diff (Apply Model)

### Cursor — edit_file

**Request:**
```json
{
  "target_file": "src/Button.tsx",
  "instructions": "Add hover state and shadow to the button",
  "code_edit": "export function Button({ label, variant = 'primary' }: ButtonProps) {\n  return (\n    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-shadow ${\n      // ... existing code ...\n    }`}>\n      {label}\n    </button>\n  );\n}"
}
```

The `// ... existing code ...` markers tell the apply model (fine-tuned Llama 3 70B at ~1000 tok/s) which sections to preserve from the original file. The apply model expands these into the complete file content.

### Continue — edit_existing_file

**Request:**
```json
{
  "filepath": "src/Button.tsx",
  "changes": "// ... existing imports ...\n\nexport function Button({ label, variant = 'primary' }: ButtonProps) {\n  return (\n    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${\n      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'\n    }`}>\n      {label}\n    </button>\n  );\n}"
}
```

### OpenHands — edit_file (LLM-based)

**Request:**
```json
{
  "path": "/workspace/src/app.py",
  "content": "#EDIT: Add logging and fix method signature\nclass MyClass:\n    def __init__(self):\n        # ... existing code ...\n        self.y = 2\n\nprint(MyClass().y)",
  "start": 1,
  "end": -1,
  "security_risk": "low"
}
```

---

## 4. EDIT FILE — Patch Format

### Codex CLI — apply_patch

```
*** Begin Patch
*** Update File: src/Button.tsx
@@ export function Button({ label, variant = 'primary' }
   return (
-    <button className={`px-4 py-2 rounded-lg ${
+    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${
       variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
     }`}>
*** End Patch
```

**New file:**
```
*** Begin Patch
*** Add File: src/Card.tsx
+import React from 'react';
+
+export function Card({ title, children }) {
+  return (
+    <div className="rounded-xl border p-6">
+      <h3>{title}</h3>
+      {children}
+    </div>
+  );
+}
*** End Patch
```

**Delete file:**
```
*** Begin Patch
*** Delete File: src/OldComponent.tsx
*** End Patch
```

3 lines of context, relative paths only. Progressive fallback: exact → whitespace-insensitive.

### Aider — SEARCH/REPLACE Block Format

```
src/Button.tsx
```tsx
<<<<<<< SEARCH
    <button className={`px-4 py-2 rounded-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    }`}>
=======
    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'
    }`}>
>>>>>>> REPLACE
```

**Create new file (empty SEARCH):**
```
src/Card.tsx
```tsx
<<<<<<< SEARCH
=======
import React from 'react';

export function Card({ title, children }) {
  return (
    <div className="rounded-xl border p-6">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
>>>>>>> REPLACE
```

**Delete code (empty REPLACE):**
```
src/Button.tsx
```tsx
<<<<<<< SEARCH
// TODO: remove this deprecated function
function oldHelper() {
  return null;
}

=======
>>>>>>> REPLACE
```

Regex delimiters: `HEAD = r"^<{5,9} SEARCH>?\s*$"`, `DIVIDER = r"^={5,9}\s*$"`, `UPDATED = r"^>{5,9} REPLACE\s*$"`

### Aider — Unified Diff Format

```diff
--- src/Button.tsx
+++ src/Button.tsx
@@ ... @@
-    <button className={`px-4 py-2 rounded-lg ${
+    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${
       variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
     }`}>
```

`@@ ... @@` hunk headers (no line numbers needed). New file: `--- /dev/null` → `+++ path/to/new/file.ext`.

---

## 5. WRITE FILE — Full Replacement

### Claude Code — Write

**Request:**
```json
{
  "file_path": "/Users/you/project/src/Card.tsx",
  "content": "import React from 'react';\n\nexport function Card({ title, children }: { title: string; children: React.ReactNode }) {\n  return (\n    <div className=\"rounded-xl border p-6 shadow-sm\">\n      <h3 className=\"text-lg font-semibold mb-2\">{title}</h3>\n      {children}\n    </div>\n  );\n}\n"
}
```

**Response:**
```
File created successfully at: /Users/you/project/src/Card.tsx
```

Constraint: Must Read first if file exists (session-tracked).

### OpenCode — write

**Request:**
```json
{
  "filePath": "/home/user/project/src/config.json",
  "content": "{\n  \"port\": 3000,\n  \"host\": \"localhost\"\n}"
}
```

### Continue — create_new_file

**Request:**
```json
{
  "filepath": "src/utils/newHelper.ts",
  "contents": "export function add(a: number, b: number): number {\n  return a + b;\n}\n"
}
```

### OpenHands — str_replace_editor (command: create)

**Request:**
```json
{
  "command": "create",
  "path": "/workspace/src/utils.py",
  "file_text": "def add(a: int, b: int) -> int:\n    return a + b\n",
  "security_risk": "low"
}
```

### Lovable — lov-write (XML, with keep-existing markers)

```xml
<lov-write file_path="src/components/Card.tsx">
import React from 'react';

// ... keep existing imports (Button, Icon)

export function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-xl border p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

// ... keep existing code (CardGrid, CardList)
</lov-write>
```

The `// ... keep existing code (name)` markers are expanded by Morph Fast Apply (7B model at 10,500 tok/s).

### MCP Filesystem Server — write_file

**JSON-RPC Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "write_file",
    "arguments": {
      "path": "/Users/you/project/src/Card.tsx",
      "content": "import React from 'react';\n\nexport function Card({ title, children }) {\n  return <div>{children}</div>;\n}\n"
    }
  }
}
```

---

## 6. SEARCH CONTENT

### Claude Code — Grep

**Request (content mode, default):**
```json
{
  "pattern": "className.*bg-blue",
  "path": "/Users/you/project/src",
  "include": "*.tsx"
}
```

**Response:**
```
/Users/you/project/src/Button.tsx
10:    <button className={`px-4 py-2 rounded-lg ${
11:      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
```

**Request (files_with_matches):**
```json
{
  "pattern": "useState",
  "path": "/Users/you/project/src",
  "output_mode": "files_with_matches"
}
```

**Response:**
```
/Users/you/project/src/App.tsx
/Users/you/project/src/pages/Home.tsx
```

**Request (count):**
```json
{
  "pattern": "TODO",
  "path": "/Users/you/project",
  "output_mode": "count"
}
```

**Response:**
```
/Users/you/project/src/App.tsx:2
/Users/you/project/src/utils.ts:1
```

### OpenCode — grep

**Request:**
```json
{
  "pattern": "import.*express",
  "path": "/home/user/project/src",
  "include": "*.ts"
}
```

**Response:**
```
Found 2 matches

/home/user/project/src/index.ts:
  Line 1: import express from "express"

/home/user/project/src/server.ts:
  Line 3: import { Router } from "express"
```

### Cursor — grep_search

**Request:**
```json
{
  "query": "className.*bg-blue",
  "include_pattern": "*.tsx",
  "case_sensitive": false
}
```

Max 50 matching lines.

### Continue — grep_search

**Request:**
```json
{ "query": ".*useState.*" }
```

### Lovable — lov-search-files

```xml
<lov-search-files>
  <query>className.*bg-blue</query>
  <include_pattern>*.tsx</include_pattern>
  <case_sensitive>false</case_sensitive>
</lov-search-files>
```

---

## 7. SEARCH PATHS

### Claude Code — Glob

**Request:**
```json
{
  "pattern": "src/**/*.tsx",
  "path": "/Users/you/project"
}
```

**Response (sorted by mtime, most recent first):**
```
/Users/you/project/src/App.tsx
/Users/you/project/src/Button.tsx
/Users/you/project/src/Card.tsx
/Users/you/project/src/pages/Home.tsx
```

### OpenCode — glob

**Request:**
```json
{
  "pattern": "**/*.ts",
  "path": "/home/user/project/src"
}
```

### Cursor — file_search

**Request:**
```json
{ "query": "Button" }
```

Up to 10 fuzzy-matched file paths.

### Cursor — list_dir

**Request:**
```json
{ "relative_workspace_path": "src/components" }
```

### Continue — file_glob_search

**Request:**
```json
{ "pattern": "**/*.tsx" }
```

### MCP Filesystem Server — list_directory / directory_tree

**Request (list_directory):**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "list_directory",
    "arguments": { "path": "/Users/you/project/src" }
  }
}
```

**Request (directory_tree):**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "directory_tree",
    "arguments": { "path": "/Users/you/project/src" }
  }
}
```

---

## 8. BASH / SHELL EXECUTION

### Claude Code — Bash

**Request:**
```json
{
  "command": "cd /Users/you/project && npm run build 2>&1 | head -20",
  "timeout": 30000
}
```

**Response (success):**
```
> project@1.0.0 build
> next build

   ▲ Next.js 15.1.0
   Creating an optimized production build ...
 ✓ Compiled successfully
```

**Response (error — exit code shown):**
```
FAIL src/Button.test.tsx
  ● Button › renders with primary variant
    Expected: "bg-blue-600"
    Received: "bg-blue-500"

Tests: 1 failed, 3 passed, 4 total
Exit code: 1
```

**Request (background):**
```json
{
  "command": "npm run dev",
  "run_in_background": true
}
```

### OpenCode — bash

**Request:**
```json
{
  "command": "npm test",
  "timeout": 30000,
  "workdir": "/home/user/project",
  "description": "Run project test suite"
}
```

### Codex CLI — shell

**Request:**
```json
{
  "command": "cat src/Button.tsx",
  "workdir": "/home/user/project",
  "timeout_ms": 10000
}
```

All file operations in Codex route through shell (cat for read, rg for search, apply_patch for edit).

### Continue — run_terminal_command

**Request:**
```json
{ "command": "git log --oneline -5", "waitForCompletion": true }
```

### OpenHands — execute_bash

**Request:**
```json
{
  "command": "find /workspace -name '*.py' | head -20",
  "is_input": "false",
  "security_risk": "low"
}
```

---

## 9. CLINE XML TOOL FORMAT

### read_file
```xml
<read_file>
<path>src/components/Button.tsx</path>
</read_file>
```

### write_to_file
```xml
<write_to_file>
<path>src/components/Card.tsx</path>
<content>
import React from 'react';

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}
</content>
</write_to_file>
```

### replace_in_file
```xml
<replace_in_file>
<path>src/components/Button.tsx</path>
<diff>
<<<<<<< SEARCH
    <button className="px-4 py-2 bg-blue-500">
=======
    <button className="px-4 py-2 bg-blue-500 rounded-lg hover:bg-blue-600">
>>>>>>> REPLACE
</diff>
</replace_in_file>
```

Multiple SEARCH/REPLACE blocks can be included in one `<diff>` section — Cline applies them in order.

---

## 10. LOVABLE XML TOOL FORMAT

### lov-write
```xml
<lov-write file_path="src/components/Button.tsx">
import React from 'react';

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, variant = 'primary' }: ButtonProps) {
  return (
    <button className={`px-4 py-2 rounded-lg shadow-md ${
      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    }`}>
      {label}
    </button>
  );
}
</lov-write>
```

### lov-line-replace
```xml
<lov-line-replace file_path="src/components/Button.tsx" first_replaced_line="10" last_replaced_line="12">
<search>
    <button className={`px-4 py-2 rounded-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    }`}>
</search>
<replace>
    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'
    }`}>
</replace>
</lov-line-replace>
```

### lov-view
```xml
<lov-view file_path="src/components/Button.tsx" />
```

With line range:
```xml
<lov-view file_path="src/components/Button.tsx" lines="1-50, 100-150" />
```

### lov-search-files
```xml
<lov-search-files>
  <query>className.*shadow</query>
  <include_pattern>*.tsx</include_pattern>
  <case_sensitive>false</case_sensitive>
</lov-search-files>
```

---

## 11. WINDSURF (CASCADE) TOOL FORMAT

### replace_file_content (edit existing files)

Windsurf uses PascalCase JSON parameters with a mandatory `toolSummary` first argument and `ReplacementChunks` array.

**Request:**
```json
{
  "toolSummary": "adding hover state to button",
  "TargetFile": "src/components/Button.tsx",
  "Instruction": "Add hover state and shadow to the primary button variant",
  "CodeMarkdownLanguage": "typescript",
  "ReplacementChunks": [
    {
      "TargetContent": "    <button className={`px-4 py-2 rounded-lg ${\n      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'\n    }`}>",
      "ReplacementContent": "    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${\n      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'\n    }`}>",
      "AllowMultiple": false
    }
  ]
}
```

### write_to_file (new files only)

```json
{
  "toolSummary": "creating card component",
  "TargetFile": "src/components/Card.tsx",
  "CodeContent": "import React from 'react';\n\nexport function Card({ title, children }) {\n  return (\n    <div className=\"rounded-xl border p-6\">\n      <h3>{title}</h3>\n      {children}\n    </div>\n  );\n}",
  "EmptyFile": false
}
```

### view_file

```json
{
  "toolSummary": "reading button component",
  "AbsolutePath": "/Users/you/project/src/components/Button.tsx",
  "StartLine": 1,
  "EndLine": 50,
  "IncludeSummaryOfOtherLines": true
}
```

### grep_search

```json
{
  "toolSummary": "finding bg-blue usage",
  "Query": "bg-blue",
  "SearchPath": "/Users/you/project/src",
  "MatchPerLine": true,
  "Includes": ["*.tsx"],
  "CaseInsensitive": false,
  "IsRegex": false
}
```

---

## 12. DEVIN TOOL FORMAT (XML command tags)

Devin uses XML tags with attributes. Content goes inside the tag body.

### open_file (read)
```xml
<open_file path="/home/ubuntu/project/src/Button.tsx" start_line="1" end_line="50"/>
```

### str_replace (edit)
```xml
<str_replace path="/home/ubuntu/project/src/Button.tsx">
<old_str>    <button className={`px-4 py-2 rounded-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white' : 'bg-gray-200'
    }`}></old_str>
<new_str>    <button className={`px-4 py-2 rounded-lg shadow-md hover:shadow-lg ${
      variant === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 hover:bg-gray-300'
    }`}></new_str>
</str_replace>
```

### create_file (write)
```xml
<create_file path="/home/ubuntu/project/src/components/Card.tsx">
import React from 'react';

export function Card({ title, children }) {
  return (
    <div className="rounded-xl border p-6">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
</create_file>
```

### insert (at line number)
```xml
<insert path="/home/ubuntu/project/src/Button.tsx" insert_line="2">
import { cn } from '../utils/cn';
</insert>
```

### shell
```xml
<shell id="default" exec_dir="/home/ubuntu/project">
npm run build 2>&1 | head -20
</shell>
```

### find_filecontent (search)
```xml
<find_filecontent path="/home/ubuntu/project/src" regex="bg-blue"/>
```

### find_filename (glob)
```xml
<find_filename path="/home/ubuntu/project/src" glob="*.tsx"/>
```

---

## 13. WIRE FORMAT SUMMARY TABLE

| Agent | Wire Format | Edit Mechanism | Path Style | Context Marker |
|-------|-----------|---------------|-----------|---------------|
| **Claude Code** | JSON function-calling | `old_string`/`new_string` exact match | Absolute | N/A (exact match) |
| **OpenCode** | JSON function-calling | `oldString`/`newString` + 9-level fuzzy chain | Absolute | N/A |
| **Cursor** | JSON function-calling | `edit_file` (semantic diff) + `search_replace` (exact) | Relative | `// ... existing code ...` |
| **Codex CLI** | Shell command + inline string | `apply_patch` (custom V4A diff format) | Relative | space/+/- line prefixes |
| **Lovable** | JSON function-calling | `lov-line-replace` (line-number+string) primary | Relative | `// ... keep existing code` |
| **Cline** | XML tags in LLM output | `replace_in_file` (SEARCH/REPLACE blocks) | Relative | `<<<<<<< SEARCH` / `>>>>>>> REPLACE` |
| **Windsurf** | JSON (PascalCase, TypeScript-typed) | `replace_file_content` (ReplacementChunks) | Absolute | Exact substring match |
| **Devin** | XML command tags (attrs + body) | `str_replace` (old_str/new_str child elements) | Absolute | Exact line match |
| **Continue** | JSON function-calling | `single_find_and_replace` + `multi_edit` + `edit_existing_file` | Relative | `// ... existing code ...` |
| **OpenHands** | JSON function-calling | `str_replace_editor` multi-command tool | Absolute (/workspace/) | Exact match |
| **Aider** | Text blocks in LLM output | SEARCH/REPLACE blocks or unified diff | Relative | `<<<<<<< SEARCH` / `>>>>>>> REPLACE` |
| **MCP FS** | JSON-RPC | `edit_file` (oldText/newText edits array) | Absolute or relative | Exact match |

---

## Summary: Minimum Virtual Filesystem Response Format Requirements

For a virtual filesystem adapter to work with ALL agents:

| Response aspect | Required format |
|----------------|----------------|
| **File content on read** | Plain text string. Claude Code adds `cat -n` numbering itself; OpenCode adds `N:` numbering; others use raw content. Return raw text — let the agent's tooling format it. |
| **Edit success** | Simple text confirmation (e.g., "Edit applied successfully.") |
| **Edit failure — not found** | Must clearly state the search string was not found |
| **Edit failure — multiple matches** | Must state multiple occurrences found |
| **File paths** | Absolute paths for Claude Code/OpenCode. Relative paths for Cursor/Codex. MCP server should support both. |
| **Glob/search results** | Newline-separated file paths |
| **Grep results** | `filepath:line_number:content` format (ripgrep-compatible) |
| **Shell output** | Raw stdout+stderr combined, with exit code on failure |
| **MCP response** | JSON-RPC with `{ content: [{ type: "text", text: "..." }], isError: boolean }` |
