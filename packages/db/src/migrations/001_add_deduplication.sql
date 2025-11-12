-- Migration: Add deduplication support to alerts table
-- This migration adds time-based deduplication to prevent duplicate alerts
-- from multiple processors within a 5-second window

-- Add time_bucket column for deduplication window
ALTER TABLE alerts ADD COLUMN time_bucket BIGINT NOT NULL DEFAULT 0;

-- Update existing alerts with appropriate time buckets
UPDATE alerts 
SET time_bucket = FLOOR(EXTRACT(EPOCH FROM created_at) / 5)
WHERE time_bucket = 0;

-- Create unique partial index for active alerts (PostgreSQL 12+)
-- This enforces that only one active alert per service/type/bucket combination
CREATE UNIQUE INDEX idx_alert_dedup_active 
ON alerts (service, alert_type, time_bucket) 
WHERE resolved = false;

-- Create index for efficient duplicate checking
CREATE INDEX idx_alerts_dedup_lookup 
ON alerts (service, alert_type, created_at DESC) 
WHERE resolved = false;

-- Add comment for documentation
COMMENT ON COLUMN alerts.time_bucket IS '5-second time bucket for deduplication (handles clock skew)';
COMMENT ON INDEX idx_alert_dedup_active IS 'Unique constraint for alert deduplication within 5-second windows';

-- Verify the migration
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'alerts' 
  AND column_name = 'time_bucket';

-- Show created indexes
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'alerts' 
  AND indexname IN ('idx_alert_dedup_active', 'idx_alerts_dedup_lookup');