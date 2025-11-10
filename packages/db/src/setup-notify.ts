import { getPool } from './db';

/**
 * Sets up PostgreSQL trigger function and trigger for NOTIFY on log insertion
 * This enables real-time processing without polling
 */
export async function setupLogNotifyTrigger() {
  const pool = getPool();

  try {
    // Create trigger function that sends NOTIFY when logs are inserted
    await pool.query(`
      CREATE OR REPLACE FUNCTION notify_log_insert()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('log_inserted', NEW.id::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger on logs table
    await pool.query(`
      DROP TRIGGER IF EXISTS log_insert_trigger ON logs;
      CREATE TRIGGER log_insert_trigger
      AFTER INSERT ON logs
      FOR EACH ROW
      EXECUTE FUNCTION notify_log_insert();
    `);

    console.log('✅ PostgreSQL LISTEN/NOTIFY trigger set up for real-time log processing');
  } catch (error) {
    console.warn('Failed to set up LISTEN/NOTIFY trigger:', error);
    throw error;
  }
}

