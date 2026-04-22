#!/usr/bin/env node
/**
 * Rasterize packages/app/public/favicon.svg → packages/desktop/build/icon.png.
 *
 * Output is a 512×512 PNG — the size electron-builder wants for macOS .icns
 * generation (M2) and the size `app.dock.setIcon()` prefers in dev mode. The
 * committed PNG lets developers run `bun run dev` and see the real icon in
 * the Dock without a build step; CI / M2 packaging re-run this script so the
 * PNG always tracks the SVG.
 *
 * No-op if the PNG is already up-to-date (mtime-based check). Pure-JS
 * rasterizer (@resvg/resvg-js) — no system deps, works on macOS / Linux /
 * Windows / CI containers.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '..', '..', 'app', 'public', 'favicon.svg');
const outDir = resolve(__dirname, '..', 'build');
const outPath = join(outDir, 'icon.png');

function isStale() {
  try {
    const svgMtime = statSync(svgPath).mtimeMs;
    const pngMtime = statSync(outPath).mtimeMs;
    return pngMtime < svgMtime;
  } catch {
    return true;
  }
}

if (!isStale()) {
  console.log('[rasterize-icon] icon.png up-to-date');
  process.exit(0);
}

// Expand the outer <svg>'s viewBox to add transparent padding around the
// artwork. macOS HIG convention: app-icon content occupies ~80% of the
// canvas (≈10% margin each side). Done at rasterize time (not on the SVG
// source) because favicon.svg is also the browser favicon in
// packages/app/index.html, where extra padding is unwanted.
const PAD_RATIO = 0.1;
const rawSvg = readFileSync(svgPath, 'utf8');
const paddedSvg = rawSvg.replace(
  /viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)"/,
  (_m, x, y, w, h) => {
    const wn = Number(w);
    const hn = Number(h);
    const nx = Number(x) - wn * PAD_RATIO;
    const ny = Number(y) - hn * PAD_RATIO;
    const nw = wn * (1 + 2 * PAD_RATIO);
    const nh = hn * (1 + 2 * PAD_RATIO);
    return `viewBox="${nx} ${ny} ${nw} ${nh}"`;
  },
);
if (paddedSvg === rawSvg) {
  throw new Error('[rasterize-icon] failed to rewrite viewBox — unexpected SVG shape');
}
const resvg = new Resvg(paddedSvg, {
  fitTo: { mode: 'width', value: 512 },
  background: 'rgba(0, 0, 0, 0)',
});
const png = resvg.render().asPng();

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);
console.log(`[rasterize-icon] wrote ${outPath} (${png.length} bytes)`);
