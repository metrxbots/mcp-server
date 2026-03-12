/**
 * Format findings as JSON
 */
export function formatAsJson(report) {
    return JSON.stringify(report, null, 2);
}
/**
 * Format findings as ASCII table
 */
export function formatAsTable(report, ciMode = false) {
    const lines = [];
    const resetCode = ciMode ? '' : '\x1b[0m';
    // Header
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════════════════════════╗');
    lines.push('║                    METRX COST LEAK DETECTION REPORT                           ║');
    lines.push('╚════════════════════════════════════════════════════════════════════════════════╝');
    lines.push('');
    // Metrx Score
    const scoreColor = getScoreColor(report.score.grade, ciMode);
    lines.push(`METRX SCORE: ${scoreColor}${report.score.grade} (${report.score.value}/100) — ${report.score.label}${resetCode}`);
    lines.push('');
    // Summary
    lines.push('SUMMARY');
    lines.push('━'.repeat(80));
    lines.push(`Total Spans Analyzed:           ${report.totalSpans}`);
    lines.push(`Critical Issues:                ${report.summary.criticalIssues}`);
    lines.push(`High Priority Issues:           ${report.summary.highPriorityIssues}`);
    lines.push(`Estimated Monthly Waste:        $${report.summary.totalEstimatedMonthlyWaste.toFixed(2)}`);
    lines.push(`Report Generated:               ${new Date(report.analysisTimestamp).toLocaleString()}`);
    lines.push('');
    // Findings
    if (report.findings.length === 0) {
        lines.push('✓ No cost leaks detected! Your LLM spend looks healthy.');
    }
    else {
        lines.push('FINDINGS');
        lines.push('━'.repeat(80));
        for (let i = 0; i < report.findings.length; i++) {
            const finding = report.findings[i];
            const severityIcon = getSeverityIcon(finding.severity);
            const severityColor = getSeverityColor(finding.severity, ciMode);
            lines.push(`${i + 1}. [${severityColor}${severityIcon} ${finding.severity.toUpperCase()}${resetCode}] ${finding.checkName}`);
            lines.push('');
            lines.push(`   Finding:`);
            lines.push(`   ${wrapText(finding.finding, 75, '   ')}`);
            lines.push('');
            lines.push(`   Estimated Monthly Waste: $${finding.estimatedMonthlyWasteUsd.toFixed(2)}`);
            lines.push('');
            lines.push(`   Recommendation:`);
            lines.push(`   ${wrapText(finding.recommendation, 75, '   ')}`);
            lines.push('');
        }
    }
    // Footer
    lines.push('━'.repeat(80));
    lines.push('');
    lines.push('Ready to optimize? Visit metrxbot.com for real-time dashboards and ML-driven suggestions.');
    lines.push('');
    return lines.join('\n');
}
/**
 * Get color for Metrx Score grade
 */
function getScoreColor(grade, ciMode = false) {
    if (ciMode)
        return '';
    const colors = {
        A: '\x1b[32m', // Green
        B: '\x1b[36m', // Cyan
        C: '\x1b[33m', // Yellow
        D: '\x1b[33m', // Yellow
        F: '\x1b[31m', // Red
    };
    return colors[grade] || '';
}
/**
 * Get severity icon based on severity level
 */
function getSeverityIcon(severity) {
    const icons = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
    };
    return icons[severity] || '◯';
}
/**
 * Get ANSI color code for severity
 */
function getSeverityColor(severity, ciMode = false) {
    if (ciMode)
        return '';
    const colors = {
        critical: '\x1b[31m', // Red
        high: '\x1b[33m', // Yellow
        medium: '\x1b[36m', // Cyan
        low: '\x1b[32m', // Green
    };
    return colors[severity] || '';
}
/**
 * Wrap text to a maximum width
 */
function wrapText(text, maxWidth, indent = '') {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        if ((currentLine + word).length > maxWidth) {
            if (currentLine) {
                lines.push(indent + currentLine);
            }
            currentLine = word;
        }
        else {
            currentLine = currentLine ? currentLine + ' ' + word : word;
        }
    }
    if (currentLine) {
        lines.push(indent + currentLine);
    }
    return lines.join('\n');
}
/**
 * Format a single finding for compact output
 */
export function formatFinding(finding, _ciMode = false) {
    const severityIcon = getSeverityIcon(finding.severity);
    return `${severityIcon} [${finding.severity}] ${finding.checkName}: $${finding.estimatedMonthlyWasteUsd.toFixed(2)}/mo - ${finding.finding}`;
}
