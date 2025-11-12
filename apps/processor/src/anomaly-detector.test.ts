import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector } from './anomaly-detector';
import {
  Metric,
  MetricType,
  AlertType,
  Severity,
  LATENCY_THRESHOLD_MS,
  LogEntry,
  LogLevel,
} from '@tracer/core';

const SERVICE = 'test-service';

function buildLog(timestampMs: number, level: LogLevel): LogEntry {
  return {
    timestamp: new Date(timestampMs),
    level,
    message: 'test',
    service: SERVICE,
    metadata: {},
  };
}

function emitBucket(
  detector: AnomalyDetector,
  startMs: number,
  bucketMs: number,
  total: number,
  errorCount: number
): ReturnType<AnomalyDetector['observeLog']> {
  const alerts: ReturnType<AnomalyDetector['observeLog']> = [];
  const interval = bucketMs / Math.max(total, 1);
  for (let i = 0; i < total; i++) {
    const level = i < errorCount ? LogLevel.ERROR : LogLevel.INFO;
    alerts.push(...detector.observeLog(buildLog(startMs + i * interval, level)));
  }
  return alerts;
}

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;
  const bucketMs = 1_000;

  beforeEach(() => {
    detector = new AnomalyDetector({
      bucketSizeMs: bucketMs,
      baselineWindowMinutes: 0.5, // 30 buckets (30s)
      minBaselineBuckets: 5,
      minStdDev: 0.001,
      minAbsoluteRateLift: 0.1,
      minErrorRate: 0.05,
      minErrorCount: 1,
      minTotalCount: 5,
      zScoreThreshold: 2.5,
      rateChangeWindowMinutes: 0.1, // 6 buckets
      rateChangeThreshold: 0.5,
      alertCooldownMs: 1_000,
    });
  });

  it('should create an AnomalyDetector instance', () => {
    expect(detector).toBeInstanceOf(AnomalyDetector);
  });

  it('learns baseline and emits z-score alert on spike', () => {
    const start = Date.now();
    // Build baseline: 10 buckets of 10% error rate
    for (let bucket = 0; bucket < 10; bucket++) {
      const alerts = emitBucket(detector, start + bucket * bucketMs, bucketMs, 10, 1);
      expect(alerts).toHaveLength(0);
    }

    // Spike: 80% error rate
    const spikeAlerts = emitBucket(detector, start + 10 * bucketMs, bucketMs, 10, 8);

    expect(spikeAlerts.length).toBeGreaterThan(0);
    const spikeAlert = spikeAlerts.find((a) => a.alertType === AlertType.ERROR_SPIKE);
    expect(spikeAlert).toBeDefined();
    expect(spikeAlert?.message).toContain('Statistical error anomaly');
    expect([Severity.HIGH, Severity.CRITICAL]).toContain(spikeAlert?.severity);
  });

  it('detects rate-of-change spike against recent window', () => {
    const rocDetector = new AnomalyDetector({
      bucketSizeMs: bucketMs,
      baselineWindowMinutes: 0.5,
      minBaselineBuckets: 3,
      minStdDev: 5, // prevent z-score path
      minAbsoluteRateLift: 1,
      minErrorRate: 0.02,
      minErrorCount: 1,
      minTotalCount: 5,
      zScoreThreshold: 10,
      rateChangeWindowMinutes: 0.1,
      rateChangeThreshold: 0.5,
      alertCooldownMs: 1_000,
    });

    const start = Date.now();
    // 5 buckets at 10% error rate to seed moving average
    for (let bucket = 0; bucket < 5; bucket++) {
      emitBucket(rocDetector, start + bucket * bucketMs, bucketMs, 10, 1);
    }

    const spikeAlerts = emitBucket(rocDetector, start + 5 * bucketMs, bucketMs, 10, 8);
    expect(spikeAlerts.length).toBeGreaterThan(0);
    const rateAlert = spikeAlerts.find(
      (a) => a.alertType === AlertType.ERROR_SPIKE && a.message.includes('Error rate spike')
    );
    expect(rateAlert).toBeDefined();
    expect([Severity.HIGH, Severity.CRITICAL]).toContain(rateAlert?.severity);
  });

  it('detects high latency via metric-based rule', () => {
    const metric: Metric = {
      service: SERVICE,
      metricType: MetricType.LATENCY_P95,
      value: LATENCY_THRESHOLD_MS + 100,
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe(AlertType.HIGH_LATENCY);
    expect(alerts[0].severity).toBe(Severity.MEDIUM);
  });

  it('updates service activity and detects downtime', () => {
    const service = 'slow-service';
    const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    detector.updateServiceActivity(service, oldTimestamp);

    const alerts = detector.checkServiceDowntime(new Date());
    const downtimeAlert = alerts.find((a) => a.alertType === AlertType.SERVICE_DOWN);

    expect(downtimeAlert).toBeDefined();
    expect(downtimeAlert?.service).toBe(service);
    expect(downtimeAlert?.severity).toBe(Severity.HIGH);
  });
});
