import { useEffect, useRef, useState } from 'react';
import { interview as copy, languageName, phaseName, ai as aiCopy } from '../copy/strings';
import { useDraft, type InterviewDraft } from '../state/draft';
import { navigate } from '../state/router';
import { useSettings, type Settings } from '../state/settings';
import { useStore } from '../state/store';
import { formatClock } from '../lib/time';
import { PHASES, type SessionConfig } from '../lib/types';
import { InterviewController, type LiveState } from '../lib/session/controller';
import { finishSession } from '../lib/session/finish';
import { createProvider } from '../lib/ai/factory';
import { providerConfig, modelsFor } from '../config/providers';
import { BrowserTranscriber, browserSpeechSupported } from '../lib/speech/browser';
import { BrowserVoice } from '../lib/voice/browser';
import { AudioRecorder } from '../lib/audio/recorder';
import { CodeEditor } from '../ui/CodeEditor';
import { ProblemText } from '../ui/ProblemText';
import { TestOutput } from '../ui/TestOutput';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { MarkedTranscript, type TranscriptRow } from '../ui/MarkedTranscript';

export default function InterviewScreen() {
  const draft = useDraft();
  const settings = useSettings();
  useEffect(() => {
    if (!draft) navigate('/');
  }, [draft]);
  if (!draft) return null;
  return <Live draft={draft} settings={settings} />;
}

export function makeController(draft: InterviewDraft, settings: Settings): InterviewController | null {
  const provider = createProvider(settings.provider, settings);
  if (!provider) return null;
  const config = providerConfig(settings.provider, settings.custom);
  const models = modelsFor(config, settings.preset, settings.advancedModels);
  const voiceWanted = settings.speech.liveEngine !== 'text' && browserSpeechSupported();
  const sessionConfig: SessionConfig = {
    provider: settings.provider,
    preset: settings.preset,
    models,
    liveSpeechEngine: voiceWanted ? 'browser' : 'text',
  };
  return new InterviewController(draft, {
    provider,
    providerConfig: config,
    models,
    config: sessionConfig,
    voice: new BrowserVoice(),
    transcriber: (clock) => (voiceWanted ? new BrowserTranscriber(clock) : null),
    recorder: typeof navigator !== 'undefined' && navigator.mediaDevices ? new AudioRecorder() : null,
  });
}

function Live({ draft, settings }: { draft: InterviewDraft; settings: Settings }) {
  const [controller] = useState(() => makeController(draft, settings));
  useEffect(() => {
    if (!controller) {
      navigate('/settings');
      return;
    }
    controller.attach();
    return () => controller.detach();
  }, [controller]);
  if (!controller) return null;
  return <Workspace controller={controller} />;
}

function Workspace({ controller }: { controller: InterviewController }) {
  const state = useStore(controller.store);
  const dark = useIsDark();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const { problem, language, draft } = controller;
  const remaining = draft.minutes * 60_000 - state.elapsedMs;

  async function end() {
    setEnding(true);
    const id = await finishSession(controller);
    navigate(`/replay/${id}`);
  }

  const rows: TranscriptRow[] = state.utterances.map((u) => ({ id: u.id, kind: 'utterance', speaker: u.speaker, t: u.t0, text: u.text }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-smudge px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="truncate text-md font-semibold">{problem.title}</h1>
          <span className="text-sm text-ink-soft">{languageName[language]}</span>
        </div>
        <PhaseStrip phase={state.phase} />
        <div className="flex items-center gap-6">
          <p className="text-sm" title={formatClock(state.elapsedMs)}>
            <time className="font-mono">{formatClock(Math.abs(remaining))}</time>{' '}
            <span className={remaining >= 0 ? 'text-ink-soft' : 'text-red'}>{remaining >= 0 ? copy.left : copy.over}</span>
          </p>
          <Button variant="secondary" onClick={() => setConfirmEnd(true)}>
            {copy.end}
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <section className="flex flex-col gap-6 border-smudge p-4 sm:p-6 lg:max-h-[calc(100vh-61px)] lg:overflow-y-auto lg:border-r">
          <InterviewerPanel controller={controller} state={state} />
          <details open>
            <summary className="flex min-h-11 cursor-pointer items-center text-md font-semibold">{copy.problemHeading}</summary>
            <div className="pt-2">
              <ProblemText problem={problem} />
            </div>
          </details>
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-md font-semibold">{copy.transcriptHeading}</h2>
              <Button variant="quiet" onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
                {showTranscript ? copy.hideTranscript : copy.showTranscript}
              </Button>
            </div>
            {showTranscript && (
              <div className="mt-3">
                <MarkedTranscript rows={rows} marks={[]} emptyText="" />
              </div>
            )}
          </div>
        </section>

        <section aria-label={copy.editorLabel} className="flex min-w-0 flex-col gap-4 p-4 sm:p-6 lg:h-[calc(100vh-61px)]">
          <div className="h-[55vh] min-h-[320px] lg:h-auto lg:min-h-0 lg:flex-1">
            <CodeEditor value={state.code} language={language} onChange={(v) => controller.setCode(v)} dark={dark} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" onClick={() => void controller.run()} disabled={state.running}>
              {state.running ? copy.running : controller.testable ? copy.run : copy.runScript}
            </Button>
            {state.runnerStatus && <p className="text-sm text-ink-soft">{copy.loadingPython}</p>}
          </div>
          <div className="max-h-[30vh] overflow-y-auto">
            <h2 className="sr-only">{copy.testsHeading}</h2>
            <TestOutput run={state.lastRun} hasTests={controller.testable} />
          </div>
        </section>
      </div>

      <Dialog open={confirmEnd} title={copy.end} onClose={() => setConfirmEnd(false)}>
        <p className="text-sm">{copy.endConfirm}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button variant="primary" onClick={end} disabled={ending}>
            {ending ? copy.ending : copy.endConfirmYes}
          </Button>
          <Button onClick={() => setConfirmEnd(false)}>{copy.endConfirmNo}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PhaseStrip({ phase }: { phase: LiveState['phase'] }) {
  return (
    <ol aria-label={copy.phase} className="m-0 hidden list-none gap-1 p-0 md:flex">
      {PHASES.map((p) => {
        const active = p === phase;
        return (
          <li
            key={p}
            aria-current={active ? 'step' : undefined}
            className={`border-b-[3px] px-2 pb-1 text-xs ${active ? 'border-blue font-semibold text-ink' : 'border-smudge text-ink-soft'}`}
          >
            {phaseName[p]}
          </li>
        );
      })}
    </ol>
  );
}

function InterviewerPanel({ controller, state }: { controller: InterviewController; state: LiveState }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const micText =
    state.mic === 'on'
      ? copy.micOn
      : state.mic === 'starting'
        ? copy.micStarting
        : state.mic === 'blocked'
          ? copy.micBlocked
          : state.mic === 'unsupported'
            ? copy.micUnsupported
            : copy.micOff;
  return (
    <section aria-labelledby="interviewer-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="interviewer-h" className="text-md font-semibold text-green">
          {copy.interviewerLabel}
        </h2>
        <p className="text-sm text-ink-soft" aria-live="polite">
          {copy.status[state.interviewer.status]}
        </p>
      </div>
      <p className="min-h-[66px] border-l-[3px] border-green pl-4 text-md" aria-live="polite">
        {state.interviewer.caption}
      </p>
      {state.problem && (
        <div role="alert" className="text-sm">
          <p className="text-red">
            {copy.interviewerError} {aiCopy.errors[state.problem.kind] ?? ''}
          </p>
          <Button variant="quiet" onClick={() => void controller.ask('turn')}>
            {copy.retryInterviewer}
          </Button>
        </div>
      )}
      {state.input === 'voice' ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-ink-soft">{micText}</p>
          {state.interim && (
            <p>
              <span className="text-ink-soft">{copy.youSaying}</span> {state.interim}
            </p>
          )}
          {state.mic === 'on' && (
            <p className="flex flex-wrap items-center gap-x-3 text-ink-soft">
              {copy.headphones}
              <Button variant="quiet" onClick={() => controller.useTyping()}>
                {copy.switchToTyping}
              </Button>
            </p>
          )}
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            controller.submitTyped(typed);
            setTyped('');
            inputRef.current?.focus();
          }}
        >
          <p className="text-sm text-ink-soft">{micText}</p>
          <label htmlFor="typed" className="sr-only">
            {copy.typeLabel}
          </label>
          <textarea
            id="typed"
            ref={inputRef}
            rows={2}
            value={typed}
            placeholder={copy.typePlaceholder}
            onChange={(e) => {
              setTyped(e.target.value);
              controller.typing();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="w-full rounded-control border border-smudge-mark bg-paper px-3 py-2 text-sm"
          />
          <div>
            <Button type="submit" disabled={!typed.trim()}>
              {copy.typeSend}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
