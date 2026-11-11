import type { ProviderConfig } from './types';

/**
 * OpenAI models and prices (Standard tier, short context). Checked against
 * https://developers.openai.com/api/docs/pricing on 2026-11-11.
 * cacheWrite is the default 30-minute cache write; cacheRead is cached input.
 */
export const openai: ProviderConfig = {
  id: 'openai',
  label: 'OpenAI',
  keyUrl: 'https://platform.openai.com/api-keys',
  pricingUrl: 'https://developers.openai.com/api/docs/pricing',
  pricesCheckedOn: '2026-11-11',
  promptCaching: 'automatic',
  keyCheckModel: 'gpt-6-luna',
  models: [
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'small', prices: [{ input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }] },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', tier: 'mid', prices: [{ input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25 }] },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tier: 'mid', prices: [{ input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 }] },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', tier: 'top', prices: [{ input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 }] },
  ],
  presets: {
    economy: { interviewer: 'gpt-6-luna', reactions: 'gpt-6-luna', debrief: 'gpt-6-luna' },
    balanced: { interviewer: 'gpt-6.1-sol', reactions: 'gpt-6.1-sol', debrief: 'gpt-6-astra' },
    best: { interviewer: 'gpt-6-astra', reactions: 'gpt-6-astra', debrief: 'gpt-6-astra' },
  },
};
