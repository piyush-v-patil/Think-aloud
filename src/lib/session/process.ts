/**
 * After-interview processing, shared by the replay screen: runs the
 * scoring pipeline once per session (even if the screen mounts twice) and
 * saves the result.
 */
import type { Session } from '../types';
import type { Settings } from '../../state/settings';
import { createProvider } from '../ai/factory';
import { providerConfig } from '../../config/providers';
import { usageRecord } from '../ai/usage';
import { runDebrief, durationOf, type DebriefStage } from '../feedback/debrief';
import { CodeRunner } from '../runner/runner';
import { saveSession } from '../storage/db';
import { hasTests } from '../problems/paste';
import { createStore } from '../../state/store';
import { getAudio, listEntries, saveListEntry } from '../storage/db';
import { aggregate } from '../feedback/debrief';
import { fileTranscriber, type FileTranscriber } from '../speech/files';
import { WhisperLocal } from '../speech/whisper';
import { alignTranscript } from '../speech/align';
import { speechKey } from '../speech/choose';
import { SPEECH_ENGINES } from '../../config/speech';
import { replay as copy } from '../../copy/strings';

/**
 * The accurate transcript: the recording sent to the chosen paid engine (or
 * transcribed on this device), aligned to the session clock. If it fails,
 * scoring uses the live transcript and the replay says so.
 */
export async function transcribeAccurately(session: Session, settings: Settings): Promise<void> {
  const engine = session.config.accurateSpeechEngine;
  if (!engine || !session.audio || session.transcripts.accurate) return;
  const label = SPEECH_ENGINES[engine].label;
  const key = engine === 'whisper-local' ? undefined : speechKey(engine, settings);
  const transcriber: FileTranscriber | null =
    engine === 'whisper-local' ? new WhisperLocal() : key ? fileTranscriber(engine, key) : null;
  const blob = await getAudio(session.audio.id);
  if (!transcriber || !blob) {
    session.notices.push(copy.accurateSkipped(label));
    return;
  }
  try {
    const hints = session.problem.analysis?.vocabulary ?? [];
    const { words } = await transcriber.transcribe(blob, { hints });
    if (!words.length) throw new Error('empty');
    session.transcripts.accurate = alignTranscript({ engine, words, offsetMs: session.audio.offsetMs, live: session.transcripts.live.utterances });
    const cfg = SPEECH_ENGINES[engine];
    if (cfg.paid) {
      const seconds = Math.max(1, (durationOf(session) - session.audio.offsetMs) / 1000);
      const perMinute = (cfg.filePerMinute ?? 0) + (hints.length ? (cfg.keywordHintsPerMinute ?? 0) : 0);
      session.speechUsage.push({ engine, purpose: 'accurate', seconds, costUsd: (seconds / 60) * perMinute });
    }
  } catch {
    session.notices.push(copy.accurateFailed(label));
  }
}

export interface ProcessState {
  stage: DebriefStage | 'transcribing' | null;
  error: string | null;
}

const inFlight = new Map<string, Promise<Session>>();
export const processStore = createStore<Record<string, ProcessState>>({});

function setStage(id: string, patch: Partial<ProcessState>) {
  processStore.set((s) => ({ ...s, [id]: { ...(s[id] ?? { stage: null, error: null }), ...patch } }));
}

export function processSession(session: Session, settings: Settings): Promise<Session> {
  const existing = inFlight.get(session.id);
  if (existing) return existing;
  const job = (async () => {
    const provider = createProvider(session.config.provider, settings);
    if (!provider) throw new Error('no-key');
    const config = providerConfig(session.config.provider, settings.custom);
    const runner = new CodeRunner();
    try {
      setStage(session.id, { stage: 'transcribing' });
      await transcribeAccurately(session, settings);
      const out = await runDebrief(session, {
        provider,
        model: session.config.models.debrief,
        record: (role, model, usage) => session.usage.push(usageRecord(config, role, model, usage, durationOf(session))),
        runFinal: async (s) => {
          if (!hasTests(s.problem)) return null;
          const code = s.code[s.code.length - 1].code;
          return runner.runTests(s.language, code, s.problem.signature, s.problem.tests, durationOf(s));
        },
        onStage: (stage) => setStage(session.id, { stage }),
      });
      out.usage = session.usage;
      await saveSession(out);
      await updateListEntry(out);
      return out;
    } finally {
      runner.dispose();
    }
  })();
  inFlight.set(session.id, job);
  job.catch((err) => {
    inFlight.delete(session.id);
    setStage(session.id, { stage: null, error: err instanceof Error ? (err as { kind?: string }).kind ?? err.message : 'unknown' });
  });
  return job;
}

/** Marks a list entry practiced and remembers its average score, so weak ones resurface. */
export async function updateListEntry(s: Session): Promise<void> {
  if (!s.listEntryId || !s.debrief) return;
  const entry = (await listEntries()).find((e) => e.id === s.listEntryId);
  if (!entry) return;
  const { average } = aggregate(s.debrief.scores);
  await saveListEntry({
    ...entry,
    problemId: s.problem.id,
    completedAt: entry.completedAt ?? Date.now(),
    lastScore: average ?? entry.lastScore,
    sessions: [...new Set([...entry.sessions, s.id])],
  });
}
