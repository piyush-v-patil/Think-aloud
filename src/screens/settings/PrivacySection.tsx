import { privacy as copy } from '../../copy/strings';
import { providerConfig } from '../../config/providers';
import { SPEECH_ENGINES } from '../../config/speech';
import { useSettings } from '../../state/settings';
import { useKeys } from '../../state/keys';
import { chooseAccurateEngine, chooseLiveEngine } from '../../lib/speech/choose';
import { listVoices } from '../../lib/voice/browser';
import { NATURAL_PREFIX } from '../../lib/voice/kokoro-config';

/**
 * The privacy statement, built from the current settings so it always says
 * exactly what leaves the device right now. The README carries the same
 * statement in general form.
 */
export function PrivacySection() {
  const settings = useSettings();
  useKeys();
  const provider = providerConfig(settings.provider, settings.custom);
  const providerName = settings.provider === 'custom' ? settings.custom.baseUrl || provider.label : provider.label;
  const live = chooseLiveEngine(settings);
  const accurate = chooseAccurateEngine(settings);
  const liveLine = live === 'browser' ? copy.audioBrowser(copy.browserVendor) : live === 'text' ? copy.audioText : copy.audioPaid(SPEECH_ENGINES[live].audioGoesTo);
  return (
    <section aria-labelledby="privacy-h" className="flex flex-col gap-3">
      <h2 id="privacy-h" className="text-md font-semibold">
        {copy.heading}
      </h2>
      <p className="text-sm">{copy.intro}</p>
      <h3 className="text-sm font-semibold">{copy.leavesHeading}</h3>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>{settings.provider === 'claude-code' ? copy.aiClaudeCode : copy.ai(providerName)}</li>
        <li>{liveLine}</li>
        {accurate && accurate !== 'whisper-local' && <li>{copy.accurate(SPEECH_ENGINES[accurate].audioGoesTo)}</li>}
        {accurate === 'whisper-local' && <li>{copy.onDevice}</li>}
        {settings.speech.voice.startsWith(NATURAL_PREFIX) && <li>{copy.voiceNatural}</li>}
        {listVoices().some((v) => v.uri === settings.speech.voice && !v.local) && <li>{copy.voiceOnline}</li>}
      </ul>
      <p className="text-sm text-ink-soft">{copy.stays}</p>
    </section>
  );
}
