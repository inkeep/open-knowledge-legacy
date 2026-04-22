import { chromium } from 'playwright';

const BASE = 'http://localhost:7733';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const imageRequests = [];
page.on('request', (req) => {
  if (req.resourceType() === 'image') imageRequests.push({ url: req.url() });
});
page.on('response', (res) => {
  const idx = imageRequests.findIndex(r => r.url === res.url());
  if (idx !== -1) imageRequests[idx].status = res.status();
});
page.on('console', (msg) => {
  const text = msg.text();
  if (/error|warn|jpeg|jpg|image/i.test(text)) {
    console.log(`[console.${msg.type()}] ${text}`);
  }
});

await page.goto(`${BASE}/#/tmp-jpeg-test`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const imgs = await page.$$eval('.ProseMirror img', (nodes) =>
  nodes.map((n) => ({
    src: n.src,
    alt: n.alt,
    naturalWidth: n.naturalWidth,
    naturalHeight: n.naturalHeight,
    completeness: n.complete,
  })),
);
console.log('editor <img> tags:', JSON.stringify(imgs, null, 2));
console.log('image requests:', JSON.stringify(imageRequests, null, 2));

await page.screenshot({ path: '/tmp/jpeg-probe.png', fullPage: true });

await browser.close();
