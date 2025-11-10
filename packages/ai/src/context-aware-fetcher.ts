/**
 * Context-aware data fetching for AI analysis
 * Fetches related data instead of just recent data
 */

import { TraceRepository, LogRepository, AlertRepository } from '@tracer/db';

export interface RelatedDataContext {
  traceId?: string;
  spanId?: string;
  service?: string;
  errorPattern?: string;
  timeWindow?: { start: Date; end: Date };
}

export class ContextAwareFetcher {
  constructor(
    private traceRepository: TraceRepository,
    private logRepository: LogRepository,
    private alertRepository: AlertRepository
  ) {}

  /**
   * Fetch logs related to a trace
   */
  async getRelatedLogsForTrace(traceId: string, limit: number = 50): Promise<any[]> {
    const logs = await this.logRepository.getByTraceId(traceId, limit);
    return await logs;
  }

  /**
   * Fetch traces related to an error pattern or service
   */
  async getRelatedTracesForError(
    service: string,
    errorPattern: string,
    timeWindow: { start: Date; end: Date },
    limit: number = 10
  ): Promise<any[]> {
    // Find traces with errors in the same service and time window
    const traces = await this.traceRepository.searchTraces({
      service,
      hasErrors: true,
      startTime: timeWindow.start,
      endTime: timeWindow.end,
      limit,
    });
    return await traces;
  }

  /**
   * Fetch logs related to an alert (same service, same time window, similar errors)
   */
  async getRelatedDataForAlert(
    alertId: number,
    limit: number = 20
  ): Promise<{
    alert: any;
    relatedLogs: any[];
    relatedTraces: any[];
  }> {
    const alerts = await this.alertRepository.getActiveAlerts();
    const alertsArray = await alerts;
    const alert = alertsArray.find((a: any) => a.id === alertId);

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    // Get time window around when alert was created
    const alertTime = new Date(alert.createdAt);
    const start = new Date(alertTime.getTime() - 30 * 60 * 1000); // 30 minutes before
    const end = new Date(alertTime.getTime() + 30 * 60 * 1000); // 30 minutes after

    // Fetch related logs for the service
    const relatedLogs = await this.logRepository.queryByTimeRange(
      start,
      end,
      alert.service,
      limit
    );
    const logsArray = await relatedLogs;

    // Filter logs by error level if it's an error spike alert
    const errorLogs = alert.alertType === 'error_spike'
      ? logsArray.filter((l: any) => l.level === 'error' || l.level === 'fatal')
      : logsArray;

    // Fetch related traces with errors
    const relatedTraces = await this.traceRepository.searchTraces({
      service: alert.service,
      hasErrors: true,
      startTime: start,
      endTime: end,
      limit: 10,
    });
    const tracesArray = await relatedTraces;

    return {
      alert,
      relatedLogs: errorLogs.slice(0, limit),
      relatedTraces: await tracesArray,
    };
  }

  /**
   * Fetch related traces for a service (same service, similar error patterns)
   */
  async getRelatedTracesForService(
    service: string,
    timeWindow: { start: Date; end: Date },
    hasErrors: boolean = false,
    limit: number = 10
  ): Promise<any[]> {
    const traces = await this.traceRepository.searchTraces({
      service,
      hasErrors: hasErrors ? true : undefined,
      startTime: timeWindow.start,
      endTime: timeWindow.end,
      limit,
    });
    return await traces;
  }

  /**
   * Fetch logs grouped by trace (related logs for each trace)
   */
  async getLogsGroupedByTrace(
    service: string,
    timeWindow: { start: Date; end: Date },
    level?: string,
    limit: number = 50
  ): Promise<Map<string, any[]>> {
    const logs = await this.logRepository.queryByTimeRange(
      timeWindow.start,
      timeWindow.end,
      service,
      limit * 2 // Fetch more to group
    );
    const logsArray = await logs;

    const filtered = level
      ? logsArray.filter((l: any) => l.level === level)
      : logsArray;

    // Group by traceId
    const grouped = new Map<string, any[]>();
    for (const log of filtered) {
      const traceId = log.traceId || 'no-trace';
      if (!grouped.has(traceId)) {
        grouped.set(traceId, []);
      }
      grouped.get(traceId)!.push(log);
    }

    // Limit to top traces by log count
    const sorted = Array.from(grouped.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit);

    return new Map(sorted);
  }

  /**
   * Fetch related data for error analysis (logs + traces with similar errors)
   */
  async getRelatedDataForErrorAnalysis(
    service: string,
    errorMessage: string,
    timeWindow: { start: Date; end: Date },
    limit: number = 20
  ): Promise<{
    errorLogs: any[];
    relatedTraces: any[];
    errorPattern: string;
  }> {
    // Fetch error logs for the service
    const logs = await this.logRepository.queryByTimeRange(
      timeWindow.start,
      timeWindow.end,
      service,
      limit * 2
    );
    const logsArray = await logs;

    // Filter error logs and find similar error messages
    const errorLogs = logsArray.filter(
      (l: any) => l.level === 'error' || l.level === 'fatal'
    );

    // Extract error pattern (first 50 chars of error message)
    const errorPattern = errorMessage.substring(0, 50);

    // Find logs with similar error patterns
    const similarErrorLogs = errorLogs.filter((l: any) =>
      l.message.toLowerCase().includes(errorPattern.toLowerCase().substring(0, 20))
    );

    // Get trace IDs from error logs
    const traceIds = new Set(
      similarErrorLogs
        .map((l: any) => l.traceId)
        .filter((id: any) => id !== null && id !== undefined)
    );

    // Fetch related traces
    const relatedTraces: any[] = [];
    for (const traceId of Array.from(traceIds).slice(0, 10)) {
      const trace = await this.traceRepository.getByTraceId(traceId);
      if (trace) {
        relatedTraces.push(trace);
      }
    }

    return {
      errorLogs: similarErrorLogs.slice(0, limit),
      relatedTraces,
      errorPattern,
    };
  }
}


