import type { Session } from '../types';
import { newId } from '../id';
import { saveAudio, saveSession } from '../storage/db';
import type { InterviewController } from './controller';

/**
 * Builds the session record from a stopped controller and saves it with its
 * recording. Feedback and scores are added afterwards by the replay pipeline.
 */
export async function buildSession(c: InterviewController): Promise<Session> {
  const state = c.store.get();
  const id = newId('s-');
  let audio: Session['audio'];
  if (c.recording) {
    const audioId = `${id}-audio`;
    await saveAudio(audioId, c.recording.blob);
    audio = { id: audioId, offsetMs: c.recording.offsetMs, mimeType: c.recording.mimeType };
  }
  const endedMs = Math.max(c.clock.now(), c.snapshots[c.snapshots.length - 1].t);
  const liveEngine = state.utterances.find((u) => u.speaker === 'user')?.source ?? c.deps.config.liveSpeechEngine;
  return {
    id,
    createdAt: Date.now() - endedMs,
    endedAt: Date.now(),
    problem: c.problem,
    language: c.language,
    persona: c.draft.persona,
    feedbackMode: c.draft.feedbackMode,
    plannedMinutes: c.draft.minutes,
    config: c.deps.config,
    transcripts: {
      live: { engine: liveEngine === 'model' ? 'text' : liveEngine, utterances: state.utterances },
    },
    code: c.snapshots,
    testRuns: c.runs,
    phases: c.phases,
    hintsGiven: c.hints,
    reactions: state.reactions,
    missed: [],
    rerecords: [],
    usage: [...(c.draft.prepUsage ?? []), ...c.usage],
    speechUsage: [],
    audio,
    notices: state.notices,
  };
}

export async function finishSession(c: InterviewController): Promise<string> {
  await c.stop();
  const session = await buildSession(c);
  await saveSession(session);
  return session.id;
}
