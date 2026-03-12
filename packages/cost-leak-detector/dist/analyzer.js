import { calculateSpanCost } from './pricing.js';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
/**
 * Core cost analysis engine
 * Runs 7 local checks to identify cost leaks in LLM usage
 */
export class CostAnalyzer {
    spans;
    findings = [];
    constructor(spans) {
        this.spans = spans;
    }
    analyze() {
        this.findings = [];
        // Run all 7 checks
        this.checkIdleAgents();
        this.checkPremiumModelsForSimpleTasks();
        this.checkMissingResponseCaching();
        this.checkHighErrorRates();
        this.checkContextWindowOverflow();
        this.checkNoBudgetLimits();
        this.checkCrossProviderArbitrage();
        // Sort by severity and estimated waste
        this.findings.sort((a, b) => {
            const severityOrder = {
                critical: 0,
                high: 1,
                medium: 2,
                low: 3,
            };
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return b.estimatedMonthlyWasteUsd - a.estimatedMonthlyWasteUsd;
        });
        const criticalCount = this.findings.filter((f) => f.severity === 'critical').length;
        const highCount = this.findings.filter((f) => f.severity === 'high').length;
        const totalWaste = this.findings.reduce((sum, f) => sum + f.estimatedMonthlyWasteUsd, 0);
        const score = this.calculateScore();
        return {
            totalSpans: this.spans.length,
            analysisTimestamp: new Date().toISOString(),
            findings: this.findings,
            score,
            summary: {
                totalEstimatedMonthlyWaste: totalWaste,
                criticalIssues: criticalCount,
                highPriorityIssues: highCount,
            },
        };
    }
    /**
     * Calculate Metrx Score (0-100) based on findings
     */
    calculateScore() {
        let score = 100;
        for (const finding of this.findings) {
            switch (finding.severity) {
                case 'critical':
                    score -= 20;
                    break;
                case 'high':
                    score -= 15;
                    break;
                case 'medium':
                    score -= 8;
                    break;
                case 'low':
                    score -= 3;
                    break;
            }
        }
        // Clamp to 0-100
        score = Math.max(0, Math.min(100, score));
        let grade;
        let label;
        if (score >= 90) {
            grade = 'A';
            label = 'Excellent';
        }
        else if (score >= 80) {
            grade = 'B';
            label = 'Good';
        }
        else if (score >= 70) {
            grade = 'C';
            label = 'Needs Work';
        }
        else if (score >= 60) {
            grade = 'D';
            label = 'Poor';
        }
        else {
            grade = 'F';
            label = 'Critical';
        }
        return { value: score, grade, label };
    }
    /**
     * Check 1: Idle agents still running
     * Agents with 0 successful completions in last 24h
     */
    checkIdleAgents() {
        const now = Date.now();
        const oneDayAgo = now - ONE_DAY_MS;
        // Group spans by agent (use attributes.agent_id if available)
        const agentMap = new Map();
        for (const span of this.spans) {
            const agentId = span.attributes.agent_id || 'unknown-agent';
            if (!agentMap.has(agentId)) {
                agentMap.set(agentId, []);
            }
            agentMap.get(agentId).push(span);
        }
        for (const [agentId, agentSpans] of agentMap) {
            const recentSpans = agentSpans.filter((s) => s.startTime > oneDayAgo);
            if (recentSpans.length === 0)
                continue;
            const successfulSpans = recentSpans.filter((s) => s.status === 'ok');
            const totalCost = recentSpans.reduce((sum, s) => {
                const inputTokens = s.attributes.input_tokens || 0;
                const outputTokens = s.attributes.output_tokens || 0;
                const modelName = s.attributes.model || 'unknown';
                return sum + calculateSpanCost(inputTokens, outputTokens, modelName);
            }, 0);
            // If agent ran recently but had no successful completions
            if (recentSpans.length > 0 && successfulSpans.length === 0) {
                const monthlyWaste = totalCost * 30; // Extrapolate to monthly
                this.findings.push({
                    checkName: 'Idle Agents Running',
                    severity: 'high',
                    finding: `Agent "${agentId}" has been running for 24h with 0 successful completions. ${recentSpans.length} spans detected, all failed.`,
                    estimatedMonthlyWasteUsd: monthlyWaste,
                    recommendation: `Review agent "${agentId}" configuration. Kill the agent if no longer needed, or debug why it's consistently failing.`,
                });
            }
        }
    }
    /**
     * Check 2: Premium models for simple tasks
     * GPT-4 or Claude 3 Opus for responses < 100 tokens
     */
    checkPremiumModelsForSimpleTasks() {
        const premiumPatterns = [/^gpt-4(?!o)/, /^gpt-4-32k/, /claude-3-opus/];
        const wastedSpans = [];
        for (const span of this.spans) {
            const model = (span.attributes.model || '').toLowerCase();
            const outputTokens = span.attributes.output_tokens || 0;
            // Check if using premium model with simple output (excludes gpt-4o variants)
            const isPremium = premiumPatterns.some((p) => p.test(model));
            if (isPremium && outputTokens < 100 && outputTokens > 0) {
                wastedSpans.push(span);
            }
        }
        if (wastedSpans.length > 0) {
            const totalWaste = wastedSpans.reduce((sum, s) => {
                const inputTokens = s.attributes.input_tokens || 0;
                const outputTokens = s.attributes.output_tokens || 0;
                const modelName = s.attributes.model || 'gpt-4';
                return sum + calculateSpanCost(inputTokens, outputTokens, modelName);
            }, 0);
            const monthlyWaste = totalWaste * 30;
            this.findings.push({
                checkName: 'Premium Models for Simple Tasks',
                severity: 'high',
                finding: `${wastedSpans.length} API calls used premium models (GPT-4/Claude 3 Opus) for simple tasks (<100 token responses).`,
                estimatedMonthlyWasteUsd: monthlyWaste,
                recommendation: 'Route simple responses to gpt-4o-mini or Claude 3 Haiku. Use model routing based on task complexity.',
            });
        }
    }
    /**
     * Check 3: Missing response caching
     * Identical prompts within 1 hour
     */
    checkMissingResponseCaching() {
        const promptMap = new Map();
        let cachedOpportunities = 0;
        let savedTokens = 0;
        for (const span of this.spans) {
            const prompt = span.attributes.prompt || '';
            if (!prompt)
                continue;
            if (!promptMap.has(prompt)) {
                promptMap.set(prompt, []);
            }
            promptMap.get(prompt).push(span);
        }
        for (const [_prompt, spans] of promptMap) {
            // Sort by time
            spans.sort((a, b) => a.startTime - b.startTime);
            // Find duplicates within 1 hour
            for (let i = 0; i < spans.length; i++) {
                for (let j = i + 1; j < spans.length; j++) {
                    const timeDiff = spans[j].startTime - spans[i].startTime;
                    if (timeDiff < ONE_HOUR_MS) {
                        cachedOpportunities++;
                        savedTokens += spans[j].attributes.output_tokens || 0;
                    }
                }
            }
        }
        if (cachedOpportunities > 0) {
            // Estimate cost of re-running same prompt (use average output price)
            const monthlyWaste = (savedTokens / 1_000_000) * 15 * 30; // Assume average 15/1M output cost
            this.findings.push({
                checkName: 'Missing Response Caching',
                severity: 'medium',
                finding: `${cachedOpportunities} identical prompts detected within 1-hour windows. ${savedTokens.toLocaleString()} output tokens could have been cached.`,
                estimatedMonthlyWasteUsd: monthlyWaste,
                recommendation: 'Implement prompt caching (Anthropic) or response memoization. Check for repeated queries in your system.',
            });
        }
    }
    /**
     * Check 4: High error rates
     * >10% errors = wasted spend
     */
    checkHighErrorRates() {
        const totalSpans = this.spans.length;
        const errorSpans = this.spans.filter((s) => s.status === 'error');
        const errorRate = totalSpans > 0 ? errorSpans.length / totalSpans : 0;
        if (errorRate > 0.1) {
            const wastedCost = errorSpans.reduce((sum, s) => {
                const inputTokens = s.attributes.input_tokens || 0;
                const outputTokens = s.attributes.output_tokens || 0;
                const modelName = s.attributes.model || 'unknown';
                return sum + calculateSpanCost(inputTokens, outputTokens, modelName);
            }, 0);
            const monthlyWaste = wastedCost * 30;
            const percentError = Math.round(errorRate * 100);
            this.findings.push({
                checkName: 'High Error Rates',
                severity: 'critical',
                finding: `${percentError}% of API calls failed (${errorSpans.length}/${totalSpans}). Each error wastes input tokens with no output.`,
                estimatedMonthlyWasteUsd: monthlyWaste,
                recommendation: 'Investigate root causes: invalid inputs, rate limits, malformed requests. Add input validation and error recovery.',
            });
        }
    }
    /**
     * Check 5: Context window overflow
     * >60% context window regularly utilized
     */
    checkContextWindowOverflow() {
        const contextSpans = this.spans.filter((s) => {
            const contextUsage = s.attributes.context_usage_percent || 0;
            return contextUsage > 60;
        });
        if (contextSpans.length > 0) {
            const avgContextUsage = contextSpans.reduce((sum, s) => sum + (s.attributes.context_usage_percent || 0), 0) / contextSpans.length;
            const wastedCost = contextSpans.reduce((sum, s) => {
                const inputTokens = s.attributes.input_tokens || 0;
                const outputTokens = s.attributes.output_tokens || 0;
                const modelName = s.attributes.model || 'unknown';
                return sum + calculateSpanCost(inputTokens, outputTokens, modelName);
            }, 0);
            const monthlyWaste = wastedCost * 30;
            this.findings.push({
                checkName: 'Context Window Overflow Risk',
                severity: 'medium',
                finding: `${contextSpans.length} spans using >60% context window (avg: ${avgContextUsage.toFixed(1)}%). Risk of hitting limits and context pruning.`,
                estimatedMonthlyWasteUsd: monthlyWaste,
                recommendation: 'Switch to models with larger context windows (Gemini 1.5, Claude 3.5) or implement chunking/RAG to reduce input size.',
            });
        }
    }
    /**
     * Check 6: No budget limits set
     * Generic detection based on lack of budget attributes
     */
    checkNoBudgetLimits() {
        const spansWithoutBudget = this.spans.filter((s) => !s.attributes.budget_limit_usd);
        if (spansWithoutBudget.length === this.spans.length && this.spans.length > 0) {
            this.findings.push({
                checkName: 'No Budget Limits Set',
                severity: 'medium',
                finding: 'No budget limits detected in any spans. Running without cost controls.',
                estimatedMonthlyWasteUsd: 0, // Preventive, not a direct waste
                recommendation: 'Set per-agent, per-project, and global budget limits. Use API quotas to prevent runaway costs.',
            });
        }
    }
    /**
     * Check 7: Cross-provider arbitrage opportunities
     * Same task run on different providers with different costs
     */
    checkCrossProviderArbitrage() {
        const taskMap = new Map();
        // Group by task (use prompt similarity as task identifier)
        for (const span of this.spans) {
            const prompt = span.attributes.prompt || '';
            if (!prompt)
                continue;
            // Simplified: use first 100 chars as task key
            const taskKey = prompt.substring(0, 100);
            if (!taskMap.has(taskKey)) {
                taskMap.set(taskKey, []);
            }
            taskMap.get(taskKey).push(span);
        }
        let arbitrageOpportunities = 0;
        let potentialSavings = 0;
        for (const [, taskSpans] of taskMap) {
            // Look for same task with different models/providers
            const modelGroups = new Map();
            for (const span of taskSpans) {
                const model = span.attributes.model || 'unknown';
                if (!modelGroups.has(model)) {
                    modelGroups.set(model, []);
                }
                modelGroups.get(model).push(span);
            }
            // If same task on 2+ models, check cost difference
            if (modelGroups.size > 1) {
                const models = Array.from(modelGroups.entries());
                for (let i = 0; i < models.length; i++) {
                    for (let j = i + 1; j < models.length; j++) {
                        const [model1, spans1] = models[i];
                        const [model2, spans2] = models[j];
                        const cost1 = spans1.reduce((sum, s) => {
                            const inputTokens = s.attributes.input_tokens || 0;
                            const outputTokens = s.attributes.output_tokens || 0;
                            return sum + calculateSpanCost(inputTokens, outputTokens, model1);
                        }, 0);
                        const cost2 = spans2.reduce((sum, s) => {
                            const inputTokens = s.attributes.input_tokens || 0;
                            const outputTokens = s.attributes.output_tokens || 0;
                            return sum + calculateSpanCost(inputTokens, outputTokens, model2);
                        }, 0);
                        // If one is significantly cheaper
                        if (cost1 > 0 && cost2 > 0) {
                            const priceDiff = Math.abs(cost1 - cost2) / Math.max(cost1, cost2);
                            if (priceDiff > 0.3) {
                                // >30% price difference
                                arbitrageOpportunities++;
                                potentialSavings += Math.abs(cost1 - cost2);
                            }
                        }
                    }
                }
            }
        }
        if (arbitrageOpportunities > 0) {
            const monthlyWaste = potentialSavings * 30;
            this.findings.push({
                checkName: 'Cross-Provider Arbitrage Opportunity',
                severity: 'low',
                finding: `${arbitrageOpportunities} tasks running on multiple providers with >30% cost variance. Could consolidate to cheaper option.`,
                estimatedMonthlyWasteUsd: monthlyWaste,
                recommendation: 'Consolidate to the cheapest provider for each task type. Use model routing based on cost/performance profile.',
            });
        }
    }
}
/**
 * Main entry point for cost analysis
 */
export function analyzeCosts(spans) {
    const analyzer = new CostAnalyzer(spans);
    return analyzer.analyze();
}
