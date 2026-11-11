import type { ModelRole, PresetId, ProviderId } from '../../lib/types';
import type { CustomEndpointSettings } from '../../state/settings';
import { anthropic } from './anthropic';
import { openai } from './openai';
import { gemini } from './gemini';
import type { ModelInfo, PriceSchedule, ProviderConfig, RoleModels } from './types';

export type { ModelInfo, ProviderConfig, RoleModels, PriceSchedule } from './types';

/**
 * The generic OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio...).
 * Models and prices come from the user's settings; without prices, costs
 * show as token counts.
 */
export function customProvider(custom: CustomEndpointSettings): ProviderConfig {
  const prices: PriceSchedule[] = custom.prices
    ? [{ input: custom.prices.input, output: custom.prices.output, cacheRead: custom.prices.cachedInput ?? custom.prices.input }]
    : [];
  const model = (id: string, tier: ModelInfo['tier']): ModelInfo => ({ id, label: id, tier, prices });
  const small = custom.models.small || custom.models.mid || custom.models.top;
  const mid = custom.models.mid || small;
  const top = custom.models.top || mid;
  const ids = [...new Set([small, mid, top].filter(Boolean))];
  return {
    id: 'custom',
    label: 'Custom endpoint',
    keyUrl: '',
    pricingUrl: '',
    pricesCheckedOn: '',
    promptCaching: 'automatic',
    keyCheckModel: small,
    models: ids.map((id) => model(id, id === top ? 'top' : id === small ? 'small' : 'mid')),
    presets: {
      economy: { interviewer: small, reactions: small, debrief: small },
      balanced: { interviewer: mid, reactions: mid, debrief: top },
      best: { interviewer: top, reactions: top, debrief: top },
    },
  };
}

export function providerConfig(id: ProviderId, custom: CustomEndpointSettings): ProviderConfig {
  switch (id) {
    case 'anthropic':
      return anthropic;
    case 'openai':
      return openai;
    case 'gemini':
      return gemini;
    case 'custom':
      return customProvider(custom);
  }
}

export const BUILT_IN_PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'gemini', 'custom'];

/** Resolves the model for each role from a preset, or the user's per-role choice for Advanced. */
export function modelsFor(
  config: ProviderConfig,
  preset: PresetId,
  advanced: Partial<Record<ProviderId, Record<ModelRole, string>>>,
): RoleModels {
  if (preset === 'advanced') {
    const chosen = advanced[config.id];
    const fallback = config.presets.balanced;
    const valid = (m?: string) => (m && config.models.some((x) => x.id === m) ? m : undefined);
    return {
      interviewer: valid(chosen?.interviewer) ?? fallback.interviewer,
      reactions: valid(chosen?.reactions) ?? fallback.reactions,
      debrief: valid(chosen?.debrief) ?? fallback.debrief,
    };
  }
  return config.presets[preset];
}

/** The most capable model this selection allows; used for preparing pasted problems. */
export function strongestModel(models: RoleModels): string {
  return models.debrief;
}

export function findModel(config: ProviderConfig, id: string): ModelInfo | undefined {
  return config.models.find((m) => m.id === id);
}
