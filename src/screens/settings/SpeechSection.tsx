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
