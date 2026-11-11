import { describe, expect, it } from 'vitest';
import { LiveReactor } from './live';
import type { AIProvider, JsonRequest } from '../ai/types';
import type { Problem } from '../types';
import crate from '../../../problems/crate-pair.json';

function stub(answers: unknown[]): AIProvider & { calls: JsonRequest<unknown>[] } {
  const calls: JsonRequest<unknown>[] = [];
  return {
    id: 'anthropic',
    capabilities: { streaming: true, structuredOutput: true, promptCaching: 'explicit' },
    calls,
    async chat() {
      throw new Error('unused');
    },
    async json<T>(req: JsonRequest<T>) {
      calls.push(req as JsonRequest<unknown>);
      return { data: answers[calls.length - 1] as T, text: JSON.stringify(answers[calls.length - 1]), model: req.model, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
    async checkKey() {},
  };
}

describe('LiveReactor', () => {
  it('reacts only to the requested moments, checks quotes and returns recovery lines', async () => {
    const p = stub([
      {
        reactions: [
          { ref: 'u2', quote: 'Can weights be negative', category: 'clarification', level: 'strong', points: 2, reason: 'asked about negatives', sayInstead: '' },
          { ref: 'u1', quote: 'Take a look', category: 'clarification', level: 'strong', points: 1, reason: 'not asked for', sayInstead: '' },
          { ref: 'u2', quote: 'something invented', category: 'planning', level: 'strong', points: 1, reason: 'bad quote', sayInstead: '' },
        ],
        stuck: { isStuck: false, recoveryLine: 'ignored' },
      },
      { reactions: [{ ref: 's1', quote: '', category: 'narration', level: 'negative', points: -1, reason: 'silent while stuck', sayInstead: 'Tell me what you have ruled out.' }], stuck: { isStuck: true, recoveryLine: 'So far I know brute force works; let me try a smaller example.' } },
    ]);
    const r = new LiveReactor({ provider: p, model: 'claude-sonnet-5-5', problem: crate as unknown as Problem, mode: 'training', language: 'python', onUsage: () => {} });
    r.addUtterance({ id: 'x', speaker: 'interviewer', t0: 0, t1: 1000, text: 'Take a look at the problem.', source: 'model' });
    const ref = r.addUtterance({ id: 'y', speaker: 'user', t0: 2000, t1: 4000, text: 'Can weights be negative?', source: 'browser' });
    expect(ref).toBe('u2');
    const first = await r.react([ref]);
    expect(first.reactions.map((x) => x.reason)).toEqual(['asked about negatives']);
    expect(first.dropped).toBe(2);
    expect(first.recoveryLine).toBeNull();
    const s = r.addSilence(5000, 50_000, 0);
    const second = await r.react([s]);
    expect(second.reactions[0]).toMatchObject({ silence: { t0: 5000, t1: 50_000 }, points: -1 });
    expect(second.recoveryLine).toContain('smaller example');
    // Append-only conversation with the previous end and newest turn cached.
    const turns = p.calls[1].turns;
    expect(turns.map((t) => [t.role, !!t.cache])).toEqual([['user', false], ['assistant', true], ['user', true]]);
    expect(turns[2].text).toContain('React to: s1');
    expect(p.calls[0].system[0].text).toContain('stuck.recoveryLine');
  });
});
