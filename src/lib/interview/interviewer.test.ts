import { describe, expect, it } from 'vitest';
import { Interviewer, parseReply, cleanSpoken } from './interviewer';
import { AnthropicProvider } from '../ai/anthropic';
import { anthropicStream, fakeFetch } from '../ai/testing';
import type { Problem } from '../types';
import crate from '../../../problems/crate-pair.json';

describe('parseReply', () => {
  it('reads the tagged format', () => {
    expect(parseReply('<decision>speak</decision><phase>clarify</phase><hint>0</hint><say>Yes, it can be empty.</say>')).toEqual({
      decision: 'speak',
      phase: 'clarify',
      hint: 0,
      say: 'Yes, it can be empty.',
    });
  });
  it('treats an empty say as waiting', () => {
    expect(parseReply('<decision>speak</decision><phase>code</phase><hint>0</hint><say></say>').decision).toBe('wait');
    expect(parseReply('<decision>wait</decision><phase>code</phase><hint>0</hint><say></say>').decision).toBe('wait');
  });
  it('falls back to plain text when the model ignores the format', () => {
    expect(parseReply('Okay, go ahead.')).toMatchObject({ decision: 'speak', say: 'Okay, go ahead.', phase: null });
  });
  it('rejects unknown phases and parses hints', () => {
    expect(parseReply('<decision>speak</decision><phase>dance</phase><hint>2</hint><say>Think about lookups.</say>')).toMatchObject({ phase: null, hint: 2 });
  });
  it('cleans text for speech', () => {
    expect(cleanSpoken('That is **O(n)** time.')).toBe('That is O of n time.');
  });
});

describe('Interviewer', () => {
  const problem = crate as unknown as Problem;

  it('sends an append-only conversation with the newest turn cached', async () => {
    const replies = [
      '<decision>speak</decision><phase>clarify</phase><hint>0</hint><say>Hi. Let’s look at crate pairs.</say>',
      '<decision>speak</decision><phase>clarify</phase><hint>0</hint><say>Yes, weights can be negative.</say>',
    ];
    let i = 0;
    const f = fakeFetch(() => anthropicStream(replies[i++]));
    const usage: number[] = [];
    const iv = new Interviewer({
      provider: new AnthropicProvider('sk-ant-test-00000000', { fetch: f.fetch, maxRetries: 0 }),
      model: 'claude-sonnet-5-5',
      persona: 'neutral',
      problem,
      minutes: 45,
      onUsage: (u) => usage.push(u.outputTokens),
    });
    const said: string[] = [];
    const first = await iv.respond('start', (s) => said.push(s));
    expect(first.reply.say).toBe('Hi. Let’s look at crate pairs.');
    expect(said[said.length - 1]).toBe('Hi. Let’s look at crate pairs.');
    first.commit();

    iv.add({ kind: 'utterance', utterance: { id: 'u1', speaker: 'user', t0: 5000, t1: 7000, text: 'Can weights be negative?', source: 'browser' } });
    const second = await iv.respond('turn');
    second.commit();
    expect(second.reply.say).toBe('Yes, weights can be negative.');

    const body = f.calls[1].body as { system: { text: string; cache_control?: unknown }[]; messages: { role: string; content: { text: string; cache_control?: unknown }[] }[] };
    // Stable system prefix: the problem block is cached.
    expect(body.system[1].cache_control).toBeDefined();
    expect(body.system[1].text).toContain('Private analysis');
    // The earlier exchange is replayed unchanged; the previous end and the newest turn are marked.
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[0].content[0].cache_control).toBeUndefined();
    expect(body.messages[1].content[0].cache_control).toBeDefined();
    expect(body.messages[2].content[0].cache_control).toBeDefined();
    expect(body.messages[2].content[0].text).toContain('[00:05] Candidate: "Can weights be negative?"');
    expect(usage).toHaveLength(2);
    expect(iv.turns).toBe(2);
  });

  it('keeps entries pending when a reply is dropped', async () => {
    const f = fakeFetch(() => anthropicStream('<decision>speak</decision><phase>code</phase><hint>0</hint><say>Why a map?</say>'));
    const iv = new Interviewer({
      provider: new AnthropicProvider('sk-ant-test-00000000', { fetch: f.fetch, maxRetries: 0 }),
      model: 'claude-haiku-5-5',
      persona: 'friendly',
      problem,
      minutes: 30,
      onUsage: () => {},
    });
    iv.add({ kind: 'note', t: 1000, text: 'something' });
    await iv.respond('turn'); // not committed: the candidate kept talking
    iv.add({ kind: 'note', t: 2000, text: 'more' });
    const again = await iv.respond('turn');
    const last = (f.calls[1].body as { messages: { content: { text: string }[] }[] }).messages;
    expect(last).toHaveLength(1);
    expect(last[0].content[0].text).toContain('something');
    expect(last[0].content[0].text).toContain('more');
    again.commit();
    expect(iv.turns).toBe(1);
  });
});
