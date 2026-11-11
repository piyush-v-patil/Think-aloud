import type { ProviderConfig } from './types';

/**
 * Google Gemini models and prices (paid tier, prompts up to 200k tokens).
 * Checked against https://ai.google.dev/gemini-api/docs/pricing on 2026-11-11.
 * Several prices change on announced dates; both are listed with `from`.
 * Gemini caching here is implicit (automatic), billed at the cached price.
 */
export const gemini: ProviderConfig = {
  id: 'gemini',
  label: 'Google Gemini',
  keyUrl: 'https://aistudio.google.com/apikey',
  pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  pricesCheckedOn: '2026-11-11',
  promptCaching: 'automatic',
  keyCheckModel: 'gemini-3.5-flash-lite',
  models: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tier: 'small', prices: [{ input: 0.3, output: 2.5, cacheRead: 0.03 }] },
    {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      tier: 'mid',
      prices: [
        { input: 0.75, output: 3.75, cacheRead: 0.075 },
        { from: '2027-01-01', input: 1.5, output: 7.5, cacheRead: 0.15 },
      ],
    },
    {
      id: 'gemini-4-argon',
      label: 'Gemini 4 Argon',
      tier: 'top',
      prices: [
        { input: 2, output: 10, cacheRead: 0.1 },
        { from: '2026-12-01', input: 4, output: 20, cacheRead: 0.2 },
      ],
    },
    {
      id: 'gemini-4-carbon',
      label: 'Gemini 4 Carbon',
      tier: 'top',
      prices: [
        { input: 2, output: 10, cacheRead: 0.1 },
        { from: '2026-12-01', input: 4, output: 20, cacheRead: 0.2 },
      ],
    },
  ],
  presets: {
    economy: { interviewer: 'gemini-3.5-flash-lite', reactions: 'gemini-3.5-flash-lite', debrief: 'gemini-3.5-flash-lite' },
    balanced: { interviewer: 'gemini-3.8-flash', reactions: 'gemini-3.8-flash', debrief: 'gemini-4-argon' },
    best: { interviewer: 'gemini-4-argon', reactions: 'gemini-4-argon', debrief: 'gemini-4-carbon' },
  },
};
