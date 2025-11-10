import { EventEmitter } from 'events';
import { LogEntry, Metric, Alert } from './types';

export interface LogReceivedEvent {
  log: LogEntry;
}

export interface MetricAggregatedEvent {
  metric: Metric;
}

export interface AlertTriggeredEvent {
  alert: Alert;
}

export class EventBus extends EventEmitter {
  emitLogReceived(log: LogEntry): void {
    this.emit('log.received', { log } as LogReceivedEvent);
  }

  onLogReceived(handler: (event: LogReceivedEvent) => void): void {
    this.on('log.received', handler);
  }

  emitMetricAggregated(metric: Metric): void {
    this.emit('metric.aggregated', { metric } as MetricAggregatedEvent);
  }

  onMetricAggregated(handler: (event: MetricAggregatedEvent) => void): void {
    this.on('metric.aggregated', handler);
  }

  emitAlertTriggered(alert: Alert): void {
    this.emit('alert.triggered', { alert } as AlertTriggeredEvent);
  }

  onAlertTriggered(handler: (event: AlertTriggeredEvent) => void): void {
    this.on('alert.triggered', handler);
  }

  offEvent(event: string, handler: (...args: any[]) => void): void {
    this.off(event, handler);
  }
}

