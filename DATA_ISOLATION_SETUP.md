# Data Isolation Setup Guide

This guide explains how to set up proper data isolation so that:
- **Demo mode** has its own separate customers and jobs
- **Authenticated users** only see their own data (isolated from other users)
- You can switch between modes using the `VITE_DEMO_MODE` environment variable

## Architecture Overview

### User ID Strategy
- **Demo Mode:** Uses fixed UUID `00000000-0000-0000-0000-000000000001`
- **Normal Mode:** Uses actual authenticated user's UUID from Supabase Auth

### How It Works
1. Each customer and job record has a `user_id` column
2. Row Level Security (RLS) policies automatically filter queries by `user_id`
3. When `VITE_DEMO_MODE=true`, all operations use the demo user ID
4. When `VITE_DEMO_MODE=false`, operations use the logged-in user's ID

## Step-by-Step Setup

### Step 1: Run Database Migration

Open Supabase Dashboard → SQL Editor → Paste and run `src/db/add_user_id_with_rls.sql`

This migration will:
- ✅ Add `user_id` column to `customers` and `jobs` tables
- ✅ Create indexes for performance
- ✅ Remove old public access policies
- ✅ Create user-specific RLS policies (users only see their own data)
- ✅ Create special demo user policies (allow demo data access)

### Step 2: Verify Migration

Run these queries in Supabase SQL Editor to confirm:

```sql
-- Check user_id columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('customers', 'jobs') 
  AND column_name = 'user_id';

-- Should return 2 rows (one for customers, one for jobs)

-- Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('customers', 'jobs')
ORDER BY tablename, policyname;

-- Should show policies like "Users can view own customers", "Allow demo user data access", etc.
```

### Step 3: Test Demo Mode

1. **Set demo mode in `.env.local`:**
   ```env
   VITE_DEMO_MODE=true
   ```

2. **Start dev server:**
   ```powershell
   npm run dev
   ```

3. **Verify behavior:**
   - No login screen should appear
   - Add a customer → should save successfully
   - Check browser console → should see `🔐 Fetching customers for user: DEMO MODE ID: 00000000-0000-0000-0000-000000000001`

4. **Check database:**
   ```sql
   SELECT name, user_id 
   FROM customers 
   WHERE user_id = '00000000-0000-0000-0000-000000000001';
   ```
   Should show your demo customers.

### Step 4: Test Normal Auth Mode

1. **Disable demo mode in `.env.local`:**
   ```env
   VITE_DEMO_MODE=false
   ```

2. **Restart dev server:**
   ```powershell
   npm run dev
   ```

3. **Verify behavior:**
   - Login screen should appear
   - Sign up with a new account (e.g., `test@example.com`)
   - Add a customer → should save successfully
   - Should NOT see any demo mode customers
   - Check browser console → should see your email and a different user ID

4. **Test with second account:**
   - Logout
   - Sign up with another account (e.g., `test2@example.com`)
   - Should NOT see customers from first account
   - Each user sees only their own data

### Step 5: Verify Data Isolation

Run this query in Supabase to see all users' data:

```sql
SELECT 
  c.name,
  c.user_id,
  CASE 
    WHEN c.user_id = '00000000-0000-0000-0000-000000000001' THEN 'DEMO USER'
    ELSE 'REAL USER'
  END as user_type
FROM customers c
ORDER BY c.user_id, c.name;
```

You should see:
- Demo customers with `user_id = 00000000-0000-0000-0000-000000000001`
- Each authenticated user's customers with their unique `user_id`

## Deployment

### Vercel Deployment (Public Demo)

1. **Set environment variable in Vercel:**
   - Dashboard → Project → Settings → Environment Variables
   - Add: `VITE_DEMO_MODE` = `true`

2. **Deploy:**
   ```powershell
   git add .
   git commit -m "Add data isolation with RLS policies"
   git push origin main
   ```

3. **Result:**
   - Public visitors see demo data (all using same demo user ID)
   - Demo data is isolated from real users
   - Can share link with Twilio without exposing your real customer data

### Production Deployment (With Auth)

1. **Set environment variable in Vercel:**
   - Change `VITE_DEMO_MODE` to `false` (or remove it)

2. **Redeploy**

3. **Result:**
   - Users must log in
   - Each user sees only their own customers/jobs
   - Complete data isolation between users

## Troubleshooting

### "Failed to fetch customers: new row violates row-level security policy"

**Cause:** Trying to insert data without proper `user_id`

**Solution:** Ensure migration ran successfully. Check RLS policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'customers';
```

### "User not authenticated" error in normal mode

**Cause:** Trying to access data while logged out

**Solution:** This is expected behavior. Login required when `VITE_DEMO_MODE=false`

### Demo mode shows no customers even though database has them

**Cause:** Customers have wrong `user_id` (not the demo user ID)

**Solution:** Update existing customers to use demo user ID:
```sql
UPDATE customers 
SET user_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id IS NULL OR user_id != '00000000-0000-0000-0000-000000000001';
```

### Seeing other users' data in normal mode

**Cause:** RLS policies not enabled or incorrect

**Solution:** Verify RLS is enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('customers', 'jobs');
```

Both should show `rowsecurity = true`. If not, run:
```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
```

## Summary

✅ **Demo Mode (`VITE_DEMO_MODE=true`):**
- Uses fixed demo user ID: `00000000-0000-0000-0000-000000000001`
- No authentication required
- All demo users share the same data
- Isolated from real user data

✅ **Normal Mode (`VITE_DEMO_MODE=false`):**
- Requires login/signup
- Each user has unique UUID from Supabase Auth
- RLS policies enforce data isolation
- Users only see their own customers/jobs

✅ **Switching Modes:**
- Change `VITE_DEMO_MODE` in `.env.local` (local)
- Change `VITE_DEMO_MODE` in Vercel environment variables (production)
- Redeploy/restart to apply changes
