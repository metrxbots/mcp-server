export interface SpanAttribute {
    [key: string]: string | number | boolean | undefined;
}
export interface Span {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime: number;
    attributes: SpanAttribute;
    status?: 'ok' | 'error' | 'unset';
}
export interface ModelPricing {
    inputTokenCost: number;
    outputTokenCost: number;
}
export interface Finding {
    checkName: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    finding: string;
    estimatedMonthlyWasteUsd: number;
    recommendation: string;
}
export interface MetrxScore {
    value: number;
    grade: string;
    label: string;
}
export interface CostAnalysisReport {
    totalSpans: number;
    analysisTimestamp: string;
    findings: Finding[];
    score: MetrxScore;
    summary: {
        totalEstimatedMonthlyWaste: number;
        criticalIssues: number;
        highPriorityIssues: number;
    };
}
export interface CsvLogRecord {
    [key: string]: string | number | boolean;
}
