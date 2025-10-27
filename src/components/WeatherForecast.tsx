import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import type { Job, Customer } from '../App';
import { 
  CloudRain, 
  Wind, 
  Droplets, 
  MapPin, 
  Search, 
  Navigation,
  AlertTriangle,
  Loader2,
  Calendar,
  CheckCircle,
  XCircle,
  ArrowRight
} from 'lucide-react';
import { 
  getWeatherData, 
  getCoordinatesFromAddress, 
  getCurrentLocation, 
  getLocationName,
  getWeatherIconUrl,
  type WeatherData,
  type Coordinates 
} from '../services/weather';
import { toast } from 'sonner';

interface WeatherForecastProps {
  jobs?: Job[];
  customers?: Customer[];
  onRescheduleJob?: (jobId: string, newDate: string) => void;
}

export function WeatherForecast({ jobs = [], customers = [], onRescheduleJob }: WeatherForecastProps) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(() => {
    const saved = localStorage.getItem('weatherLocation');
    return saved ? JSON.parse(saved) : null;
  });
  const [locationName, setLocationName] = useState<string>(() => {
    return localStorage.getItem('weatherLocationName') || '';
  });
  const [addressInput, setAddressInput] = useState('');
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [selectedJobsToReschedule, setSelectedJobsToReschedule] = useState<Job[]>([]);
  const [targetDate, setTargetDate] = useState<string>('');

  // Load weather on mount if location is set
  useEffect(() => {
    if (location) {
      loadWeather(location);
    }
  }, []);

  const loadWeather = async (coords: Coordinates) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWeatherData(coords);
      if (data) {
        setWeatherData(data);
        setError(null);
        
        // Get location name if not already set
        if (!locationName || !coords.name) {
          const name = await getLocationName(coords.lat, coords.lon);
          setLocationName(name);
          localStorage.setItem('weatherLocationName', name);
        } else if (coords.name) {
          setLocationName(coords.name);
          localStorage.setItem('weatherLocationName', coords.name);
        }
      } else {
        const errorMsg = 'Failed to load weather data - API may not be activated yet';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error loading weather:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to load weather data';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = async () => {
    if (!addressInput.trim()) {
      toast.error('Please enter an address');
      return;
    }

    setLoading(true);
    setError(null);
    toast.loading('Searching for location...', { id: 'address-search' });
    
    try {
      const coords = await getCoordinatesFromAddress(addressInput);
      if (coords) {
        toast.success(`Found: ${coords.name || addressInput}`, { id: 'address-search' });
        setLocation(coords);
        localStorage.setItem('weatherLocation', JSON.stringify(coords));
        // Try to load weather, but don't fail if it errors
        try {
          await loadWeather(coords);
        } catch (weatherError) {
          // Weather failed but location is set - that's ok
          console.log('Weather data failed to load, but location is set');
        }
      }
    } catch (error) {
      console.error('Error searching address:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to find location';
      toast.error(errorMessage, { id: 'address-search' });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUseGPS = async () => {
    setLoading(true);
    setError(null);
    toast.loading('Getting your location...', { id: 'gps' });
    
    try {
      const coords = await getCurrentLocation();
      if (coords) {
        toast.success(`Location found: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`, { id: 'gps' });
        setLocation(coords);
        localStorage.setItem('weatherLocation', JSON.stringify(coords));
        // Try to load weather, but don't fail if it errors
        try {
          await loadWeather(coords);
        } catch (weatherError) {
          // Weather failed but location is set - that's ok
          console.log('Weather data failed to load, but location is set');
        }
      }
    } catch (error) {
      console.error('Error getting GPS location:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get location';
      toast.error(errorMessage, { id: 'gps' });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getRainAlerts = () => {
    if (!weatherData) return [];
    
    const alerts: Array<{ severity: string; message: string }> = [];
    
    // Check today's forecast
    const today = weatherData.daily[0];
    if (today.precipitationChance >= 70) {
      alerts.push({
        severity: 'high',
        message: `High chance of rain today (${today.precipitationChance}%). Consider rescheduling outdoor work.`
      });
    } else if (today.precipitationChance >= 40) {
      alerts.push({
        severity: 'medium',
        message: `${today.precipitationChance}% chance of rain today. Monitor conditions closely.`
      });
    }

    // Check next 3 hours
    const next3Hours = weatherData.hourly.slice(0, 3);
    const highRainInNext3 = next3Hours.some(h => h.precipitation >= 60);
    if (highRainInNext3) {
      alerts.push({
        severity: 'high',
        message: 'Rain expected within the next 3 hours!'
      });
    }

    return alerts;
  };

  // Analyze weather for job scheduling
  const getWeatherRecommendations = () => {
    if (!weatherData || jobs.length === 0) {
      return { badWeatherDays: [], suggestedDays: [] };
    }

    interface BadWeatherDay {
      day: string;
      dayOfWeek: string;
      rainChance: number;
      dateStr: string;
      affectedJobs: Job[];
      suggestedTarget?: {
        dateStr: string;
        dayName: string;
        rainChance: number;
        reason: string;
      };
    }

    interface GoodDay {
      dateStr: string;
      dayName: string;
      rainChance: number;
      jobCount: number;
      dayOfWeek: number;
    }

    const badWeatherDays: BadWeatherDay[] = [];
    const goodDays: GoodDay[] = [];

    // First pass: identify bad days with jobs and good days
    weatherData.daily.forEach((day, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay(); // 0=Sunday, 5=Friday, 6=Saturday
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      
      const jobsOnDay = jobs.filter(j => j.date === dateStr && j.status === 'scheduled');
      
      // Bad weather day with jobs scheduled
      if (day.precipitationChance >= 60 && jobsOnDay.length > 0) {
        badWeatherDays.push({
          day: day.date,
          dayOfWeek: dayName,
          rainChance: day.precipitationChance,
          dateStr,
          affectedJobs: jobsOnDay
        });
      }
      // Good weather day (low rain chance)
      else if (day.precipitationChance < 30 && index > 0 && index <= 6) {
        goodDays.push({
          dateStr,
          dayName,
          rainChance: day.precipitationChance,
          jobCount: jobsOnDay.length,
          dayOfWeek
        });
      }
    });

    // Second pass: suggest target days for each bad weather day
    badWeatherDays.forEach(badDay => {
      if (goodDays.length === 0) return;

      // Prioritize Friday/Saturday if they're available and have few/no jobs
      const fridaySaturday = goodDays.filter(d => d.dayOfWeek === 5 || d.dayOfWeek === 6);
      const backupDay = fridaySaturday.find(d => d.jobCount === 0) || fridaySaturday[0];

      if (backupDay) {
        badDay.suggestedTarget = {
          dateStr: backupDay.dateStr,
          dayName: backupDay.dayName,
          rainChance: backupDay.rainChance,
          reason: backupDay.jobCount === 0 
            ? `${backupDay.dayName} is free with only ${backupDay.rainChance}% rain chance`
            : `${backupDay.dayName} has light schedule (${backupDay.jobCount} jobs) and ${backupDay.rainChance}% rain`
        };
      } else {
        // No Friday/Saturday available, find day with lowest job count
        const leastBusyDay = goodDays.reduce((min, day) => 
          day.jobCount < min.jobCount ? day : min
        , goodDays[0]);

        badDay.suggestedTarget = {
          dateStr: leastBusyDay.dateStr,
          dayName: leastBusyDay.dayName,
          rainChance: leastBusyDay.rainChance,
          reason: leastBusyDay.jobCount === 0
            ? `${leastBusyDay.dayName} is free`
            : `Best available day (${leastBusyDay.jobCount} jobs currently)`
        };
      }
    });

    return { 
      badWeatherDays, 
      suggestedDays: goodDays.filter(d => d.jobCount === 0).slice(0, 3)
    };
  };

  const recommendations = getWeatherRecommendations();

  const handleRescheduleJobs = (jobsToMove: Job[], suggestedDate?: string) => {
    setSelectedJobsToReschedule(jobsToMove);
    if (suggestedDate) {
      setTargetDate(suggestedDate);
    }
    setShowRescheduleDialog(true);
  };

  const confirmReschedule = () => {
    if (!targetDate || !onRescheduleJob) return;

    selectedJobsToReschedule.forEach(job => {
      onRescheduleJob(job.id, targetDate);
    });

    toast.success(`Moved ${selectedJobsToReschedule.length} job(s) to ${new Date(targetDate).toLocaleDateString()}`);
    setShowRescheduleDialog(false);
    setSelectedJobsToReschedule([]);
    setTargetDate('');
  };

  return (
    <div className="space-y-4">
      {/* Location Selection */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Weather Forecast</CardTitle>
          <CardDescription>
            {locationName ? `Showing weather for ${locationName}` : 'Set your location to view weather'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label htmlFor="address" className="sr-only">Address</Label>
                <div className="flex gap-2">
                  <Input
                    id="address"
                    placeholder="Enter city, address, or ZIP code"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                  />
                  <Button onClick={handleAddressSearch} disabled={loading} variant="outline">
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
              <Button onClick={handleUseGPS} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                <Navigation className="h-4 w-4 mr-2" />
                Use My Location
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && !weatherData && (
        <Card className="bg-white/80 backdrop-blur">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Loading weather data...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State - Location set but weather failed */}
      {!loading && location && error && !weatherData && (
        <Card className="bg-orange-50/80 backdrop-blur border-orange-200">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-orange-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-orange-900 mb-2">Weather Data Unavailable</h3>
              <p className="text-orange-700 mb-2">
                Location set: {locationName || `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`}
              </p>
              <p className="text-sm text-orange-600 mb-4">
                {error}
              </p>
              <p className="text-xs text-gray-600">
                If you just created your API key, it can take up to 2 hours to activate.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Location Set */}
      {!loading && !location && !error && (
        <Card className="bg-blue-50/80 backdrop-blur border-blue-200">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 text-blue-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-blue-900 mb-2">No Location Set</h3>
              <p className="text-blue-700 mb-4">
                Enter an address or use your current location to view the weather forecast
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weather Alerts */}
      {weatherData && getRainAlerts().length > 0 && (
        <div className="space-y-2">
          {getRainAlerts().map((alert, index) => (
            <Alert 
              key={index} 
              className={alert.severity === 'high' ? 'border-red-300 bg-red-50/80' : 'border-yellow-300 bg-yellow-50/80'}
            >
              <AlertTriangle className={`h-4 w-4 ${alert.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />
              <AlertTitle>{alert.severity === 'high' ? 'Weather Alert' : 'Weather Notice'}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Scheduling Recommendations */}
      {weatherData && recommendations.badWeatherDays.length > 0 && (
        <Card className="bg-linear-to-br from-blue-50 to-indigo-50 backdrop-blur border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Job Rescheduling Recommendations
            </CardTitle>
            <CardDescription>
              {recommendations.badWeatherDays.length} day(s) with poor weather - move jobs to better days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.badWeatherDays.map((badDay, index) => (
                <div key={index} className="border-2 border-red-300 rounded-lg overflow-hidden">
                  {/* Bad Weather Day Header */}
                  <div className="bg-red-50 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="font-bold text-red-900">
                            {badDay.dayOfWeek}, {badDay.day}
                          </span>
                        </div>
                        <div className="text-sm text-red-700 mb-2">
                          <CloudRain className="h-4 w-4 inline mr-1" />
                          {badDay.rainChance}% chance of rain - Not recommended for outdoor work
                        </div>
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          {badDay.affectedJobs.length} job(s) at risk:
                        </div>
                        <div className="space-y-1">
                          {badDay.affectedJobs.map(job => {
                            const customer = customers.find(c => c.id === job.customerId);
                            return (
                              <div key={job.id} className="text-xs text-gray-600 bg-white/50 px-2 py-1 rounded">
                                • {customer?.name || 'Unknown'} - {customer?.address || ''}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Suggested Target Day */}
                  {badDay.suggestedTarget && onRescheduleJob && (
                    <div className="bg-green-50 p-4 border-t-2 border-green-300">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <ArrowRight className="h-5 w-5 text-green-600" />
                            <span className="font-bold text-green-900">
                              Suggested: Move to {badDay.suggestedTarget.dayName}
                            </span>
                          </div>
                          <div className="text-sm text-green-700 mb-1">
                            <CheckCircle className="h-4 w-4 inline mr-1" />
                            {badDay.suggestedTarget.rainChance}% rain chance
                          </div>
                          <div className="text-xs text-gray-600">
                            {badDay.suggestedTarget.reason}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleRescheduleJobs(badDay.affectedJobs, badDay.suggestedTarget!.dateStr)}
                        >
                          Move Jobs
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Manual reschedule option */}
                  {!badDay.suggestedTarget && onRescheduleJob && (
                    <div className="bg-gray-50 p-4 border-t border-gray-300">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          No ideal backup day found in forecast
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRescheduleJobs(badDay.affectedJobs)}
                        >
                          Choose Day
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Additional good days available */}
            {recommendations.suggestedDays.length > 0 && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="font-medium text-green-900 mb-2">
                  ✓ Other available days with good weather:
                </div>
                <div className="flex flex-wrap gap-2">
                  {recommendations.suggestedDays.map((day, index) => (
                    <div key={index} className="px-3 py-1 bg-white rounded-md border border-green-300 text-sm">
                      <span className="font-medium text-green-900">{day.dayName}</span>
                      <span className="text-green-700 ml-2">({day.rainChance}% rain)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No bad weather - all clear! */}
      {weatherData && recommendations.badWeatherDays.length === 0 && jobs.some(j => j.status === 'scheduled') && (
        <Card className="bg-green-50/80 backdrop-blur border-green-200">
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-green-900 mb-2">All Clear!</h3>
              <p className="text-green-700">
                No bad weather expected for your scheduled jobs in the next 7 days
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Weather - Simplified */}
      {weatherData && (
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Current Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img 
                  src={getWeatherIconUrl(weatherData.current.icon, '4x')} 
                  alt={weatherData.current.description}
                  className="w-20 h-20"
                />
                <div>
                  <div className="text-4xl font-bold text-gray-900">{weatherData.current.temp}°F</div>
                  <div className="text-gray-600 capitalize">{weatherData.current.description}</div>
                  <div className="text-sm text-gray-500">Feels like {weatherData.current.feelsLike}°F</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Wind className="h-4 w-4 text-gray-500" />
                  <span>{weatherData.current.windSpeed} mph</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-gray-500" />
                  <span>{weatherData.current.humidity}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5-Day Quick Forecast */}
      {weatherData && (
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>5-Day Forecast</CardTitle>
            <CardDescription>Quick weather overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {weatherData.daily.slice(0, 5).map((day, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded-lg text-center ${
                    day.precipitationChance >= 60 
                      ? 'bg-red-50 border-2 border-red-300' 
                      : day.precipitationChance >= 30
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-green-50 border border-green-200'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    {index === 0 ? 'Today' : day.date.split(',')[0]}
                  </div>
                  <img 
                    src={getWeatherIconUrl(day.icon)} 
                    alt={day.description}
                    className="w-16 h-16 mx-auto"
                  />
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-gray-900">{day.tempMax}°</div>
                    <div className="text-sm text-gray-500">{day.tempMin}°</div>
                  </div>
                  {day.precipitationChance > 0 && (
                    <div className={`flex items-center justify-center gap-1 mt-2 text-xs font-medium ${
                      day.precipitationChance >= 60 ? 'text-red-700' : 
                      day.precipitationChance >= 30 ? 'text-yellow-700' : 'text-blue-600'
                    }`}>
                      <CloudRain className="h-3 w-3" />
                      {day.precipitationChance}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Key Notice */}
      {!import.meta.env.VITE_OPENWEATHER_API_KEY && (
        <Alert className="border-orange-300 bg-orange-50/80">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>API Key Required</AlertTitle>
          <AlertDescription>
            To use weather features, add your OpenWeather API key to <code className="text-xs bg-white px-1 py-0.5 rounded">.env.local</code>:
            <br />
            <code className="text-xs bg-white px-1 py-0.5 rounded mt-1 inline-block">
              VITE_OPENWEATHER_API_KEY=your_key_here
            </code>
            <br />
            <a 
              href="https://openweathermap.org/api" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-orange-700 hover:underline text-sm mt-1 inline-block"
            >
              Get a free API key →
            </a>
          </AlertDescription>
        </Alert>
      )}
      {/* Reschedule Dialog */}
      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Jobs</DialogTitle>
            <DialogDescription>
              Move {selectedJobsToReschedule.length} job(s) to a day with better weather
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {targetDate && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-900">
                  ℹ️ <strong>Suggested date selected</strong> - You can change it below if needed
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="target-date">Select new date:</Label>
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            {targetDate && weatherData && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium mb-2">Weather on {new Date(targetDate).toLocaleDateString()}:</div>
                {(() => {
                  const targetDay = weatherData.daily.find(d => {
                    const dayDate = new Date(d.date).toISOString().split('T')[0];
                    return dayDate === targetDate;
                  });
                  if (targetDay) {
                    return (
                      <div className="flex items-center gap-3">
                        <img 
                          src={getWeatherIconUrl(targetDay.icon)} 
                          alt={targetDay.description}
                          className="w-10 h-10"
                        />
                        <div className="flex-1">
                          <div className="text-sm capitalize">{targetDay.description}</div>
                          <div className="text-xs text-gray-600">
                            {targetDay.tempMax}° / {targetDay.tempMin}°
                            {targetDay.precipitationChance > 0 && (
                              <span className={targetDay.precipitationChance >= 40 ? 'text-orange-600 font-medium' : ''}>
                                {' '}• {targetDay.precipitationChance}% rain
                              </span>
                            )}
                          </div>
                        </div>
                        {targetDay.precipitationChance < 30 && (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                    );
                  }
                  return <div className="text-sm text-gray-500">Select a date within the 7-day forecast</div>;
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRescheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmReschedule} disabled={!targetDate}>
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
