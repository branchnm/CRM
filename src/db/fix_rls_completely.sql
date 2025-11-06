-- ========================================
-- COMPLETE RLS FIX - Run this entire script
-- ========================================

-- STEP 1: Check current state (for debugging)
-- ========================================
SELECT 'Checking RLS status...' as step;

SELECT 
  tablename, 
  rowsecurity as rls_enabled 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('customers', 'jobs');

-- STEP 2: Drop all existing policies (clean slate)
-- ========================================
SELECT 'Dropping existing policies...' as step;

DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;
DROP POLICY IF EXISTS "Users can view own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON jobs;

-- STEP 3: Make sure user_id columns exist
-- ========================================
SELECT 'Checking user_id columns...' as step;

-- Add user_id to customers if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to jobs if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jobs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- STEP 4: Enable RLS
-- ========================================
SELECT 'Enabling RLS...' as step;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- STEP 5: Create fresh policies
-- ========================================
SELECT 'Creating RLS policies...' as step;

-- CUSTOMERS policies
CREATE POLICY "Users can view own customers"
ON customers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers"
ON customers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers"
ON customers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers"
ON customers FOR DELETE
USING (auth.uid() = user_id);

-- JOBS policies
CREATE POLICY "Users can view own jobs"
ON jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
ON jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
ON jobs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs"
ON jobs FOR DELETE
USING (auth.uid() = user_id);

-- STEP 6: Create indexes (if they don't exist)
-- ========================================
SELECT 'Creating indexes...' as step;

CREATE INDEX IF NOT EXISTS customers_user_id_idx ON customers(user_id);
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);

-- STEP 7: Show all users and their data counts
-- ========================================
SELECT 'Checking data distribution...' as step;

SELECT 
  u.email,
  u.id as user_id,
  (SELECT COUNT(*) FROM customers WHERE user_id = u.id) as customer_count,
  (SELECT COUNT(*) FROM jobs WHERE user_id = u.id) as job_count
FROM auth.users u
ORDER BY u.created_at;

-- STEP 8: Show records WITHOUT user_id (these won't be visible to anyone!)
-- ========================================
SELECT 'Checking orphaned records...' as step;

SELECT 
  'customers' as table_name,
  COUNT(*) as records_without_user_id
FROM customers 
WHERE user_id IS NULL

UNION ALL

SELECT 
  'jobs' as table_name,
  COUNT(*) as records_without_user_id
FROM jobs 
WHERE user_id IS NULL;

-- STEP 9: Verify policies were created
-- ========================================
SELECT 'Verifying policies...' as step;

SELECT 
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'USING clause present'
    ELSE 'No USING clause'
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN 'WITH CHECK clause present'
    ELSE 'No WITH CHECK clause'
  END as with_check_clause
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs')
ORDER BY tablename, cmd;

-- ========================================
-- EXPECTED RESULTS:
-- ========================================
-- You should see:
-- 1. RLS enabled = true for both tables
-- 2. 8 policies total (4 for customers, 4 for jobs)
-- 3. Each user's data count
-- 4. Any orphaned records (user_id IS NULL)
--
-- If you see orphaned records, you need to assign them to a user:
--
-- UPDATE customers SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE jobs SET user_id = 'YOUR_USER_ID_HERE' WHERE user_id IS NULL;
