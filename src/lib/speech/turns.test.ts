import { describe, expect, it } from 'vitest';
import { TurnTracker, looksLikeEcho, type Turn } from './turns';

describe('TurnTracker', () => {
  it('merges phrases until a natural pause', () => {
    const turns: Turn[] = [];
    const t = new TurnTracker((x) => turns.push(x), 1500);
    t.activity(true, 1000);
    t.phrase({ text: 'Can the list', t0: 1000, t1: 2000 });
    t.phrase({ text: 'be empty?', t0: 2100, t1: 2900 });
    t.activity(false, 3000);
    t.tick(3500);
    expect(turns).toHaveLength(0);
    t.tick(4600);
    expect(turns).toEqual([{ text: 'Can the list be empty?', t0: 1000, t1: 2900 }]);
  });
  it('waits while the user is still speaking', () => {
    const turns: Turn[] = [];
    const t = new TurnTracker((x) => turns.push(x), 1000);
    t.phrase({ text: 'so first', t0: 0, t1: 500 });
    t.activity(true, 600);
    t.tick(5000);
    expect(turns).toHaveLength(0);
    expect(t.inProgress).toBe(true);
    t.activity(false, 5000);
    t.tick(6100);
    expect(turns).toHaveLength(1);
    expect(t.inProgress).toBe(false);
  });
  it('keeps word timings when every phrase has them', () => {
    const turns: Turn[] = [];
    const t = new TurnTracker((x) => turns.push(x));
    t.phrase({ text: 'a', t0: 0, t1: 10, words: [{ w: 'a', t0: 0, t1: 10 }] });
    t.phrase({ text: 'b', t0: 20, t1: 30, words: [{ w: 'b', t0: 20, t1: 30 }] });
    t.flush();
    expect(turns[0].words).toHaveLength(2);
  });
});

describe('looksLikeEcho', () => {
  it('flags recognized text that repeats what the interviewer is saying', () => {
    expect(looksLikeEcho('what is the time complexity', 'Good. What is the time complexity of that?')).toBe(true);
    expect(looksLikeEcho('I think a hash map works here', 'What is the time complexity of that?')).toBe(false);
  });
});
