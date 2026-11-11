import { useId } from 'react';

/** A real on/off switch. The only place a pill shape is used. */
export function Toggle({
  label,
  checked,
  onChange,
  help,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={help ? `${id}-help` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="mt-[11px] inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-ink p-[2px] disabled:opacity-50"
      >
        <span
          className={`block h-[18px] w-[18px] rounded-full transition-transform duration-150 ${
            checked ? 'translate-x-5 bg-blue' : 'translate-x-0 bg-smudge-mark'
          }`}
        />
      </button>
      <div className="min-h-11 py-[11px]">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold">
          {label}
          <span className="sr-only">{checked ? ' (on)' : ' (off)'}</span>
        </label>
        {help && (
          <p id={`${id}-help`} className="text-sm text-ink-soft">
            {help}
          </p>
        )}
      </div>
    </div>
  );
}
