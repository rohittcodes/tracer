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

export class AnomalyDetector {
  private lastLogTime: Map<string, Date> = new Map();

  /**
   * Check metrics for anomalies and generate alerts
   */
  detectAnomalies(metrics: Metric[]): Alert[] {
    const alerts: Alert[] = [];

    for (const metric of metrics) {
      // Error spike detection
      if (metric.metricType === MetricType.ERROR_COUNT && metric.value > ERROR_COUNT_THRESHOLD) {
        alerts.push({
          alertType: AlertType.ERROR_SPIKE,
          severity: this.getSeverityForErrorCount(metric.value),
          message: `Error spike detected: ${metric.value} errors in ${metric.service} (threshold: ${ERROR_COUNT_THRESHOLD})`,
          service: metric.service,
          resolved: false,
          createdAt: new Date(),
        });
      }

      // High latency detection
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

