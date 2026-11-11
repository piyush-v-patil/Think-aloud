import type { ModelRole, ProviderId } from '../../lib/types';

/** USD per million tokens. */
export interface TokenPrices {
  input: number;
  output: number;
  /** Price of a cached input token read back. */
  cacheRead: number;
  /** Price of writing a token to the cache (short lifetime). Omit when writes cost the same as input. */
  cacheWrite?: number;
}

export interface PriceSchedule extends TokenPrices {
  /** ISO date this price takes effect. Omit for "always" (the base price). */
  from?: string;
  /** Different prices when a single request's input exceeds this many tokens. */
  longContext?: { aboveInputTokens: number } & TokenPrices;
}

export interface ModelInfo {
  id: string;
  label: string;
  tier: 'small' | 'mid' | 'top';
  /** Ordered oldest first; the latest one whose `from` has passed applies. */
  prices: PriceSchedule[];
  /** Effort hints by role. The provider adapter maps these to its own parameter. */
  notes?: string;
}

export type RoleModels = Record<ModelRole, string>;

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** Where the user gets a key. */
  keyUrl: string;
  pricingUrl: string;
  /** Date the prices below were checked against the provider's pricing page. */
  pricesCheckedOn: string;
  models: ModelInfo[];
  presets: { economy: RoleModels; balanced: RoleModels; best: RoleModels };
  /** Model used for the free-ish key check. */
  keyCheckModel: string;
  promptCaching: 'explicit' | 'automatic' | 'none';
}
