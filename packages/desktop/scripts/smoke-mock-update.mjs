#!/usr/bin/env node
/**
 * M3 Tier-2 dev-mode smoke harness (US-008).
 *
 * Spins up a local HTTP server that serves a hand-crafted `latest-mac.yml`
 * manifest + a matching fake `.zip` payload with a valid sha512 hash. Under
 * M3 D4 Tier-2: exercises electron-updater's `GenericProvider` download path
 * end-to-end, short of the signature-verified Squirrel.Mac swap (which only
 * real signed DMGs can trigger — gated on M2 FU-2 creds).
 *
 * ## Usage
 *
 * **Standalone server mode (pure node/bun — this script's primary entry):**
 *
 *     bun run --cwd packages/desktop smoke:mock-update
 *
 * Prints a `[mock-updater] port=<N>` line on stdout, then serves two routes:
 *
 *     GET /latest-mac.yml            → hand-crafted YAML manifest
 *     GET /open-knowledge-mock.zip   → fake zip bytes matching yml's sha512
 *
 * Exits 0 after observing a successful GET of both routes, OR after 30s
 * timeout (exit 1). Set `MOCK_UPDATE_TIMEOUT_MS` to override the timeout.
 *
 * **Pair with an Electron dev build (the full Tier-2 round-trip):**
 *
 *   1. Terminal A: `bun run --cwd packages/desktop smoke:mock-update -- --keep-alive`
 *      Note the port printed — the server keeps serving until Ctrl+C.
 *   2. Terminal B: `OK_UPDATER_FORCE_DEV=1 OK_UPDATER_FEED_URL=http://127.0.0.1:<N> bun run --filter=@inkeep/open-knowledge-desktop dev`
 *   3. Electron's main-process auto-updater hits the local server, downloads
 *      the fake zip, and fires `update-downloaded`. Renderer Toast A renders
 *      ("Update downloaded" + "Relaunch now") within 2-3 seconds of boot.
 *
 * Without `--keep-alive`, the script exits 0 after its built-in self-test
 * (CI mode — validates HTTP serving + sha512 without waiting for Electron).
 *
 * Approach 2 from evidence/electron-updater-api.md §4 (GenericProvider +
 * setFeedURL via forceDevUpdateConfig). Not to be confused with approach 3
 * (event-stub subclass, exercised by `tests/integration/auto-updater.test.ts`).
 *
 * ## Why this script doesn't import electron-updater directly
 *
 * electron-updater's `autoUpdater` export is lazily constructed and its
 * platform-specific subclass (MacUpdater, NsisUpdater) requires
 * `require('electron').autoUpdater` at construction time — fails under plain
 * node/bun. The Tier-2 round-trip therefore splits into two processes: the
 * local HTTP server (this script, node/bun) and the Electron dev build
 * (normal `bun run dev --filter=@inkeep/open-knowledge-desktop`).
 *
 * ## Structured log shape (CLAUDE.md bracket-prefix convention)
 *
 *     [mock-updater] port=<N>
 *     [mock-updater] event=start
 *     [mock-updater] event=served path=/latest-mac.yml status=200
 *     [mock-updater] event=served path=/open-knowledge-mock.zip status=200 bytes=<len>
 *     [mock-updater] event=manifest-and-zip-served — Electron dev build can verify update-downloaded
 *     [mock-updater] event=shutdown reason=<timeout|signal|done>
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { deflateRawSync } from 'node:zlib';

const VERSION = process.env.MOCK_UPDATE_VERSION ?? '0.99.0-mock';
const TIMEOUT_MS = Number.parseInt(process.env.MOCK_UPDATE_TIMEOUT_MS ?? '30000', 10);
/**
 * `--keep-alive` skips the auto-shutdown after self-test and keeps serving
 * until the process is killed (Ctrl+C, SIGTERM). Used for the 2-terminal
 * manual Tier-2 flow where the Electron dev app needs the server to stay up.
 */
const KEEP_ALIVE = process.argv.includes('--keep-alive');

/**
 * Build a minimal valid .zip archive with a single text file. The zip format
 * has a precise local-file-header + central-directory layout; we emit the
 * smallest valid blob so electron-updater's download-verification + unpack
 * path can round-trip without native zip tooling.
 *
 * Structure:
 *   - Local file header + compressed data for "payload.txt"
 *   - Central directory entry pointing at the local header
 *   - End-of-central-directory record
 *
 * Returns the full byte buffer.
 */
function buildMinimalZip() {
  const filename = 'payload.txt';
  const contents = Buffer.from(
    `Open Knowledge M3 mock update payload\nversion=${VERSION}\ntimestamp=${new Date().toISOString()}\n`,
    'utf-8',
  );
  const compressed = deflateRawSync(contents);
  // Minimal CRC-32 implementation — zip requires this (crc of uncompressed bytes).
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  let crc32 = 0xffffffff;
  for (const byte of contents) {
    crc32 = (crcTable[(crc32 ^ byte) & 0xff] ^ (crc32 >>> 8)) >>> 0;
  }
  crc32 = (crc32 ^ 0xffffffff) >>> 0;

  const filenameBuf = Buffer.from(filename, 'utf-8');

  // Local file header (30 bytes + filename)
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(8, 8); // method: deflate
  localHeader.writeUInt16LE(0, 10); // mtime
  localHeader.writeUInt16LE(0, 12); // mdate
  localHeader.writeUInt32LE(crc32, 14);
  localHeader.writeUInt32LE(compressed.length, 18); // compressed size
  localHeader.writeUInt32LE(contents.length, 22); // uncompressed size
  localHeader.writeUInt16LE(filenameBuf.length, 26); // filename length
  localHeader.writeUInt16LE(0, 28); // extra length

  // Central directory file header (46 bytes + filename)
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0); // signature
  cdHeader.writeUInt16LE(0x033f, 4); // version made by
  cdHeader.writeUInt16LE(20, 6); // version needed
  cdHeader.writeUInt16LE(0, 8); // flags
  cdHeader.writeUInt16LE(8, 10); // method
  cdHeader.writeUInt16LE(0, 12); // mtime
  cdHeader.writeUInt16LE(0, 14); // mdate
  cdHeader.writeUInt32LE(crc32, 16);
  cdHeader.writeUInt32LE(compressed.length, 20);
  cdHeader.writeUInt32LE(contents.length, 24);
  cdHeader.writeUInt16LE(filenameBuf.length, 28); // filename length
  cdHeader.writeUInt16LE(0, 30); // extra length
  cdHeader.writeUInt16LE(0, 32); // comment length
  cdHeader.writeUInt16LE(0, 34); // disk number
  cdHeader.writeUInt16LE(0, 36); // internal attrs
  cdHeader.writeUInt32LE(0, 38); // external attrs
  cdHeader.writeUInt32LE(0, 42); // local header offset

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  const cdSize = cdHeader.length + filenameBuf.length;
  const cdOffset = localHeader.length + filenameBuf.length + compressed.length;
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localHeader, filenameBuf, compressed, cdHeader, filenameBuf, eocd]);
}

/**
 * Compute the sha512 hash of a buffer in the base64 format electron-updater
 * expects inside `latest-mac.yml`'s `sha512:` field.
 */
function sha512Base64(buf) {
  return createHash('sha512').update(buf).digest('base64');
}

/**
 * Hand-craft `latest-mac.yml` with a single `.zip` entry. Matches the shape
 * electron-updater's Provider emits — enough fields for GenericProvider to
 * parse and enqueue the download.
 */
function buildLatestMacYml({ version, zipName, zipBytes, releaseDate }) {
  const sha = sha512Base64(zipBytes);
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${zipName}`,
    `    sha512: ${sha}`,
    `    size: ${zipBytes.length}`,
    `path: ${zipName}`,
    `sha512: ${sha}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');
}

async function main() {
  const zipBytes = buildMinimalZip();
  const zipName = 'open-knowledge-mock.zip';
  const manifest = buildLatestMacYml({
    version: VERSION,
    zipName,
    zipBytes,
    releaseDate: new Date().toISOString(),
  });

  // Unique request-correlation id for log noise — helps distinguish runs when
  // the harness is looped by Playwright or CI.
  const runId = randomBytes(4).toString('hex');

  /** Tracks which endpoints have been served so we know when "both served". */
  const served = { manifest: false, zip: false };

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/latest-mac.yml' || url === '/latest-mac.yml?') {
      res.writeHead(200, { 'Content-Type': 'application/x-yaml' });
      res.end(manifest);
      served.manifest = true;
      console.log(`[mock-updater] event=served path=/latest-mac.yml status=200 run=${runId}`);
    } else if (url === `/${zipName}`) {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': String(zipBytes.length),
      });
      res.end(zipBytes);
      served.zip = true;
      console.log(
        `[mock-updater] event=served path=/${zipName} status=200 bytes=${zipBytes.length} run=${runId}`,
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`not found: ${url}\n`);
      console.log(`[mock-updater] event=404 path=${url} run=${runId}`);
    }

    if (served.manifest && served.zip) {
      console.log(
        '[mock-updater] event=manifest-and-zip-served — Electron dev build can verify update-downloaded',
      );
      // Keep the server alive so repeat GETs during electron-updater retries
      // also succeed — but signal "primary goal reached" via stdout so any
      // orchestrator (Playwright, CI) can advance.
    }
  });

  const started = new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        console.log(`[mock-updater] port=${addr.port} run=${runId}`);
        console.log(`[mock-updater] event=start version=${VERSION}`);
        console.log(`[mock-updater] feedUrl=http://127.0.0.1:${addr.port}`);
        console.log(`[mock-updater] manifestUrl=http://127.0.0.1:${addr.port}/latest-mac.yml`);
        console.log(`[mock-updater] zipUrl=http://127.0.0.1:${addr.port}/${zipName}`);
        console.log(`[mock-updater] sha512=${sha512Base64(zipBytes)}`);
        resolve(addr.port);
      } else {
        reject(new Error('server.address() returned non-object'));
      }
    });
    server.once('error', reject);
  });

  const port = await started;

  // Auto-shutdown after a successful smoke OR the configured timeout. Allows
  // tests + CI to invoke the script without hanging the pipeline.
  let shutdownReason = 'timeout';
  const timeoutHandle = setTimeout(() => {
    console.log(`[mock-updater] event=shutdown reason=${shutdownReason} port=${port}`);
    server.close(() => process.exit(shutdownReason === 'done' ? 0 : 1));
  }, TIMEOUT_MS);

  // Quick self-test: fetch /latest-mac.yml + /<zipName> against our own
  // server. Proves the HTTP plumbing works end-to-end before we sit waiting
  // for the Electron side. No electron-updater dependency.
  try {
    const base = `http://127.0.0.1:${port}`;
    const manifestResp = await fetch(`${base}/latest-mac.yml`);
    if (!manifestResp.ok) throw new Error(`manifest fetch ${manifestResp.status}`);
    const manifestText = await manifestResp.text();
    if (!manifestText.includes(`version: ${VERSION}`)) {
      throw new Error('manifest does not include expected version');
    }
    const zipResp = await fetch(`${base}/${zipName}`);
    if (!zipResp.ok) throw new Error(`zip fetch ${zipResp.status}`);
    const zipBuf = Buffer.from(await zipResp.arrayBuffer());
    const computed = sha512Base64(zipBuf);
    const expected = sha512Base64(zipBytes);
    if (computed !== expected) throw new Error(`sha512 mismatch: ${computed} vs ${expected}`);
    console.log('[mock-updater] event=self-test-ok');
    if (KEEP_ALIVE) {
      // Manual Tier-2 flow: keep serving until Ctrl+C so the Electron dev
      // app can hit us as many times as its periodic check fires. Clear the
      // self-test timeout so we don't auto-exit; SIGINT/SIGTERM handlers
      // below take over.
      clearTimeout(timeoutHandle);
      console.log(
        '[mock-updater] event=keep-alive — server will stay up until Ctrl+C (pair with OK_UPDATER_FEED_URL=http://127.0.0.1:' +
          port +
          ' + OK_UPDATER_FORCE_DEV=1 on the dev app)',
      );
      return;
    }
    shutdownReason = 'done';
    clearTimeout(timeoutHandle);
    console.log(`[mock-updater] event=shutdown reason=${shutdownReason} port=${port}`);
    server.close(() => process.exit(0));
  } catch (err) {
    console.error(`[mock-updater] event=self-test-failed message=${err?.message ?? err}`);
    clearTimeout(timeoutHandle);
    server.close(() => process.exit(2));
  }

  // Graceful signal handling so `Ctrl+C` exits 0.
  const handleSignal = (sig) => {
    shutdownReason = `signal-${sig}`;
    console.log(`[mock-updater] event=shutdown reason=${shutdownReason} port=${port}`);
    clearTimeout(timeoutHandle);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => handleSignal('sigint'));
  process.on('SIGTERM', () => handleSignal('sigterm'));
}

main().catch((err) => {
  console.error(`[mock-updater] event=fatal message=${err?.message ?? err}`);
  process.exit(2);
});
