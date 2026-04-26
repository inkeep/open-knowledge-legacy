# Evidence: D4 — MCP tool CRUD surface for a structured config file

**Dimension:** D4 — MCP tool CRUD surface (greenfield design from adjacent conventions)
**Date:** 2026-04-25
**Sources:** RFC primary sources, MCP TS SDK + spec, GitHub MCP server, filesystem MCP server, VS Code language services, Renovate, AJV, Zod, token-cost research

---

## Key files / pages referenced

- [RFC 6901 — JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901)
- [RFC 6902 — JSON Patch (jsonpatch.com)](https://jsonpatch.com/)
- [RFC 7396 — JSON Merge Patch](https://datatracker.ietf.org/doc/html/rfc7396)
- [json-pointer (manuelstofer)](https://github.com/manuelstofer/json-pointer)
- [fast-json-patch (Starcounter-Jack)](https://github.com/Starcounter-Jack/JSON-Patch)
- [rfc6902 (chbrown)](https://github.com/chbrown/rfc6902)
- [yamlpatch (int128, Go)](https://github.com/int128/yamlpatch) — applies JSON Patch to YAML preserving comments
- [yaml-diff-patch (npm)](https://www.npmjs.com/package/yaml-diff-patch) — RFC-6902 ops on YAML
- [enhanced-yaml](https://enhanced-yaml.netlify.app/) — `yaml`-package-AST-aware patching
- [MCP Tools spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Filesystem MCP server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [vscode-json-languageservice](https://github.com/microsoft/vscode-json-languageservice)
- [node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser) — `modify(text, JSONPath, value)` API
- [Renovate config-validator](https://docs.renovatebot.com/config-validation/)
- [json-editor-mcp (peternagy1332)](https://github.com/peternagy1332/json-editor-mcp) — community config-editor MCP
- [JSON-MCP-Server (GongRzhe)](https://github.com/GongRzhe/JSON-MCP-Server) — community
- [Cloudflare Code Mode for MCP](https://blog.cloudflare.com/code-mode-mcp/)
- [SEP-1576 — Mitigating Token Bloat in MCP](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)

---

## Findings

### Finding: JSON Pointer (RFC 6901) is the standard string-form path-addressing primitive

**Confidence:** CONFIRMED
**Evidence:** [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901)

Syntax: Unicode string of slash-separated tokens; each token is either an object property name or an array index. Special chars: `~0` escapes `~`, `~1` escapes `/`. Example: `/sync/pushIntervalSeconds`, `/content/exclude/0`.

TypeScript ecosystem libraries:
- [`json-pointer`](https://www.npmjs.com/package/json-pointer) (manuelstofer) — `.get(obj, ptr)`, `.set(obj, ptr, val)`, `.remove(obj, ptr)`, `.has(...)`, `.compile(['a','b']) → '/a/b'`, `.escape()`/`.unescape()`. Most-used.
- [`json-ptr`](https://www.npmjs.com/package/json-ptr) — full RFC 6901 + Relative JSON Pointer; CJS+ESM+UMD; near-100% test coverage
- [`jsonpointer`](https://www.npmjs.com/package/jsonpointer) — minimal; widely used as transitive dep

In-the-wild use: JSON Schema `$ref` (canonical), AJV `instancePath`, JSON-Patch operation paths.

---

### Finding: JSON Patch (RFC 6902) defines six mutation operations; libraries exist for both JS objects and YAML AST

**Confidence:** CONFIRMED
**Evidence:** [RFC 6902 / jsonpatch.com](https://jsonpatch.com/), [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch), [yamlpatch](https://github.com/int128/yamlpatch), [yaml-diff-patch](https://www.npmjs.com/package/yaml-diff-patch)

Six operations: `add`, `remove`, `replace`, `move`, `copy`, `test`. Operations are an ordered array applied atomically.

JS libraries:
- `fast-json-patch` (Starcounter-Jack) — most popular; duplex (observe-and-generate); TS defs; prototype-pollution protections
- `rfc6902` (chbrown) — TS-native; includes `diff()`
- Immer produces internal patches in JSON-Patch-compatible shape

**YAML-AST patch (key finding):**
- `yamlpatch` (Go, int128) — applies JSON Patch to YAML preserving positions and comments; supports JSON Pointer + JSON Path
- `yaml-diff-patch` (npm) — RFC-6902 ops on YAML, attempts to preserve whitespace, comments, structure
- `enhanced-yaml` — operates on `yaml` package's AST; preserves comments+styling on stringify
- Python: `ruamel.yaml` (roundtrip) — gold standard

In-the-wild: Kubernetes admission-webhook patches; Kustomize JSON 6902 patches alongside Strategic Merge Patch.

---

### Finding: JSON Merge Patch (RFC 7396) is a simpler partial-object format with explicit limitations

**Confidence:** CONFIRMED
**Evidence:** [RFC 7396](https://datatracker.ietf.org/doc/html/rfc7396), [Zuplo: JSON Patch vs JSON Merge Patch](https://zuplo.com/learning-center/json-patch-vs-json-merge-patch)

Shape: a partial object. Anything present replaces; `null` removes; nested objects merge recursively.

**Cannot express:**
- Array-element edit at a specific index
- Set-key-to-null (null is overloaded as "delete")
- Move/copy operations
- Test-and-set (no atomic pre-condition)

**Can express:** most common config edits in 1-2 lines.

**Tradeoff:** *"Suitable for documents that primarily use objects and don't make use of explicit null."* Fails when modifications are array-positional or null-valued.

---

### Finding: MCP spec mandates nothing about edit-tool granularity; existing servers use four distinct patterns

**Confidence:** CONFIRMED
**Evidence:** [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [GitHub MCP Server](https://github.com/github/github-mcp-server), [Filesystem MCP server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem), [json-editor-mcp](https://github.com/peternagy1332/json-editor-mcp)

**MCP spec:** Each tool has `name`, optional `title`, `description`, `inputSchema` (JSON Schema), optional `outputSchema`, `annotations`. Returns `content` (unstructured) and/or `structuredContent` (JSON object). `isError: true` for execution errors. Spec is silent on granularity.

**GitHub MCP server:**
- `update_file` (= `create_or_update_file`) replaces a single file by SHA — **whole-file granularity**
- `update_issue` accepts a `method` parameter that names the write operation
- Toolsets configurable via `X-MCP-Tools` header / `GITHUB_TOOLS` env to reduce context-window cost

**Filesystem MCP server (modelcontextprotocol/servers):**
- `edit_file` is **line-based** — replaces exact line sequences and returns a git-style diff. No structural diff.

**Community config-editor MCPs:**
- `peternagy1332/json-editor-mcp` — read/write/delete by **dot-notation paths**
- `GongRzhe/JSON-MCP-Server` — general JSON manipulation

Both community editors use ad-hoc dot-path conventions, NOT RFC 6901.

---

### Finding: VS Code's settings-UI write semantics use jsonc-parser's `modify()` — text-edit-against-original-bytes pattern preserves comments

**Confidence:** CONFIRMED
**Evidence:** [vscode-json-languageservice](https://github.com/microsoft/vscode-json-languageservice), [node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser)

VS Code's settings.json uses **JSONC** (JSON with comments + trailing commas). The reusable language service is `vscode-json-languageservice`; the underlying parser is `jsonc-parser`.

`jsonc-parser` API:

```typescript
type Segment = string | number;
type JSONPath = Segment[];
function modify(text: string, path: JSONPath, value: any, options): EditResult;
function applyEdits(text: string, edits: EditResult): string;
interface Edit { offset: number; length: number; content: string; }
```

Key properties:
- **Path = array of segments** (NOT JSON Pointer string)
- `modify()` returns text-edit operations, not a new document — preserves comments, whitespace, formatting
- Auto-creates missing path segments
- `value === undefined` removes
- `applyEdits()` is separate; sequential application

This is the canonical pattern for "edit a structured config without losing comments": parse to AST, compute textual `Edit[]` against original bytes, apply.

**Implications:** YAML analog of this pattern is `yaml@2`'s Document layer + `setIn`/`deleteIn`/`toString()` — same shape (path-addressed mutation, write-back preserves formatting), different library.

---

### Finding: Renovate's config-validator is validation-only; no structural-edit surface, no schema-aware suggestions

**Confidence:** CONFIRMED
**Evidence:** [Renovate Config Validation](https://docs.renovatebot.com/config-validation/), [Renovate discussion #36298](https://github.com/renovatebot/renovate/discussions/36298)

Output structure:
```json
{ "errors": [{ "topic": "Configuration Error", "message": "..." }] }
```

- Errors are typed (`Configuration Error`, `Migration`) with human-readable messages
- `--strict` adds migration diffs
- Non-zero exit on warnings/errors
- Discussion #36298 acknowledges the output is not CI/automation-friendly
- No "did you mean X?" schema-aware suggestions

**Implications:** Renovate is the closest in-class precedent for a config CLI validator, but it's read-only. The structural-edit half of OK's design space has no Renovate prior art.

---

### Finding: Three path-addressing notations have established precedent; each has tradeoffs

**Confidence:** CONFIRMED
**Evidence:** combination of [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901), [jsonc-parser](https://github.com/microsoft/node-jsonc-parser), [Zod docs](https://zod.dev/error-formatting), AJV docs

| Notation | Example | Where used | Tradeoff |
|---|---|---|---|
| **Slash JSON Pointer (RFC 6901)** | `/sync/pushIntervalSeconds` | AJV `instancePath`, JSON Schema `$ref`, JSON Patch | Standard; escape rules for `/` and `~`; LLM-friendly string |
| **Array of segments** | `['sync', 'pushIntervalSeconds']` | `jsonc-parser` `JSONPath`, Zod `path`, immer patches | No escaping needed; loses readability in JSON; TS-natural |
| **Dot notation** | `sync.pushIntervalSeconds` | VS Code `settings.json` keys, Lodash `_.get`, `json-editor-mcp` | Familiar; ambiguous when keys contain `.`; no array-index syntax (Lodash uses `arr[0].key`) |

Zod uses array-of-segments in `.path`; AJV uses slash JSON Pointer in `.instancePath`. Same information, different shapes.

---

### Finding: Five granularity choices for config-edit MCP tools; tradeoffs are token-cost vs typed-input strength

**Confidence:** CONFIRMED
**Evidence:** [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [GitHub MCP Server](https://github.com/github/github-mcp-server), [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode-mcp/), [Speakeasy dynamic toolsets](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2), [SEP-1576](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576), [StackOne MCP token optimization](https://www.stackone.com/blog/mcp-token-optimization/)

| Pattern | Precedent | Tradeoffs |
|---|---|---|
| **Single tool + `path` arg** (`set_config({path, value})`) | `json-editor-mcp`, `JSON-MCP-Server`; `jsonc-parser.modify` API shape | Lowest tool count → lowest context cost; weakest type guidance per call (`value: any`); error surface is generic |
| **Tool per top-level domain** (`set_sync_config({...})`, `set_content_config({...})`) | GitHub MCP `update_issue` per-method | Strong typed input schemas → field-level guidance; multiplies tool count → context cost (550-1400 tokens/tool per StackOne) |
| **Whole-replace** (`replace_config({...full config...})`) | GitHub MCP `update_file` (whole-file by SHA) | Atomic; simplest schema; expensive in tokens for large configs; loses comments unless paired with structured-edit applier |
| **Patch document** (`apply_config_patch({patches: JSON-Patch[]})`) | Kubernetes admission webhooks; some REST APIs | Maximum expressiveness incl. test/move/copy; model must construct the patch (cognitive cost); good for batch edits |
| **Code mode** (general `execute({code})` over typed SDK) | Cloudflare Code Mode, Speakeasy dynamic toolsets — claim ~100x token reduction | Most flexible; security surface (sandbox required); learnability cost |

**Token-cost evidence:** A typical MCP tool definition costs 550-1400 tokens; aggressive servers consume 72% of a 200k context window on tool defs alone (apideck). SEP-1576 in MCP spec acknowledges this as an open problem.

**Implications:** For a ~12-key config like OK's, "single tool + path" is the cheapest in tokens; "tool per domain" is the most ergonomic for the model; "patch document" is overkill for one-field edits.

---

### Finding: Validation flow has four shapes with library support varying

**Confidence:** CONFIRMED
**Evidence:** AJV docs, Zod `.shape` traversal, JSON Patch `test` op spec

| Flow | Library support | Surface |
|---|---|---|
| **Pre-write (validate proposed change)** | AJV's `validateSchema` + sub-schema extraction; Zod `.parse()` on the field type | Reject before mutating; fast feedback; requires ability to slice schema |
| **Post-write (validate file as a whole)** | Any validator on the resulting full doc | Catches cross-field invariants; mutation may leave file dirty if invalid |
| **Two-phase (validate patch + read-back + revalidate)** | Compose JSON-Patch-`test` ops + full validation | Strongest guarantee; most expensive; pattern used by Kubernetes admission |
| **Schema-slice validation** | AJV: extract sub-schema by `instancePath` walking; Zod: `.shape['key']` traversal | Limited library support — typically hand-rolled |

JSON-Patch's `test` op exists precisely to express "validate this assertion before applying" inline.

---

### Finding: Zod and AJV expose structurally-similar but syntactically-different error shapes

**Confidence:** CONFIRMED
**Evidence:** [Zod docs](https://zod.dev/error-formatting), AJV API docs, [better-ajv-errors (Atlassian)](https://github.com/atlassian/better-ajv-errors)

**Zod:** `ZodError.issues[]` with `{ code, path: (string|number)[], message, expected? }`. Common pattern: `issue.path.join('.') → "addresses.0.zipCode"`.

**AJV:** `errors[]` with `{ keyword, instancePath: string, schemaPath: string, params: object, message: string }`. `instancePath` is RFC 6901 JSON Pointer (`"/age"`, `"/prop/1/subProp"`).

Atlassian's `better-ajv-errors` translates AJV errors to human messages. `zod-validation-error` does similar for Zod.

**Surfaced through MCP:** Per the spec, structured errors map cleanly to `structuredContent` with `isError: true`, plus a fallback text block for unstructured clients.

---

## Design space matrix (cross-tabulation, no recommendation)

Four orthogonal axes from the findings, with adjacent-space precedent in each cell:

### Axis 1: Path notation × Granularity

| | **RFC 6901 string** | **Array of segments** | **Dot notation** |
|---|---|---|---|
| **Single tool + path** | AJV-output-shaped; minimal tool count | `jsonc-parser.modify` shape | `json-editor-mcp` shape |
| **Tool per domain** | Less natural | Less natural | Less natural |
| **Whole-replace** | N/A (no path) | N/A | N/A |
| **JSON-Patch document** | Native — RFC 6902 | Non-standard | Non-standard |

### Axis 2: Mutation format × Validation flow

| | **JSON Patch (RFC 6902)** | **JSON Merge Patch (RFC 7396)** | **Direct set/remove** |
|---|---|---|---|
| **Pre-write** | `test` op covers it inline | Manual; merge then validate | Validate `value` against field schema |
| **Post-write** | Apply, then full-doc validate | Apply, then full-doc validate | Apply, then full-doc validate |
| **Two-phase** | `test` + apply + revalidate | Atomic-ish; revalidate after | Read-back + revalidate |

### Axis 3: Validator × Error path shape

| | **AJV** | **Zod** |
|---|---|---|
| **Error path shape** | RFC 6901 string `instancePath` | `path: (string\|number)[]` array |
| **Sub-schema slice** | Possible via schema walking | Possible via `.shape` traversal |
| **MCP error surface** | Pass through `instancePath` directly | `path.join('.')` or pass array |

### Comment-preservation orthogonal axis

YAML-on-disk + `yamlpatch` / `yaml-diff-patch` / `enhanced-yaml` parsers preserve comments through any of the above mutation strategies; naive `JSON.parse → mutate → JSON.stringify` strips them. `jsonc-parser` solves this for JSONC by computing text-edits against original bytes — `yaml@2`'s Document layer is the YAML analog.

---

## Negative searches

- **Searched:** "MCP server config editor schema validation YAML"; sources: github MCP servers list, modelcontextprotocol.io examples → result: no purpose-built MCP servers for schema-validated config CRUD. Two community JSON-editor MCPs exist; no YAML+schema combo.
- **Searched:** "MCP tool best practice patch granularity 2026"; sources: MCP spec, blog posts → result: no formal guidance; SEP-1576 acknowledges token-bloat problem but doesn't prescribe granularity
- **Searched:** "JSON Schema sub-schema extraction by instance path AJV"; sources: AJV docs, npm → result: not first-class; hand-rolled in practice

---

## Cross-cutting observations

- **Greenfield design space.** No purpose-built MCP server for "edit a YAML config with JSON Schema validation" exists. Two community JSON-editor MCPs use ad-hoc dot-paths, not RFC 6901. The pattern can be assembled from primitives (RFC 6901 + RFC 6902 + `yaml@2` Document) but no canonical implementation exists.
- **VS Code's `jsonc-parser.modify()` is the closest architectural model** — text-edit-against-original-bytes + path-addressed mutation. It's the JSONC analog of `yaml@2`'s Document layer.
- **Token cost is a real constraint at scale.** Single-tool + path saves the most tokens. Tool-per-domain costs 550-1400 tokens *per tool* in MCP context. For a config with ~12 top-level domains, the latter could consume ~10K tokens of context budget per session.
- **Path-notation choice is mostly cosmetic but library-dependent.** Pick to match the validator (AJV → RFC 6901; Zod → array-of-segments) to avoid translation layers.
- **JSON Merge Patch's null-overload** disqualifies it for any config with explicit nullable fields. JSON Patch RFC 6902 is the safer default for a multi-tool architecture.

---

## Gaps / follow-ups

- Whether `enhanced-yaml` or `yaml-diff-patch` are mature enough for production OK use, or whether direct `yaml@2` Document API is preferable
- Whether MCP's `outputSchema` (newer in 2025-06-18 spec) helps surface validation errors more cleanly than ad-hoc text content blocks
- Whether MCP elicitations (interactive tool-call refinement) offer a path for "did you mean X?" schema-aware suggestions
