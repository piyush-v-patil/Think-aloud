import { useEffect, useRef, useState } from 'react';
import { replay as copy, ai as aiCopy } from '../copy/strings';
import type { Rerecord, Session } from '../lib/types';
import { formatClock } from '../lib/time';
import { createVoice } from '../lib/voice/natural';
import type { Voice } from '../lib/voice/types';
import { BrowserTranscriber, browserSpeechSupported } from '../lib/speech/browser';
import { AudioRecorder } from '../lib/audio/recorder';
import { createProvider } from '../lib/ai/factory';
import { providerConfig } from '../config/providers';
import { usageRecord } from '../lib/ai/usage';
import { rescore, type MomentContext } from '../lib/feedback/rescore';
import { ProviderError } from '../lib/ai/errors';
import { settingsStore, useSettings } from '../state/settings';
import { pointsLabel } from '../lib/transcript/rows';
import { Button } from './Button';

export interface Moment extends MomentContext {
  kind: 'strong' | 'neutral' | 'negative' | 'missed';
  label: string;
  quote: string;
  reason: string;
  sayInstead?: string;
}

/** The selected moment: what happened, a stronger version to hear, and a chance to try it again. */
export function MomentPanel({ moment, session, onRerecord }: { moment: Moment | null; session: Session; onRerecord: (r: Rerecord) => void }) {
  const [speaking, setSpeaking] = useState(false);
  // The parent remounts this panel per moment, so stopping on unmount is enough.
  // Created on first use, so opening a replay doesn't start loading a voice.
  const voiceRef = useRef<Voice | null>(null);
  const voice = () => (voiceRef.current ??= createVoice(() => settingsStore.get().speech.voice));
  useEffect(() => () => voiceRef.current?.cancel(), []);

  if (!moment) return <p className="text-sm text-ink-soft">{copy.pickMoment}</p>;
  const weak = moment.kind === 'negative' || moment.kind === 'missed';
  const attempts = session.rerecords.filter((r) => r.narrationKey === moment.key);

  return (
    <div className="flex flex-col gap-4 border-l-[3px] border-blue bg-blue-wash p-4">
      <div>
        <p className="text-xs">
          <time className="font-mono text-ink-soft">{formatClock(moment.t)}</time>{' '}
          <span className={`font-semibold ${moment.kind === 'strong' ? 'text-blue' : moment.kind === 'negative' ? 'text-red' : 'text-ink-soft'}`}>{moment.label}</span>
        </p>
        {moment.quote && (
          <p className="mt-1 text-sm">
            <q>{moment.quote}</q>
          </p>
        )}
        <p className="mt-1 text-sm">{moment.reason}</p>
      </div>
      {weak && moment.narration && (
        <div>
          <p className="text-sm font-semibold">{copy.strongerVersion}</p>
          <p className="mt-1 text-sm">{moment.narration}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <Button
              onClick={() => {
                if (speaking) {
                  voice().cancel();
                  setSpeaking(false);
                  return;
                }
                setSpeaking(true);
                voice().speak(moment.narration, { persona: 'neutral', onEnd: () => setSpeaking(false) });
              }}
            >
              {speaking ? copy.stopNarration : copy.playNarration}
            </Button>
          </div>
        </div>
      )}
      {weak && <Rerecorder key={moment.key} moment={moment} session={session} onDone={onRerecord} hasAttempts={attempts.length > 0} />}
      {attempts.length > 0 && (
        <div>
          <p className="text-sm font-semibold">{copy.previousAttempts}</p>
          <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0 text-sm">
            {attempts.map((a) => (
              <li key={a.id}>
                <span className={`font-semibold ${a.verdict === 'better' ? 'text-blue' : a.verdict === 'worse' ? 'text-red' : ''}`}>
                  {pointsLabel(a.points)} {copy.rerecordResult[a.verdict]}
                </span>
                <span className="block">{a.reason}</span>
                <span className="block text-ink-soft">
                  {copy.yourAttempt} <q>{a.transcript}</q>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Rerecorder({ moment, session, onDone, hasAttempts }: { moment: Moment; session: Session; onDone: (r: Rerecord) => void; hasAttempts: boolean }) {
  const settings = useSettings();
  const [state, setState] = useState<'idle' | 'recording' | 'typing' | 'scoring'>('idle');
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const parts = useRef<string[]>([]);
  const engine = useRef<{ t: BrowserTranscriber; r: AudioRecorder } | null>(null);

  async function begin() {
    setError(null);
    parts.current = [];
    setHeard('');
    if (!browserSpeechSupported()) {
      setState('typing');
      return;
    }
    const start = performance.now();
    const t = new BrowserTranscriber(() => performance.now() - start);
    const r = new AudioRecorder();
    try {
      await r.start(() => 0);
      await t.start({
        onPhrase: (p) => {
          parts.current.push(p.text);
          setHeard(parts.current.join(' '));
        },
        onInterim: (text) => setHeard([...parts.current, text].join(' ').trim()),
        onError: (_e, fatal) => fatal && setState('typing'),
      });
      engine.current = { t, r };
      setState('recording');
    } catch {
      setState('typing');
    }
  }

  async function finish(text: string) {
    if (engine.current) {
      engine.current.t.stop();
      await engine.current.r.stop();
      engine.current = null;
    }
    const attempt = text.trim();
    if (!attempt) {
      setError(copy.rerecordEmpty);
      setState('idle');
      return;
    }
    const provider = createProvider(session.config.provider, settings);
    if (!provider) {
      setError(copy.rerecordNeedsKey);
      setState('idle');
      return;
    }
    setState('scoring');
    try {
      const config = providerConfig(session.config.provider, settings.custom);
      const result = await rescore(session, moment, attempt, {
        provider,
        model: session.config.models.debrief,
        record: (usage, model) => session.usage.push(usageRecord(config, 'rerecord', model, usage, moment.t)),
      });
      onDone(result);
    } catch (err) {
      setError(aiCopy.errors[err instanceof ProviderError ? err.kind : 'unknown']);
    }
    setState('idle');
  }

  return (
    <div className="flex flex-col gap-2">
      {state === 'idle' && (
        <div>
          <Button variant="primary" onClick={() => void begin()}>
            {hasAttempts ? copy.tryAgain : copy.rerecord}
          </Button>
        </div>
      )}
      {state === 'recording' && (
        <>
          <p className="text-sm">{copy.rerecordIntro}</p>
          <p className="min-h-6 text-sm" aria-live="polite">
            <span className="font-semibold text-red">{copy.recording}</span> {heard}
          </p>
          <div>
            <Button variant="primary" onClick={() => void finish(parts.current.join(' ') || heard)}>
              {copy.stopRecording}
            </Button>
          </div>
        </>
      )}
      {state === 'typing' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void finish(typed);
          }}
        >
          <label htmlFor="rerecord-text" className="text-sm">
            {copy.rerecordTypeIntro}
          </label>
          <textarea id="rerecord-text" rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-control border border-smudge-mark bg-paper px-3 py-2 text-sm" />
          <div>
            <Button type="submit" variant="primary" disabled={!typed.trim()}>
              {copy.stopRecording}
            </Button>
          </div>
        </form>
      )}
      {state === 'scoring' && (
        <p role="status" className="text-sm">
          {copy.scoring}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      )}
    </div>
  );
}
