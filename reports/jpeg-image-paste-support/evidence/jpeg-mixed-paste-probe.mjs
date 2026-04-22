import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'http://localhost:7733';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const networkLog = [];
page.on('request', (req) => networkLog.push({ method: req.method(), url: req.url() }));
page.on('console', (msg) => {
  const t = msg.text();
  if (/error|warn|upload|paste|photo|jpeg|image/i.test(t)) console.log(`[console.${msg.type()}] ${t}`);
});

await fetch(`${BASE}/api/create-page`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: 'tmp-jpeg-mixed.md' }),
}).catch(() => {});

await page.goto(`${BASE}/#/tmp-jpeg-mixed`, { waitUntil: 'networkidle' });
await page.waitForSelector('.ProseMirror');
await page.waitForTimeout(1200);

const jpegBuf = readFileSync('/tmp/real.jpg').toString('base64');

// Case 1: Clipboard has Files + text/html with <img> tag (like Preview/Photos)
const case1 = await page.evaluate(async (b64) => {
  const editor = document.querySelector('.ProseMirror');
  editor.focus();
  const dt = new DataTransfer();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
  dt.items.add(file);
  dt.setData('text/html', '<img src="file:///private/tmp/real.jpg" alt="photo">');
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  editor.dispatchEvent(ev);
  return { preventedDefault: ev.defaultPrevented };
}, jpegBuf);
console.log('case1 (html+file):', JSON.stringify(case1));

await page.waitForTimeout(3500);
const uploadRequests = networkLog.filter(r => r.method === 'POST' && r.url.includes('/api/upload-image'));
console.log('case1 upload requests:', uploadRequests.length);

const imgs = await page.$$eval('.ProseMirror img', (nodes) =>
  nodes.filter(n => !n.classList.contains('ProseMirror-separator')).map((n) => ({
    src: n.src, alt: n.alt, natural: `${n.naturalWidth}x${n.naturalHeight}`, complete: n.complete,
  })),
);
console.log('case1 images:', JSON.stringify(imgs, null, 2));

await browser.close();
