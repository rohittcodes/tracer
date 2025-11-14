import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector } from './anomaly-detector';
import { Metric, MetricType, AlertType, Severity, ERROR_COUNT_THRESHOLD, LATENCY_THRESHOLD_MS } from '@tracer/core';

const BASE_TIME = Date.parse('2024-01-01T00:00:00Z');

function createErrorMetric(service: string, errors: number, endOffsetMs: number, windowSeconds = 60): Metric {
  const windowEndMs = BASE_TIME + endOffsetMs;
  return {
    service,
    metricType: MetricType.ERROR_COUNT,
    value: errors,
    windowStart: new Date(windowEndMs - windowSeconds * 1000),
    windowEnd: new Date(windowEndMs),
  };
}

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  it('should create an AnomalyDetector instance', () => {
    expect(detector).toBeInstanceOf(AnomalyDetector);
  });

  it('should fall back to static threshold before baseline is ready', () => {
    const metric: Metric = createErrorMetric('bootstrap-service', ERROR_COUNT_THRESHOLD + 1, 0);

    const alerts = detector.detectAnomalies([metric]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe(AlertType.ERROR_SPIKE);
    expect(alerts[0].message).toContain('static threshold');
  });

  it('should detect statistical anomaly once baseline is established', () => {
    const service = 'payments';
    for (let i = 0; i < 10; i++) {
      const metric = createErrorMetric(service, 3, i * 6000);
      expect(detector.detectAnomalies([metric])).toHaveLength(0);
    }

    const spikeMetric = createErrorMetric(service, 60, 70000);
    const alerts = detector.detectAnomalies([spikeMetric]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe(AlertType.ERROR_SPIKE);
    expect(alerts[0].severity).toBe(Severity.CRITICAL);
    expect(alerts[0].message).toContain('Statistical error anomaly');
  });

  it('should not alert for small variations when baseline exists', () => {
    const service = 'stable-service';
    for (let i = 0; i < 10; i++) {
      detector.detectAnomalies([createErrorMetric(service, 10, i * 6000)]);
    }

    const nearBaseline = createErrorMetric(service, 11, 70000);
    const alerts = detector.detectAnomalies([nearBaseline]);
    expect(alerts).toHaveLength(0);
  });

  it('should detect rapid rate-of-change spikes', () => {
    const service = 'spiky-service';
    for (let i = 0; i < 10; i++) {
      detector.detectAnomalies([createErrorMetric(service, 5, i * 6000)]);
    }

    detector.detectAnomalies([createErrorMetric(service, 6, 360000)]);
    const spikeMetric = createErrorMetric(service, 20, 360000 + 180000);
    const alerts = detector.detectAnomalies([spikeMetric]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe(Severity.CRITICAL);
    expect(alerts[0].message).toContain('rate increased');
  });

  it('should detect high latency', () => {
    const metric: Metric = {
      service: 'latency-service',
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

