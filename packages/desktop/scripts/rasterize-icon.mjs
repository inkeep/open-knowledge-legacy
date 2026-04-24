#!/usr/bin/env node
/**
 * Rasterize packages/app/public/favicon.svg → packages/desktop/build/icon.png.
 *
 * Output is a 1024×1024 PNG. electron-builder generates the macOS .icns from
 * it at package time; the same PNG feeds `app.dock.setIcon()` in dev mode.
 *
 * The favicon is composited onto a macOS-style squircle background so the
 * app icon reads at the same apparent size as other Dock apps. A bare
 * transparent-background PNG renders ~80% canvas-filling, while peer Dock
 * icons have a solid squircle that fills 100% of the canvas with a logo at
 * ~55-60% inside — so ours looked oversized without the squircle.
 *
 * Stale check compares the PNG against both the SVG and this script, so
 * design tweaks here invalidate the cache without needing to touch the SVG.
 *
 * Pure-JS rasterizer (@resvg/resvg-js) — no system deps.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
const svgPath = resolve(__dirname, '..', '..', 'app', 'public', 'favicon.svg');
const outDir = resolve(__dirname, '..', 'build');
const outPath = join(outDir, 'icon.png');

function isStale() {
  try {
    const svgMtime = statSync(svgPath).mtimeMs;
    const scriptMtime = statSync(scriptPath).mtimeMs;
    const pngMtime = statSync(outPath).mtimeMs;
    return pngMtime < Math.max(svgMtime, scriptMtime);
  } catch {
    return true;
  }
}

if (!isStale()) {
  console.log('[rasterize-icon] icon.png up-to-date');
  process.exit(0);
}

// Canvas size — 1024² is the modern macOS app-icon source size. electron-
// builder resamples down to 512/256/128/… for the .icns slices.
const CANVAS = 1024;
// Squircle radius — at ~22.3% of the side a rounded-rect reads visually
// identical to the official macOS super-ellipse mask at Dock sizes.
const RADIUS = 228;
// Brand's `blue-dark` (#29325c in packages/app/src/globals.css). Matches the
// "Open Knowledge" tab look in the editor shell so the Dock icon is
// recognisable alongside the running app.
const BG = '#29325c';
// Logo occupies the inner ~60% of the canvas so apparent size matches
// Dock peers (Zoom, Slack, etc. render their wordmarks at 55–60%).
const LOGO_SIZE = Math.round(CANVAS * 0.6);
const LOGO_POS = Math.round((CANVAS - LOGO_SIZE) / 2);

const rawSvg = readFileSync(svgPath, 'utf8');

// Re-scope the favicon inside a nested <svg> element so its coordinate
// system stays confined to the logo region of the 1024² canvas.
const nestedFavicon = rawSvg.replace(
  /<svg[^>]*>/,
  `<svg x="${LOGO_POS}" y="${LOGO_POS}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" viewBox="0 0 78 80" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`,
);
if (nestedFavicon === rawSvg) {
  throw new Error('[rasterize-icon] failed to rewrite outer <svg> — unexpected favicon shape');
}

const composite = `<svg width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS}" height="${CANVAS}" rx="${RADIUS}" ry="${RADIUS}" fill="${BG}"/>
  ${nestedFavicon}
</svg>`;

const resvg = new Resvg(composite, {
  fitTo: { mode: 'width', value: CANVAS },
  background: 'rgba(0, 0, 0, 0)',
});
const png = resvg.render().asPng();

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, png);
console.log(`[rasterize-icon] wrote ${outPath} (${png.length} bytes)`);
