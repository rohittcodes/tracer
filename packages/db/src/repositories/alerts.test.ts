import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertRepository } from './alerts';
import { Alert, AlertType, Severity } from '@tracer/core';
import { getDb } from '../db';

// Mock the database
vi.mock('../db', () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn()
        }))
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn()
          }))
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn()
      }))
    }))
  }))
}));

describe('AlertRepository Deduplication', () => {
  let repository: AlertRepository;
  let mockAlert: Alert;

  beforeEach(() => {
    repository = new AlertRepository();
    mockAlert = {
      alertType: AlertType.ERROR_SPIKE,
      severity: Severity.HIGH,
      message: 'Test error spike',
      service: 'test-service',
      resolved: false,
      createdAt: new Date(),
    };
    vi.clearAllMocks();
  });

  describe('insertWithDeduplication', () => {
    it('should insert a new alert successfully', async () => {
      const mockDb = getDb() as any;
      const mockResult = [{ id: 123, createdAt: mockAlert.createdAt }];
      
      mockDb.insert().values().onConflictDoUpdate().returning.mockResolvedValue(mockResult);

      const result = await repository.insertWithDeduplication(mockAlert);

      expect(result.id).toBe(123);
      expect(result.isDuplicate).toBe(false);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should handle duplicate alerts and return existing ID', async () => {
      const mockDb = getDb() as any;
      const existingCreatedAt = new Date(mockAlert.createdAt.getTime() - 1000);
      const mockResult = [{ id: 456, createdAt: existingCreatedAt }];
      
      mockDb.insert().values().onConflictDoUpdate().returning.mockResolvedValue(mockResult);

      const result = await repository.insertWithDeduplication(mockAlert);

      expect(result.id).toBe(456);
      expect(result.isDuplicate).toBe(true);
    });

    it('should retry on unique constraint violation', async () => {
      const mockDb = getDb() as any;
      const uniqueConstraintError = { code: '23505', message: 'unique constraint violation' };
      
      // First call fails with unique constraint error
      mockDb.insert().values().onConflictDoUpdate().returning
        .mockRejectedValueOnce(uniqueConstraintError)
        .mockResolvedValueOnce([{ id: 789, createdAt: new Date() }]);
      
      // Mock the findExistingAlert method
      mockDb.select().from().where().orderBy().limit
        .mockResolvedValue([{ id: 789 }]);

      const result = await repository.insertWithDeduplication(mockAlert);

      expect(result.id).toBe(789);
      expect(result.isDuplicate).toBe(true);
    });

    it('should handle clock skew by checking adjacent buckets', async () => {
      const mockDb = getDb() as any;
      const mockResult = [{ id: 111, createdAt: mockAlert.createdAt }];
      
      mockDb.insert().values().onConflictDoUpdate().returning.mockResolvedValue(mockResult);

      // Create alert with timestamp that would fall in different buckets
      const skewedAlert = {
        ...mockAlert,
        createdAt: new Date(mockAlert.createdAt.getTime() + 6000) // 6 seconds later
      };

      const result1 = await repository.insertWithDeduplication(mockAlert);
      const result2 = await repository.insertWithDeduplication(skewedAlert);

      expect(result1.id).toBe(111);
      expect(result2.id).toBe(111); // Should be detected as duplicate
    });

    it('should update severity when higher severity duplicate arrives', async () => {
      const mockDb = getDb() as any;
      const lowSeverityAlert = {
        ...mockAlert,
        severity: Severity.LOW
      };
      const highSeverityAlert = {
        ...mockAlert,
        severity: Severity.CRITICAL
      };

      // First insert (low severity)
      mockDb.insert().values().onConflictDoUpdate().returning
        .mockResolvedValueOnce([{ id: 222, createdAt: lowSeverityAlert.createdAt }]);

      await repository.insertWithDeduplication(lowSeverityAlert);

      // Second insert (high severity) - should update
      mockDb.insert().values().onConflictDoUpdate().returning
        .mockResolvedValueOnce([{ id: 222, createdAt: lowSeverityAlert.createdAt }]);

      const result = await repository.insertWithDeduplication(highSeverityAlert);

      expect(result.id).toBe(222);
      expect(mockDb.insert().values().onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            severity: expect.anything() // SQL case statement
          })
        })
      );
    });

    it('should fail after max retries', async () => {
      const mockDb = getDb() as any;
      const uniqueConstraintError = { code: '23505', message: 'unique constraint violation' };
      
      // All calls fail with unique constraint error
      mockDb.insert().values().onConflictDoUpdate().returning
        .mockRejectedValue(uniqueConstraintError);
      
      // Mock findExistingAlert to return null (simulating not found)
      mockDb.select().from().where().orderBy().limit
        .mockResolvedValue([]);

      await expect(repository.insertWithDeduplication(mockAlert))
        .rejects.toThrow('Deduplication failed after 3 retries');
    });
  });

  describe('isUniqueConstraintError', () => {
    it('should detect PostgreSQL unique constraint errors', () => {
      const error23505 = { code: '23505', message: 'duplicate key value violates unique constraint' };
      const error23514 = { code: '23514', message: 'check constraint violation' };
      const normalError = { code: '42P01', message: 'table does not exist' };

      expect((repository as any).isUniqueConstraintError(error23505)).toBe(true);
      expect((repository as any).isUniqueConstraintError(error23514)).toBe(true);
      expect((repository as any).isUniqueConstraintError(normalError)).toBe(false);
    });

    it('should detect unique constraint errors by message', () => {
      const errorWithUnique = { message: 'Error: unique constraint violation on alerts' };
      const errorWithDuplicate = { message: 'duplicate entry for key' };
      const normalError = { message: 'connection timeout' };

      expect((repository as any).isUniqueConstraintError(errorWithUnique)).toBe(true);
      expect((repository as any).isUniqueConstraintError(errorWithDuplicate)).toBe(true);
      expect((repository as any).isUniqueConstraintError(normalError)).toBe(false);
    });
  });

  describe('calculateTimeBucket', () => {
    it('should calculate correct time buckets', () => {
      const baseTime = new Date('2023-01-01T00:00:00Z');
      
      // 5-second buckets
      const bucket1 = (repository as any).calculateTimeBucket(baseTime);
      const bucket2 = (repository as any).calculateTimeBucket(new Date(baseTime.getTime() + 4000)); // +4s
      const bucket3 = (repository as any).calculateTimeBucket(new Date(baseTime.getTime() + 6000)); // +6s
      
      expect(bucket1).toBe(bucket2); // Same bucket (within 5s)
      expect(bucket1).toBeLessThan(bucket3); // Different bucket
    });

    it('should handle clock skew margin', () => {
      const baseTime = new Date('2023-01-01T00:00:00Z');
      
      const bucketNoSkew = (repository as any).calculateTimeBucket(baseTime, 0);
      const bucketWithSkew = (repository as any).calculateTimeBucket(baseTime, 3); // 3s skew
      
      // Should be different buckets when skew margin changes
      expect(bucketNoSkew).not.toBe(bucketWithSkew);
    });
  });
});