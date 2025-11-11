-- Fix customer groups AND nextCutDate to match the CSV

-- Oak Ridge Cluster (Wed Nov 12, 2025)
UPDATE customers 
SET "group" = 'Oak Ridge Cluster',
    next_cut_date = '2025-11-12'
WHERE name IN ('Johnson Family', 'Williams Residence', 'Davis Home', 'Miller Property');

-- Maple Grove Group (Thu Nov 13, 2025)
UPDATE customers 
SET "group" = 'Maple Grove Group',
    next_cut_date = '2025-11-13'
WHERE name IN ('Anderson Lawn', 'Martinez Garden', 'Thompson Yard');

-- Pinehurst Circle (Fri Nov 14, 2025)
UPDATE customers 
SET "group" = 'Pinehurst Circle',
    next_cut_date = '2025-11-14'
WHERE name IN ('Garcia Estate', 'Rodriguez Manor', 'Wilson Villa', 'Lee Cottage', 'Brown Bungalow');

-- Verify the updates
SELECT name, next_cut_date, "group" 
FROM customers 
WHERE "group" IS NOT NULL
ORDER BY next_cut_date, "group", name;
