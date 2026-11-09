/**
 * Model Pricing Data
 *
 * Static pricing reference for LLM models across providers.
 * Used by cost-leak-detector.ts
 * for client-side model comparisons and cross-provider arbitrage checks.
 *
 * NOTE: Model pricing is also defined in:
 *   - packages/optimization/src/model-data.ts (SOURCE OF TRUTH)
 *   - apps/web/lib/model-pricing.ts (client-side calculator, subset of models)
 * This file is a separate copy because the MCP server cannot import from the web app.
 * When prices change, update model-data.ts first, then sync here.
 *
 * Prices are in USD per 1M tokens.
 * Last updated: 2026-07-16 (synced with packages/optimization/src/model-data.ts).
 * The 2026-07-16 refresh re-verified Anthropic + Google against live pricing
 * pages (unchanged) and carried the other providers forward from the May-2026
 * gateway verification; no price values changed. See model-data.ts for the
 * full verification log.
 *
 * Providers covered: openai, anthropic, google, xai, meta, mistral, deepseek, amazon, cohere
 */

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'meta'
  | 'mistral'
  | 'deepseek'
  | 'amazon'
  | 'cohere';
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
  // ── OpenAI (current generation, verified 2026-07-16) ─────────────────────────
  'gpt-5.6-sol': {
    model: 'gpt-5.6-sol',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 30.0,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.6-terra': {
    model: 'gpt-5.6-terra',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 15.0,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.6-luna': {
    model: 'gpt-5.6-luna',
    provider: 'openai',
    tier: 'balanced',
    input_cost_per_1m: 1.0,
    output_cost_per_1m: 6.0,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.5': {
    model: 'gpt-5.5',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 30.0,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.4': {
    model: 'gpt-5.4',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 15.0,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.4-mini': {
    model: 'gpt-5.4-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 0.75,
    output_cost_per_1m: 4.5,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.4-nano': {
    model: 'gpt-5.4-nano',
    provider: 'openai',
    tier: 'budget',
    input_cost_per_1m: 0.2,
    output_cost_per_1m: 1.25,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  // ── OpenAI (prior generation, kept for historical comparison) ────────────────
  'gpt-5.2': {
    model: 'gpt-5.2',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 1.75,
    output_cost_per_1m: 14.0,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 0.25,
    output_cost_per_1m: 2.0,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5-nano': {
    model: 'gpt-5-nano',
    provider: 'openai',
    tier: 'budget',
    input_cost_per_1m: 0.05,
    output_cost_per_1m: 0.4,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-4.1': {
    model: 'gpt-4.1',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2.0,
    output_cost_per_1m: 8.0,
    context_window: 1_048_576,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-4.1-mini': {
    model: 'gpt-4.1-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 0.4,
    output_cost_per_1m: 1.6,
    context_window: 1_048_576,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-4.1-nano': {
    model: 'gpt-4.1-nano',
    provider: 'openai',
    tier: 'budget',
    input_cost_per_1m: 0.1,
    output_cost_per_1m: 0.4,
    context_window: 1_048_576,
    supports_batch: true,
    supports_caching: true,
  },
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
  o3: {
    model: 'o3',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 10.0,
    output_cost_per_1m: 40.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: false,
  },
  'o3-mini': {
    model: 'o3-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 1.1,
    output_cost_per_1m: 4.4,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: false,
  },
  'o4-mini': {
    model: 'o4-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 1.1,
    output_cost_per_1m: 4.4,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: false,
  },

  // ── Anthropic (current generation, verified 2026-07-16) ──────────────────────
  'claude-fable-5': {
    model: 'claude-fable-5',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 10.0,
    output_cost_per_1m: 50.0,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.8': {
    model: 'claude-opus-4.8',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 25.0,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.7': {
    model: 'claude-opus-4.7',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 25.0,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-5': {
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  // ── Anthropic (prior generation) ─────────────────────────────────────────────
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
  'claude-opus-4.5': {
    model: 'claude-opus-4.5',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5.0,
    output_cost_per_1m: 25.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-4': {
    model: 'claude-sonnet-4',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-4.5': {
    model: 'claude-sonnet-4.5',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
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
  'claude-haiku-4.5': {
    model: 'claude-haiku-4.5',
    provider: 'anthropic',
    tier: 'efficient',
    input_cost_per_1m: 1.0,
    output_cost_per_1m: 5.0,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },

  // ── Google ───────────────────────────────────────────────────────────────────
  'gemini-2.5-pro': {
    model: 'gemini-2.5-pro',
    provider: 'google',
    tier: 'frontier',
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 10.0,
    context_window: 1_000_000,
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
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    provider: 'google',
    tier: 'frontier',
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 3.75,
    context_window: 2_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    provider: 'google',
    tier: 'budget',
    input_cost_per_1m: 0.07,
    output_cost_per_1m: 0.3,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },

  // ── xAI (current generation, verified 2026-07-16) ────────────────────────────
  'grok-4.5': {
    model: 'grok-4.5',
    provider: 'xai',
    tier: 'frontier',
    input_cost_per_1m: 2.0,
    output_cost_per_1m: 6.0,
    context_window: 500_000,
    supports_batch: false,
    supports_caching: true,
  },
  'grok-4.3': {
    model: 'grok-4.3',
    provider: 'xai',
    tier: 'frontier',
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 2.5,
    context_window: 1_000_000,
    supports_batch: false,
    supports_caching: true,
  },
  'grok-4.1-fast': {
    model: 'grok-4.1-fast',
    provider: 'xai',
    tier: 'efficient',
    input_cost_per_1m: 0.2,
    output_cost_per_1m: 0.5,
    context_window: 2_000_000,
    supports_batch: false,
    supports_caching: true,
  },
  // ── xAI (prior generation) ───────────────────────────────────────────────────
  'grok-3': {
    model: 'grok-3',
    provider: 'xai',
    tier: 'frontier',
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    context_window: 131_072,
    supports_batch: false,
    supports_caching: false,
  },
  'grok-3-mini': {
    model: 'grok-3-mini',
    provider: 'xai',
    tier: 'efficient',
    input_cost_per_1m: 0.3,
    output_cost_per_1m: 0.5,
    context_window: 131_072,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Mistral ──────────────────────────────────────────────────────────────────
  'mistral-medium-3.5': {
    model: 'mistral-medium-3.5',
    provider: 'mistral',
    tier: 'balanced',
    input_cost_per_1m: 1.5,
    output_cost_per_1m: 7.5,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: false,
  },
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
  'mistral-small-3.1': {
    model: 'mistral-small-3.1',
    provider: 'mistral',
    tier: 'efficient',
    input_cost_per_1m: 0.35,
    output_cost_per_1m: 0.56,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },

  // ── DeepSeek (current generation, verified 2026-07-16) ───────────────────────
  'deepseek-v4-flash': {
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    tier: 'efficient',
    input_cost_per_1m: 0.14,
    output_cost_per_1m: 0.28,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: true,
  },
  'deepseek-v4-pro': {
    model: 'deepseek-v4-pro',
    provider: 'deepseek',
    tier: 'balanced',
    input_cost_per_1m: 0.435,
    output_cost_per_1m: 0.87,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: true,
  },
  // ── DeepSeek (prior generation) ──────────────────────────────────────────────
  'deepseek-v3': {
    model: 'deepseek-v3',
    provider: 'deepseek',
    tier: 'efficient',
    input_cost_per_1m: 0.14,
    output_cost_per_1m: 0.28,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: true,
  },
  'deepseek-r1': {
    model: 'deepseek-r1',
    provider: 'deepseek',
    tier: 'balanced',
    input_cost_per_1m: 0.55,
    output_cost_per_1m: 2.19,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: true,
  },

  // ── Meta Llama ───────────────────────────────────────────────────────────────
  'llama-4-scout': {
    model: 'llama-4-scout',
    provider: 'meta',
    tier: 'efficient',
    input_cost_per_1m: 0.08,
    output_cost_per_1m: 0.3,
    context_window: 512_000,
    supports_batch: false,
    supports_caching: false,
  },
  'llama-4-maverick': {
    model: 'llama-4-maverick',
    provider: 'meta',
    tier: 'balanced',
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    context_window: 1_048_576,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Amazon Nova ──────────────────────────────────────────────────────────────
  'amazon-nova-pro': {
    model: 'amazon-nova-pro',
    provider: 'amazon',
    tier: 'balanced',
    input_cost_per_1m: 0.8,
    output_cost_per_1m: 3.2,
    context_window: 300_000,
    supports_batch: false,
    supports_caching: false,
  },

  // ── Cohere ───────────────────────────────────────────────────────────────────
  'command-a': {
    model: 'command-a',
    provider: 'cohere',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 10.0,
    context_window: 256_000,
    supports_batch: false,
    supports_caching: false,
  },
  'command-r7b': {
    model: 'command-r7b',
    provider: 'cohere',
    tier: 'budget',
    input_cost_per_1m: 0.0375,
    output_cost_per_1m: 0.15,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
  },
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
  'gpt-4-turbo-preview': 'gpt-4.1',
  'gpt-4-turbo-2024-04-09': 'gpt-4.1',
  'gpt-4-turbo': 'gpt-4.1',
  'gpt-3.5-turbo': 'gpt-5-nano',
  // Anthropic aliases
  'claude-3-opus-20240229': 'claude-opus-4',
  'claude-3-opus': 'claude-opus-4',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4',
  'claude-3-5-sonnet': 'claude-sonnet-4',
  'claude-3-5-haiku-20241022': 'claude-haiku-4.5',
  'claude-3-5-haiku': 'claude-haiku-4.5',
  'claude-3-haiku-20240307': 'claude-haiku-4',
  'claude-3-haiku': 'claude-haiku-4',
  'claude-sonnet-4-20250514': 'claude-sonnet-4',
  'claude-opus-4-8': 'claude-opus-4.8',
  'claude-opus-4-7': 'claude-opus-4.7',
  'claude-opus-4-6': 'claude-opus-4.5',
  'claude-sonnet-4-6': 'claude-sonnet-4.5',
  // Google aliases
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash-8b': 'gemini-1.5-flash',
  // Mistral aliases
  'mistral-large-latest': 'mistral-large',
  'mistral-large-2411': 'mistral-large',
  'mistral-medium': 'mistral-large',
  'mistral-medium-latest': 'mistral-large',
  'mistral-small': 'mistral-small-3.1',
  'mistral-small-latest': 'mistral-small-3.1',
  'mistral-small-2501': 'mistral-small-3.1',
  codestral: 'mistral-small-3.1',
  'codestral-latest': 'mistral-small-3.1',
  'codestral-2405': 'mistral-small-3.1',
  // Cohere aliases
  'command-r-plus-08-2024': 'command-r-plus',
  'command-r-08-2024': 'command-r',
  'embed-english-v3.0': 'command-r',
  'embed-english-v3': 'command-r',
  // xAI aliases
  'grok-4-5': 'grok-4.5',
  'grok-4-3': 'grok-4.3',
  'grok-4-1-fast': 'grok-4.1-fast',
  'grok-2': 'grok-3',
  'grok-2-mini': 'grok-3-mini',
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
  return [
    ...new Set(Object.values(MODEL_PRICING).map((m) => m.provider)),
  ].sort() as ModelProvider[];
}
