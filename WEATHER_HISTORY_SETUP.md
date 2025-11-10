# Weather History Database Setup

This document explains how to set up the weather history feature that stores daily weather data in your Supabase database.

## Database Migration

Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/oqzhxfggzveuhaldjuay/sql):

```sql
-- Create weather_history table to store daily weather data by location
CREATE TABLE IF NOT EXISTS weather_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  location_name TEXT NOT NULL,
  zipcode TEXT,
  latitude DECIMAL(10, 6),
  longitude DECIMAL(10, 6),
  temp_max INTEGER,
  temp_min INTEGER,
  precipitation DECIMAL(10, 2),
  precipitation_chance INTEGER,
  description TEXT,
  icon TEXT,
  wind_speed INTEGER,
  humidity INTEGER,
  hourly_forecasts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, zipcode)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_weather_history_date ON weather_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_history_zipcode ON weather_history(zipcode);
CREATE INDEX IF NOT EXISTS idx_weather_history_date_zipcode ON weather_history(date, zipcode);

-- Enable Row Level Security
ALTER TABLE weather_history ENABLE ROW LEVEL SECURITY;

-- Allow public access (adjust based on your auth needs)
CREATE POLICY "Allow public read access" ON weather_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON weather_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON weather_history FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete access" ON weather_history FOR DELETE USING (true);

-- Auto-update timestamp trigger
CREATE TRIGGER update_weather_history_updated_at
  BEFORE UPDATE ON weather_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old weather history (keep last 60 days)
CREATE OR REPLACE FUNCTION cleanup_old_weather_history()
RETURNS void AS $$
BEGIN
  DELETE FROM weather_history
  WHERE date < CURRENT_DATE - INTERVAL '60 days';
END;
$$ LANGUAGE plpgsql;
```

## How It Works

### Automatic Weather Saving
- Every time you load the weather forecast, today's weather is automatically saved to the database
- Weather is associated with the location (zipcode) you're viewing
- This allows you to look back at historical weather data for any location you've checked

### Historical Data
- When you view past days in the forecast, the system loads historical weather from the database
- Data is cached in memory for performance
- If no data exists for a date, it falls back to localStorage (for backward compatibility)

### Seed Data
- On first run, the system automatically creates 30 days of fake historical data for testing
- This only happens once when the weather_history table is empty
- Future weather is saved automatically each day

### Data Retention
- Weather history is kept for 60 days
- You can manually run the cleanup function if needed: `SELECT cleanup_old_weather_history();`

## Testing

After setting up the database:
1. Load the app and check the weather forecast
2. Look at the console - you should see:
   - `🌱 Seeding historical weather data...` (first time only)
   - `✅ Saved weather history for [date] at [location]`
   - `📊 Loaded X days of historical weather from database`
3. Navigate to past days in the forecast - you should see weather data
4. Console errors about "No historical weather found" should be gone

## Troubleshooting

If you see errors:
1. Check that the table was created successfully in Supabase
2. Verify RLS policies are set up correctly
3. Check browser console for detailed error messages
4. Ensure your location/zipcode is being detected properly

## API Reference

See `src/services/weatherHistory.ts` for the full API:
- `saveTodaysWeather()` - Save current weather to database
- `getHistoricalWeather()` - Get weather for a specific date
- `getHistoricalWeatherRange()` - Get weather for a date range
- `seedHistoricalWeatherData()` - Create fake historical data for testing
- `ensureHistoricalWeatherData()` - Auto-seed if table is empty
