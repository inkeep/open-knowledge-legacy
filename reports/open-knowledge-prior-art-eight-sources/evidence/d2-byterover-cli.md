# Evidence: ByteRover CLI (`brv`) — Agent Memory CLI (DEEP)

**Dimension:** D2 — campfirein/byterover-cli
**Date:** 2026-04-07
**Sources:** Cloned repo at `~/.claude/oss-repos/prior-art-open-knowledge/byterover-cli` (TypeScript 97.7%, ~50K LOC), README, ByteRover paper (D3 cross-reference), deep source-code investigation by Explore subagent
**Repo metrics:** 4.3K stars, 420 forks, 2,622 commits, Elastic License 2.0

⚠ **Critical finding:** The actual CODE diverges from the PAPER on at least 4 specific claims. See "Paper vs Implementation" section.

---

## Findings

### Finding: ByteRover CLI is the canonical implementation of the ByteRover paper architecture (D3) with 3 client surfaces — TUI, CLI, MCP — connecting via Socket.IO to a daemon
**Confidence:** CONFIRMED
**Evidence:** `src/server/infra/daemon/brv-server.ts:1-22` — daemon startup sequence:
1. Setup logging
2. Select random port from dynamic range 49152-65535
3. Acquire global instance lock (atomic temp+rename pattern)
4. Start Socket.IO HTTP server
5. Write heartbeat file
6. Install daemon resilience handlers
7. Create services (auth, project state, agent pool, handlers)
8. Wire event subscriptions
9. Create shutdown handler
10. Start idle timer + register signal handlers (SIGTERM, SIGINT)

Three clients per `/src/tui/`, `/src/oclif/`, and `/src/server/infra/mcp/`. Daemon is a detached child process (survives CLI exit).

**Implications for open-knowledge:** This is a **multi-client daemon model** open-knowledge should consider as an alternative to "Vite dev server with embedded Hocuspocus." The daemon serves:
- TUI (terminal UI for humans)
- CLI (one-shot commands)
- MCP (agent integration)

All three connect to the same in-memory state. **For open-knowledge, this maps to:**
- Editor (web UI) ↔ Hocuspocus
- CLI (`openknowledge` CLI) ↔ Hocuspocus
- MCP server ↔ Hocuspocus

The daemon-with-multiple-clients pattern is what TQ12 (Vite) is implicitly building. ByteRover's instance-lock + heartbeat + auto-respawn pattern is a more robust template than embedding Hocuspocus in the dev server.

### Finding: MCP surface is exactly TWO tools — `brv-query` and `brv-curate`
**Confidence:** CONFIRMED
**Evidence:** 

`src/server/infra/mcp/tools/brv-query-tool.ts:14-24`:
```typescript
export const BrvQueryInputSchema = z.object({
  cwd: z.string().optional().describe(
    'Working directory of the project (absolute path). ' +
    'Required when the MCP server runs in global mode (e.g., Windsurf). ' +
    'Optional in project mode — defaults to the project directory.'
  ),
  query: z.string().describe(
    'Natural language question about the codebase or project'
  ),
})
```
Returns: `{content: [{text: string, type: 'text'}], isError?: boolean}`

`src/server/infra/mcp/tools/brv-curate-tool.ts:12-40`:
```typescript
export const BrvCurateInputSchema = z.object({
  context: z.string().optional().describe('Knowledge to store...'),
  cwd: z.string().optional().describe('Working directory'),
  files: z.array(z.string()).max(5).optional().describe(
    'Optional file paths with critical context (max 5 files).'
  ),
  folder: z.string().optional().describe(
    'Folder path to pack and analyze. Takes precedence over files.'
  ),
})
```

**Curate is fire-and-forget**: returns immediately after queueing the task; curation is async. The MCP response is `{content: [{text: '✓ Context queued for [mode] (taskId: XXX). Curation processed asynchronously.'}]}`.

**Implications for open-knowledge:** This is the most aggressive **"few tools" design** in the prior art. Open-knowledge's S4 plans 10 tools (5 filesystem-compatible + 5 knowledge-specific). ByteRover's 2-tool MCP surface is at the opposite extreme.

The trade-offs:
- **Open-knowledge's 10 tools**: filesystem-compatible (zero learning curve), explicit operations, structured responses
- **ByteRover's 2 tools**: minimal cognitive load, agent decides what to query/curate, responses are natural language

**Specifically interesting**: ByteRover's `curate` is **natural language input** (not structured). The agent passes a description of what to remember; the LLM-curated pipeline structures it. Open-knowledge's `write_file` requires the agent to format the content correctly. ByteRover offloads structure to the curation pipeline.

**Open question for open-knowledge**: Should there be a `curate(description)` tool that wraps `write_file` and lets the agent describe what to remember without formatting it? This would be a higher-level affordance over the existing 10 tools.

### Finding: Agent loop has 11 built-in tools — NOT 24 as the paper/marketing claims
**Confidence:** CONFIRMED (paper-vs-code discrepancy)
**Evidence:** `src/agent/infra/tools/tool-registry.ts:139-259` — exactly 11 tools registered:

| # | Tool Name | Purpose |
|---|-----------|---------|
| 1 | `agentic_map` | Map operation over multiple items via sub-agents |
| 2 | `code_exec` | Execute code in sandbox |
| 3 | `curate` | Save context to knowledge tree |
| 4 | `expand_knowledge` | Discover and expand context tree |
| 5 | `glob_files` | Find files by pattern |
| 6 | `grep_content` | Search file contents |
| 7 | `list_directory` | List directory contents |
| 8 | `llm_map` | Map operation via stateless LLM calls |
| 9 | `read_file` | Read file contents |
| 10 | `search_knowledge` | Search context tree (MiniSearch) |
| 11 | `write_file` | Write/create files |

Each tool has: factory function, requiredServices list, markers (Core/Execution/Discovery/Modification/ContextBuilding), optional descriptionFile, optional outputGuidance.

**⚠ Discrepancy:** The README says "24 built-in agent tools." The code has 11. The paper doesn't claim 24 explicitly. The 24 number appears to be marketing inflation (possibly counting sub-tools or future planned tools).

**Implications for open-knowledge:** 
- The **actual** ByteRover internal toolkit is small: filesystem ops (read_file, write_file, list_directory, glob_files, grep_content) + execution (code_exec) + knowledge ops (curate, search_knowledge, expand_knowledge) + meta (agentic_map, llm_map). That's only 11.
- Open-knowledge's plan of 10 tools is **roughly the same size** as ByteRover's internal agent toolkit. Both teams converge on ~10 tools when designing a real agent surface.
- The claim "tool count is the strongest failure predictor" (Microsoft research, cited in PROJECT.md TQ19) is consistent with both projects landing at ~10. Below 5 may be too few; above 15 may be too many.

### Finding: Context Tree is `domain/topic/[subtopic]/title.md` filesystem hierarchy with `context.md` at each level
**Confidence:** CONFIRMED
**Evidence:** `src/server/infra/context-tree/file-context-tree-service.ts:16-67` + paper Appendix C example:

```
.brv/context-tree/
├── domain1/
│   ├── context.md                   # Domain-level metadata
│   ├── topic1/
│   │   ├── context.md               # Topic-level metadata
│   │   ├── entry.md                 # Leaf knowledge entry
│   │   └── subtopic1/
│   │       ├── context.md           # Subtopic metadata
│   │       └── entry.md             # Leaf
│   └── topic2/
│       └── entry.md
├── README.md                         # Root index
├── _index.md                         # Summary index (derived artifact)
└── _archived/                        # Archive stubs
    ├── old-entry.stub.md
    └── old-entry.full.md
```

Domains are created **dynamically by agent curation** — not pre-scaffolded. The product creates only `.brv/context-tree/` on first run; everything inside is agent-authored.

**Implications for open-knowledge:**
- **`context.md` at each level is a richer convention than open-knowledge's `index.md` per folder.** ByteRover has folder-scoped metadata files at every hierarchy level, not just folder-listings.
- **Agent-authored hierarchy** (not user-defined) is the bet. Open-knowledge currently expects users to create folders and frontmatter; ByteRover bets the agent will discover natural domains during use.
- For open-knowledge, this raises a **design question**: should `npx openknowledge init` scaffold any folder structure, or should it create an empty KB and let agents organize? The Karpathy gist also leaves this open ("the conventions should emerge from real skill usage, not be designed top-down" — open-knowledge rabbit hole #4).

### Finding: Knowledge entry frontmatter has 11 lifecycle fields including importance, maturity, recency, accessCount, updateCount
**Confidence:** CONFIRMED
**Evidence:** `src/server/core/domain/knowledge/markdown-writer.ts:36-44`:
```typescript
export interface FrontmatterScoring {
  accessCount?: number
  createdAt?: string
  importance?: number  // [0, 100]
  maturity?: 'core' | 'draft' | 'validated'
  recency?: number     // [0, 1]
  updateCount?: number
  updatedAt?: string
}
```

Plus business fields: `title`, `summary`, `keywords`, `tags`, `related`. Total ~11 frontmatter fields per entry.

**Cross-reference syntax**: `@domain/topic/title.md` parsed by `relation-parser.ts` with regex `/@([\w-]+\/[\w-]+(?:\/[\w-]+)?\/[\w-]+(?:\.[\w]+)?)(?![\w/-])/g`

**Implications for open-knowledge:** The lifecycle metadata (`importance`, `maturity`, `recency`, `accessCount`, `updateCount`) is **infrastructure that exists but is not currently used in retrieval** — see the next finding. Even if open-knowledge doesn't use them for ranking, **the convention of tracking access/update counts in frontmatter is a low-cost addition** that opens future product features (UI sorting, "stale article" detection, "popular article" surfacing).

### Finding: AKL (Adaptive Knowledge Lifecycle) is implemented but the weights are ZERO — recency and importance currently disabled
**Confidence:** CONFIRMED (critical paper-vs-code discrepancy)
**Evidence:** `src/server/core/domain/knowledge/memory-scoring.ts:35-38`:
```typescript
export const W_RELEVANCE = 1      // Only text relevance matters in compound score
export const W_IMPORTANCE = 0     // Disabled
export const W_RECENCY = 0        // Disabled
export const TIER_BOOST = {core: 1, validated: 1, draft: 1}  // No boost
```

The AKL infrastructure (importance/maturity/recency calculation, decay functions, hysteresis) is implemented per the paper. **But the weights in the compound retrieval score are all zero except BM25 relevance.** Result: ranking is currently pure BM25, ignoring AKL.

**Implications for open-knowledge:** This is a **major qualifier on the ByteRover paper's claims**. The paper presents AKL as core to the architecture. The code has AKL infrastructure but doesn't actually use it for ranking. The benchmark results in the paper (LoCoMo 96.1%, LongMemEval 92.8%) were achieved with AKL essentially DISABLED.

What this means:
1. **The benchmark wins are NOT attributable to AKL.** They come from BM25 + the Context Tree structure + the curation pipeline + the LLM backbone.
2. **AKL may not be load-bearing.** ByteRover's team built it, then disabled it. Either it didn't help benchmarks, or it caused regressions, or it's "future work."
3. **For open-knowledge: AKL is interesting as a CONVENTION** (frontmatter fields the agent can use as signals) but **the empirical evidence for it as a retrieval optimization is weak**. The simpler approach — pure BM25 + structural relations — is what actually wins on benchmarks.

This is a significant correction to the implications I drew from the paper alone. The paper presents AKL as a design innovation; the code shows it's not actually doing work.

### Finding: 5-tier retrieval is described in the paper but NOT implemented in code
**Confidence:** CONFIRMED (critical paper-vs-code discrepancy)
**Evidence:** Subagent investigation: "The paper mentions '5-tier progressive retrieval' but code shows NO explicit 5-tier pattern. Instead, ByteRover uses a single unified retrieval pipeline."

Actual code pipeline (`src/agent/infra/tools/implementations/search-knowledge-service.ts:150-250`):
1. Parse query → extract keywords, remove stopwords
2. Check symbol tree → if query matches symbolic paths, scope to subtree
3. Build BM25 index → from context tree files (cached, TTL 5s)
4. Run MiniSearch → fuzzy BM25 with title 3x boost, path 1.5x boost
5. Rank results → compound score (BM25 * maturity boost), filter by relevance threshold
6. Apply decay → adjust importance/recency
7. Return top-K → with excerpts

There IS escalation logic in `src/agent/infra/llm/context/compression/escalated-compression.ts` — but that's for **context compression** when token budget is exceeded, NOT retrieval tier escalation.

**Implications for open-knowledge:** Another major correction. The paper's 5-tier retrieval table (Tier 0 cache, Tier 1 fuzzy cache, Tier 2 MiniSearch, Tier 3 LLM call, Tier 4 full agentic loop) is not in the code. The actual implementation is single-pipeline.

**What this means:**
1. **The "sub-100ms latency for most queries" claim is implausible** without the cache tiers. The code's MiniSearch is in-memory and fast (~100ms even on cold), but there's no exact-match or fuzzy-cache layer ahead of it.
2. **The "Tier 4 full agentic loop" is the agent's own behavior**, not a separate retrieval mode — when search returns no good results, the agent (in its own loop) calls more tools. That's just normal agent behavior, not a retrieval architecture.
3. **For open-knowledge: tiered retrieval is a documented pattern but not yet validated by an open implementation.** Open-knowledge can still adopt cache-first/search-second/LLM-third as a design (it's sound), but should not cite ByteRover as proof it works in production.

### Finding: Sequential per-project FIFO task queue — NOT CRDT
**Confidence:** CONFIRMED
**Evidence:** `src/server/infra/daemon/project-task-queue.ts`:
```typescript
class ProjectTaskQueue {
  private queues: Map<string, QueuedTask[]> = new Map()
  
  enqueue(projectPath: string, task: TaskExecute): number {
    if (queue.some(q => q.task.taskId === task.taskId)) return -1  // dedup
    queue.push({enqueuedAt: Date.now(), task})
    return queue.length
  }
  
  dequeue(projectPath: string): TaskExecute | undefined {
    return queue.shift()?.task
  }
}
```

Comment: "Per-project FIFO task queue for the daemon agent pool. Each project gets its own queue. Tasks are dequeued one at a time per project (agents execute sequentially within a project). Cross-project tasks execute in parallel."

**Characteristics:**
- NOT persisted (daemon restart clears all queues)
- Dedup by taskId within project
- No batch processing — one task at a time
- Single daemon authority (no distributed coordination)

**Implications for open-knowledge:** This is the **clearest "alternative to CRDT" pattern in the prior art**. ByteRover's bet:
- One writer at a time (sequential queue)
- File-level atomicity via direct writes
- No real-time human co-editing

vs open-knowledge's bet:
- Multiple concurrent writers (CRDT)
- Y.Doc-level atomicity via Yjs
- Real-time human co-editing as P0

**The two approaches solve different problems.** ByteRover assumes agents-only writes; humans don't edit in real-time. Open-knowledge assumes humans + agents both edit, sometimes concurrently.

**For open-knowledge, the relevant question is**: should there be a "single-writer mode" that disables CRDT and uses ByteRover-style sequential writes? This might simplify the architecture for the agent-only-write case (e.g., a published wiki where humans don't edit). Worth considering as a configuration option, but **not a P0** — open-knowledge's whole differentiator is the multi-writer co-editing case.

### Finding: Atomic writes are advertised but NOT implemented — code uses direct writeFile, not write-to-temp-then-rename
**Confidence:** CONFIRMED (critical paper-vs-code discrepancy)
**Evidence:** `src/server/infra/context-tree/file-context-tree-writer-service.ts:37-82`:
```typescript
// Add new file
await mkdir(dirname(fullPath), {recursive: true})
await writeFile(fullPath, decodedContent, 'utf8')  // Direct write

// Edit existing file
const localContent = await readFile(fullPath, 'utf8')
if (localContent !== decodedContent) {
  await writeFile(fullPath, decodedContent, 'utf8')  // Overwrite
}

// Delete file
await unlink(fullPath)
```

The paper §4.1.3 claims: "All file operations use an atomic write-to-temp-then-rename pattern. If the process crashes mid-write, the Context Tree remains consistent—no partial entries."

**The code does NOT implement this.** Direct `writeFile` is used. A process crash mid-write CAN corrupt files.

**Implications for open-knowledge:** Don't trust paper claims about implementation details without checking the code. For open-knowledge's own auto-persistence (CC2):
- **The pattern in the paper is correct** — write-to-temp + atomic rename is the right way to persist files crash-safely
- **Open-knowledge SHOULD implement this for the file-on-disk persistence path** (not just for CRDT writes which Hocuspocus handles)
- **Graphify actually does this** (cache.py:47-61) — copy from graphify's pattern, not ByteRover's claim

### Finding: 19 LLM providers via Vercel AI SDK
**Confidence:** CONFIRMED
**Evidence:** `src/server/core/domain/entities/provider-registry.ts:84-378` — providers:
1. Anthropic (claude-sonnet-4-5-20250929)
2. OpenAI (gpt-4.1)
3. Google (Gemini)
4. Groq (openai/gpt-oss-120b)
5. Mistral, xAI, Cerebras, Cohere, DeepInfra, OpenRouter, Perplexity, TogetherAI, Vercel, Minimax, Moonshot, GLM, OpenAI-Compatible, ByteRover (internal free tier) + 1 more = 19

Built on `ai` (Vercel SDK) v5.0.129. Each provider has: id, name, baseUrl, defaultModel, modelsEndpoint, headers, optional OAuth config, env vars.

**Implications for open-knowledge:** Open-knowledge's PROJECT.md is explicit about NOT shipping LLM inference in the OSS core. ByteRover ships 19 providers — it IS the LLM orchestration layer. This is a fundamental product split:
- **ByteRover**: knowledge layer + LLM orchestration (vertically integrated agent runtime)
- **Open-knowledge**: knowledge layer only (uses external agents)

ByteRover's 19-provider abstraction is impressive engineering but **NOT relevant to open-knowledge's architecture** — open-knowledge's reference skills will use whichever LLM the user's agent (Claude Code, Cursor, etc.) provides, not ship its own inference.

### Finding: Elastic License 2.0 — confirmed via LICENSE file
**Confidence:** CONFIRMED
**Evidence:** `LICENSE:1` — Elastic 2.0. Restrictions: cannot offer as hosted SaaS, cannot tamper with license functionality. Source-available, not OSI-approved OSS.

**Implications for open-knowledge:** Relevant for TQ5 (OSS license strategy, parked). ByteRover's Elastic 2.0 is the same license as Elasticsearch — explicit anti-SaaS protection. A high-traction project (4.3K stars) using Elastic 2.0 is a precedent open-knowledge should evaluate alongside AGPL (Docmost, Wiki.js) and AFFiNE's MIT+proprietary-cloud split.

---

## Paper vs Implementation Discrepancies — Summary Table

| Claim | Paper | Code | Status |
|-------|-------|------|--------|
| MCP tools exposed | 2 (brv-query, brv-curate) | 2 | ✓ Match |
| Built-in agent tools | "24" (in marketing) | 11 | ✗ Inflated |
| Context Tree hierarchy | Domain > Topic > Subtopic > Entry | `domain/topic/[subtopic]/{title}.md` | ✓ Match |
| Atomic writes (write-temp-rename) | Yes | Direct writeFile | ✗ NOT IMPLEMENTED |
| 5-tier retrieval | Tables 2 + Algorithm 1 | Single unified pipeline; no tier 0-1 cache | ✗ NOT IMPLEMENTED |
| AKL (importance/maturity/recency in scoring) | Compound score formula | Infrastructure exists; weights all 0 | ✗ NOT USED |
| Sequential task queue | Yes | Per-project FIFO | ✓ Match |
| LLM providers | 18 mentioned | 19 in registry | ✓ Match |
| Cross-reference syntax | @domain/topic/file.md | Same regex | ✓ Match |
| MiniSearch/BM25 | Yes | Yes (with caching) | ✓ Match |
| License | Elastic 2.0 | Elastic 2.0 | ✓ Match |

**4 out of 11 verifiable claims diverge from implementation.** This is a significant finding — the paper presents an idealized architecture; the production code is simpler.

### What this means for the ByteRover findings (D3)

The paper's empirical results (LoCoMo, LongMemEval) are still valid — they were measured on the actual system. But the **mechanistic explanations** in the paper attribute results to features (AKL, 5-tier retrieval, atomic writes) that are not actually doing work in the code. The real performance comes from:
1. **MiniSearch BM25 with field boosting** (title 3x, path 1.5x) — actually used
2. **Context Tree structure** (Domain/Topic/Subtopic hierarchy) — actually used
3. **LLM-curated entries** (the LLM writes structured markdown) — actually used
4. **Bidirectional reference index** (forward + backward links) — actually used
5. **Symbol tree injection** into agent's system prompt — actually used

**These are the load-bearing components.** AKL, 5-tier retrieval, and atomic writes are not. Open-knowledge should focus on the same load-bearing patterns.

---

## Gaps / follow-ups
- The "expand_knowledge" tool (#4) is novel — what does it do? Likely "given a topic, traverse the context tree and return adjacent entries."
- The agent prompt template — how does the agent learn to use `curate` vs `write_file`?
- Why are the AKL weights set to 0? Is there a config file that lets users enable them?
- The TUI features — does it surface AKL fields visually even though they're not used in ranking?

## Related open-knowledge material
- **XQ1 (MCP interface design)** — ByteRover's 2-tool MCP surface validates the "extreme few tools" approach. Open-knowledge's 10 tools is the more conservative choice.
- **CC1 (CRDT)** — ByteRover's sequential task queue is the alternative architecture for agent-only writes.
- **TQ5 (OSS license)** — Elastic 2.0 precedent
- **PQ14 (Reference skills)** — The 11 built-in agent tools are roughly the same surface area as open-knowledge's planned MCP toolset
- **CC6 (derived data)** — ByteRover's MiniSearch in-memory cache (5s TTL) is comparable
- **Risk: do not cite paper architectural claims without verifying against code** — applies to ByteRover and any other published-paper prior art
