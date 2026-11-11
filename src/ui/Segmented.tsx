import { useId } from 'react';

/**
 * A radio group drawn as a row of words with a marker underline under the
 * selected one. Not pills: see DESIGN.md.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  help?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="m-0 border-0 p-0" aria-describedby={help ? `${id}-help` : undefined}>
      <legend className={hideLabel ? 'sr-only' : 'mb-2 text-md font-semibold'}>{label}</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <label
              key={opt.value}
              className={`relative flex min-h-11 cursor-pointer items-center text-sm ${
                selected ? 'font-semibold text-ink' : 'text-ink-soft'
              } ${opt.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={selected}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                className="peer sr-only"
              />
              <span className="rounded-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-blue">
                {opt.label}
              </span>
              <svg
                aria-hidden="true"
                className={`absolute right-0 bottom-1 left-0 h-[6px] w-full ${selected ? '' : 'invisible'}`}
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
              >
                <path d="M1 4 C 30 2, 60 5, 99 3" stroke="var(--blue)" strokeWidth="3" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </label>
          );
        })}
      </div>
      {help && (
        <p id={`${id}-help`} className="mt-1 text-sm text-ink-soft">
          {help}
        </p>
      )}
    </fieldset>
  );
}
