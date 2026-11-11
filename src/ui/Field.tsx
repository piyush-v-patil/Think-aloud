import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-control border border-smudge-mark bg-paper px-3 text-sm text-ink placeholder:text-ink-soft';

function FieldShell({
  id,
  label,
  help,
  error,
  children,
  hideLabel,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
  hideLabel?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-semibold'}>
        {label}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="text-sm text-ink-soft">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-help`} className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  help,
  error,
  hideLabel,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: ReactNode; error?: string; hideLabel?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} error={error} hideLabel={hideLabel}>
      <input
        id={id}
        aria-describedby={help || error ? `${id}-help` : undefined}
        aria-invalid={error ? true : undefined}
        className={`${control} min-h-11 ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  help,
  error,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; help?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      <textarea
        id={id}
        aria-describedby={help || error ? `${id}-help` : undefined}
        className={`${control} py-2 ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  help,
  options,
  hideLabel,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  help?: ReactNode;
  hideLabel?: boolean;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} help={help} hideLabel={hideLabel}>
      <select id={id} className={`${control} min-h-11 ${className}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
