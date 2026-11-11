/**
 * Builds the marked-up transcript (rows plus margin marks) from a session's
 * utterances, silences, reactions and missed opportunities. Used live in
 * Training mode and in the replay, so feedback always reads the same way.
 */
import type { MissedOpportunity, Reaction, Utterance } from '../types';
import type { TranscriptMark, TranscriptRow } from '../../ui/MarkedTranscript';
import { rubricName, replay as copy } from '../../copy/strings';
import { formatDuration } from '../time';

export function pointsLabel(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
}

export function buildMarkedTranscript(opts: {
  utterances: Utterance[];
  reactions: Reaction[];
  missed?: MissedOpportunity[];
  silences?: { t0: number; t1: number }[];
  freshIds?: Set<string>;
}): { rows: TranscriptRow[]; marks: TranscriptMark[] } {
  const rows: TranscriptRow[] = opts.utterances.map((u) => ({ id: u.id, kind: 'utterance', speaker: u.speaker, t: u.t0, text: u.text }));
  const marks: TranscriptMark[] = [];
  const silenceRows = new Map<number, string>();
  const silenceRow = (s: { t0: number; t1: number }) => {
    const existing = silenceRows.get(s.t0);
    if (existing) return existing;
    const id = `silence-${s.t0}`;
    silenceRows.set(s.t0, id);
    rows.push({ id, kind: 'silence', t: s.t0, text: copy.silence(formatDuration(s.t1 - s.t0)) });
    return id;
  };
  for (const s of opts.silences ?? []) silenceRow(s);

  for (const r of opts.reactions) {
    const rowId = r.silence ? silenceRow(r.silence) : r.utteranceId;
    if (!rowId || (!r.silence && !opts.utterances.some((u) => u.id === rowId))) continue;
    marks.push({
      id: r.id,
      rowId,
      quote: r.silence ? '' : r.quote,
      kind: r.level,
      label: `${pointsLabel(r.points)} ${rubricName[r.category]}`,
      reason: r.reason,
      sayInstead: r.sayInstead,
      t: r.t,
      fresh: opts.freshIds?.has(r.id),
    });
  }
  for (const m of opts.missed ?? []) {
    const id = `missed-${m.id}`;
    rows.push({ id, kind: 'missed', t: m.t + 1, text: copy.notSaid(m.what) });
    marks.push({ id: m.id, rowId: id, quote: '', kind: 'missed', label: `${copy.missedLabel} ${rubricName[m.category]}`, reason: m.what, sayInstead: m.sayInstead, t: m.t });
  }
  rows.sort((a, b) => a.t - b.t);
  return { rows, marks };
}
