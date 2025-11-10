"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const events_1 = require("events");
class EventBus extends events_1.EventEmitter {
    emitLogReceived(log) {
        this.emit('log.received', { log });
    }
    onLogReceived(handler) {
        this.on('log.received', handler);
    }
    emitMetricAggregated(metric) {
        this.emit('metric.aggregated', { metric });
    }
    onMetricAggregated(handler) {
        this.on('metric.aggregated', handler);
    }
    emitAlertTriggered(alert) {
        this.emit('alert.triggered', { alert });
    }
    onAlertTriggered(handler) {
        this.on('alert.triggered', handler);
    }
    offEvent(event, handler) {
        this.off(event, handler);
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=events.js.map