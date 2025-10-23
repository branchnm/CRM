-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  square_footage INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_hilly BOOLEAN NOT NULL DEFAULT false,
  has_fencing BOOLEAN NOT NULL DEFAULT false,
  has_obstacles BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_frequency ON customers(frequency);
CREATE INDEX IF NOT EXISTS idx_customers_day_of_week ON customers(day_of_week);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Allow public access (adjust based on your auth needs)
CREATE POLICY "Allow public read access" ON customers FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access" ON customers FOR DELETE USING (true);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
