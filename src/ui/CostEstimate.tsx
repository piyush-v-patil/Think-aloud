import { cost as copy } from '../copy/strings';
import type { Estimate } from '../lib/cost/estimate';
import { formatTokens, formatUsd } from '../lib/cost/pricing';

/** The setup screen's cost panel: total, breakdown and where the number comes from. */
export function CostEstimate({ estimate, unpricedNote = copy.tokensOnly }: { estimate: Estimate; unpricedNote?: string }) {
  const rows = (['interviewer', 'reactions', 'debrief', 'analysis'] as const).filter((r) => {
    const u = estimate.byRole[r].usage;
    return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens > 0;
  });
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <h2 className="text-md font-semibold">{copy.heading}</h2>
      {estimate.totalUsd !== null ? (
        <p className="text-sm">
          <span className="text-lg font-bold">{copy.about(formatUsd(estimate.totalUsd))}</span>
          <span className="text-ink-soft">, {copy.estimate}</span>
        </p>
      ) : (
        <p className="text-sm text-ink-soft">{unpricedNote}</p>
      )}
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r) => {
            const { usd, usage } = estimate.byRole[r];
            const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
            return (
              <tr key={r} className="border-t border-smudge">
                <th scope="row" className="py-1.5 text-left font-normal text-ink-soft">
                  {copy.perRole[r]}
                </th>
                <td className="py-1.5 text-right">{usd === null ? formatTokens(total) : formatUsd(usd)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-smudge">
            <th scope="row" className="py-1.5 text-left font-normal text-ink-soft">
              {copy.speechLine}
            </th>
            <td className="py-1.5 text-right">{estimate.speechUsd > 0 ? formatUsd(estimate.speechUsd) : copy.free}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-ink-soft">
        {estimate.basis === 'history' ? copy.basisHistory(estimate.basedOnSessions) : copy.basisModel}
      </p>
    </div>
  );
}
