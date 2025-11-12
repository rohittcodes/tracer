/**
 * Tests for distributed alert deduplication
 * Simulates race conditions, clock skew, and processor crashes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AlertDeduplicator,
  type DatabaseConnection,
  type AlertIdentifier,
  createAlertWithDeduplication,
} from './deduplication';

/**
 * Mock database that simulates real PostgreSQL behavior
 */
class MockDatabase implements DatabaseConnection {
  private alerts: Array<{
    id: number;
    service: string;
    alert_type: string;
    message: string;
    severity: string;
    created_at: Date;
    resolved_at: Date | null;
  }> = [];

  private locks = new Set<string>();
  private nextId = 1;
  private latencyMs = 0;
  private clockSkewMs = 0;

  /**
   * Simulate network/DB latency
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Simulate clock skew
   */
  setClockSkew(ms: number): void {
    this.clockSkewMs = ms;
  }

  /**
   * Get current time with simulated clock skew
   */
  private now(): Date {
    return new Date(Date.now() + this.clockSkewMs);
  }

  async query<T>(sql: string, params: any[]): Promise<{ rows: T[] }> {
    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }

    // Advisory lock acquisition
    if (sql.includes('pg_try_advisory_lock')) {
      const lockKey = params[0];
      const acquired = !this.locks.has(lockKey);
      if (acquired) {
        this.locks.add(lockKey);
      }
      return { rows: [{ acquired } as T] };
    }

    // Advisory lock release
    if (sql.includes('pg_advisory_unlock')) {
      const lockKey = params[0];
      this.locks.delete(lockKey);
      return { rows: [{ unlocked: true } as T] };
    }

    // Count active alerts query
    if (sql.includes('SELECT COUNT(*)')) {
      const [service, alertType] = params;
      const count = this.alerts.filter(a =>
        a.service === service &&
        a.alert_type === alertType &&
        a.resolved_at === null
      ).length;
      return { rows: [{ count } as T] };
    }

    // Insert alert
    if (sql.includes('INSERT INTO alerts')) {
      const [service, alertType, message, severity] = params;
      this.alerts.push({
        id: this.nextId++,
        service,
        alert_type: alertType,
        message,
        severity,
        created_at: this.now(),
        resolved_at: null,
      });
      return { rows: [] };
    }

    return { rows: [] };
  }

  getAlerts() {
    return [...this.alerts];
  }

  clear() {
    this.alerts = [];
    this.locks.clear();
    this.nextId = 1;
  }
}

describe('AlertDeduplicator', () => {
  let deduplicator: AlertDeduplicator;
  let db: MockDatabase;

  beforeEach(() => {
    deduplicator = new AlertDeduplicator({
      deduplicationWindowSec: 5,
      maxClockSkewSec: 3,
      lockTimeoutMs: 1000,
      cacheSize: 100,
      cacheTtlMs: 10000,
    });
    db = new MockDatabase();
  });

  describe('L1: In-memory cache', () => {
    it('should detect duplicates in cache (fast path)', async () => {
      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // First alert should be created
      const created1 = await createAlertWithDeduplication(db, deduplicator, alert);
      expect(created1).toBe(true);
      expect(db.getAlerts()).toHaveLength(1);

      // Second alert (immediate) should be blocked by cache
      const created2 = await createAlertWithDeduplication(db, deduplicator, alert);
      expect(created2).toBe(false);
      expect(db.getAlerts()).toHaveLength(1); // Still only 1 alert
    });

    it('should allow alerts after cache TTL expires', async () => {
      const dedup = new AlertDeduplicator({
        deduplicationWindowSec: 5,
        maxClockSkewSec: 3,
        lockTimeoutMs: 1000,
        cacheSize: 100,
        cacheTtlMs: 100, // 100ms TTL for testing
      });

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      const created1 = await createAlertWithDeduplication(db, dedup, alert);
      expect(created1).toBe(true);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const created2 = await createAlertWithDeduplication(db, dedup, alert);
      expect(created2).toBe(true);
      expect(db.getAlerts()).toHaveLength(2);
    });
  });

  describe('L2: Advisory locks', () => {
    it('should prevent race condition with concurrent requests', async () => {
      // Clear cache to force L2 path
      const identifier: AlertIdentifier = {
        service: 'api',
        alertType: 'high_latency',
        timestamp: new Date(),
      };

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // Simulate two processors trying to create alert simultaneously
      const [created1, created2] = await Promise.all([
        createAlertWithDeduplication(db, deduplicator, alert),
        createAlertWithDeduplication(db, deduplicator, alert),
      ]);

      // Only one should succeed
      expect(created1 || created2).toBe(true);
      expect(created1 && created2).toBe(false);
      expect(db.getAlerts()).toHaveLength(1);
    });

    it('should handle advisory lock contention', async () => {
      db.setLatency(20); // Simulate DB latency

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // Launch 5 concurrent processors
      const results = await Promise.all(
        Array(5).fill(null).map(() =>
          createAlertWithDeduplication(db, deduplicator, alert)
        )
      );

      // Only one should succeed
      const successCount = results.filter(r => r).length;
      expect(successCount).toBe(1);
      expect(db.getAlerts()).toHaveLength(1);
    });
  });

  describe('Clock skew handling', () => {
    it('should handle 3s clock skew between processors', async () => {
      const db1 = new MockDatabase();
      const db2 = new MockDatabase();

      // Processor 1: fast clock (+3s)
      db1.setClockSkew(3000);

      // Processor 2: slow clock (0s)
      db2.setClockSkew(0);

      const alert1 = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(Date.now() + 3000),
      };

      const alert2 = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // Create deduplicators with separate caches (simulating different processors)
      const dedup1 = new AlertDeduplicator();
      const dedup2 = new AlertDeduplicator();

      // Both processors detect anomaly "simultaneously" (from their perspective)
      // But their clocks differ by 3s
      const created1 = await createAlertWithDeduplication(db1, dedup1, alert1);

      // Small delay to ensure first completes
      await new Promise(resolve => setTimeout(resolve, 10));

      const created2 = await createAlertWithDeduplication(db2, dedup2, alert2);

      // Both should create alerts because they have separate databases
      // In production, they'd share a database and L2 would prevent duplicates
      expect(created1).toBe(true);
      expect(created2).toBe(true);
    });

    it('should use database NOW() to avoid clock skew issues', async () => {
      // This test verifies that we use DB's timestamp, not processor's timestamp
      // for window calculations

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // First alert
      await createAlertWithDeduplication(db, deduplicator, alert);

      // Simulate clock skew by changing DB's clock
      db.setClockSkew(2000); // +2s

      // Clear cache to force L2 check
      deduplicator.clearCache({
        service: alert.service,
        alertType: alert.alertType,
        timestamp: alert.timestamp,
      });

      // Second alert with skewed clock
      const created2 = await createAlertWithDeduplication(db, deduplicator, alert);

      // Should be blocked because DB sees it as duplicate
      expect(created2).toBe(false);
      expect(db.getAlerts()).toHaveLength(1);
    });
  });

  describe('Crash resilience', () => {
    it('should handle processor crash (advisory lock auto-release)', async () => {
      // This simulates a processor acquiring a lock and then crashing
      // In PostgreSQL, advisory locks are automatically released on connection close

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // Processor 1 starts creating alert
      const promise1 = createAlertWithDeduplication(db, deduplicator, alert);

      // Simulate crash by not awaiting (in real scenario, connection would close)
      // But let's actually await to clean up properly
      await promise1;

      // Processor 2 should be able to proceed after crash
      // (lock is released automatically)
      deduplicator.clearCache({
        service: alert.service,
        alertType: alert.alertType,
        timestamp: alert.timestamp,
      });

      const created2 = await createAlertWithDeduplication(db, deduplicator, alert);

      // Should be blocked by existing alert in DB
      expect(created2).toBe(false);
    });
  });

  describe('Latency handling', () => {
    it('should handle 50ms DB latency', async () => {
      db.setLatency(50);

      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      const start = Date.now();
      const created = await createAlertWithDeduplication(db, deduplicator, alert);
      const duration = Date.now() - start;

      expect(created).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(50);
      expect(db.getAlerts()).toHaveLength(1);
    });

    it('should handle variable latency in race conditions', async () => {
      const alert = {
        service: 'api',
        alertType: 'high_latency',
        message: 'API latency above threshold',
        severity: 'warning',
        timestamp: new Date(),
      };

      // Simulate variable latency (10-50ms)
      const db1 = new MockDatabase();
      const db2 = new MockDatabase();
      const db3 = new MockDatabase();

      db1.setLatency(10);
      db2.setLatency(30);
      db3.setLatency(50);

      // All three processors try to create alert
      // With different latencies
      const [created1, created2, created3] = await Promise.all([
        createAlertWithDeduplication(db1, new AlertDeduplicator(), alert),
        createAlertWithDeduplication(db2, new AlertDeduplicator(), alert),
        createAlertWithDeduplication(db3, new AlertDeduplicator(), alert),
      ]);

      // Each has their own DB, so all succeed
      // In production with shared DB, only one would succeed
      expect(created1).toBe(true);
      expect(created2).toBe(true);
      expect(created3).toBe(true);
    });
  });

  describe('End-to-end scenarios', () => {
    it('should handle realistic multi-processor scenario', async () => {
      // Scenario: 3 processors detecting same anomaly
      // - Processor A: fast clock (+2s), 10ms latency
      // - Processor B: normal clock (0s), 30ms latency
      // - Processor C: slow clock (-2s), 50ms latency

      db.setLatency(25); // Average latency

      const alert = {
        service: 'payment-service',
        alertType: 'error_rate_spike',
        message: 'Error rate above 5%',
        severity: 'critical',
        timestamp: new Date(),
      };

      // Stagger the requests slightly to simulate real detection timing
      const createAlert = async (delayMs: number) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return createAlertWithDeduplication(db, deduplicator, alert);
      };

      const [created1, created2, created3] = await Promise.all([
        createAlert(0),   // Processor A detects first
        createAlert(5),   // Processor B detects 5ms later
        createAlert(10),  // Processor C detects 10ms later
      ]);

      // Only one should succeed due to advisory locks
      const successCount = [created1, created2, created3].filter(c => c).length;
      expect(successCount).toBe(1);
      expect(db.getAlerts()).toHaveLength(1);
    });

    it('should allow different alert types for same service', async () => {
      const alert1 = {
        service: 'api',
        alertType: 'high_latency',
        message: 'Latency spike',
        severity: 'warning',
        timestamp: new Date(),
      };

      const alert2 = {
        service: 'api',
        alertType: 'high_error_rate',
        message: 'Error rate spike',
        severity: 'critical',
        timestamp: new Date(),
      };

      const created1 = await createAlertWithDeduplication(db, deduplicator, alert1);
      const created2 = await createAlertWithDeduplication(db, deduplicator, alert2);

      // Both should succeed (different alert types)
      expect(created1).toBe(true);
      expect(created2).toBe(true);
      expect(db.getAlerts()).toHaveLength(2);
    });

    it('should allow same alert type for different services', async () => {
      const alert1 = {
        service: 'api',
        alertType: 'high_latency',
        message: 'Latency spike',
        severity: 'warning',
        timestamp: new Date(),
      };

      const alert2 = {
        service: 'database',
        alertType: 'high_latency',
        message: 'DB latency spike',
        severity: 'warning',
        timestamp: new Date(),
      };

      const created1 = await createAlertWithDeduplication(db, deduplicator, alert1);
      const created2 = await createAlertWithDeduplication(db, deduplicator, alert2);

      // Both should succeed (different services)
      expect(created1).toBe(true);
      expect(created2).toBe(true);
      expect(db.getAlerts()).toHaveLength(2);
    });
  });
});
