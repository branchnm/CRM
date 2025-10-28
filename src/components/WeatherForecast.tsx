import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import type { Job, Customer } from '../App';
import { 
  CloudRain, 
  MapPin, 
  Search, 
  Navigation,
  AlertTriangle,
  Loader2,
  CheckCircle
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
  const [jobAssignments, setJobAssignments] = useState<Map<string, string>>(new Map()); // jobId -> date mapping
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const [touchDraggedJobId, setTouchDraggedJobId] = useState<string | null>(null);
  const originalJobDates = useRef<Map<string, string>>(new Map()); // Track original dates for jobs

  // Initialize original job dates when jobs change
  useEffect(() => {
    jobs.forEach(job => {
      if (!originalJobDates.current.has(job.id)) {
        originalJobDates.current.set(job.id, job.date);
      }
    });
  }, [jobs]);

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

  // Drag and drop handlers
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
      // Find the job to check its current date
      const job = jobs.find(j => j.id === draggedJobId);
      const originalDate = originalJobDates.current.get(draggedJobId);
      
      if (job) {
        // Check if job has a pending assignment, otherwise use its database date
        const currentEffectiveDate = jobAssignments.has(draggedJobId) 
          ? jobAssignments.get(draggedJobId) 
          : job.date;
        
        // If dropping on the same day it's currently on (effective), do nothing
        if (currentEffectiveDate === dateStr) {
          setDraggedJobId(null);
          setDragOverDay(null);
          return;
        }
        
        // Always update or add the assignment
        setJobAssignments(prev => {
          const newMap = new Map(prev);
          
          // If dropping back to original day, remove from assignments
          if (originalDate === dateStr) {
            newMap.delete(draggedJobId);
          } else {
            // Dropping to a new day (not original), add/update assignment
            newMap.set(draggedJobId, dateStr);
          }
          
          return newMap;
        });
      }
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

  // Touch handlers for mobile drag and drop
  const handleTouchStart = (e: React.TouchEvent, jobId: string) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    setTouchDraggedJobId(jobId);
    setDraggedJobId(jobId);
    // Prevent body scroll while dragging
    document.body.style.overflow = 'hidden';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDraggedJobId) return;
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the day card container
    const dayCard = element?.closest('[data-day-card]');
    if (dayCard) {
      const dateStr = dayCard.getAttribute('data-date');
      if (dateStr) {
        setDragOverDay(dateStr);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchDraggedJobId) return;
    
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the day card container
    const dayCard = element?.closest('[data-day-card]');
    if (dayCard) {
      const dateStr = dayCard.getAttribute('data-date');
      if (dateStr && touchDraggedJobId) {
        // Find the job to check its current date
        const job = jobs.find(j => j.id === touchDraggedJobId);
        const originalDate = originalJobDates.current.get(touchDraggedJobId);
        
        if (job) {
          // Check if job has a pending assignment, otherwise use its database date
          const currentEffectiveDate = jobAssignments.has(touchDraggedJobId) 
            ? jobAssignments.get(touchDraggedJobId) 
            : job.date;
          
          // If dropping on the same day it's currently on (effective), do nothing
          if (currentEffectiveDate !== dateStr) {
            // Always update or add the assignment
            setJobAssignments(prev => {
              const newMap = new Map(prev);
              
              // If dropping back to original day, remove from assignments
              if (originalDate === dateStr) {
                newMap.delete(touchDraggedJobId);
              } else {
                // Dropping to a new day (not original), add/update assignment
                newMap.set(touchDraggedJobId, dateStr);
              }
              
              return newMap;
            });
          }
        }
      }
    }
    
    setTouchDraggedJobId(null);
    setDraggedJobId(null);
    setDragOverDay(null);
    touchStartPos.current = null;
    // Re-enable body scroll
    document.body.style.overflow = '';
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

  return (
    <div className="space-y-4">
      {/* Weather Section Header */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="h-1 flex-1 bg-linear-to-r from-blue-200 to-blue-400 rounded-full"></div>
        <h2 className="text-2xl font-bold text-blue-900 uppercase tracking-wide">Weather Forecast</h2>
        <div className="h-1 flex-1 bg-linear-to-l from-blue-200 to-blue-400 rounded-full"></div>
      </div>

      {/* Compact Location Selector */}
      <div className="bg-green-50/50 border border-green-200 rounded-lg p-3">
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <MapPin className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-900 font-medium">
            {locationName || 'No location set'}
          </span>
          <div className="flex-1 flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="City, address, or ZIP"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
              className="flex-1 h-8 text-sm border-green-200 focus:border-green-400 focus:ring-green-400"
            />
            <Button onClick={handleAddressSearch} disabled={loading} size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
              <Search className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Search</span>
            </Button>
            <Button onClick={handleUseGPS} disabled={loading} size="sm" className="bg-green-600 hover:bg-green-700">
              <Navigation className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Use GPS</span>
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

      {/* Combined Weather Forecast & Job Planning Card */}
      {weatherData && (
        <Card className="bg-white/80 backdrop-blur border-gray-200">
          <CardContent className="pt-4 space-y-4">
            {/* Week View Grid - Droppable Days */}
            <div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
                {getNext7Days().map((day, index) => {
                  const dateStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  const isToday = index === 0;
                  const dayName = isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayDate = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Get jobs scheduled for this day (excluding jobs that are being moved to another day)
                  const scheduledJobsForDay = jobs.filter(j => {
                    if (j.date !== dateStr || j.status !== 'scheduled') return false;
                    // Exclude jobs that have been reassigned to a different day
                    if (jobAssignments.has(j.id) && jobAssignments.get(j.id) !== dateStr) return false;
                    return true;
                  });
                  
                  // Get jobs being moved to this day
                  const assignedJobs = Array.from(jobAssignments.entries())
                    .filter(([_, targetDate]) => targetDate === dateStr)
                    .map(([jobId]) => jobs.find(j => j.id === jobId))
                    .filter(Boolean) as Job[];
                  
                  const totalJobs = scheduledJobsForDay.length + assignedJobs.length;
                  
                  // Get weather for this day
                  const weatherForDay = weatherData?.daily[index];
                  const rainChance = weatherForDay?.precipitationChance || 0;
                  const isGoodWeather = rainChance < 30;
                  const isBadWeather = rainChance >= 60;
                  const isBeingDraggedOver = dragOverDay === dateStr;
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      onDragOver={(e) => handleDragOver(e, dateStr)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      className={`rounded-lg border-2 transition-all ${
                        isBeingDraggedOver
                          ? 'border-blue-500 bg-blue-100 scale-105 shadow-lg'
                          : isBadWeather 
                          ? 'bg-blue-50 border-blue-300 hover:border-blue-400' 
                          : isGoodWeather
                          ? 'bg-green-50 border-green-400 hover:border-green-500 shadow-sm'
                          : 'bg-blue-50 border-blue-300 hover:border-blue-400'
                      }`}
                    >
                      {/* Day Header */}
                      <div className="p-2 border-b border-gray-200">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <div className="font-bold text-sm text-gray-900">{dayName}</div>
                            <div className="text-xs text-gray-600">{dayDate}</div>
                          </div>
                          {weatherForDay && (
                            <img 
                              src={getWeatherIconUrl(weatherForDay.icon)} 
                              alt={weatherForDay.description}
                              className="w-8 h-8 shrink-0"
                            />
                          )}
                        </div>
                        
                        {weatherForDay && (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium text-gray-900">
                              {weatherForDay.tempMax}° / {weatherForDay.tempMin}°
                            </div>
                            <div className={`text-xs font-medium flex items-center gap-1 ${
                              isBadWeather ? 'text-blue-700' : isGoodWeather ? 'text-green-700' : 'text-blue-700'
                            }`}>
                              <CloudRain className="h-3 w-3 shrink-0" />
                              {rainChance}% rain
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Job Count & Jobs List */}
                      <div className="p-2">
                        <div className="text-xs font-semibold text-gray-900 mb-2">
                          {totalJobs} job{totalJobs !== 1 ? 's' : ''}
                        </div>

                        {/* Scheduled Jobs (Original) */}
                        {scheduledJobsForDay.length > 0 && (
                          <div className="space-y-1.5">
                            {scheduledJobsForDay.map(job => {
                              const customer = customers.find(c => c.id === job.customerId);
                              const isOnBadWeatherDay = isBadWeather && !jobAssignments.has(job.id);
                              return (
                                <div
                                  key={job.id}
                                  draggable
                                  onDragStart={() => handleDragStart(job.id)}
                                  onTouchStart={(e) => handleTouchStart(e, job.id)}
                                  onTouchMove={handleTouchMove}
                                  onTouchEnd={handleTouchEnd}
                                  className={`rounded p-1.5 cursor-move hover:shadow-md transition-all text-xs group ${
                                    isOnBadWeatherDay 
                                      ? 'bg-blue-100 border-2 border-blue-500 animate-pulse' 
                                      : 'bg-white border border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 truncate flex items-center gap-1">
                                        {isOnBadWeatherDay && <AlertTriangle className="h-3 w-3 text-blue-700 shrink-0" />}
                                        {customer?.name}
                                      </div>
                                      {isOnBadWeatherDay && (
                                        <div className="text-xs text-blue-800 font-medium mt-0.5">
                                          ⚠️ Move to better day
                                        </div>
                                      )}
                                      {!isOnBadWeatherDay && (
                                        <div className="text-xs text-gray-600 truncate">
                                          ${customer?.price}
                                        </div>
                                      )}
                                    </div>
                                    {!isOnBadWeatherDay && (
                                      <button
                                        onClick={() => unassignJob(job.id)}
                                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity shrink-0 w-4 h-4 flex items-center justify-center"
                                        title="Remove"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Assigned Jobs (Being moved here) */}
                        {/* Assigned Jobs (Being moved here) */}
                        {assignedJobs.length > 0 && (
                          <div className="space-y-1.5 mt-2 border-t-2 border-blue-300 pt-2">
                            <div className="text-xs text-blue-700 font-medium mb-1">
                              Moving here:
                            </div>
                            {assignedJobs.map(job => {
                              const customer = customers.find(c => c.id === job.customerId);
                              return (
                                <div
                                  key={job.id}
                                  draggable
                                  onDragStart={() => handleDragStart(job.id)}
                                  onTouchStart={(e) => handleTouchStart(e, job.id)}
                                  onTouchMove={handleTouchMove}
                                  onTouchEnd={handleTouchEnd}
                                  className="bg-blue-50 border border-blue-300 rounded p-1.5 cursor-move hover:shadow-md transition-all text-xs group"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 truncate text-xs">
                                        {customer?.name}
                                      </div>
                                      <div className="text-xs text-gray-600 truncate">
                                        ${customer?.price}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => unassignJob(job.id)}
                                      className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity shrink-0 w-4 h-4 flex items-center justify-center"
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

                        {scheduledJobsForDay.length === 0 && assignedJobs.length === 0 && isBeingDraggedOver && (
                          <div className="text-xs text-blue-700 font-medium text-center py-3 border-2 border-dashed border-blue-400 rounded">
                            Drop here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confirm Move Button */}
            {jobAssignments.size > 0 && (
              <div className="border-2 border-green-300 bg-green-50 rounded-lg p-4 mt-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                    <span className="font-medium text-green-900 text-sm">
                      {jobAssignments.size} job{jobAssignments.size !== 1 ? 's' : ''} assigned and ready to move!
                    </span>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setJobAssignments(new Map());
                        // Don't reset original dates on reset - keep them tracked
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={async () => {
                        if (jobAssignments.size === 0 || !onRescheduleJob) return;
                        
                        const count = jobAssignments.size;
                        
                        for (const [jobId, newDateStr] of jobAssignments.entries()) {
                          const job = jobs.find(j => j.id === jobId);
                          if (job) {
                            await onRescheduleJob(jobId, newDateStr);
                            // Update the original date to the new date after successful move
                            originalJobDates.current.set(jobId, newDateStr);
                          }
                        }
                        
                        setJobAssignments(new Map());
                        toast.success(`${count} job(s) rescheduled successfully!`);
                      }}
                    >
                      Confirm Move ({jobAssignments.size} job{jobAssignments.size !== 1 ? 's' : ''})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* No bad weather - all clear! */}
            {recommendations.badWeatherDays.length === 0 && jobs.some(j => j.status === 'scheduled') && (
              <div className="border-2 border-green-300 bg-green-50 rounded-lg">
                <div className="flex items-center justify-center gap-2 py-3 px-4">
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
    </div>
  );
}
