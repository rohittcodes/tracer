import {
  Alert,
  AlertType,
  Severity,
  Metric,
  MetricType,
  LogEntry,
  LATENCY_THRESHOLD_MS,
  SERVICE_DOWNTIME_MINUTES,
} from '@tracer/core';
import { ErrorRateModel, ErrorRateModelConfig, ErrorSignal } from './error-rate-model';

export interface AnomalyDetectorOptions {
  bucketSizeMs?: number;
  baselineWindowMinutes?: number;
  minBaselineBuckets?: number;
  minStdDev?: number;
  minAbsoluteRateLift?: number;
  minErrorRate?: number;
  minErrorCount?: number;
  minTotalCount?: number;
  zScoreThreshold?: number;
  rateChangeWindowMinutes?: number;
  rateChangeThreshold?: number;
  alertCooldownMs?: number;
}

interface InternalConfig {
  bucketMs: number;
  baselineWindowMinutes: number;
  baselineWindowBuckets: number;
  minBaselineBuckets: number;
  minStdDev: number;
  minAbsoluteRateLift: number;
  minErrorRate: number;
  minErrorCount: number;
  minTotalCount: number;
  zScoreThreshold: number;
  rateChangeWindowMinutes: number;
  rateChangeWindowBuckets: number;
  rateChangeThreshold: number;
  alertCooldownMs: number;
}

const DEFAULT_OPTIONS: Required<AnomalyDetectorOptions> = {
  bucketSizeMs: 60_000,
  baselineWindowMinutes: 60,
  minBaselineBuckets: 5,
  minStdDev: 0.01,
  minAbsoluteRateLift: 0.02,
  minErrorRate: 0.02,
  minErrorCount: 5,
  minTotalCount: 20,
  zScoreThreshold: 3,
  rateChangeWindowMinutes: 5,
  rateChangeThreshold: 0.5,
  alertCooldownMs: 120_000,
};

export class AnomalyDetector {
  private readonly config: InternalConfig;
  private readonly errorModelConfig: ErrorRateModelConfig;
  private readonly errorModels = new Map<string, ErrorRateModel>();
  private readonly lastLogTime: Map<string, Date> = new Map();

  constructor(options: Partial<AnomalyDetectorOptions> = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const bucketMs = merged.bucketSizeMs;
    const baselineWindowBuckets = Math.max(
      1,
      Math.round(((merged.baselineWindowMinutes * 60 * 1000) / bucketMs))
    );
    const minBaselineBuckets = Math.min(merged.minBaselineBuckets, baselineWindowBuckets);
    const rateChangeWindowBuckets = Math.max(
      1,
      Math.round(((merged.rateChangeWindowMinutes * 60 * 1000) / bucketMs))
    );

    this.config = {
      bucketMs,
      baselineWindowMinutes: merged.baselineWindowMinutes,
      baselineWindowBuckets,
      minBaselineBuckets,
      minStdDev: merged.minStdDev,
      minAbsoluteRateLift: merged.minAbsoluteRateLift,
      minErrorRate: merged.minErrorRate,
      minErrorCount: merged.minErrorCount,
      minTotalCount: merged.minTotalCount,
      zScoreThreshold: merged.zScoreThreshold,
      rateChangeWindowMinutes: merged.rateChangeWindowMinutes,
      rateChangeWindowBuckets,
      rateChangeThreshold: merged.rateChangeThreshold,
      alertCooldownMs: merged.alertCooldownMs,
    };

    this.errorModelConfig = {
      bucketMs,
      baselineWindowBuckets,
      minBaselineBuckets,
      minStdDev: merged.minStdDev,
      minAbsoluteRateLift: merged.minAbsoluteRateLift,
      minErrorRate: merged.minErrorRate,
      minErrorCount: merged.minErrorCount,
      minTotalCount: merged.minTotalCount,
      zScoreThreshold: merged.zScoreThreshold,
      rocWindowBuckets: rateChangeWindowBuckets,
      rateChangeThreshold: merged.rateChangeThreshold,
      alertCooldownMs: merged.alertCooldownMs,
    };
  }

  observeLog(log: LogEntry): Alert[] {
    const model = this.getErrorModel(log.service);
    const isErrorLog = log.level === 'error' || log.level === 'fatal';
    const signals = model.observe(log.timestamp, isErrorLog);
    return signals.map((signal) => this.buildAlertFromSignal(log.service, signal));
  }

  detectAnomalies(metrics: Metric[]): Alert[] {
    const alerts: Alert[] = [];

    for (const metric of metrics) {
      if (metric.metricType === MetricType.LATENCY_P95 && metric.value > LATENCY_THRESHOLD_MS) {
        alerts.push({
          alertType: AlertType.HIGH_LATENCY,
          severity: this.getSeverityForLatency(metric.value),
          message: `High latency detected: P95 latency ${metric.value.toFixed(
            0
          )}ms in ${metric.service} (threshold: ${LATENCY_THRESHOLD_MS}ms)`,
          service: metric.service,
          resolved: false,
          createdAt: new Date(),
        });
      }
    }

    return alerts;
  }

  updateServiceActivity(service: string, timestamp: Date): Alert | null {
    this.lastLogTime.set(service, timestamp);
    return null;
  }

  checkServiceDowntime(now: Date): Alert[] {
    const alerts: Alert[] = [];
    const downtimeThreshold = SERVICE_DOWNTIME_MINUTES * 60 * 1000;

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

  private getErrorModel(service: string): ErrorRateModel {
    let model = this.errorModels.get(service);
    if (!model) {
      model = new ErrorRateModel(this.errorModelConfig);
      this.errorModels.set(service, model);
    }
    return model;
  }

  private buildAlertFromSignal(service: string, signal: ErrorSignal): Alert {
    const windowStart = new Date(signal.windowStartMs);
    const windowEnd = new Date(signal.windowEndMs);
    const ratePct = this.formatRate(signal.currentRate);
    const baselinePct = this.formatRate(signal.baselineMean);

    let message: string;
    if (signal.reason === 'z_score') {
      const zDescriptor =
        signal.zScore !== undefined
          ? `z=${signal.zScore.toFixed(2)}`
          : `Δ=${this.formatRate(signal.currentRate - signal.baselineMean)}`;
      message = `Statistical error anomaly detected for ${service}: error rate ${ratePct} vs baseline ${baselinePct} (${zDescriptor}).`;
    } else {
      const avgPct = this.formatRate(signal.recentAverageRate ?? 0);
      const changeDescriptor =
        signal.changeRatio === Number.POSITIVE_INFINITY
          ? 'from near-zero to significant volume'
          : `+${this.formatRatio(signal.changeRatio ?? 0)}`;
      message = `Error rate spike detected for ${service}: error rate ${ratePct} vs recent avg ${avgPct} (${changeDescriptor}).`;
    }

    message += ` Window ${windowStart.toISOString()} - ${windowEnd.toISOString()}, ${signal.errorCount}/${signal.totalCount} errors.`;

    return {
      alertType: AlertType.ERROR_SPIKE,
      severity: signal.severity,
      message,
      service,
      resolved: false,
      createdAt: windowEnd,
    };
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

  private formatRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }

  private formatRatio(ratio: number): string {
    return `${(ratio * 100).toFixed(1)}%`;
  }
}
