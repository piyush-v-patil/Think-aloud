/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * A small index of the problem bank (id, title, difficulty, topics) so the
 * setup screen doesn't bundle every problem's full analysis.
 */
function problemIndexPlugin(): Plugin {
  const id = 'virtual:problem-index';
  const dir = join(import.meta.dirname, 'problems');
  return {
    name: 'think-aloud-problem-index',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load(resolved) {
      if (resolved !== '\0' + id) return null;
      const entries = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          this.addWatchFile(join(dir, f));
          const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
          return {
            id: p.id,
            title: p.title,
            difficulty: p.difficulty,
            topics: p.topics,
            mentions: (p.analysis?.expectedMentions ?? []).map((m: { category: string }) => m.category),
            leetcode: p.leetcode,
          };
        });
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}

export default defineConfig({
  // Relative base so the static build works on GitHub Pages project sites
  // and any other static host without configuration.
  base: './',
  plugins: [react(), tailwindcss(), htmlPlugin(), problemIndexPlugin()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
});
