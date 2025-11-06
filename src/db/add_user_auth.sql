-- Add user_id column to customers table
ALTER TABLE customers
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to jobs table
ALTER TABLE jobs
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable Row Level Security on customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security on jobs table
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own customers
CREATE POLICY "Users can view own customers"
ON customers FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can only insert their own customers
CREATE POLICY "Users can insert own customers"
ON customers FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can only update their own customers
CREATE POLICY "Users can update own customers"
ON customers FOR UPDATE
USING (auth.uid() = user_id);

-- Create policy: Users can only delete their own customers
CREATE POLICY "Users can delete own customers"
ON customers FOR DELETE
USING (auth.uid() = user_id);

-- Create policy: Users can only see their own jobs
CREATE POLICY "Users can view own jobs"
ON jobs FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can only insert their own jobs
CREATE POLICY "Users can insert own jobs"
ON jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can only update their own jobs
CREATE POLICY "Users can update own jobs"
ON jobs FOR UPDATE
USING (auth.uid() = user_id);

-- Create policy: Users can only delete their own jobs
CREATE POLICY "Users can delete own jobs"
ON jobs FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX customers_user_id_idx ON customers(user_id);
CREATE INDEX jobs_user_id_idx ON jobs(user_id);
