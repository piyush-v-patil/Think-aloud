import type { ReactNode } from 'react';

/** Opens in a new tab without sending a referrer or giving the page access back to us. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-4">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
