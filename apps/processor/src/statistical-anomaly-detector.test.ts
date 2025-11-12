import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';
import { LogEntry, Metric, MetricType, AlertType, Severity } from '@tracer/core';

describe('StatisticalAnomalyDetector', () => {
  let detector: StatisticalAnomalyDetector;

  beforeEach(() => {
    detector = new StatisticalAnomalyDetector({
      minDataPoints: 10,
      baselineWindowMinutes: 5,
      rateOfChangeThreshold: 0.5,
      zScoreThreshold: 2.0,
      sensitivity: 0.8,
    });
  });

  describe('Initialization', () => {
    it('should create detector with default config', () => {
      const defaultDetector = new StatisticalAnomalyDetector();
      expect(defaultDetector).toBeInstanceOf(StatisticalAnomalyDetector);
      
      const config = defaultDetector.getConfig();
      expect(config.zScoreThreshold).toBe(3.0);
      expect(config.minDataPoints).toBe(30);
    });

    it('should create detector with custom config', () => {
      const config = detector.getConfig();
      expect(config.minDataPoints).toBe(10);
      expect(config.zScoreThreshold).toBe(2.0);
      expect(config.rateOfChangeThreshold).toBe(0.5);
    });
  });

  describe('Baseline Management', () => {
    it('should create and maintain baselines per service', () => {
      const log: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Test error',
        service: 'test-service',
      };

      // Process multiple logs to build baseline
      for (let i = 0; i < 15; i++) {
        detector.processLog(log);
      }

      const stats = detector.getBaselineStats('test-service', MetricType.ERROR_COUNT);
      expect(stats).not.toBeNull();
      expect(stats?.count).toBe(15);
      expect(stats?.mean).toBeGreaterThan(0);
    });

    it('should clear baselines correctly', () => {
      const log: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Test error',
        service: 'test-service',
      };

      detector.processLog(log);
      expect(detector.getBaselineStats('test-service', MetricType.ERROR_COUNT)).not.toBeNull();

      detector.clearBaseline('test-service', MetricType.ERROR_COUNT);
      expect(detector.getBaselineStats('test-service', MetricType.ERROR_COUNT)).toBeNull();
    });

    it('should handle multiple metric types per service', () => {
      const errorLog: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Test error',
        service: 'test-service',
      };

      const infoLog: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test info',
        service: 'test-service',
        metadata: { latency: 100 },
      };

      for (let i = 0; i < 15; i++) {
        detector.processLog(errorLog);
        detector.processLog(infoLog);
      }

      const errorStats = detector.getBaselineStats('test-service', MetricType.ERROR_COUNT);
      const latencyStats = detector.getBaselineStats('test-service', MetricType.LATENCY_P95);

      expect(errorStats).not.toBeNull();
      expect(latencyStats).not.toBeNull();
      expect(errorStats?.metricType).toBe(MetricType.ERROR_COUNT);
      expect(latencyStats?.metricType).toBe(MetricType.LATENCY_P95);
    });
  });

  describe('Statistical Anomaly Detection', () => {
    beforeEach(() => {
      // Build a stable baseline first
      const normalLog: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Normal operation',
        service: 'test-service',
        metadata: { latency: 50 },
      };

      // Create normal pattern
      for (let i = 0; i < 15; i++) {
        detector.processLog(normalLog);
      }
    });

    it('should not trigger anomaly for normal values', () => {
      const normalLog: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Normal operation',
        service: 'test-service',
        metadata: { latency: 55 },
      };

      const alerts = detector.processLog(normalLog);
      const latencyAlerts = alerts.filter(a => a.alertType === AlertType.HIGH_LATENCY);
      
      expect(latencyAlerts.length).toBe(0);
    });

    it('should detect statistical anomaly for high latency', () => {
      const anomalousLog: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Slow operation',
        service: 'test-service',
        metadata: { latency: 500 }, // Much higher than baseline of 50ms
      };

      const alerts = detector.processLog(anomalousLog);
      const latencyAlerts = alerts.filter(a => a.alertType === AlertType.HIGH_LATENCY);
      
      expect(latencyAlerts.length).toBeGreaterThan(0);
      expect(latencyAlerts[0].severity).toBe(Severity.CRITICAL);
      expect(latencyAlerts[0].metadata?.zScore).toBeDefined();
      expect(parseFloat(latencyAlerts[0].metadata?.zScore)).toBeGreaterThan(2.0);
    });

    it('should detect statistical anomaly for error spikes', () => {
      // First, establish normal error rate
      const normalErrorLog: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Occasional error',
        service: 'test-service',
      };

      for (let i = 0; i < 5; i++) {
        detector.processLog(normalErrorLog);
      }

      // Now create a spike
      const alerts: any[] = [];
      for (let i = 0; i < 20; i++) {
        const newAlerts = detector.processLog(normalErrorLog);
        alerts.push(...newAlerts);
      }

      const errorAlerts = alerts.filter(a => a.alertType === AlertType.ERROR_SPIKE);
      expect(errorAlerts.length).toBeGreaterThan(0);
      expect(errorAlerts[0].severity).toBe(Severity.CRITICAL);
    });

    it('should calculate and use median absolute deviation when enabled', () => {
      const madDetector = new StatisticalAnomalyDetector({
        minDataPoints: 10,
        useMAD: true,
        zScoreThreshold: 2.0,
      });

      // Build baseline with some outliers
      for (let i = 0; i < 20; i++) {
        const log: LogEntry = {
          timestamp: new Date(),
          level: 'info',
          message: 'Operation',
          service: 'test-service',
          metadata: { latency: i < 18 ? 50 : 1000 }, // Two outliers
        };
        madDetector.processLog(log);
      }

      const stats = madDetector.getBaselineStats('test-service', MetricType.LATENCY_P95);
      expect(stats).not.toBeNull();
      expect(stats?.mad).toBeGreaterThan(0);
      expect(stats?.median).toBeCloseTo(50, 0);
    });
  });

  describe('Rate of Change Detection', () => {
    it('should detect rapid rate of change', () => {
      const detectorWithROC = new StatisticalAnomalyDetector({
        minDataPoints: 5,
        rateOfChangeThreshold: 0.5, // 50% increase
        rateOfChangeWindowMinutes: 1,
      });

      // Start with low error rate
      const lowErrorLog: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Error',
        service: 'test-service',
      };

      // Process a few low-rate errors
      for (let i = 0; i < 5; i++) {
        detectorWithROC.processLog({
          ...lowErrorLog,
          timestamp: new Date(Date.now() - 30000), // 30 seconds ago
        });
      }

      // Now process many errors rapidly
      const alerts: any[] = [];
      for (let i = 0; i < 15; i++) {
        const newAlerts = detectorWithROC.processLog(lowErrorLog);
        alerts.push(...newAlerts);
      }

      const rocAlerts = alerts.filter(a => a.alertType === AlertType.THRESHOLD_EXCEEDED);
      expect(rocAlerts.length).toBeGreaterThan(0);
      expect(rocAlerts[0].message).toContain('increased');
      expect(rocAlerts[0].message).toContain('%');
    });
  });

  describe('Batch Metric Processing', () => {
    it('should process batch metrics and detect anomalies', () => {
      // First build a baseline
      const metrics: Metric[] = [];
      for (let i = 0; i < 15; i++) {
        metrics.push({
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: i < 10 ? 1 : 10, // Normal: 1 error, then spike to 10
          windowStart: new Date(Date.now() - (15 - i) * 60000),
          windowEnd: new Date(Date.now() - (14 - i) * 60000),
        });
      }

      const alerts = detector.processMetrics(metrics);
      const errorAlerts = alerts.filter(a => a.alertType === AlertType.ERROR_SPIKE);
      
      expect(errorAlerts.length).toBeGreaterThan(0);
      expect(errorAlerts[errorAlerts.length - 1].severity).toBe(Severity.CRITICAL);
    });

    it('should handle multiple metric types in batch', () => {
      const metrics: Metric[] = [
        {
          service: 'test-service',
          metricType: MetricType.ERROR_COUNT,
          value: 100, // Anomalous
          windowStart: new Date(),
          windowEnd: new Date(),
        },
        {
          service: 'test-service',
          metricType: MetricType.LATENCY_P95,
          value: 5000, // Anomalous
          windowStart: new Date(),
          windowEnd: new Date(),
        },
        {
          service: 'test-service',
          metricType: MetricType.THROUGHPUT,
          value: 0.1, // Normal
          windowStart: new Date(),
          windowEnd: new Date(),
        },
      ];

      const alerts = detector.processMetrics(metrics);
      expect(alerts.length).toBeGreaterThan(0);
      
      const errorAlert = alerts.find(a => a.alertType === AlertType.ERROR_SPIKE);
      const latencyAlert = alerts.find(a => a.alertType === AlertType.HIGH_LATENCY);
      
      expect(errorAlert).toBeDefined();
      expect(latencyAlert).toBeDefined();
    });
  });

  describe('Severity Levels', () => {
    it('should assign correct severity based on deviation', () => {
      const detector = new StatisticalAnomalyDetector({
        minDataPoints: 5,
        zScoreThreshold: 2.0,
      });

      // Build normal baseline
      for (let i = 0; i < 10; i++) {
        detector.processLog({
          timestamp: new Date(),
          level: 'info',
          message: 'Normal',
          service: 'test-service',
          metadata: { latency: 50 },
        });
      }

      // Test different severity levels
      const mildAnomaly = detector.processLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Mild anomaly',
        service: 'test-service',
        metadata: { latency: 150 }, // ~2σ
      });

      const criticalAnomaly = detector.processLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Critical anomaly',
        service: 'test-service',
        metadata: { latency: 500 }, // >4σ
      });

      expect(mildAnomaly[0]?.severity).toBe(Severity.MEDIUM);
      expect(criticalAnomaly[0]?.severity).toBe(Severity.CRITICAL);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle high throughput without errors', () => {
      const startTime = Date.now();
      const logCount = 10000;
      
      for (let i = 0; i < logCount; i++) {
        const log: LogEntry = {
          timestamp: new Date(),
          level: i % 10 === 0 ? 'error' : 'info',
          message: `Log ${i}`,
          service: 'high-throughput-service',
          metadata: { latency: 50 + (i % 100) },
        };
        detector.processLog(log);
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      const avgTimePerLog = processingTime / logCount;
      
      // Should process each log in less than 10ms on average
      expect(avgTimePerLog).toBeLessThan(10);
      
      // Should handle 100k logs/minute equivalent
      const logsPerMinute = (logCount / processingTime) * 60000;
      expect(logsPerMinute).toBeGreaterThan(100000);
    });

    it('should handle insufficient data points gracefully', () => {
      const newDetector = new StatisticalAnomalyDetector({
        minDataPoints: 50, // High threshold
      });

      const log: LogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'Error',
        service: 'new-service',
        metadata: { latency: 10000 }, // Would be anomalous but insufficient data
      };

      // Process fewer logs than minDataPoints
      for (let i = 0; i < 10; i++) {
        const alerts = newDetector.processLog(log);
        expect(alerts.length).toBe(0); // Should not trigger alerts
      }

      const stats = newDetector.getBaselineStats('new-service', MetricType.ERROR_COUNT);
      expect(stats).toBeNull(); // Should return null until minDataPoints reached
    });

    it('should handle circular buffer correctly', () => {
      const smallWindowDetector = new StatisticalAnomalyDetector({
        minDataPoints: 5,
        baselineWindowMinutes: 1, // Small window
      });

      const log: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test',
        service: 'buffer-test-service',
        metadata: { latency: 50 },
      };

      // Fill buffer beyond capacity
      for (let i = 0; i < 100; i++) {
        smallWindowDetector.processLog({
          ...log,
          metadata: { latency: 50 + i },
        });
      }

      const stats = smallWindowDetector.getBaselineStats('buffer-test-service', MetricType.LATENCY_P95);
      expect(stats).not.toBeNull();
      expect(stats?.count).toBeGreaterThanOrEqual(5);
      
      // Should maintain statistics correctly even with circular buffer
      expect(stats?.mean).toBeGreaterThan(50);
      expect(stats?.recentValues.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Configuration Updates', () => {
    it('should allow runtime configuration updates', () => {
      const initialConfig = detector.getConfig();
      expect(initialConfig.zScoreThreshold).toBe(2.0);

      detector.updateConfig({ zScoreThreshold: 4.0 });
      
      const updatedConfig = detector.getConfig();
      expect(updatedConfig.zScoreThreshold).toBe(4.0);
      expect(updatedConfig.minDataPoints).toBe(initialConfig.minDataPoints); // Unchanged
    });
  });
});