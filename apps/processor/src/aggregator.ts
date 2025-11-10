import { LogEntry, Metric, MetricType, DEFAULT_METRIC_WINDOW_SECONDS } from '@tracer/core';

interface WindowState {
  service: string;
  windowStart: Date;
  windowEnd: Date;
  logCount: number;
  errorCount: number;
  latencies: number[];
}

export class MetricAggregator {
  private windows: Map<string, WindowState> = new Map();
  private readonly windowSeconds: number;

  constructor(windowSeconds: number = DEFAULT_METRIC_WINDOW_SECONDS) {
    this.windowSeconds = windowSeconds;
  }

  /**
   * Process a log entry and update window metrics
   * Returns real-time metrics for the current window (incremental updates)
   */
  processLog(log: LogEntry): Metric[] {
    const now = new Date();
    const windowKey = this.getWindowKey(log.service, log.timestamp);
    
    let window = this.windows.get(windowKey);
    
    if (!window) {
      const windowStart = this.getWindowStart(log.timestamp);
      const windowEnd = new Date(windowStart.getTime() + this.windowSeconds * 1000);
      window = {
        service: log.service,
        windowStart,
        windowEnd,
        logCount: 0,
        errorCount: 0,
        latencies: [],
      };
      this.windows.set(windowKey, window);
    }

    // Update metrics
    window.logCount++;
    
    if (log.level === 'error' || log.level === 'fatal') {
      window.errorCount++;
    }

    // Extract latency from metadata if present
    if (log.metadata?.latency && typeof log.metadata.latency === 'number') {
      window.latencies.push(log.metadata.latency);
    }

    // Return real-time metrics for current window (incremental updates)
    return this.getCurrentWindowMetrics(window);
  }

  /**
   * Get real-time metrics for a window (current state, not just completed)
   */
  private getCurrentWindowMetrics(window: WindowState): Metric[] {
    const metrics: Metric[] = [];
    const now = new Date();
    const windowEnd = window.windowEnd < now ? window.windowEnd : now;

    // Always return log count (real-time)
    metrics.push({
      service: window.service,
      metricType: MetricType.LOG_COUNT,
      value: window.logCount,
      windowStart: window.windowStart,
      windowEnd: windowEnd,
    });

    // Return error count if there are errors
    if (window.errorCount > 0) {
      metrics.push({
        service: window.service,
        metricType: MetricType.ERROR_COUNT,
        value: window.errorCount,
        windowStart: window.windowStart,
        windowEnd: windowEnd,
      });
    }

    // Return latency metrics if available
    if (window.latencies.length > 0) {
      const sorted = [...window.latencies].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95Latency = sorted[p95Index] || 0;

      metrics.push({
        service: window.service,
        metricType: MetricType.LATENCY_P95,
        value: p95Latency,
        windowStart: window.windowStart,
        windowEnd: windowEnd,
      });

      // Calculate throughput (logs per second) - real-time
      const elapsedSeconds = (now.getTime() - window.windowStart.getTime()) / 1000;
      const throughput = elapsedSeconds > 0 ? window.logCount / elapsedSeconds : 0;

      metrics.push({
        service: window.service,
        metricType: MetricType.THROUGHPUT,
        value: throughput,
        windowStart: window.windowStart,
        windowEnd: windowEnd,
      });
    }

    return metrics;
  }

  /**
   * Get completed windows and return metrics, clearing old windows
   */
  getCompletedMetrics(): Metric[] {
    const now = new Date();
    const completedMetrics: Metric[] = [];
    const windowsToRemove: string[] = [];

    for (const [key, window] of this.windows.entries()) {
      // Check if window is complete (windowEnd < now)
      if (window.windowEnd < now) {
        // Generate metrics for this window
        completedMetrics.push({
          service: window.service,
          metricType: MetricType.LOG_COUNT,
          value: window.logCount,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        });

        if (window.errorCount > 0) {
          completedMetrics.push({
            service: window.service,
            metricType: MetricType.ERROR_COUNT,
            value: window.errorCount,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
          });
        }

        if (window.latencies.length > 0) {
          const sorted = [...window.latencies].sort((a, b) => a - b);
          const p95Index = Math.floor(sorted.length * 0.95);
          const p95Latency = sorted[p95Index] || 0;

          completedMetrics.push({
            service: window.service,
            metricType: MetricType.LATENCY_P95,
            value: p95Latency,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
          });

          // Calculate throughput (logs per second)
          const windowDurationSeconds = (window.windowEnd.getTime() - window.windowStart.getTime()) / 1000;
          const throughput = window.logCount / windowDurationSeconds;

          completedMetrics.push({
            service: window.service,
            metricType: MetricType.THROUGHPUT,
            value: throughput,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
          });
        }

        windowsToRemove.push(key);
      }
    }

    // Remove completed windows
    for (const key of windowsToRemove) {
      this.windows.delete(key);
    }

    return completedMetrics;
  }

  private getWindowKey(service: string, timestamp: Date): string {
    const windowStart = this.getWindowStart(timestamp);
    return `${service}:${windowStart.getTime()}`;
  }

  private getWindowStart(timestamp: Date): Date {
    const ms = timestamp.getTime();
    const windowMs = this.windowSeconds * 1000;
    const windowStartMs = Math.floor(ms / windowMs) * windowMs;
    return new Date(windowStartMs);
  }
}

