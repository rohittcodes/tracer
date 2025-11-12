import {
  Alert,
  AlertType,
  Severity,
  Metric,
  MetricType,
  LogEntry,
} from '@tracer/core';

export interface StatisticalConfig {
  // Z-score threshold for anomaly detection (default: 3.0)
  zScoreThreshold: number;
  
  // Minimum data points required before statistical analysis (default: 30)
  minDataPoints: number;
  
  // Rolling window size in minutes for baseline calculation (default: 60)
  baselineWindowMinutes: number;
  
  // Rate of change threshold (e.g., 0.5 = 50% increase)
  rateOfChangeThreshold: number;
  
  // Time window for rate-of-change detection in minutes (default: 5)
  rateOfChangeWindowMinutes: number;
  
  // Smoothing factor for exponential moving average (default: 0.3)
  emaSmoothingFactor: number;
  
  // Whether to use median absolute deviation instead of standard deviation
  useMAD: boolean;
  
  // Sensitivity level (0.1-1.0) for adaptive threshold adjustment
  sensitivity: number;
}

export interface ServiceBaseline {
  service: string;
  metricType: MetricType;
  
  // Rolling statistics
  values: number[];
  timestamps: number[];
  
  // Incremental statistics
  count: number;
  sum: number;
  sumOfSquares: number;
  
  // Exponential moving average
  ema: number;
  
  // Median Absolute Deviation (MAD) components
  median: number;
  mad: number;
  
  // Rate of change tracking
  previousValue: number;
  previousTimestamp: number;
  maxRateOfChange: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  deviation: number;
  baselineMean: number;
  baselineStdDev: number;
  rateOfChange: number;
  severity: Severity;
}

const DEFAULT_CONFIG: StatisticalConfig = {
  zScoreThreshold: 3.0,
  minDataPoints: 30,
  baselineWindowMinutes: 60,
  rateOfChangeThreshold: 0.5,
  rateOfChangeWindowMinutes: 5,
  emaSmoothingFactor: 0.3,
  useMAD: false,
  sensitivity: 0.7,
};

export class StatisticalAnomalyDetector {
  private config: StatisticalConfig;
  private baselines: Map<string, ServiceBaseline> = new Map();
  private readonly maxWindowSize: number;
  
  constructor(config: Partial<StatisticalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxWindowSize = Math.ceil(
      (this.config.baselineWindowMinutes * 60 * 1000) / (DEFAULT_METRIC_WINDOW_SECONDS * 1000)
    );
  }

  /**
   * Process a log entry and detect anomalies in real-time
   */
  processLog(log: LogEntry): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();
    
    // Process error count anomaly
    if (log.level === 'error' || log.level === 'fatal') {
      const errorBaseline = this.getOrCreateBaseline(log.service, MetricType.ERROR_COUNT);
      
      // Update baseline with new error (incremental count)
      this.updateBaseline(errorBaseline, 1, now);
      
      // Check for anomaly using current error rate
      const currentErrorRate = this.getCurrentErrorRate(log.service);
      const anomalyResult = this.detectStatisticalAnomaly(
        errorBaseline,
        currentErrorRate,
        now
      );
      
      if (anomalyResult.isAnomaly) {
        alerts.push(this.createAlert(
          AlertType.ERROR_SPIKE,
          log.service,
          `Statistical anomaly detected: ${anomalyResult.deviation.toFixed(2)}σ deviation from baseline`,
          anomalyResult
        ));
      }
      
      // Check for rate-of-change spike
      if (anomalyResult.rateOfChange > this.config.rateOfChangeThreshold) {
        alerts.push(this.createAlert(
          AlertType.THRESHOLD_EXCEEDED,
          log.service,
          `Error rate increased ${(anomalyResult.rateOfChange * 100).toFixed(1)}% in ${this.config.rateOfChangeWindowMinutes} minutes`,
          anomalyResult
        ));
      }
    }
    
    // Process latency anomaly if present
    if (log.metadata?.latency && typeof log.metadata.latency === 'number') {
      const latencyBaseline = this.getOrCreateBaseline(log.service, MetricType.LATENCY_P95);
      
      // Update baseline with new latency
      this.updateBaseline(latencyBaseline, log.metadata.latency, now);
      
      // Check for anomaly
      const anomalyResult = this.detectStatisticalAnomaly(
        latencyBaseline,
        log.metadata.latency,
        now
      );
      
      if (anomalyResult.isAnomaly) {
        alerts.push(this.createAlert(
          AlertType.HIGH_LATENCY,
          log.service,
          `Latency anomaly detected: ${log.metadata.latency}ms (${anomalyResult.deviation.toFixed(2)}σ from baseline)`,
          anomalyResult
        ));
      }
    }
    
    return alerts;
  }

  /**
   * Process batch metrics and detect anomalies
   */
  processMetrics(metrics: Metric[]): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();
    
    for (const metric of metrics) {
      const baseline = this.getOrCreateBaseline(metric.service, metric.metricType);
      
      // Update baseline
      this.updateBaseline(baseline, metric.value, now);
      
      // Detect anomaly
      const anomalyResult = this.detectStatisticalAnomaly(baseline, metric.value, now);
      
      if (anomalyResult.isAnomaly) {
        let alertType: AlertType;
        let message: string;
        
        switch (metric.metricType) {
          case MetricType.ERROR_COUNT:
            alertType = AlertType.ERROR_SPIKE;
            message = `Error spike: ${metric.value} errors (${anomalyResult.deviation.toFixed(2)}σ from baseline)`;
            break;
          case MetricType.LATENCY_P95:
            alertType = AlertType.HIGH_LATENCY;
            message = `High latency: ${metric.value}ms (${anomalyResult.deviation.toFixed(2)}σ from baseline)`;
            break;
          case MetricType.THROUGHPUT:
            alertType = AlertType.THRESHOLD_EXCEEDED;
            message = `Throughput anomaly: ${metric.value.toFixed(2)} logs/sec (${anomalyResult.deviation.toFixed(2)}σ from baseline)`;
            break;
          default:
            alertType = AlertType.THRESHOLD_EXCEEDED;
            message = `Metric anomaly: ${metric.metricType} = ${metric.value} (${anomalyResult.deviation.toFixed(2)}σ from baseline)`;
        }
        
        alerts.push(this.createAlert(alertType, metric.service, message, anomalyResult));
      }
    }
    
    return alerts;
  }

  /**
   * Get or create a baseline for a service and metric type
   */
  private getOrCreateBaseline(service: string, metricType: MetricType): ServiceBaseline {
    const key = `${service}:${metricType}`;
    let baseline = this.baselines.get(key);
    
    if (!baseline) {
      baseline = {
        service,
        metricType,
        values: new Array(this.maxWindowSize),
        timestamps: new Array(this.maxWindowSize),
        count: 0,
        sum: 0,
        sumOfSquares: 0,
        ema: 0,
        median: 0,
        mad: 0,
        previousValue: 0,
        previousTimestamp: 0,
        maxRateOfChange: 0,
      };
      this.baselines.set(key, baseline);
    }
    
    return baseline;
  }

  /**
   * Update baseline with new value using incremental statistics
   */
  private updateBaseline(baseline: ServiceBaseline, value: number, timestamp: number): void {
    // Add to circular buffer
    const index = baseline.count % this.maxWindowSize;
    const oldValue = baseline.values[index] || 0;
    const oldTimestamp = baseline.timestamps[index] || 0;
    
    baseline.values[index] = value;
    baseline.timestamps[index] = timestamp;
    
    // Update incremental statistics
    if (baseline.count < this.maxWindowSize) {
      // Growing window
      baseline.count++;
      baseline.sum += value;
      baseline.sumOfSquares += value * value;
    } else {
      // Full window, replace old value
      baseline.sum = baseline.sum - oldValue + value;
      baseline.sumOfSquares = baseline.sumOfSquares - (oldValue * oldValue) + (value * value);
    }
    
    // Update exponential moving average
    if (baseline.ema === 0) {
      baseline.ema = value;
    } else {
      baseline.ema = (this.config.emaSmoothingFactor * value) + 
                     ((1 - this.config.emaSmoothingFactor) * baseline.ema);
    }
    
    // Update rate of change
    if (baseline.previousValue > 0 && baseline.previousTimestamp > 0) {
      const timeDiff = (timestamp - baseline.previousTimestamp) / (1000 * 60); // minutes
      if (timeDiff > 0 && timeDiff <= this.config.rateOfChangeWindowMinutes) {
        const rateOfChange = Math.abs(value - baseline.previousValue) / baseline.previousValue;
        baseline.maxRateOfChange = Math.max(baseline.maxRateOfChange, rateOfChange);
      } else {
        baseline.maxRateOfChange = 0; // Reset if outside window
      }
    }
    
    baseline.previousValue = value;
    baseline.previousTimestamp = timestamp;
    
    // Calculate median and MAD periodically (not every update for performance)
    if (baseline.count % 10 === 0 && baseline.count >= this.config.minDataPoints) {
      this.calculateMedianAndMAD(baseline);
    }
  }

  /**
   * Detect statistical anomaly using z-score or MAD
   */
  private detectStatisticalAnomaly(
    baseline: ServiceBaseline,
    value: number,
    timestamp: number
  ): AnomalyResult {
    if (baseline.count < this.config.minDataPoints) {
      return {
        isAnomaly: false,
        zScore: 0,
        deviation: 0,
        baselineMean: 0,
        baselineStdDev: 0,
        rateOfChange: baseline.maxRateOfChange,
        severity: Severity.LOW,
      };
    }
    
    const mean = baseline.sum / baseline.count;
    const variance = (baseline.sumOfSquares / baseline.count) - (mean * mean);
    const stdDev = Math.sqrt(Math.max(variance, 0));
    
    let deviation: number;
    let zScore: number;
    
    if (this.config.useMAD && baseline.mad > 0) {
      // Use Median Absolute Deviation (more robust to outliers)
      deviation = Math.abs(value - baseline.median);
      zScore = deviation / baseline.mad;
    } else {
      // Use standard z-score
      deviation = Math.abs(value - mean);
      zScore = stdDev > 0 ? deviation / stdDev : 0;
    }
    
    // Adjust threshold based on sensitivity
    const adjustedThreshold = this.config.zScoreThreshold * (1 - this.config.sensitivity + 0.3);
    
    // Determine severity based on z-score
    let severity: Severity;
    if (zScore > adjustedThreshold * 2) {
      severity = Severity.CRITICAL;
    } else if (zScore > adjustedThreshold * 1.5) {
      severity = Severity.HIGH;
    } else if (zScore > adjustedThreshold) {
      severity = Severity.MEDIUM;
    } else {
      severity = Severity.LOW;
    }
    
    return {
      isAnomaly: zScore > adjustedThreshold || baseline.maxRateOfChange > this.config.rateOfChangeThreshold,
      zScore,
      deviation,
      baselineMean: mean,
      baselineStdDev: stdDev,
      rateOfChange: baseline.maxRateOfChange,
      severity,
    };
  }

  /**
   * Calculate median and median absolute deviation
   */
  private calculateMedianAndMAD(baseline: ServiceBaseline): void {
    if (baseline.count === 0) return;
    
    const values = baseline.values.slice(0, Math.min(baseline.count, this.maxWindowSize));
    const sorted = [...values].sort((a, b) => a - b);
    
    // Calculate median
    const mid = Math.floor(sorted.length / 2);
    baseline.median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    
    // Calculate Median Absolute Deviation
    const absoluteDeviations = sorted.map(x => Math.abs(x - baseline.median));
    const sortedDeviations = absoluteDeviations.sort((a, b) => a - b);
    const madMid = Math.floor(sortedDeviations.length / 2);
    const mad = sortedDeviations.length % 2 === 0
      ? (sortedDeviations[madMid - 1] + sortedDeviations[madMid]) / 2
      : sortedDeviations[madMid];
    
    // MAD scaling factor to approximate standard deviation for normal distribution
    baseline.mad = mad * 1.4826;
  }

  /**
   * Get current error rate for a service
   */
  private getCurrentErrorRate(service: string): number {
    const baseline = this.baselines.get(`${service}:${MetricType.ERROR_COUNT}`);
    if (!baseline || baseline.count === 0) return 0;
    
    return baseline.sum / baseline.count;
  }

  /**
   * Create an alert from anomaly result
   */
  private createAlert(
    alertType: AlertType,
    service: string,
    message: string,
    anomalyResult: AnomalyResult
  ): Alert {
    return {
      alertType,
      severity: anomalyResult.severity,
      message,
      service,
      resolved: false,
      createdAt: new Date(),
      metadata: {
        zScore: anomalyResult.zScore.toFixed(2),
        deviation: anomalyResult.deviation.toFixed(2),
        baselineMean: anomalyResult.baselineMean.toFixed(2),
        baselineStdDev: anomalyResult.baselineStdDev.toFixed(2),
        rateOfChange: (anomalyResult.rateOfChange * 100).toFixed(1) + '%',
      },
    };
  }

  /**
   * Get baseline statistics for a service (for monitoring/debugging)
   */
  getBaselineStats(service: string, metricType: MetricType): any {
    const baseline = this.baselines.get(`${service}:${metricType}`);
    if (!baseline || baseline.count < this.config.minDataPoints) {
      return null;
    }
    
    return {
      service,
      metricType,
      count: baseline.count,
      mean: baseline.sum / baseline.count,
      stdDev: Math.sqrt(Math.max((baseline.sumOfSquares / baseline.count) - Math.pow(baseline.sum / baseline.count, 2), 0)),
      ema: baseline.ema,
      median: baseline.median,
      mad: baseline.mad,
      recentValues: baseline.values.slice(-10),
    };
  }

  /**
   * Clear baselines for a service (useful for testing or service redeployment)
   */
  clearBaseline(service: string, metricType?: MetricType): void {
    if (metricType) {
      this.baselines.delete(`${service}:${metricType}`);
    } else {
      // Clear all baselines for the service
      for (const key of this.baselines.keys()) {
        if (key.startsWith(`${service}:`)) {
          this.baselines.delete(key);
        }
      }
    }
  }

  /**
   * Get detector configuration
   */
  getConfig(): StatisticalConfig {
    return { ...this.config };
  }

  /**
   * Update detector configuration
   */
  updateConfig(updates: Partial<StatisticalConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Default metric window seconds from core package
const DEFAULT_METRIC_WINDOW_SECONDS = 60;
