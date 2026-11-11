import { replay as copy } from '../copy/strings';

/**
 * A rubric score as four marker strokes, n of them inked, plus the digits.
 * Shape and text carry the meaning; color only reinforces it.
 */
export function ScoreTally({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" width="44" height="18" viewBox="0 0 44 18">
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M ${4 + i * 11} 15 L ${7 + i * 11} 3`}
            stroke={i < score ? 'var(--ink)' : 'var(--smudge)'}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span className="text-sm">{copy.scoreOf(score)}</span>
    </span>
  );
}
