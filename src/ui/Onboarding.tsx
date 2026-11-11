import { onboarding as copy, cost as costCopy } from '../copy/strings';
import { anthropic } from '../config/providers/anthropic';
import { modelsFor } from '../config/providers';
import { estimateSession } from '../lib/cost/estimate';
import { formatUsd } from '../lib/cost/pricing';
import { presetName } from '../copy/strings';
import { updateSettings } from '../state/settings';
import { ButtonLink, Button } from './Button';
import { ExternalLink } from './ExternalLink';

/** First-run guide: how to get a key, and what a session costs. */
export function Onboarding() {
  const costs = (['economy', 'balanced', 'best'] as const).map((preset) => ({
    preset,
    usd: estimateSession({
      provider: anthropic,
      models: modelsFor(anthropic, preset, {}),
      feedbackMode: 'training',
      minutes: 45,
      needsAnalysis: false,
      speech: { liveEngine: 'browser' },
    }).totalUsd!,
  }));
  return (
    <section aria-labelledby="onboarding-h" className="border-l-[3px] border-blue py-1 pl-5">
      <h2 id="onboarding-h" className="text-md font-semibold">
        {copy.title}
      </h2>
      <p className="mt-2 text-sm">{copy.intro}</p>
      <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>
          {copy.step1} <ExternalLink href={anthropic.keyUrl}>platform.claude.com</ExternalLink>
        </li>
        <li>{copy.step2}</li>
        <li>{copy.step3}</li>
      </ol>
      <p className="mt-4 text-sm">{copy.costIntro}</p>
      <table className="mt-1 border-collapse text-sm">
        <tbody>
          {costs.map((c) => (
            <tr key={c.preset}>
              <th scope="row" className="py-0.5 pr-6 text-left font-normal">
                {presetName[c.preset]}
              </th>
              <td className="py-0.5">
                {costCopy.about(formatUsd(c.usd))}, {costCopy.estimate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-ink-soft">{copy.keyStays}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <ButtonLink variant="primary" href="#/settings">
          {copy.addKey}
        </ButtonLink>
        <ButtonLink href="#/replay/demo">{copy.demoFirst}</ButtonLink>
        <Button variant="quiet" onClick={() => updateSettings({ onboarded: true })}>
          {copy.dismiss}
        </Button>
      </div>
    </section>
  );
}
