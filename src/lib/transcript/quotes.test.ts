import { describe, expect, it } from 'vitest';
import { findQuote, quoteAppearsIn, segmentText, normalizeForMatch } from './quotes';

describe('quote matching', () => {
  const text = 'Can the list be empty, and is it already sorted?';
  it('finds quotes ignoring case and punctuation', () => {
    expect(quoteAppearsIn(text, 'can the list be empty')).toBe(true);
    expect(quoteAppearsIn(text, 'empty and is it')).toBe(true);
    expect(quoteAppearsIn(text, 'is it sorted')).toBe(false);
  });
  it('maps back to original offsets', () => {
    const r = findQuote(text, 'can the list be empty');
    expect(r).not.toBeNull();
    expect(text.slice(r!.start, r!.end)).toBe('Can the list be empty');
  });
  it('does not match inside a word', () => {
    expect(quoteAppearsIn('the heap is fine', 'eap is')).toBe(false);
  });
  it('treats curly apostrophes like straight ones', () => {
    expect(quoteAppearsIn('I don’t need extra space', "don't need")).toBe(true);
  });
  it('rejects empty quotes', () => {
    expect(findQuote(text, '  ,  ')).toBeNull();
    expect(normalizeForMatch('  Hello,   World! ')).toBe('hello world');
  });
});

describe('segmentText', () => {
  it('splits marked and plain text and keeps every character', () => {
    const text = 'Can the list be empty, and is it already sorted?';
    const segs = segmentText(text, [
      { id: 'a', quote: 'Can the list be empty' },
      { id: 'b', quote: 'already sorted' },
      { id: 'missing', quote: 'not in here' },
    ]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.find((s) => s.marks.includes('a'))?.text).toBe('Can the list be empty');
    expect(segs.find((s) => s.marks.includes('b'))?.text).toBe('already sorted');
    expect(segs.some((s) => s.marks.includes('missing'))).toBe(false);
  });
  it('handles overlapping marks', () => {
    const segs = segmentText('one two three', [
      { id: 'a', quote: 'one two' },
      { id: 'b', quote: 'two three' },
    ]);
    expect(segs.find((s) => s.text === 'two')?.marks).toEqual(['a', 'b']);
  });
});
