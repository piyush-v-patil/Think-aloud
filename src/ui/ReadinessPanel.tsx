import { useCallback, useEffect, useState } from 'react';
import { ready as copy, languageName, ai as aiCopy } from '../copy/strings';
import { useSettings } from '../state/settings';
import { useKeys } from '../state/keys';
import { useStore } from '../state/store';
import { prepareRuntime, runtimeStore, type RuntimeState } from '../lib/readiness/runtime';
import { naturalEngine, type NaturalStatus } from '../lib/voice/natural';
import { NATURAL_PREFIX } from '../lib/voice/kokoro-config';
import { listVoices } from '../lib/voice/browser';
import { chooseLiveEngine } from '../lib/speech/choose';
import { browserSpeechSupported } from '../lib/speech/browser';
import { CompatibleProvider } from '../lib/ai/compatible';
import { providerConfig } from '../config/providers';
import { Button, ButtonLink } from './Button';

/**
 * What still has to load or be allowed before an interview, for the
 * current choices, with progress. Loading starts here, so it's usually
 * done by the time the candidate has picked a problem. Nothing blocks
 * starting: whatever is unfinished carries on in the background.
 */

type ItemState = 'ready' | 'working' | 'action' | 'problem' | 'info';

interface Item {
  id: string;
  label: string;
  state: ItemState;
  text: string;
  /** 0..1 while working. */
  progress?: number;
  action?: { label: string; onClick?: () => void; href?: string };
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded-full bg-smudge">
      <div className="h-full rounded-full bg-blue transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>
  );
}

function useNatural(): NaturalStatus {
  const [s, setS] = useState(naturalEngine.status);
  useEffect(() => naturalEngine.subscribe(setS), []);
  return s;
}

type MicPermission = 'granted' | 'prompt' | 'denied' | 'unknown' | 'requesting';

function useMicPermission(): [MicPermission, () => void] {
  const [state, setState] = useState<MicPermission>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state as MicPermission);
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => setState('unknown'));
    return () => status?.removeEventListener('change', update);
  }, []);
  const request = useCallback(() => {
    setState('requesting');
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        for (const t of stream.getTracks()) t.stop();
        setState('granted');
      })
      .catch(() => setState('denied'));
  }, []);
  return [state, request];
}

type Reach = 'checking' | 'ok' | 'failed';

/** For Claude Code and custom endpoints: is the server there? (A model list, no inference.) */
function useEndpointReach(url: string | null, key: string | undefined): [Reach | null, () => void] {
  const [attempt, setAttempt] = useState(0);
  // The result belongs to one url, key and attempt; anything else is still being checked.
  const [result, setResult] = useState<{ for: string; reach: Reach } | null>(null);
  const id = `${url}|${key ?? ''}|${attempt}`;
  useEffect(() => {
    if (!url) return;
    let live = true;
    new CompatibleProvider(url, key)
      .checkKey()
      .then(() => live && setResult({ for: id, reach: 'ok' }))
      .catch(() => live && setResult({ for: id, reach: 'failed' }));
    return () => {
      live = false;
    };
  }, [url, key, id]);
  if (!url) return [null, () => {}];
  return [result?.for === id ? result.reach : 'checking', () => setAttempt((n) => n + 1)];
}

function runnerItem(language: 'python' | 'javascript' | 'java', s: RuntimeState): Item {
  const name = languageName[language];
  const base = { id: 'runner', label: copy.runner.label(name) };
  if (language === 'javascript') return { ...base, state: 'ready', text: copy.runner.builtIn };
  switch (s.state) {
    case 'idle':
      return { ...base, state: 'working', text: copy.runner.downloadingUnknown(name), progress: 0 };
    case 'downloading':
      return {
        ...base,
        state: 'working',
        text: s.total ? copy.runner.downloading(name, copy.mb(s.loaded), copy.mb(s.total)) : copy.runner.downloadingUnknown(name),
        // Downloading is most of the wait; starting is the last stretch.
        progress: s.total ? (s.loaded / s.total) * 0.9 : 0,
      };
    case 'starting':
      return { ...base, state: 'working', text: copy.runner.starting(name), progress: 0.95 };
    case 'ready':
      return { ...base, state: 'ready', text: copy.runner.ready };
    case 'failed':
      return { ...base, state: 'problem', text: copy.runner.failed(s.message), action: { label: copy.tryAgain, onClick: () => void prepareRuntime(language) } };
  }
}

export function ReadinessPanel() {
  const settings = useSettings();
  const keys = useKeys();
  const runtimes = useStore(runtimeStore);
  const natural = useNatural();
  const [mic, requestMic] = useMicPermission();
  const language = settings.language;

  // Start loading the runtime for the chosen language.
  useEffect(() => {
    void prepareRuntime(language);
  }, [language]);

  const endpoint = settings.provider === 'claude-code' ? settings.claudeCodeUrl : settings.provider === 'custom' && settings.custom.baseUrl ? settings.custom.baseUrl : null;
  const [reach, recheck] = useEndpointReach(endpoint, keys[settings.provider]?.value);

  const items: Item[] = [runnerItem(language, runtimes[language])];

  // The interviewer's voice.
  const voiceSetting = settings.speech.voice;
  if (voiceSetting.startsWith(NATURAL_PREFIX)) {
    const base = { id: 'voice', label: copy.voice.label };
    if (natural.state === 'ready') items.push({ ...base, state: natural.fastEnough ? 'ready' : 'info', text: natural.fastEnough ? copy.voice.naturalReady : copy.voice.naturalSlow });
    else if (natural.state === 'failed') items.push({ ...base, state: 'info', text: copy.voice.naturalFailed });
    else {
      const percent = natural.state === 'loading' ? Math.round(natural.progress) : 0;
      items.push({ ...base, state: 'working', text: copy.voice.naturalLoading(percent), progress: (percent / 100) * 0.85 });
    }
  } else if (typeof speechSynthesis === 'undefined') {
    items.push({ id: 'voice', label: copy.voice.label, state: 'info', text: copy.voice.none });
  } else {
    const chosen = listVoices().find((v) => v.uri === voiceSetting) ?? listVoices()[0];
    items.push({ id: 'voice', label: copy.voice.label, state: 'ready', text: chosen ? copy.voice.browser(chosen.name) : copy.voice.browserAuto });
  }

  // The microphone.
  const live = chooseLiveEngine(settings);
  const micBase = { id: 'mic', label: copy.mic.label };
  if (live === 'text') {
    items.push({ ...micBase, state: 'info', text: browserSpeechSupported() || settings.speech.liveEngine === 'text' ? copy.mic.typing : copy.mic.unsupported });
  } else if (mic === 'granted') items.push({ ...micBase, state: 'ready', text: copy.mic.granted });
  else if (mic === 'denied') items.push({ ...micBase, state: 'problem', text: copy.mic.denied });
  else if (mic === 'requesting') items.push({ ...micBase, state: 'working', text: copy.mic.requesting });
  else items.push({ ...micBase, state: 'action', text: copy.mic.prompt, action: { label: copy.allowNow, onClick: requestMic } });

  // The AI.
  const aiBase = { id: 'ai', label: copy.ai.label };
  const provider = providerConfig(settings.provider, settings.custom);
  const providerName = aiCopy.providerName[settings.provider] ?? provider.label;
  const key = keys[settings.provider];
  if (endpoint) {
    const what = settings.provider === 'claude-code' ? copy.ai.bridge : copy.ai.endpoint;
    if (settings.provider === 'claude-code' && !key) items.push({ ...aiBase, state: 'problem', text: copy.ai.noKey, action: { label: copy.openSettings, href: '#/settings' } });
    else if (reach === 'ok') items.push({ ...aiBase, state: 'ready', text: copy.ai.reachable(what) });
    else if (reach === 'failed') items.push({ ...aiBase, state: 'problem', text: copy.ai.unreachable(what), action: { label: copy.checkAgain, onClick: recheck } });
    else items.push({ ...aiBase, state: 'working', text: copy.ai.checking(what) });
  } else if (!key) items.push({ ...aiBase, state: 'problem', text: copy.ai.noKey, action: { label: copy.openSettings, href: '#/settings' } });
  else if (key.status === 'error') items.push({ ...aiBase, state: 'problem', text: copy.ai.keyFailed(providerName), action: { label: copy.openSettings, href: '#/settings' } });
  else items.push({ ...aiBase, state: 'ready', text: key.status === 'ok' ? copy.ai.keyChecked(providerName) : copy.ai.keySaved(providerName) });

  // "Will ask" and "using the fast voice" don't hold anything up.
  const done = (i: Item) => i.state === 'ready' || i.state === 'info' || i.state === 'action';
  const doneCount = items.filter(done).length;
  // The bar follows what actually takes time (downloads, starting up),
  // so three instant checks can't make a half-done download look nearly finished.
  const timed = items.filter((i) => i.state === 'working' || i.id === 'runner' || (i.id === 'voice' && voiceSetting.startsWith(NATURAL_PREFIX)));
  const overall = timed.length ? timed.reduce((sum, i) => sum + (done(i) ? 1 : (i.progress ?? 0)), 0) / timed.length : 1;
  const allDone = doneCount === items.length;
  const loading = items.some((i) => i.state === 'working');

  return (
    <section aria-labelledby="ready-h" className="flex max-w-[640px] flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="ready-h" className="text-md font-semibold">
            {copy.heading}
          </h2>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {allDone ? copy.allReady : copy.progress(doneCount, items.length)}
          </p>
        </div>
        <ProgressBar value={allDone ? 1 : overall} label={copy.heading} />
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5 border-t border-smudge py-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex shrink-0 items-center gap-2 sm:w-48">
              <StateMark state={item.state} />
              <span className="text-sm font-semibold">{item.label}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className={`text-sm ${item.state === 'problem' ? 'text-red' : 'text-ink-soft'}`}>{item.text}</p>
              {item.state === 'working' && item.progress !== undefined && <ProgressBar value={item.progress} label={item.label} />}
              {item.action &&
                (item.action.href ? (
                  <div>
                    <ButtonLink variant="quiet" href={item.action.href}>
                      {item.action.label}
                    </ButtonLink>
                  </div>
                ) : (
                  <div>
                    <Button variant="quiet" onClick={item.action.onClick}>
                      {item.action.label}
                    </Button>
                  </div>
                ))}
            </div>
          </li>
        ))}
      </ul>
      {loading && <p className="text-sm text-ink-soft">{copy.startAnyway}</p>}
    </section>
  );
}

/** A small mark beside each item; the words say the same, so color is never the only signal. */
function StateMark({ state }: { state: ItemState }) {
  const common = 'h-3.5 w-3.5 shrink-0';
  if (state === 'ready')
    return (
      <svg aria-hidden="true" viewBox="0 0 14 14" className={`${common} text-green`}>
        <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'problem')
    return (
      <svg aria-hidden="true" viewBox="0 0 14 14" className={`${common} text-red`}>
        <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (state === 'working')
    return (
      <svg aria-hidden="true" viewBox="0 0 14 14" className={`${common} animate-spin text-blue motion-reduce:animate-none`}>
        <path d="M7 1.5a5.5 5.5 0 1 1-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14" className={`${common} text-smudge-mark`}>
      <circle cx="7" cy="7" r="2.5" fill="currentColor" />
    </svg>
  );
}
