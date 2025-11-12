-- ========================================
-- RESET DATABASE TO CLEAN STATE
-- Remove all user_id and RLS changes
-- ========================================

-- Step 1: Drop all RLS policies
DROP POLICY IF EXISTS "Allow demo user full access to customers" ON customers;
DROP POLICY IF EXISTS "Allow demo user full access to jobs" ON jobs;
DROP POLICY IF EXISTS "Allow public read access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public read access to jobs" ON jobs;
DROP POLICY IF EXISTS "Allow authenticated full access to customers" ON customers;
DROP POLICY IF EXISTS "Allow authenticated full access to jobs" ON jobs;

-- Step 2: Disable RLS
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;

-- Step 3: Remove user_id column (if it exists)
ALTER TABLE customers DROP COLUMN IF EXISTS user_id;
ALTER TABLE jobs DROP COLUMN IF EXISTS user_id;

-- Step 4: Drop indexes (if they exist)
DROP INDEX IF EXISTS idx_customers_user_id;
DROP INDEX IF EXISTS idx_jobs_user_id;

-- ========================================
-- DONE! Database is back to original state
-- ========================================
-- Your customers and jobs tables are now:
-- - No user_id column
-- - No RLS enabled
-- - No policies
-- - Fully accessible without authentication
-- ========================================
