import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';
import { replay as copy, phaseName } from '../copy/strings';
import { formatClock } from '../lib/time';
import type { Marker, PhaseSegment } from '../lib/replay/sync';

const W = 1000;
const H = 84;
const MID = 46;

/**
 * The session as a marked-up strip: phases as ruled segments, the waveform
 * in pencil, silences shaded, and feedback drawn on it in marker. Each mark
 * also has a real button (44px tall) so it can be reached by keyboard and
 * touch.
 */
export function Timeline({
  durationMs,
  segments,
  markers,
  peaks,
  t,
  onSeek,
  selectedId,
  onSelectMarker,
}: {
  durationMs: number;
  segments: PhaseSegment[];
  markers: Marker[];
  peaks: number[];
  t: number;
  onSeek: (t: number) => void;
  selectedId: string | null;
  onSelectMarker: (m: Marker) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = (ms: number) => (Math.min(Math.max(ms, 0), durationMs) / Math.max(durationMs, 1)) * W;
  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current!.getBoundingClientRect();
    onSeek(((e.clientX - box.left) / box.width) * durationMs);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 30_000 : 5_000;
    if (e.key === 'ArrowRight') onSeek(Math.min(durationMs, t + step));
    else if (e.key === 'ArrowLeft') onSeek(Math.max(0, t - step));
    else if (e.key === 'Home') onSeek(0);
    else if (e.key === 'End') onSeek(durationMs);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={copy.timelineLabel}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(t / 1000)}
          aria-valuetext={copy.timeOf(formatClock(t), formatClock(durationMs))}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
          onKeyDown={onKey}
          className="cursor-pointer rounded-control"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[84px] w-full" aria-hidden="true">
            {/* Phases as ruled segments */}
            {segments.map((s, i) => (
              <g key={i}>
                <line x1={x(s.t0) + 2} x2={x(s.t1) - 2} y1={6} y2={6} stroke="var(--smudge-mark)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <line x1={x(s.t0)} x2={x(s.t0)} y1={2} y2={H - 2} stroke="var(--smudge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {/* Silences shaded */}
            {markers
              .filter((m) => m.kind === 'silence')
              .map((m) => (
                <rect key={m.id} x={x(m.t)} width={Math.max(1, x(m.t1 ?? m.t) - x(m.t))} y={18} height={56} fill="var(--smudge)" opacity="0.6" />
              ))}
            {/* Waveform */}
            {peaks.length ? (
              peaks.map((p, i) => {
                const px = (i / peaks.length) * W;
                const h = Math.max(1, p * 24);
                return <line key={i} x1={px} x2={px} y1={MID - h} y2={MID + h} stroke="var(--smudge-mark)" strokeWidth="1" opacity="0.55" vectorEffect="non-scaling-stroke" />;
              })
            ) : (
              <line x1={0} x2={W} y1={MID} y2={MID} stroke="var(--smudge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
            {/* Marks in marker colors, each with its own shape */}
            {markers.map((m) => {
              const mx = x(m.t);
              const sel = m.id === selectedId;
              const w = sel ? 4 : 2.5;
              switch (m.kind) {
                case 'strong':
                  return <path key={m.id} d={`M ${mx} ${MID - 4} L ${mx} 16 M ${mx - 4} 20 L ${mx} 15 L ${mx + 4} 20`} stroke="var(--blue)" strokeWidth={w} fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
                case 'negative':
                  return <path key={m.id} d={`M ${mx} ${MID + 4} L ${mx - 3} ${MID + 10} L ${mx + 3} ${MID + 16} L ${mx - 3} ${MID + 22} L ${mx} ${MID + 28}`} stroke="var(--red)" strokeWidth={w} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
                case 'missed':
                  return <line key={m.id} x1={mx} x2={mx} y1={18} y2={74} stroke="var(--smudge-mark)" strokeWidth={w} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />;
                case 'neutral':
                  return <line key={m.id} x1={mx} x2={mx} y1={MID - 10} y2={MID + 10} stroke="var(--smudge-mark)" strokeWidth={w} vectorEffect="non-scaling-stroke" />;
                case 'interviewer':
                  return <line key={m.id} x1={mx} x2={mx} y1={H - 8} y2={H - 1} stroke="var(--green)" strokeWidth={w} vectorEffect="non-scaling-stroke" />;
                default:
                  return null;
              }
            })}
            {/* Playhead */}
            <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {/* Focusable, touch-sized targets for each feedback mark */}
        {markers
          .filter((m) => m.kind !== 'interviewer' && m.kind !== 'silence')
          .map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMarker(m)}
              aria-label={`${formatClock(m.t)}. ${copy.markerLabel[m.kind](m.label)}`}
              aria-pressed={m.id === selectedId}
              title={m.label}
              className="absolute top-5 h-11 w-6 -translate-x-1/2 cursor-pointer rounded-control"
              style={{ left: `${(x(m.t) / W) * 100}%` }}
            />
          ))}
      </div>
      <div className="relative h-5 text-xs text-ink-soft" aria-hidden="true">
        {segments.map((s, i) => (
          <span key={i} className="absolute truncate pl-1" style={{ left: `${(x(s.t0) / W) * 100}%`, width: `${((x(s.t1) - x(s.t0)) / W) * 100}%` }}>
            {phaseName[s.phase]}
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-ink-soft">
        <LegendItem kind="strong" />
        <LegendItem kind="negative" />
        <LegendItem kind="missed" />
        <LegendItem kind="silence" />
        <LegendItem kind="interviewer" />
      </ul>
    </div>
  );
}

function LegendItem({ kind }: { kind: 'strong' | 'negative' | 'missed' | 'silence' | 'interviewer' }) {
  const sample = {
    strong: <path d="M 8 14 L 8 3 M 4 7 L 8 2 L 12 7" stroke="var(--blue)" strokeWidth="2" fill="none" />,
    negative: <path d="M 8 2 L 5 6 L 11 10 L 5 14" stroke="var(--red)" strokeWidth="2" fill="none" />,
    missed: <line x1="8" x2="8" y1="1" y2="15" stroke="var(--smudge-mark)" strokeWidth="2" strokeDasharray="3 3" />,
    silence: <rect x="2" y="3" width="12" height="10" fill="var(--smudge)" />,
    interviewer: <line x1="8" x2="8" y1="8" y2="15" stroke="var(--green)" strokeWidth="2.5" />,
  }[kind];
  return (
    <li className="flex items-center gap-1.5">
      <svg width="16" height="16" aria-hidden="true">
        {sample}
      </svg>
      {copy.legend[kind]}
    </li>
  );
}
