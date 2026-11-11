import { useState, type ReactNode } from 'react';
import { ai as copy } from '../../copy/strings';
import { providerConfig, BUILT_IN_PROVIDERS } from '../../config/providers';
import { updateSettings, useSettings } from '../../state/settings';
import { clearKey, maskKey, setKey, setKeyStatus, setRemember, useKeys, type KeyName } from '../../state/keys';
import { createProvider } from '../../lib/ai/factory';
import { ProviderError } from '../../lib/ai/errors';
import type { ProviderId } from '../../lib/types';
import { Segmented } from '../../ui/Segmented';
import { TextField } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { ExternalLink } from '../../ui/ExternalLink';
import { CompatibleProvider } from '../../lib/ai/compatible';
import { claudeCode } from '../../config/providers/claudeCode';

/** Providers whose adapters are built. The rest appear as they are added. */
export const AVAILABLE_PROVIDERS: ProviderId[] = ['anthropic', 'claude-code', 'openai', 'gemini', 'custom'];

export function AiSection() {
  const settings = useSettings();
  const provider = providerConfig(settings.provider, settings.custom);
  return (
    <section aria-labelledby="ai-h" className="flex flex-col gap-6">
      <div>
        <h2 id="ai-h" className="text-md font-semibold">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{copy.intro}</p>
      </div>
      <Segmented<ProviderId>
        size="sm"
        label={copy.provider}
        value={settings.provider}
        onChange={(p) => updateSettings({ provider: p, preset: settings.preset })}
        options={BUILT_IN_PROVIDERS.map((p) => ({ value: p, label: copy.providerName[p], disabled: !AVAILABLE_PROVIDERS.includes(p) }))}
      />
      {settings.provider === 'custom' ? (
        <CustomEndpoint />
      ) : settings.provider === 'claude-code' ? (
        <ClaudeCodeBridge />
      ) : (
        <KeyEditor name={settings.provider} label={copy.keyLabel(provider.label)} getKeyUrl={provider.keyUrl} checkModel={provider.keyCheckModel} />
      )}
      {settings.provider === 'gemini' && <p className="text-sm text-ink-soft">{copy.geminiFreeTier}</p>}
    </section>
  );
}

/** Key entry with storage choice, a real check call, and a clear button. Used for AI and speech keys. */
export function KeyEditor({
  name,
  label,
  getKeyUrl,
  checkModel,
  check,
  help,
  checkNote = copy.checkCost,
  describeError,
}: {
  name: KeyName;
  label: string;
  getKeyUrl?: string;
  checkModel?: string;
  /** Custom check for non-AI keys (speech engines). */
  check?: (key: string) => Promise<void>;
  /** Replaces the default help under the field. */
  help?: ReactNode;
  checkNote?: string;
  /** A more specific message for a failed check; return undefined for the default. */
  describeError?: (err: unknown) => string | undefined;
}) {
  const settings = useSettings();
  const keys = useKeys();
  const entry = keys[name];
  const [draft, setDraft] = useState('');
  const [remember, setRememberDraft] = useState(entry?.remember ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function saveAndCheck() {
    const value = draft.trim() || entry?.value;
    if (!value) return;
    setBusy(true);
    setMessage(null);
    setKey(name, value, remember);
    try {
      if (check) await check(value);
      else {
        const p = createProvider(name as ProviderId, settings, value);
        await p?.checkKey(checkModel!);
      }
      setKeyStatus(name, 'ok');
      setDraft('');
      setMessage({ text: copy.keySaved, error: false });
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'unknown';
      // A rejected key is useless; don't keep it. Other failures (no credit,
      // rate limit, network) mean the key itself may be fine.
      if (kind === 'invalid-key') clearKey(name);
      else setKeyStatus(name, 'error');
      setMessage({ text: describeError?.(err) ?? copy.errors[kind] ?? copy.errors.unknown, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <TextField
        label={label}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder={entry ? maskKey(entry.value) : ''}
        onChange={(e) => setDraft(e.target.value)}
        help={
          help ?? (
            <>
              {copy.keyHelp}{' '}
              {getKeyUrl && <ExternalLink href={getKeyUrl}>{copy.getKey}</ExternalLink>}
            </>
          )
        }
      />
      <Segmented<'device' | 'session'>
        size="sm"
        label={copy.storageLabel}
        value={remember ? 'device' : 'session'}
        onChange={(v) => {
          setRememberDraft(v === 'device');
          if (entry) setRemember(name, v === 'device');
        }}
        options={[
          { value: 'device', label: copy.rememberDevice },
          { value: 'session', label: copy.sessionOnly },
        ]}
        help={remember ? copy.storageHelpDevice : copy.storageHelpSession}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={saveAndCheck} disabled={busy || (!draft.trim() && !entry)}>
          {busy ? copy.checking : copy.saveAndCheck}
        </Button>
        {entry && (
          <Button
            variant="danger"
            onClick={() => {
              clearKey(name);
              setDraft('');
              setMessage({ text: copy.keyCleared, error: false });
            }}
          >
            {copy.clearKey}
          </Button>
        )}
      </div>
      <div className="text-sm text-ink-soft">
        <p>{entry ? copy.keyStored(maskKey(entry.value)) : copy.noKey}</p>
        <p>{checkNote}</p>
      </div>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-red' : 'text-green'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function CustomEndpoint() {
  const settings = useSettings();
  const c = settings.custom;
  const set = (patch: Partial<typeof c>) => updateSettings({ custom: { ...c, ...patch } });
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <p className="text-sm text-ink-soft">{copy.customIntro}</p>
      <TextField label={copy.baseUrl} help={copy.baseUrlHelp} value={c.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField label={copy.modelSmall} value={c.models.small} onChange={(e) => set({ models: { ...c.models, small: e.target.value.trim() } })} />
        <TextField label={copy.modelMid} value={c.models.mid} onChange={(e) => set({ models: { ...c.models, mid: e.target.value.trim() } })} />
        <TextField label={copy.modelTop} value={c.models.top} onChange={(e) => set({ models: { ...c.models, top: e.target.value.trim() } })} />
      </div>
      <p className="text-sm text-ink-soft">{copy.modelsHelp}</p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-semibold">{copy.pricesHeading}</legend>
        <p className="text-sm text-ink-soft">{copy.pricesHelp}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={copy.priceInput}
            type="number"
            min={0}
            step="0.01"
            value={c.prices?.input ?? ''}
            onChange={(e) => {
              const input = num(e.target.value);
              set({ prices: input === undefined ? undefined : { input, output: c.prices?.output ?? input } });
            }}
          />
          <TextField
            label={copy.priceOutput}
            type="number"
            min={0}
            step="0.01"
            value={c.prices?.output ?? ''}
            disabled={!c.prices}
            onChange={(e) => {
              const output = num(e.target.value);
              if (c.prices && output !== undefined) set({ prices: { ...c.prices, output } });
            }}
          />
        </div>
      </fieldset>
      <KeyEditor
        name="custom"
        label={copy.customKey}
        check={async (value) => {
          await new CompatibleProvider(c.baseUrl, value).checkKey();
        }}
      />
    </div>
  );
}

/** Claude Code on this computer, through the local bridge (scripts/claude-bridge.mjs). */
function ClaudeCodeBridge() {
  const settings = useSettings();
  const c = copy.claudeCode;
  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <p className="text-sm text-ink-soft">{c.intro}</p>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{c.stepsHeading}</h3>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li>
            {c.steps[0]} <ExternalLink href={claudeCode.keyUrl}>{c.install}</ExternalLink>
          </li>
          <li>
            {c.steps[1]}
            <pre className="mt-1 mb-0 w-fit rounded-[3px] bg-paper px-2 py-1 font-mono text-xs">{c.command}</pre>
          </li>
          <li>{c.steps[2]}</li>
        </ol>
      </div>
      <TextField label={c.url} help={c.urlHelp} value={settings.claudeCodeUrl} onChange={(e) => updateSettings({ claudeCodeUrl: e.target.value.trim() })} />
      <KeyEditor
        name="claude-code"
        label={c.token}
        help={c.tokenHelp}
        checkNote={c.checkCost}
        check={async (value) => {
          const p = new CompatibleProvider(settings.claudeCodeUrl, value, undefined, 'claude-code');
          await p.checkKey();
          await p.chat({ model: claudeCode.keyCheckModel, system: [{ text: 'Reply with the single word OK.' }], turns: [{ role: 'user', text: 'OK?' }], maxTokens: 8, effort: 'low' });
        }}
        describeError={(err) => {
          if (!(err instanceof ProviderError)) return undefined;
          if (err.kind === 'network') return c.notRunning;
          // The bridge writes its own plain-English errors; they never contain the token.
          const m = /"message":"([^"]+)"/.exec(err.message);
          return m ? m[1] : undefined;
        }}
      />
      <p className="text-sm text-ink-soft">{c.slower}</p>
    </div>
  );
}
