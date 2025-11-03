// Weather service using OpenWeatherMap API
// Free tier: 1000 calls/day

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';
const GEOCODING_API_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';

// Enable test mode to demonstrate rainfall tracking features
const USE_TEST_WEATHER = false;

export interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    description: string;
    icon: string;
    precipitation?: number;
  };
  hourly: Array<{
    time: string;
    temp: number;
    precipitation: number;
    icon: string;
    description: string;
    rainAmount?: number; // mm of rainfall
  }>;
  daily: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    precipitation: number;
    precipitationChance: number;
    description: string;
    icon: string;
    windSpeed: number;
    humidity: number;
    hourlyForecasts?: Array<{
      time: string;
      temp: number;
      precipitation: number;
      icon: string;
      description: string;
      rainAmount?: number; // mm of rainfall
      hour24?: number; // 24-hour format (0-23)
    }>;
  }>;
}

export interface Coordinates {
  lat: number;
  lon: number;
  name?: string;
}

/**
 * Get coordinates from address using geocoding
 */
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  if (!OPENWEATHER_API_KEY) {
    throw new Error('OpenWeather API key not configured');
  }

  try {
    const url = `${GEOCODING_API_URL}?q=${encodeURIComponent(address)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const response = await fetch(url);
    
    if (response.status === 401) {
      throw new Error('API key not activated yet. New keys can take up to 2 hours to activate.');
    }
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.length === 0) {
      throw new Error('Location not found. Try a different address or city name.');
    }

    return {
      lat: data[0].lat,
      lon: data[0].lon,
      name: `${data[0].name}, ${data[0].state || data[0].country}`
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    throw error;
  }
}

/**
 * Get current location from browser geolocation API
 */
export async function getCurrentLocation(): Promise<Coordinates | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = 'Failed to get location';
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = 'Location information unavailable';
        } else if (error.code === error.TIMEOUT) {
          errorMessage = 'Location request timed out';
        }
        reject(new Error(errorMessage));
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  });
}

/**
 * Get location name from coordinates (reverse geocoding)
 */
export async function getLocationName(lat: number, lon: number): Promise<string> {
  if (!OPENWEATHER_API_KEY) {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }

  try {
    const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }

    const data = await response.json();
    
    if (data.length === 0) {
      return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }

    return `${data[0].name}, ${data[0].state || data[0].country}`;
  } catch (error) {
    console.error('Error getting location name:', error);
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

/**
 * Generate test weather data to demonstrate rainfall tracking features
 */
function getTestWeatherData(): WeatherData {
  return {
    current: {
      temp: 68,
      feelsLike: 65,
      humidity: 70,
      windSpeed: 8,
      description: 'partly cloudy',
      icon: '02d',
      precipitation: 0
    },
    hourly: [
      { time: '1 PM', temp: 68, precipitation: 10, icon: '02d', description: 'partly cloudy', rainAmount: 0 },
      { time: '4 PM', temp: 65, precipitation: 20, icon: '03d', description: 'scattered clouds', rainAmount: 0 },
      { time: '7 PM', temp: 62, precipitation: 30, icon: '04d', description: 'overcast clouds', rainAmount: 0 },
      { time: '10 PM', temp: 58, precipitation: 40, icon: '10d', description: 'light rain', rainAmount: 0.8 },
    ],
    daily: [
      {
        date: 'Today',
        tempMax: 72,
        tempMin: 58,
        precipitation: 2.5,
        precipitationChance: 40,
        description: 'light rain',
        icon: '10d',
        windSpeed: 8,
        humidity: 70,
        hourlyForecasts: [
          { time: '5 AM', temp: 55, precipitation: 20, icon: '02d', description: 'partly cloudy', rainAmount: 0, hour24: 5 },
          { time: '11 AM', temp: 68, precipitation: 30, icon: '03d', description: 'scattered clouds', rainAmount: 0, hour24: 11 },
          { time: '5 PM', temp: 70, precipitation: 60, icon: '09d', description: 'light rain', rainAmount: 0.8, hour24: 17 },
          { time: '11 PM', temp: 60, precipitation: 70, icon: '10d', description: 'moderate rain', rainAmount: 3.2, hour24: 23 },
        ]
      },
      {
        date: 'Tomorrow',
        tempMax: 65,
        tempMin: 52,
        precipitation: 15.5,
        precipitationChance: 90,
        description: 'thunderstorm',
        icon: '11d',
        windSpeed: 15,
        humidity: 85,
        hourlyForecasts: [
          { time: '5 AM', temp: 52, precipitation: 95, icon: '11d', description: 'thunderstorm with heavy rain', rainAmount: 8.5, hour24: 5 },
          { time: '11 AM', temp: 58, precipitation: 75, icon: '10d', description: 'moderate rain', rainAmount: 4.2, hour24: 11 },
          { time: '5 PM', temp: 62, precipitation: 50, icon: '09d', description: 'light rain', rainAmount: 1.5, hour24: 17 },
          { time: '11 PM', temp: 55, precipitation: 85, icon: '11d', description: 'thunderstorm', rainAmount: 6.8, hour24: 23 },
        ]
      },
      {
        date: 'Wed',
        tempMax: 68,
        tempMin: 54,
        precipitation: 8.2,
        precipitationChance: 85,
        description: 'heavy rain',
        icon: '09d',
        windSpeed: 12,
        humidity: 80,
        hourlyForecasts: [
          { time: '5 AM', temp: 54, precipitation: 90, icon: '09d', description: 'heavy intensity rain', rainAmount: 7.2, hour24: 5 },
          { time: '11 AM', temp: 62, precipitation: 40, icon: '03d', description: 'scattered clouds', rainAmount: 0.5, hour24: 11 },
          { time: '5 PM', temp: 66, precipitation: 20, icon: '02d', description: 'partly cloudy', rainAmount: 0, hour24: 17 },
          { time: '11 PM', temp: 58, precipitation: 10, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 23 },
        ]
      },
      {
        date: 'Thu',
        tempMax: 75,
        tempMin: 60,
        precipitation: 0.3,
        precipitationChance: 15,
        description: 'light drizzle',
        icon: '09d',
        windSpeed: 6,
        humidity: 60,
        hourlyForecasts: [
          { time: '5 AM', temp: 60, precipitation: 20, icon: '09d', description: 'light drizzle', rainAmount: 0.3, hour24: 5 },
          { time: '11 AM', temp: 70, precipitation: 10, icon: '02d', description: 'partly cloudy', rainAmount: 0, hour24: 11 },
          { time: '5 PM', temp: 75, precipitation: 5, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 17 },
          { time: '11 PM', temp: 65, precipitation: 0, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 23 },
        ]
      },
      {
        date: 'Fri',
        tempMax: 78,
        tempMin: 62,
        precipitation: 0,
        precipitationChance: 5,
        description: 'clear sky',
        icon: '01d',
        windSpeed: 5,
        humidity: 50,
        hourlyForecasts: [
          { time: '5 AM', temp: 62, precipitation: 0, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 5 },
          { time: '11 AM', temp: 72, precipitation: 5, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 11 },
          { time: '5 PM', temp: 78, precipitation: 5, icon: '02d', description: 'partly cloudy', rainAmount: 0, hour24: 17 },
          { time: '11 PM', temp: 68, precipitation: 0, icon: '01d', description: 'clear sky', rainAmount: 0, hour24: 23 },
        ]
      }
    ]
  };
}

/**
 * Fetch weather data for coordinates
 */
export async function getWeatherData(coordinates: Coordinates): Promise<WeatherData | null> {
  // Use test data if enabled
  if (USE_TEST_WEATHER) {
    console.log('🧪 Using test weather data to demonstrate rainfall tracking features');
    return getTestWeatherData();
  }

  if (!OPENWEATHER_API_KEY) {
    console.error('OpenWeather API key not configured. Get one at https://openweathermap.org/api');
    return null;
  }

  try {
    // Use free tier API: current weather + forecast
    // Free tier doesn't have One Call 3.0, use separate endpoints
    const currentUrl = `${WEATHER_API_URL}/weather?lat=${coordinates.lat}&lon=${coordinates.lon}&units=imperial&appid=${OPENWEATHER_API_KEY}`;
    const forecastUrl = `${WEATHER_API_URL}/forecast?lat=${coordinates.lat}&lon=${coordinates.lon}&units=imperial&appid=${OPENWEATHER_API_KEY}`;
    
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(currentUrl),
      fetch(forecastUrl)
    ]);
    
    if (!currentResponse.ok || !forecastResponse.ok) {
      const error = !currentResponse.ok ? currentResponse : forecastResponse;
      console.error(`Weather API error: ${error.status} - ${error.statusText}`);
      if (error.status === 401) {
        console.error('API key may be invalid or not activated yet. New keys can take up to 2 hours to activate.');
      }
      throw new Error(`Weather API error: ${error.status}`);
    }

    const currentData = await currentResponse.json();
    const forecastData = await forecastResponse.json();

    // Group forecast by day
    const dailyForecasts = new Map<string, any[]>();
    forecastData.list.forEach((item: any) => {
      const date = new Date(item.dt * 1000).toDateString();
      if (!dailyForecasts.has(date)) {
        dailyForecasts.set(date, []);
      }
      dailyForecasts.get(date)!.push(item);
    });

    // Calculate daily summaries
    const daily = Array.from(dailyForecasts.entries()).slice(0, 7).map(([date, forecasts]) => {
      const temps = forecasts.map(f => f.main.temp);
      const pops = forecasts.map(f => f.pop || 0);
      const mainWeather = forecasts[Math.floor(forecasts.length / 2)].weather[0];
      
      // Get hourly forecasts for this day (up to 4 time periods)
      const hourlyForecasts = forecasts.slice(0, 4).map((forecast: any) => {
        const forecastDate = new Date(forecast.dt * 1000);
        return {
          time: forecastDate.toLocaleTimeString('en-US', { hour: 'numeric' }),
          temp: Math.round(forecast.main.temp),
          precipitation: Math.round((forecast.pop || 0) * 100),
          icon: forecast.weather[0].icon,
          description: forecast.weather[0].description,
          rainAmount: forecast.rain?.['3h'] || 0,
          hour24: forecastDate.getHours()
        };
      });
      
      return {
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        tempMax: Math.round(Math.max(...temps)),
        tempMin: Math.round(Math.min(...temps)),
        precipitation: forecasts.reduce((sum, f) => sum + (f.rain?.['3h'] || f.snow?.['3h'] || 0), 0),
        precipitationChance: Math.round(Math.max(...pops) * 100),
        description: mainWeather.description,
        icon: mainWeather.icon,
        windSpeed: Math.round(forecasts[Math.floor(forecasts.length / 2)].wind.speed),
        humidity: forecasts[Math.floor(forecasts.length / 2)].main.humidity,
        hourlyForecasts
      };
    });

    // Transform to our format
    return {
      current: {
        temp: Math.round(currentData.main.temp),
        feelsLike: Math.round(currentData.main.feels_like),
        humidity: currentData.main.humidity,
        windSpeed: Math.round(currentData.wind.speed),
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        precipitation: currentData.rain?.['1h'] || currentData.snow?.['1h'] || 0
      },
      hourly: forecastData.list.slice(0, 8).map((hour: any) => ({
        time: new Date(hour.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric' }),
        temp: Math.round(hour.main.temp),
        precipitation: Math.round((hour.pop || 0) * 100),
        icon: hour.weather[0].icon,
        description: hour.weather[0].description
      })),
      daily
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    return null;
  }
}

/**
 * Get weather icon URL from OpenWeather
 */
export function getWeatherIconUrl(iconCode: string, size: '2x' | '4x' = '2x'): string {
  return `https://openweathermap.org/img/wn/${iconCode}@${size}.png`;
}
