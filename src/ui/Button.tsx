import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

const variants: Record<Variant, string> = {
  primary: 'bg-blue text-white dark:text-board',
  secondary: 'border border-ink text-ink bg-transparent',
  quiet: 'px-1 text-blue underline decoration-1 underline-offset-4',
  danger: 'border border-red text-red bg-transparent',
};

export function Button({
  variant = 'secondary',
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** A link styled as a button, for navigation actions. */
export function ButtonLink({
  href,
  variant = 'secondary',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={`${base} ${variants[variant]} no-underline ${className}`}>
      {children}
    </a>
  );
}
