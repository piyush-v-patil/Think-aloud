import type { Problem } from '../lib/types';
import { interview as copy } from '../copy/strings';

/**
 * Renders problem text as plain text. `inline code` spans become <code>
 * via string splitting, never via HTML parsing.
 */
export function ProblemText({ problem }: { problem: Problem }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {problem.statement.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          <InlineCode text={para} />
        </p>
      ))}
      {problem.examples.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{copy.examples}</p>
          {problem.examples.map((ex, i) => (
            <div key={i} className="border-l-[3px] border-smudge pl-3 font-mono text-xs">
              <p>{copy.exampleInput} {ex.input}</p>
              <p>{copy.exampleOutput} {ex.output}</p>
              {ex.explanation && <p className="font-sans text-sm text-ink-soft">{ex.explanation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InlineCode({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[0.92em]">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
