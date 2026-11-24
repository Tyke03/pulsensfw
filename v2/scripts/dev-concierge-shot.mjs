/**
 * Concierge screenshot driver (round 2F/2G verification).
 *
 * Usage: node scripts/dev-concierge-shot.mjs <phase> [desk|mobile] <out.png>
 *   phases: 'answer' | 'unconfigured' | 'quota'
 * Talks to the dev server at localhost:4321. Requires .env shape matching the
 * phase (CONCIERGE_DEV_MOCK, CONCIERGE_SESSION_MAX_TURNS) set by the caller.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4321';

const [phase = 'answer', view = 'desk', outArg] = process.argv.slice(2);
const viewport = view === 'mobile'
  ? { width: 375, height: 812 }
  : { width: 1440, height: 960 };
const file = outArg || join('C:/Users/brhub/AppData/Local/Temp/opencode/shots', `concierge-${phase}-${view}.png`);

const expires = Math.floor(new Date('2027-01-01T00:00:00Z').getTime() / 1000);
const cookie = (name, value) => ({ name, value, url: BASE, expires });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--hide-scrollbars', '--disable-gpu', '--no-first-run'],
});

const page = await browser.newPage();
await page.setViewport(viewport);
await page.setCookie(cookie('pulse_age', 'stub.v1'), cookie('pulse_nsfw', '0'), cookie('pulse_seed', '4'), cookie('pulse_discreet', '0'), cookie('pulse_blur', '0'));
await page.goto(`${BASE}/concierge`, { waitUntil: 'networkidle2', timeout: 60_000 });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await wait(3500);

/** Locate the composer input through nested shadow roots. */
async function composerHandle() {
  return page.evaluateHandle(() => {
    const stack = [document];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      const elementLike = node instanceof Element ? node : node instanceof ShadowRoot ? node : node;
      if (elementLike && elementLike.querySelectorAll) {
        const direct = elementLike.querySelector('textarea, input[type=text], [contenteditable="true"], [contenteditable="plaintext-only"]');
        if (direct) return direct;
      }
      for (const child of elementLike.children ?? []) stack.push(child);
      if (elementLike.shadowRoot) stack.push(elementLike.shadowRoot);
    }
    return null;
  });
}

async function send(prompt) {
  const handle = await composerHandle();
  const element = handle.asElement?.() ?? null;
  if (!element) {
    console.log('composer not found');
    return false;
  }
  try {
    await element.type(prompt, { delay: 12 });
  } catch (error) {
    console.log('type failed:', error.message);
    return false;
  }
  await page.keyboard.press('Enter');
  return true;
}

if (phase === 'answer') {
  await send('compare the pornhub sites, please');
  await wait(9000);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

if (phase === 'unconfigured') {
  await send('say something useful');
  await wait(7000);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

if (phase === 'quota') {
  await send('first turn to consume the daily budget');
  await wait(9000);
  await send('second turn — the cap is one, so this one fails');
  await wait(7000);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

await browser.close();
