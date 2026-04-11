# Changelog

## 2026-04-11 — Initial spec

- Created SPEC.md with SCR, success criteria, 5 design sections, 14 test scenarios, 5 decisions
- Key finding: built-in `char: '[[''` does NOT work for paired delimiters — need custom `findSuggestionMatch`
- Evidence written: `evidence/suggestion-api-compatibility.md` (source-verified API compatibility analysis)
- All decisions at HIGH confidence, LOCKED or DIRECTED status
- No ASSUMED or INVESTIGATING items
