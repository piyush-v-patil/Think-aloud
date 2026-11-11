import { useState } from 'react';
import { history as copy, rubricName, presetName } from '../copy/strings';
import type { RubricCategory, Session } from '../lib/types';
import { RUBRIC } from '../lib/types';
import { configChanges, scored, trends } from '../lib/history/stats';
import { formatDate } from '../lib/time';

const W = 260;
const H = 96;
const PAD = { l: 18, r: 10, t: 8, b: 8 };

/**
 * One small chart per rubric category: a single series each, so the title
 * names it and no legend box is needed. Dashed rules mark where the scoring
 * setup changed. Every point is focusable and has a tooltip; the same
 * numbers are in the table view below.
 */
export function TrendCharts({ sessions }: { sessions: Session[] }) {
  const list = scored(sessions);
  const t = trends(sessions);
  const changes = new Set(configChanges(sessions));
  const n = list.length;
  const x = (i: number) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (score: number) => PAD.t + ((4 - score) / 3) * (H - PAD.t - PAD.b);
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {RUBRIC.map((c) => (
          <li key={c}>
            <Chart category={c} points={t[c]} list={list} x={x} y={y} changes={changes} />
          </li>
        ))}
      </ul>
      {changes.size > 0 && <p className="text-xs text-ink-soft">{copy.setupChanged}</p>}
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-blue">{copy.showTable}</summary>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-1 pr-4 font-normal">
                  {copy.colDate}
                </th>
                {RUBRIC.map((c) => (
                  <th key={c} scope="col" className="py-1 pr-4 font-normal">
                    {rubricName[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-smudge">
                  <th scope="row" className="py-1 pr-4 text-left font-normal">
                    {formatDate(s.createdAt)}
                  </th>
                  {RUBRIC.map((c) => (
                    <td key={c} className="py-1 pr-4">
                      {s.debrief!.scores.find((x) => x.category === c)?.score ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Chart({
  category,
  points,
  list,
  x,
  y,
  changes,
}: {
  category: RubricCategory;
  points: { sessionId: string; score: number; t: number }[];
  list: Session[];
  x: (i: number) => number;
  y: (s: number) => number;
  changes: Set<number>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const idx = (id: string) => list.findIndex((s) => s.id === id);
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(idx(p.sessionId))} ${y(p.score)}`).join(' ');
  const shown = active !== null ? points[active] : points[points.length - 1];
  const shownSession = shown ? list[idx(shown.sessionId)] : null;
  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{rubricName[category]}</span>
        {shown && shownSession && (
          <span className="text-xs text-ink-soft" aria-live="polite">
            {copy.pointLabel(formatDate(shown.t), shown.score, presetName[shownSession.config.preset])}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full" role="img" aria-label={`${rubricName[category]}: ${points.map((p) => p.score).join(', ')}`}>
        {[1, 2, 3, 4].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--smudge)" strokeWidth="1" />
            <text x={2} y={y(v) + 4} fontSize="10" fill="var(--ink-soft)">
              {v}
            </text>
          </g>
        ))}
        {[...changes].map((i) => (
          <line key={i} x1={(x(i) + x(i - 1)) / 2} x2={(x(i) + x(i - 1)) / 2} y1={PAD.t - 4} y2={H - PAD.b + 4} stroke="var(--smudge-mark)" strokeWidth="1" strokeDasharray="3 3" />
        ))}
        {points.length > 1 && <path d={path} stroke="var(--blue)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => {
          const cx = x(idx(p.sessionId));
          const cy = y(p.score);
          const s = list[idx(p.sessionId)];
          return (
            <g
              key={p.sessionId}
              tabIndex={0}
              role="button"
              aria-label={copy.pointLabel(formatDate(p.t), p.score, presetName[s.config.preset])}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => (window.location.hash = `#/replay/${p.sessionId}`)}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle cx={cx} cy={cy} r={active === i ? 5.5 : 4} fill="var(--blue)" stroke="var(--board)" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
