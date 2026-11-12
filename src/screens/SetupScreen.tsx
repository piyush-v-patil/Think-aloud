import { useEffect, useMemo, useState } from 'react';
import { variation as varCopy, list as listCopy, setup as copy, quality as qualityCopy, presetName, difficultyName, topicName, personaName, feedbackModeName, feedbackModeHelp, languageName } from '../copy/strings';
import { BANK, filterBank, loadBankProblem, pickRandom, type BankEntry } from '../lib/problems/bank';
import { draftFromPaste } from '../lib/problems/paste';
import { newId } from '../lib/id';
import { TOPICS, PERSONAS, FEEDBACK_MODES, LANGUAGES, MODEL_ROLES, type Difficulty, type Topic, type Problem, type PresetId, type Session } from '../lib/types';
import { providerConfig, modelsFor, strongestModel } from '../config/providers';
import { createProvider, providerReady } from '../lib/ai/factory';
import { ProviderError } from '../lib/ai/errors';
import { ai as aiCopy, cost as costCopy } from '../copy/strings';
import { usageRecord } from '../lib/ai/usage';
import { preparePasted, prepareVariation, type PrepareStage } from '../lib/problems/prepare';
import { CodeRunner } from '../lib/runner/runner';
import type { Language, UsageRecord } from '../lib/types';
import { estimateSession, type Estimate } from '../lib/cost/estimate';
import { listEntries, listSessions, saveProblem, type ListEntry } from '../lib/storage/db';
import { sortForPractice, isWeak } from './ListScreen';
import { limitState, spend } from '../lib/history/stats';
import { formatUsd } from '../lib/cost/pricing';
import { useKeys } from '../state/keys';
import { CostEstimate } from '../ui/CostEstimate';
import { chooseAccurateEngine, chooseLiveEngine } from '../lib/speech/choose';
import { Onboarding } from '../ui/Onboarding';
import { ReadinessPanel } from '../ui/ReadinessPanel';
import { naturalEngine } from '../lib/voice/natural';
import { NATURAL_PREFIX } from '../lib/voice/kokoro-config';
import { updateSettings, useSettings } from '../state/settings';
import { draftStore } from '../state/draft';
import { navigate } from '../state/router';
import { Segmented } from '../ui/Segmented';
import { Select, TextArea } from '../ui/Field';
import { Button, ButtonLink } from '../ui/Button';
import { Rule } from '../ui/Rule';

type Source = 'random' | 'paste' | 'list' | 'variation';

function listFromHash(): string | null {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('list') : null;
}

export function SetupScreen() {
  const settings = useSettings();
  // Load the natural voice (from the browser's cache after the first time)
  // while the candidate picks a problem, so it's ready for the first reply.
  const chosenVoice = settings.speech.voice;
  useEffect(() => {
    if (chosenVoice.startsWith(NATURAL_PREFIX)) void naturalEngine.load(chosenVoice.slice(NATURAL_PREFIX.length));
  }, [chosenVoice]);
  const [listId, setListId] = useState<string | null>(() => listFromHash());
  const [source, setSource] = useState<Source>(() => (listFromHash() ? 'list' : 'random'));
  const [entries, setEntries] = useState<ListEntry[]>([]);
  useEffect(() => {
    listEntries().then((e) => setEntries(sortForPractice(e)));
  }, []);
  const entry = entries.find((e) => e.id === listId) ?? entries[0];
  const [baseId, setBaseId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | 'any'>('any');
  const [topic, setTopic] = useState<Topic | 'any'>('any');
  const [pasted, setPasted] = useState('');
  const matches = useMemo(() => filterBank(difficulty, topic), [difficulty, topic]);
  const [picked, setPicked] = useState<BankEntry | undefined>(() => pickRandom(BANK));
  const current = picked && matches.includes(picked) ? picked : matches[0];

  const keys = useKeys();
  void keys;
  const hasKey = providerReady(settings);
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
        needsAnalysis: source !== 'random',
        speech: { liveEngine: chooseLiveEngine(settings), accurateEngine: chooseAccurateEngine(settings), keywordHints: true },
        history,
      }),
    [provider, models, settings, source, history],
  );

  const pastProblems = useMemo(() => {
    const seen = new Map<string, Problem>();
    for (const sess of history) if (!sess.demo && sess.problem.analysis && !seen.has(sess.problem.id)) seen.set(sess.problem.id, sess.problem);
    return [...seen.values()];
  }, [history]);
  const base = pastProblems.find((p) => p.id === baseId) ?? pastProblems[0];
  const money = spend(history);
  const limit = limitState(money.monthUsd, settings.monthlyLimitUsd);

  const canStart =
    hasKey &&
    (source === 'random'
      ? !!current
      : source === 'paste'
        ? pasted.trim().length > 20
        : source === 'list'
          ? !!entry?.text
          : !!base);

  const [prep, setPrep] = useState<{ stage: PrepareStage; abort: AbortController } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function begin(problem: Problem, prepUsage: UsageRecord[] = [], listEntryId?: string) {
    draftStore.set({
      listEntryId,
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
    const text = source === 'list' ? (entry?.text ?? '') : pasted;
    const ai = createProvider(settings.provider, settings);
    if (!ai) return begin(draftFromPaste(text, newId('paste-')));
    const abort = new AbortController();
    setPrep({ stage: 'reading', abort });
    const runner = new CodeRunner();
    const usage: UsageRecord[] = [];
    try {
      const opts = {
        provider: ai,
        model: strongestModel(models),
        run: (lang: Language, code: string, p: Problem, tests: Problem['tests']) =>
          runner.runTests(lang, code, p.signature, tests, 0),
        record: (role: UsageRecord['role'], model: string, u: Parameters<typeof usageRecord>[3]) => usage.push(usageRecord(provider, role, model, u, 0)),
        onStage: (stage: PrepareStage) => setPrep({ stage, abort }),
        signal: abort.signal,
      };
      if (source === 'variation') {
        const problem = await prepareVariation(base!, opts);
        await saveProblem(problem);
        begin(problem, usage);
      } else {
        const { problem } = await preparePasted(text, opts);
        begin(problem, usage, source === 'list' ? entry?.id : undefined);
      }
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'unknown';
      if (kind !== 'aborted') setError(kind === 'bad-output' ? copy.prepFailed : (aiCopy.errors[kind] ?? copy.prepFailed));
    } finally {
      runner.dispose();
      setPrep(null);
    }
  }

  return (
    <div className="pt-6">
      <div className="flex max-w-[760px] flex-col gap-7">
        <div>
          <h1 className="text-lg font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{copy.intro}</p>
        </div>
        {!settings.onboarded && !hasKey && <Onboarding />}

        <section aria-labelledby="problem-heading" className="flex flex-col gap-3">
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
              { value: 'list', label: copy.sourceList },
              { value: 'variation', label: copy.sourceVariation },
            ]}
          />
          {source === 'list' && (
            <div className="flex flex-col gap-2">
              {entries.length ? (
                <>
                  <Select
                    label={copy.listPick}
                    value={entry?.id ?? ''}
                    onChange={(e) => setListId(e.target.value)}
                    options={entries.map((e) => ({ value: e.id, label: isWeak(e) ? `${e.title} (${listCopy.weak.toLowerCase()})` : e.title }))}
                  />
                  {entry && !entry.text && <p className="text-sm text-red">{copy.listNeedsText}</p>}
                </>
              ) : (
                <p className="text-sm text-ink-soft">{copy.listEmpty}</p>
              )}
              <a href="#/list" className="text-sm text-blue underline underline-offset-4">
                {listCopy.manage}
              </a>
            </div>
          )}
          {source === 'variation' &&
            (pastProblems.length ? (
              <Select
                label={varCopy.pick}
                help={varCopy.help}
                value={base?.id ?? ''}
                onChange={(e) => setBaseId(e.target.value)}
                options={pastProblems.map((p) => ({ value: p.id, label: p.title }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">{varCopy.none}</p>
            ))}
          {source === 'list' || source === 'variation' ? null : source === 'random' ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 sm:max-w-[460px]">
                <Select
                  label={copy.difficulty}
                  hideLabel
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'any')}
                  options={[
                    { value: 'any', label: copy.anyDifficulty },
                    ...(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => ({ value: d, label: difficultyName[d] })),
                  ]}
                />
                <Select
                  label={copy.topic}
                  hideLabel
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as Topic | 'any')}
                  options={[{ value: 'any', label: copy.anyTopic }, ...TOPICS.map((t) => ({ value: t, label: topicName[t] }))]}
                />
              </div>
              {current ? (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-[3px] border-smudge py-0.5 pl-4">
                  <p className="text-sm">
                    <span className="font-semibold">{current.title}</span>
                    <span className="text-ink-soft">
                      {' '}
                      · {difficultyName[current.difficulty]}, {current.topics.map((t) => topicName[t].toLowerCase()).join(', ')}
                    </span>
                  </p>
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
              rows={6}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          )}
        </section>

        <section aria-labelledby="options-heading" className="flex flex-col">
          <h2 id="options-heading" className="mb-1 text-md font-semibold">
            {copy.optionsHeading}
          </h2>
          <Segmented
            inline
            label={copy.interviewerHeading}
            value={settings.persona}
            onChange={(persona) => updateSettings({ persona })}
            options={PERSONAS.map((p) => ({ value: p, label: personaName[p] }))}
          />
          <Segmented
            inline
            label={copy.feedbackHeading}
            value={settings.feedbackMode}
            onChange={(feedbackMode) => updateSettings({ feedbackMode })}
            options={FEEDBACK_MODES.map((m) => ({ value: m, label: feedbackModeName[m] }))}
          />
          <p className="pb-1 text-sm text-ink-soft sm:ml-[7.75rem]">{feedbackModeHelp[settings.feedbackMode]}</p>
          <Segmented
            inline
            label={copy.languageHeading}
            value={settings.language}
            onChange={(language) => updateSettings({ language })}
            options={LANGUAGES.map((l) => ({ value: l, label: languageName[l] }))}
          />
          {settings.language === 'java' && <p className="pb-1 text-sm text-ink-soft sm:ml-[7.75rem]">{copy.javaHelp}</p>}
          <QualityPicker />
          <div className="flex items-center gap-3">
            <label htmlFor="session-minutes" className="w-24 shrink-0 text-sm font-semibold sm:w-28">
              {copy.lengthShort}
            </label>
            <input
              id="session-minutes"
              type="number"
              min={10}
              max={90}
              step={5}
              value={settings.sessionMinutes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) updateSettings({ sessionMinutes: Math.min(90, Math.max(10, Math.round(n))) });
              }}
              className="min-h-11 w-20 rounded-control border border-ink-soft bg-paper px-3 text-sm"
            />
            <span className="text-sm text-ink-soft">{copy.minutes}</span>
          </div>
        </section>

        <Rule />
        <ReadinessPanel />
        {(limit === 'near' || limit === 'over') && (
          <p role="status" className={`text-sm ${limit === 'over' ? 'text-red' : ''}`}>
            {(limit === 'over' ? copy.monthlyLimitReached : copy.monthlyLimitWarning)(formatUsd(money.monthUsd), formatUsd(settings.monthlyLimitUsd!))}
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Button variant="primary" onClick={start} disabled={!canStart || !!prep}>
            {copy.start}
          </Button>
          <CostSummary estimate={estimate} subscription={settings.provider === 'claude-code'} />
          <ButtonLink variant="quiet" href="#/replay/demo" className="sm:ml-auto">
            {copy.tryDemo}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** The cost in one line, with the breakdown a click away. */
function CostSummary({ estimate, subscription }: { estimate: Estimate; subscription: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        {estimate.totalUsd !== null ? (
          <span>
            <span className="font-semibold">{costCopy.about(formatUsd(estimate.totalUsd))}</span>
            <span className="text-ink-soft">, {costCopy.estimate}</span>
          </span>
        ) : (
          <span className="text-ink-soft">{subscription ? costCopy.onPlan : costCopy.unpriced}</span>
        )}
        <Button variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? copy.hideCostDetails : copy.costDetails}
        </Button>
      </p>
      {open && (
        <div className="mt-2 w-full max-w-[360px]">
          <CostEstimate estimate={estimate} unpricedNote={subscription ? costCopy.subscription : undefined} />
        </div>
      )}
    </div>
  );
}

function QualityPicker() {
  const settings = useSettings();
  const provider = providerConfig(settings.provider, settings.custom);
  const models = modelsFor(provider, settings.preset, settings.advancedModels);
  const label = (id: string) => provider.models.find((m) => m.id === id)?.label ?? id;
  return (
    <div className="flex flex-col">
      <Segmented<PresetId>
        inline
        label={qualityCopy.heading}
        value={settings.preset}
        onChange={(preset) => updateSettings({ preset })}
        options={(['economy', 'balanced', 'best', 'advanced'] as PresetId[]).map((p) => ({ value: p, label: presetName[p] }))}
      />
      {settings.preset === 'advanced' ? (
        <div className="mb-2 grid grid-cols-1 gap-3 sm:ml-[7.75rem] sm:grid-cols-3">
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
      ) : (
        <p className="pb-1 text-sm text-ink-soft sm:ml-[7.75rem]">{MODEL_ROLES.map((r) => `${qualityCopy.roleName[r]}: ${label(models[r])}`).join(' · ')}</p>
      )}
    </div>
  );
}
