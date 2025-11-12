# Data Isolation Implementation Summary

## What Changed

### 1. Database Migration (`src/db/add_user_id_with_rls.sql`)
**Added:**
- `user_id UUID` column to `customers` table
- `user_id UUID` column to `jobs` table
- Indexes on both `user_id` columns for performance
- RLS policies that filter by `auth.uid() = user_id`
- Special policies for demo user ID (`00000000-0000-0000-0000-000000000001`)

**Removed:**
- Old public access policies (too permissive)

### 2. Service Layer Updates

#### `src/services/customers.ts`
**Added:**
```typescript
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
```

**Modified `getCurrentUserId()`:**
- Returns `DEMO_USER_ID` when `VITE_DEMO_MODE=true`
- Returns authenticated user ID when `VITE_DEMO_MODE=false`

**Effect:**
- All customer operations (fetch, add, update, delete) now use the appropriate user ID
- Demo data isolated to demo user ID
- Real users isolated by their auth user ID

#### `src/services/jobs.ts`
**Same changes as customers.ts:**
- Added `DEMO_USER_ID` constant
- Added `DEMO_MODE` check
- Modified `getCurrentUserId()` to return demo ID or real user ID

**Effect:**
- Jobs now tied to user ID
- Demo jobs isolated from real user jobs

### 3. How Data Isolation Works

```
┌─────────────────────────────────────────────────────────────┐
│                        DATABASE                              │
├─────────────────────────────────────────────────────────────┤
│  Customers Table                                             │
│  ┌──────────┬─────────────────────────────────────────────┐ │
│  │ user_id  │ name           │ address         │ ...       │ │
│  ├──────────┼────────────────┼─────────────────┼──────────┤ │
│  │ 00...01  │ Demo Customer  │ 123 Demo St     │ ...       │ │ <- Demo Mode
│  │ 00...01  │ Another Demo   │ 456 Demo Ave    │ ...       │ │ <- Demo Mode
│  │ abc123   │ Real User 1    │ 789 Real Rd     │ ...       │ │ <- User 1
│  │ abc123   │ User 1 Cust 2  │ 321 Main St     │ ...       │ │ <- User 1
│  │ def456   │ Real User 2    │ 654 Other Blvd  │ ...       │ │ <- User 2
│  └──────────┴────────────────┴─────────────────┴──────────┘ │
└─────────────────────────────────────────────────────────────┘

When VITE_DEMO_MODE=true:
  ↓
  getCurrentUserId() returns "00000000-0000-0000-0000-000000000001"
  ↓
  RLS Policy: "Allow demo user data access"
  ↓
  Query returns: Demo Customer, Another Demo

When VITE_DEMO_MODE=false AND user logged in as abc123:
  ↓
  getCurrentUserId() returns "abc123"
  ↓
  RLS Policy: "Users can view own customers"
  ↓
  Query returns: Real User 1, User 1 Cust 2
```

## Testing Checklist

### ✅ Before Testing
- [ ] Run `src/db/add_user_id_with_rls.sql` in Supabase SQL Editor
- [ ] Verify columns exist (see DATA_ISOLATION_SETUP.md)
- [ ] Verify RLS policies created (see DATA_ISOLATION_SETUP.md)

### ✅ Demo Mode Test
- [ ] Set `VITE_DEMO_MODE=true` in `.env.local`
- [ ] Run `npm run dev`
- [ ] Should NOT see login screen
- [ ] Add a customer → should work
- [ ] Refresh page → should still see demo customer
- [ ] Check console → should see "DEMO MODE" in logs

### ✅ Normal Auth Mode Test  
- [ ] Set `VITE_DEMO_MODE=false` in `.env.local`
- [ ] Restart dev server
- [ ] Should see login screen
- [ ] Sign up with new account
- [ ] Add a customer → should work
- [ ] Should NOT see demo customers
- [ ] Logout → Sign up with another account
- [ ] Should NOT see first account's customers

### ✅ Data Isolation Verification
Run in Supabase SQL Editor:
```sql
SELECT name, user_id FROM customers ORDER BY user_id;
```
- [ ] Demo customers have user_id = `00000000-0000-0000-0000-000000000001`
- [ ] Each real user's customers have different user_id
- [ ] No customers with NULL user_id

## Environment Variables Reference

```env
# .env.local (local development)
VITE_DEMO_MODE=true   # For demo mode (no auth, shared demo data)
VITE_DEMO_MODE=false  # For normal mode (auth required, isolated data)
```

```env
# Vercel Environment Variables (production)
VITE_DEMO_MODE=true   # Public demo deployment (for Twilio, etc.)
VITE_DEMO_MODE=false  # Production deployment (for real users)
```

## Migration Path for Existing Data

If you have existing customers/jobs in the database without user_id:

```sql
-- Option 1: Assign all to demo user
UPDATE customers SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE jobs SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- Option 2: Delete unassigned data
DELETE FROM customers WHERE user_id IS NULL;
DELETE FROM jobs WHERE user_id IS NULL;

-- Option 3: Assign to specific user (replace YOUR_USER_ID)
UPDATE customers SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
UPDATE jobs SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
```

## Next Steps

1. **Run the migration** → `src/db/add_user_id_with_rls.sql`
2. **Test locally** → Follow testing checklist above
3. **Commit changes** → `git add . && git commit -m "Add user data isolation with RLS"`
4. **Deploy to Vercel** → Set `VITE_DEMO_MODE=true` for public demo
5. **Share demo link** → Send to Twilio without worrying about data exposure

## Key Benefits

✅ **Security:** Each user's data is completely isolated at the database level
✅ **Flexibility:** Switch between demo and normal mode with one environment variable
✅ **Demo Safe:** Demo data never mixes with real user data
✅ **Scalable:** RLS policies automatically enforce isolation for unlimited users
✅ **No Code Changes:** Switching modes doesn't require redeploying code, just changing env var
