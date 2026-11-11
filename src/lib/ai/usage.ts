import type { ProviderConfig } from '../../config/providers/types';
import { findModel } from '../../config/providers';
import type { UsageRecord } from '../types';
import { costOfRequest, type TokenUsage } from '../cost/pricing';

/** Turns the usage an API call reported into a priced record for the session. */
export function usageRecord(
  provider: ProviderConfig,
  role: UsageRecord['role'],
  model: string,
  usage: TokenUsage,
  t: number,
): UsageRecord {
  // Price at the model we asked for; if a provider-side fallback answered,
  // its id is looked up first.
  const info = findModel(provider, model);
  return { t, role, provider: provider.id, model, ...usage, costUsd: costOfRequest(info, usage) };
}
