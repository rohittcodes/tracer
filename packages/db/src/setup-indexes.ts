import { getPool } from './db';

export async function setupAdditionalIndexes() {
  const pool = getPool();

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS logs_metadata_gin_idx 
      ON logs USING gin (metadata);
    `);
    console.log('✅ GIN index created for logs.metadata');
  } catch (error) {
    console.warn('Failed to create additional indexes:', error);
  }
}

