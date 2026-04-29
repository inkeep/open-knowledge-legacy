/**
 * Magic-byte buffers for upload e2e tests. Mirror the fixtures used by
 * `packages/server/src/api-extension.test.ts:115, 304, 334` (the unit-tier
 * tests for `/api/upload-image|video|audio`). Extracted here so the e2e
 * suite exercises the same byte sequences the server's `fileTypeFromBuffer`
 * dispatcher accepts.
 *
 * If `file-type` widens or narrows its detection ranges, both surfaces
 * fail the same way — single source of truth.
 */

/** Minimal valid PNG (1×1 transparent pixel). `file-type` detects as image/png. */
export function createPngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQrkJggg==',
    'base64',
  );
}

/** Minimal valid MP4 — a 24-byte `ftyp` box. `file-type` detects as video/mp4. */
export function createMp4Buffer(): Buffer {
  return Buffer.from([
    0x00,
    0x00,
    0x00,
    0x18, // box size = 24
    0x66,
    0x74,
    0x79,
    0x70, // 'ftyp'
    0x6d,
    0x70,
    0x34,
    0x32, // major brand = 'mp42'
    0x00,
    0x00,
    0x00,
    0x00, // minor version
    0x6d,
    0x70,
    0x34,
    0x32, // compat brand = 'mp42'
    0x69,
    0x73,
    0x6f,
    0x6d, // compat brand = 'isom'
  ]);
}

/** ID3v2 header + MPEG-1 Layer III sync frame. `file-type` detects as audio/mpeg. */
export function createMp3Buffer(): Buffer {
  return Buffer.from([
    0x49,
    0x44,
    0x33, // 'ID3'
    0x04,
    0x00, // ID3v2.4
    0x00, // flags
    0x00,
    0x00,
    0x00,
    0x00, // sync-safe size 0 — no ID3 frames
    0xff,
    0xfb, // MPEG-1 Layer III sync
    0x90,
    0x44, // 128 kbps, 44.1 kHz, stereo
    ...new Array(28).fill(0x00),
  ]);
}

/** Minimal PDF magic bytes. Used for the negative-path test where a PDF
 *  masquerades as a `.png` filename — the server's `fileTypeFromBuffer`
 *  rejects it because the detected MIME (`application/pdf`) isn't in
 *  `ALLOWED_IMAGE_MIME_TYPES`.
 */
export function createPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n%\xC4\xE5\xF2\xE5');
}
