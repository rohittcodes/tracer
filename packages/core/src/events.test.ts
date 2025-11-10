import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from './events';
import { LogEntry, Metric, Alert, LogLevel, MetricType, AlertType, Severity } from './types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should emit and receive log events', () => {
    const log: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      message: 'Test log',
      service: 'test-service',
    };

    let receivedLog: LogEntry | null = null;

    eventBus.onLogReceived((event) => {
      receivedLog = event.log;
    });

    eventBus.emitLogReceived(log);

    expect(receivedLog).toEqual(log);
  });

  it('should emit and receive metric events', () => {
    const metric: Metric = {
      service: 'test-service',
      metricType: MetricType.ERROR_COUNT,
      value: 10,
      windowStart: new Date(),
      windowEnd: new Date(),
    };

    let receivedMetric: Metric | null = null;

    eventBus.onMetricAggregated((event) => {
      receivedMetric = event.metric;
    });

    eventBus.emitMetricAggregated(metric);

    expect(receivedMetric).toEqual(metric);
  });

  it('should emit and receive alert events', () => {
    const alert: Alert = {
      alertType: AlertType.ERROR_SPIKE,
      severity: Severity.HIGH,
      message: 'Test alert',
      service: 'test-service',
      resolved: false,
      createdAt: new Date(),
    };

    let receivedAlert: Alert | null = null;

    eventBus.onAlertTriggered((event) => {
      receivedAlert = event.alert;
    });

    eventBus.emitAlertTriggered(alert);

    expect(receivedAlert).toEqual(alert);
  });

  it('should allow unsubscribing from events', () => {
    const log: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      message: 'Test log',
      service: 'test-service',
    };

    let callCount = 0;
    const handler = () => {
      callCount++;
    };

    eventBus.onLogReceived(handler);
    eventBus.emitLogReceived(log);
    expect(callCount).toBe(1);

    eventBus.offEvent('log.received', handler);
    eventBus.emitLogReceived(log);
    expect(callCount).toBe(1); // Should not increment
  });
});

