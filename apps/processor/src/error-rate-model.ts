import { Severity } from '@tracer/core';

export type ErrorSignalReason = 'z_score' | 'rate_change';

export interface ErrorSignal {
  reason: ErrorSignalReason;
  severity: Severity;
  currentRate: number;
  baselineMean: number;
  baselineStdDev: number;
  baselineSampleCount: number;
  windowStartMs: number;
  windowEndMs: number;
  errorCount: number;
  totalCount: number;
  zScore?: number;
  changeRatio?: number;
  recentAverageRate?: number;
  partial: boolean;
}

export interface ErrorRateModelConfig {
  bucketMs: number;
  baselineWindowBuckets: number;
  minBaselineBuckets: number;
  minStdDev: number;
  minAbsoluteRateLift: number;
  minErrorRate: number;
  minErrorCount: number;
  minTotalCount: number;
  zScoreThreshold: number;
  rocWindowBuckets: number;
  rateChangeThreshold: number;
  alertCooldownMs: number;
}

interface EvaluateContext {
  windowStartMs: number;
  windowEndMs: number;
  errorCount: number;
  totalCount: number;
  partial: boolean;
}

interface AlertState {
  zScore: boolean;
  rateChange: boolean;
}

interface AlertTimestamps {
  zScore: number;
  rateChange: number;
}

export class ErrorRateModel {
  private readonly baselineRates: number[];
  private readonly recentRates: number[];
  private baselineIndex = 0;
  private baselineCount = 0;
  private baselineSum = 0;
  private baselineSumSquares = 0;
  private recentIndex = 0;
  private recentCount = 0;
  private recentSum = 0;
  private bucketStartMs: number | null = null;
  private currentErrorCount = 0;
  private currentTotalCount = 0;
  private readonly alertedThisBucket: AlertState = { zScore: false, rateChange: false };
  private readonly lastAlertAt: AlertTimestamps = { zScore: 0, rateChange: 0 };
  private readonly maxBucketAdvance: number;

  constructor(private readonly config: ErrorRateModelConfig) {
    this.baselineRates = new Array(config.baselineWindowBuckets).fill(0);
    this.recentRates = new Array(config.rocWindowBuckets).fill(0);
    this.maxBucketAdvance = config.baselineWindowBuckets + config.rocWindowBuckets;
  }

  observe(timestamp: Date, isError: boolean): ErrorSignal[] {
    const ts = timestamp.getTime();
    if (this.bucketStartMs === null) {
      this.bucketStartMs = this.alignBucket(ts);
    }

    const signals: ErrorSignal[] = [];
    signals.push(...this.advanceBuckets(ts));

    // Update current bucket counts
    this.currentTotalCount += 1;
    if (isError) {
      this.currentErrorCount += 1;
    }

    const rate = this.currentTotalCount > 0 ? this.currentErrorCount / this.currentTotalCount : 0;
    const context: EvaluateContext = {
      windowStartMs: this.bucketStartMs!,
      windowEndMs: ts,
      errorCount: this.currentErrorCount,
      totalCount: this.currentTotalCount,
      partial: true,
    };
    signals.push(...this.evaluateRate(rate, context));

    return signals;
  }

  private advanceBuckets(ts: number): ErrorSignal[] {
    const signals: ErrorSignal[] = [];
    if (this.bucketStartMs === null) {
      return signals;
    }

    const bucketsElapsed = Math.floor((ts - this.bucketStartMs) / this.config.bucketMs);
    if (bucketsElapsed > this.maxBucketAdvance) {
      // Large gap - reset history to avoid stale baselines
      this.resetModel(this.alignBucket(ts));
      return signals;
    }

    while (ts >= this.bucketStartMs + this.config.bucketMs) {
      const bucketEnd = this.bucketStartMs + this.config.bucketMs;
      const rate =
        this.currentTotalCount > 0 ? this.currentErrorCount / this.currentTotalCount : 0;

      const context: EvaluateContext = {
        windowStartMs: this.bucketStartMs,
        windowEndMs: bucketEnd,
        errorCount: this.currentErrorCount,
        totalCount: this.currentTotalCount,
        partial: false,
      };

      signals.push(...this.evaluateRate(rate, context));
      this.addBaselineRate(rate);
      this.addRecentRate(rate);
      this.resetBucketState(bucketEnd);
    }

    return signals;
  }

  private evaluateRate(rate: number, context: EvaluateContext): ErrorSignal[] {
    const { errorCount, totalCount, partial, windowStartMs, windowEndMs } = context;
    const signals: ErrorSignal[] = [];
    const sufficientVolume =
      totalCount >= this.config.minTotalCount || (!partial && errorCount >= this.config.minErrorCount);

    if (!sufficientVolume && partial) {
      return signals;
    }

    const baselineReady = this.baselineCount >= this.config.minBaselineBuckets;
    const nowMs = windowEndMs;

    if (
      baselineReady &&
      !this.alertedThisBucket.zScore &&
      nowMs - this.lastAlertAt.zScore >= this.config.alertCooldownMs &&
      sufficientVolume &&
      rate >= this.config.minErrorRate
    ) {
      const mean = this.baselineSum / this.baselineCount;
      const variance = Math.max(this.baselineSumSquares / this.baselineCount - mean * mean, 0);
      const stdDev = Math.sqrt(variance);
      const delta = rate - mean;

      if (delta > 0) {
        if (stdDev >= this.config.minStdDev) {
          const zScore = delta / stdDev;
          if (zScore >= this.config.zScoreThreshold) {
            const severity = this.severityFromZScore(zScore);
            signals.push({
              reason: 'z_score',
              severity,
              currentRate: rate,
              baselineMean: mean,
              baselineStdDev: stdDev,
              baselineSampleCount: this.baselineCount,
              windowStartMs,
              windowEndMs,
              errorCount,
              totalCount,
              zScore,
              partial,
            });
            this.alertedThisBucket.zScore = true;
            this.lastAlertAt.zScore = nowMs;
          }
        } else if (delta >= this.config.minAbsoluteRateLift) {
          const severity = this.severityFromAbsoluteLift(delta);
          signals.push({
            reason: 'z_score',
            severity,
            currentRate: rate,
            baselineMean: mean,
            baselineStdDev: stdDev,
            baselineSampleCount: this.baselineCount,
            windowStartMs,
            windowEndMs,
            errorCount,
            totalCount,
            partial,
          });
          this.alertedThisBucket.zScore = true;
          this.lastAlertAt.zScore = nowMs;
        }
      }
    }

    if (
      !this.alertedThisBucket.rateChange &&
      nowMs - this.lastAlertAt.rateChange >= this.config.alertCooldownMs &&
      sufficientVolume &&
      rate >= this.config.minErrorRate
    ) {
      if (this.recentCount >= this.config.rocWindowBuckets) {
        const average = this.recentSum / this.recentCount;
        if (average > 0) {
          const ratio = rate / average - 1;
          if (ratio >= this.config.rateChangeThreshold) {
            const severity = this.severityFromChangeRatio(ratio);
            signals.push({
              reason: 'rate_change',
              severity,
              currentRate: rate,
              baselineMean: this.baselineCount > 0 ? this.baselineSum / this.baselineCount : 0,
              baselineStdDev:
                this.baselineCount > 0
                  ? Math.sqrt(
                      Math.max(
                        this.baselineSumSquares / this.baselineCount -
                          (this.baselineSum / this.baselineCount) ** 2,
                        0
                      )
                    )
                  : 0,
              baselineSampleCount: this.baselineCount,
              windowStartMs,
              windowEndMs,
              errorCount,
              totalCount,
              changeRatio: ratio,
              recentAverageRate: average,
              partial,
            });
            this.alertedThisBucket.rateChange = true;
            this.lastAlertAt.rateChange = nowMs;
          }
        } else if (rate >= this.config.minErrorRate) {
          // Previously zero average, now non-zero rate -> treat as large spike
          const severity = Severity.CRITICAL;
          signals.push({
            reason: 'rate_change',
            severity,
            currentRate: rate,
            baselineMean: 0,
            baselineStdDev: 0,
            baselineSampleCount: this.baselineCount,
            windowStartMs,
            windowEndMs,
            errorCount,
            totalCount,
            changeRatio: Number.POSITIVE_INFINITY,
            recentAverageRate: 0,
            partial,
          });
          this.alertedThisBucket.rateChange = true;
          this.lastAlertAt.rateChange = nowMs;
        }
      }
    }

    return signals;
  }

  private addBaselineRate(rate: number): void {
    if (this.config.baselineWindowBuckets === 0) {
      return;
    }

    if (this.baselineCount < this.config.baselineWindowBuckets) {
      this.baselineRates[this.baselineIndex] = rate;
      this.baselineCount += 1;
      this.baselineSum += rate;
      this.baselineSumSquares += rate * rate;
    } else {
      const old = this.baselineRates[this.baselineIndex];
      this.baselineRates[this.baselineIndex] = rate;
      this.baselineSum += rate - old;
      this.baselineSumSquares += rate * rate - old * old;
    }

    this.baselineIndex = (this.baselineIndex + 1) % this.config.baselineWindowBuckets;
  }

  private addRecentRate(rate: number): void {
    if (this.config.rocWindowBuckets === 0) {
      return;
    }

    if (this.recentCount < this.config.rocWindowBuckets) {
      this.recentRates[this.recentIndex] = rate;
      this.recentCount += 1;
      this.recentSum += rate;
    } else {
      const old = this.recentRates[this.recentIndex];
      this.recentRates[this.recentIndex] = rate;
      this.recentSum += rate - old;
    }

    this.recentIndex = (this.recentIndex + 1) % this.config.rocWindowBuckets;
  }

  private resetBucketState(nextBucketStart: number): void {
    this.bucketStartMs = nextBucketStart;
    this.currentErrorCount = 0;
    this.currentTotalCount = 0;
    this.alertedThisBucket.zScore = false;
    this.alertedThisBucket.rateChange = false;
  }

  private resetModel(nextBucketStart: number): void {
    this.bucketStartMs = nextBucketStart;
    this.currentErrorCount = 0;
    this.currentTotalCount = 0;
    this.baselineIndex = 0;
    this.baselineCount = 0;
    this.baselineSum = 0;
    this.baselineSumSquares = 0;
    this.recentIndex = 0;
    this.recentCount = 0;
    this.recentSum = 0;
    this.alertedThisBucket.zScore = false;
    this.alertedThisBucket.rateChange = false;
  }

  private alignBucket(ts: number): number {
    return Math.floor(ts / this.config.bucketMs) * this.config.bucketMs;
  }

  private severityFromZScore(zScore: number): Severity {
    if (zScore >= 6) {
      return Severity.CRITICAL;
    }
    if (zScore >= 4) {
      return Severity.HIGH;
    }
    return Severity.MEDIUM;
  }

  private severityFromAbsoluteLift(delta: number): Severity {
    if (delta >= 0.15) {
      return Severity.CRITICAL;
    }
    if (delta >= 0.07) {
      return Severity.HIGH;
    }
    return Severity.MEDIUM;
  }

  private severityFromChangeRatio(ratio: number): Severity {
    if (ratio >= 2.0) {
      return Severity.CRITICAL;
    }
    if (ratio >= 1.0) {
      return Severity.HIGH;
    }
    return Severity.MEDIUM;
  }
}
