/**
 * AI-powered log summarization and pattern detection
 */

import { AIClient, AIConfig } from './ai-client';
import { LogEntry } from '@tracer/core';

export interface LogSummary {
  summary: string;
  patterns: Array<{
    pattern: string;
    count: number;
    severity: 'info' | 'warning' | 'error';
    examples: string[];
  }>;
  insights: string[];
  recommendations: string[];
}

/**
 * @deprecated Use ObservabilityAIAgent instead
 */
export class LogSummarizer {
  private aiClient: AIClient;

  constructor(aiConfig: AIConfig) {
    this.aiClient = new AIClient(aiConfig);
  }

  /**
   * Summarize a collection of logs
   */
  async summarizeLogs(logs: LogEntry[], timeWindow?: { start: Date; end: Date }): Promise<LogSummary> {
    if (logs.length === 0) {
      return {
        summary: 'No logs to summarize',
        patterns: [],
        insights: [],
        recommendations: [],
      };
    }

    // Group logs by level
    const byLevel = {
      error: logs.filter(l => l.level === 'error' || l.level === 'fatal'),
      warn: logs.filter(l => l.level === 'warn'),
      info: logs.filter(l => l.level === 'info'),
      debug: logs.filter(l => l.level === 'debug'),
    };

    // Build context
    const context = this.buildLogContext(logs, byLevel, timeWindow);

    const systemPrompt = `You are an expert observability engineer analyzing application logs.
Summarize the logs, identify patterns, provide insights, and actionable recommendations.
Be concise and specific.`;

    const prompt = `Analyze and summarize these logs:

${context}

Provide a JSON response with:
- summary: Brief overall summary (2-3 sentences)
- patterns: Array of patterns with {pattern, count, severity, examples}
- insights: Array of 3-5 key insights
- recommendations: Array of 3-5 actionable recommendations`;

    try {
      // TODO: Update to use AI SDK streamText instead of direct LLM calls
      // For now, return fallback summary
      console.warn('LogSummarizer.summarizeLogs: Using fallback summary. Consider using ObservabilityAIAgent instead.');
      return this.fallbackSummary(logs, byLevel);
      
      /* Legacy code - needs update to AI SDK
      const response = await this.llm.call(prompt, systemPrompt);
      return this.parseSummaryResponse(response.content, byLevel);
      */
    } catch (error) {
      console.error('Log summarization failed:', error);
      return this.fallbackSummary(logs, byLevel);
    }
  }

  private buildLogContext(
    logs: LogEntry[],
    byLevel: Record<string, LogEntry[]>,
    timeWindow?: { start: Date; end: Date }
  ): string {
    let context = `Total logs: ${logs.length}\n`;
    if (timeWindow) {
      context += `Time window: ${timeWindow.start.toISOString()} to ${timeWindow.end.toISOString()}\n`;
    }
    context += `\nBreakdown:\n`;
    context += `  - Errors: ${byLevel.error.length}\n`;
    context += `  - Warnings: ${byLevel.warn.length}\n`;
    context += `  - Info: ${byLevel.info.length}\n`;
    context += `  - Debug: ${byLevel.debug.length}\n\n`;

    // Group by service
    const byService = new Map<string, number>();
    logs.forEach(log => {
      byService.set(log.service, (byService.get(log.service) || 0) + 1);
    });

    context += `Services:\n`;
    Array.from(byService.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([service, count]) => {
        context += `  - ${service}: ${count} logs\n`;
      });

    context += `\nSample Error Logs:\n`;
    byLevel.error.slice(0, 10).forEach(log => {
      context += `  - [${log.service}] ${log.message}\n`;
      if (log.metadata) {
        const meta = Object.entries(log.metadata).slice(0, 2);
        meta.forEach(([key, value]) => {
          context += `    ${key}: ${value}\n`;
        });
      }
    });

    context += `\nSample Warning Logs:\n`;
    byLevel.warn.slice(0, 5).forEach(log => {
      context += `  - [${log.service}] ${log.message}\n`;
    });

    return context;
  }

  private parseSummaryResponse(content: string, byLevel: Record<string, LogEntry[]>): LogSummary {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Log analysis completed',
          patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
          insights: Array.isArray(parsed.insights) ? parsed.insights : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        };
      } catch (e) {
        // Fall through
      }
    }

    return this.fallbackSummary(
      Object.values(byLevel).flat(),
      byLevel
    );
  }

  private fallbackSummary(logs: LogEntry[], byLevel: Record<string, LogEntry[]>): LogSummary {
    const errorCount = byLevel.error.length;
    const warnCount = byLevel.warn.length;
    const services = new Set(logs.map(l => l.service));

    const patterns: LogSummary['patterns'] = [];

    if (errorCount > 0) {
      // Find common error patterns
      const errorMessages = byLevel.error.map(l => l.message.substring(0, 80));
      const patternCounts = new Map<string, number>();
      errorMessages.forEach(msg => {
        patternCounts.set(msg, (patternCounts.get(msg) || 0) + 1);
      });

      Array.from(patternCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([pattern, count]) => {
          patterns.push({
            pattern,
            count,
            severity: 'error',
            examples: byLevel.error
              .filter(l => l.message.startsWith(pattern))
              .slice(0, 3)
              .map(l => l.message),
          });
        });
    }

    return {
      summary: `Analyzed ${logs.length} logs from ${services.size} service(s). Found ${errorCount} errors and ${warnCount} warnings.`,
      patterns,
      insights: [
        errorCount > 0 ? `${errorCount} error(s) detected` : 'No errors found',
        `Logs from ${services.size} service(s)`,
      ],
      recommendations: [
        errorCount > 0 ? 'Investigate error patterns above' : 'System appears healthy',
        'Monitor for recurring patterns',
      ],
    };
  }
}

