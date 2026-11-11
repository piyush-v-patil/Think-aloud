/**
 * Builds the accurate transcript from a file transcription. Word times from
 * the engine are seconds from the start of the recording; adding the
 * recording's offset puts them on the session clock, so replay markers stay
 * in sync. The recording only holds the candidate's microphone, so the
 * interviewer's lines are kept from the live transcript, and any words
 * heard while the interviewer was speaking (echo) are dropped.
 */
import type { Transcript, Utterance, SpeechEngineId } from '../types';

export interface Word {
  w: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
}

export function alignTranscript(opts: {
  engine: SpeechEngineId;
  words: Word[];
  offsetMs: number;
  live: Utterance[];
  /** A pause at least this long starts a new utterance. */
  gapMs?: number;
}): Transcript {
  const gap = opts.gapMs ?? 1500;
  const interviewer = opts.live.filter((u) => u.speaker === 'interviewer');
  const during = (t: number) => interviewer.some((u) => t >= u.t0 && t <= u.t1);
  const words = opts.words
    .map((x) => ({ w: x.w.trim(), t0: Math.round(x.start * 1000 + opts.offsetMs), t1: Math.round(x.end * 1000 + opts.offsetMs) }))
    .filter((x) => x.w && !during((x.t0 + x.t1) / 2))
    .sort((a, b) => a.t0 - b.t0);

  const user: Utterance[] = [];
  let current: typeof words = [];
  const flush = () => {
    if (!current.length) return;
    user.push({
      id: `acc-${user.length + 1}`,
      speaker: 'user',
      t0: current[0].t0,
      t1: current[current.length - 1].t1,
      text: current.map((x) => x.w).join(' '),
      source: opts.engine,
      words: current,
    });
    current = [];
  };
  for (const w of words) {
    const prev = current[current.length - 1];
    // A new utterance after a pause, or when the interviewer spoke in between.
    if (prev && (w.t0 - prev.t1 >= gap || interviewer.some((u) => u.t0 > prev.t1 && u.t0 < w.t0))) flush();
    current.push(w);
  }
  flush();
  return { engine: opts.engine, utterances: [...interviewer, ...user].sort((a, b) => a.t0 - b.t0) };
}
