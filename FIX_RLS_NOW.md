# 🔧 Fix RLS Data Isolation - Step by Step

## Problem
All users can see all customers and jobs, regardless of who created them.

## Root Cause
Either:
1. RLS policies weren't applied correctly
2. Existing data doesn't have `user_id` set
3. RLS is disabled on the tables

## 🚀 Complete Fix (10 minutes)

### Step 1: Refresh Your App and Check Debug Logs

1. **Refresh your browser** (Ctrl+R or Cmd+R)
2. **Open browser console** (F12 → Console tab)
3. **Login** with any account
4. Look for these debug messages:
   ```
   🔐 Fetching customers for user: test@jobflow.local ID: abc-123-xyz
   📊 Fetched customers: 5 records
   🔍 First customer user_id: null
   ```

**What to check:**
- ✅ Does it show the correct email you logged in with?
- ⚠️ Does `First customer user_id` show `null` or `undefined`? → **This is the problem!**
- ✅ Does it show a different user_id than the one logged in? → RLS policies might be missing

### Step 2: Run Complete RLS Fix in Supabase

1. **Go to Supabase Dashboard** → https://supabase.com/dashboard
2. **Select your project**: `oqzhxfggzveuhaldjuay`
3. **Click SQL Editor** (left sidebar)
4. **Click "New Query"**
5. **Copy the ENTIRE contents** of `src/db/fix_rls_completely.sql`
6. **Paste into SQL Editor**
7. **Click Run** (or press Ctrl+Enter)

**Expected Output:**
- You'll see multiple result sets
- RLS should show `enabled = true`
- Should see 8 policies listed
- Should see user data distribution
- Should see any orphaned records (user_id IS NULL)

### Step 3: Assign Orphaned Data to Your Account

**If Step 2 showed records with `user_id IS NULL`:**

1. **Get your user ID** - Look for this in the Step 2 results, or run:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'branchnm@jobflow.local';
   ```
   Copy the `id` (UUID like: `dbfbd6e7-6243-4420-8470-72df824f8506`)

2. **Assign all orphaned data to YOUR account:**
   ```sql
   -- Replace with YOUR actual user_id from step 1
   UPDATE customers 
   SET user_id = 'dbfbd6e7-6243-4420-8470-72df824f8506' 
   WHERE user_id IS NULL;

   UPDATE jobs 
   SET user_id = 'dbfbd6e7-6243-4420-8470-72df824f8506' 
   WHERE user_id IS NULL;
   ```

3. **Verify it worked:**
   ```sql
   -- Should both return 0
   SELECT COUNT(*) FROM customers WHERE user_id IS NULL;
   SELECT COUNT(*) FROM jobs WHERE user_id IS NULL;
   ```

### Step 4: Test Data Isolation

1. **Refresh your app** (Ctrl+R)
2. **Login as branchnm@jobflow.local**
   - Should see your customers and jobs ✅
   - Check console logs - should show your user_id

3. **Logout** (top right button)

4. **Login as test@jobflow.local**
   - Should see **EMPTY** state (no customers) ✅
   - Check console logs - should show test user's ID
   - Console should show: `📊 Fetched customers: 0 records`

5. **Create a new customer as test user**
   - Add any test customer

6. **Logout and login as branchnm**
   - Should **NOT** see the test user's customer ✅
   - Should only see your original customers

## ✅ Success Criteria

**Console logs when logged in as branchnm:**
```
🔐 Fetching customers for user: branchnm@jobflow.local ID: dbfbd6e7-6243-4420-8470-72df824f8506
📊 Fetched customers: 5 records
🔍 First customer user_id: dbfbd6e7-6243-4420-8470-72df824f8506
```

**Console logs when logged in as test:**
```
🔐 Fetching customers for user: test@jobflow.local ID: abc-different-id-xyz
📊 Fetched customers: 0 records
🔍 First customer user_id: undefined
```

**Database state:**
```sql
-- Run this to verify
SELECT 
  (SELECT COUNT(*) FROM customers WHERE user_id IS NULL) as orphaned_customers,
  (SELECT COUNT(*) FROM jobs WHERE user_id IS NULL) as orphaned_jobs,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('customers', 'jobs')) as total_policies;
```
Should show: `orphaned_customers: 0, orphaned_jobs: 0, total_policies: 8`

## 🆘 Still Not Working?

### Check 1: RLS Actually Enabled?
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('customers', 'jobs') 
AND schemaname = 'public';
```
Both should show `rowsecurity = true`

### Check 2: Policies Exist?
```sql
SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('customers', 'jobs');
```
Should return `8`

### Check 3: Auth Session Active?
- Open browser console
- Run: `localStorage.getItem('supabase.auth.token')`
- Should show a JWT token
- If null, you're not logged in properly

### Check 4: Using Anon Key (not Service Role)?
- Check `src/utils/supabase/info.ts`
- The key should start with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xemh4Zmd...`
- Should say `"role":"anon"` when decoded

## 📞 Need More Help?

Run the diagnostic script:
```sql
-- Copy contents of src/db/test_rls.sql and run it
```

This will show:
- RLS status
- All policies
- All users
- Data ownership
- Orphaned records

Share the output if you need help debugging further.
