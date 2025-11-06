# 🔐 Quick Auth Setup Guide

## ⚠️ IMPORTANT - READ THIS FIRST!

**If you're seeing other users' data:**
1. The existing customers/jobs in your database don't have `user_id` set yet
2. You MUST complete **Step 3** below to assign them to your account
3. Without Step 3, RLS policies can't filter the data properly
4. Use the diagnostic queries in `src/db/diagnose_and_fix_rls.sql` to verify

**Logout button on desktop:**
- Now shows your email + "Logout" text button (top right)
- Refresh your browser to see the updated UI

## ✅ What's Already Done
- ✅ Auth service layer created (`src/services/auth.ts`)
- ✅ Login/Signup UI built (`src/components/AuthPage.tsx`)
- ✅ App.tsx updated with auth state management
- ✅ Database migration SQL created (`src/db/add_user_auth.sql`)
- ✅ Service layer updated to filter by user_id
- ✅ Row Level Security policies ready

## 🚀 What You Need To Do

### Step 1: Apply Database Migration (5 minutes)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `oqzhxfggzveuhaldjuay`

2. **Run Migration SQL**
   - Click **SQL Editor** in left sidebar
   - Click **New Query**
   - Copy ALL contents from `src/db/add_user_auth.sql`
   - Paste into SQL Editor
   - Click **Run** button
   - Should see success messages for all commands

### Step 2: Create User Accounts (2 minutes)

1. **Your Account**
   - Go to **Authentication > Users** in Supabase Dashboard
   - Click **Add User** button
   - Email: `branchnm@jobflow.local`
   - Password: `jobflowcoceo!@`
   - **IMPORTANT**: Check ✅ **Auto Confirm User** checkbox
   - Click **Create User**
   - **Copy the UUID** that appears (looks like: `a1b2c3d4-e5f6-...`)

2. **Test Account**
   - Click **Add User** again
   - Email: `test@jobflow.local`
   - Password: `TestPassword123!`
   - Check ✅ **Auto Confirm User**
   - Click **Create User**

### Step 3: Migrate Existing Data (1 minute)

1. **Get Your User ID**
   - In SQL Editor, run:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'branchnm@jobflow.local';
   ```
   - Copy the `id` value (dbfbd6e7-6243-4420-8470-72df824f8506)

2. **Assign Data to Your Account**
   - Replace `YOUR_USER_ID_HERE` with the UUID you copied:
   ```sql
   UPDATE customers SET user_id = 'dbfbd6e7-6243-4420-8470-72df824f8506' WHERE user_id IS NULL;
   UPDATE jobs SET user_id = 'dbfbd6e7-6243-4420-8470-72df824f8506' WHERE user_id IS NULL;
   ```
   - Click **Run**

### Step 4: Test It! (2 minutes)

1. **Refresh your app** (Ctrl+R or Cmd+R)
2. You'll see the **Login page**
3. **Login as yourself**:
   - Email: `branchnm@jobflow.local`
   - Password: `jobflowcoceo!@`
   - Should see all your existing customers and jobs ✅

4. **Click Logout button** (top right)
5. **Login as test user**:
   - Email: `test@jobflow.local`
   - Password: `TestPassword123!`
   - Should see empty state (no customers yet) ✅

6. **Add a customer as test user**
7. **Logout and login as yourself**
8. Verify you DON'T see the test user's customer ✅

## 🎉 You're Done!

Your app now has:
- ✅ Secure multi-user authentication
- ✅ Data isolation (users can only see their own data)
- ✅ Row Level Security protecting the database
- ✅ Two accounts ready to use

## 🔑 Login Credentials

**Your Account:**
- Email: `branchnm@jobflow.local`
- Password: `jobflowcoceo!@`

**Test Account:**
- Email: `test@jobflow.local`
- Password: `TestPassword123!`

## ❓ Troubleshooting

**Test user can see branchnm's data?**
- **CRITICAL**: You MUST run Step 3 to assign existing data to your account
- Run the diagnostic queries in `src/db/diagnose_and_fix_rls.sql`
- Check if existing data has user_id:
  ```sql
  SELECT COUNT(*) FROM customers WHERE user_id IS NULL;
  SELECT COUNT(*) FROM jobs WHERE user_id IS NULL;
  ```
- If count > 0, run the UPDATE commands from Step 3 again

**Logout button not visible on desktop?**
- Fixed! Now shows email + "Logout" button on desktop
- Shows just icon on mobile
- Refresh your browser (Ctrl+R)

**Can't see login page?**
- Clear browser cache and refresh
- Check browser console for errors

**Login fails with "User not authenticated"?**
- Make sure you checked "Auto Confirm User" when creating accounts
- Try creating the account again

**Can't see existing customers after login?**
- Make sure you ran Step 3 (migrate existing data)
- Check that the user_id matches in SQL Editor:
  ```sql
  SELECT COUNT(*) FROM customers WHERE user_id = 'dbfbd6e7-6243-4420-8470-72df824f8506';
  ```

**RLS policies blocking everything?**
- Make sure you ran the full migration from `add_user_auth.sql`
- Check policies exist:
  ```sql
  SELECT * FROM pg_policies WHERE tablename IN ('customers', 'jobs');
  ```
- If no policies, run `src/db/diagnose_and_fix_rls.sql` section to recreate them
