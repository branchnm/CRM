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

-- Step 5: Create RLS policies for customers (user can only see their own data)
CREATE POLICY "Users can view own customers" ON customers
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers" ON customers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers" ON customers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers" ON customers
  FOR DELETE
  USING (auth.uid() = user_id);

-- Step 6: Create RLS policies for jobs (user can only see their own data)
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Step 7: Ensure RLS is enabled (it should already be from schema.sql)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Step 8: Create a special demo user for demo mode
-- This is a fixed UUID that will be used for all demo mode data
-- Demo user ID: 00000000-0000-0000-0000-000000000001
-- Note: This user won't exist in auth.users, but RLS policies will allow operations
-- when the app provides this user_id directly in INSERT/UPDATE operations

-- Add special policies for demo user (allows anonymous access with demo user_id)
CREATE POLICY "Allow demo user data access" ON customers
  FOR ALL
  USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY "Allow demo user jobs access" ON jobs
  FOR ALL
  USING (user_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Verification queries (run these to check the migration)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'user_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'user_id';
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('customers', 'jobs');
