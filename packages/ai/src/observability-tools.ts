/**
 * Observability-specific AI tools
 * These tools allow AI agents to interact with the observability platform
 */

import { tool } from 'ai';
import { z } from 'zod';
import { TraceRepository, LogRepository, AlertRepository, MetricRepository } from '@tracer/db';
import { compressTraceData, compressLogData, compressLogs } from './context-compressor';
import { ContextAwareFetcher } from './context-aware-fetcher';

export interface ObservabilityToolsConfig {
  traceRepository: TraceRepository;
  logRepository: LogRepository;
  alertRepository: AlertRepository;
  metricRepository: MetricRepository;
}

/**
 * Create observability tools for AI agents
 */
export function createObservabilityTools(config: ObservabilityToolsConfig) {
  const { traceRepository, logRepository, alertRepository, metricRepository } = config;
  const contextFetcher = new ContextAwareFetcher(traceRepository, logRepository, alertRepository);

  return {
    /**
     * Analyze a trace for root cause
     */
    analyzeTrace: tool({
      description: 'Analyze a distributed trace to find the root cause of failures or performance issues. Use this when investigating errors or slow requests.',
      parameters: z.object({
        traceId: z.string().describe('The trace ID to analyze'),
      }),
      execute: async ({ traceId }: { traceId: string }): Promise<any> => {
        try {
          const trace = await traceRepository.getByTraceId(traceId);
          if (!trace) {
            return { error: `Trace ${traceId} not found` };
          }

          // Compress trace data to reduce token usage
          const compressedTrace = compressTraceData(trace, {
            maxStringLength: 200,
            maxArrayItems: 10,
            removeMetadata: false,
          });

          // Fetch related logs for this specific trace (not just recent logs)
          const relatedLogs = await contextFetcher.getRelatedLogsForTrace(traceId, 20);
          const errorLogs = relatedLogs.filter((l: any) => l.level === 'error' || l.level === 'fatal');

          // Fetch related traces (same service, similar time, similar errors) for context
          const traceTime = new Date(trace.startTime);
          const timeWindow = {
            start: new Date(traceTime.getTime() - 5 * 60 * 1000), // 5 min before
            end: new Date(traceTime.getTime() + 5 * 60 * 1000), // 5 min after
          };
          const relatedTraces = trace.errorCount > 0
            ? await contextFetcher.getRelatedTracesForService(
                trace.service,
                timeWindow,
                true, // has errors
                5 // limit to 5 related traces
              )
            : [];

          return {
            ...compressedTrace,
            errorLogs: compressLogs(errorLogs.slice(0, 10), {
              maxStringLength: 200,
              removeMetadata: true,
            }),
            relatedTracesCount: relatedTraces.length,
            relatedTraces: relatedTraces.slice(0, 3).map((t: any) => ({
              traceId: t.traceId,
              errorCount: t.errorCount,
              duration: t.duration,
            })),
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    } as any),

    /**
     * Search and analyze logs
     */
    searchLogs: tool({
      description: 'Search and analyze logs by service, time range, or log level. Use this to investigate errors, find patterns, or analyze log volume.',
      parameters: z.object({
        service: z.string().optional().describe('Filter by service name'),
        level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).optional().describe('Filter by log level'),
        startTime: z.string().optional().describe('Start time in ISO format'),
        endTime: z.string().optional().describe('End time in ISO format'),
        limit: z.number().int().min(1).max(100).optional().default(50).describe('Maximum number of logs to return'),
      }),
      execute: async ({ service, level, startTime, endTime, limit = 50 }: {
        service?: string;
        level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
        startTime?: string;
        endTime?: string;
        limit?: number;
      }): Promise<any> => {
        try {
          const start = startTime ? new Date(startTime) : new Date(Date.now() - 60 * 60 * 1000);
          const end = endTime ? new Date(endTime) : new Date();
          const timeWindow = { start, end };

          // Fetch related logs grouped by trace (context-aware)
          const queryLimit = Math.min(limit, 50);
          
          // If searching for errors, fetch related data (logs + traces)
          if (level === 'error' || level === 'fatal') {
            const logsGrouped = await contextFetcher.getLogsGroupedByTrace(
              service || '',
              timeWindow,
              level,
              queryLimit
            );

            // Get related traces for error context
            const relatedTraces = service
              ? await contextFetcher.getRelatedTracesForService(
                  service,
                  timeWindow,
                  true, // has errors
                  5
                )
              : [];

            // Flatten grouped logs
            const allLogs: any[] = [];
            for (const [traceId, traceLogs] of logsGrouped.entries()) {
              allLogs.push(...traceLogs.slice(0, 5)); // Max 5 logs per trace
            }

            const byLevel = {
              error: allLogs.filter((l: any) => l.level === 'error' || l.level === 'fatal').length,
              warn: 0,
              info: 0,
              debug: 0,
            };

            return {
              total: allLogs.length,
              byLevel,
              logs: compressLogs(allLogs.slice(0, 20), {
                maxStringLength: 200,
                maxArrayItems: 20,
                removeMetadata: true,
              }),
              relatedTracesCount: relatedTraces.length,
              groupedByTrace: logsGrouped.size,
            };
          }

          // For non-error searches, use standard query but still group by trace
          const logsGrouped = await contextFetcher.getLogsGroupedByTrace(
            service || '',
            timeWindow,
            level,
            queryLimit
          );

          const allLogs: any[] = [];
          for (const [, traceLogs] of logsGrouped.entries()) {
            allLogs.push(...traceLogs);
          }

          const filtered = level 
            ? allLogs.filter((l: any) => l.level === level)
            : allLogs;

          const byLevel = {
            error: filtered.filter((l: any) => l.level === 'error' || l.level === 'fatal').length,
            warn: filtered.filter((l: any) => l.level === 'warn').length,
            info: filtered.filter((l: any) => l.level === 'info').length,
            debug: filtered.filter((l: any) => l.level === 'debug').length,
          };

          return {
            total: filtered.length,
            byLevel,
            logs: compressLogs(filtered.slice(0, 20), {
              maxStringLength: 200,
              maxArrayItems: 20,
              removeMetadata: true,
            }),
            groupedByTrace: logsGrouped.size,
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    } as any),

    /**
     * Get active alerts
     */
    getActiveAlerts: tool({
      description: 'Get active (unresolved) alerts. Use this to check current system health, see what issues need attention, or monitor alert status.',
      parameters: z.object({
        service: z.string().optional().describe('Filter by service name'),
      }),
      execute: async ({ service }: { service?: string }): Promise<any> => {
        try {
          const alerts = await alertRepository.getActiveAlerts(service);
          const alertsArray = await alerts;

          // Limit alerts to reduce token usage
          const limitedAlerts = alertsArray.slice(0, 10); // Reduced to fetch related data

          // Fetch related data for each alert (logs + traces)
          const alertsWithContext = await Promise.all(
            limitedAlerts.map(async (alert: any) => {
              try {
                const relatedData = await contextFetcher.getRelatedDataForAlert(alert.id, 5);
                return {
                  id: alert.id,
                  alertType: alert.alertType,
                  severity: alert.severity,
                  message: alert.message.length > 200 ? alert.message.substring(0, 200) + '...' : alert.message,
                  service: alert.service,
                  createdAt: alert.createdAt,
                  relatedLogsCount: relatedData.relatedLogs.length,
                  relatedTracesCount: relatedData.relatedTraces.length,
                  // Include sample error logs if available
                  sampleErrorLogs: relatedData.relatedLogs
                    .filter((l: any) => l.level === 'error' || l.level === 'fatal')
                    .slice(0, 3)
                    .map((l: any) => ({
                      message: l.message.substring(0, 100),
                      timestamp: l.timestamp,
                    })),
                };
              } catch (error) {
                // If fetching related data fails, return alert without context
                return {
                  id: alert.id,
                  alertType: alert.alertType,
                  severity: alert.severity,
                  message: alert.message.length > 200 ? alert.message.substring(0, 200) + '...' : alert.message,
                  service: alert.service,
                  createdAt: alert.createdAt,
                };
              }
            })
          );

          return {
            count: alertsArray.length,
            shown: alertsWithContext.length,
            alerts: alertsWithContext,
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    } as any),

    /**
     * Get service metrics
     */
    getServiceMetrics: tool({
      description: 'Get metrics for a service (error rates, latency, throughput). Use this to check service health, performance trends, or compare services.',
      parameters: z.object({
        service: z.string().optional().describe('Service name (optional, returns all services if not provided)'),
        hours: z.number().int().min(1).max(168).optional().default(24).describe('Time window in hours'),
      }),
      execute: async ({ service, hours }: { service?: string; hours?: number }): Promise<any> => {
        try {
          const hoursValue = hours || 24;
          const since = new Date(Date.now() - hoursValue * 60 * 60 * 1000);
          // This would need to be implemented in MetricRepository
          // For now, return a placeholder
          return {
            service: service || 'all',
            timeWindow: hours,
            message: 'Metrics query - implementation needed in MetricRepository',
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    } as any),

    /**
     * Get service dependencies
     */
    getServiceDependencies: tool({
      description: 'Get service dependency graph showing how services interact. Use this to understand system architecture, find bottlenecks, or identify dependencies.',
      parameters: z.object({
        hours: z.number().int().min(1).max(168).optional().default(24).describe('Time window in hours'),
      }),
      execute: async ({ hours }: { hours?: number }): Promise<any> => {
        try {
          const dependencies = await traceRepository.getServiceDependencies(hours);
          // Limit to top dependencies to reduce token usage
          const topDependencies = dependencies
            .sort((a, b) => b.callCount - a.callCount)
            .slice(0, 20);

          return {
            total: dependencies.length,
            shown: topDependencies.length,
            dependencies: topDependencies.map((dep: any) => ({
              from: dep.from,
              to: dep.to,
              callCount: dep.callCount,
              errorCount: dep.errorCount,
              avgDuration: Math.round(dep.avgDuration),
            })),
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      },
    } as any),
  };
}

