-- ========================================
-- EMERGENCY FIX: Remove Public Access Policies
-- ========================================
-- These policies are allowing everyone to see all data!
-- They override the user-specific RLS policies

-- Remove public access policies from customers table
DROP POLICY IF EXISTS "Allow public read access" ON customers;
DROP POLICY IF EXISTS "Allow public insert access" ON customers;
DROP POLICY IF EXISTS "Allow public update access" ON customers;
DROP POLICY IF EXISTS "Allow public delete access" ON customers;

-- Remove public access policies from jobs table
DROP POLICY IF EXISTS "jobs_select_all" ON jobs;
DROP POLICY IF EXISTS "jobs_insert_all" ON jobs;
DROP POLICY IF EXISTS "jobs_update_all" ON jobs;
DROP POLICY IF EXISTS "jobs_delete_all" ON jobs;

-- Verify only user-specific policies remain
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs')
ORDER BY tablename, cmd;

-- EXPECTED RESULT: Should see exactly 8 policies:
-- customers: Users can view own customers (SELECT)
-- customers: Users can insert own customers (INSERT)
-- customers: Users can update own customers (UPDATE)
-- customers: Users can delete own customers (DELETE)
-- jobs: Users can view own jobs (SELECT)
-- jobs: Users can insert own jobs (INSERT)
-- jobs: Users can update own jobs (UPDATE)
-- jobs: Users can delete own jobs (DELETE)

-- After running this, refresh your app and test again!
