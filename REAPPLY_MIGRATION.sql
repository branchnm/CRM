-- Re-apply Migration with Corrected RLS Policies
-- Run this if you already ran the previous migration but are still seeing data isolation issues

-- Step 1: Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;
DROP POLICY IF EXISTS "Allow demo user data access" ON customers;

DROP POLICY IF EXISTS "Users can view own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON jobs;
DROP POLICY IF EXISTS "Allow demo user jobs access" ON jobs;

-- Step 2: Create CORRECTED RLS policies for customers
-- These policies work for both authenticated users AND demo mode
CREATE POLICY "Users can view own customers" ON customers
  FOR SELECT
  USING (
    -- Allow if user is authenticated and owns the record
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    -- OR if this is demo data (accessible to anyone)
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

CREATE POLICY "Users can insert own customers" ON customers
  FOR INSERT
  WITH CHECK (true); -- Allow insert, user_id will be set by service layer

CREATE POLICY "Users can update own customers" ON customers
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
  WITH CHECK (true);

CREATE POLICY "Users can delete own customers" ON customers
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Step 3: Create CORRECTED RLS policies for jobs
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
  WITH CHECK (true);

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Step 4: Check for orphaned data (rows with NULL user_id)
-- This query will show you any data that needs to be assigned to a user
SELECT 'customers' as table_name, COUNT(*) as orphaned_count
FROM customers
WHERE user_id IS NULL
UNION ALL
SELECT 'jobs', COUNT(*)
FROM jobs
WHERE user_id IS NULL;

-- Step 5 (OPTIONAL): Assign orphaned data to demo user
-- Uncomment these if you want to assign existing data without user_id to demo mode:

-- UPDATE customers 
-- SET user_id = '00000000-0000-0000-0000-000000000001'::uuid
-- WHERE user_id IS NULL;

-- UPDATE jobs 
-- SET user_id = '00000000-0000-0000-0000-000000000001'::uuid
-- WHERE user_id IS NULL;

-- Step 6: Verify policies are correct
SELECT 
  schemaname, 
  tablename, 
  policyname,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs')
ORDER BY tablename, policyname;

-- Step 7: Test data visibility
-- When logged in as a user, run this to see what you can access:
-- SELECT name, user_id FROM customers;
-- You should ONLY see:
--   1. Customers with your user_id (from auth.uid())
--   2. Demo customers (user_id = 00000000-0000-0000-0000-000000000001)
