import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db';

export interface AdvisoryLockHandle {
  client: PoolClient;
  keyParts: [number, number];
  key: string;
}

function hashKey(key: string): [number, number] {
  const hash = createHash('sha256').update(key).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

/**
 * Acquire a Postgres advisory lock for the provided key.
 * This call blocks until the lock is available to guarantee ordering.
 */
export async function acquireAdvisoryLock(key: string): Promise<AdvisoryLockHandle> {
  const pool = getPool();
  const client = await pool.connect();
  const keyParts = hashKey(key);

  try {
    await client.query('SELECT pg_advisory_lock($1, $2);', keyParts);
    return { client, keyParts, key };
  } catch (error) {
    client.release();
    throw error;
  }
}

/**
 * Release a previously acquired advisory lock.
 */
export async function releaseAdvisoryLock(handle: AdvisoryLockHandle): Promise<void> {
  try {
    await handle.client.query('SELECT pg_advisory_unlock($1, $2);', handle.keyParts);
  } finally {
    handle.client.release();
  }
}
