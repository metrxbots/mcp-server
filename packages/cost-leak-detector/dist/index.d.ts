import { Span, CostAnalysisReport } from './types.js';
/**
 * Parse OpenTelemetry JSON export format
 */
export declare function parseOtelExport(filePath: string): Span[];
/**
 * Parse CSV log format
 * Expected columns: timestamp, model, input_tokens, output_tokens, status, etc.
 */
export declare function parseCsvLog(filePath: string): Span[];
/**
 * Main export: analyze costs from a file
 */
export declare function analyzeCostsFromFile(filePath: string, format?: 'auto' | 'otel' | 'csv'): Promise<CostAnalysisReport>;
export { analyzeCosts } from './analyzer.js';
export type { Span, CostAnalysisReport, Finding, ModelPricing, MetrxScore } from './types.js';
export { getPricing, calculateSpanCost } from './pricing.js';
export { formatAsJson, formatAsTable, formatFinding } from './formatters.js';
