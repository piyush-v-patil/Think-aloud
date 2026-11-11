import type { ProviderConfig } from './types';

/**
 * Claude Code on this computer, reached through the local bridge
 * (`npm run claude-bridge`). Model ids are the CLI's aliases, which always
 * point at the latest model of each family. There are no prices: usage
 * counts against the user's Claude plan, so costs show as token counts.
 */
export const CLAUDE_CODE_DEFAULT_URL = 'http://localhost:8787/v1';

const model = (id: string, label: string, tier: 'small' | 'mid' | 'top') => ({ id, label, tier, prices: [] });

export const claudeCode: ProviderConfig = {
  id: 'claude-code',
  label: 'Claude Code',
  keyUrl: 'https://code.claude.com/docs/en/setup',
  pricingUrl: '',
  pricesCheckedOn: '',
  promptCaching: 'automatic',
  keyCheckModel: 'haiku',
  models: [model('haiku', 'Haiku', 'small'), model('sonnet', 'Sonnet', 'mid'), model('opus', 'Opus', 'top'), model('fable', 'Fable', 'top')],
  presets: {
    economy: { interviewer: 'haiku', reactions: 'haiku', debrief: 'haiku' },
    balanced: { interviewer: 'sonnet', reactions: 'sonnet', debrief: 'opus' },
    best: { interviewer: 'opus', reactions: 'opus', debrief: 'fable' },
  },
};
