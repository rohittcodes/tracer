import { PoolClient } from 'pg';
import { getPool } from './db';
import { LogRepository } from './repositories/logs';
import { LogEntry } from '@tracer/core';

export type LogNotificationHandler = (log: LogEntry) => void | Promise<void>;

/**
 * Listens for PostgreSQL NOTIFY events when logs are inserted
 * Enables real-time processing without polling
 */
export class NotificationListener {
  private client: PoolClient | null = null;
  private handlers: Set<LogNotificationHandler> = new Set();
  private logRepository: LogRepository;
  private isListening: boolean = false;

  constructor(logRepository: LogRepository) {
    this.logRepository = logRepository;
  }

  /**
   * Start listening for log insertion notifications
   */
  async start(): Promise<void> {
    // Prevent race conditions - if already listening, return
    if (this.isListening) {
      return;
    }

    // If we have a client but not listening, clean it up first
    if (this.client) {
      try {
        await this.client.query('UNLISTEN log_inserted').catch(() => {});
        this.client.release();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.client = null;
    }

    const pool = getPool();
    this.client = await pool.connect();

    // Listen for notifications
    await this.client.query('LISTEN log_inserted');

    // Set up notification handler
    // @ts-ignore - pg PoolClient supports notification events but types may not reflect it
    this.client.on('notification', async (msg: { channel: string; payload: string }) => {
      if (msg.channel === 'log_inserted') {
        const logId = parseInt(msg.payload, 10);
        if (isNaN(logId) || logId <= 0) {
          console.error('Invalid log ID in notification:', msg.payload);
          return;
        }

        try {
          const log = await this.logRepository.getById(logId);
          if (log) {
            // Call all registered handlers in parallel
            await Promise.allSettled(
              Array.from(this.handlers).map(async (handler) => {
                try {
                  await handler(log);
                } catch (error) {
                  console.error('Error in log notification handler:', error);
                }
              })
            );
          }
        } catch (error) {
          console.error('Error processing log notification:', error);
        }
      }
    });

    this.isListening = true;
    console.log('✅ Listening for real-time log notifications via PostgreSQL LISTEN/NOTIFY');
  }

  /**
   * Stop listening for notifications
   */
  async stop(): Promise<void> {
    if (!this.isListening || !this.client) {
      return;
    }

    try {
      await this.client.query('UNLISTEN log_inserted');
      this.client.release();
      this.client = null;
      this.isListening = false;
      console.log('Stopped listening for log notifications');
    } catch (error) {
      console.error('Error stopping notification listener:', error);
    }
  }

  /**
   * Register a handler for log notifications
   */
  onLogInserted(handler: LogNotificationHandler): () => void {
    this.handlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
    };
  }
}

