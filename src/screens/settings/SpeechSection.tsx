import { useEffect, useMemo, useState } from 'react';
import { speech as copy } from '../../copy/strings';
import { SPEECH_ENGINES } from '../../config/speech';
import { updateSettings, useSettings, type PaidSpeechEngine, type Settings } from '../../state/settings';
import { browserSpeechSupported } from '../../lib/speech/browser';
import { fileTranscriber } from '../../lib/speech/files';
import { whisperCapable } from '../../lib/speech/whisper';
import { formatUsd } from '../../lib/cost/pricing';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';
import { KeyEditor } from './AiSection';
import { Select } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { listVoices, type VoiceOption } from '../../lib/voice/browser';
import { createVoice, naturalEngine, type NaturalStatus } from '../../lib/voice/natural';
import { NATURAL_DOWNLOAD_MB, NATURAL_PREFIX, NATURAL_VOICES } from '../../lib/voice/kokoro-config';
import type { Persona } from '../../lib/types';
import { speechKeyName } from '../../lib/speech/choose';

type Accurate = 'off' | 'paid' | 'device';

export function SpeechSection() {
  const settings = useSettings();
  const sp = settings.speech;
  const patch = (p: Partial<Settings['speech']>) => updateSettings({ speech: { ...sp, ...p } });
  const browserOk = browserSpeechSupported();
  const accurate: Accurate = sp.paidEngine ? 'paid' : sp.onDevice ? 'device' : 'off';
  const engine = sp.paidEngine;
  const cfg = engine ? SPEECH_ENGINES[engine] : null;
  const keyName = engine ? speechKeyName(engine, settings) : null;
  const perMinute = cfg ? (cfg.filePerMinute ?? 0) + (cfg.keywordHintsPerMinute ?? 0) : 0;

  return (
    <section aria-labelledby="speech-h" className="flex flex-col gap-6">
      <div>
        <h2 id="speech-h" className="text-md font-semibold">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{copy.intro}</p>
        <p className="mt-1 text-sm text-ink-soft">{copy.support}</p>
      </div>

      <Segmented<'browser' | 'text'>
        size="sm"
        label={copy.duringHeading}
        value={browserOk ? sp.liveEngine : 'text'}
        onChange={(liveEngine) => patch({ liveEngine })}
        options={[
          { value: 'browser', label: copy.browser, disabled: !browserOk },
          { value: 'text', label: copy.typing },
        ]}
        help={browserOk ? copy.browserNote : copy.unsupportedNote}
      />

      <VoicePicker voice={sp.voice} onChange={(voice) => patch({ voice })} persona={settings.persona} />

      <div className="flex flex-col gap-4">
        <Segmented<Accurate>
          size="sm"
          label={copy.accurateHeading}
          value={accurate}
          onChange={(v) =>
            patch({
              paidEngine: v === 'paid' ? (sp.paidEngine ?? 'deepgram') : null,
              onDevice: v === 'device',
              paidLive: v === 'paid' ? sp.paidLive : false,
            })
          }
          options={[
            { value: 'off', label: copy.accurateOff },
            { value: 'paid', label: copy.accuratePaid },
            { value: 'device', label: copy.accurateDevice },
          ]}
          help={copy.accurateIntro}
        />

        {accurate === 'device' && (
          <div className="border-l-[3px] border-smudge pl-4 text-sm">
            <p>{copy.deviceNote}</p>
            {!whisperCapable().ok && <p className="mt-1 text-red">{copy.deviceWeak}</p>}
          </div>
        )}

        {accurate === 'paid' && engine && cfg && (
          <div className="flex flex-col gap-4 border-l-[3px] border-smudge pl-4">
            <Segmented<PaidSpeechEngine>
              size="sm"
              label={copy.serviceLabel}
              value={engine}
              onChange={(paidEngine) => patch({ paidEngine, paidLive: paidEngine === 'deepgram' ? sp.paidLive : false })}
              options={(['deepgram', 'assemblyai', 'openai'] as PaidSpeechEngine[]).map((e) => ({ value: e, label: SPEECH_ENGINES[e].label }))}
              help={copy.price(formatUsd(perMinute), formatUsd(perMinute * 45))}
            />
            {engine === 'openai' && settings.provider === 'openai' && (
              <Toggle label={copy.reuseKey} checked={sp.reuseOpenAIKey} onChange={(reuseOpenAIKey) => patch({ reuseOpenAIKey })} />
            )}
            {keyName && keyName !== 'openai' && (
              <KeyEditor
                key={keyName}
                name={keyName}
                label={copy.keyLabel(cfg.label)}
                getKeyUrl={cfg.keyUrl}
                check={async (value) => {
                  await fileTranscriber(engine, value)!.checkKey();
                }}
              />
            )}
            <Toggle label={copy.accuratePass} help={copy.accuratePassHelp} checked={sp.accuratePass} onChange={(accuratePass) => patch({ accuratePass })} />
            {cfg.liveInBrowser ? (
              <Toggle label={copy.paidLive(cfg.label)} help={copy.paidLiveHelp} checked={sp.paidLive} onChange={(paidLive) => patch({ paidLive })} />
            ) : (
              <p className="text-sm text-ink-soft">{copy.liveUnavailable(cfg.label)}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Follows the natural voice's loading and speed check. */
function useNaturalStatus(): NaturalStatus {
  const [status, setStatus] = useState(naturalEngine.status);
  useEffect(() => naturalEngine.subscribe(setStatus), []);
  return status;
}

/**
 * The interviewer's voice: natural voices made on this device, or the
 * browser's own. Browsers load their voices asynchronously, so the list
 * fills in when ready.
 */
function VoicePicker({ voice, onChange, persona }: { voice: string; onChange: (uri: string) => void; persona: Persona }) {
  const [voices, setVoices] = useState<VoiceOption[]>(() => listVoices());
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined' || typeof speechSynthesis.addEventListener !== 'function') return;
    const update = () => setVoices(listVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  const status = useNaturalStatus();
  const natural = voice.startsWith(NATURAL_PREFIX);
  // Choosing a natural voice starts its download and speed check right away.
  useEffect(() => {
    if (natural) void naturalEngine.load(voice.slice(NATURAL_PREFIX.length));
  }, [natural, voice]);
  const sample = useMemo(() => createVoice(() => voice), [voice]);
  const naturalSupported = typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined';
  if (!voices.length && !naturalSupported) return null;
  const times = status.state === 'ready' ? status.realTime.toFixed(1) : '';
  const options = [
    { value: '', label: copy.voiceAuto },
    ...(naturalSupported ? NATURAL_VOICES.map((v) => ({ value: NATURAL_PREFIX + v.id, label: copy.voiceNatural(v.name, v.gender) })) : []),
    ...voices.map((v) => ({ value: v.uri, label: v.local ? copy.voiceLocal(v.name) : copy.voiceOnline(v.name) })),
  ];
  return (
    <div className="flex max-w-[560px] flex-col gap-3">
      <Select
        label={copy.voiceLabel}
        help={copy.voiceHelp}
        value={options.some((o) => o.value === voice) ? voice : ''}
        onChange={(e) => onChange(e.target.value)}
        options={options}
      />
      {natural && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink-soft">{copy.naturalAbout(NATURAL_DOWNLOAD_MB.wasm, NATURAL_DOWNLOAD_MB.webgpu)}</p>
          <p role="status" className={status.state === 'ready' && status.fastEnough ? 'text-green' : status.state === 'ready' || status.state === 'failed' ? 'text-red' : ''}>
            {status.state === 'loading' || status.state === 'idle'
              ? copy.naturalLoading(Math.round(status.state === 'loading' ? status.progress : 0))
              : status.state === 'failed'
                ? copy.naturalFailed
                : status.fastEnough
                  ? copy.naturalReady(times)
                  : copy.naturalSlow(times)}
          </p>
          {status.state === 'ready' && status.fastEnough && <p className="text-ink-soft">{copy.naturalLateNote}</p>}
          {status.state === 'ready' && !status.fastEnough && (
            <div>
              <Button variant="quiet" onClick={() => void naturalEngine.load(voice.slice(NATURAL_PREFIX.length), { recheck: true })}>
                {copy.naturalRecheck}
              </Button>
            </div>
          )}
        </div>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            sample.cancel();
            sample.speak(copy.voiceSampleText, { persona });
          }}
        >
          {copy.voiceSample}
        </Button>
      </div>
    </div>
  );
}
