-- Migration: Add deduplication constraints for alerts
-- Layer 3: Safety net using database constraints

-- Drop existing constraint if any
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS unique_active_alert_per_service_type;

-- Create partial unique index on active alerts
-- This prevents duplicate alerts for the same service+type combination
-- Only applies to unresolved alerts (resolved_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_alert
  ON alerts (service, alert_type)
  WHERE resolved_at IS NULL;

-- Alternative approach: Time-bucketed deduplication
-- Uncomment this section if you prefer time-windowed uniqueness
-- instead of "only one active alert" constraint

/*
-- Function to bucket timestamps into 5-second intervals
CREATE OR REPLACE FUNCTION alert_time_bucket(ts TIMESTAMP)
RETURNS TIMESTAMP AS $$
BEGIN
  RETURN date_trunc('minute', ts) +
         INTERVAL '5 seconds' * FLOOR(EXTRACT(EPOCH FROM ts - date_trunc('minute', ts)) / 5);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create index on time-bucketed alerts
-- Allows multiple alerts for same service+type if they're >5s apart
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_bucketed_alert
  ON alerts (service, alert_type, alert_time_bucket(created_at))
  WHERE resolved_at IS NULL;
*/

-- Add index for fast duplicate lookups
-- Used by deduplication layer during time-windowed queries
CREATE INDEX IF NOT EXISTS idx_alerts_dedup_lookup
  ON alerts (service, alert_type, created_at)
  WHERE resolved_at IS NULL;

-- Comments for documentation
COMMENT ON INDEX idx_unique_active_alert IS
  'Prevents duplicate active alerts for same service and alert type. Part of L3 safety net in distributed deduplication system.';

COMMENT ON INDEX idx_alerts_dedup_lookup IS
  'Optimizes time-windowed duplicate detection queries. Used by advisory lock layer (L2) to check for recent alerts.';
