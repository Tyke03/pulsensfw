import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import { defineConfig, fontProviders, passthroughImageService } from 'astro/config';

const variant = (file, weight) => ({
  weight,
  style: 'normal',
  src: [`./src/assets/fonts/${file}`],
});

/** @type {import('astro').AstroUserConfig} */
export default defineConfig({
  site: 'https://pulsensfw.com',
  output: 'server',
  session: false,
  trailingSlash: 'never',
  server: { host: true, port: 4321 },
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  image: {
    service: passthroughImageService(),
  },
  integrations: [mdx()],
  vite: {
    css: {
      // Inline config so Vite does not walk up to the retired site's postcss.config.js.
      postcss: { plugins: [] },
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Inter',
      cssVariable: '--font-inter',
      fallbacks: ['sans-serif'],
      display: 'swap',
      weights: [400, 500, 600],
      styles: ['normal'],
      options: {
        variants: [
          variant('inter-latin-400-normal.woff2', 400),
          variant('inter-latin-500-normal.woff2', 500),
          variant('inter-latin-600-normal.woff2', 600),
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Space Grotesk',
      cssVariable: '--font-grotesk',
      fallbacks: ['sans-serif'],
      display: 'swap',
      weights: [500, 600, 700],
      styles: ['normal'],
      options: {
        variants: [
          variant('space-grotesk-latin-500-normal.woff2', 500),
          variant('space-grotesk-latin-600-normal.woff2', 600),
          variant('space-grotesk-latin-700-normal.woff2', 700),
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      fallbacks: ['ui-monospace', 'monospace'],
      display: 'swap',
      weights: [400, 500],
      styles: ['normal'],
      options: {
        variants: [
          variant('jetbrains-mono-latin-400-normal.woff2', 400),
          variant('jetbrains-mono-latin-500-normal.woff2', 500),
        ],
      },
    },
  ],
});
