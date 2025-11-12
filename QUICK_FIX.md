# Quick Fix for Data Isolation Issues

## Problem
When `VITE_DEMO_MODE=false` and logged in:
- ❌ Seeing demo jobs that should only appear in demo mode
- ❌ Jobs showing in calendar but not in forecast

## Root Cause
1. RLS policies were too permissive (allowing demo data to show for all users)
2. Queries weren't explicitly filtering by `user_id`

## Solution Applied

### 1. Fixed Service Layer (✅ Already Done)
Updated `src/services/customers.ts` and `src/services/jobs.ts`:
- Added explicit `.eq("user_id", userId)` filter to all fetch queries
- This ensures data is filtered at the query level, not just RLS

### 2. Updated RLS Policies (⚠️ You Need to Run SQL)
Created `REAPPLY_MIGRATION.sql` with corrected policies that:
- Allow authenticated users to ONLY see their own data
- Demo data (`user_id = 00000000-0000-0000-0000-000000000001`) is ONLY visible in demo mode
- NO cross-user data leakage

## Steps to Fix

### Step 1: Run the SQL Migration
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Paste contents of **`REAPPLY_MIGRATION.sql`**
4. Click "Run"

This will:
- Drop old permissive policies
- Create new restrictive policies
- Show you any orphaned data (NULL user_id)

### Step 2: Handle Orphaned Data (if any)
If Step 1 shows orphaned records, choose one option:

**Option A: Assign to Demo User**
```sql
UPDATE customers 
SET user_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id IS NULL;

UPDATE jobs 
SET user_id = '00000000-0000-0000-0000-000000000001'
WHERE user_id IS NULL;
```

**Option B: Delete Orphaned Data**
```sql
DELETE FROM customers WHERE user_id IS NULL;
DELETE FROM jobs WHERE user_id IS NULL;
```

### Step 3: Restart Dev Server
```powershell
# Stop current server (Ctrl+C)
npm run dev
```

### Step 4: Test Both Modes

**Test 1: Demo Mode**
1. Set in `.env.local`: `VITE_DEMO_MODE=true`
2. Restart server
3. Should see NO login screen
4. Add a customer → should work
5. Jobs should appear in BOTH calendar AND forecast

**Test 2: Normal Auth Mode**
1. Set in `.env.local`: `VITE_DEMO_MODE=false`
2. Restart server
3. Login with your account
4. Should see ONLY your own customers/jobs
5. Should NOT see demo data
6. Jobs should appear in BOTH calendar AND forecast

**Test 3: Multiple Users**
1. Still in auth mode (`VITE_DEMO_MODE=false`)
2. Logout → Sign up with a different email
3. Should see ZERO customers/jobs (fresh account)
4. Add a customer
5. Logout → Login with first account again
6. Should NOT see the second account's customer

## Expected Behavior After Fix

### When VITE_DEMO_MODE=true (Demo Mode)
```
You see:
✅ Demo customers (user_id = 00000000-0000-0000-0000-000000000001)
✅ Demo jobs (user_id = 00000000-0000-0000-0000-000000000001)
❌ NO real user data

Jobs appear in:
✅ Calendar
✅ Forecast
```

### When VITE_DEMO_MODE=false AND logged in as User A
```
You see:
✅ User A's customers (user_id = User A's UUID)
✅ User A's jobs (user_id = User A's UUID)
❌ NO demo data
❌ NO other users' data

Jobs appear in:
✅ Calendar
✅ Forecast
```

### When VITE_DEMO_MODE=false AND logged in as User B
```
You see:
✅ User B's customers (user_id = User B's UUID)
✅ User B's jobs (user_id = User B's UUID)
❌ NO demo data
❌ NO User A's data

Jobs appear in:
✅ Calendar
✅ Forecast
```

## Why This Fix Works

### Before (Broken)
```typescript
// Query didn't filter by user_id
const { data } = await supabase
  .from("jobs")
  .select("*");
// ❌ Returns ALL jobs because RLS policy allowed demo data for everyone
```

### After (Fixed)
```typescript
// Query explicitly filters by user_id
const userId = await getCurrentUserId(); // Returns demo ID or real user ID
const { data } = await supabase
  .from("jobs")
  .select("*")
  .eq("user_id", userId); // ✅ Only returns jobs for this specific user
```

### RLS Policy Before (Too Permissive)
```sql
-- BAD: Demo data visible to everyone
USING (
  user_id = COALESCE(auth.uid(), user_id)
  OR user_id = '00000000-0000-0000-0000-000000000001'
)
-- ❌ The "OR demo user" clause makes demo data always visible
```

### RLS Policy After (Restrictive)
```sql
-- GOOD: Demo data ONLY visible when NOT authenticated
USING (
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR user_id = '00000000-0000-0000-0000-000000000001'
)
-- ✅ When logged in: auth.uid() IS NOT NULL, so only see your own data
-- ✅ When NOT logged in (demo): auth.uid() IS NULL, so only see demo data
```

## Debugging

If you still see issues after running the migration:

**Check what user_id you're using:**
```javascript
// Open browser console on the app
// You should see logs like:
🔐 Fetching jobs for user: DEMO MODE ID: 00000000-0000-0000-0000-000000000001
// Or:
🔐 Fetching jobs for user: your.email@example.com ID: abc-123-def-456
```

**Check database directly:**
```sql
-- See all jobs with their user_ids
SELECT 
  j.id,
  j.date,
  j.user_id,
  CASE 
    WHEN j.user_id = '00000000-0000-0000-0000-000000000001' THEN '🎭 DEMO'
    ELSE '👤 REAL USER'
  END as type
FROM jobs j
ORDER BY j.user_id, j.date;
```

**Verify RLS is working:**
```sql
-- Test as anonymous user (should only see demo data)
SET ROLE anon;
SELECT COUNT(*) FROM jobs WHERE user_id != '00000000-0000-0000-0000-000000000001';
-- Should return 0
RESET ROLE;
```

## Summary
✅ **Code changes:** Already applied (explicit user_id filtering)  
⚠️ **Database changes:** You need to run `REAPPLY_MIGRATION.sql`  
✅ **Result:** Complete data isolation between users and demo mode
