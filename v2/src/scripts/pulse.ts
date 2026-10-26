const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Spike = { x: number; born: number };

let pos = 80;
let hotspot = 0;
let hovering = false;
let amp = 1;
let ampTarget = 1;
let speed = 110;
let last = performance.now();
const spikes: Spike[] = [];

function qrs(u: number): number {
  if (u < 0.12) return 0;
  if (u < 0.28) return -0.28 * ((u - 0.12) / 0.16);
  if (u < 0.46) return -0.28 + Math.sin(((u - 0.28) / 0.18) * Math.PI) * 1.35;
  if (u < 0.62) return 1.07 - ((u - 0.46) / 0.16) * 1.45;
  if (u < 0.78) return -0.38 + ((u - 0.62) / 0.16) * 0.5;
  if (u < 0.95) return Math.sin(((u - 0.78) / 0.17) * Math.PI) * 0.2;
  return 0;
}

function beat(times = 1) {
  const canvas = document.getElementById('pulse-canvas') as HTMLCanvasElement | null;
  const width = canvas?.getBoundingClientRect().width ?? 800;
  for (let i = 0; i < times; i += 1) {
    spikes.push({ x: width * (0.35 + i * 0.18), born: performance.now() + i * 220 });
  }
  ampTarget = 2.1;
}

function draw(canvas: HTMLCanvasElement, now: number) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const pixelW = Math.round(width * dpr);
  const pixelH = Math.round(height * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const baseline = height * 0.68;
  const travel = reduced ? width * 0.62 : pos;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= width; x += 3) {
    let y = baseline;
    const dx = x - travel;
    if (dx > -8 && dx < 78) y -= qrs((dx + 8) / 86) * 8 * amp;
    for (const spike of spikes) {
      const age = now - spike.born;
      if (age < 0 || age > 700) continue;
      const life = 1 - age / 700;
      const local = x - spike.x;
      if (local > -8 && local < 78) y -= qrs((local + 8) / 86) * 10 * life;
    }
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255, 79, 154, 0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#ff4f9a';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function frame(now: number) {
  const dt = Math.min(32, now - last);
  last = now;
  const canvas = document.getElementById('pulse-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    requestAnimationFrame(frame);
    return;
  }
  const width = canvas.getBoundingClientRect().width || 1;
  if (!reduced) {
    if (hovering) pos += (hotspot - pos) * Math.min(1, dt / 180);
    else pos = (pos + dt * (speed / 1000)) % width;
    amp += (ampTarget - amp) * 0.08;
    ampTarget += (1 - ampTarget) * 0.04;
  }
  draw(canvas, now);
  if (!reduced) requestAnimationFrame(frame);
}

function boot() {
  const canvas = document.getElementById('pulse-canvas');
  if (canvas) draw(canvas as HTMLCanvasElement, performance.now());
  if (!reduced) requestAnimationFrame(frame);
}

boot();

document.addEventListener('pointerover', (event) => {
  const target = (event.target as Element | null)?.closest?.('[data-pulse]');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  hotspot = rect.left + rect.width / 2;
  hovering = true;
  ampTarget = 1.8;
});

document.addEventListener('pointerout', (event) => {
  const target = (event.target as Element | null)?.closest?.('[data-pulse]');
  if (!target) return;
  const next = (event as PointerEvent).relatedTarget as Node | null;
  if (next && target.contains(next)) return;
  hovering = false;
});

let scrollTick = 0;
window.addEventListener('scroll', () => {
  if (reduced) return;
  const next = window.scrollY;
  const delta = Math.abs(next - scrollTick);
  scrollTick = next;
  speed = Math.min(220, 110 + delta * 0.8);
}, { passive: true });

let loads = 0;
document.addEventListener('astro:page-load', () => {
  loads += 1;
  document.documentElement.classList.remove('is-navigating');
  if (loads > 1) beat(2);
  else beat(1);
  if (reduced) {
    const canvas = document.getElementById('pulse-canvas') as HTMLCanvasElement | null;
    if (canvas) draw(canvas, performance.now());
  }
});

document.addEventListener('astro:before-preparation', () => {
  document.documentElement.classList.add('is-navigating');
});

window.addEventListener('resize', () => {
  if (!reduced) return;
  const canvas = document.getElementById('pulse-canvas') as HTMLCanvasElement | null;
  if (canvas) draw(canvas, performance.now());
});
