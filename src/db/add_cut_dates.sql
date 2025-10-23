-- Add last_cut_date and next_cut_date columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS last_cut_date DATE,
ADD COLUMN IF NOT EXISTS next_cut_date DATE;

-- Create index for next_cut_date to help with scheduling queries
CREATE INDEX IF NOT EXISTS idx_customers_next_cut_date ON customers(next_cut_date);

-- Add a comment explaining the fields
COMMENT ON COLUMN customers.last_cut_date IS 'Date of the last completed lawn service';
COMMENT ON COLUMN customers.next_cut_date IS 'Automatically calculated next service date based on frequency';
