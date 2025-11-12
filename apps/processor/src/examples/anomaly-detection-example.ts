/**
 * Anomaly Detection Usage Examples
 *
 * This file demonstrates how to use the statistical anomaly detection system
 * in various scenarios.
 */

import { Metric, MetricType, LogLevel } from '@tracer/core';
import { StatisticalAnomalyDetector } from '../statistical-anomaly-detector';
import { HybridAnomalyDetector, DetectionMode } from '../hybrid-anomaly-detector';

/**
 * Example 1: Basic Statistical Anomaly Detection
 */
export function example1_BasicDetection() {
  console.log('\n=== Example 1: Basic Statistical Detection ===\n');

  const detector = new StatisticalAnomalyDetector();
  const now = Date.now();

  // Step 1: Build baseline (first 20 windows)
  console.log('Building baseline with 20 normal windows...');
  const baselineMetrics: Metric[] = [];

  for (let i = 0; i < 20; i++) {
    baselineMetrics.push({
      service: 'payment-service',
      metricType: MetricType.ERROR_COUNT,
      value: 10 + (Math.random() - 0.5) * 2, // 10 ± 1 errors
      windowStart: new Date(now - (20 - i) * 60000),
      windowEnd: new Date(now - (20 - i) * 60000 + 60000),
    });
  }

  detector.detectAnomalies(baselineMetrics);

  // Step 2: Check baseline stats
  const stats = detector.getBaselineStats('payment-service', MetricType.ERROR_COUNT);
  console.log(`Baseline established: μ=${stats?.mean.toFixed(2)}, σ=${stats?.stdDev.toFixed(2)}`);

  // Step 3: Test with anomalous value
  console.log('\nTesting with anomalous spike (50 errors)...');
  const anomalousMetric: Metric = {
    service: 'payment-service',
    metricType: MetricType.ERROR_COUNT,
    value: 50, // 5x baseline
    windowStart: new Date(now),
    windowEnd: new Date(now + 60000),
  };

  const alerts = detector.detectAnomalies([anomalousMetric]);

  if (alerts.length > 0) {
    console.log(`\n✓ Anomaly detected!`);
    console.log(`  Severity: ${alerts[0].severity}`);
    console.log(`  Message: ${alerts[0].message}`);
  } else {
    console.log('✗ No anomaly detected (unexpected)');
  }
}

/**
 * Example 2: Multi-Service Detection
 */
export function example2_MultiService() {
  console.log('\n=== Example 2: Multi-Service Detection ===\n');

  const detector = new StatisticalAnomalyDetector();
  const now = Date.now();

  const services = [
    { name: 'api-gateway', baseline: 50 },
    { name: 'user-service', baseline: 10 },
    { name: 'payment-service', baseline: 5 },
  ];

  // Build baselines for all services
  console.log('Building baselines for 3 services...');
  const metrics: Metric[] = [];

  for (const service of services) {
    for (let i = 0; i < 20; i++) {
      metrics.push({
        service: service.name,
        metricType: MetricType.ERROR_COUNT,
        value: service.baseline + (Math.random() - 0.5) * 2,
        windowStart: new Date(now - (20 - i) * 60000),
        windowEnd: new Date(now - (20 - i) * 60000 + 60000),
      });
    }
  }

  detector.detectAnomalies(metrics);

  // Show baselines
  for (const service of services) {
    const stats = detector.getBaselineStats(service.name, MetricType.ERROR_COUNT);
    console.log(
      `${service.name}: μ=${stats?.mean.toFixed(2)}, σ=${stats?.stdDev.toFixed(2)}`
    );
  }

  // Test: spike in user-service only
  console.log('\nTesting spike in user-service only...');
  const testMetrics: Metric[] = [
    {
      service: 'api-gateway',
      metricType: MetricType.ERROR_COUNT,
      value: 52, // Normal
      windowStart: new Date(now),
      windowEnd: new Date(now + 60000),
    },
    {
      service: 'user-service',
      metricType: MetricType.ERROR_COUNT,
      value: 50, // Anomaly (5x baseline)
      windowStart: new Date(now),
      windowEnd: new Date(now + 60000),
    },
    {
      service: 'payment-service',
      metricType: MetricType.ERROR_COUNT,
      value: 5, // Normal
      windowStart: new Date(now),
      windowEnd: new Date(now + 60000),
    },
  ];

  const alerts = detector.detectAnomalies(testMetrics);

  console.log(`\nAlerts generated: ${alerts.length}`);
  for (const alert of alerts) {
    console.log(`  [${alert.severity}] ${alert.service}: ${alert.message.split('.')[0]}`);
  }
}

/**
 * Example 3: Rate-of-Change Detection
 */
export function example3_RateOfChange() {
  console.log('\n=== Example 3: Rate-of-Change Spike Detection ===\n');

  const detector = new StatisticalAnomalyDetector();
  const now = Date.now();

  // Build baseline with gradual increase
  console.log('Building baseline with gradual trend...');
  const metrics: Metric[] = [];

  for (let i = 0; i < 20; i++) {
    metrics.push({
      service: 'api-service',
      metricType: MetricType.ERROR_COUNT,
      value: 10 + i * 0.5, // Gradual increase from 10 to 19.5
      windowStart: new Date(now - (20 - i) * 60000),
      windowEnd: new Date(now - (20 - i) * 60000 + 60000),
    });
  }

  detector.detectAnomalies(metrics);

  // Sudden spike (100% increase from last value)
  console.log('\nTesting sudden spike (100% increase)...');
  const spikeMetric: Metric = {
    service: 'api-service',
    metricType: MetricType.ERROR_COUNT,
    value: 40, // Double the last value
    windowStart: new Date(now),
    windowEnd: new Date(now + 60000),
  };

  const alerts = detector.detectAnomalies([spikeMetric]);

  if (alerts.length > 0) {
    console.log(`\n✓ Rate-of-change anomaly detected!`);
    console.log(`  ${alerts[0].message}`);
  }
}

/**
 * Example 4: Hybrid Detection Mode
 */
export function example4_HybridMode() {
  console.log('\n=== Example 4: Hybrid Detection (Threshold + Statistical) ===\n');

  const detector = new HybridAnomalyDetector(DetectionMode.HYBRID);
  const now = Date.now();

  // Build small baseline (not enough for statistical yet)
  console.log('Building small baseline (5 windows)...');
  const baselineMetrics: Metric[] = [];

  for (let i = 0; i < 5; i++) {
    baselineMetrics.push({
      service: 'web-service',
      metricType: MetricType.ERROR_COUNT,
      value: 8,
      windowStart: new Date(now - (5 - i) * 60000),
      windowEnd: new Date(now - (5 - i) * 60000 + 60000),
    });
  }

  detector.detectAnomalies(baselineMetrics);

  // Test with spike (should trigger threshold detector)
  console.log('\nTesting spike before statistical baseline ready...');
  const spikeMetric: Metric = {
    service: 'web-service',
    metricType: MetricType.ERROR_COUNT,
    value: 15, // Above threshold (10)
    windowStart: new Date(now),
    windowEnd: new Date(now + 60000),
  };

  const alerts = detector.detectAnomalies([spikeMetric]);

  console.log(`\nAlerts: ${alerts.length}`);
  for (const alert of alerts) {
    console.log(`  [${alert.severity}] ${alert.message}`);
  }

  // Build more baseline
  console.log('\nBuilding full baseline (15 more windows)...');
  for (let i = 0; i < 15; i++) {
    baselineMetrics.push({
      service: 'web-service',
      metricType: MetricType.ERROR_COUNT,
      value: 8 + (Math.random() - 0.5),
      windowStart: new Date(now + (i + 1) * 60000),
      windowEnd: new Date(now + (i + 2) * 60000),
    });
  }

  detector.detectAnomalies(baselineMetrics);

  // Test again (should trigger both detectors)
  console.log('\nTesting spike after statistical baseline ready...');
  const spike2Metric: Metric = {
    service: 'web-service',
    metricType: MetricType.ERROR_COUNT,
    value: 15,
    windowStart: new Date(now + 20 * 60000),
    windowEnd: new Date(now + 21 * 60000),
  };

  const alerts2 = detector.detectAnomalies([spike2Metric]);

  console.log(`\nAlerts: ${alerts2.length}`);
  for (const alert of alerts2) {
    console.log(`  [${alert.severity}] ${alert.message}`);
    if (alert.message.includes('[Statistical Analysis]')) {
      console.log('  → Both detectors agree!');
    }
  }
}

/**
 * Example 5: Latency Anomaly Detection
 */
export function example5_LatencyDetection() {
  console.log('\n=== Example 5: Latency Anomaly Detection ===\n');

  const detector = new StatisticalAnomalyDetector();
  const now = Date.now();

  // Build latency baseline
  console.log('Building latency baseline (~100ms)...');
  const metrics: Metric[] = [];

  for (let i = 0; i < 20; i++) {
    metrics.push({
      service: 'database-service',
      metricType: MetricType.LATENCY_P95,
      value: 100 + (Math.random() - 0.5) * 10, // 100ms ± 5ms
      windowStart: new Date(now - (20 - i) * 60000),
      windowEnd: new Date(now - (20 - i) * 60000 + 60000),
    });
  }

  detector.detectAnomalies(metrics);

  const stats = detector.getBaselineStats('database-service', MetricType.LATENCY_P95);
  console.log(`Baseline: μ=${stats?.mean.toFixed(2)}ms, σ=${stats?.stdDev.toFixed(2)}ms`);

  // Test with latency spike
  console.log('\nTesting latency spike (500ms)...');
  const spikeMetric: Metric = {
    service: 'database-service',
    metricType: MetricType.LATENCY_P95,
    value: 500, // 5x baseline
    windowStart: new Date(now),
    windowEnd: new Date(now + 60000),
  };

  const alerts = detector.detectAnomalies([spikeMetric]);

  if (alerts.length > 0) {
    console.log(`\n✓ Latency anomaly detected!`);
    console.log(`  Severity: ${alerts[0].severity}`);
    console.log(`  ${alerts[0].message}`);
  }
}

/**
 * Example 6: Configuration Tuning
 */
export function example6_ConfigTuning() {
  console.log('\n=== Example 6: Configuration Tuning ===\n');

  // Strict detector (more sensitive)
  const strictDetector = new StatisticalAnomalyDetector({
    zScoreThreshold: 2.0, // 95% confidence instead of 99.7%
    rateOfChangeThreshold: 30, // 30% instead of 50%
    ewmaDeviationThreshold: 2.0,
  });

  // Lenient detector (less sensitive)
  const lenientDetector = new StatisticalAnomalyDetector({
    zScoreThreshold: 4.0, // Higher threshold
    rateOfChangeThreshold: 100, // 100% instead of 50%
    ewmaDeviationThreshold: 3.0,
  });

  const now = Date.now();

  // Build baseline
  const baselineMetrics: Metric[] = [];
  for (let i = 0; i < 20; i++) {
    baselineMetrics.push({
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: 10,
      windowStart: new Date(now - (20 - i) * 60000),
      windowEnd: new Date(now - (20 - i) * 60000 + 60000),
    });
  }

  strictDetector.detectAnomalies(baselineMetrics);
  lenientDetector.detectAnomalies(baselineMetrics);

  // Test moderate anomaly
  const moderateSpike: Metric = {
    service: 'test-service',
    metricType: MetricType.ERROR_COUNT,
    value: 18, // 80% increase
    windowStart: new Date(now),
    windowEnd: new Date(now + 60000),
  };

  console.log('Testing moderate spike (18 errors, 80% increase)...\n');

  const strictAlerts = strictDetector.detectAnomalies([moderateSpike]);
  console.log(`Strict detector: ${strictAlerts.length} alerts`);
  if (strictAlerts.length > 0) {
    console.log(`  → ${strictAlerts[0].message.split('.')[0]}`);
  }

  const lenientAlerts = lenientDetector.detectAnomalies([moderateSpike]);
  console.log(`Lenient detector: ${lenientAlerts.length} alerts`);
  if (lenientAlerts.length === 0) {
    console.log(`  → No anomaly detected (expected for lenient config)`);
  }
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Statistical Anomaly Detection - Usage Examples       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  example1_BasicDetection();
  example2_MultiService();
  example3_RateOfChange();
  example4_HybridMode();
  example5_LatencyDetection();
  example6_ConfigTuning();

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   Examples Complete                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
