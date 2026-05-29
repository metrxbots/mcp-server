/**
 * Model Pricing Data
 *
 * Static pricing reference for LLM models across providers.
 * Used by compare_models (optimization.ts) and cost-leak-detector.ts
 * for client-side model comparisons and cross-provider arbitrage checks.
 *
 * Prices are in USD per 1M tokens, reconciled against the gateway pricing table
 * (agentledger apps/gateway/src/cost.ts — verified against provider pricing pages
 * as of May 2026). Update this file when providers change pricing or when the
 * gateway table changes.
 *
 * Providers covered: openai, anthropic, google, xai, mistral, cohere
 */

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'cohere';
export type ModelTier = 'frontier' | 'balanced' | 'efficient' | 'budget';

export interface ModelPricingEntry {
  model: string;
  provider: ModelProvider;
  tier: ModelTier;
  /** USD per 1M input tokens */
  input_cost_per_1m: number;
  /** USD per 1M output tokens (0 for embedding-only models) */
  output_cost_per_1m: number;
  /** Maximum context window in tokens */
  context_window: number;
  supports_batch: boolean;
  supports_caching: boolean;
}

/**
 * Canonical model pricing map.
 * Keys are the canonical model identifiers.
 * Use getModelPricing() for alias-aware lookups.
 */
export const MODEL_PRICING: Record<string, ModelPricingEntry> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-4o': {
    model: 'gpt-4o',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 10.0,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 10.0,
    output_cost_per_1m: 30.0,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: false,
  },
  'gpt-3.5-turbo': {
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    tier: 'budget',
    input_cost_per_1m: 0.5,
    output_cost_per_1m: 1.5,
    context_window: 16_385,
    supports_batch: true,
    supports_caching: false,
  },
  'gpt-4': {
    model: 'gpt-4',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 30.0,
    output_cost_per_1m: 60.0,
    context_window: 8_192,
    supports_batch: true,
    supports_caching: false,
  },
  'gpt-5.2': {
    model: 'gpt-5.2',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 1.75,
    output_cost_per_1m: 14.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  o1: {
    model: 'o1',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 15.0,
    output_cost_per_1m: 60.0,
    context_window: 200_000,
    supports_batch: false,
    supports_caching: false,
  },
  'o1-mini': {
    model: 'o1-mini',
    provider: 'openai',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 12.0,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
  'o3-mini': {
    model: 'o3-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 1.1,
    output_cost_per_1m: 4.4,
    context_window: 200_000,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 15.0,
    output_cost_per_1m: 75.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-3-5-sonnet-20241022': {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-3-5-haiku-20241022': {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    tier: 'efficient',
    input_cost_per_1m: 0.8,
    output_cost_per_1m: 4.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-3-haiku-20240307': {
    model: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    tier: 'budget',
    input_cost_per_1m: 0.25,
    output_cost_per_1m: 1.25,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },

  'claude-sonnet-4-20250514': {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  // Anthropic — current generation (May 2026, verified via gateway cost.ts).
  'claude-opus-4-7': {
    model: 'claude-opus-4-7',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 25.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4-6': {
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 25.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-4-6': {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-haiku-4-5': {
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    tier: 'efficient',
    input_cost_per_1m: 1.0,
    output_cost_per_1m: 5.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4': {
    model: 'claude-opus-4',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 15.0,
    output_cost_per_1m: 75.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-haiku-4': {
    model: 'claude-haiku-4',
    provider: 'anthropic',
    tier: 'budget',
    input_cost_per_1m: 0.25,
    output_cost_per_1m: 1.25,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },

  // ── Google ───────────────────────────────────────────────────────────────────
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    provider: 'google',
    tier: 'frontier',
    // Updated May 2026: Google cut pricing to $1.25 / $3.75 per 1M (gateway cost.ts).
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 3.75,
    context_window: 2_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    provider: 'google',
    tier: 'efficient',
    input_cost_per_1m: 0.075,
    output_cost_per_1m: 0.3,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-1.5-flash-8b': {
    model: 'gemini-1.5-flash-8b',
    provider: 'google',
    tier: 'budget',
    input_cost_per_1m: 0.0375,
    output_cost_per_1m: 0.15,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-2.0-flash': {
    model: 'gemini-2.0-flash',
    provider: 'google',
    tier: 'efficient',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.4,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-2.0-pro': {
    model: 'gemini-2.0-pro',
    provider: 'google',
    tier: 'frontier',
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 5.0,
    context_window: 2_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-2.5-pro': {
    model: 'gemini-2.5-pro',
    provider: 'google',
    tier: 'frontier',
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 10.0,
    context_window: 2_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-2.5-flash': {
    model: 'gemini-2.5-flash',
    provider: 'google',
    tier: 'efficient',
    input_cost_per_1m: 0.3,
    output_cost_per_1m: 2.5,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-2.5-flash-lite': {
    model: 'gemini-2.5-flash-lite',
    provider: 'google',
    tier: 'budget',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.4,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },

  // ── xAI (Grok) ───────────────────────────────────────────────────────────────
  'grok-2': {
    model: 'grok-2',
    provider: 'xai',
    tier: 'balanced',
    input_cost_per_1m: 2.0,
    output_cost_per_1m: 10.0,
    context_window: 131_072,
    supports_batch: false,
    supports_caching: false,
  },
  'grok-2-mini': {
    model: 'grok-2-mini',
    provider: 'xai',
    tier: 'efficient',
    input_cost_per_1m: 0.5,
    output_cost_per_1m: 2.5,
    context_window: 131_072,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Mistral ──────────────────────────────────────────────────────────────────
  'mistral-large': {
    model: 'mistral-large',
    provider: 'mistral',
    tier: 'frontier',
    input_cost_per_1m: 2.0,
    output_cost_per_1m: 6.0,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
  'mistral-medium': {
    model: 'mistral-medium',
    provider: 'mistral',
    tier: 'balanced',
    input_cost_per_1m: 2.75,
    output_cost_per_1m: 8.1,
    context_window: 32_000,
    supports_batch: false,
    supports_caching: false,
  },
  'mistral-small': {
    model: 'mistral-small',
    provider: 'mistral',
    tier: 'efficient',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.3,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
  'codestral': {
    model: 'codestral',
    provider: 'mistral',
    tier: 'efficient',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.3,
    context_window: 32_000,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Cohere ───────────────────────────────────────────────────────────────────
  'command-r-plus': {
    model: 'command-r-plus',
    provider: 'cohere',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 10.0,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
  'command-r': {
    model: 'command-r',
    provider: 'cohere',
    tier: 'balanced',
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
  /**
   * Embedding-only model — output_cost_per_1m is 0.
   * context_window is max tokens per embedding input (not a generative context window).
   */
  'embed-english-v3': {
    model: 'embed-english-v3',
    provider: 'cohere',
    tier: 'budget',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.0,
    context_window: 512,
    supports_batch: true,
    supports_caching: false,
  },
};

/**
 * Alias map for normalizing provider-versioned model names.
 * e.g. "mistral-large-latest" → "mistral-large"
 */
const MODEL_ALIASES: Record<string, string> = {
  // OpenAI aliases
  'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-2024-08-06': 'gpt-4o',
  'gpt-4o-2024-05-13': 'gpt-4o',
  'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  // Anthropic aliases
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  'claude-3-haiku': 'claude-3-haiku-20240307',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  // Anthropic 4.x / 4.5 / 4.6 / 4.7 aliases — match the gateway cost table model IDs.
  'claude-opus-4-7-20260301': 'claude-opus-4-7',
  'claude-opus-4-6-20260101': 'claude-opus-4-6',
  'claude-sonnet-4-6-20260101': 'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-haiku-4-20251001': 'claude-haiku-4',
  // xAI Grok aliases
  'grok-2-latest': 'grok-2',
  'grok-2-mini-latest': 'grok-2-mini',
  // Google aliases
  'gemini-pro': 'gemini-1.5-pro',
  'gemini-flash': 'gemini-1.5-flash',
  // Mistral aliases (providers often append "-latest")
  'mistral-large-latest': 'mistral-large',
  'mistral-large-2411': 'mistral-large',
  'mistral-medium-latest': 'mistral-medium',
  'mistral-small-latest': 'mistral-small',
  'mistral-small-2501': 'mistral-small',
  'codestral-latest': 'codestral',
  'codestral-2405': 'codestral',
  // Cohere aliases
  'command-r-plus-08-2024': 'command-r-plus',
  'command-r-08-2024': 'command-r',
  'embed-english-v3.0': 'embed-english-v3',
};

/**
 * Look up pricing for a model, resolving aliases automatically.
 * Returns undefined if the model is not found.
 *
 * @example
 * getModelPricing('mistral-large-latest') // resolves to mistral-large entry
 * getModelPricing('gpt-4o')               // direct lookup
 */
export function getModelPricing(modelName: string): ModelPricingEntry | undefined {
  const canonical = MODEL_ALIASES[modelName] ?? modelName;
  return MODEL_PRICING[canonical];
}

/**
 * Get all models for a given provider, sorted by input cost descending.
 */
export function getModelsByProvider(provider: ModelProvider): ModelPricingEntry[] {
  return Object.values(MODEL_PRICING)
    .filter((m) => m.provider === provider)
    .sort((a, b) => b.input_cost_per_1m - a.input_cost_per_1m);
}

/**
 * Get all models for a given tier, sorted by input cost ascending.
 */
export function getModelsByTier(tier: ModelTier): ModelPricingEntry[] {
  return Object.values(MODEL_PRICING)
    .filter((m) => m.tier === tier)
    .sort((a, b) => a.input_cost_per_1m - b.input_cost_per_1m);
}

/**
 * Get the list of all providers with at least one model entry.
 */
export function getCoveredProviders(): ModelProvider[] {
  return [...new Set(Object.values(MODEL_PRICING).map((m) => m.provider))].sort() as ModelProvider[];
}
