# Evidence: Reproducing ripgrep's Output Format

**Dimension:** D4 — Reproducing ripgrep's output format
**Date:** 2026-04-02
**Sources:** ripgrep man page, BurntSushi/ripgrep GitHub, ripgrep documentation

---

## Key files / pages referenced

- https://docs.rs/crate/ripgrep/latest/source/doc/rg.1.md — ripgrep man page
- https://github.com/BurntSushi/ripgrep/discussions/2031 — Output format discussion
- https://manpages.debian.org/testing/ripgrep/rg.1.en.html — Debian man page
- https://learnbyexample.github.io/learn_gnugrep_ripgrep/context-matching.html — Context matching guide

---

## Findings

### Finding: ripgrep has 3 distinct output modes relevant to Claude Code's Grep tool
**Confidence:** CONFIRMED
**Evidence:** ripgrep documentation, Claude Code tool specification

**Mode 1: Content (default search, `-n` for line numbers)**
```
filename:linenum:matching line content
```
Example:
```
src/main.rs:42:fn main() {
src/lib.rs:15:pub fn search(query: &str) -> Vec<Result> {
```

When stdout is a TTY (terminal):
- `--heading` is on by default: filename printed once above a group of matches
- Color is on by default: matches highlighted
- Line numbers on by default

When piped (non-TTY, which is how Claude Code uses it):
- Standard grep-like format: `filename:linenum:content`
- No heading, no color
- Line numbers NOT on by default (need `-n`)

**Mode 2: Files with matches (`-l` / `--files-with-matches`)**
```
filename
```
One filename per line. No line numbers, no content.

**Mode 3: Count (`-c` / `--count`)**
```
filename:count
```
Example:
```
src/main.rs:3
src/lib.rs:7
```

### Finding: Context lines use `-` separator; match groups separated by `--`
**Confidence:** CONFIRMED
**Evidence:** ripgrep documentation, context matching guide

With `-C 2` (2 lines before and after):
```
src/main.rs-40-use std::io;
src/main.rs-41-
src/main.rs:42:fn main() {
src/main.rs-43-    let args: Vec<String> = env::args().collect();
src/main.rs-44-    println!("Hello");
--
src/main.rs-60-
src/main.rs-61-impl Config {
src/main.rs:62:    fn new(args: &[String]) -> Config {
src/main.rs-63-        let query = args[1].clone();
src/main.rs-64-        let filename = args[2].clone();
```

Key format rules:
- Match lines use `:` separator: `filename:linenum:content`
- Context lines use `-` separator: `filename-linenum-content`
- Non-adjacent groups separated by `--` on its own line
- `--context-separator` flag allows customizing the `--` separator

### Finding: ripgrep also supports `--json` output (JSON Lines format)
**Confidence:** CONFIRMED
**Evidence:** ripgrep documentation

JSON Lines format emits one JSON object per line with message types:
- `begin`: file being searched, has at least one match
- `end`: file done, includes summary stats
- `match`: a match found (includes path, line number, line content, match offsets)
- `context`: context line (when using -A/-B/-C)
- `summary`: aggregate stats

Non-UTF-8 data handled via `text` (valid UTF-8) or `bytes` (base64-encoded) fields.

Cannot be combined with `-l`, `-c`, `--count-matches`.

### Finding: Claude Code's Grep tool maps to specific ripgrep flags
**Confidence:** CONFIRMED
**Evidence:** Claude Code tool specification in conversation context

| Grep tool param | ripgrep flag |
|----------------|-------------|
| pattern | positional arg (regex) |
| path | positional arg (path) |
| output_mode: "content" | (default) |
| output_mode: "files_with_matches" | `-l` |
| output_mode: "count" | `-c` |
| -A (after context) | `-A N` |
| -B (before context) | `-B N` |
| -C (context) | `-C N` |
| -i (case insensitive) | `-i` |
| -n (line numbers) | `-n` |
| multiline | `-U --multiline-dotall` |
| glob | `--glob` |
| type | `--type` |
| head_limit | piped to `head -N` |
| offset | piped to `tail -n +N \| head -N` |

### Finding: Producing byte-identical output to ripgrep is achievable for pipe mode
**Confidence:** CONFIRMED
**Evidence:** Analysis of output format

For piped (non-TTY) mode, the output format is deterministic and simple:
- Content: `{path}:{line}:{content}\n`
- Context before: `{path}-{line}-{content}\n`
- Context separator: `--\n`
- Files with matches: `{path}\n`
- Count: `{path}:{count}\n`

This is straightforward to reproduce. The only complexity is:
1. Getting line numbers correct (1-indexed)
2. Context line management (tracking which lines to include, deduplicating overlapping contexts)
3. Group separator placement (between non-adjacent match groups)

---

## Gaps / follow-ups

* Color/ANSI output for terminal mode would add complexity but is not needed for Claude Code
* The `--json` output mode could be useful for enriched grep (add extra fields beyond ripgrep's format)
* UTF-8 vs binary file handling needs consideration
