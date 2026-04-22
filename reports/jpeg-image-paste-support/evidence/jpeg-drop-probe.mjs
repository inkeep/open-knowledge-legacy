import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'http://localhost:7733';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const networkLog = [];
page.on('request', (req) => networkLog.push({ method: req.method(), url: req.url() }));
page.on('pageerror', e => console.log('[pageerror]', e.message));

await fetch(`${BASE}/api/create-page`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: 'tmp-jpeg-drop.md' }),
}).catch(() => {});

await page.goto(`${BASE}/#/tmp-jpeg-drop`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ProseMirror');
await page.waitForTimeout(1200);

const jpegBuf = readFileSync('/tmp/real.jpg').toString('base64');
await page.evaluate((b64) => {
  const editor = document.querySelector('.ProseMirror');
  const rect = editor.getBoundingClientRect();
  editor.focus();
  const dt = new DataTransfer();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
  dt.items.add(file);
  const ev = new DragEvent('drop', {
    clientX: rect.left + 10, clientY: rect.top + 10,
    dataTransfer: dt, bubbles: true, cancelable: true,
  });
  editor.dispatchEvent(ev);
}, jpegBuf);
await page.waitForTimeout(3500);
const uploads = networkLog.filter(r => r.method === 'POST' && r.url.includes('/api/upload-image'));
console.log('JPEG drop uploads:', uploads.length);
const imgs = await page.$$eval('.ProseMirror img', (nodes) =>
  nodes.filter(n => !n.classList.contains('ProseMirror-separator')).map((n) => ({
    src: n.src, alt: n.alt, natural: `${n.naturalWidth}x${n.naturalHeight}`,
  })),
);
console.log('JPEG drop images:', JSON.stringify(imgs, null, 2));
await browser.close();
