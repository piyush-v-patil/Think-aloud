import { describe, expect, it } from 'vitest';
import { takeSentences } from './browser';

describe('takeSentences', () => {
  it('releases complete sentences and keeps the rest', () => {
    expect(takeSentences('Sure. Can you walk me through')).toEqual({ ready: ['Sure.'], rest: 'Can you walk me through' });
    expect(takeSentences('Good. Why a heap? What else')).toEqual({ ready: ['Good.', 'Why a heap?'], rest: 'What else' });
  });
  it('waits when a period might be a decimal point', () => {
    expect(takeSentences('That is O(n log n) with 3.')).toEqual({ ready: [], rest: 'That is O(n log n) with 3.' });
    expect(takeSentences('It costs 3.5')).toEqual({ ready: [], rest: 'It costs 3.5' });
  });
});
