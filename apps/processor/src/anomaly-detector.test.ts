import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector } from './anomaly-detector';
import { Metric, MetricType, AlertType, Severity, ERROR_COUNT_THRESHOLD, LATENCY_THRESHOLD_MS } from '@tracer/core';

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  it('should create an AnomalyDetector instance', () => {
    expect(detector).toBeInstanceOf(AnomalyDetector);
  });

  it('should detect error spike', () => {
    const metric: Metric = {
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: ERROR_COUNT_THRESHOLD + 1,
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe(AlertType.ERROR_SPIKE);
    expect(alerts[0].service).toBe('test-service');
    expect(alerts[0].severity).toBe(Severity.MEDIUM);
  });

  it('should not alert for errors below threshold', () => {
    const metric: Metric = {
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: ERROR_COUNT_THRESHOLD - 1,
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts).toHaveLength(0);
  });

  it('should detect high latency', () => {
    const metric: Metric = {
      service: 'test-service',
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

  it('should assign critical severity for very high error counts', () => {
    const metric: Metric = {
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: ERROR_COUNT_THRESHOLD * 6, // 5x threshold
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts[0].severity).toBe(Severity.CRITICAL);
  });

  it('should assign high severity for moderate error counts', () => {
    const metric: Metric = {
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: ERROR_COUNT_THRESHOLD * 3, // 2x threshold
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts[0].severity).toBe(Severity.HIGH);
  });

  it('should update service activity', () => {
    const service = 'test-service';
    const timestamp = new Date();

    const alert = detector.updateServiceActivity(service, timestamp);

    expect(alert).toBeNull(); // Service is active, no alert
  });

  it('should detect service downtime', () => {
    const service = 'test-service';
    const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago

    detector.updateServiceActivity(service, oldTimestamp);

    const now = new Date();
    const alerts = detector.checkServiceDowntime(now);

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].alertType).toBe(AlertType.SERVICE_DOWN);
    expect(alerts[0].service).toBe(service);
    expect(alerts[0].severity).toBe(Severity.HIGH);
  });
});

