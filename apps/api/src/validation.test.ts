import { describe, it, expect } from 'vitest';
import { logEntrySchema, batchLogEntrySchema, singleLogEntrySchema } from './validation';
import { LogLevel } from '@tracer/core';

describe('Validation Schemas', () => {
  describe('logEntrySchema', () => {
    it('should validate a valid log entry', () => {
      const validLog = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'Test message',
        service: 'test-service',
      };

      const result = logEntrySchema.safeParse(validLog);
      expect(result.success).toBe(true);
    });

    it('should reject log entry with missing required fields', () => {
      const invalidLog = {
        level: LogLevel.INFO,
        message: 'Test message',
        // Missing timestamp and service
      };

      const result = logEntrySchema.safeParse(invalidLog);
      expect(result.success).toBe(false);
    });

    it('should reject invalid log level', () => {
      const invalidLog = {
        timestamp: new Date().toISOString(),
        level: 'invalid-level',
        message: 'Test message',
        service: 'test-service',
      };

      const result = logEntrySchema.safeParse(invalidLog);
      expect(result.success).toBe(false);
    });

    it('should accept optional metadata', () => {
      const logWithMetadata = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'Test message',
        service: 'test-service',
        metadata: { userId: '123', action: 'login' },
      };

      const result = logEntrySchema.safeParse(logWithMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toEqual({ userId: '123', action: 'login' });
      }
    });

    it('should transform timestamp from string to Date', () => {
      const log = {
        timestamp: '2024-01-01T12:00:00Z',
        level: LogLevel.INFO,
        message: 'Test message',
        service: 'test-service',
      };

      const result = logEntrySchema.safeParse(log);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('batchLogEntrySchema', () => {
    it('should validate a batch of logs', () => {
      const batch = {
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: LogLevel.INFO,
            message: 'Message 1',
            service: 'test-service',
          },
          {
            timestamp: new Date().toISOString(),
            level: LogLevel.ERROR,
            message: 'Message 2',
            service: 'test-service',
          },
        ],
      };

      const result = batchLogEntrySchema.safeParse(batch);
      expect(result.success).toBe(true);
    });

    it('should reject empty batch', () => {
      const batch = {
        logs: [],
      };

      const result = batchLogEntrySchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it('should reject batch with too many logs', () => {
      const batch = {
        logs: Array.from({ length: 1001 }, () => ({
          timestamp: new Date().toISOString(),
          level: LogLevel.INFO,
          message: 'Message',
          service: 'test-service',
        })),
      };

      const result = batchLogEntrySchema.safeParse(batch);
      expect(result.success).toBe(false);
    });
  });
});

