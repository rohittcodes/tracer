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
export declare class EventBus extends EventEmitter {
    emitLogReceived(log: LogEntry): void;
    onLogReceived(handler: (event: LogReceivedEvent) => void): void;
    emitMetricAggregated(metric: Metric): void;
    onMetricAggregated(handler: (event: MetricAggregatedEvent) => void): void;
    emitAlertTriggered(alert: Alert): void;
    onAlertTriggered(handler: (event: AlertTriggeredEvent) => void): void;
    offEvent(event: string, handler: (...args: any[]) => void): void;
}
//# sourceMappingURL=events.d.ts.map