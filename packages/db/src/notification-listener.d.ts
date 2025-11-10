import { LogRepository } from './repositories/logs';
import { LogEntry } from '@tracer/core';
export type LogNotificationHandler = (log: LogEntry) => void | Promise<void>;
/**
 * Listens for PostgreSQL NOTIFY events when logs are inserted
 * Enables real-time processing without polling
 */
export declare class NotificationListener {
    private client;
    private handlers;
    private logRepository;
    private isListening;
    constructor(logRepository: LogRepository);
    /**
     * Start listening for log insertion notifications
     */
    start(): Promise<void>;
    /**
     * Stop listening for notifications
     */
    stop(): Promise<void>;
    /**
     * Register a handler for log notifications
     */
    onLogInserted(handler: LogNotificationHandler): () => void;
}
//# sourceMappingURL=notification-listener.d.ts.map