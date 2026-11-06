/**
 * Dev screenshot helper.
 *
 * Usage:
 *   node scripts/dev-screenshot.mjs <route> [desk|mobile] [out-dir]
 *
 * Age/NSFW/seed cookies are set directly so pages render past the gate.
 * Full-page PNG capture through system Chrome via puppeteer-core.
 *
 * Capture strategy: pages under ~15k px use Chromium's single-pass fullPage
 * capture. Taller pages (top lists with 10 entity records exceed Chromium's
 * 16384px texture limit, which garbles the lazy stitch) are captured by
 * stepping the scroll position and stitching the parts with Pillow.
 * Output: <out-dir>/<slug>-<viewport>.png (default out dir is a temp folder).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4321';
const DEFAULT_DIR = 'C:/Users/brhub/AppData/Local/Temp/opencode/shots';
const MAX_SINGLE = 15_000;

const PY_STITCH = `\
import sys
from PIL import Image
out, step, total, *parts = sys.argv[1:]
step = int(step)
total = int(total)
first = Image.open(parts[0])
canvas = Image.new("RGB", (first.width, total))
for idx in range(len(parts) - 1):
    canvas.paste(Image.open(parts[idx]), (0, idx * step))
tail = Image.open(parts[-1])
canvas.paste(tail, (0, total - tail.height))
canvas.save(out)
`;

const [route = '/', view = 'desk', outDirArg] = process.argv.slice(2);
const viewport =
  view === 'mobile'
    ? { width: 375, height: 812 }
    : { width: 1440, height: 900 };

const name =
  (route === '/'
    ? 'home'
    : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')) || 'page';
const dir = outDirArg ?? DEFAULT_DIR;
mkdirSync(dir, { recursive: true });
const file = `${dir}/${name}-${view}.png`;
const partsDir = join(dir, '_parts');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const expires = Math.floor(new Date('2027-01-01T00:00:00Z').getTime() / 1000);
const cookie = (name, value) => ({ name, value, url: BASE, expires });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
await page.setCookie(
  cookie('pulse_age', 'stub.v1'),
  cookie('pulse_nsfw', process.env.PULSE_NSFW ?? '0'),
  cookie('pulse_seed', '4'),
);
console.error(`loading ${BASE}${route} (${view})`);
await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 120_000 });
// Astro injects its Dev Toolbar floating pill in dev only — hide it so shots are clean.
await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
// Pin fixed/sticky chrome for full-page captures: painting stays in DOM flow
// (header at top, tabbar at the page end) instead of repainting mid-image.
await page.addStyleTag({
  content: 'header.site-header, .chrome, .tabbar, .seed-ribbon { position: static !important; }',
});
// Neutralize smooth-scroll (site.css sets `scroll-behavior: smooth`), then sweep
// once so below-the-fold media is requested before capture.
await page.evaluate(() => {
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, document.body.scrollHeight);
});
await wait(350);
await page.evaluate(() => window.scrollTo(0, 0));
await wait(350);

const { scrollHeight } = await page.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
}));

if (scrollHeight <= MAX_SINGLE) {
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
} else {
  console.error(`tall page (${scrollHeight}px) -> stepped capture`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(250);
  const { height } = viewport;
  const positions = [];
  for (let y = 0; y + height < scrollHeight; y += height) positions.push(y);
  positions.push(Math.max(0, scrollHeight - height));
  mkdirSync(partsDir, { recursive: true });
  const parts = [];
  for (let i = 0; i < positions.length; i += 1) {
    await page.evaluate((yy) => window.scrollTo(0, yy), positions[i]);
    await wait(140);
    const part = join(partsDir, `${name}-${view}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: part });
    parts.push(part);
  }
  const pyScript = join(partsDir, 'stitch.py');
  writeFileSync(pyScript, PY_STITCH);
  const res = spawnSync('python', [pyScript, file, String(height), String(scrollHeight), ...parts], { encoding: 'utf8' });
  if (res.error || res.status !== 0) throw new Error(`stitch failed: ${res.stderr}`);
  rmSync(partsDir, { recursive: true, force: true });
  console.log(`${file} (${positions.length} parts)`);
}
await browser.close();
