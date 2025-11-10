import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LogRepository } from './logs';
import { LogEntry, LogLevel } from '@tracer/core';
import { getDb, closeDb } from '../db';

// Mock database for testing
// In a real scenario, you'd use a test database or in-memory database
describe('LogRepository', () => {
  let repository: LogRepository;

  beforeEach(() => {
    repository = new LogRepository();
    // Note: In real tests, you'd set up a test database connection
    // For now, these tests will require a running database
  });

  afterEach(async () => {
    await closeDb();
  });

  it('should create a LogRepository instance', () => {
    expect(repository).toBeInstanceOf(LogRepository);
  });

  it('should have insertBatch method', () => {
    expect(typeof repository.insertBatch).toBe('function');
  });

  it('should have queryByTimeRange method', () => {
    expect(typeof repository.queryByTimeRange).toBe('function');
  });

  it('should have queryByService method', () => {
    expect(typeof repository.queryByService).toBe('function');
  });

  // Integration test - requires database
  it.skip('should insert logs in batch', async () => {
    const logs: LogEntry[] = [
      {
        timestamp: new Date(),
        level: LogLevel.INFO,
        message: 'Test log 1',
        service: 'test-service',
      },
      {
        timestamp: new Date(),
        level: LogLevel.ERROR,
        message: 'Test log 2',
        service: 'test-service',
      },
    ];

    await repository.insertBatch(logs);
    // In a real test, you'd query and verify the logs were inserted
  });
});

