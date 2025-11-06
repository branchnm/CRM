-- ========================================
-- DIAGNOSTIC QUERIES - Run these first to see what's wrong
-- ========================================

-- 1. Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('customers', 'jobs');
-- Should show: rowsecurity = true for both

-- 2. Check existing policies
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs');
-- Should show 8 policies (4 for customers, 4 for jobs)

-- 3. Check if existing data has user_id set
SELECT 
  (SELECT COUNT(*) FROM customers WHERE user_id IS NULL) as customers_without_user,
  (SELECT COUNT(*) FROM customers WHERE user_id IS NOT NULL) as customers_with_user,
  (SELECT COUNT(*) FROM jobs WHERE user_id IS NULL) as jobs_without_user,
  (SELECT COUNT(*) FROM jobs WHERE user_id IS NOT NULL) as jobs_with_user;
-- If customers_without_user > 0, that's the problem!

-- 4. Get your user IDs
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at;
-- Copy the ID for branchnm@jobflow.local

-- ========================================
-- FIX: Assign existing data to branchnm account
-- ========================================

-- STEP 1: Get branchnm's user_id
SELECT id, email FROM auth.users WHERE email = 'branchnm@jobflow.local';
-- Copy the UUID (looks like: a1b2c3d4-e5f6-7890-abcd-ef1234567890)

-- STEP 2: Replace YOUR_USER_ID_HERE with the UUID you copied above
-- Then run these UPDATE commands:

UPDATE customers 
SET user_id = 'YOUR_USER_ID_HERE' 
WHERE user_id IS NULL;

UPDATE jobs 
SET user_id = 'YOUR_USER_ID_HERE' 
WHERE user_id IS NULL;

-- STEP 3: Verify the fix
SELECT 
  (SELECT COUNT(*) FROM customers WHERE user_id IS NULL) as customers_without_user,
  (SELECT COUNT(*) FROM jobs WHERE user_id IS NULL) as jobs_without_user;
-- Both should be 0

-- ========================================
-- ALTERNATIVE: If RLS policies are missing
-- ========================================

-- If the policies don't exist, re-run them:

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;
DROP POLICY IF EXISTS "Users can view own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON jobs;

-- Recreate policies
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
