import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:7733';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', (msg) => {
  const text = msg.text();
  if (/error|warn|jpeg|jpg|image|upload|paste/i.test(text)) {
    console.log(`[console.${msg.type()}] ${text}`);
  }
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

// Clean doc
await fetch(`${BASE}/api/agent-write-md`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ docName: 'tmp-jpeg-paste', position: 'replace', markdown: '# drop test\n\n' }),
}).catch(() => {});

await fetch(`${BASE}/api/create-page`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: 'tmp-jpeg-paste.md' }),
}).catch(() => {});

await page.goto(`${BASE}/#/tmp-jpeg-paste`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ProseMirror', { timeout: 10000 });
await page.waitForTimeout(1500);

// Simulate a PASTE with JPEG file
const jpegBuf = readFileSync('/tmp/real.jpg').toString('base64');
const pasted = await page.evaluate(async (b64) => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return 'no-editor';
  editor.focus();
  // Build a DataTransfer with the JPEG file
  const dt = new DataTransfer();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
  dt.items.add(file);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  editor.dispatchEvent(ev);
  return `dispatched, file.type=${file.type}`;
}, jpegBuf);
console.log('paste:', pasted);

// Wait for upload to complete and image to render
await page.waitForTimeout(3500);

const imgs = await page.$$eval('.ProseMirror img', (nodes) =>
  nodes.filter(n => !n.classList.contains('ProseMirror-separator')).map((n) => ({
    src: n.src, alt: n.alt, naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight,
  })),
);
console.log('images after paste:', JSON.stringify(imgs, null, 2));

// Same with PNG for control
const pngBuf = readFileSync('/tmp/real.png').toString('base64');
const pasted2 = await page.evaluate(async (b64) => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) return 'no-editor';
  editor.focus();
  const dt = new DataTransfer();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], 'photo.png', { type: 'image/png' });
  dt.items.add(file);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  editor.dispatchEvent(ev);
  return `dispatched, file.type=${file.type}`;
}, pngBuf);
console.log('paste png:', pasted2);

await page.waitForTimeout(2500);
const imgs2 = await page.$$eval('.ProseMirror img', (nodes) =>
  nodes.filter(n => !n.classList.contains('ProseMirror-separator')).map((n) => ({
    src: n.src, alt: n.alt, naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight,
  })),
);
console.log('images after png paste:', JSON.stringify(imgs2, null, 2));

await browser.close();
