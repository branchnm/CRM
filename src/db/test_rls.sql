-- ========================================
-- TEST RLS POLICIES - Run these one at a time
-- ========================================

-- TEST 1: Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('customers', 'jobs')
AND schemaname = 'public';
-- EXPECTED: Both should show rls_enabled = true

-- TEST 2: List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('customers', 'jobs')
ORDER BY tablename, cmd;
-- EXPECTED: Should see 8 policies (4 for customers, 4 for jobs)

-- TEST 3: Check all users
SELECT 
  id,
  email,
  created_at,
  confirmed_at,
  email_confirmed_at
FROM auth.users
ORDER BY created_at;
-- Make note of the user IDs

-- TEST 4: Check data ownership
SELECT 
  'customers' as table_name,
  user_id,
  COUNT(*) as count
FROM customers
GROUP BY user_id

UNION ALL

SELECT 
  'jobs' as table_name,
  user_id,
  COUNT(*) as count
FROM jobs
GROUP BY user_id;
-- This shows which user owns what data

-- TEST 5: Find orphaned data (no user_id)
SELECT 
  'customers without user_id' as issue,
  id,
  name,
  address
FROM customers
WHERE user_id IS NULL
LIMIT 5;

-- TEST 6: Check if policies are actually filtering
-- This simulates what happens when a user queries
-- Replace USER_ID_HERE with branchnm's user ID
SET LOCAL "request.jwt.claims" = '{"sub": "USER_ID_HERE"}';
SELECT COUNT(*) as visible_customers FROM customers;
RESET "request.jwt.claims";

-- ========================================
-- COMMON ISSUES AND FIXES:
-- ========================================

-- ISSUE 1: RLS not enabled
-- FIX:
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- ISSUE 2: No policies exist
-- FIX: Run src/db/fix_rls_completely.sql

-- ISSUE 3: Data has NULL user_id
-- FIX: Assign to a user
-- UPDATE customers SET user_id = 'USER_ID_HERE' WHERE user_id IS NULL;
-- UPDATE jobs SET user_id = 'USER_ID_HERE' WHERE user_id IS NULL;

-- ISSUE 4: Policies not using auth.uid()
-- FIX: Recreate policies (run fix_rls_completely.sql)

-- ========================================
-- VERIFICATION QUERY
-- ========================================
-- This should return exactly 8 rows
SELECT COUNT(*) as total_policies
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs');
