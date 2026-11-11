import type { ProviderId } from '../types';
import type { Settings } from '../../state/settings';
import { getKey } from '../../state/keys';
import { AnthropicProvider } from './anthropic';
import type { AIProvider } from './types';
import { ProviderError } from './errors';

/** Builds the provider for the current settings, or null when no key is set. */
export function createProvider(id: ProviderId, settings: Settings, key = getKey(id)): AIProvider | null {
  if (!key && id !== 'custom') return null;
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider(key!);
    default:
      void settings;
      throw new ProviderError('bad-request', 'This provider is not available yet.');
  }
}
