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
