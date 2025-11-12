import {
  Alert,
  AlertType,
  Severity,
  Metric,
  MetricType,
  ERROR_COUNT_THRESHOLD,
  LATENCY_THRESHOLD_MS,
  SERVICE_DOWNTIME_MINUTES,
} from '@tracer/core';
import { AnomalyDetector } from './anomaly-detector';
import { StatisticalAnomalyDetector } from './statistical-anomaly-detector';

/**
 * Detection mode configuration
 */
export enum DetectionMode {
  THRESHOLD_ONLY = 'threshold_only', // Legacy threshold-based detection
  STATISTICAL_ONLY = 'statistical_only', // New statistical detection
  HYBRID = 'hybrid', // Both (union of alerts)
}

/**
 * Hybrid Anomaly Detector
 *
 * Combines threshold-based and statistical anomaly detection:
 * - Threshold: Fast, simple, predictable (existing system)
 * - Statistical: Adaptive, learns baselines, reduces false positives
 *
 * Modes:
 * - THRESHOLD_ONLY: Legacy behavior (backward compatible)
 * - STATISTICAL_ONLY: Only statistical detection
 * - HYBRID: Use both, merge results (default)
 */
export class HybridAnomalyDetector {
  private thresholdDetector: AnomalyDetector;
  private statisticalDetector: StatisticalAnomalyDetector;
  private mode: DetectionMode;

  // Deduplication tracking
  private recentAlerts: Map<string, Date> = new Map();
  private readonly alertDedupeWindowMs = 5 * 60 * 1000; // 5 minutes

  constructor(mode: DetectionMode = DetectionMode.HYBRID) {
    this.thresholdDetector = new AnomalyDetector();
    this.statisticalDetector = new StatisticalAnomalyDetector();
    this.mode = mode;
  }

  /**
   * Detect anomalies using configured detection mode
   */
  detectAnomalies(metrics: Metric[]): Alert[] {
    let alerts: Alert[] = [];

    switch (this.mode) {
      case DetectionMode.THRESHOLD_ONLY:
        alerts = this.thresholdDetector.detectAnomalies(metrics);
        break;

      case DetectionMode.STATISTICAL_ONLY:
        alerts = this.statisticalDetector.detectAnomalies(metrics);
        break;

      case DetectionMode.HYBRID:
        alerts = this.hybridDetection(metrics);
        break;
    }

    // Deduplicate alerts
    return this.deduplicateAlerts(alerts);
  }

  /**
   * Hybrid detection: Use both threshold and statistical
   * Merges alerts and enriches with context
   */
  private hybridDetection(metrics: Metric[]): Alert[] {
    const thresholdAlerts = this.thresholdDetector.detectAnomalies(metrics);
    const statisticalAlerts = this.statisticalDetector.detectAnomalies(metrics);

    // Merge alerts by service + alertType
    const alertMap = new Map<string, Alert>();

    // Add threshold alerts
    for (const alert of thresholdAlerts) {
      const key = this.getAlertKey(alert);
      alertMap.set(key, alert);
    }

    // Add or enhance with statistical alerts
    for (const statAlert of statisticalAlerts) {
      const key = this.getAlertKey(statAlert);
      const existingAlert = alertMap.get(key);

      if (existingAlert) {
        // Both detectors fired - increase severity and enrich message
        alertMap.set(key, this.mergeAlerts(existingAlert, statAlert));
      } else {
        // Only statistical detector fired
        alertMap.set(key, statAlert);
      }
    }

    return Array.from(alertMap.values());
  }

  /**
   * Merge two alerts for the same anomaly
   * Combines information from both detectors
   */
  private mergeAlerts(thresholdAlert: Alert, statAlert: Alert): Alert {
    // Increase severity if both detectors agree
    const severityMap = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const maxSeverity = Math.max(
      severityMap[thresholdAlert.severity],
      severityMap[statAlert.severity]
    );

    const newSeverity = Object.keys(severityMap).find(
      (key) => severityMap[key as Severity] === maxSeverity
    ) as Severity;

    // Combine messages
    const message = `${thresholdAlert.message}\n[Statistical Analysis] ${statAlert.message}`;

    return {
      ...thresholdAlert,
      severity: newSeverity,
      message,
    };
  }

  /**
   * Update service activity for downtime detection
   */
  updateServiceActivity(service: string, timestamp: Date): Alert | null {
    return this.thresholdDetector.updateServiceActivity(service, timestamp);
  }

  /**
   * Check for service downtime
   */
  checkServiceDowntime(now: Date): Alert[] {
    return this.thresholdDetector.checkServiceDowntime(now);
  }

  /**
   * Deduplicate alerts to prevent alert fatigue
   * Only send alert if not sent in last N minutes
   */
  private deduplicateAlerts(alerts: Alert[]): Alert[] {
    const now = Date.now();
    const dedupedAlerts: Alert[] = [];

    // Clean up old entries
    for (const [key, timestamp] of this.recentAlerts.entries()) {
      if (now - timestamp.getTime() > this.alertDedupeWindowMs) {
        this.recentAlerts.delete(key);
      }
    }

    for (const alert of alerts) {
      const key = this.getAlertKey(alert);
      const lastAlertTime = this.recentAlerts.get(key);

      if (!lastAlertTime || now - lastAlertTime.getTime() > this.alertDedupeWindowMs) {
        dedupedAlerts.push(alert);
        this.recentAlerts.set(key, new Date(now));
      }
    }

    return dedupedAlerts;
  }

  /**
   * Get unique key for alert
   */
  private getAlertKey(alert: Alert): string {
    return `${alert.service}:${alert.alertType}`;
  }

  /**
   * Get baseline statistics (for monitoring/debugging)
   */
  getBaselineStats(service: string, metricType: MetricType) {
    return this.statisticalDetector.getBaselineStats(service, metricType);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return this.statisticalDetector.getPerformanceStats();
  }

  /**
   * Set detection mode
   */
  setMode(mode: DetectionMode): void {
    this.mode = mode;
  }

  /**
   * Get current detection mode
   */
  getMode(): DetectionMode {
    return this.mode;
  }
}
