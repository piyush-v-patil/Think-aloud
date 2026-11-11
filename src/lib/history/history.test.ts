import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { configChanges, limitState, spend, suggestNext, trends, weakest } from './stats';
import { demoSession } from '../../demo/demoSession';
import type { RubricScore, Session } from '../types';
import { exportAll, importAll } from '../storage/transfer';
import { saveAudio, saveSession, clearAll, getAudio, listSessions } from '../storage/db';
import { writeLocal } from '../storage/local';

const DAY = 24 * 3600_000;
function session(id: string, createdAt: number, scores: Partial<Record<RubricScore['category'], number>>, cost = 0.4, debriefModel = 'claude-opus-5-5'): Session {
  const base = demoSession();
  return {
    ...base,
    id,
    demo: false,
    createdAt,
    config: { ...base.config, models: { ...base.config.models, debrief: debriefModel } },
    usage: [{ ...base.usage[0], costUsd: cost }],
    debrief: { ...base.debrief!, scores: base.debrief!.scores.map((s) => ({ ...s, score: (scores[s.category] ?? 3) as RubricScore['score'] })) },
  };
}

describe('history stats', () => {
  const now = new Date(2026, 10, 20, 12).getTime();
  const sessions = [
    session('a', now - 40 * DAY, { narration: 1, testing: 2 }, 1),
    session('b', now - 10 * DAY, { narration: 2, testing: 2 }, 0.5),
    session('c', now - 2 * DAY, { narration: 3, testing: 1 }, 0.25, 'claude-fable-5-2'),
  ];
  it('adds up spend for the last 7 days and this month', () => {
    const s = spend([...sessions, demoSession()], now);
    expect(s.weekUsd).toBeCloseTo(0.25);
    expect(s.monthUsd).toBeCloseTo(0.75);
  });
  it('warns near and over the monthly limit', () => {
    expect(limitState(5, null)).toBe('none');
    expect(limitState(5, 10)).toBe('ok');
    expect(limitState(8.5, 10)).toBe('near');
    expect(limitState(10, 10)).toBe('over');
  });
  it('builds trend points per category in time order and marks setup changes', () => {
    const t = trends(sessions);
    expect(t.narration.map((p) => p.score)).toEqual([1, 2, 3]);
    expect(configChanges(sessions)).toEqual([2]);
  });
  it('finds the weakest recent category', () => {
    expect(weakest(sessions)).toBe('testing');
    expect(weakest([])).toBeNull();
  });
  it('suggests an unpracticed problem that exercises the weak area', () => {
    const bank = [
      { id: 'x', title: 'X', difficulty: 'easy' as const, topics: [], mentions: ['testing', 'testing'] as never },
      { id: 'y', title: 'Y', difficulty: 'medium' as const, topics: [], mentions: ['planning'] as never },
      { id: 'z', title: 'Z', difficulty: 'medium' as const, topics: [], mentions: ['testing', 'testing', 'testing'] as never },
    ];
    expect(suggestNext(bank, new Set(['z']), 'testing')!.id).toBe('x');
    expect(suggestNext(bank, new Set(), 'testing')!.id).toBe('z');
  });
});

describe('export and import', () => {
  it('round-trips sessions and recordings, and never exports keys', async () => {
    await clearAll();
    writeLocal('keys', { anthropic: { value: 'sk-ant-secret-000000000', remember: true } });
    await saveSession(session('s1', 1000, {}));
    await saveAudio('s1-audio', new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'audio/webm' }));
    const file = await exportAll();
    const text = JSON.stringify(file);
    expect(text).not.toContain('sk-ant-secret');
    expect(file.sessions).toHaveLength(1);
    await clearAll();
    expect(await listSessions()).toHaveLength(0);
    expect(await importAll(JSON.parse(text))).toBe(1);
    expect((await listSessions())[0].id).toBe('s1');
    const audio = await getAudio('s1-audio');
    expect([...new Uint8Array(await audio!.arrayBuffer())]).toEqual([1, 2, 3, 250]);
  });
  it('rejects files that are not exports', async () => {
    await expect(importAll({ hello: 1 })).rejects.toThrow('not-an-export');
    await expect(importAll({ format: 1, sessions: [{ id: 3 }] })).rejects.toThrow('not-an-export');
  });
});
