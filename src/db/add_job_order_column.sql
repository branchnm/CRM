-- Add order column to jobs table for stable sorting
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT NULL;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_jobs_order ON jobs("order");

-- Set initial order values for existing jobs (by creation order)
UPDATE jobs 
SET "order" = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY date ORDER BY created_at) as row_num
  FROM jobs
  WHERE "order" IS NULL
) sub
WHERE jobs.id = sub.id AND jobs."order" IS NULL;