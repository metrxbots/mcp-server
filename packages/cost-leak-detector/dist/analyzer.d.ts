import { Span, CostAnalysisReport } from './types.js';
/**
 * Core cost analysis engine
 * Runs 7 local checks to identify cost leaks in LLM usage
 */
export declare class CostAnalyzer {
    private spans;
    private findings;
    constructor(spans: Span[]);
    analyze(): CostAnalysisReport;
    /**
     * Calculate Metrx Score (0-100) based on findings
     */
    private calculateScore;
    /**
     * Check 1: Idle agents still running
     * Agents with 0 successful completions in last 24h
     */
    private checkIdleAgents;
    /**
     * Check 2: Premium models for simple tasks
     * GPT-4 or Claude 3 Opus for responses < 100 tokens
     */
    private checkPremiumModelsForSimpleTasks;
    /**
     * Check 3: Missing response caching
     * Identical prompts within 1 hour
     */
    private checkMissingResponseCaching;
    /**
     * Check 4: High error rates
     * >10% errors = wasted spend
     */
    private checkHighErrorRates;
    /**
     * Check 5: Context window overflow
     * >60% context window regularly utilized
     */
    private checkContextWindowOverflow;
    /**
     * Check 6: No budget limits set
     * Generic detection based on lack of budget attributes
     */
    private checkNoBudgetLimits;
    /**
     * Check 7: Cross-provider arbitrage opportunities
     * Same task run on different providers with different costs
     */
    private checkCrossProviderArbitrage;
}
/**
 * Main entry point for cost analysis
 */
export declare function analyzeCosts(spans: Span[]): CostAnalysisReport;
