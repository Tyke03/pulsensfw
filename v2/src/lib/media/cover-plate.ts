import type { TopicId } from '../content/types';

const ACCENT: Record<TopicId, string> = {
  stars: '#ffd0b8',
  sites: '#f0b8ff',
  ai: '#b8fff8',
  toys: '#ffc2dc',
  vr: '#d7c4ff',
  guides: '#c8f5d8',
  lists: '#ffe2a8',
  news: '#c9dbff',
};

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function motif(topic: TopicId, accent: string, n: number): string {
  const spin = (n % 18) - 9;
  if (topic === 'vr') {
    return `<g transform="translate(620 380) rotate(${spin})">
      <ellipse cx="0" cy="150" rx="250" ry="28" fill="#050308" opacity="0.45"/>
      <path d="M-230 10 C-280 -90 -160 -140 -90 -120" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
      <path d="M230 10 C280 -90 160 -140 90 -120" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
      <rect x="-210" y="-78" width="420" height="160" rx="78" fill="#140c1c" stroke="${accent}" stroke-width="7"/>
      <circle cx="-78" cy="2" r="52" fill="#07050c" stroke="#5cf2ee" stroke-width="5"/>
      <circle cx="78" cy="2" r="52" fill="#07050c" stroke="#5cf2ee" stroke-width="5"/>
      <path d="M-104 2 H-52 M52 2 H104" stroke="#5cf2ee" stroke-width="3" opacity="0.7"/>
      <path d="M-150 -20 H150" stroke="#ffffff" stroke-width="2" opacity="0.18"/>
    </g>`;
  }
  if (topic === 'toys') {
    return `<g transform="translate(640 400) rotate(${-16 + spin})">
      <ellipse cx="20" cy="168" rx="230" ry="26" fill="#050308" opacity="0.45"/>
      <rect x="-150" y="108" width="300" height="22" rx="11" fill="#2a2036"/>
      <rect x="-48" y="-150" width="96" height="280" rx="48" fill="#241628" stroke="${accent}" stroke-width="7"/>
      <rect x="-30" y="-110" width="24" height="170" rx="12" fill="#ffffff" opacity="0.16"/>
      <circle cx="0" cy="-150" r="20" fill="${accent}"/>
      <path d="M-20 40 H20" stroke="#5cf2ee" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    </g>`;
  }
  if (topic === 'stars') {
    return `<g transform="translate(620 390)">
      <circle cx="0" cy="-20" r="70" fill="#140c1c" stroke="${accent}" stroke-width="8"/>
      <path d="M-120 150 C-90 40 90 40 120 150" fill="#140c1c" stroke="${accent}" stroke-width="8"/>
      <path d="M-40 150 H40" stroke="#ff4f9a" stroke-width="4" stroke-linecap="round"/>
    </g>`;
  }
  if (topic === 'sites') {
    return `<g transform="translate(600 380)">
      <rect x="-260" y="-140" width="520" height="300" rx="24" fill="#140c1c" stroke="${accent}" stroke-width="7"/>
      <rect x="-260" y="-140" width="520" height="42" rx="24" fill="#241830"/>
      <circle cx="-220" cy="-119" r="7" fill="#ff4f9a"/>
      <circle cx="-196" cy="-119" r="7" fill="#5cf2ee"/>
      <rect x="-180" y="-40" width="200" height="16" rx="6" fill="${accent}"/>
      <rect x="-180" y="-8" width="320" height="10" rx="5" fill="#f6f1f8" opacity="0.28"/>
      <rect x="-180" y="16" width="260" height="10" rx="5" fill="#f6f1f8" opacity="0.18"/>
    </g>`;
  }
  if (topic === 'ai') {
    return `<g transform="translate(600 390)">
      <rect x="-250" y="-120" width="280" height="120" rx="28" fill="#1c1428" stroke="${accent}" stroke-width="5"/>
      <rect x="-40" y="-40" width="300" height="130" rx="28" fill="#241830" stroke="#5cf2ee" stroke-width="5"/>
      <circle cx="-190" cy="-60" r="8" fill="${accent}"/>
      <circle cx="-160" cy="-60" r="8" fill="${accent}" opacity="0.6"/>
      <circle cx="-130" cy="-60" r="8" fill="${accent}" opacity="0.3"/>
      <path d="M-10 20 H220" stroke="#5cf2ee" stroke-width="4" stroke-linecap="round"/>
      <path d="M-10 48 H160" stroke="#f6f1f8" stroke-width="4" stroke-linecap="round" opacity="0.35"/>
    </g>`;
  }
  if (topic === 'lists') {
    return `<g transform="translate(430 320)" font-family="ui-monospace, monospace">
      <text x="0" y="0" fill="${accent}" font-size="120" font-weight="700">01</text>
      <text x="220" y="90" fill="#f6f1f8" font-size="120" font-weight="700" opacity="0.8">02</text>
      <text x="440" y="180" fill="#5cf2ee" font-size="120" font-weight="700">03</text>
    </g>`;
  }
  if (topic === 'news') {
    const bars = [420, 300, 360, 220, 320];
    return `<g transform="translate(360 250)">${bars
      .map((w, i) => {
        const y = i * 52;
        return `<rect x="0" y="${y}" width="${w}" height="22" rx="6" fill="${i === (n % 5) ? accent : '#f6f1f8'}" opacity="${i === 0 ? 0.95 : 0.28}"/>`;
      })
      .join('')}</g>`;
  }
  if (topic === 'guides') {
    return `<g transform="translate(430 300)" font-family="ui-monospace, monospace">
      <text x="0" y="0" fill="${accent}" font-size="92" font-weight="700">01</text>
      <text x="180" y="80" fill="#f6f1f8" font-size="92" font-weight="700" opacity="0.85">02</text>
      <text x="360" y="160" fill="#5cf2ee" font-size="92" font-weight="700">03</text>
      <path d="M70 20 C160 20 180 90 250 90 C340 90 360 150 450 150" fill="none" stroke="${accent}" stroke-width="4"/>
    </g>`;
  }
  return `<g transform="translate(620 390) rotate(${-8 + spin})">
    <path d="M-40 -150 H150 L190 -110 V150 H-40 Z" fill="#241628" stroke="${accent}" stroke-width="7"/>
    <path d="M150 -150 L190 -110 H150 Z" fill="${accent}"/>
    <text x="-10" y="20" fill="#5cf2ee" font-size="64" font-family="ui-monospace, monospace">%</text>
    <path d="M-10 70 H150" stroke="#f6f1f8" stroke-width="6" opacity="0.35"/>
  </g>`;
}

/** Original seed illustration. Not a photograph and not a third-party asset. */
export function coverMarkup(opts: {
  plate: string;
  topic: TopicId;
  alt: string;
  uid: string;
  decorative?: boolean;
}): string {
  const n = hashString(`${opts.topic}:${opts.plate}:${opts.uid}`);
  const accent = ACCENT[opts.topic];
  const gx = 18 + (n % 62);
  const gy = 10 + ((n >> 5) % 50);
  const label = opts.decorative ? '' : escapeAttr(opts.alt);
  const labelled = opts.decorative ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`;
  const id = opts.uid.replace(/[^a-zA-Z0-9_-]/g, '') || 'plate';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" ${labelled}>
    <defs>
      <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#120c18"/>
        <stop offset="1" stop-color="#2a1634"/>
      </linearGradient>
      <radialGradient id="${id}-glow" cx="${gx}%" cy="${gy}%" r="58%">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.55"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#${id}-bg)"/>
    <rect width="1200" height="750" fill="url(#${id}-glow)"/>
    <g opacity="0.18" stroke="#f6f1f8" stroke-width="1">
      <path d="M80 80 H1120 M80 670 H1120 M80 80 V670 M1120 80 V670"/>
    </g>
    <path d="M90 78 H150 M90 78 V138 M1110 78 H1050 M1110 78 V138 M90 672 H150 M90 672 V612 M1110 672 H1050 M1110 672 V612" fill="none" stroke="${accent}" stroke-width="3"/>
    ${motif(opts.topic, accent, n)}
    <path d="M120 600 H420 L455 600 L478 548 L506 648 L528 572 L548 600 H1080" fill="none" stroke="#ff4f9a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M120 608 H1080" fill="none" stroke="#5cf2ee" stroke-width="1.5" opacity="0.45"/>
  </svg>`;
}
