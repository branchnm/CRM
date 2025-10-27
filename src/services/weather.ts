// Weather service using OpenWeatherMap API
// Free tier: 1000 calls/day

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';
const GEOCODING_API_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';

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
    const url = `${GEOCODING_API_URL}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
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
 * Fetch weather data for coordinates
 */
export async function getWeatherData(coordinates: Coordinates): Promise<WeatherData | null> {
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
      
      return {
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        tempMax: Math.round(Math.max(...temps)),
        tempMin: Math.round(Math.min(...temps)),
        precipitation: forecasts.reduce((sum, f) => sum + (f.rain?.['3h'] || f.snow?.['3h'] || 0), 0),
        precipitationChance: Math.round(Math.max(...pops) * 100),
        description: mainWeather.description,
        icon: mainWeather.icon,
        windSpeed: Math.round(forecasts[Math.floor(forecasts.length / 2)].wind.speed),
        humidity: forecasts[Math.floor(forecasts.length / 2)].main.humidity
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
