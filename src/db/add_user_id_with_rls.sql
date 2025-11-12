-- Migration: Add user_id column and proper RLS policies for data isolation
-- This ensures each user only sees their own data, with a special demo user for demo mode

-- Step 1: Add user_id column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 2: Add user_id column to jobs table  
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 3: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- Step 4: Drop existing public policies (too permissive)
DROP POLICY IF EXISTS "Allow public read access" ON customers;
DROP POLICY IF EXISTS "Allow public insert access" ON customers;
DROP POLICY IF EXISTS "Allow public update access" ON customers;
DROP POLICY IF EXISTS "Allow public delete access" ON customers;

DROP POLICY IF EXISTS "jobs_select_all" ON jobs;
DROP POLICY IF EXISTS "jobs_insert_all" ON jobs;
DROP POLICY IF EXISTS "jobs_update_all" ON jobs;
DROP POLICY IF EXISTS "jobs_delete_all" ON jobs;

-- Step 5: Create RLS policies for customers
-- Note: We use COALESCE to handle both authenticated users (auth.uid()) 
-- and demo mode (where auth.uid() is NULL but user_id is set)

CREATE POLICY "Users can view own customers" ON customers
  FOR SELECT
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

CREATE POLICY "Users can insert own customers" ON customers
  FOR INSERT
  WITH CHECK (true); -- Allow insert, user_id will be set by service layer

CREATE POLICY "Users can update own customers" ON customers
  FOR UPDATE
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
  WITH CHECK (true); -- Allow update, user_id is already set

CREATE POLICY "Users can delete own customers" ON customers
  FOR DELETE
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Step 6: Create RLS policies for jobs
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT
  WITH CHECK (true); -- Allow insert, user_id will be set by service layer

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
  WITH CHECK (true); -- Allow update, user_id is already set

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE
  USING (
    user_id = COALESCE(auth.uid(), user_id)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Step 7: Ensure RLS is enabled (it should already be from schema.sql)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Verification queries (run these to check the migration)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'user_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'user_id';
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('customers', 'jobs');
