import { ModelPricing } from './types.js';
/**
 * Pricing table for common LLM models
 * Costs are per 1M tokens (input/output)
 * Data sourced from official provider pricing pages (March 2026)
 */
export declare const MODEL_PRICING: Record<string, ModelPricing>;
/**
 * Get pricing for a model, with fallback to a default if not found
 */
export declare function getPricing(modelName: string): ModelPricing;
/**
 * Calculate cost for a span based on token counts and model
 */
export declare function calculateSpanCost(inputTokens: number, outputTokens: number, modelName: string): number;
