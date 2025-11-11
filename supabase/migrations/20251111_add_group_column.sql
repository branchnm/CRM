-- Add group column to customers table for nearby property clustering
-- This allows grouping multiple properties that are close together (e.g., same street)
-- to display them as a single unit in the schedule

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS "group" TEXT;

COMMENT ON COLUMN customers."group" IS 'Optional group name for clustering nearby properties together in the schedule (e.g., "Oak Ridge Cluster")';
