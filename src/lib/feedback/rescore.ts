/**
 * Re-record a weak moment and get it rescored. The new attempt's quote is
 * checked against its own transcript like any other evidence.
 */
import type { AIProvider } from '../ai/types';
import type { TokenUsage } from '../cost/pricing';
import type { Points, Rerecord, Session } from '../types';
import { prompt } from '../prompts';
import { problemBrief } from '../interview/log';
import { findQuote } from '../transcript/quotes';
import { newId } from '../id';
import { rescoreOut } from './schemas';
import { normalizePoints } from './validate';
import { formatClock } from '../time';

export interface MomentContext {
  key: string;
  t: number;
  original: string;
  feedback: string;
  narration: string;
}

export async function rescore(
  session: Session,
  moment: MomentContext,
  attempt: string,
  deps: { provider: AIProvider; model: string; record: (usage: TokenUsage, model: string) => void; signal?: AbortSignal },
): Promise<Rerecord> {
  const res = await deps.provider.json({
    model: deps.model,
    system: [{ text: `${prompt('feedback-rules')}\n\n${prompt('rescore')}` }, { text: problemBrief(session.problem, false), cache: true }],
    turns: [
      {
        role: 'user',
        text: [
          `Moment at ${formatClock(moment.t)}.`,
          `Originally: ${moment.original || '(silence)'}`,
          `Feedback it got: ${moment.feedback}`,
          `What a strong candidate might have said: ${moment.narration}`,
          `New attempt (transcript): "${attempt}"`,
        ].join('\n'),
      },
    ],
    maxTokens: 2000,
    effort: 'medium',
    schema: rescoreOut,
    schemaName: 'rescore',
    signal: deps.signal,
  });
  deps.record(res.usage, res.model);
  const quoteOk = !res.data.quote.trim() || findQuote(attempt, res.data.quote) !== null;
  const points: Points = quoteOk ? normalizePoints(res.data.points) : 0;
  return {
    id: newId('rr-'),
    narrationKey: moment.key,
    createdAt: Date.now(),
    transcript: attempt,
    verdict: quoteOk ? res.data.verdict : 'same',
    points,
    reason: quoteOk ? res.data.reason.trim() : 'The score could not be tied to your words, so it was not counted.',
  };
}
