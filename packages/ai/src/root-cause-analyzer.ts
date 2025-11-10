/**
 * AI-powered root cause analysis for traces and logs
 */

import { AIClient, AIConfig } from './ai-client';
import { LogEntry } from '@tracer/core';
import { TraceRepository, LogRepository } from '@tracer/db';

export interface RootCauseAnalysis {
  summary: string;
  likelyCause: string;
  confidence: 'low' | 'medium' | 'high';
  recommendations: string[];
  relatedSpans?: string[];
  relatedLogs?: number[];
}

export class RootCauseAnalyzer {
  private aiClient: AIClient;
  private traceRepository: TraceRepository;
  private logRepository: LogRepository;

  constructor(
    aiConfig: AIConfig,
    traceRepository: TraceRepository,
    logRepository: LogRepository
  ) {
    this.aiClient = new AIClient(aiConfig);
    this.traceRepository = traceRepository;
    this.logRepository = logRepository;
  }

  /**
   * Analyze a trace to find root cause
   */
  async analyzeTrace(traceId: string): Promise<RootCauseAnalysis> {
    // Get trace details
    const trace = await this.traceRepository.getByTraceId(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    // Get spans for this trace (already in trace object)
    const spansArray = trace.spans || [];

    // Get related logs
    const logs = await this.logRepository.getByTraceId(traceId, 50);
    const logsArray = await logs;

    // Build context for LLM
    const errorSpans = spansArray.filter((s: any) => s.status === 'error');
    const slowSpans = spansArray
      .filter((s: any) => s.duration && s.duration > 1000)
      .sort((a: any, b: any) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5);

    const errorLogs = logsArray.filter((l: any) => l.level === 'error' || l.level === 'fatal');

    const context = this.buildTraceContext({
      trace,
      spans: spansArray,
      errorSpans,
      slowSpans,
      errorLogs,
    });

    const systemPrompt = `You are an expert observability engineer analyzing distributed traces to find root causes of failures. 
Analyze the provided trace data and identify the most likely root cause, confidence level, and actionable recommendations.
Be concise and specific. Focus on the actual error patterns, not generic advice.`;

    const prompt = `Analyze this trace and identify the root cause:

${context}

Provide a JSON response with:
- summary: Brief summary of the issue
- likelyCause: The most likely root cause
- confidence: "low", "medium", or "high"
- recommendations: Array of 3-5 specific actionable recommendations`;

    try {
      // TODO: Update to use AI SDK streamText instead of direct LLM calls
      // For now, return fallback analysis
      console.warn('RootCauseAnalyzer.analyzeTrace: Using fallback analysis. Consider using ObservabilityAIAgent instead.');
      return this.fallbackAnalysis(errorSpans, errorLogs);
      
      /* Legacy code - needs update to AI SDK
      const response = await this.llm.call(prompt, systemPrompt);
      const analysis = this.parseAnalysisResponse(response.content);

      return {
        ...analysis,
        relatedSpans: errorSpans.map((s: any) => s.spanId),
        relatedLogs: errorLogs.map((l: any) => l.id),
      };
      */
    } catch (error) {
      console.error('Root cause analysis failed:', error);
      // Fallback to basic analysis
      return this.fallbackAnalysis(errorSpans, errorLogs);
    }
  }

  /**
   * Analyze error logs to find patterns
   */
  async analyzeErrorLogs(service: string, timeWindowMinutes: number = 60): Promise<RootCauseAnalysis> {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const logs = await this.logRepository.queryByTimeRange(since, new Date(), service, 100);
    const logsArray = await logs;
    const errorLogs = logsArray.filter(l => l.level === 'error' || l.level === 'fatal');

    if (errorLogs.length === 0) {
      throw new Error('No error logs found in the specified time window');
    }

    const context = this.buildLogContext(errorLogs);

    const systemPrompt = `You are an expert observability engineer analyzing error logs to find patterns and root causes.
Identify common patterns, error types, and provide actionable recommendations.`;

    const prompt = `Analyze these error logs and identify patterns:

${context}

Provide a JSON response with:
- summary: Brief summary of the error patterns
- likelyCause: The most likely root cause
- confidence: "low", "medium", or "high"
- recommendations: Array of 3-5 specific actionable recommendations`;

    try {
      // TODO: Update to use AI SDK streamText instead of direct LLM calls
      // For now, return fallback analysis
      console.warn('RootCauseAnalyzer.analyzeErrorLogs: Using fallback analysis. Consider using ObservabilityAIAgent instead.');
      return this.fallbackAnalysis([], errorLogs);
      
      /* Legacy code - needs update to AI SDK
      const response = await this.llm.call(prompt, systemPrompt);
      return this.parseAnalysisResponse(response.content);
      */
    } catch (error) {
      console.error('Error log analysis failed:', error);
      return this.fallbackAnalysis([], errorLogs);
    }
  }

  private buildTraceContext(data: {
    trace: any;
    spans: any[];
    errorSpans: any[];
    slowSpans: any[];
    errorLogs: any[];
  }): string {
    let context = `Trace ID: ${data.trace.traceId}\n`;
    context += `Service: ${data.trace.service}\n`;
    context += `Duration: ${data.trace.duration}ms\n`;
    context += `Error Count: ${data.trace.errorCount}\n`;
    context += `Total Spans: ${data.spans.length}\n\n`;

    if (data.errorSpans.length > 0) {
      context += `Error Spans:\n`;
      data.errorSpans.slice(0, 10).forEach(span => {
        context += `  - ${span.name} (${span.service}): ${span.status}\n`;
        if (span.attributes) {
          const attrs = Object.entries(span.attributes).slice(0, 5);
          attrs.forEach(([key, value]) => {
            context += `    ${key}: ${value}\n`;
          });
        }
      });
      context += '\n';
    }

    if (data.slowSpans.length > 0) {
      context += `Slow Spans:\n`;
      data.slowSpans.forEach(span => {
        context += `  - ${span.name} (${span.service}): ${span.duration}ms\n`;
      });
      context += '\n';
    }

    if (data.errorLogs.length > 0) {
      context += `Error Logs:\n`;
      data.errorLogs.slice(0, 10).forEach(log => {
        context += `  - [${log.level}] ${log.message}\n`;
        if (log.metadata) {
          const meta = Object.entries(log.metadata as any).slice(0, 3);
          meta.forEach(([key, value]) => {
            context += `    ${key}: ${value}\n`;
          });
        }
      });
    }

    return context;
  }

  private buildLogContext(logs: any[]): string {
    let context = `Found ${logs.length} error logs:\n\n`;

    // Group by error message pattern
    const errorPatterns = new Map<string, number>();
    logs.forEach(log => {
      const pattern = log.message.substring(0, 100); // First 100 chars as pattern
      errorPatterns.set(pattern, (errorPatterns.get(pattern) || 0) + 1);
    });

    context += `Error Patterns (top 10):\n`;
    Array.from(errorPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([pattern, count]) => {
        context += `  - (${count}x) ${pattern}\n`;
      });

    context += `\nSample Error Messages:\n`;
    logs.slice(0, 20).forEach(log => {
      context += `  - [${log.timestamp}] ${log.message}\n`;
      if (log.metadata) {
        const meta = Object.entries(log.metadata as any).slice(0, 2);
        meta.forEach(([key, value]) => {
          context += `    ${key}: ${value}\n`;
        });
      }
    });

    return context;
  }

  private parseAnalysisResponse(content: string): RootCauseAnalysis {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Analysis completed',
          likelyCause: parsed.likelyCause || 'Unknown',
          confidence: parsed.confidence || 'medium',
          recommendations: Array.isArray(parsed.recommendations) 
            ? parsed.recommendations 
            : ['Review logs and traces for more details'],
        };
      } catch (e) {
        // Fall through to text parsing
      }
    }

    // Fallback: parse from text
    return {
      summary: content.substring(0, 200),
      likelyCause: 'See summary',
      confidence: 'low',
      recommendations: ['Review the analysis summary above'],
    };
  }

  private fallbackAnalysis(errorSpans: any[], errorLogs: any[]): RootCauseAnalysis {
    const errorCount = errorSpans.length + errorLogs.length;
    const services = new Set([
      ...errorSpans.map(s => s.service),
      ...errorLogs.map(l => l.service),
    ]);

    return {
      summary: `Found ${errorCount} errors across ${services.size} service(s)`,
      likelyCause: errorSpans.length > 0 
        ? `Error in span: ${errorSpans[0]?.name || 'unknown'}`
        : `Error pattern: ${errorLogs[0]?.message?.substring(0, 100) || 'unknown'}`,
      confidence: 'low',
      recommendations: [
        'Review error spans and logs for details',
        'Check service dependencies',
        'Verify recent deployments',
      ],
    };
  }
}

