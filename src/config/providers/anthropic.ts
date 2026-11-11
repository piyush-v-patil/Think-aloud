import type { ProviderConfig } from './types';

/**
 * Anthropic models and prices. Checked against
 * https://platform.claude.com/docs/en/about-claude/pricing on 2026-11-11.
 * cacheWrite is the 5-minute cache write price; cacheRead is a cache hit.
 */
export const anthropic: ProviderConfig = {
  id: 'anthropic',
  label: 'Anthropic',
  keyUrl: 'https://platform.claude.com/settings/keys',
  pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
  pricesCheckedOn: '2026-11-11',
  promptCaching: 'explicit',
  keyCheckModel: 'claude-haiku-5-5',
  models: [
    {
      id: 'claude-haiku-5-5',
      label: 'Haiku 5.5',
      tier: 'small',
      prices: [
        {
          input: 0.1,
          output: 0.5,
          cacheWrite: 0.125,
          cacheRead: 0.01,
          longContext: { aboveInputTokens: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
        },
      ],
    },
    {
      id: 'claude-sonnet-5-5',
      label: 'Sonnet 5.5',
      tier: 'mid',
      prices: [{ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 }],
    },
    {
      id: 'claude-opus-5-5',
      label: 'Opus 5.5',
      tier: 'top',
      prices: [{ input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }],
    },
    {
      id: 'claude-fable-5-2',
      label: 'Fable 5.2',
      tier: 'top',
      prices: [{ input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 }],
    },
  ],
  presets: {
    economy: { interviewer: 'claude-haiku-5-5', reactions: 'claude-haiku-5-5', debrief: 'claude-haiku-5-5' },
    balanced: { interviewer: 'claude-sonnet-5-5', reactions: 'claude-sonnet-5-5', debrief: 'claude-opus-5-5' },
    best: { interviewer: 'claude-opus-5-5', reactions: 'claude-opus-5-5', debrief: 'claude-fable-5-2' },
  },
};
