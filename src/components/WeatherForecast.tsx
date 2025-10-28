import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
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
  const [forecastView, setForecastView] = useState<'5-day' | '7-day' | 'detailed'>('5-day');
  const [jobAssignments, setJobAssignments] = useState<Map<string, string>>(new Map()); // jobId -> date mapping
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

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
    
    // Initialize job assignments - all jobs to suggested date if provided, otherwise empty
    const initialAssignments = new Map<string, string>();
    if (suggestedDate) {
      jobsToMove.forEach(job => {
        initialAssignments.set(job.id, suggestedDate);
      });
      setTargetDate(suggestedDate);
    }
    setJobAssignments(initialAssignments);
    setShowRescheduleDialog(true);
  };

  const confirmReschedule = () => {
    if (!onRescheduleJob) return;

    // Group jobs by their assigned target date
    const jobsByDate = new Map<string, Job[]>();
    selectedJobsToReschedule.forEach(job => {
      const assignedDate = jobAssignments.get(job.id);
      if (assignedDate) {
        if (!jobsByDate.has(assignedDate)) {
          jobsByDate.set(assignedDate, []);
        }
        jobsByDate.get(assignedDate)!.push(job);
      }
    });

    // Reschedule each job to its assigned date
    let totalMoved = 0;
    jobsByDate.forEach((jobs, date) => {
      jobs.forEach(job => {
        onRescheduleJob(job.id, date);
        totalMoved++;
      });
    });

    if (totalMoved > 0) {
      toast.success(`Moved ${totalMoved} job(s) to new date(s)`);
    }
    
    setShowRescheduleDialog(false);
    setSelectedJobsToReschedule([]);
    setJobAssignments(new Map());
    setTargetDate('');
  };

  const assignJobToDate = (jobId: string, date: string) => {
    setJobAssignments(prev => {
      const newMap = new Map(prev);
      newMap.set(jobId, date);
      return newMap;
    });
  };

  const handleDragStart = (jobId: string) => {
    setDraggedJobId(jobId);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDay(dateStr);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    if (draggedJobId) {
      assignJobToDate(draggedJobId, dateStr);
      setDraggedJobId(null);
    }
    setDragOverDay(null);
  };

  const unassignJob = (jobId: string) => {
    setJobAssignments(prev => {
      const newMap = new Map(prev);
      newMap.delete(jobId);
      return newMap;
    });
  };

  // Get the next 7 days for the week view
  const getNext7Days = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getJobCountForDate = (dateStr: string) => {
    return jobs.filter(j => j.date === dateStr && j.status === 'scheduled').length;
  };

  return (
    <div className="space-y-4">
      {/* Weather Section Header */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="h-1 flex-1 bg-linear-to-r from-blue-200 to-blue-400 rounded-full"></div>
        <h2 className="text-2xl font-bold text-blue-900 uppercase tracking-wide">Weather Forecast</h2>
        <div className="h-1 flex-1 bg-linear-to-l from-blue-200 to-blue-400 rounded-full"></div>
      </div>

      {/* Compact Location Selector */}
      <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3">
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm text-blue-900 font-medium">
            {locationName || 'No location set'}
          </span>
          <div className="flex-1 flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="City, address, or ZIP"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
              className="flex-1 h-8 text-sm"
            />
            <Button onClick={handleAddressSearch} disabled={loading} size="sm" variant="outline">
              <Search className="h-3 w-3" />
            </Button>
            <Button onClick={handleUseGPS} disabled={loading} size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Navigation className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && !weatherData && (
        <div className="flex items-center justify-center py-8 bg-blue-50/50 border border-blue-200 rounded-lg">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-blue-700">Loading weather data...</span>
        </div>
      )}

      {/* Error State */}
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
        <div className="text-center py-8 bg-blue-50/50 border border-blue-200 rounded-lg">
          <MapPin className="h-12 w-12 text-blue-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-blue-900 mb-2">No Location Set</h3>
          <p className="text-blue-700 mb-4">
            Enter an address or use your current location to view the weather forecast
          </p>
        </div>
      )}

      {/* Combined Weather Forecast & Job Recommendations Card */}
      {weatherData && (
        <Card className="bg-blue-50/80 backdrop-blur border-blue-200">
          <CardHeader className="bg-blue-100/50 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-blue-900">Weather Forecast & Job Planning</CardTitle>
                <CardDescription className="text-blue-700">
                  {recommendations.badWeatherDays.length > 0 
                    ? `${recommendations.badWeatherDays.length} day(s) with poor weather - move jobs to better days`
                    : 'Plan your schedule around the weather'
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={forecastView === '5-day' ? 'default' : 'outline'}
                  onClick={() => setForecastView('5-day')}
                  className={forecastView === '5-day' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  5-Day
                </Button>
                <Button
                  size="sm"
                  variant={forecastView === '7-day' ? 'default' : 'outline'}
                  onClick={() => setForecastView('7-day')}
                  className={forecastView === '7-day' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  7-Day
                </Button>
                <Button
                  size="sm"
                  variant={forecastView === 'detailed' ? 'default' : 'outline'}
                  onClick={() => setForecastView('detailed')}
                  className={forecastView === 'detailed' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  Detailed
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Forecast Views */}
            <div>
              {/* 5-Day View */}
              {forecastView === '5-day' && (
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
              )}

              {/* 7-Day View */}
              {forecastView === '7-day' && (
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                  {weatherData.daily.slice(0, 7).map((day, index) => (
                    <div 
                      key={index} 
                      className={`p-3 rounded-lg text-center ${
                        day.precipitationChance >= 60 
                          ? 'bg-red-50 border-2 border-red-300' 
                          : day.precipitationChance >= 30
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'bg-green-50 border border-green-200'
                      }`}
                    >
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        {index === 0 ? 'Today' : day.date.split(',')[0]}
                      </div>
                      <img 
                        src={getWeatherIconUrl(day.icon)} 
                        alt={day.description}
                        className="w-12 h-12 mx-auto"
                      />
                      <div className="mt-1">
                        <div className="text-lg font-bold text-gray-900">{day.tempMax}°</div>
                        <div className="text-xs text-gray-500">{day.tempMin}°</div>
                      </div>
                      {day.precipitationChance > 0 && (
                        <div className={`flex items-center justify-center gap-1 mt-1 text-xs font-medium ${
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
              )}

              {/* Detailed View */}
              {forecastView === 'detailed' && (
                <div className="space-y-3">
                  {weatherData.daily.slice(0, 5).map((day, index) => (
                    <div 
                      key={index} 
                      className={`p-4 rounded-lg ${
                        day.precipitationChance >= 60 
                          ? 'bg-red-50 border-2 border-red-300' 
                          : day.precipitationChance >= 30
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'bg-green-50 border border-green-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <div className="font-bold text-gray-900">
                              {index === 0 ? 'Today' : day.date.split(',')[0]}
                            </div>
                            <div className="text-sm text-gray-600 capitalize">{day.description}</div>
                          </div>
                          <img 
                            src={getWeatherIconUrl(day.icon)} 
                            alt={day.description}
                            className="w-16 h-16"
                          />
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-gray-900">{day.tempMax}°</div>
                          <div className="text-sm text-gray-500">Low {day.tempMin}°</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <CloudRain className="h-4 w-4 text-blue-600" />
                          <span className={`font-medium ${
                            day.precipitationChance >= 60 ? 'text-red-700' : 
                            day.precipitationChance >= 30 ? 'text-yellow-700' : 'text-gray-700'
                          }`}>
                            {day.precipitationChance}% rain
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Wind className="h-4 w-4 text-blue-600" />
                          <span className="text-gray-700">{day.windSpeed} mph</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-blue-600" />
                          <span className="text-gray-700">{day.humidity}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Job Rescheduling Recommendations Section */}
            {recommendations.badWeatherDays.length > 0 && onRescheduleJob && (
              <div className="border-t-2 border-blue-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-blue-900">Job Rescheduling Recommendations</h3>
                </div>
                <div className="space-y-4">
                  {recommendations.badWeatherDays.map((badDay, index) => (
                    <div key={index} className="border-2 border-red-300 rounded-lg overflow-hidden bg-white">
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
                      {badDay.suggestedTarget && (
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
                      {!badDay.suggestedTarget && (
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
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-300">
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
              </div>
            )}

            {/* No bad weather - all clear! */}
            {recommendations.badWeatherDays.length === 0 && jobs.some(j => j.status === 'scheduled') && (
              <div className="border-t-2 border-blue-200 pt-3">
                <div className="flex items-center justify-center gap-2 py-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="text-sm font-medium text-green-700">
                    No bad weather expected for scheduled jobs in the next 7 days
                  </p>
                </div>
              </div>
            )}
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
      {/* Reschedule Dialog - Drag and Drop Week View */}
      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reschedule Jobs - Drag to New Days</DialogTitle>
            <DialogDescription>
              Drag jobs from the top to the day cards below. Green days have good weather!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Unassigned Jobs Section */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>Jobs to Reschedule</span>
                <span className="text-sm font-normal text-gray-600">
                  ({selectedJobsToReschedule.filter(j => !jobAssignments.has(j.id)).length} remaining)
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-h-[100px]">
                {selectedJobsToReschedule
                  .filter(job => !jobAssignments.has(job.id))
                  .map(job => {
                    const customer = customers.find(c => c.id === job.customerId);
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={() => handleDragStart(job.id)}
                        className="bg-white border-2 border-orange-300 rounded-lg p-3 cursor-move hover:shadow-lg transition-all hover:scale-105"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate">
                              {customer?.name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-600 truncate flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {customer?.address || 'No address'}
                            </div>
                          </div>
                        </div>
                        {customer && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                              {customer.squareFootage.toLocaleString()} sq ft
                            </span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">
                              ${customer.price}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-orange-600 mt-2 font-medium">
                          ⚠️ Drag to reschedule
                        </div>
                      </div>
                    );
                  })}
                {selectedJobsToReschedule.filter(j => !jobAssignments.has(j.id)).length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-8">
                    ✓ All jobs assigned! Review below or drag them back here to reassign.
                  </div>
                )}
              </div>
            </div>

            {/* Week View Grid - Droppable Days */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Select Target Days:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {getNext7Days().map((day, index) => {
                  const dateStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayDate = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const currentJobCount = getJobCountForDate(dateStr);
                  const assignedJobs = selectedJobsToReschedule.filter(j => jobAssignments.get(j.id) === dateStr);
                  const totalJobsAfterMove = currentJobCount + assignedJobs.length;
                  
                  // Get weather for this day
                  const weatherForDay = weatherData?.daily[index];
                  const rainChance = weatherForDay?.precipitationChance || 0;
                  const isGoodWeather = rainChance < 30;
                  const isBadWeather = rainChance >= 60;
                  const isBeingDraggedOver = dragOverDay === dateStr;
                  
                  return (
                    <div
                      key={dateStr}
                      onDragOver={(e) => handleDragOver(e, dateStr)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      className={`rounded-lg border-2 transition-all ${
                        isBeingDraggedOver
                          ? 'border-blue-500 bg-blue-100 scale-105 shadow-lg'
                          : isBadWeather 
                          ? 'bg-red-50 border-red-300 hover:border-red-400' 
                          : isGoodWeather
                          ? 'bg-green-50 border-green-400 hover:border-green-500 shadow-sm'
                          : 'bg-yellow-50 border-yellow-300 hover:border-yellow-400'
                      }`}
                    >
                      {/* Day Header */}
                      <div className="p-3 border-b border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-bold text-gray-900">{dayName}</div>
                            <div className="text-sm text-gray-600">{dayDate}</div>
                          </div>
                          {weatherForDay && (
                            <img 
                              src={getWeatherIconUrl(weatherForDay.icon)} 
                              alt={weatherForDay.description}
                              className="w-10 h-10"
                            />
                          )}
                        </div>
                        
                        {weatherForDay && (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {weatherForDay.tempMax}° / {weatherForDay.tempMin}°
                            </div>
                            <div className={`text-xs font-medium flex items-center gap-1 ${
                              isBadWeather ? 'text-red-700' : isGoodWeather ? 'text-green-700' : 'text-yellow-700'
                            }`}>
                              <CloudRain className="h-3 w-3" />
                              {rainChance}% rain
                            </div>
                          </div>
                        )}
                        
                        {isGoodWeather && (
                          <div className="mt-2 text-xs text-green-700 font-medium flex items-center gap-1 bg-green-100 px-2 py-1 rounded">
                            <CheckCircle className="h-3 w-3" />
                            Recommended
                          </div>
                        )}
                      </div>

                      {/* Job Count & Assigned Jobs */}
                      <div className="p-3">
                        <div className="text-xs text-gray-600 mb-2">
                          Current: {currentJobCount} job{currentJobCount !== 1 ? 's' : ''}
                          {assignedJobs.length > 0 && (
                            <span className="text-blue-700 font-medium"> +{assignedJobs.length} moving here</span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-gray-900 mb-3">
                          Total: {totalJobsAfterMove} job{totalJobsAfterMove !== 1 ? 's' : ''}
                        </div>

                        {/* Assigned Jobs List */}
                        {assignedJobs.length > 0 && (
                          <div className="space-y-2 border-t pt-2">
                            {assignedJobs.map(job => {
                              const customer = customers.find(c => c.id === job.customerId);
                              return (
                                <div
                                  key={job.id}
                                  draggable
                                  onDragStart={() => handleDragStart(job.id)}
                                  className="bg-white border border-green-300 rounded p-2 cursor-move hover:shadow-md transition-all text-xs group"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 truncate">
                                        {customer?.name}
                                      </div>
                                      <div className="text-xs text-gray-600 truncate">
                                        ${customer?.price}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => unassignJob(job.id)}
                                      className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity"
                                      title="Remove"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {assignedJobs.length === 0 && isBeingDraggedOver && (
                          <div className="text-xs text-blue-700 font-medium text-center py-4 border-2 border-dashed border-blue-400 rounded">
                            Drop here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className={`rounded-lg p-4 border-2 ${
              Array.from(jobAssignments.values()).filter(d => d).length === selectedJobsToReschedule.length
                ? 'bg-green-50 border-green-300'
                : 'bg-blue-50 border-blue-300'
            }`}>
              <div className="text-sm font-medium">
                {Array.from(jobAssignments.values()).filter(d => d).length === selectedJobsToReschedule.length ? (
                  <span className="text-green-900">
                    ✓ All {selectedJobsToReschedule.length} jobs assigned and ready to move!
                  </span>
                ) : (
                  <span className="text-blue-900">
                    {Array.from(jobAssignments.values()).filter(d => d).length} of {selectedJobsToReschedule.length} jobs assigned
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRescheduleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmReschedule} 
              disabled={Array.from(jobAssignments.values()).filter(d => d).length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirm Move ({Array.from(jobAssignments.values()).filter(d => d).length} jobs)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
