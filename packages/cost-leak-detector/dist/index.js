import * as fs from 'fs';
import * as path from 'path';
import { analyzeCosts } from './analyzer.js';
/**
 * Parse OpenTelemetry JSON export format
 */
export function parseOtelExport(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        // Handle OTEL trace format
        const spans = [];
        // Support both direct span arrays and wrapped format
        const spanList = Array.isArray(data) ? data : data.spans || data.resourceSpans || [];
        for (const spanData of spanList) {
            // Handle nested OTEL resourceSpans structure
            if (spanData.resourceSpans) {
                for (const resourceSpan of spanData.resourceSpans) {
                    for (const scopeSpan of resourceSpan.scopeSpans || []) {
                        for (const span of scopeSpan.spans || []) {
                            spans.push(normalizeOtelSpan(span));
                        }
                    }
                }
            }
            else if (spanData.scopeSpans) {
                for (const scopeSpan of spanData.scopeSpans) {
                    for (const span of scopeSpan.spans || []) {
                        spans.push(normalizeOtelSpan(span));
                    }
                }
            }
            else {
                // Direct span format
                spans.push(normalizeOtelSpan(spanData));
            }
        }
        return spans;
    }
    catch (error) {
        throw new Error(`Failed to parse OTEL export: ${error.message}`);
    }
}
/**
 * Normalize OTEL span to internal Span format
 */
function normalizeOtelSpan(otelSpan) {
    const attributes = {};
    // Extract attributes
    if (otelSpan.attributes) {
        for (const [key, value] of Object.entries(otelSpan.attributes)) {
            attributes[key] = value;
        }
    }
    // Map common OTEL attributes
    if (!attributes.model && otelSpan.attributes?.['llm.model']) {
        attributes.model = otelSpan.attributes['llm.model'];
    }
    if (!attributes.input_tokens && otelSpan.attributes?.['llm.input_tokens']) {
        attributes.input_tokens = otelSpan.attributes['llm.input_tokens'];
    }
    if (!attributes.output_tokens && otelSpan.attributes?.['llm.output_tokens']) {
        attributes.output_tokens = otelSpan.attributes['llm.output_tokens'];
    }
    return {
        traceId: otelSpan.traceId || otelSpan.trace_id || 'unknown',
        spanId: otelSpan.spanId || otelSpan.span_id || 'unknown',
        parentSpanId: otelSpan.parentSpanId || otelSpan.parent_span_id,
        name: otelSpan.name || 'unknown',
        startTime: otelSpan.startTimeUnixNano
            ? Math.floor(otelSpan.startTimeUnixNano / 1_000_000)
            : Date.now(),
        endTime: otelSpan.endTimeUnixNano
            ? Math.floor(otelSpan.endTimeUnixNano / 1_000_000)
            : Date.now(),
        attributes,
        status: ['ok', 'error', 'unset'].includes(String(otelSpan.status?.code || 'unset').toLowerCase())
            ? String(otelSpan.status?.code || 'unset').toLowerCase()
            : 'unset',
    };
}
/**
 * Parse CSV log format
 * Expected columns: timestamp, model, input_tokens, output_tokens, status, etc.
 */
export function parseCsvLog(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.trim().split('\n');
        if (lines.length < 2) {
            return [];
        }
        // Parse header
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const spans = [];
        // Parse rows
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v) => v.trim());
            const record = {};
            for (let j = 0; j < headers.length; j++) {
                const key = headers[j];
                const value = values[j];
                // Try to parse as number
                if (!isNaN(Number(value)) && value !== '') {
                    record[key] = Number(value);
                }
                else {
                    record[key] = value;
                }
            }
            // Convert CSV record to Span
            const span = {
                traceId: (record.trace_id || record.traceId || `trace-${i}`),
                spanId: (record.span_id || record.spanId || `span-${i}`),
                parentSpanId: (record.parent_span_id || record.parentSpanId),
                name: (record.operation || record.name || 'llm_call'),
                startTime: parseTimestamp(record.timestamp),
                endTime: parseTimestamp(record.timestamp),
                attributes: {
                    model: record.model,
                    input_tokens: record.input_tokens,
                    output_tokens: record.output_tokens,
                    agent_id: record.agent_id,
                    budget_limit_usd: record.budget_limit_usd,
                    context_usage_percent: record.context_usage_percent,
                    prompt: record.prompt,
                },
                status: ['ok', 'error', 'unset'].includes(String(record.status))
                    ? String(record.status)
                    : 'ok',
            };
            spans.push(span);
        }
        return spans;
    }
    catch (error) {
        throw new Error(`Failed to parse CSV log: ${error.message}`);
    }
}
/**
 * Parse timestamp from string or number
 */
function parseTimestamp(value) {
    if (!value)
        return Date.now();
    if (typeof value === 'number') {
        // Assume milliseconds if > 1 billion, seconds otherwise
        return value > 1_000_000_000 ? value : value * 1000;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
}
/**
 * Main export: analyze costs from a file
 */
export async function analyzeCostsFromFile(filePath, format = 'auto') {
    // Determine format
    let detectedFormat = format;
    if (format === 'auto') {
        const ext = path.extname(filePath).toLowerCase();
        detectedFormat = ext === '.csv' ? 'csv' : 'otel';
    }
    let spans;
    if (detectedFormat === 'csv') {
        spans = parseCsvLog(filePath);
    }
    else {
        spans = parseOtelExport(filePath);
    }
    return analyzeCosts(spans);
}
// Re-export analyzer and types
export { analyzeCosts } from './analyzer.js';
export { getPricing, calculateSpanCost } from './pricing.js';
export { formatAsJson, formatAsTable, formatFinding } from './formatters.js';
