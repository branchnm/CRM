# Supabase Setup Instructions

## Step 1: Create the Database Table

1. Go to your Supabase project: https://supabase.com/dashboard/project/oqzhxfggzveuhaldjuay
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `src/db/schema.sql`
5. Paste it into the SQL editor
6. Click "Run" to execute the SQL

This will create the `customers` table with all necessary columns, indexes, and security policies.

## Step 2: Upload Sample Customers

Run the seed script to upload your 10 sample customers:

```powershell
cd C:\Users\branc\Desktop\testingpostcss\frontend
npm install tsx --save-dev
npx tsx src/db/seed.ts
```

This will:
- Check if customers already exist (won't duplicate if you run it twice)
- Upload all 10 sample customers from your App.tsx
- Print success messages

## Step 3: Verify the Data

1. Go back to your Supabase dashboard
2. Click "Table Editor" in the left sidebar
3. Select the "customers" table
4. You should see all 10 customers with their data

## Next Steps

Once the data is uploaded, you can:
- View customers in the Supabase dashboard
- Query them using the Supabase client (`src/lib/supabase.ts`)
- Build CRUD operations to add/edit/delete customers from your app

## Files Created

- `src/lib/supabase.ts` - Supabase client for making queries
- `src/db/schema.sql` - SQL to create the customers table
- `src/db/seed.ts` - Script to upload sample customers
- `src/db/README.md` - This file
