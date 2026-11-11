import { useMemo, useState } from 'react';
import { setup as copy, difficultyName, topicName, personaName, personaHelp, feedbackModeName, feedbackModeHelp, languageName } from '../copy/strings';
import { BANK, filterBank, pickRandom } from '../lib/problems/bank';
import { draftFromPaste } from '../lib/problems/paste';
import { newId } from '../lib/id';
import { TOPICS, PERSONAS, FEEDBACK_MODES, LANGUAGES, type Difficulty, type Topic, type Problem } from '../lib/types';
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
  const [picked, setPicked] = useState<Problem | undefined>(() => pickRandom(BANK));
  const current = picked && matches.includes(picked) ? picked : matches[0];

  const canStart = source === 'random' ? !!current : pasted.trim().length > 20;

  function start() {
    const problem = source === 'random' ? current! : draftFromPaste(pasted, newId('paste-'));
    draftStore.set({
      problem,
      language: settings.language,
      persona: settings.persona,
      feedbackMode: settings.feedbackMode,
      minutes: settings.sessionMinutes,
    });
    navigate('/interview');
  }

  return (
    <div className="grid grid-cols-1 gap-12 pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex max-w-[680px] flex-col gap-10">
        <div>
          <h1 className="text-xl font-bold">{copy.title}</h1>
          <p className="mt-3 text-md text-ink-soft">{copy.intro}</p>
        </div>

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

        <div className="flex flex-wrap items-center gap-6">
          <Button variant="primary" onClick={start} disabled={!canStart}>
            {copy.start}
          </Button>
          <ButtonLink variant="quiet" href="#/replay/demo">
            {copy.tryDemo}
          </ButtonLink>
        </div>
      </div>

      <aside aria-label={copy.costHeading} className="lg:border-l lg:border-smudge lg:pl-8" />
    </div>
  );
}
