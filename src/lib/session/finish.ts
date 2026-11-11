import type { CodeSnapshot, Session, TestRun } from '../types';
import type { InterviewDraft } from '../../state/draft';
import type { Settings } from '../../state/settings';
import { newId } from '../id';
import { saveSession } from '../storage/db';

/** Milestone 1: saves the code and test history. Later milestones add the transcript and feedback. */
export async function finishSession(args: {
  draft: InterviewDraft;
  settings: Settings;
  endedAtMs: number;
  code: CodeSnapshot[];
  testRuns: TestRun[];
}): Promise<string> {
  const { draft, settings } = args;
  const session: Session = {
    id: newId('s-'),
    createdAt: Date.now() - args.endedAtMs,
    endedAt: Date.now(),
    problem: draft.problem,
    language: draft.language,
    persona: draft.persona,
    feedbackMode: draft.feedbackMode,
    plannedMinutes: draft.minutes,
    config: {
      provider: settings.provider,
      preset: settings.preset,
      models: { interviewer: '', reactions: '', debrief: '' },
      liveSpeechEngine: 'text',
    },
    transcripts: { live: { engine: 'text', utterances: [] } },
    code: args.code,
    testRuns: args.testRuns,
    phases: [],
    hintsGiven: [],
    reactions: [],
    missed: [],
    rerecords: [],
    usage: [...(draft.prepUsage ?? [])],
    speechUsage: [],
    notices: [],
  };
  await saveSession(session);
  return session.id;
}
