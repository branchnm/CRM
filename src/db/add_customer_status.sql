-- Add status column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'complete', 'inactive'));

-- Add a comment for clarity
COMMENT ON COLUMN customers.status IS 'Status for daily schedule: incomplete, complete, or inactive';
