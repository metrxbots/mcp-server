#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import { analyzeCostsFromFile, formatAsJson, formatAsTable } from './index.js';
const program = new Command();
program.name('metrx-leak-detect').description('Local-only LLM cost leak detector').version('0.1.0');
/**
 * SCAN command: analyze a real input file
 */
program
    .command('scan')
    .description('Scan OTEL spans or proxy logs for cost leaks')
    .requiredOption('--input <file>', 'Path to OTEL JSON export or CSV log file')
    .option('--format <format>', 'Input format: otel, csv, or auto (default: auto)', 'auto')
    .option('--output <file>', 'Output file path (optional; defaults to stdout)')
    .option('--output-format <format>', 'Output format: json or table (default: table)', 'table')
    .option('--ci', 'Clean output for CI/CD pipelines (no ANSI color codes)')
    .option('--threshold <amount>', 'Exit with code 1 if estimated monthly waste exceeds this USD amount', parseFloat)
    .action(async (options) => {
    try {
        // Check if input file exists
        if (!fs.existsSync(options.input)) {
            console.error(`Error: Input file not found: ${options.input}`);
            process.exit(1);
        }
        console.error(`Analyzing ${options.input}...`);
        const report = await analyzeCostsFromFile(options.input, options.format);
        const ciMode = !!options.ci;
        let output = options.outputFormat === 'json' ? formatAsJson(report) : formatAsTable(report, ciMode);
        if (options.output) {
            fs.writeFileSync(options.output, output, 'utf-8');
            console.error(`✓ Report written to ${options.output}`);
        }
        else {
            console.log(output);
        }
        // CI threshold gate
        if (options.threshold !== undefined &&
            report.summary.totalEstimatedMonthlyWaste > options.threshold) {
            console.error(`\nFAIL: Estimated monthly waste $${report.summary.totalEstimatedMonthlyWaste.toFixed(2)} exceeds threshold $${options.threshold.toFixed(2)}`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
/**
 * DEMO command: run analysis on built-in sample data
 */
program
    .command('demo')
    .description('Run analysis on sample data to see what the tool does')
    .option('--output-format <format>', 'Output format: json or table (default: table)', 'table')
    .option('--ci', 'Clean output for CI/CD pipelines (no ANSI color codes)')
    .action(async (options) => {
    try {
        console.error('Running demo analysis on sample data...\n');
        // Generate sample spans for demonstration
        const sampleSpans = generateDemoData();
        const { analyzeCosts } = await import('./analyzer.js');
        const report = analyzeCosts(sampleSpans);
        const ciMode = !!options.ci;
        let output = options.outputFormat === 'json' ? formatAsJson(report) : formatAsTable(report, ciMode);
        console.log(output);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
});
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
/**
 * Generate realistic sample data for demo
 */
function generateDemoData() {
    const now = Date.now();
    const _oneDay = 24 * 60 * 60 * 1000;
    const spans = [];
    // Scenario 1: Idle agent with many failures
    for (let i = 0; i < 15; i++) {
        spans.push({
            traceId: `demo-idle-${i}`,
            spanId: `span-idle-${i}`,
            name: 'llm_call',
            startTime: now - i * 1000,
            endTime: now - i * 1000 + 2000,
            attributes: {
                agent_id: 'agent-idle-001',
                model: 'gpt-4',
                input_tokens: 500,
                output_tokens: i % 3 === 0 ? 0 : 50, // Some with no output
            },
            status: i % 2 === 0 ? 'error' : 'ok',
        });
    }
    // Scenario 2: Premium model for simple tasks
    for (let i = 0; i < 10; i++) {
        spans.push({
            traceId: `demo-premium-${i}`,
            spanId: `span-premium-${i}`,
            name: 'llm_call',
            startTime: now - 1000 - i * 500,
            endTime: now - 1000 - i * 500 + 1500,
            attributes: {
                agent_id: 'agent-main-001',
                model: 'gpt-4',
                input_tokens: 200,
                output_tokens: 50, // Simple response using expensive model
            },
            status: 'ok',
        });
    }
    // Scenario 3: Identical prompts within 1 hour
    const identicalPrompt = 'What is the capital of France?';
    for (let i = 0; i < 5; i++) {
        spans.push({
            traceId: `demo-cache-${i}`,
            spanId: `span-cache-${i}`,
            name: 'llm_call',
            startTime: now - 2000 - i * 600,
            endTime: now - 2000 - i * 600 + 1200,
            attributes: {
                agent_id: 'agent-qa-001',
                model: 'gpt-4o-mini',
                input_tokens: 100,
                output_tokens: 30,
                prompt: identicalPrompt,
            },
            status: 'ok',
        });
    }
    // Scenario 4: High error rate
    for (let i = 0; i < 20; i++) {
        spans.push({
            traceId: `demo-errors-${i}`,
            spanId: `span-errors-${i}`,
            name: 'llm_call',
            startTime: now - 3000 - i * 300,
            endTime: now - 3000 - i * 300 + 800,
            attributes: {
                agent_id: 'agent-api-001',
                model: 'claude-3-opus',
                input_tokens: 1000,
                output_tokens: i % 3 === 0 ? 500 : 0,
            },
            status: i % 3 < 2 ? 'error' : 'ok', // 70% error rate
        });
    }
    // Scenario 5: High context utilization
    for (let i = 0; i < 8; i++) {
        spans.push({
            traceId: `demo-context-${i}`,
            spanId: `span-context-${i}`,
            name: 'llm_call',
            startTime: now - 4000 - i * 400,
            endTime: now - 4000 - i * 400 + 1200,
            attributes: {
                agent_id: 'agent-rag-001',
                model: 'gpt-4',
                input_tokens: 8000, // Large context
                output_tokens: 200,
                context_usage_percent: 75,
            },
            status: 'ok',
        });
    }
    // Scenario 6: Cross-provider arbitrage
    // Same task on different providers
    const arbitragePrompt = 'Summarize the following document...';
    spans.push({
        traceId: 'demo-arb-gpt4',
        spanId: 'span-arb-gpt4',
        name: 'llm_call',
        startTime: now - 5000,
        endTime: now - 5000 + 1500,
        attributes: {
            agent_id: 'agent-summary-001',
            model: 'gpt-4',
            input_tokens: 3000,
            output_tokens: 500,
            prompt: arbitragePrompt,
        },
        status: 'ok',
    });
    spans.push({
        traceId: 'demo-arb-claude',
        spanId: 'span-arb-claude',
        name: 'llm_call',
        startTime: now - 5500,
        endTime: now - 5500 + 1600,
        attributes: {
            agent_id: 'agent-summary-002',
            model: 'claude-3.5-haiku',
            input_tokens: 3000,
            output_tokens: 500,
            prompt: arbitragePrompt,
        },
        status: 'ok',
    });
    // Scenario 7: No budget limits
    // All spans above already lack budget_limit_usd
    return spans;
}
