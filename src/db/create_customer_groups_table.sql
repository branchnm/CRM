-- Create customer_groups table for manual group management
-- Groups are created in the Customer tab and allow drag-and-drop of customers

CREATE TABLE IF NOT EXISTS customer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Owner of this group
  name TEXT NOT NULL,
  work_time_minutes INTEGER NOT NULL DEFAULT 0, -- Total work time for all properties in group
  customer_ids UUID[] NOT NULL DEFAULT '{}', -- Array of customer IDs in this group
  color TEXT, -- Optional hex color for visual identification
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customer_groups_user_id ON customer_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_groups_customer_ids ON customer_groups USING GIN(customer_ids);

-- Enable Row Level Security
ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_groups (same pattern as customers/jobs)
CREATE POLICY "Users can view own groups" ON customer_groups
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

CREATE POLICY "Users can insert own groups" ON customer_groups
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own groups" ON customer_groups
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
  WITH CHECK (true);

CREATE POLICY "Users can delete own groups" ON customer_groups
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Auto-update timestamp trigger
CREATE TRIGGER update_customer_groups_updated_at
  BEFORE UPDATE ON customer_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add group_id column to customers table (references customer_groups)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES customer_groups(id) ON DELETE SET NULL;

-- Create index for faster group lookups
CREATE INDEX IF NOT EXISTS idx_customers_group_id ON customers(group_id);

-- Note: The old 'group' text field will remain for backwards compatibility but should not be used
-- You can optionally drop it later with: ALTER TABLE customers DROP COLUMN IF EXISTS "group";
