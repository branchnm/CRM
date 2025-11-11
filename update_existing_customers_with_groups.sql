-- Update existing customers with group information
-- Run this in Supabase SQL Editor to add groups to your existing customers

-- Oak Ridge Cluster (Wed Nov 12)
UPDATE customers 
SET "group" = 'Oak Ridge Cluster'
WHERE name IN ('Johnson Family', 'Williams Residence', 'Davis Home', 'Miller Property')
  AND address LIKE '%Oak Ridge%';

-- Maple Grove Group (Thu Nov 13)
UPDATE customers 
SET "group" = 'Maple Grove Group'
WHERE name IN ('Anderson Lawn', 'Martinez Garden', 'Thompson Yard')
  AND address LIKE '%Maple Grove%';

-- Pinehurst Circle (Fri Nov 14)
UPDATE customers 
SET "group" = 'Pinehurst Circle'
WHERE name IN ('Garcia Estate', 'Rodriguez Manor', 'Wilson Villa', 'Lee Cottage', 'Brown Bungalow')
  AND address LIKE '%Pinehurst%';

-- Verify the updates
SELECT name, address, "group" 
FROM customers 
WHERE "group" IS NOT NULL
ORDER BY "group", name;
