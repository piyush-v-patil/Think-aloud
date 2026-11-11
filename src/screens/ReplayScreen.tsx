import { useEffect, useMemo, useState } from 'react';
import { replay as copy, errors, common, hireSignalName, rubricName, ai as aiCopy, phaseName } from '../copy/strings';
import { SPEECH_ENGINES } from '../config/speech';
import { getAudio, getSession, saveSession } from '../lib/storage/db';
import type { Rerecord, Session } from '../lib/types';
import { useSettings } from '../state/settings';
import { useStore } from '../state/store';
import { processSession, processStore } from '../lib/session/process';
import { actualCost } from '../lib/cost/estimate';
import { formatTokens, formatUsd } from '../lib/cost/pricing';
import { formatClock, formatDate, formatDuration } from '../lib/time';
import { computeMetrics } from '../lib/feedback/metrics';
import { durationOf } from '../lib/feedback/debrief';
import { buildMarkedTranscript, pointsLabel } from '../lib/transcript/rows';
import { buildMarkers, codeAt, peaks as computePeaks, phaseSegments, type Marker } from '../lib/replay/sync';
import { drawShareCard } from '../lib/share/card';
import { demoSession } from '../demo/demoSession';
import { MarkedTranscript } from '../ui/MarkedTranscript';
import { ScoreTally } from '../ui/ScoreTally';
import { Button } from '../ui/Button';
import { Rule } from '../ui/Rule';
import { Timeline } from '../ui/Timeline';
import { usePlayback } from '../ui/usePlayback';
import { MomentPanel, type Moment } from '../ui/MomentPanel';
import { CodeEditor } from '../ui/CodeEditor';
import { useIsDark } from './InterviewScreen';

export default function ReplayScreen({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null | undefined>(() => (id === 'demo' ? demoSession() : undefined));
  const settings = useSettings();
  const progress = useStore(processStore)[id];
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    if (id === 'demo') return;
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
  return <Debrief session={session} onChange={setSession} />;
}

function Debrief({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const d = session.debrief!;
  const dark = useIsDark();
  const transcript = session.transcripts.accurate ?? session.transcripts.live;
  const duration = durationOf(session);
  const metrics = useMemo(() => computeMetrics(transcript.utterances, session.code, session.phases, duration), [session, transcript, duration]);
  const { rows, marks } = useMemo(
    () => buildMarkedTranscript({ utterances: transcript.utterances, reactions: session.reactions, missed: session.missed, silences: metrics.silences }),
    [transcript, session, metrics],
  );
  const markers = useMemo(
    () =>
      buildMarkers({
        reactions: session.reactions,
        missed: session.missed,
        silences: metrics.silences,
        utterances: transcript.utterances,
        describe: {
          reaction: (r) => `${pointsLabel(r.points)} ${rubricName[r.category]}: ${r.reason}`,
          missed: (m) => m.what,
          silence: (s) => formatDuration(s.t1 - s.t0),
          interviewer: (u) => u.text,
        },
      }),
    [session, metrics, transcript],
  );
  const segments = useMemo(() => phaseSegments(session.phases, duration), [session.phases, duration]);

  // Recording, if there is one.
  const [audio, setAudio] = useState<{ url: string; offsetMs: number } | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    if (!session.audio) return;
    let url = '';
    let cancelled = false;
    getAudio(session.audio.id).then(async (blob) => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setAudio({ url, offsetMs: session.audio!.offsetMs });
      try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (!cancelled) setPeaks(computePeaks(buf.getChannelData(0), 400));
        void ctx.close();
      } catch {
        // Waveform is decoration; playback still works without it.
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [session.audio]);

  const player = usePlayback(duration, audio);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedT, setSelectedT] = useState<number | null>(null);

  const moments = useMemo(() => {
    const narr = (key: { reactionId?: string; missedId?: string }) =>
      d.narrations.find((n) => (key.reactionId && n.reactionId === key.reactionId) || (key.missedId && n.missedId === key.missedId))?.text;
    const map = new Map<string, Moment>();
    for (const r of session.reactions) {
      map.set(r.id, {
        key: r.id,
        t: r.t,
        kind: r.level,
        label: `${pointsLabel(r.points)} ${rubricName[r.category]}`,
        quote: r.quote,
        reason: r.reason,
        sayInstead: r.sayInstead,
        original: r.silence ? '' : r.quote,
        feedback: r.reason,
        narration: narr({ reactionId: r.id }) ?? r.sayInstead ?? '',
      });
    }
    for (const m of session.missed) {
      map.set(m.id, { key: m.id, t: m.t, kind: 'missed', label: `${copy.missedLabel} ${rubricName[m.category]}`, quote: '', reason: m.what, sayInstead: m.sayInstead, original: '', feedback: `Missed: ${m.what}`, narration: narr({ missedId: m.id }) ?? m.sayInstead });
    }
    return map;
  }, [session, d]);

  const select = (id: string | null, t: number) => {
    setSelectedId(id);
    setSelectedT(t);
    player.seek(Math.max(0, t - 1500));
  };
  const selectByTime = (t: number) => {
    const m = [...moments.values()].find((x) => x.t === t);
    select(m?.key ?? null, t);
    document.getElementById('replay-h')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  async function saveRerecord(r: Rerecord) {
    const next = { ...session, rerecords: [...session.rerecords, r] };
    if (!session.demo) await saveSession(next);
    onChange(next);
  }

  const cost = actualCost(session);
  const unscored = session.notices.find((n) => n.startsWith('unscored:'));
  const droppedLive = session.notices.find((n) => n.startsWith('dropped-live:'));
  const code = codeAt(session.code, player.t);

  return (
    <div className="flex flex-col gap-12 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-bold">{session.demo ? copy.demoTitle(session.problem.title) : copy.title(session.problem.title)}</h1>
        {session.demo && <p className="max-w-[680px] text-sm text-ink-soft">{copy.demoNote}</p>}
      </header>

      <section aria-label="Summary" className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
          <table className="mt-1 border-collapse text-sm text-ink-soft">
            <tbody>
              {(['interviewer', 'reactions', 'debrief', 'analysis'] as const)
                .filter((r) => cost.tokens[r].outputTokens > 0)
                .map((r) => (
                  <tr key={r}>
                    <th scope="row" className="pr-4 text-left font-normal">
                      {copy.costRole[r]}
                    </th>
                    <td>{cost.byRole[r] === null ? formatTokens(cost.tokens[r].inputTokens + cost.tokens[r].outputTokens) : formatUsd(cost.byRole[r]!)}</td>
                  </tr>
                ))}
              {cost.speechUsd > 0 && (
                <tr>
                  <th scope="row" className="pr-4 text-left font-normal">
                    {copy.speechCost}
                  </th>
                  <td>{formatUsd(cost.speechUsd)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="rubric-h" className="flex flex-col gap-4">
        <h2 id="rubric-h" className="text-md font-semibold">
          {copy.rubricHeading}
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {d.scores.map((s) => (
              <tr key={s.category} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-smudge align-top sm:table-row">
                <th scope="row" className="pt-3 text-left font-semibold sm:w-40 sm:py-3 sm:pr-4">
                  {rubricName[s.category]}
                </th>
                <td className="pt-3 sm:w-36 sm:py-3 sm:pr-4">
                  <ScoreTally score={s.score} />
                </td>
                <td className="col-span-2 pt-1 pb-3 sm:py-3">
                  <p>{s.summary}</p>
                  <ul className="m-0 mt-1 list-none p-0">
                    {s.evidence.map((e, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => selectByTime(e.t)} className="min-h-8 cursor-pointer text-left text-ink-soft">
                          <time className="font-mono text-xs">{formatClock(e.t)}</time> {e.quote ? <q className="text-ink">{e.quote}</q> : copy.silenceEvidence}
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
        {session.notices.filter((n) => !n.includes(':')).map((n, i) => (
          <p key={i} className="text-sm">
            {n}
          </p>
        ))}
      </section>

      <section aria-labelledby="notes-h" className="flex flex-col gap-3">
        <h2 id="notes-h" className="text-md font-semibold">
          {copy.notesHeading}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {d.notes.map((n, i) => (
            <li key={i} className="text-sm">
              <button type="button" onClick={() => selectByTime(n.t)} className="min-h-8 cursor-pointer text-left">
                <time className="mr-3 font-mono text-xs text-ink-soft">{formatClock(n.t)}</time>
                {n.text}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Rule />

      <section aria-labelledby="replay-h" className="flex scroll-mt-4 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="replay-h" className="text-md font-semibold">
            {copy.replayHeading}
          </h2>
          <div className="flex items-center gap-4">
            <Button variant="primary" onClick={player.playing ? player.pause : player.play}>
              {player.playing ? copy.pause : copy.play}
            </Button>
            <p className="text-sm">
              <time className="font-mono">{formatClock(player.t)}</time> <span className="text-ink-soft">/ {formatClock(duration)}</span>
            </p>
          </div>
        </div>
        <Timeline
          durationMs={duration}
          segments={segments}
          markers={markers}
          peaks={peaks}
          t={player.t}
          onSeek={player.seek}
          selectedId={selectedId}
          onSelectMarker={(m: Marker) => select(m.id, m.t)}
        />
        {!session.audio && <p className="text-sm text-ink-soft">{copy.noAudio}</p>}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-sm text-ink-soft">{copy.codeAt(formatClock(player.t))}</p>
            <div className="h-[340px]">
              <CodeEditor value={code} language={session.language} readOnly dark={dark} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm text-ink-soft">{copy.momentHeading}</h3>
            <MomentPanel key={selectedId ?? 'none'} moment={selectedId ? (moments.get(selectedId) ?? null) : null} session={session} onRerecord={saveRerecord} />
          </div>
        </div>
      </section>

      <section aria-labelledby="transcript-h" className="flex flex-col gap-4">
        <h2 id="transcript-h" className="text-md font-semibold">
          {copy.transcriptHeading}
        </h2>
        <MarkedTranscript
          rows={rows}
          marks={marks}
          selectedT={selectedT}
          onSelect={(t) => {
            const m = marks.find((x) => x.t === t);
            select(m?.id ?? null, t);
            document.getElementById('replay-h')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }}
        />
      </section>

      {session.problem.analysis && (
        <section aria-labelledby="walk-h" className="flex flex-col gap-3">
          <h2 id="walk-h" className="text-md font-semibold">
            {copy.walkthroughHeading}
          </h2>
          <p className="text-sm text-ink-soft">{copy.walkthroughIntro}</p>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue">{copy.showWalkthrough}</summary>
            <ol className="m-0 mt-2 flex list-none flex-col gap-4 p-0">
              {session.problem.analysis.walkthrough.map((w, i) => (
                <li key={i} className="grid grid-cols-1 gap-1 sm:grid-cols-[6rem_minmax(0,1fr)]">
                  <span className="text-xs text-ink-soft">{phaseName[w.phase]}</span>
                  <div>
                    <p className="text-sm">{w.say}</p>
                    {w.code && <pre className="m-0 mt-2 overflow-x-auto rounded-editor border border-smudge bg-paper p-3 font-mono text-xs">{w.code}</pre>}
                  </div>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}

      <ShareCard session={session} />
    </div>
  );
}

function ShareCard({ session }: { session: Session }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let u = '';
    drawShareCard(session.debrief!.scores, session.debrief!.hireSignal, formatDate(session.createdAt)).then((b) => {
      u = URL.createObjectURL(b);
      setBlob(b);
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [session.debrief, session.createdAt]);
  const file = blob ? new File([blob], 'think-aloud-scores.png', { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  return (
    <section aria-labelledby="share-h" className="flex flex-col gap-3 pb-8">
      <h2 id="share-h" className="text-md font-semibold">
        {copy.shareHeading}
      </h2>
      <p className="text-sm text-ink-soft">{copy.shareIntro}</p>
      {url && <img src={url} alt={copy.shareAlt} className="w-full max-w-[480px] rounded-editor border border-smudge" />}
      <div className="flex flex-wrap gap-4">
        {url && (
          <a href={url} download="think-aloud-scores.png" className="inline-flex min-h-11 items-center rounded-control border border-ink px-4 text-sm font-semibold">
            {copy.saveCard}
          </a>
        )}
        {canShare && <Button onClick={() => void navigator.share({ files: [file!] }).catch(() => {})}>{copy.shareCard}</Button>}
      </div>
    </section>
  );
}
