import { useEffect, useMemo, useState } from 'react';
import { setup as copy, quality as qualityCopy, presetName, difficultyName, topicName, personaName, personaHelp, feedbackModeName, feedbackModeHelp, languageName } from '../copy/strings';
import { BANK, filterBank, loadBankProblem, pickRandom, type BankEntry } from '../lib/problems/bank';
import { draftFromPaste } from '../lib/problems/paste';
import { newId } from '../lib/id';
import { TOPICS, PERSONAS, FEEDBACK_MODES, LANGUAGES, MODEL_ROLES, type Difficulty, type Topic, type Problem, type PresetId, type Session } from '../lib/types';
import { providerConfig, modelsFor, strongestModel } from '../config/providers';
import { createProvider } from '../lib/ai/factory';
import { ProviderError } from '../lib/ai/errors';
import { ai as aiCopy } from '../copy/strings';
import { usageRecord } from '../lib/ai/usage';
import { preparePasted, type PrepareStage } from '../lib/problems/prepare';
import { CodeRunner } from '../lib/runner/runner';
import type { UsageRecord } from '../lib/types';
import { estimateSession } from '../lib/cost/estimate';
import { listSessions } from '../lib/storage/db';
import { useKeys } from '../state/keys';
import { CostEstimate } from '../ui/CostEstimate';
import { Onboarding } from '../ui/Onboarding';
import { updateSettings, useSettings } from '../state/settings';
import { draftStore } from '../state/draft';
import { navigate } from '../state/router';
import { Segmented } from '../ui/Segmented';
import { Select, TextArea, TextField } from '../ui/Field';
import { Button, ButtonLink } from '../ui/Button';
import { Rule } from '../ui/Rule';

type Source = 'random' | 'paste';

export function SetupScreen() {
  const settings = useSettings();
  const [source, setSource] = useState<Source>('random');
  const [difficulty, setDifficulty] = useState<Difficulty | 'any'>('any');
  const [topic, setTopic] = useState<Topic | 'any'>('any');
  const [pasted, setPasted] = useState('');
  const matches = useMemo(() => filterBank(difficulty, topic), [difficulty, topic]);
  const [picked, setPicked] = useState<BankEntry | undefined>(() => pickRandom(BANK));
  const current = picked && matches.includes(picked) ? picked : matches[0];

  const keys = useKeys();
  const hasKey = !!keys[settings.provider]?.value || settings.provider === 'custom';
  const provider = providerConfig(settings.provider, settings.custom);
  const models = modelsFor(provider, settings.preset, settings.advancedModels);
  const [history, setHistory] = useState<Session[]>([]);
  useEffect(() => {
    listSessions().then(setHistory).catch(() => setHistory([]));
  }, []);
  const estimate = useMemo(
    () =>
      estimateSession({
        provider,
        models,
        feedbackMode: settings.feedbackMode,
        minutes: settings.sessionMinutes,
        needsAnalysis: source === 'paste',
        speech: { liveEngine: 'browser' },
        history,
      }),
    [provider, models, settings.feedbackMode, settings.sessionMinutes, source, history],
  );

  const canStart = hasKey && (source === 'random' ? !!current : pasted.trim().length > 20);

  const [prep, setPrep] = useState<{ stage: PrepareStage; abort: AbortController } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function begin(problem: Problem, prepUsage: UsageRecord[] = []) {
    draftStore.set({
      problem,
      language: settings.language,
      persona: settings.persona,
      feedbackMode: settings.feedbackMode,
      minutes: settings.sessionMinutes,
      prepUsage,
    });
    navigate('/interview');
  }

  async function start() {
    setError(null);
    if (source === 'random') {
      const problem = await loadBankProblem(current!.id);
      if (problem) begin(problem);
      return;
    }
    const ai = createProvider(settings.provider, settings);
    if (!ai) return begin(draftFromPaste(pasted, newId('paste-')));
    const abort = new AbortController();
    setPrep({ stage: 'reading', abort });
    const runner = new CodeRunner();
    const usage: UsageRecord[] = [];
    try {
      const { problem } = await preparePasted(pasted, {
        provider: ai,
        model: strongestModel(models),
        run: (lang, code, p, tests) => runner.runTests(lang, code, p.signature, tests, 0),
        record: (role, model, u) => usage.push(usageRecord(provider, role, model, u, 0)),
        onStage: (stage) => setPrep({ stage, abort }),
        signal: abort.signal,
      });
      begin(problem, usage);
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'unknown';
      if (kind !== 'aborted') setError(kind === 'bad-output' ? copy.prepFailed : (aiCopy.errors[kind] ?? copy.prepFailed));
    } finally {
      runner.dispose();
      setPrep(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-12 pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex max-w-[680px] flex-col gap-10">
        <div>
          <h1 className="text-xl font-bold">{copy.title}</h1>
          <p className="mt-3 text-md text-ink-soft">{copy.intro}</p>
        </div>
        {!settings.onboarded && !hasKey && <Onboarding />}

        <section aria-labelledby="problem-heading" className="flex flex-col gap-4">
          <h2 id="problem-heading" className="text-md font-semibold">
            {copy.problemHeading}
          </h2>
          <Segmented<Source>
            label={copy.problemHeading}
            hideLabel
            value={source}
            onChange={setSource}
            options={[
              { value: 'random', label: copy.sourceRandom },
              { value: 'paste', label: copy.sourcePaste },
            ]}
          />
          {source === 'random' ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label={copy.difficulty}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'any')}
                  options={[
                    { value: 'any', label: copy.anyDifficulty },
                    ...(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => ({ value: d, label: difficultyName[d] })),
                  ]}
                />
                <Select
                  label={copy.topic}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as Topic | 'any')}
                  options={[{ value: 'any', label: copy.anyTopic }, ...TOPICS.map((t) => ({ value: t, label: topicName[t] }))]}
                />
              </div>
              {current ? (
                <div className="flex flex-wrap items-baseline justify-between gap-4 border-l-[3px] border-smudge py-1 pl-4">
                  <div>
                    <p className="text-md font-semibold">{current.title}</p>
                    <p className="text-sm text-ink-soft">
                      {difficultyName[current.difficulty]}, {current.topics.map((t) => topicName[t].toLowerCase()).join(', ')}
                    </p>
                  </div>
                  <Button variant="quiet" onClick={() => setPicked(pickRandom(matches, (p) => p.id === current.id))}>
                    {copy.pickAnother}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-ink-soft">{copy.noMatch}</p>
              )}
            </div>
          ) : (
            <TextArea
              label={copy.pasteLabel}
              help={copy.pasteHelp}
              placeholder={copy.pastePlaceholder}
              rows={10}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          )}
        </section>

        <Rule />

        <Segmented
          label={copy.interviewerHeading}
          value={settings.persona}
          onChange={(persona) => updateSettings({ persona })}
          options={PERSONAS.map((p) => ({ value: p, label: personaName[p] }))}
          help={personaHelp[settings.persona]}
        />
        <Segmented
          label={copy.feedbackHeading}
          value={settings.feedbackMode}
          onChange={(feedbackMode) => updateSettings({ feedbackMode })}
          options={FEEDBACK_MODES.map((m) => ({ value: m, label: feedbackModeName[m] }))}
          help={feedbackModeHelp[settings.feedbackMode]}
        />
        <Segmented
          label={copy.languageHeading}
          value={settings.language}
          onChange={(language) => updateSettings({ language })}
          options={LANGUAGES.map((l) => ({ value: l, label: languageName[l] }))}
        />
        <QualityPicker />
        <div className="max-w-[200px]">
          <TextField
            label={copy.lengthLabel}
            type="number"
            min={10}
            max={90}
            step={5}
            value={settings.sessionMinutes}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) updateSettings({ sessionMinutes: Math.min(90, Math.max(10, Math.round(n))) });
            }}
          />
        </div>

        {!hasKey && (
          <p className="text-sm">
            {copy.needKey}{' '}
            <a href="#/settings" className="text-blue underline underline-offset-4">
              {copy.addKey}
            </a>
          </p>
        )}
        {prep && (
          <div role="status" className="border-l-[3px] border-blue py-1 pl-4">
            <p className="text-sm font-semibold">{copy.preparing}</p>
            <p className="text-sm">{copy.prepStage[prep.stage]}</p>
            <p className="text-sm text-ink-soft">{copy.prepTime}</p>
            <Button variant="quiet" className="mt-1" onClick={() => prep.abort.abort()}>
              {copy.cancelPrep}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-6">
          <Button variant="primary" onClick={start} disabled={!canStart || !!prep}>
            {copy.start}
          </Button>
          <ButtonLink variant="quiet" href="#/replay/demo">
            {copy.tryDemo}
          </ButtonLink>
        </div>
      </div>

      <aside aria-label={copy.costHeading} className="flex flex-col gap-10 lg:border-l lg:border-smudge lg:pl-8">
        <div className="lg:sticky lg:top-8">
          <CostEstimate estimate={estimate} />
        </div>
      </aside>
    </div>
  );
}

function QualityPicker() {
  const settings = useSettings();
  const provider = providerConfig(settings.provider, settings.custom);
  const models = modelsFor(provider, settings.preset, settings.advancedModels);
  const label = (id: string) => provider.models.find((m) => m.id === id)?.label ?? id;
  return (
    <div className="flex flex-col gap-4">
      <Segmented<PresetId>
        label={qualityCopy.heading}
        value={settings.preset}
        onChange={(preset) => updateSettings({ preset })}
        options={(['economy', 'balanced', 'best', 'advanced'] as PresetId[]).map((p) => ({ value: p, label: presetName[p] }))}
        help={`${qualityCopy.presetHelp[settings.preset]} ${MODEL_ROLES.map((r) => `${qualityCopy.roleName[r]}: ${label(models[r])}.`).join(' ')}`}
      />
      {settings.preset === 'advanced' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MODEL_ROLES.map((role) => (
            <Select
              key={role}
              label={qualityCopy.roleName[role]}
              value={models[role]}
              onChange={(e) =>
                updateSettings({
                  advancedModels: { ...settings.advancedModels, [provider.id]: { ...models, [role]: e.target.value } },
                })
              }
              options={provider.models.map((m) => ({ value: m.id, label: m.label }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
