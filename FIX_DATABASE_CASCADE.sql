-- Fix: Drop policies WITH CASCADE to remove user_id column
-- This will drop existing RLS policies that depend on user_id

-- Drop policies with CASCADE
DROP POLICY IF EXISTS "Users can view own customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Users can update own customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Users can view own jobs" ON jobs CASCADE;
DROP POLICY IF EXISTS "Users can insert own jobs" ON jobs CASCADE;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs CASCADE;
DROP POLICY IF EXISTS "Users can delete own jobs" ON jobs CASCADE;

-- Also drop any other policies that might exist
DROP POLICY IF EXISTS "Allow demo user full access to customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Allow demo user full access to jobs" ON jobs CASCADE;
DROP POLICY IF EXISTS "Allow public read access to customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Allow public read access to jobs" ON jobs CASCADE;
DROP POLICY IF EXISTS "Allow authenticated full access to customers" ON customers CASCADE;
DROP POLICY IF EXISTS "Allow authenticated full access to jobs" ON jobs CASCADE;

-- Disable RLS temporarily
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;

-- Now we can safely drop the column
ALTER TABLE customers DROP COLUMN IF EXISTS user_id CASCADE;
ALTER TABLE jobs DROP COLUMN IF EXISTS user_id CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_customers_user_id;
DROP INDEX IF EXISTS idx_jobs_user_id;

-- Database is now clean - no user_id, no RLS
-- All data is accessible without authentication
