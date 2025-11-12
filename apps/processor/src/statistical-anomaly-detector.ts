import {
  Alert,
  AlertType,
  Severity,
  Metric,
  MetricType,
} from '@tracer/core';

/**
 * Circular buffer for efficient fixed-size time-series storage
 * O(1) insertions, no array shifts
 */
class CircularBuffer {
  private buffer: number[];
  private head: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  getValues(): number[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    // Reconstruct in chronological order
    const result = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
    }
    return result;
  }

  getSize(): number {
    return this.size;
  }

  isFull(): boolean {
    return this.size === this.capacity;
  }

  getLast(): number | undefined {
    if (this.size === 0) return undefined;
    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIndex];
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

/**
 * Efficient running statistics using Welford's algorithm
 * O(1) updates, numerically stable
 */
class RunningStats {
  private count: number = 0;
  private mean: number = 0;
  private m2: number = 0; // Sum of squared differences from mean

  update(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getMean(): number {
    return this.mean;
  }

  getVariance(): number {
    return this.count < 2 ? 0 : this.m2 / this.count;
  }

  getStdDev(): number {
    return Math.sqrt(this.getVariance());
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
  }
}

/**
 * Time-series baseline for a specific service and metric type
 * Learns normal behavior patterns over time
 */
class TimeSeriesBaseline {
  private readonly serviceKey: string;
  private readonly metricType: MetricType;
  private readonly history: CircularBuffer;
  private readonly stats: RunningStats;
  private lastValue: number | undefined;
  private lastUpdateTime: Date | undefined;

  // EWMA (Exponential Weighted Moving Average) state
  private ewma: number | undefined;
  private readonly alpha: number = 0.3; // Smoothing factor (0-1, higher = more weight to recent)

  constructor(
    serviceKey: string,
    metricType: MetricType,
    historySize: number = 60 // Default: 60 windows = 1 hour at 60s windows
  ) {
    this.serviceKey = serviceKey;
    this.metricType = metricType;
    this.history = new CircularBuffer(historySize);
    this.stats = new RunningStats();
  }

  /**
   * Update baseline with new metric value
   * O(1) complexity
   */
  update(value: number, timestamp: Date): void {
    this.history.push(value);
    this.stats.update(value);
    this.lastValue = value;
    this.lastUpdateTime = timestamp;

    // Update EWMA
    if (this.ewma === undefined) {
      this.ewma = value;
    } else {
      this.ewma = this.alpha * value + (1 - this.alpha) * this.ewma;
    }
  }

  /**
   * Calculate z-score for a value
   * z = (value - mean) / stddev
   * |z| > 3 typically indicates anomaly (99.7% confidence)
   */
  calculateZScore(value: number): number {
    const mean = this.stats.getMean();
    const stdDev = this.stats.getStdDev();

    if (stdDev === 0) {
      // No variation in data - if value differs from mean, it's anomalous
      return value === mean ? 0 : Infinity;
    }

    return (value - mean) / stdDev;
  }

  /**
   * Calculate rate of change from previous value
   * Returns percentage change
   */
  calculateRateOfChange(currentValue: number): number | undefined {
    if (this.lastValue === undefined) return undefined;

    if (this.lastValue === 0) {
      return currentValue > 0 ? Infinity : 0;
    }

    return ((currentValue - this.lastValue) / this.lastValue) * 100;
  }

  /**
   * Calculate deviation from EWMA
   * EWMA is less sensitive to spikes than simple mean
   */
  calculateEWMADeviation(value: number): number | undefined {
    if (this.ewma === undefined) return undefined;
    return Math.abs(value - this.ewma);
  }

  isReady(): boolean {
    // Need at least 10 data points for statistical significance
    return this.history.getSize() >= 10;
  }

  getMean(): number {
    return this.stats.getMean();
  }

  getStdDev(): number {
    return this.stats.getStdDev();
  }

  getEWMA(): number | undefined {
    return this.ewma;
  }

  getLastValue(): number | undefined {
    return this.lastValue;
  }

  getHistorySize(): number {
    return this.history.getSize();
  }
}

/**
 * Anomaly detection configuration
 */
interface AnomalyConfig {
  zScoreThreshold: number; // Typically 3.0 (99.7% confidence)
  rateOfChangeThreshold: number; // Percentage, e.g., 50 for 50% increase
  ewmaDeviationThreshold: number; // Multiple of stddev
  minHistorySize: number; // Minimum data points before detecting
}

/**
 * Anomaly detection result
 */
interface AnomalyResult {
  isAnomaly: boolean;
  score: number; // Anomaly score (higher = more anomalous)
  confidence: number; // 0-1, based on baseline size and deviation
  reason: string;
  baseline: {
    mean: number;
    stdDev: number;
    ewma?: number;
  };
  detected: {
    zScore?: number;
    rateOfChange?: number;
    ewmaDeviation?: number;
  };
}

/**
 * Statistical Anomaly Detector
 * High-performance anomaly detection with multiple strategies
 */
export class StatisticalAnomalyDetector {
  private baselines: Map<string, TimeSeriesBaseline> = new Map();
  private config: AnomalyConfig;

  // Performance tracking
  private totalProcessed: number = 0;
  private totalProcessingTimeMs: number = 0;

  constructor(config?: Partial<AnomalyConfig>) {
    this.config = {
      zScoreThreshold: 3.0, // 3 standard deviations
      rateOfChangeThreshold: 50, // 50% increase in 1 window
      ewmaDeviationThreshold: 2.5, // 2.5 stddev from EWMA
      minHistorySize: 10,
      ...config,
    };
  }

  /**
   * Process metrics and detect anomalies
   * Target: <10ms for batch of metrics
   */
  detectAnomalies(metrics: Metric[]): Alert[] {
    const startTime = performance.now();
    const alerts: Alert[] = [];

    for (const metric of metrics) {
      // Only process error counts and latency for anomaly detection
      if (
        metric.metricType !== MetricType.ERROR_COUNT &&
        metric.metricType !== MetricType.LATENCY_P95
      ) {
        continue;
      }

      const baselineKey = this.getBaselineKey(metric.service, metric.metricType);
      let baseline = this.baselines.get(baselineKey);

      if (!baseline) {
        baseline = new TimeSeriesBaseline(baselineKey, metric.metricType);
        this.baselines.set(baselineKey, baseline);
      }

      // Check for anomalies before updating baseline
      if (baseline.isReady()) {
        const result = this.analyzeMetric(metric, baseline);

        if (result.isAnomaly) {
          alerts.push(this.createAlert(metric, result));
        }
      }

      // Update baseline with current value
      baseline.update(metric.value, metric.windowEnd);
    }

    // Update performance stats
    const processingTime = performance.now() - startTime;
    this.totalProcessed += metrics.length;
    this.totalProcessingTimeMs += processingTime;

    return alerts;
  }

  /**
   * Analyze a single metric against its baseline
   * Uses multiple detection strategies
   */
  private analyzeMetric(metric: Metric, baseline: TimeSeriesBaseline): AnomalyResult {
    const value = metric.value;

    // Strategy 1: Z-Score Detection
    const zScore = baseline.calculateZScore(value);
    const isZScoreAnomaly = Math.abs(zScore) > this.config.zScoreThreshold;

    // Strategy 2: Rate of Change Detection
    const rateOfChange = baseline.calculateRateOfChange(value);
    const isRateAnomaly =
      rateOfChange !== undefined &&
      rateOfChange > this.config.rateOfChangeThreshold;

    // Strategy 3: EWMA Deviation Detection
    const ewmaDeviation = baseline.calculateEWMADeviation(value);
    const stdDev = baseline.getStdDev();
    const isEWMAAnomaly =
      ewmaDeviation !== undefined &&
      stdDev > 0 &&
      ewmaDeviation > (this.config.ewmaDeviationThreshold * stdDev);

    // Combine strategies
    const isAnomaly = isZScoreAnomaly || isRateAnomaly || isEWMAAnomaly;

    // Calculate anomaly score (0-100)
    const zScoreComponent = Math.min(Math.abs(zScore) / this.config.zScoreThreshold, 1) * 33;
    const rateComponent = rateOfChange !== undefined
      ? Math.min(Math.abs(rateOfChange) / this.config.rateOfChangeThreshold, 1) * 33
      : 0;
    const ewmaComponent = ewmaDeviation !== undefined && stdDev > 0
      ? Math.min(ewmaDeviation / (this.config.ewmaDeviationThreshold * stdDev), 1) * 34
      : 0;

    const score = zScoreComponent + rateComponent + ewmaComponent;

    // Calculate confidence (based on baseline size)
    const historySize = baseline.getHistorySize();
    const confidence = Math.min(historySize / 60, 1); // Full confidence at 60 windows

    // Generate reason
    let reason = '';
    if (isZScoreAnomaly) {
      reason += `Z-score ${zScore.toFixed(2)} exceeds threshold ${this.config.zScoreThreshold}. `;
    }
    if (isRateAnomaly) {
      reason += `Rate increased ${rateOfChange?.toFixed(1)}% (threshold ${this.config.rateOfChangeThreshold}%). `;
    }
    if (isEWMAAnomaly) {
      reason += `Deviation from trend: ${ewmaDeviation?.toFixed(2)} (threshold ${(this.config.ewmaDeviationThreshold * stdDev).toFixed(2)}). `;
    }

    return {
      isAnomaly,
      score,
      confidence,
      reason: reason.trim(),
      baseline: {
        mean: baseline.getMean(),
        stdDev: baseline.getStdDev(),
        ewma: baseline.getEWMA(),
      },
      detected: {
        zScore,
        rateOfChange,
        ewmaDeviation,
      },
    };
  }

  /**
   * Create alert from anomaly result
   */
  private createAlert(metric: Metric, result: AnomalyResult): Alert {
    const severity = this.calculateSeverity(result.score, result.confidence);

    const alertType =
      metric.metricType === MetricType.ERROR_COUNT
        ? AlertType.ERROR_SPIKE
        : AlertType.HIGH_LATENCY;

    const message = this.formatAlertMessage(metric, result);

    return {
      alertType,
      severity,
      message,
      service: metric.service,
      resolved: false,
      createdAt: metric.windowEnd,
    };
  }

  /**
   * Calculate severity based on anomaly score and confidence
   */
  private calculateSeverity(score: number, confidence: number): Severity {
    const weightedScore = score * confidence;

    if (weightedScore >= 80) {
      return Severity.CRITICAL;
    } else if (weightedScore >= 60) {
      return Severity.HIGH;
    } else if (weightedScore >= 40) {
      return Severity.MEDIUM;
    } else {
      return Severity.LOW;
    }
  }

  /**
   * Format alert message with statistical details
   */
  private formatAlertMessage(metric: Metric, result: AnomalyResult): string {
    const metricName = metric.metricType === MetricType.ERROR_COUNT ? 'error count' : 'P95 latency';
    const valueStr = metric.metricType === MetricType.ERROR_COUNT
      ? metric.value.toString()
      : `${metric.value}ms`;

    let msg = `Statistical anomaly detected: ${metricName} is ${valueStr} in ${metric.service}. `;
    msg += `Baseline: μ=${result.baseline.mean.toFixed(2)}, σ=${result.baseline.stdDev.toFixed(2)}. `;
    msg += result.reason;
    msg += ` (score: ${result.score.toFixed(1)}, confidence: ${(result.confidence * 100).toFixed(0)}%)`;

    return msg;
  }

  /**
   * Get unique key for baseline storage
   */
  private getBaselineKey(service: string, metricType: MetricType): string {
    return `${service}:${metricType}`;
  }

  /**
   * Get performance metrics
   */
  getPerformanceStats(): {
    totalProcessed: number;
    avgProcessingTimeMs: number;
    avgTimePerMetric: number;
  } {
    return {
      totalProcessed: this.totalProcessed,
      avgProcessingTimeMs: this.totalProcessingTimeMs / Math.max(1, this.totalProcessed),
      avgTimePerMetric: this.totalProcessingTimeMs / Math.max(1, this.totalProcessed),
    };
  }

  /**
   * Get baseline statistics for a service/metric (for debugging/monitoring)
   */
  getBaselineStats(service: string, metricType: MetricType) {
    const baselineKey = this.getBaselineKey(service, metricType);
    const baseline = this.baselines.get(baselineKey);

    if (!baseline) return null;

    return {
      mean: baseline.getMean(),
      stdDev: baseline.getStdDev(),
      ewma: baseline.getEWMA(),
      historySize: baseline.getHistorySize(),
      lastValue: baseline.getLastValue(),
      isReady: baseline.isReady(),
    };
  }

  /**
   * Clear all baselines (useful for testing)
   */
  clearBaselines(): void {
    this.baselines.clear();
  }
}
