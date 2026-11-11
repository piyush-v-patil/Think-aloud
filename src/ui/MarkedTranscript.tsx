import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { segmentText } from '../lib/transcript/quotes';
import { formatClock } from '../lib/time';
import { interview as copy } from '../copy/strings';

export type MarkKind = 'strong' | 'neutral' | 'negative' | 'missed';

export interface TranscriptRow {
  id: string;
  kind: 'utterance' | 'silence' | 'missed';
  speaker?: 'user' | 'interviewer';
  t: number;
  text: string;
}

export interface TranscriptMark {
  id: string;
  rowId: string;
  /** Exact words to underline. Empty means the whole row (silences, missed moments). */
  quote: string;
  kind: MarkKind;
  /** e.g. "+2 Clarification" */
  label: string;
  /** One line naming the behavior. */
  reason: string;
  sayInstead?: string;
  t: number;
  /** Draw the arrival stroke. */
  fresh?: boolean;
}

const labelColor: Record<MarkKind, string> = {
  strong: 'text-blue',
  negative: 'text-red',
  neutral: 'text-ink-soft',
  missed: 'text-ink-soft',
};
const lineColor: Record<MarkKind, string> = {
  strong: 'var(--blue)',
  negative: 'var(--red)',
  neutral: 'var(--smudge-mark)',
  missed: 'var(--smudge-mark)',
};

interface Leader {
  id: string;
  kind: MarkKind;
  x1: number;
  y1: number;
  /** Right edge of the text column: the leader runs level until here. */
  xm: number;
  x2: number;
  y2: number;
}

/**
 * The signature element: quoted words are underlined in marker, and each
 * note hangs in the margin joined to its underline. Used live (Training
 * mode) and in the replay, so feedback always reads the same way.
 */
export function MarkedTranscript({
  rows,
  marks,
  selectedT,
  onSelect,
  emptyText,
  label = copy.transcriptHeading,
}: {
  rows: TranscriptRow[];
  marks: TranscriptMark[];
  selectedT?: number | null;
  onSelect?: (t: number) => void;
  emptyText?: string;
  label?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [leaders, setLeaders] = useState<Record<string, Leader[]>>({});

  // Draw leader lines from the end of each underline to its margin note,
  // but only when the margin column sits beside the text (wide layouts).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const next: Record<string, Leader[]> = {};
      for (const row of Array.from(list.querySelectorAll<HTMLElement>('[data-row]'))) {
        const rowId = row.dataset.row!;
        const rowBox = row.getBoundingClientRect();
        const textBox = row.querySelector<HTMLElement>('[data-text]')?.getBoundingClientRect();
        const lines: Leader[] = [];
        for (const note of Array.from(row.querySelectorAll<HTMLElement>('[data-note]'))) {
          const markId = note.dataset.note!;
          const span = row.querySelector<HTMLElement>(`[data-mark~="${CSS.escape(markId)}"]`);
          if (!span) continue;
          const rects = span.getClientRects();
          const last = rects[rects.length - 1];
          const noteBox = note.getBoundingClientRect();
          if (!last || noteBox.left < last.right + 8) continue; // stacked layout: no leader
          const x1 = last.right - rowBox.left + 2;
          lines.push({
            id: markId,
            kind: (note.dataset.kind as MarkKind) ?? 'neutral',
            x1,
            y1: last.bottom - rowBox.top - 3,
            xm: Math.max(x1, (textBox ? textBox.right : last.right) - rowBox.left + 12),
            x2: noteBox.left - rowBox.left - 6,
            y2: noteBox.top - rowBox.top + 11,
          });
        }
        if (lines.length) next[rowId] = lines;
      }
      setLeaders(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [rows, marks]);

  if (!rows.length) {
    return <p className="text-sm text-ink-soft">{emptyText}</p>;
  }

  const marksByRow = new Map<string, TranscriptMark[]>();
  for (const m of marks) {
    const list = marksByRow.get(m.rowId) ?? [];
    list.push(m);
    marksByRow.set(m.rowId, list);
  }

  return (
    <ol ref={listRef} aria-label={label} className="@container m-0 flex list-none flex-col gap-4 p-0">
      {rows.map((row) => {
        const rowMarks = marksByRow.get(row.id) ?? [];
        const selected = selectedT != null && rowMarks.some((m) => m.t === selectedT);
        const rowStyle = selected ? ({ '--row-bg': 'var(--blue-wash)' } as CSSProperties) : undefined;
        return (
          <li
            key={row.id}
            data-row={row.id}
            style={rowStyle}
            className={`relative grid grid-cols-1 gap-x-8 gap-y-2 py-1 @min-[560px]:grid-cols-[minmax(0,42rem)_minmax(10rem,15rem)] ${
              selected ? 'border-l-[3px] border-blue bg-blue-wash pl-3' : 'pl-[15px]'
            }`}
          >
            <div className="min-w-0" data-text>
              <RowHeader row={row} />
              <RowText row={row} marks={rowMarks} onSelect={onSelect} />
            </div>
            {rowMarks.length > 0 && (
              <div className="flex flex-col gap-3 border-l-[3px] border-smudge pl-3 @min-[560px]:border-l-0 @min-[560px]:pl-0">
                {rowMarks.map((m) => (
                  <MarginNote key={m.id} mark={m} onSelect={onSelect} />
                ))}
              </div>
            )}
            {leaders[row.id] && (
              <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {leaders[row.id].map((l) => (
                  <path
                    key={l.id}
                    d={`M ${l.x1} ${l.y1} L ${l.xm} ${l.y1} C ${l.xm + 16} ${l.y1}, ${l.x2 - 16} ${l.y2}, ${l.x2} ${l.y2}`}
                    stroke={lineColor[l.kind]}
                    strokeWidth="1"
                    fill="none"
                    opacity="0.7"
                  />
                ))}
              </svg>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RowHeader({ row }: { row: TranscriptRow }) {
  const who =
    row.kind !== 'utterance' ? null : row.speaker === 'interviewer' ? (
      <span className="font-semibold text-green">{copy.interviewerLabel}</span>
    ) : (
      <span className="font-semibold">{copy.you}</span>
    );
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <time className="font-mono text-ink-soft">{formatClock(row.t)}</time>
      {who}
    </div>
  );
}

function RowText({
  row,
  marks,
  onSelect,
}: {
  row: TranscriptRow;
  marks: TranscriptMark[];
  onSelect?: (t: number) => void;
}) {
  const whole = marks.filter((m) => !m.quote);
  const quoted = marks.filter((m) => m.quote);
  const plainClass = row.kind === 'utterance' ? 'text-sm' : 'text-sm italic text-ink-soft';

  if (whole.length) {
    const m = whole[0];
    return (
      <p className={plainClass}>
        <span
          data-mark={whole.map((w) => w.id).join(' ')}
          className={`mark mark-${m.kind} ${m.fresh ? 'mark-new' : ''}`}
          onClick={() => onSelect?.(m.t)}
        >
          {row.text}
        </span>
      </p>
    );
  }
  const segments = segmentText(row.text, quoted);
  const byId = new Map(quoted.map((m) => [m.id, m]));
  return (
    <p className={plainClass}>
      {segments.map((seg, i) => {
        if (!seg.marks.length) return <span key={i}>{seg.text}</span>;
        // When marks overlap, the most serious one draws the stroke.
        const ms = seg.marks.map((id) => byId.get(id)!).sort((a, b) => rank(a.kind) - rank(b.kind));
        return (
          <span
            key={i}
            data-mark={seg.marks.join(' ')}
            className={`mark mark-${ms[0].kind} ${ms.some((m) => m.fresh) ? 'mark-new' : ''}`}
            onClick={() => onSelect?.(ms[0].t)}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
}

function rank(kind: MarkKind): number {
  return { negative: 0, strong: 1, missed: 2, neutral: 3 }[kind];
}

function MarginNote({ mark, onSelect }: { mark: TranscriptMark; onSelect?: (t: number) => void }) {
  const body = (
    <>
      <span className={`block text-sm font-semibold ${labelColor[mark.kind]}`}>{mark.label}</span>
      <span className="block text-sm text-ink">{mark.reason}</span>
      {mark.sayInstead && (
        <span className="mt-1 block text-sm text-ink-soft">
          {copy.trySaying} <q className="text-ink">{mark.sayInstead}</q>
        </span>
      )}
    </>
  );
  if (!onSelect) {
    return (
      <div data-note={mark.id} data-kind={mark.kind}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-note={mark.id}
      data-kind={mark.kind}
      onClick={() => onSelect(mark.t)}
      className="cursor-pointer rounded-control text-left"
    >
      {body}
    </button>
  );
}
