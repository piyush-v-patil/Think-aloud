/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildCsp } from './src/config/csp.ts';
import { APP_NAME } from './src/config/app.ts';

/** Fills the title, and in production adds the Content Security Policy. */
function htmlPlugin(): Plugin {
  return {
    name: 'think-aloud-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        let out = html.replaceAll('%APP_NAME%', APP_NAME);
        if (!ctx.server) {
          out = out.replace(
            '<!--CSP-->',
            `<meta http-equiv="Content-Security-Policy" content="${buildCsp()}" />`,
          );
        }
        return out;
      },
    },
  };
}

export default defineConfig({
  // Relative base so the static build works on GitHub Pages project sites
  // and any other static host without configuration.
  base: './',
  plugins: [react(), tailwindcss(), htmlPlugin()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
});
