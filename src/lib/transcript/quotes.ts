/**
 * Finding quoted evidence inside transcript text. The same matching is used
 * to validate model output (a quote that can't be found is dropped) and to
 * draw underlines, so what is shown is exactly what was checked.
 */

/** Lowercase, unify quotes and dashes, drop punctuation, collapse spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds `quote` in `text` ignoring case, punctuation and spacing.
 * Returns character offsets into the original `text`, or null.
 */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = normalizeForMatch(quote);
  if (!q) return null;
  // Build a normalized copy of text with a map back to original offsets.
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i].toLowerCase();
    if (/[‘’ʼ]/.test(ch)) ch = "'";
    if (!/[a-z0-9']/.test(ch)) ch = ' ';
    if (ch === ' ') {
      if (lastWasSpace) continue;
      lastWasSpace = true;
    } else lastWasSpace = false;
    norm += ch;
    map.push(i);
  }
  const startsAt = (idx: number) => idx === 0 || norm[idx - 1] === ' ';
  let idx = norm.indexOf(q);
  // Prefer a match that starts at a word boundary.
  while (idx !== -1 && !startsAt(idx)) idx = norm.indexOf(q, idx + 1);
  if (idx === -1) return null;
  const start = map[idx];
  const end = map[idx + q.length - 1] + 1;
  return { start, end };
}

export function quoteAppearsIn(text: string, quote: string): boolean {
  return findQuote(text, quote) !== null;
}

export interface Segment {
  text: string;
  /** Ids of marks covering this segment (empty for plain text). */
  marks: string[];
}

/**
 * Splits text into plain and marked segments. Overlapping marks share the
 * overlapping region; marks whose quote can't be found are left out.
 */
export function segmentText(text: string, marks: { id: string; quote: string }[]): Segment[] {
  const ranges = marks
    .map((m) => ({ id: m.id, range: findQuote(text, m.quote) }))
    .filter((r): r is { id: string; range: { start: number; end: number } } => r.range !== null);
  if (!ranges.length) return [{ text, marks: [] }];
  const cuts = new Set<number>([0, text.length]);
  for (const r of ranges) {
    cuts.add(r.range.start);
    cuts.add(r.range.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    const ids = ranges.filter((r) => r.range.start <= a && r.range.end >= b).map((r) => r.id);
    const prev = out[out.length - 1];
    if (prev && prev.marks.join() === ids.join()) prev.text += text.slice(a, b);
    else out.push({ text: text.slice(a, b), marks: ids });
  }
  return out;
}
