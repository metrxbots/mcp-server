/**
 * Model Pricing Data
 *
 * Static pricing reference for LLM models across providers.
 * Used by cost-leak-detector.ts
 * for client-side model comparisons and cross-provider arbitrage checks.
 *
 * SOURCE OF TRUTH (2026-11-25): the canonical catalog MODEL_PRICE_CATALOG in
 * @metrx/types (packages/types/src/model-price-catalog.ts), approved by CP in
 * docs/pricing/rate-approval-2026-11-25.md. This package is published to npm
 * and takes no workspace dependency, so the values are literal copies;
 * apps/web/tests/pricing/model-price-parity.test.ts fails if any input or
 * output rate drifts from the catalog. Change the catalog first, then here.
 *
 * Prices are in USD per 1M tokens. Last synced with the catalog: 2026-11-25
 * (gpt-5.6 family, o3, claude-sonnet-5, mistral-large, llama-4-scout,
 * DeepSeek V4 off-peak and gemini-1.5-flash corrected).
 *
 * Providers covered: openai, anthropic, google, xai, meta, mistral, deepseek, amazon, cohere
 */

export type ModelProvider =
  'openai' | 'anthropic' | 'google' | 'xai' | 'meta' | 'mistral' | 'deepseek' | 'amazon' | 'cohere';
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
  // ── OpenAI (current generation) ─────────────────────────
  'gpt-5.6-sol': {
    model: 'gpt-5.6-sol',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 4,
    output_cost_per_1m: 20,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.6-terra': {
    model: 'gpt-5.6-terra',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2,
    output_cost_per_1m: 12,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.6-luna': {
    model: 'gpt-5.6-luna',
    provider: 'openai',
    tier: 'balanced',
    input_cost_per_1m: 0.2,
    output_cost_per_1m: 1.2,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.5': {
    model: 'gpt-5.5',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 5,
    output_cost_per_1m: 30,
    context_window: 400_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5.4': {
    model: 'gpt-5.4',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 15,
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
    output_cost_per_1m: 14,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    provider: 'openai',
    tier: 'efficient',
    input_cost_per_1m: 0.25,
    output_cost_per_1m: 2,
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
    input_cost_per_1m: 2,
    output_cost_per_1m: 8,
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
    output_cost_per_1m: 10,
    context_window: 128_000,
    supports_batch: true,
    supports_caching: true,
  },
  // Addendum row (CP, 2026-11-25; docs/pricing/rate-approval-2026-11-25.md).
  // No cached-input price is published for it.
  'chatgpt-4o-latest': {
    model: 'chatgpt-4o-latest',
    provider: 'openai',
    tier: 'frontier',
    input_cost_per_1m: 5,
    output_cost_per_1m: 15,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: false,
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
    input_cost_per_1m: 2,
    output_cost_per_1m: 8,
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

  // ── Anthropic (current generation) ──────────────────────
  'claude-fable-5': {
    model: 'claude-fable-5',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 10,
    output_cost_per_1m: 50,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.8': {
    model: 'claude-opus-4.8',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5,
    output_cost_per_1m: 25,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.7': {
    model: 'claude-opus-4.7',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5,
    output_cost_per_1m: 25,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-5': {
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 2,
    output_cost_per_1m: 10,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },
  // ── Anthropic (prior generation) ─────────────────────────────────────────────
  'claude-opus-4': {
    model: 'claude-opus-4',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 15,
    output_cost_per_1m: 75,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.1': {
    model: 'claude-opus-4.1',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 15,
    output_cost_per_1m: 75,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-opus-4.5': {
    model: 'claude-opus-4.5',
    provider: 'anthropic',
    tier: 'frontier',
    input_cost_per_1m: 5,
    output_cost_per_1m: 25,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-4': {
    model: 'claude-sonnet-4',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3,
    output_cost_per_1m: 15,
    context_window: 200_000,
    supports_batch: true,
    supports_caching: true,
  },
  'claude-sonnet-4.5': {
    model: 'claude-sonnet-4.5',
    provider: 'anthropic',
    tier: 'balanced',
    input_cost_per_1m: 3,
    output_cost_per_1m: 15,
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
    input_cost_per_1m: 1,
    output_cost_per_1m: 5,
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
    output_cost_per_1m: 10,
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
    input_cost_per_1m: 0.075,
    output_cost_per_1m: 0.3,
    context_window: 1_000_000,
    supports_batch: true,
    supports_caching: true,
  },

  // ── xAI (current generation) ────────────────────────────
  'grok-4.5': {
    model: 'grok-4.5',
    provider: 'xai',
    tier: 'frontier',
    input_cost_per_1m: 2,
    output_cost_per_1m: 6,
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
    input_cost_per_1m: 3,
    output_cost_per_1m: 15,
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
    input_cost_per_1m: 0.5,
    output_cost_per_1m: 1.5,
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

  // ── DeepSeek (current generation) ───────────────────────
  'deepseek-v4-flash': {
    model: 'deepseek-v4-flash',
    provider: 'deepseek',
    tier: 'efficient',
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    context_window: 128_000,
    supports_batch: false,
    supports_caching: true,
  },
  'deepseek-v4-pro': {
    model: 'deepseek-v4-pro',
    provider: 'deepseek',
    tier: 'balanced',
    input_cost_per_1m: 0.66,
    output_cost_per_1m: 1.98,
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
    input_cost_per_1m: 0.1,
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
    output_cost_per_1m: 10,
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
    output_cost_per_1m: 10,
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

// ---------------------------------------------------------------------------
// Model id lookup: VERBATIM COPY of MODEL_PRICE_ALIASES,
// KNOWN_DIFFERENT_PRICE_SNAPSHOTS, the id-rewrite rules and
// modelPriceIdCandidatesFor from packages/types/src/model-price-catalog.ts.
// Same-model spellings only; an alias to a different model is a pricing bug.
// Held equal to the catalog by apps/web/tests/pricing/store-lookup-parity.test.ts.
// ---------------------------------------------------------------------------

/**
 * Spellings the generic normalization below cannot reach. Each alias names
 * the SAME model as its target (never a cheaper or newer sibling).
 */
export const MODEL_PRICE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'claude-3.5-sonnet': 'claude-3-5-sonnet',
  'claude-3.5-haiku': 'claude-3-5-haiku',
  // "-latest" pointers. Each names the model its provider documents it as
  // pointing at; a pointer that moves to a new model needs a new alias, never
  // a generic "-latest" strip.
  'claude-3-5-sonnet-latest': 'claude-3-5-sonnet',
  'claude-3-5-haiku-latest': 'claude-3-5-haiku',
  'claude-3-opus-latest': 'claude-3-opus',
  'gemini-1.5-flash-latest': 'gemini-1.5-flash',
  'gemini-1.5-pro-latest': 'gemini-1.5-pro',
  // GPT-4 Turbo previews. The generic "-preview" and "-MMDD" strips would
  // reach gpt-4 (a different, pricier model), so these are explicit.
  'gpt-4-1106-preview': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo',
  'gpt-4-turbo-preview': 'gpt-4-turbo',
  // Mistral's pointer to Large 3, the model the mistral-large row prices.
  'mistral-large-latest': 'mistral-large',
  // Cohere's 08-2024 releases; the command-r-plus and command-r rows carry
  // those releases' rates (the 04-2024 command-r-plus was priced higher).
  'command-r-plus-08-2024': 'command-r-plus',
  'command-r-08-2024': 'command-r',
});

/**
 * Snapshots the date strip would collapse onto a base row although OpenAI's
 * first-party pages publish no price for them, so their rate is not known to
 * be the base rate. Each resolves to unknown (0 plus "[pricing:unknown_model]")
 * unless a store carries an explicit row for it. Ruled by CP 2026-11-25, see
 * the addendum in docs/pricing/rate-approval-2026-11-25.md; snapshots the
 * pages show at the parent rate (gpt-4o-2024-05-13, gpt-3.5-turbo-1106) are
 * deliberately NOT listed and resolve to the parent.
 */
export const KNOWN_DIFFERENT_PRICE_SNAPSHOTS: readonly string[] = Object.freeze([
  'gpt-3.5-turbo-0301', // no first-party price
  'gpt-3.5-turbo-0613', // no first-party price
  'gpt-3.5-turbo-16k', // no first-party price
  'gpt-3.5-turbo-16k-0613', // no first-party price
]);

/**
 * Host prefixes that name the model's OWN vendor (or Google's "models/" REST
 * namespace), so dropping them keeps the price. Any other host prefix (groq/,
 * openrouter/, together/, fireworks/) serves the model at that host's price
 * and stays unknown unless aliased.
 */
export const SAME_PRICE_HOST_PREFIX = /^(?:openai|anthropic|google|models)\//;
/** Bedrock ids: optional region profile, then the vendor namespace. */
export const BEDROCK_VENDOR_PREFIX =
  /^(?:(?:us|eu|apac|global|us-gov|ca|jp|au)\.)?(?:anthropic|openai)\./;
/** Bedrock model version suffix (-v2:0). */
export const BEDROCK_VERSION_SUFFIX = /-v\d+:\d+$/;
/** Vertex release pin (@20250929). */
export const VERTEX_RELEASE_SUFFIX = /@\d{8}$/;

/**
 * Suffix strips that are safe ONLY when what remains is already a priced id:
 * Gemini build numbers (-001), OpenAI four-digit snapshots on gpt-* ids
 * (gpt-4-0613; not mistral-large-2411, a differently priced release), and
 * preview tags (-preview, -preview-05-20).
 */
export const CONDITIONAL_STRIPS: ReadonlyArray<(s: string) => string> = [
  (s) => s.replace(/-00\d$/, ''),
  (s) => (s.startsWith('gpt-') ? s.replace(/-\d{4}$/, '') : s),
  (s) => s.replace(/-preview(?:-\d\d-\d\d)?$/, ''),
];

/**
 * The lookup keys tried for a raw model id, in order, against a store whose
 * priced ids are `has`. Each step rewrites the spelling of the SAME model;
 * none drops a word that could name a different model, so a shorter model's
 * prefix is never reachable:
 *   1. lowercase and trim; a fine-tune (ft:<base>:...) instead tries
 *      ft:<spelling of base> for each spelling below and stops there
 *   2. drop a Bedrock region and vendor namespace and its -vN:N suffix
 *   3. drop a same-price host prefix (anthropic/claude-sonnet-4.6)
 *   4. drop a Vertex @YYYYMMDD pin; stop here when the id is a
 *      KNOWN_DIFFERENT_PRICE_SNAPSHOTS entry the store does not carry
 *   5. drop a trailing release date (-YYYYMMDD or -YYYY-MM-DD)
 *   6. dashed major-minor version to dotted (claude-haiku-4-5 to
 *      claude-haiku-4.5, grok-4-1-fast to grok-4.1-fast); a single-digit
 *      minor only, so llama-3-70b is left alone
 *      and stop here when the undated or dotted form is a
 *      KNOWN_DIFFERENT_PRICE_SNAPSHOTS entry the store does not carry
 *      (gpt-3-5-turbo-0613 is gpt-3.5-turbo-0613, never the parent)
 *   7. CONDITIONAL_STRIPS on the forms from 5 and 6, kept only when `has`
 *      says the remainder is priced
 *
 * VERBATIM COPY of the same function in packages/types/src/model-price-catalog.ts
 * (this package cannot import @metrx/types). Change it there and copy it here;
 * apps/web/tests/pricing/store-lookup-parity.test.ts fails on any drift.
 */
export function modelPriceIdCandidatesFor(raw: string, has: (id: string) => boolean): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  let s = (raw ?? '').trim().toLowerCase();
  push(s);
  if (s.startsWith('ft:')) {
    // A fine-tune (ft:<base>:<org>:<suffix>:<id>) is priced by its own ft:*
    // row, found through the base's same-model spellings. Never the base row.
    const base = s.slice(3).split(':')[0] ?? '';
    for (const c of modelPriceIdCandidatesFor(base, (id) => has(['ft', id].join(':')))) {
      for (const id of [c, MODEL_PRICE_ALIASES[c]]) {
        if (id && has(['ft', id].join(':'))) push(['ft', id].join(':'));
      }
    }
    return out;
  }
  if (BEDROCK_VENDOR_PREFIX.test(s))
    s = s.replace(BEDROCK_VENDOR_PREFIX, '').replace(BEDROCK_VERSION_SUFFIX, '');
  push(s);
  s = s.replace(SAME_PRICE_HOST_PREFIX, '');
  push(s);
  s = s.replace(VERTEX_RELEASE_SUFFIX, '');
  push(s);
  if (KNOWN_DIFFERENT_PRICE_SNAPSHOTS.includes(s) && !has(s)) return out;
  const undated = s.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  push(undated);
  const dotted = undated.replace(/(\d)-(\d)(?=$|-[a-z])/g, (_m, major: string, minor: string) =>
    [major, minor].join('.')
  );
  push(dotted);
  for (const id of [undated, dotted]) {
    if (KNOWN_DIFFERENT_PRICE_SNAPSHOTS.includes(id) && !has(id)) return out;
  }
  for (const base of [undated, dotted]) {
    for (const strip of CONDITIONAL_STRIPS) {
      const c = strip(base);
      if (c !== base && has(c)) push(c);
    }
  }
  return out;
}

const hasPricing = (id: string): boolean => id in MODEL_PRICING || id in MODEL_PRICE_ALIASES;

/**
 * Look up pricing for a model: exact id, then same-model spellings (dated,
 * dashed, Bedrock, Vertex and -latest forms; a fine-tune is unpriced). Never maps an id to
 * a different model. Returns undefined if the model is not priced.
 *
 * @example
 * getModelPricing('mistral-large-latest') // the mistral-large entry
 * getModelPricing('claude-sonnet-4-5-20250929') // the claude-sonnet-4.5 entry
 */
export function getModelPricing(modelName: string): ModelPricingEntry | undefined {
  for (const c of modelPriceIdCandidatesFor(modelName, hasPricing)) {
    if (MODEL_PRICING[c]) return MODEL_PRICING[c];
    const target = MODEL_PRICE_ALIASES[c];
    if (target) {
      for (const t of modelPriceIdCandidatesFor(target, hasPricing)) {
        if (MODEL_PRICING[t]) return MODEL_PRICING[t];
      }
    }
  }
  return undefined;
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
