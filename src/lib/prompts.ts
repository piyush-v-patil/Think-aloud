/**
 * Prompts live in /prompts as readable Markdown, separate from app logic.
 * The app bundles them as raw strings; maintainer scripts read the same
 * files from disk.
 */
const files = import.meta.glob<string>('/prompts/*.md', { eager: true, query: '?raw', import: 'default' });

export function prompt(name: string): string {
  const text = files[`/prompts/${name}.md`];
  if (text === undefined) throw new Error(`Missing prompt: ${name}`);
  return text;
}

/** Replaces {{name}} placeholders. Unknown placeholders are left as is. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
