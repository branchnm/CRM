-- ========================================
-- STEP 1: Run the migration to add user_id and RLS
-- ========================================
-- Copy and paste the contents of src/db/add_user_auth.sql into Supabase SQL Editor
-- This will:
--   1. Add user_id columns to customers and jobs tables
--   2. Enable Row Level Security
--   3. Create policies to isolate data by user
--   4. Add indexes for performance

-- ========================================
-- STEP 2: Create user accounts manually
-- ========================================
-- Since Supabase auth requires email verification by default,
-- you'll need to create accounts via the Supabase Dashboard:
--
-- Go to Authentication > Users > Add User
--
-- Account 1 (Your Account):
--   Email: branchnm@jobflow.local
--   Password: jobflowcoceo!@
--   Auto Confirm User: YES (check this box)
--
-- Account 2 (Test Account):
--   Email: test@jobflow.local
--   Password: TestPassword123!
--   Auto Confirm User: YES (check this box)

-- ========================================
-- STEP 3: Migrate existing data to your account
-- ========================================
-- After creating branchnm@jobflow.local account, get the user_id:

-- Find your user_id (run this after creating the account):
SELECT id, email FROM auth.users WHERE email = 'branchnm@jobflow.local';

-- Copy the id (UUID) and replace YOUR_USER_ID_HERE below:

-- Update existing customers to belong to your account:
UPDATE customers 
SET user_id = 'YOUR_USER_ID_HERE' 
WHERE user_id IS NULL;

-- Update existing jobs to belong to your account:
UPDATE jobs 
SET user_id = 'YOUR_USER_ID_HERE' 
WHERE user_id IS NULL;

-- ========================================
-- STEP 4: Test the setup
-- ========================================
-- 1. Log in with branchnm@jobflow.local - should see existing customers/jobs
-- 2. Log in with test@jobflow.local - should see empty state
-- 3. Create a customer as test user - branchnm user should NOT see it
-- 4. Log back in as branchnm - verify data is still there
