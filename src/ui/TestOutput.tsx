import type { TestRun } from '../lib/types';
import { formatValue } from '../lib/runner/compare';
import { interview as copy } from '../copy/strings';

export function TestOutput({ run, hasTests }: { run: TestRun | null; hasTests: boolean }) {
  if (!run) {
    return <p className="text-sm text-ink-soft">{hasTests ? copy.noRunYet : copy.noTests}</p>;
  }
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {run.total > 0 && !run.error && (
        <p className={`text-sm font-semibold ${run.passed === run.total ? 'text-green' : 'text-red'}`}>
          {copy.passed(run.passed, run.total)}
        </p>
      )}
      {run.error && (
        <pre className="m-0 font-mono text-xs whitespace-pre-wrap text-red">{run.error}</pre>
      )}
      {run.results.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {run.results.map((r, i) => (
            <li key={i} className="border-l-[3px] pl-3 text-sm" style={{ borderColor: r.passed ? 'var(--green)' : 'var(--red)' }}>
              <p className="flex items-baseline gap-2">
                <span className={`font-semibold ${r.passed ? 'text-green' : 'text-red'}`}>{r.passed ? copy.testPassed : copy.testFailed}</span>
                <span>{r.hidden ? copy.hiddenTest : r.name}</span>
              </p>
              {!r.passed && !r.hidden && (
                <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-3 font-mono text-xs">
                  {r.args && (
                    <>
                      <dt className="text-ink-soft">{copy.input}</dt>
                      <dd className="m-0 break-all">{r.args.map((a) => formatValue(a, 80)).join(', ')}</dd>
                    </>
                  )}
                  <dt className="text-ink-soft">{copy.expected}</dt>
                  <dd className="m-0 break-all">{formatValue(r.expected)}</dd>
                  {r.error ? (
                    <>
                      <dt className="text-ink-soft">{copy.error}</dt>
                      <dd className="m-0 break-all text-red">{r.error}</dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-ink-soft">{copy.got}</dt>
                      <dd className="m-0 break-all">{formatValue(r.actual)}</dd>
                    </>
                  )}
                </dl>
              )}
              {r.stdout && !r.hidden && (
                <pre className="m-0 mt-1 max-h-24 overflow-auto font-mono text-xs whitespace-pre-wrap text-ink-soft">{r.stdout}</pre>
              )}
            </li>
          ))}
        </ol>
      )}
      {run.stdout && (
        <div>
          <p className="text-xs text-ink-soft">{copy.output}</p>
          <pre className="m-0 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">{run.stdout}</pre>
        </div>
      )}
    </div>
  );
}
