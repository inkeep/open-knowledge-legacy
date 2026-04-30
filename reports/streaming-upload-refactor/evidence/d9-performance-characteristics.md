# Evidence: D9 — Performance characteristics

**Dimension:** Memory, throughput, CPU, disk I/O comparison between buffer-to-memory and stream-to-disk patterns.
**Date:** 2026-04-22
**Sources:** Node.js stream docs, V8 heap behavior, OK-specific size targets.

---

## Memory

### Buffer-to-memory (current)
- Peak memory during upload = O(fileSize).
- Node.js allocates a fresh `Buffer` for each `data` event chunk (default HTTP chunk ≈ 64 KB); `chunks.push(chunk)` keeps them live.
- `Buffer.concat(chunks, totalSize)` allocates a NEW contiguous buffer of `totalSize` bytes and copies every chunk into it. **Transient peak: 2 × fileSize** — old chunks are GC-eligible only AFTER the copy completes.
- For a 100 MB upload: peak heap ≈ 200 MB mid-`concat`.
- Default Node heap: ~1.5–2 GB. A 1 GB upload OOMs.

### Stream-to-disk (refactor)
- Peak memory during upload ≈ constant (one chunk in flight + hash state + write-stream internal buffer).
- Typical in-flight buffer: `highWaterMark = 16 KB` for `createWriteStream`, ~64 KB for HTTP chunk.
- Hash state: ~256 bytes (SHA-256 block state).
- Total: ~80 KB regardless of file size.
- **10 GB upload costs the same memory as 10 KB.**

**Order-of-magnitude difference:** O(fileSize) → O(1) memory. This is the architectural win.

---

## Throughput

### Small files (≤ 64 KB)
- Buffer: 1 `data` event + `Buffer.concat([single-chunk]) = O(chunk)` trivial copy. ~microseconds.
- Stream: pipeline overhead (event wiring) + 1 `_transform` call + 1 `_write` call. ~microseconds + fixed pipeline setup.
- Delta: negligible. Streaming has a slightly higher per-request fixed cost (pipeline setup); buffering has a slightly higher per-byte cost (copy).

### Medium files (1–25 MB — OK's current sweet spot)
- Buffer: memory allocation pressure + `Buffer.concat` copy = measurable GC pauses at 25 MB.
- Stream: disk I/O overlaps with HTTP receive — effectively pipelined. No GC pressure.
- Delta: streaming wins on the GC-pause side even at this size.

### Large files (25 MB – 1 GB)
- Buffer: OOMs above ~1 GB heap.
- Stream: disk-bound. Throughput = disk write rate (typical SSD: 500 MB/s sequential write; matches or exceeds network receive rate on 1 Gbps LAN).
- Delta: streaming is the only viable option.

### Very large files (> 1 GB)
- Buffer: cannot complete.
- Stream: completes in disk-bound time. No process ceiling.

---

## CPU

### Hashing cost
- SHA-256 throughput on modern CPUs: ~500 MB/s per core (OpenSSL / Node native).
- 25 MB = 50 ms hash. 1 GB = 2 s hash.
- Both buffer and stream incur identical hash cost (same total bytes, same algorithm).
- **Streaming doesn't change CPU cost.**

### Node event-loop occupation
- Buffer: `Buffer.concat` is synchronous + blocking for the copy duration. 25 MB concat ≈ 5–10 ms event-loop block.
- Stream: each `_transform` call runs synchronously but only for one chunk (64 KB ≈ 100 µs). Event loop stays responsive.
- **Streaming wins on event-loop responsiveness**, especially under concurrent uploads.

---

## Disk I/O

### Buffer pattern
- Write happens once (`writeSync(fd, buffer)`). Single `write(2)` syscall for file size — kernel may split into multiple actual writes.
- Disk I/O pattern: one sustained burst at the end.

### Stream pattern
- Write happens incrementally as chunks arrive. Many `write(2)` syscalls.
- Disk I/O pattern: overlapped with HTTP receive. On modern filesystems (ext4, APFS, NTFS), kernel buffers writes and flushes asynchronously — net disk cost identical but spread over time.

### Dedup-hit path (D7 Option A)
- Buffer: write tempfile → dedup scan reads existing siblings → match → delete tempfile. 2× tempfile-size writes if hash matches a sibling (because scan reads sibling too).
- Stream: same flow, same cost.
- Neither wins on the dedup-hit path; both pay the tempfile write cost.

---

## Back-of-envelope math

For OK's expected workload (per SPEC §7 success metrics + P1 dogfood scenarios):

- Typical screenshot paste: 200 KB–2 MB. Either pattern completes in <100 ms. **Streaming imperceptibly faster** (no GC pause).
- Large-file drop (drag in 100 MB video): buffer pattern OOMs at ~20 cumulative concurrent uploads; streaming handles dozens concurrently.
- Extreme adversarial (1 GB+ stream): buffer crashes; streaming succeeds, bounded only by disk.

---

## Primary sources

- Node.js stream docs: https://nodejs.org/api/stream.html — `highWaterMark` + backpressure semantics.
- V8 heap behavior: Node process default heap ~1.5 GB on 64-bit (`--max-old-space-size=1536` default). Configurable up, but each configured GB is committed at startup.
- `Buffer.concat` implementation: https://nodejs.org/api/buffer.html#static-method-bufferconcatlist-totallength — O(totalLength) copy, explicit.
- SHA-256 throughput benchmarks: OpenSSL `speed sha256` typically reports ~500 MB/s single-core on Apple Silicon / x86-64.

---

## Recommendation

No performance counter-argument. Streaming is strictly better on memory (O(1) vs O(fileSize)), event-loop responsiveness (incremental chunks vs synchronous concat), and large-file completability (disk-bound vs heap-bound). Throughput is equivalent for small files and strictly dominant for large.

---

## Gaps / follow-ups

- **Benchmark harness not included in this refactor.** A simple pre-post benchmark would time 100× {10 KB, 1 MB, 25 MB, 100 MB} uploads against both the old and new handler, asserting:
  - p99 latency parity or improvement across all sizes.
  - Peak RSS under concurrent load — old pattern should OOM at N concurrent 100 MB uploads; new pattern should scale linearly with N.
  - Event-loop lag during concurrent uploads — old pattern should show >10 ms blocks during `Buffer.concat`; new pattern should stay <1 ms.
  
  Not blocking the refactor; worth adding to the follow-on PR's test suite if the team wants hard numbers.
- **Disk fsync semantics.** `createWriteStream` defaults to non-sync writes (buffered by kernel). For crash-safety of the tempfile → linkSync → unlinkSync sequence, an `fsync` call between write and link would guarantee durability — but OK's existing `writeUploadAtomic` doesn't do this, and the SPEC doesn't require crash-safe upload. Treat as non-goal unless a dogfood incident surfaces.
