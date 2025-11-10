import { describe, it, expect, beforeEach } from 'vitest';
import { MetricAggregator } from './aggregator';
import { LogEntry, LogLevel, MetricType } from '@tracer/core';

describe('MetricAggregator', () => {
  let aggregator: MetricAggregator;

  beforeEach(() => {
    aggregator = new MetricAggregator(60); // 60 second windows
  });

  it('should create a MetricAggregator instance', () => {
    expect(aggregator).toBeInstanceOf(MetricAggregator);
  });

  it('should process logs and track counts', () => {
    const log: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      message: 'Test log',
      service: 'test-service',
    };

    aggregator.processLog(log);
    // Should not return metrics for incomplete windows
    const metrics = aggregator.getCompletedMetrics();
    expect(metrics).toHaveLength(0);
  });

  it('should track error counts', () => {
    const now = new Date();
    const log: LogEntry = {
      timestamp: now,
      level: LogLevel.ERROR,
      message: 'Error log',
      service: 'test-service',
    };

    aggregator.processLog(log);
    
    // Fast-forward to complete the window
    const futureTime = new Date(now.getTime() + 61000);
    // Manually trigger window completion by processing a log in the next window
    const futureLog: LogEntry = {
      timestamp: futureTime,
      level: LogLevel.INFO,
      message: 'Future log',
      service: 'test-service',
    };
    aggregator.processLog(futureLog);

    const metrics = aggregator.getCompletedMetrics();
    const errorMetric = metrics.find(m => m.metricType === MetricType.ERROR_COUNT);
    expect(errorMetric).toBeDefined();
    expect(errorMetric?.value).toBe(1);
  });

  it('should calculate latency P95', () => {
    const now = new Date();
    const latencies = [100, 200, 300, 400, 500];

    latencies.forEach((latency, i) => {
      const log: LogEntry = {
        timestamp: new Date(now.getTime() + i * 1000),
        level: LogLevel.INFO,
        message: 'Test log',
        service: 'test-service',
        metadata: { latency },
      };
      aggregator.processLog(log);
    });

    // Complete the window
    const futureTime = new Date(now.getTime() + 61000);
    const futureLog: LogEntry = {
      timestamp: futureTime,
      level: LogLevel.INFO,
      message: 'Future log',
      service: 'test-service',
    };
    aggregator.processLog(futureLog);

    const metrics = aggregator.getCompletedMetrics();
    const latencyMetric = metrics.find(m => m.metricType === MetricType.LATENCY_P95);
    expect(latencyMetric).toBeDefined();
    // P95 of [100, 200, 300, 400, 500] should be around 475 (95th percentile)
    expect(latencyMetric?.value).toBeGreaterThan(400);
  });
});

