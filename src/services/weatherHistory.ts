import { supabase } from '../lib/supabase';

export interface WeatherHistoryRecord {
  id?: string;
  date: string; // YYYY-MM-DD
  location_name: string;
  zipcode?: string;
  latitude?: number;
  longitude?: number;
  temp_max?: number;
  temp_min?: number;
  precipitation?: number;
  precipitation_chance?: number;
  description?: string;
  icon?: string;
  wind_speed?: number;
  humidity?: number;
  hourly_forecasts?: any[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Save today's weather data to the database
 */
export async function saveTodaysWeather(
  locationName: string,
  zipcode: string | null,
  latitude: number,
  longitude: number,
  weatherData: any
): Promise<void> {
  try {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    
    // Use today's forecast data (first item in daily array)
    const todayWeather = weatherData.daily?.[0];
    if (!todayWeather) {
      console.warn('No weather data available for today');
      return;
    }

    const record: WeatherHistoryRecord = {
      date: today,
      location_name: locationName,
      zipcode: zipcode || undefined,
      latitude,
      longitude,
      temp_max: todayWeather.tempMax,
      temp_min: todayWeather.tempMin,
      precipitation: todayWeather.precipitation,
      precipitation_chance: todayWeather.precipitationChance,
      description: todayWeather.description,
      icon: todayWeather.icon,
      wind_speed: todayWeather.windSpeed,
      humidity: todayWeather.humidity,
      hourly_forecasts: todayWeather.hourlyForecasts || []
    };

    // Use upsert to update if record already exists for this date/zipcode
    const { error } = await supabase
      .from('weather_history')
      .upsert(record, {
        onConflict: 'date,zipcode',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error saving weather history:', error);
      throw error;
    }

    console.log(`✅ Saved weather history for ${today} at ${locationName}`);
  } catch (error) {
    console.error('Failed to save weather history:', error);
    throw error;
  }
}

/**
 * Get historical weather for a specific date and location
 */
export async function getHistoricalWeather(
  date: string,
  zipcode?: string
): Promise<WeatherHistoryRecord | null> {
  try {
    let query = supabase
      .from('weather_history')
      .select('*')
      .eq('date', date);

    if (zipcode) {
      query = query.eq('zipcode', zipcode);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - this is normal for dates without saved weather
        return null;
      }
      console.error('Error fetching historical weather:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to fetch historical weather:', error);
    return null;
  }
}

/**
 * Get historical weather for a date range
 */
export async function getHistoricalWeatherRange(
  startDate: string,
  endDate: string,
  zipcode?: string
): Promise<WeatherHistoryRecord[]> {
  try {
    let query = supabase
      .from('weather_history')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (zipcode) {
      query = query.eq('zipcode', zipcode);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching historical weather range:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Failed to fetch historical weather range:', error);
    return [];
  }
}

/**
 * Seed the database with fake historical weather data for testing
 * Creates 30 days of past weather data
 */
export async function seedHistoricalWeatherData(
  locationName: string,
  zipcode: string,
  latitude: number,
  longitude: number
): Promise<void> {
  console.log('🌱 Seeding historical weather data...');
  
  const records: WeatherHistoryRecord[] = [];
  const today = new Date();
  
  // Weather patterns for variety
  const weatherPatterns = [
    { desc: 'clear sky', icon: '01d', precip: 0, chance: 0 },
    { desc: 'partly cloudy', icon: '02d', precip: 0, chance: 10 },
    { desc: 'scattered clouds', icon: '03d', precip: 0, chance: 15 },
    { desc: 'overcast clouds', icon: '04d', precip: 0.2, chance: 30 },
    { desc: 'light rain', icon: '10d', precip: 2.5, chance: 65 },
    { desc: 'moderate rain', icon: '10d', precip: 5.8, chance: 85 },
    { desc: 'heavy rain', icon: '10d', precip: 12.3, chance: 95 }
  ];
  
  // Generate 30 days of historical data
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString('en-CA');
    
    // Random weather pattern
    const pattern = weatherPatterns[Math.floor(Math.random() * weatherPatterns.length)];
    
    // Random temperatures (seasonal variation)
    const baseTempMax = 65 + Math.floor(Math.random() * 20);
    const tempMin = baseTempMax - (10 + Math.floor(Math.random() * 10));
    
    // Generate hourly forecasts
    const hourlyForecasts = [8, 11, 14, 17, 20].map(hour => ({
      time: hour <= 12 ? `${hour} AM` : `${hour - 12} PM`,
      temp: tempMin + Math.floor(Math.random() * (baseTempMax - tempMin)),
      precipitation: pattern.chance + Math.floor(Math.random() * 10 - 5),
      icon: pattern.icon,
      description: pattern.desc,
      rainAmount: pattern.precip * (0.5 + Math.random() * 0.5),
      hour24: hour
    }));
    
    records.push({
      date: dateStr,
      location_name: locationName,
      zipcode,
      latitude,
      longitude,
      temp_max: baseTempMax,
      temp_min: tempMin,
      precipitation: pattern.precip,
      precipitation_chance: pattern.chance,
      description: pattern.desc,
      icon: pattern.icon,
      wind_speed: 5 + Math.floor(Math.random() * 15),
      humidity: 40 + Math.floor(Math.random() * 40),
      hourly_forecasts: hourlyForecasts
    });
  }
  
  try {
    // Insert all records
    const { error } = await supabase
      .from('weather_history')
      .upsert(records, {
        onConflict: 'date,zipcode',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('Error seeding weather history:', error);
      throw error;
    }
    
    console.log(`✅ Successfully seeded ${records.length} days of historical weather data`);
  } catch (error) {
    console.error('Failed to seed weather history:', error);
    throw error;
  }
}

/**
 * Check if we have any historical data, and seed if needed
 */
export async function ensureHistoricalWeatherData(
  locationName: string,
  zipcode: string,
  latitude: number,
  longitude: number
): Promise<void> {
  try {
    // Check if we have any historical data
    const { count, error } = await supabase
      .from('weather_history')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error checking weather history:', error);
      return;
    }
    
    // If no data exists, seed it
    if (count === 0) {
      console.log('No historical weather data found, seeding...');
      await seedHistoricalWeatherData(locationName, zipcode, latitude, longitude);
    }
  } catch (error) {
    console.error('Failed to ensure historical weather data:', error);
  }
}
