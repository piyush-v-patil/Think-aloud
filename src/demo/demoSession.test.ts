import { describe, expect, it } from 'vitest';
import { demoSession } from './demoSession';
import { findQuote } from '../lib/transcript/quotes';
import { codeAt } from '../lib/replay/sync';
import { executeJs } from '../lib/runner/js-exec';

describe('demo session', () => {
  const s = demoSession();
  const user = s.transcripts.live.utterances.filter((u) => u.speaker === 'user');
  it('only quotes words that appear in its own transcript', () => {
    for (const r of s.reactions) {
      if (r.silence) continue;
      const u = user.find((x) => x.id === r.utteranceId)!;
      expect(findQuote(u.text, r.quote), r.quote).not.toBeNull();
    }
    for (const sc of s.debrief!.scores) {
      expect(sc.evidence.length).toBeGreaterThan(0);
      for (const e of sc.evidence) if (e.quote) expect(user.some((u) => findQuote(u.text, e.quote)), e.quote).toBe(true);
    }
  });
  it('gives every negative moment something to say instead', () => {
    for (const r of s.reactions.filter((x) => x.points < 0)) expect(r.sayInstead).toBeTruthy();
  });
  it('ends with code that really passes the tests', () => {
    // The demo's final code is in Python; check the same logic in JavaScript.
    const final = codeAt(s.code, Infinity);
    expect(final).toContain('max(out[-1][1], end)');
    const js = `function merge_bookings(b){const out=[];for(const [s,e] of [...b].sort((x,y)=>x[0]-y[0]||x[1]-y[1])){if(out.length&&s<=out[out.length-1][1])out[out.length-1][1]=Math.max(out[out.length-1][1],e);else out.push([s,e]);}return out;}`;
    const res = executeJs({ id: 1, code: js, signature: s.problem.signature, tests: s.problem.tests, mode: 'tests' });
    expect(res.outcomes.every((o) => o.ok)).toBe(true);
  });
});
