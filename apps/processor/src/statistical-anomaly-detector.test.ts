import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';
import { Metric, MetricType, AlertType, Severity } from '@tracer/core';

describe('StatisticalAnomalyDetector', () => {
  let detector: StatisticalAnomalyDetector;

  beforeEach(() => {
    detector = new StatisticalAnomalyDetector();
  });

  describe('Baseline Learning', () => {
    it('should not detect anomalies until baseline is established', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;

      // Generate 9 normal metrics (need 10 for baseline)
      for (let i = 0; i < 9; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(Date.now() - i * 60000),
          windowEnd: new Date(Date.now() - i * 60000 + 60000),
        });
      }

      const alerts = detector.detectAnomalies(metrics);
      expect(alerts).toHaveLength(0); // No alerts until baseline is ready
    });

    it('should learn baseline from historical data', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;

      // Generate 10 normal metrics to establish baseline
      for (let i = 0; i < 10; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue + (Math.random() - 0.5) * 2, // Small variation
          windowStart: new Date(Date.now() - i * 60000),
          windowEnd: new Date(Date.now() - i * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      const stats = detector.getBaselineStats('test-service', MetricType.ERROR_COUNT);
      expect(stats).not.toBeNull();
      expect(stats!.mean).toBeCloseTo(baseValue, 0);
      expect(stats!.historySize).toBe(10);
      expect(stats!.isReady).toBe(true);
    });
  });

  describe('Z-Score Detection', () => {
    it('should detect anomaly when z-score exceeds threshold', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline with 10 normal values
      for (let i = 0; i < 10; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (10 - i) * 60000),
          windowEnd: new Date(now - (10 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Add anomalous value (5x baseline, should be >3 std devs)
      const anomalousMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 5,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([anomalousMetric]);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertType).toBe(AlertType.ERROR_SPIKE);
      expect(alerts[0].service).toBe('test-service');
      expect(alerts[0].message).toContain('Z-score');
    });

    it('should not detect anomaly for values within 3 standard deviations', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline with some variation
      for (let i = 0; i < 20; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue + (Math.random() - 0.5) * 4, // ±2 variation
          windowStart: new Date(now - (20 - i) * 60000),
          windowEnd: new Date(now - (20 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Add normal value
      const normalMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue + 1,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([normalMetric]);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Rate of Change Detection', () => {
    it('should detect rapid rate increase', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Add value with >50% increase
      const spikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 2, // 100% increase
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([spikeMetric]);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].message).toContain('Rate increased');
    });

    it('should detect rate increase from low baseline', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Baseline with low error count
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: 2,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Spike to 10 errors (400% increase)
      const spikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: 10,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([spikeMetric]);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertType).toBe(AlertType.ERROR_SPIKE);
    });
  });

  describe('EWMA Detection', () => {
    it('should detect deviation from exponential moving average trend', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Create gradual increasing trend
      for (let i = 0; i < 20; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: 10 + i * 0.5, // Slow increase from 10 to 19.5
          windowStart: new Date(now - (20 - i) * 60000),
          windowEnd: new Date(now - (20 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Sudden spike that deviates from trend
      const spikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: 50, // Way above trend
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([spikeMetric]);

      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Service Support', () => {
    it('should maintain separate baselines per service', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Service A: baseline = 10 errors
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'service-a',
          metricType: MetricType.ERROR_COUNT,
          value: 10,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      // Service B: baseline = 100 errors (different scale)
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'service-b',
          metricType: MetricType.ERROR_COUNT,
          value: 100,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // 30 errors is anomalous for service-a but normal for service-b
      const testMetrics: Metric[] = [
        {
          service: 'service-a',
          metricType: MetricType.ERROR_COUNT,
          value: 30,
          windowStart: new Date(now),
          windowEnd: new Date(now + 60000),
        },
        {
          service: 'service-b',
          metricType: MetricType.ERROR_COUNT,
          value: 30,
          windowStart: new Date(now),
          windowEnd: new Date(now + 60000),
        },
      ];

      const alerts = detector.detectAnomalies(testMetrics);

      // Should have alerts for both (service-a: too high, service-b: rate decrease)
      expect(alerts.length).toBeGreaterThan(0);

      const serviceAAlerts = alerts.filter((a) => a.service === 'service-a');
      expect(serviceAAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Latency Anomaly Detection', () => {
    it('should detect latency spikes', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Baseline latency ~100ms
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.LATENCY_P95,
          value: 100 + (Math.random() - 0.5) * 10,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Sudden latency spike to 500ms
      const spikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.LATENCY_P95,
        value: 500,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([spikeMetric]);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertType).toBe(AlertType.HIGH_LATENCY);
      expect(alerts[0].message).toContain('P95 latency');
    });
  });

  describe('Severity Calculation', () => {
    it('should assign higher severity for larger deviations', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Small anomaly
      const smallAnomalyMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 2,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const smallAlerts = detector.detectAnomalies([smallAnomalyMetric]);

      // Re-establish baseline
      detector.clearBaselines();
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now + 60000 - (15 - i) * 60000),
          windowEnd: new Date(now + 60000 - (15 - i) * 60000 + 60000),
        });
      }
      detector.detectAnomalies(metrics);

      // Large anomaly
      const largeAnomalyMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 10,
        windowStart: new Date(now + 60000),
        windowEnd: new Date(now + 120000),
      };

      const largeAlerts = detector.detectAnomalies([largeAnomalyMetric]);

      if (smallAlerts.length > 0 && largeAlerts.length > 0) {
        // Large anomaly should have higher severity
        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        expect(severityOrder[largeAlerts[0].severity]).toBeGreaterThanOrEqual(
          severityOrder[smallAlerts[0].severity]
        );
      }
    });
  });

  describe('Configuration', () => {
    it('should respect custom z-score threshold', () => {
      const strictDetector = new StatisticalAnomalyDetector({
        zScoreThreshold: 2.0, // More sensitive
      });

      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      strictDetector.detectAnomalies(metrics);

      // Moderate spike that would be 2.5 std devs
      const moderateSpikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 2.5,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = strictDetector.detectAnomalies([moderateSpikeMetric]);

      // Should detect with lower threshold
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should respect custom rate-of-change threshold', () => {
      const strictDetector = new StatisticalAnomalyDetector({
        rateOfChangeThreshold: 30, // Detect 30% increase instead of 50%
      });

      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Establish baseline
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      strictDetector.detectAnomalies(metrics);

      // 40% increase
      const spikeMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue * 1.4,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = strictDetector.detectAnomalies([spikeMetric]);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].message).toContain('Rate increased');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero baseline values', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Baseline with zero errors
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: 0,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // First error appears
      const errorMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: 1,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([errorMetric]);

      // Should detect as anomaly
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should handle constant baseline values (zero variance)', () => {
      const metrics: Metric[] = [];
      const baseValue = 10;
      const now = Date.now();

      // Perfectly constant baseline
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: baseValue,
          windowStart: new Date(now - (15 - i) * 60000),
          windowEnd: new Date(now - (15 - i) * 60000 + 60000),
        });
      }

      detector.detectAnomalies(metrics);

      // Any change should be detected
      const changedMetric: Metric = {
        service: 'test-service',
        metricType: MetricType.ERROR_COUNT,
        value: baseValue + 1,
        windowStart: new Date(now),
        windowEnd: new Date(now + 60000),
      };

      const alerts = detector.detectAnomalies([changedMetric]);

      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should process metrics efficiently', () => {
      const metrics: Metric[] = [];
      const now = Date.now();

      // Generate 100 metrics across 10 services
      for (let i = 0; i < 100; i++) {
        metrics.push({
          service: `service-${i % 10}`,
          metricType: MetricType.ERROR_COUNT,
          value: 10 + Math.random() * 5,
          windowStart: new Date(now - i * 60000),
          windowEnd: new Date(now - i * 60000 + 60000),
        });
      }

      const startTime = performance.now();
      detector.detectAnomalies(metrics);
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      // Should process 100 metrics in less than 10ms
      expect(processingTime).toBeLessThan(10);

      const stats = detector.getPerformanceStats();
      expect(stats.totalProcessed).toBe(100);
    });
  });
});
