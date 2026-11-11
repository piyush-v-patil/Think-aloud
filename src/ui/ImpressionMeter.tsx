import { interview as copy } from '../copy/strings';
import { impressionWord } from '../lib/session/feedback';

/**
 * A slim bar of the running overall signal, computed in code from the
 * reactions. It grows from the center: right in blue for positive, left in
 * red for negative, and always names its direction in words.
 */
export function ImpressionMeter({ value }: { value: number }) {
  const word = impressionWord(value);
  const pct = Math.round(Math.abs(value) * 50);
  return (
    <div className="flex items-center gap-3 text-xs" role="meter" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={Number(value.toFixed(2))} aria-valuetext={copy.impressionWord[word]} aria-label={copy.impressionLabel}>
      <span className="text-ink-soft">{copy.impressionLabel}</span>
      <span className="relative block h-[6px] w-40 rounded-[1px] bg-smudge" aria-hidden="true">
        <span className="absolute top-[-3px] left-1/2 h-3 w-px bg-ink-soft" />
        <span
          className="absolute top-0 h-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            left: value >= 0 ? '50%' : `${50 - pct}%`,
            background: value >= 0 ? 'var(--blue)' : 'var(--red)',
          }}
        />
      </span>
      <span className="font-semibold">{copy.impressionWord[word]}</span>
    </div>
  );
}
