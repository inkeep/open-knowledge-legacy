---
"@inkeep/open-knowledge-app": patch
---

fix(app): hold the "Connecting — waiting for collab server…" banner behind a 500 ms grace window so it no longer flashes on normal page loads. The red terminal banner still surfaces immediately. Extracted `computeBannerMode` + `describeError` as pure helpers with a full state-matrix unit test.
