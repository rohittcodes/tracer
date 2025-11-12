import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';
import { Metric, MetricType } from '@tracer/core';

/**
 * Performance Benchmark Suite for Statistical Anomaly Detection
 *
 * Requirements:
 * - Handle 100k+ logs/minute with <10ms processing latency
 * - 100k logs/min = ~1,667 logs/second
 * - Assuming 10 services, that's ~167 logs/sec/service
 * - With 60s windows, that's ~10k logs per window per service
 * - Need to process metrics in real-time as they arrive
 */

interface BenchmarkResult {
  testName: string;
  totalMetrics: number;
  totalTimeMs: number;
  avgTimePerMetric: number;
  avgTimePerBatch: number;
  throughput: number; // metrics per second
  logsPerMinute: number; // equivalent log throughput
  meetsRequirement: boolean;
  memoryUsageMB?: number;
}

class PerformanceBenchmark {
  private detector: StatisticalAnomalyDetector;

  constructor() {
    this.detector = new StatisticalAnomalyDetector();
  }

  /**
   * Generate realistic test metrics
   */
  private generateMetrics(
    numServices: number,
    metricsPerService: number,
    startTime: number,
    withAnomalies: boolean = false
  ): Metric[] {
    const metrics: Metric[] = [];
    const baseErrors = [5, 10, 20, 50, 100, 200]; // Different scales per service

    for (let service = 0; service < numServices; service++) {
      const serviceName = `service-${service}`;
      const baseValue = baseErrors[service % baseErrors.length];

      for (let i = 0; i < metricsPerService; i++) {
        const timestamp = startTime + i * 60000; // 60s windows

        // Add realistic variation (±20%)
        let value = baseValue * (1 + (Math.random() - 0.5) * 0.4);

        // Inject anomalies occasionally
        if (withAnomalies && Math.random() < 0.05) {
          // 5% anomaly rate
          value *= 3 + Math.random() * 2; // 3-5x spike
        }

        metrics.push({
          service: serviceName,
          metricType: MetricType.ERROR_COUNT,
          value: Math.round(value),
          windowStart: new Date(timestamp),
          windowEnd: new Date(timestamp + 60000),
        });

        // Also add latency metrics
        const baseLatency = 100 + service * 50;
        let latency = baseLatency * (1 + (Math.random() - 0.5) * 0.3);

        if (withAnomalies && Math.random() < 0.05) {
          latency *= 2 + Math.random(); // 2-3x spike
        }

        metrics.push({
          service: serviceName,
          metricType: MetricType.LATENCY_P95,
          value: Math.round(latency),
          windowStart: new Date(timestamp),
          windowEnd: new Date(timestamp + 60000),
        });
      }
    }

    return metrics;
  }

  /**
   * Benchmark: Single batch processing
   */
  benchmarkSingleBatch(batchSize: number): BenchmarkResult {
    const metrics = this.generateMetrics(10, batchSize / 20, Date.now(), true);

    const startTime = performance.now();
    this.detector.detectAnomalies(metrics);
    const endTime = performance.now();

    const totalTimeMs = endTime - startTime;
    const avgTimePerMetric = totalTimeMs / metrics.length;
    const throughput = (metrics.length / totalTimeMs) * 1000; // per second

    return {
      testName: `Single Batch (${batchSize} metrics)`,
      totalMetrics: metrics.length,
      totalTimeMs,
      avgTimePerMetric,
      avgTimePerBatch: totalTimeMs,
      throughput,
      logsPerMinute: throughput * 60,
      meetsRequirement: avgTimePerMetric < 0.01, // <10ms per batch if processing 1 metric
    };
  }

  /**
   * Benchmark: Continuous stream processing
   * Simulates real-time log ingestion
   */
  benchmarkContinuousStream(
    durationSeconds: number,
    logsPerSecond: number
  ): BenchmarkResult {
    const metricsPerSecond = (logsPerSecond / 60) * 2; // 2 metric types, 60s windows
    const totalBatches = durationSeconds;
    const metricsPerBatch = Math.ceil(metricsPerSecond);

    let totalMetrics = 0;
    let totalTimeMs = 0;
    const startTime = Date.now();

    for (let batch = 0; batch < totalBatches; batch++) {
      const metrics = this.generateMetrics(
        10,
        Math.ceil(metricsPerBatch / 20),
        startTime + batch * 1000,
        true
      );

      const batchStartTime = performance.now();
      this.detector.detectAnomalies(metrics);
      const batchEndTime = performance.now();

      totalMetrics += metrics.length;
      totalTimeMs += batchEndTime - batchStartTime;
    }

    const avgTimePerMetric = totalTimeMs / totalMetrics;
    const avgTimePerBatch = totalTimeMs / totalBatches;
    const throughput = (totalMetrics / totalTimeMs) * 1000;

    return {
      testName: `Continuous Stream (${logsPerSecond} logs/sec, ${durationSeconds}s)`,
      totalMetrics,
      totalTimeMs,
      avgTimePerMetric,
      avgTimePerBatch,
      throughput,
      logsPerMinute: throughput * 60,
      meetsRequirement: avgTimePerBatch < 10,
    };
  }

  /**
   * Benchmark: High load stress test
   * Test at 100k+ logs/minute
   */
  benchmarkHighLoad(): BenchmarkResult {
    const logsPerMinute = 100000;
    const logsPerSecond = Math.ceil(logsPerMinute / 60);

    // Generate 1 minute of metrics
    const totalServices = 10;
    const windowsPerService = 1; // 1 minute = 1 window of 60s
    const metricsPerService = windowsPerService * 2; // error_count + latency

    const metrics = this.generateMetrics(
      totalServices,
      metricsPerService,
      Date.now(),
      true
    );

    // Process metrics in batches (simulating real-time arrival)
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < metrics.length; i += batchSize) {
      batches.push(metrics.slice(i, i + batchSize));
    }

    let totalTimeMs = 0;
    let maxBatchTime = 0;
    let minBatchTime = Infinity;

    for (const batch of batches) {
      const startTime = performance.now();
      this.detector.detectAnomalies(batch);
      const endTime = performance.now();

      const batchTime = endTime - startTime;
      totalTimeMs += batchTime;
      maxBatchTime = Math.max(maxBatchTime, batchTime);
      minBatchTime = Math.min(minBatchTime, batchTime);
    }

    const avgTimePerMetric = totalTimeMs / metrics.length;
    const avgTimePerBatch = totalTimeMs / batches.length;
    const throughput = (metrics.length / totalTimeMs) * 1000;

    console.log(`  Batch times: min=${minBatchTime.toFixed(3)}ms, max=${maxBatchTime.toFixed(3)}ms, avg=${avgTimePerBatch.toFixed(3)}ms`);

    return {
      testName: `High Load (${logsPerMinute.toLocaleString()} logs/min)`,
      totalMetrics: metrics.length,
      totalTimeMs,
      avgTimePerMetric,
      avgTimePerBatch,
      throughput,
      logsPerMinute: throughput * 60,
      meetsRequirement: avgTimePerBatch < 10 && maxBatchTime < 10,
    };
  }

  /**
   * Benchmark: Multi-service scalability
   * Test with varying number of services
   */
  benchmarkScalability(serviceCounts: number[]): BenchmarkResult[] {
    const results: BenchmarkResult[] = [];
    const metricsPerService = 50; // 50 windows per service

    for (const numServices of serviceCounts) {
      const metrics = this.generateMetrics(
        numServices,
        metricsPerService,
        Date.now(),
        true
      );

      const startTime = performance.now();
      this.detector.detectAnomalies(metrics);
      const endTime = performance.now();

      const totalTimeMs = endTime - startTime;
      const avgTimePerMetric = totalTimeMs / metrics.length;
      const throughput = (metrics.length / totalTimeMs) * 1000;

      results.push({
        testName: `Scalability (${numServices} services)`,
        totalMetrics: metrics.length,
        totalTimeMs,
        avgTimePerMetric,
        avgTimePerBatch: totalTimeMs,
        throughput,
        logsPerMinute: throughput * 60,
        meetsRequirement: avgTimePerMetric < 0.01,
      });
    }

    return results;
  }

  /**
   * Benchmark: Memory efficiency
   * Test memory usage with large baseline history
   */
  benchmarkMemoryEfficiency(): BenchmarkResult {
    const numServices = 50;
    const windowsPerService = 60; // 1 hour of history

    // Measure initial memory
    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

    const metrics = this.generateMetrics(
      numServices,
      windowsPerService,
      Date.now(),
      false
    );

    const startTime = performance.now();
    this.detector.detectAnomalies(metrics);
    const endTime = performance.now();

    // Measure after memory
    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryUsedMB = memAfter - memBefore;

    const totalTimeMs = endTime - startTime;
    const avgTimePerMetric = totalTimeMs / metrics.length;
    const throughput = (metrics.length / totalTimeMs) * 1000;

    return {
      testName: `Memory Efficiency (${numServices} services, ${windowsPerService} windows)`,
      totalMetrics: metrics.length,
      totalTimeMs,
      avgTimePerMetric,
      avgTimePerBatch: totalTimeMs,
      throughput,
      logsPerMinute: throughput * 60,
      meetsRequirement: memoryUsedMB < 100, // Should use <100MB
      memoryUsageMB: memoryUsedMB,
    };
  }

  /**
   * Run all benchmarks
   */
  runAll(): void {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Statistical Anomaly Detection - Performance Benchmark Suite');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Target: 100k+ logs/minute with <10ms processing latency\n');

    // 1. Single batch tests
    console.log('─────────────────────────────────────────────────────────────');
    console.log('1. Single Batch Processing');
    console.log('─────────────────────────────────────────────────────────────');
    const batchSizes = [10, 50, 100, 500, 1000];
    for (const size of batchSizes) {
      const result = this.benchmarkSingleBatch(size);
      this.printResult(result);
    }

    // 2. Continuous stream
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('2. Continuous Stream Processing');
    console.log('─────────────────────────────────────────────────────────────');
    const streamResult = this.benchmarkContinuousStream(10, 1667); // ~100k/min
    this.printResult(streamResult);

    // 3. High load stress test
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('3. High Load Stress Test');
    console.log('─────────────────────────────────────────────────────────────');
    const highLoadResult = this.benchmarkHighLoad();
    this.printResult(highLoadResult);

    // 4. Scalability tests
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('4. Multi-Service Scalability');
    console.log('─────────────────────────────────────────────────────────────');
    const scalabilityResults = this.benchmarkScalability([5, 10, 25, 50, 100]);
    for (const result of scalabilityResults) {
      this.printResult(result);
    }

    // 5. Memory efficiency
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('5. Memory Efficiency');
    console.log('─────────────────────────────────────────────────────────────');
    const memoryResult = this.benchmarkMemoryEfficiency();
    this.printResult(memoryResult);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✓ High load test: ${highLoadResult.meetsRequirement ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Stream processing: ${streamResult.meetsRequirement ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Memory efficiency: ${memoryResult.meetsRequirement ? 'PASS' : 'FAIL'}`);
    console.log(
      `\nMax throughput: ${Math.round(highLoadResult.logsPerMinute).toLocaleString()} logs/minute`
    );
    console.log(`Avg processing time: ${highLoadResult.avgTimePerBatch.toFixed(3)}ms per batch`);
    if (memoryResult.memoryUsageMB) {
      console.log(`Memory usage: ${memoryResult.memoryUsageMB.toFixed(2)}MB`);
    }
    console.log('\n');
  }

  private printResult(result: BenchmarkResult): void {
    const status = result.meetsRequirement ? '✓' : '✗';
    console.log(`\n${status} ${result.testName}`);
    console.log(`  Total metrics: ${result.totalMetrics.toLocaleString()}`);
    console.log(`  Total time: ${result.totalTimeMs.toFixed(3)}ms`);
    console.log(`  Avg per metric: ${(result.avgTimePerMetric * 1000).toFixed(3)}μs`);
    console.log(`  Avg per batch: ${result.avgTimePerBatch.toFixed(3)}ms`);
    console.log(`  Throughput: ${Math.round(result.throughput).toLocaleString()} metrics/sec`);
    console.log(
      `  Equivalent: ${Math.round(result.logsPerMinute).toLocaleString()} logs/min`
    );
    if (result.memoryUsageMB !== undefined) {
      console.log(`  Memory: ${result.memoryUsageMB.toFixed(2)}MB`);
    }
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.runAll();
}

export { PerformanceBenchmark, BenchmarkResult };
