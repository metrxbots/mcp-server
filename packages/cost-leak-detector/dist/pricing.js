/**
 * Pricing table for common LLM models
 * Costs are per 1M tokens (input/output)
 * Data sourced from official provider pricing pages (March 2026)
 */
export const MODEL_PRICING = {
    // OpenAI
    'gpt-4-turbo': {
        inputTokenCost: 10,
        outputTokenCost: 30,
    },
    'gpt-4': {
        inputTokenCost: 30,
        outputTokenCost: 60,
    },
    'gpt-4-32k': {
        inputTokenCost: 60,
        outputTokenCost: 120,
    },
    'gpt-4o': {
        inputTokenCost: 5,
        outputTokenCost: 15,
    },
    'gpt-4o-mini': {
        inputTokenCost: 0.15,
        outputTokenCost: 0.6,
    },
    'gpt-3.5-turbo': {
        inputTokenCost: 0.5,
        outputTokenCost: 1.5,
    },
    // Anthropic
    'claude-3-opus': {
        inputTokenCost: 15,
        outputTokenCost: 75,
    },
    'claude-3-sonnet': {
        inputTokenCost: 3,
        outputTokenCost: 15,
    },
    'claude-3.5-sonnet': {
        inputTokenCost: 3,
        outputTokenCost: 15,
    },
    'claude-3-haiku': {
        inputTokenCost: 0.25,
        outputTokenCost: 1.25,
    },
    'claude-3.5-haiku': {
        inputTokenCost: 0.8,
        outputTokenCost: 4,
    },
    // Google
    'gemini-1.5-pro': {
        inputTokenCost: 3.5,
        outputTokenCost: 10.5,
    },
    'gemini-1.5-flash': {
        inputTokenCost: 0.075,
        outputTokenCost: 0.3,
    },
    'gemini-pro': {
        inputTokenCost: 0.5,
        outputTokenCost: 1.5,
    },
    // Meta
    'llama-3-70b': {
        inputTokenCost: 0.59,
        outputTokenCost: 0.79,
    },
    'llama-3-8b': {
        inputTokenCost: 0.075,
        outputTokenCost: 0.1,
    },
    'llama-2-70b': {
        inputTokenCost: 0.65,
        outputTokenCost: 0.8,
    },
    // Mistral
    'mistral-large': {
        inputTokenCost: 8,
        outputTokenCost: 24,
    },
    'mistral-medium': {
        inputTokenCost: 2.7,
        outputTokenCost: 8.1,
    },
    'mistral-small': {
        inputTokenCost: 0.14,
        outputTokenCost: 0.42,
    },
};
/**
 * Get pricing for a model, with fallback to a default if not found
 */
export function getPricing(modelName) {
    const normalized = modelName.toLowerCase();
    // Direct match
    if (MODEL_PRICING[normalized]) {
        return MODEL_PRICING[normalized];
    }
    // Fuzzy match for common variations
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return pricing;
        }
    }
    // Default fallback for unknown models (estimate as mid-tier)
    return {
        inputTokenCost: 1,
        outputTokenCost: 3,
    };
}
/**
 * Calculate cost for a span based on token counts and model
 */
export function calculateSpanCost(inputTokens, outputTokens, modelName) {
    const pricing = getPricing(modelName);
    const inputCost = (inputTokens / 1_000_000) * pricing.inputTokenCost;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputTokenCost;
    return inputCost + outputCost;
}
