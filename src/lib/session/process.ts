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
