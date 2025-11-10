"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TracerClient = void 0;
const core_1 = require("@tracer/core");
const tracer_1 = require("./tracer");
class TracerClient {
    apiUrl;
    apiKey;
    service;
    batchSize;
    flushInterval;
    buffer = [];
    flushTimer;
    tracer;
    maxBufferSize = 10000; // Prevent unbounded growth
    constructor(config) {
        this.apiUrl = config.apiUrl || process.env.TRACER_API_URL || 'http://localhost:3000';
        this.apiKey = config.apiKey || process.env.TRACER_API_KEY;
        this.service = config.service;
        this.batchSize = config.batchSize || 10;
        this.flushInterval = config.flushInterval || 5000;
        const tracerConfig = {
            sampleRate: config.traceSampleRate,
            alwaysSampleErrors: config.alwaysSampleErrors,
        };
        this.tracer = new tracer_1.Tracer(this, tracerConfig);
        this.startAutoFlush();
    }
    log(level, message, metadata) {
        const currentSpan = this.tracer.getCurrentSpan();
        const traceId = currentSpan?.traceId;
        const spanId = currentSpan?.spanId;
        const logEntry = {
            timestamp: new Date(),
            level,
            message,
            service: this.service,
            metadata,
            traceId,
            spanId,
        };
        // Prevent unbounded buffer growth
        if (this.buffer.length >= this.maxBufferSize) {
            console.warn(`Log buffer full (${this.maxBufferSize}), dropping oldest logs`);
            const toRemove = this.buffer.length - this.maxBufferSize + 1;
            this.buffer.splice(0, toRemove);
        }
        this.buffer.push(logEntry);
        if (this.buffer.length >= this.batchSize) {
            this.flush();
        }
    }
    debug(message, metadata) {
        this.log(core_1.LogLevel.DEBUG, message, metadata);
    }
    info(message, metadata) {
        this.log(core_1.LogLevel.INFO, message, metadata);
    }
    warn(message, metadata) {
        this.log(core_1.LogLevel.WARN, message, metadata);
    }
    error(message, metadata) {
        this.log(core_1.LogLevel.ERROR, message, metadata);
    }
    fatal(message, metadata) {
        this.log(core_1.LogLevel.FATAL, message, metadata);
    }
    async flush() {
        if (this.buffer.length === 0) {
            return;
        }
        const logsToSend = [...this.buffer];
        this.buffer = [];
        try {
            const headers = {
                'Content-Type': 'application/json',
            };
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }
            const response = await fetch(`${this.apiUrl}/logs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ logs: logsToSend }),
            });
            if (!response.ok) {
                throw new Error(`Failed to send logs: ${response.statusText}`);
            }
        }
        catch (error) {
            console.error('Failed to send logs to Tracer API:', error);
            // Re-add logs to buffer for retry, but limit total size
            const availableSpace = this.maxBufferSize - this.buffer.length;
            if (availableSpace > 0) {
                const toReAdd = logsToSend.slice(0, availableSpace);
                this.buffer.unshift(...toReAdd);
                if (logsToSend.length > availableSpace) {
                    console.warn(`Dropped ${logsToSend.length - availableSpace} logs due to buffer limit`);
                }
            }
            else {
                console.warn(`Buffer full, dropping ${logsToSend.length} logs`);
            }
            throw error;
        }
    }
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                console.error('Auto-flush failed:', error);
            });
        }, this.flushInterval);
    }
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flush();
        await this.tracer.shutdown();
    }
}
exports.TracerClient = TracerClient;
//# sourceMappingURL=client.js.map