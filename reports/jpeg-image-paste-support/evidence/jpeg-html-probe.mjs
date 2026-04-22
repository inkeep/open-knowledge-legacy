import { chromium } from 'playwright';
const BASE = 'http://localhost:7733';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/#/tmp-jpeg-test`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const html = await page.$eval('.ProseMirror', (el) => el.innerHTML);
console.log(html);
await browser.close();
