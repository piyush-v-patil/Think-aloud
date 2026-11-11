import { useEffect, useMemo, useState } from 'react';
import { replay as copy, errors, common, hireSignalName, rubricName, ai as aiCopy } from '../copy/strings';
import { SPEECH_ENGINES } from '../config/speech';
import { getSession } from '../lib/storage/db';
import type { Session } from '../lib/types';
import { useSettings } from '../state/settings';
import { useStore } from '../state/store';
import { processSession, processStore } from '../lib/session/process';
import { actualCost } from '../lib/cost/estimate';
import { formatTokens, formatUsd } from '../lib/cost/pricing';
import { formatClock } from '../lib/time';
import { computeMetrics } from '../lib/feedback/metrics';
import { durationOf } from '../lib/feedback/debrief';
import { buildMarkedTranscript } from '../lib/transcript/rows';
import { MarkedTranscript } from '../ui/MarkedTranscript';
import { ScoreTally } from '../ui/ScoreTally';
import { Button } from '../ui/Button';
import { Rule } from '../ui/Rule';

export default function ReplayScreen({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const settings = useSettings();
  const progress = useStore(processStore)[id];
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getSession(id).then((s) => {
      if (!live) return;
      setSession(s ?? null);
      if (s && !s.debrief && !s.demo) {
        processSession(s, settings)
          .then((done) => live && setSession(done))
          .catch(() => {});
      }
    });
    return () => {
      live = false;
    };
    // settings are read once when processing starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  if (session === undefined) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  if (session === null) return <p className="py-8">{errors.notFound}</p>;
  if (!session.debrief) {
    return (
      <div className="max-w-[640px] pt-12">
        <h1 className="text-lg font-bold">{copy.title(session.problem.title)}</h1>
        {progress?.error ? (
          <div role="alert" className="mt-6 flex flex-col gap-3">
            <p className="text-sm">
              {copy.failed} {progress.error === 'no-key' ? copy.noKey : (aiCopy.errors[progress.error] ?? '')}
            </p>
            <div>
              <Button variant="primary" onClick={() => setAttempt((a) => a + 1)}>
                {copy.retry}
              </Button>
            </div>
          </div>
        ) : (
          <div role="status" className="mt-6 border-l-[3px] border-blue py-1 pl-4">
            <p className="text-sm font-semibold">{copy.processing}</p>
            <p className="text-sm">{copy.stage[progress?.stage ?? 'scoring']}</p>
            <p className="text-sm text-ink-soft">{copy.processingTime}</p>
          </div>
        )}
      </div>
    );
  }
  return <Debrief session={session} />;
}

function Debrief({ session }: { session: Session }) {
  const d = session.debrief!;
  const [selected, setSelected] = useState<number | null>(null);
  const transcript = session.transcripts.accurate ?? session.transcripts.live;
  const metrics = useMemo(
    () => computeMetrics(transcript.utterances, session.code, session.phases, durationOf(session)),
    [session, transcript],
  );
  const { rows, marks } = useMemo(
    () => buildMarkedTranscript({ utterances: transcript.utterances, reactions: session.reactions, missed: session.missed, silences: metrics.silences }),
    [transcript, session, metrics],
  );
  const cost = actualCost(session);
  const unscored = session.notices.find((n) => n.startsWith('unscored:'));
  const droppedLive = session.notices.find((n) => n.startsWith('dropped-live:'));

  const jump = (t: number) => {
    setSelected(t);
    document.querySelector(`[data-row] [data-note]`)?.closest('ol')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="flex flex-col gap-12 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-bold">{session.demo ? copy.demoTitle(session.problem.title) : copy.title(session.problem.title)}</h1>
        {session.demo && <p className="max-w-[680px] text-sm text-ink-soft">{copy.demoNote}</p>}
      </header>

      <section aria-labelledby="summary-h" className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <h2 id="summary-h" className="sr-only">
          Summary
        </h2>
        <div>
          <p className="text-sm text-ink-soft">{copy.hireHeading}</p>
          <p className="text-lg font-bold">{hireSignalName[d.hireSignal]}</p>
          <p className="mt-1 text-sm">{d.hireSummary}</p>
        </div>
        <div>
          <p className="text-sm text-ink-soft">{copy.correctnessHeading}</p>
          <p className={`text-md font-semibold ${d.correctness.passed === d.correctness.total && d.correctness.total > 0 ? 'text-green' : 'text-red'}`}>
            {copy.correctness(d.correctness.passed, d.correctness.total)}
          </p>
          <p className="mt-1 text-sm">{d.correctness.summary}</p>
        </div>
        <div>
          <p className="text-sm text-ink-soft">{copy.costHeading}</p>
          <p className="text-md font-semibold">
            {cost.totalUsd !== null
              ? copy.costLine(formatUsd(cost.totalUsd))
              : copy.costTokens(formatTokens(Object.values(cost.tokens).reduce((n, t) => n + t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens, 0)))}
          </p>
          {cost.speechUsd > 0 && (
            <p className="text-sm text-ink-soft">
              {copy.speechCost}: {formatUsd(cost.speechUsd)}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="rubric-h" className="flex flex-col gap-4">
        <h2 id="rubric-h" className="text-md font-semibold">
          {copy.rubricHeading}
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {d.scores.map((s) => (
              <tr key={s.category} className="border-t border-smudge align-top">
                <th scope="row" className="w-40 py-3 pr-4 text-left font-semibold">
                  {rubricName[s.category]}
                </th>
                <td className="w-36 py-3 pr-4">
                  <ScoreTally score={s.score} />
                </td>
                <td className="py-3">
                  <p>{s.summary}</p>
                  <ul className="m-0 mt-1 list-none p-0">
                    {s.evidence.map((e, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => jump(e.t)} className="cursor-pointer text-left text-ink-soft">
                          <time className="font-mono text-xs">{formatClock(e.t)}</time>{' '}
                          {e.quote ? <q className="text-ink">{e.quote}</q> : copy.silence('')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-ink-soft">
          {copy.checked(d.verification.removed, d.verification.downgraded)} {copy.scoredOn(SPEECH_ENGINES[d.scoredOn]?.label ?? d.scoredOn)}
        </p>
        {unscored && <p className="text-sm">{copy.notScored(unscored.slice(9).split(',').map((c) => rubricName[c as keyof typeof rubricName]).join(', '))}</p>}
        {droppedLive && <p className="text-sm">{copy.droppedLive(Number(droppedLive.slice(13)))}</p>}
      </section>

      <section aria-labelledby="notes-h" className="flex flex-col gap-3">
        <h2 id="notes-h" className="text-md font-semibold">
          {copy.notesHeading}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {d.notes.map((n, i) => (
            <li key={i} className="text-sm">
              <button type="button" onClick={() => jump(n.t)} className="cursor-pointer text-left">
                <time className="mr-3 font-mono text-xs text-ink-soft">{formatClock(n.t)}</time>
                {n.text}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Rule />

      <section aria-labelledby="transcript-h" className="flex flex-col gap-4">
        <h2 id="transcript-h" className="text-md font-semibold">
          {copy.transcriptHeading}
        </h2>
        <MarkedTranscript rows={rows} marks={marks} selectedT={selected} onSelect={setSelected} />
      </section>
    </div>
  );
}
