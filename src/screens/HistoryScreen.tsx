import { useEffect, useMemo, useState } from 'react';
import { list as listCopy, history as copy, common, hireSignalName, presetName, rubricName } from '../copy/strings';
import { deleteSession, listSessions } from '../lib/storage/db';
import type { Session } from '../lib/types';
import { Button, ButtonLink } from '../ui/Button';
import { TextField } from '../ui/Field';
import { Dialog } from '../ui/Dialog';
import { Rule } from '../ui/Rule';
import { TrendCharts } from '../ui/TrendCharts';
import { formatDate } from '../lib/time';
import { actualCost } from '../lib/cost/estimate';
import { formatUsd } from '../lib/cost/pricing';
import { limitState, scored, spend, suggestNext, weakest } from '../lib/history/stats';
import { BANK, loadBankProblem } from '../lib/problems/bank';
import { updateSettings, useSettings } from '../state/settings';
import { draftStore } from '../state/draft';
import { navigate } from '../state/router';

export function HistoryScreen() {
  const settings = useSettings();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [toDelete, setToDelete] = useState<Session | null>(null);
  useEffect(() => {
    listSessions().then(setSessions);
  }, []);
  const stats = useMemo(() => {
    if (!sessions) return null;
    const focus = weakest(sessions);
    const done = new Set(sessions.map((s) => s.problem.id));
    return { focus, next: suggestNext(BANK, done, focus), money: spend(sessions) };
  }, [sessions]);

  if (!sessions || !stats) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  if (!sessions.length) {
    return (
      <div className="max-w-[560px] pt-12">
        <h1 className="text-lg font-bold">{copy.emptyTitle}</h1>
        <p className="mt-3 text-sm">{copy.emptyBody}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <ButtonLink variant="primary" href="#/">
            {copy.startFirst}
          </ButtonLink>
          <ButtonLink href="#/replay/demo">{copy.watchDemo}</ButtonLink>
        </div>
      </div>
    );
  }

  const limit = settings.monthlyLimitUsd;
  const state = limitState(stats.money.monthUsd, limit);

  async function startSuggested() {
    const problem = stats?.next ? await loadBankProblem(stats.next.id) : undefined;
    if (!problem) return;
    draftStore.set({ problem, language: settings.language, persona: settings.persona, feedbackMode: settings.feedbackMode, minutes: settings.sessionMinutes });
    navigate('/interview');
  }

  return (
    <div className="flex flex-col gap-12 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-lg font-bold">{copy.title}</h1>
        <a href="#/list" className="text-sm text-blue underline underline-offset-4">
          {listCopy.title}
        </a>
      </div>

      {stats.focus && stats.next && (
        <section aria-labelledby="focus-h" className="border-l-[3px] border-blue py-1 pl-4">
          <h2 id="focus-h" className="text-md font-semibold">
            {copy.focusHeading}
          </h2>
          <p className="mt-1 text-sm">
            {copy.weakest(rubricName[stats.focus].toLowerCase())} {copy.suggestion(stats.next.title)}
          </p>
          <Button variant="primary" className="mt-3" onClick={() => void startSuggested()}>
            {copy.startSuggested}
          </Button>
        </section>
      )}

      {scored(sessions).length > 0 && (
        <section aria-labelledby="trend-h" className="flex flex-col gap-3">
          <h2 id="trend-h" className="text-md font-semibold">
            {copy.trendsHeading}
          </h2>
          <p className="text-sm text-ink-soft">{copy.trendsIntro}</p>
          <TrendCharts sessions={sessions} />
        </section>
      )}

      <section aria-labelledby="sessions-h" className="flex flex-col gap-3">
        <h2 id="sessions-h" className="text-md font-semibold">
          {copy.sessionsHeading}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-2 pr-4 font-normal">{copy.colDate}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.colProblem}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.colSignal}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.colPreset}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{copy.colCost}</th>
                <th scope="col" className="py-2 font-normal">
                  <span className="sr-only">{copy.delete}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const c = actualCost(s).totalUsd;
                return (
                  <tr key={s.id} className="border-t border-smudge">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(s.createdAt)}</td>
                    <td className="py-2 pr-4">
                      <a href={`#/replay/${s.id}`} className="text-blue underline underline-offset-4">
                        {s.problem.title}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{s.debrief ? hireSignalName[s.debrief.hireSignal] : copy.notScoredYet}</td>
                    <td className="py-2 pr-4">{presetName[s.config.preset]}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{c === null ? copy.costUnknown : copy.costActual(formatUsd(c))}</td>
                    <td className="py-2">
                      <Button variant="quiet" onClick={() => setToDelete(s)}>
                        {copy.delete}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Rule />

      <section aria-labelledby="spend-h" className="flex max-w-[560px] flex-col gap-3 pb-8">
        <h2 id="spend-h" className="text-md font-semibold">
          {copy.spendHeading}
        </h2>
        <p className="text-sm">{copy.spendWeek(formatUsd(stats.money.weekUsd))}</p>
        <p className="text-sm">{copy.spendMonth(formatUsd(stats.money.monthUsd))}</p>
        {stats.money.unknown > 0 && <p className="text-sm text-ink-soft">{copy.spendUnknown(stats.money.unknown)}</p>}
        {state === 'near' && <p className="text-sm">{copy.limitNear(formatUsd(stats.money.monthUsd), formatUsd(limit!))}</p>}
        {state === 'over' && <p className="text-sm text-red">{copy.limitOver(formatUsd(stats.money.monthUsd), formatUsd(limit!))}</p>}
        <div className="max-w-[260px]">
          <TextField
            label={copy.limitLabel}
            help={copy.limitHelp}
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={limit ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateSettings({ monthlyLimitUsd: e.target.value === '' || !Number.isFinite(v) || v <= 0 ? null : v });
            }}
          />
        </div>
      </section>

      <Dialog open={!!toDelete} title={copy.delete} onClose={() => setToDelete(null)}>
        <p className="text-sm">{copy.deleteConfirm}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button
            variant="danger"
            onClick={async () => {
              await deleteSession(toDelete!.id);
              setSessions((all) => all!.filter((s) => s.id !== toDelete!.id));
              setToDelete(null);
            }}
          >
            {copy.deleteYes}
          </Button>
          <Button onClick={() => setToDelete(null)}>{copy.deleteNo}</Button>
        </div>
      </Dialog>
    </div>
  );
}
