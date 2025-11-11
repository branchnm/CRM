# Database Migration - Add Group Column

## Quick Instructions

### Run this SQL in Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/oqzhxfggzveuhaldjuay/editor
2. Click "SQL Editor" → "New Query"
3. Paste and run:

```sql
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS "group" TEXT;
```

4. Click "Run" (or Ctrl+Enter)

### Expected Result:
```
Success. No rows returned
```

This adds an optional `group` column to store cluster names like "Oak Ridge Cluster" for grouping nearby properties.

---

## What This Enables

After running this migration and importing `example_grouped_customers.csv`:

- Properties with the same `group` value will appear as a single purple card
- Group cards show all property names and combined time
- Example groups in the CSV:
  - **Oak Ridge Cluster** - 4 properties (240 min)
  - **Maple Grove Group** - 3 properties (180 min)  
  - **Pinehurst Circle** - 5 properties (300 min)

---

## Files Changed

- ✅ `src/services/customers.ts` - Added group field to DB operations
- ✅ `src/components/CustomerManagement.tsx` - CSV import handles group
- ✅ `src/components/DailySchedule.tsx` - Renders groups as purple cards
- ✅ `src/App.tsx` - Customer interface includes group field
- ✅ `supabase/migrations/20251111_add_group_column.sql` - Migration file
