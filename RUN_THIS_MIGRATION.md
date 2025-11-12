# 🚀 Database Migration Required

## Step 1: Run the Customer Groups Migration

You need to run the SQL migration to create the `customer_groups` table and add the `group_id` column to the `customers` table.

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/oqzhxfggzveuhaldjuay
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of `src/db/create_customer_groups_table.sql`
5. Paste into the SQL editor
6. Click **Run** (or press Ctrl+Enter)
7. You should see success messages for each statement

### Option B: Using Supabase CLI (if you have it configured)

```powershell
# Copy the SQL file content and pipe it to the database
Get-Content "src\db\create_customer_groups_table.sql" | psql YOUR_DATABASE_CONNECTION_STRING
```

## Step 2: Verify the Migration

After running the migration, verify it worked by running this query in the SQL Editor:

```sql
-- Check if customer_groups table exists
SELECT * FROM customer_groups LIMIT 1;

-- Check if group_id column was added to customers
SELECT id, name, group_id FROM customers LIMIT 5;
```

## Step 3: Start Using Groups!

Once the migration is complete:

1. Go to the **Customer** tab in your app
2. Click the **Groups** tab (new!)
3. Click **Create Group** to make your first group
4. Drag customers from the "Ungrouped Customers" section into your groups
5. Go to the **Today** tab to see group cards in the forecast!

## What This Migration Does

- ✅ Creates `customer_groups` table with:
  - Group name, color, work time, and notes
  - Array of customer IDs in each group
  - User ID for multi-tenant support
  - Row Level Security (RLS) policies
  
- ✅ Adds `group_id` column to `customers` table
  - Links customers to groups
  - Null by default (customers start ungrouped)
  - Automatically removes group assignment if group is deleted

## Troubleshooting

**Error: "relation already exists"**
- The migration is safe to re-run. It uses `IF NOT EXISTS` checks.
- This just means the table was already created.

**Error: "permission denied"**
- Make sure you're logged into Supabase dashboard
- Check that you're using the correct project

**Error: "function update_updated_at_column does not exist"**
- This function should already exist from previous migrations
- If not, you may need to create it first (check older migration files)

## Need Help?

The migration file is located at: `src/db/create_customer_groups_table.sql`

You can view it to see exactly what SQL will be executed.
