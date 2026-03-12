import { CostAnalysisReport, Finding } from './types.js';
/**
 * Format findings as JSON
 */
export declare function formatAsJson(report: CostAnalysisReport): string;
/**
 * Format findings as ASCII table
 */
export declare function formatAsTable(report: CostAnalysisReport, ciMode?: boolean): string;
/**
 * Format a single finding for compact output
 */
export declare function formatFinding(finding: Finding, _ciMode?: boolean): string;
