# Evidence: Human Perception Thresholds

**Dimension:** D1 — Human perception thresholds for editor interactions
**Date:** 2026-04-16
**Sources:** Nielsen Norman Group, Google RAIL model, Pavel Fatin Typometer, CHI research papers, Dan Luu survey

---

## Key thresholds

### Nielsen's 3 response time limits (1993, updated 2014)
- **100ms:** System feels instantaneous — direct manipulation. Maps to: keystroke feedback, cursor movement, selection.
- **1000ms:** Flow maintained but delay noticed. Maps to: autocomplete popup, remote cursor updates, cross-mode sync.
- **10000ms:** Attention limit. Maps to: document load, initial sync, large paste.
Source: https://www.nngroup.com/articles/response-times-3-important-limits/

### Google RAIL model (2015)
- **Response:** 100ms total, 50ms processing budget
- **Animation:** 10ms per frame (16.67ms minus 6ms browser overhead)
- **Idle:** 50ms work chunks (preserve 100ms response budget)
- **Load:** 5s first load, 2s subsequent
Source: https://web.dev/articles/rail

### Perceptual fusion threshold
- Visual: ~10-15ms (flicker fusion at ~60Hz)
- Conscious percept: ~50-100ms "time slice"
Source: Wikipedia (flicker fusion), PMC time-slice research

### Typing feedback latency
- Best editors: <5ms (GVim 0.9ms, Notepad++ 4.3ms)
- Good editors: 5-25ms (Sublime 8.2ms, IntelliJ zero-latency 2.9ms)
- Perceptible degradation: >30ms (Atom 49.4ms)
- Task disruption: >200ms (CHI MUM 2023: correction tasks significantly slower at 200ms)
Source: Pavel Fatin typometer, ACM CHI 2023

### Inter-keystroke intervals (136M keystrokes study, CHI 2018)
- Average: 239ms (51.56 WPM)
- 60 WPM: ~200ms
- 100 WPM: ~120ms
- 150 WPM: ~80ms
Source: Aalto University / Cambridge, CHI 2018

### Cross-user collaboration latency
- Liveblocks default throttle: 100ms (10 updates/sec)
- Industry target for "real-time": sub-100ms
- Cursor updates tolerate higher latency (~200ms) than content (~100ms)
Source: Liveblocks docs, industry analysis
