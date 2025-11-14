import {
  Alert,
  AlertType,
  Severity,
  Metric,
  MetricType,
  ERROR_COUNT_THRESHOLD,
  LATENCY_THRESHOLD_MS,
  SERVICE_DOWNTIME_MINUTES,
  DEFAULT_METRIC_WINDOW_SECONDS,
} from '@tracer/core';

const BASELINE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const BASELINE_SAMPLE_INTERVAL_MS = 5000; // throttle baseline updates per service
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_SAMPLE_INTERVAL_MS = 1000; // allow fast detection without storing every log
const MIN_BASELINE_SAMPLES = 6;
const Z_SCORE_THRESHOLD = 3;
const MIN_STD_DEV = 0.1;
const RATE_OF_CHANGE_THRESHOLD = 0.5; // 50%
const HIGH_RATE_OF_CHANGE_THRESHOLD = 0.75;
const CRITICAL_RATE_OF_CHANGE_THRESHOLD = 1.0;
const MIN_RATE_CHANGE_DURATION_MS = 2 * 60 * 1000; // need at least 2 minutes between oldest and newest samples
const MIN_RATE_CHANGE_BASE_RATE = 0.1; // avoid infinite ratios while still catching low baseline spikes

const severityPriority: Record<Severity, number> = {
  [Severity.LOW]: 0,
  [Severity.MEDIUM]: 1,
  [Severity.HIGH]: 2,
  [Severity.CRITICAL]: 3,
};

interface Sample {
  timestamp: number;
  value: number;
}

class RollingWindowStats {
  private samples: Sample[] = [];
  private head = 0;
  private sum = 0;
  private sumSquares = 0;

  constructor(private readonly windowMs: number) {}

  addSample(value: number, timestamp: number): void {
    this.samples.push({ timestamp, value });
    this.sum += value;
    this.sumSquares += value * value;
    this.prune(timestamp);
  }

  count(): number {
    return this.samples.length - this.head;
  }

  mean(): number {
    const count = this.count();
    return count > 0 ? this.sum / count : 0;
  }

  stdDev(): number {
    const count = this.count();
    if (count <= 1) {
      return 0;
    }
    const mean = this.mean();
    const variance = this.sumSquares / count - mean * mean;
    return Math.sqrt(Math.max(variance, 0));
  }

  private prune(nowMs: number): void {
    while (this.head < this.samples.length && nowMs - this.samples[this.head].timestamp > this.windowMs) {
      const sample = this.samples[this.head];
      this.sum -= sample.value;
      this.sumSquares -= sample.value * sample.value;
      this.head++;
    }

    // Periodically compact the buffer to avoid unbounded growth
    if (this.head > 0 && this.head === this.samples.length) {
      this.samples = [];
      this.head = 0;
    } else if (this.head > 0 && this.head > this.samples.length / 2) {
      this.samples = this.samples.slice(this.head);
      this.head = 0;
    }
  }
}

interface RateChangeAssessment {
  ratio: number;
  fromRate: number;
  toRate: number;
  durationMs: number;
}

class RateOfChangeWindow {
  private samples: Sample[] = [];
  private head = 0;

  constructor(private readonly windowMs: number) {}

  addSample(value: number, timestamp: number): RateChangeAssessment | null {
    this.samples.push({ timestamp, value });
    this.prune(timestamp);

    const count = this.samples.length - this.head;
    if (count < 2) {
      return null;
    }

    const oldest = this.samples[this.head];
    const newest = this.samples[this.samples.length - 1];
    const durationMs = newest.timestamp - oldest.timestamp;

    if (durationMs < MIN_RATE_CHANGE_DURATION_MS) {
      return null;
    }

    const denominator = Math.max(oldest.value, MIN_RATE_CHANGE_BASE_RATE);
    const ratio = (newest.value - oldest.value) / denominator;

    if (ratio >= RATE_OF_CHANGE_THRESHOLD) {
      return {
        ratio,
        fromRate: oldest.value,
        toRate: newest.value,
        durationMs,
      };
    }

    return null;
  }

  private prune(nowMs: number): void {
    while (this.head < this.samples.length && nowMs - this.samples[this.head].timestamp > this.windowMs) {
      this.head++;
    }

    if (this.head > 0 && this.head === this.samples.length) {
      this.samples = [];
      this.head = 0;
    } else if (this.head > 0 && this.head > this.samples.length / 2) {
      this.samples = this.samples.slice(this.head);
      this.head = 0;
    }
  }
}

class ServiceErrorState {
  readonly baselineStats = new RollingWindowStats(BASELINE_WINDOW_MS);
  readonly rateWindow = new RateOfChangeWindow(RATE_WINDOW_MS);
  private lastBaselineSampleMs = 0;
  private lastRateSampleMs = 0;

  baselineReady(): boolean {
    return this.baselineStats.count() >= MIN_BASELINE_SAMPLES;
  }

  addBaselineSample(rate: number, timestampMs: number): void {
    if (this.lastBaselineSampleMs === 0 || timestampMs - this.lastBaselineSampleMs >= BASELINE_SAMPLE_INTERVAL_MS) {
      this.baselineStats.addSample(rate, timestampMs);
      this.lastBaselineSampleMs = timestampMs;
    }
  }

  addRateSample(rate: number, timestampMs: number): RateChangeAssessment | null {
    if (this.lastRateSampleMs === 0 || timestampMs - this.lastRateSampleMs >= RATE_SAMPLE_INTERVAL_MS) {
      this.lastRateSampleMs = timestampMs;
      return this.rateWindow.addSample(rate, timestampMs);
    }
    return null;
  }
}

export class AnomalyDetector {
  private lastLogTime: Map<string, Date> = new Map();
  private serviceErrorStates: Map<string, ServiceErrorState> = new Map();

  /**
   * Check metrics for anomalies and generate alerts
   */
  detectAnomalies(metrics: Metric[]): Alert[] {
    const alerts: Alert[] = [];

    for (const metric of metrics) {
      if (metric.metricType === MetricType.ERROR_COUNT) {
        const alert = this.handleErrorMetric(metric);
        if (alert) {
          alerts.push(alert);
        }
      }

      if (metric.metricType === MetricType.LATENCY_P95 && metric.value > LATENCY_THRESHOLD_MS) {
        alerts.push({
          alertType: AlertType.HIGH_LATENCY,
          severity: this.getSeverityForLatency(metric.value),
          message: `High latency detected: P95 latency ${metric.value}ms in ${metric.service} (threshold: ${LATENCY_THRESHOLD_MS}ms)`,
          service: metric.service,
          resolved: false,
          createdAt: new Date(),
        });
      }
    }

    return alerts;
  }

  /**
   * Update last log time for a service and check for service downtime
   */
  updateServiceActivity(service: string, timestamp: Date): Alert | null {
    this.lastLogTime.set(service, timestamp);
    return null; // Service is active, no alert
  }

  /**
   * Check for service downtime (no logs for X minutes)
   */
  checkServiceDowntime(now: Date): Alert[] {
    const alerts: Alert[] = [];
    const downtimeThreshold = SERVICE_DOWNTIME_MINUTES * 60 * 1000; // Convert to milliseconds

    for (const [service, lastTime] of this.lastLogTime.entries()) {
      const timeSinceLastLog = now.getTime() - lastTime.getTime();
      
      if (timeSinceLastLog > downtimeThreshold) {
        alerts.push({
          alertType: AlertType.SERVICE_DOWN,
          severity: Severity.HIGH,
          message: `Service ${service} appears to be down - no logs for ${SERVICE_DOWNTIME_MINUTES} minutes`,
          service,
          resolved: false,
          createdAt: now,
        });
      }
    }

    return alerts;
  }

  private handleErrorMetric(metric: Metric): Alert | null {
    const state = this.getServiceErrorState(metric.service);
    const timestampMs = this.getMetricTimestamp(metric);
    const errorRate = this.computeErrorRate(metric, timestampMs);

    const reasons: string[] = [];
    let severity: Severity | null = null;

    const zScoreInfo = this.evaluateZScore(state, errorRate);
    if (zScoreInfo) {
      severity = this.pickSeverity(severity, this.getSeverityForZScore(zScoreInfo.zScore));
      reasons.push(
        `z-score ${zScoreInfo.zScore.toFixed(2)} (baseline ${zScoreInfo.mean.toFixed(2)}/s, σ=${zScoreInfo.stdDev.toFixed(2)})`
      );
    }

    const rateChange = state.addRateSample(errorRate, timestampMs);
    if (rateChange) {
      const rateSeverity = this.getSeverityForRateChange(rateChange.ratio);
      severity = this.pickSeverity(severity, rateSeverity);
      reasons.push(
        `rate increased ${Math.round(rateChange.ratio * 100)}% over ${(rateChange.durationMs / 1000).toFixed(0)}s ` +
        `(from ${rateChange.fromRate.toFixed(2)}/s to ${rateChange.toRate.toFixed(2)}/s)`
      );
    }

    state.addBaselineSample(errorRate, timestampMs);

    if (reasons.length > 0) {
      return {
        alertType: AlertType.ERROR_SPIKE,
        severity: severity ?? Severity.MEDIUM,
        message: `Statistical error anomaly in ${metric.service}: ${reasons.join('; ')}. Current rate ${errorRate.toFixed(2)}/s.`,
        service: metric.service,
        resolved: false,
        createdAt: new Date(),
      };
    }

    if (!state.baselineReady() && metric.value > ERROR_COUNT_THRESHOLD) {
      return {
        alertType: AlertType.ERROR_SPIKE,
        severity: this.getSeverityForErrorCount(metric.value),
        message: `Error spike detected: ${metric.value} errors in ${metric.service} (static threshold ${ERROR_COUNT_THRESHOLD})`,
        service: metric.service,
        resolved: false,
        createdAt: new Date(),
      };
    }

    return null;
  }

  private computeErrorRate(metric: Metric, timestampMs: number): number {
    const windowStartMs =
      metric.windowStart?.getTime() ?? timestampMs - DEFAULT_METRIC_WINDOW_SECONDS * 1000;
    const windowEndMs = metric.windowEnd?.getTime() ?? timestampMs;
    const windowDurationSeconds = Math.max((windowEndMs - windowStartMs) / 1000, 1);
    return metric.value / windowDurationSeconds;
  }

  private evaluateZScore(state: ServiceErrorState, rate: number): { zScore: number; mean: number; stdDev: number } | null {
    if (!state.baselineReady()) {
      return null;
    }

    const mean = state.baselineStats.mean();
    const stdDev = Math.max(state.baselineStats.stdDev(), MIN_STD_DEV);

    if (stdDev === 0) {
      return null;
    }

    const zScore = (rate - mean) / stdDev;
    if (zScore >= Z_SCORE_THRESHOLD) {
      return { zScore, mean, stdDev };
    }

    return null;
  }

  private getSeverityForRateChange(ratio: number): Severity {
    if (ratio >= CRITICAL_RATE_OF_CHANGE_THRESHOLD) {
      return Severity.CRITICAL;
    }
    if (ratio >= HIGH_RATE_OF_CHANGE_THRESHOLD) {
      return Severity.HIGH;
    }
    return Severity.MEDIUM;
  }

  private getSeverityForZScore(zScore: number): Severity {
    if (zScore >= 4.0) {
      return Severity.CRITICAL;
    }
    if (zScore >= 3.5) {
      return Severity.HIGH;
    }
    return Severity.MEDIUM;
  }

  private pickSeverity(current: Severity | null, candidate: Severity): Severity {
    if (!current) {
      return candidate;
    }
    return severityPriority[candidate] > severityPriority[current] ? candidate : current;
  }

  private getMetricTimestamp(metric: Metric): number {
    if (metric.windowEnd) {
      return metric.windowEnd.getTime();
    }
    if (metric.windowStart) {
      return metric.windowStart.getTime();
    }
    return Date.now();
  }

  private getServiceErrorState(service: string): ServiceErrorState {
    let state = this.serviceErrorStates.get(service);
    if (!state) {
      state = new ServiceErrorState();
      this.serviceErrorStates.set(service, state);
    }
    return state;
  }

  private getSeverityForErrorCount(errorCount: number): Severity {
    if (errorCount > ERROR_COUNT_THRESHOLD * 5) {
      return Severity.CRITICAL;
    } else if (errorCount > ERROR_COUNT_THRESHOLD * 2) {
      return Severity.HIGH;
    } else {
      return Severity.MEDIUM;
    }
  }

  private getSeverityForLatency(latency: number): Severity {
    if (latency > LATENCY_THRESHOLD_MS * 3) {
      return Severity.CRITICAL;
    } else if (latency > LATENCY_THRESHOLD_MS * 2) {
      return Severity.HIGH;
    } else {
      return Severity.MEDIUM;
    }
  }
}
