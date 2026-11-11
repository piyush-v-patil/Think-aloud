import type { ProviderId } from '../types';
import type { Settings } from '../../state/settings';
import { getKey } from '../../state/keys';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { CompatibleProvider } from './compatible';
import type { AIProvider } from './types';

/**
 * Builds the provider for the current settings, or null when it can't be
 * used yet (no key, or a custom endpoint without a model).
 */
export function createProvider(id: ProviderId, settings: Settings, key = getKey(id)): AIProvider | null {
  switch (id) {
    case 'anthropic':
      return key ? new AnthropicProvider(key) : null;
    case 'openai':
      return key ? new OpenAIProvider(key) : null;
    case 'gemini':
      return key ? new GeminiProvider(key) : null;
    case 'claude-code':
      return key ? new CompatibleProvider(settings.claudeCodeUrl, key, undefined, 'claude-code') : null;
    case 'custom': {
      const c = settings.custom;
      const hasModel = c.models.small || c.models.mid || c.models.top;
      return c.baseUrl && hasModel ? new CompatibleProvider(c.baseUrl, key) : null;
    }
  }
}

/** True when the selected provider is ready for an interview. */
export function providerReady(settings: Settings): boolean {
  return createProvider(settings.provider, settings) !== null;
}
