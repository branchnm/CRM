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
  CheckCircle,
  Cloud,
  Sun,
  CloudSnow
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
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number | null>(null);
  const dragDelayTimeout = useRef<number | null>(null);
  const [touchDraggedJobId, setTouchDraggedJobId] = useState<string | null>(null);
  const originalJobDates = useRef<Map<string, string>>(new Map()); // Track original dates for jobs
  const autoScrollInterval = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-scroll when dragging near viewport edges
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Update drag position for visual feedback
      setDragPosition({ x: e.clientX, y: e.clientY });

      const scrollThreshold = 100; // pixels from edge to trigger scroll
      const scrollSpeed = 10; // pixels to scroll per interval
      const viewportHeight = window.innerHeight;
      const mouseY = e.clientY;

      // Clear existing interval
      if (autoScrollInterval.current) {
        clearInterval(autoScrollInterval.current);
        autoScrollInterval.current = null;
      }

      // Scroll up if near top
      if (mouseY < scrollThreshold) {
        autoScrollInterval.current = setInterval(() => {
          window.scrollBy(0, -scrollSpeed);
        }, 16) as unknown as number; // ~60fps
      }
      // Scroll down if near bottom
      else if (mouseY > viewportHeight - scrollThreshold) {
        autoScrollInterval.current = setInterval(() => {
          window.scrollBy(0, scrollSpeed);
        }, 16) as unknown as number;
      }
    };

    const handleMouseUp = () => {
      if (autoScrollInterval.current) {
        clearInterval(autoScrollInterval.current);
        autoScrollInterval.current = null;
      }
      setIsDragging(false);
      setDragPosition(null);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (autoScrollInterval.current) {
        clearInterval(autoScrollInterval.current);
        autoScrollInterval.current = null;
      }
    };
  }, [isDragging]);

  // Helper function to get weather icon based on description and precipitation
  const getWeatherIcon = (description: string, rainChance: number) => {
    const desc = description.toLowerCase();
    
    // CRITICAL: Prioritize precipitation percentage over description text
    // Check rain/snow conditions first based on precipitation amount
    if (rainChance >= 60) {
      return { Icon: CloudRain, color: 'text-blue-500' };
    } else if (desc.includes('snow') || desc.includes('sleet')) {
      return { Icon: CloudSnow, color: 'text-blue-400' };
    } else if (rainChance >= 30 || desc.includes('cloud')) {
      return { Icon: Cloud, color: 'text-gray-500' };
    } else if (desc.includes('rain') || desc.includes('drizzle')) {
      // Light rain with low precipitation chance
      return { Icon: CloudRain, color: 'text-blue-500' };
    } else {
      return { Icon: Sun, color: 'text-yellow-500' };
    }
  };

  // Helper to create gradient based on weather progression throughout the day
  const getWeatherGradient = (hourlyForecasts: any[] | undefined) => {
    if (!hourlyForecasts || hourlyForecasts.length === 0) {
      return 'bg-gray-50';
    }

    const colors = hourlyForecasts.map(forecast => {
      const desc = forecast.description.toLowerCase();
      const rain = forecast.precipitation;
      
      if (desc.includes('rain') || desc.includes('drizzle') || rain >= 60) {
        return 'rgb(219, 234, 254)'; // blue-50
      } else if (desc.includes('cloud')) {
        return 'rgb(249, 250, 251)'; // gray-50
      } else {
        return 'rgb(254, 252, 232)'; // yellow-50
      }
    });

    // Create gradient string
    if (colors.length === 1) {
      return `bg-[${colors[0]}]`;
    } else if (colors.length === 2) {
      return `bg-gradient-to-r from-[${colors[0]}] to-[${colors[1]}]`;
    } else if (colors.length >= 3) {
      return `bg-gradient-to-r from-[${colors[0]}] via-[${colors[Math.floor(colors.length / 2)]}] to-[${colors[colors.length - 1]}]`;
    }
    
    return 'bg-gray-50';
  };

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
        setShowLocationSearch(false); // Close search controls after setting location
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
        setShowLocationSearch(false); // Close search controls after getting GPS location
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
    setIsDragging(true);
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
    setIsDragging(false);
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
    touchStartTime.current = Date.now();
    
    // Clear any existing timeout
    if (dragDelayTimeout.current) {
      clearTimeout(dragDelayTimeout.current);
    }
    
    // Set a delay before allowing drag (200ms)
    dragDelayTimeout.current = setTimeout(() => {
      // Check if still touching (not a quick tap/swipe)
      if (touchStartTime.current) {
        setTouchDraggedJobId(jobId);
        setDraggedJobId(jobId);
        setIsDragging(true);
        setDragPosition({ x: touch.clientX, y: touch.clientY });
        // Prevent body scroll while dragging
        document.body.style.overflow = 'hidden';
      }
    }, 200) as unknown as number;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // If drag hasn't started yet, check if moved too much (likely scrolling)
    if (!touchDraggedJobId && touchStartPos.current) {
      const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);
      
      // If moved more than 10px, cancel the drag delay
      if (deltaX > 10 || deltaY > 10) {
        if (dragDelayTimeout.current) {
          clearTimeout(dragDelayTimeout.current);
          dragDelayTimeout.current = null;
        }
        touchStartTime.current = null;
      }
      return;
    }
    
    if (!touchDraggedJobId) return;
    
    setDragPosition({ x: touch.clientX, y: touch.clientY });
    
    const scrollThreshold = 100;
    const scrollSpeed = 10;
    const viewportHeight = window.innerHeight;
    const touchY = touch.clientY;

    // Auto-scroll on touch drag
    if (touchY < scrollThreshold) {
      window.scrollBy(0, -scrollSpeed);
    } else if (touchY > viewportHeight - scrollThreshold) {
      window.scrollBy(0, scrollSpeed);
    }
    
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
    // Clear the delay timeout
    if (dragDelayTimeout.current) {
      clearTimeout(dragDelayTimeout.current);
      dragDelayTimeout.current = null;
    }
    touchStartTime.current = null;
    
    if (!touchDraggedJobId) return;
    
    setIsDragging(false);
    setDragPosition(null);
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

  // Get the next 5 days for the forecast view
  const getNext5Days = () => {
    const days = [];
    for (let i = 0; i < 5; i++) {
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

      {/* Location Selector - Centered on mobile - Blue theme, no box */}
      <div className="flex justify-center mb-4">
        <div className="w-full md:w-fit">
          <div className="flex flex-col md:flex-row items-center gap-2 justify-center">
            {/* Location Display - Clickable when location is set */}
            <div 
              className={`flex items-center gap-2 ${locationName && !showLocationSearch ? 'cursor-pointer hover:bg-blue-50 rounded px-2 py-1 -mx-2 -my-1 transition-colors' : ''}`}
              onClick={() => {
                if (locationName && !showLocationSearch) {
                  setShowLocationSearch(true);
                }
              }}
            >
              <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm text-blue-900 font-medium whitespace-nowrap">
                {locationName || 'No location set'}
              </span>
            </div>

            {/* Search Controls - Show if no location or if toggled open */}
            {(!locationName || showLocationSearch) && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Input
                  placeholder="City, address, or ZIP"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                  className="w-48 h-8 text-sm border-blue-200 focus:border-blue-400 focus:ring-blue-400"
                />
                <Button onClick={handleAddressSearch} disabled={loading} size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 h-8">
                  <Search className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Search</span>
                </Button>
                <Button onClick={handleUseGPS} disabled={loading} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8">
                  <Navigation className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">GPS</span>
                </Button>
                {/* Close button when location exists */}
                {locationName && showLocationSearch && (
                  <Button 
                    onClick={() => setShowLocationSearch(false)} 
                    size="sm" 
                    variant="outline" 
                    className="h-8"
                  >
                    Done
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons - Bottom Right - Only visible when there are changes - Blue theme */}
      {jobAssignments.size > 0 && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col gap-2 animate-in slide-in-from-bottom-4">
          <div className="bg-white border-2 border-blue-300 rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="font-medium text-sm text-blue-900">
                {jobAssignments.size} ready to move
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setJobAssignments(new Map())}
                className="flex-1"
              >
                Reset
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 flex-1"
                onClick={async () => {
                  if (jobAssignments.size === 0 || !onRescheduleJob) return;
                  
                  const count = jobAssignments.size;
                  
                  for (const [jobId, newDateStr] of jobAssignments.entries()) {
                    const job = jobs.find(j => j.id === jobId);
                    if (job) {
                      await onRescheduleJob(jobId, newDateStr);
                      originalJobDates.current.set(jobId, newDateStr);
                    }
                  }
                  
                  setJobAssignments(new Map());
                  toast.success(`${count} job(s) rescheduled successfully!`);
                }}
              >
                Confirm ({jobAssignments.size})
              </Button>
            </div>
          </div>
        </div>
      )}

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
        <div className="space-y-4">
            {/* Week View Grid - Droppable Days */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-start">
                {getNext5Days().map((day, index) => {
                  const dateStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  const isToday = index === 0;
                  const dayName = isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayDate = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Get weather for this day - IMPORTANT: index matches the day iteration
                  const weatherForDay = weatherData?.daily[index];
                  
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
                  
                  const rainChance = weatherForDay?.precipitationChance || 0;
                  const isBadWeather = rainChance >= 60;
                  const isBeingDraggedOver = dragOverDay === dateStr;
                  
                  // Determine border color based on precipitation chance
                  let borderColor = 'border-gray-300';
                  
                  if (rainChance >= 60) {
                    borderColor = 'border-blue-300';
                  } else if (rainChance >= 30) {
                    borderColor = 'border-gray-300';
                  } else {
                    borderColor = 'border-yellow-200';
                  }
                  
                  // For today, add a slightly bolder accent
                  if (isToday) {
                    if (borderColor === 'border-blue-300') borderColor = 'border-blue-400';
                    else if (borderColor === 'border-yellow-200') borderColor = 'border-yellow-400';
                    else borderColor = 'border-gray-400';
                  }
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      onDragOver={(e) => handleDragOver(e, dateStr)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      className={`rounded-xl border-2 transition-all duration-200 overflow-hidden relative ${
                        isBeingDraggedOver
                          ? 'scale-105 shadow-2xl ring-4 ring-blue-400 ring-opacity-50'
                          : 'shadow-sm'
                      } ${borderColor}`}
                      style={isBeingDraggedOver ? {} : weatherForDay ? {
                        background: weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0
                          ? `linear-gradient(to bottom, ${weatherForDay.hourlyForecasts.map((h, idx) => {
                              const desc = h.description.toLowerCase();
                              // Use the higher of hourly or daily precipitation for accurate colors
                              const effectiveRain = Math.max(h.precipitation, rainChance);
                              let color = 'rgb(254, 252, 232)'; // yellow-50 for clear
                              // Prioritize precipitation percentage over description
                              if (effectiveRain >= 60 || desc.includes('rain') || desc.includes('drizzle')) {
                                color = 'rgb(219, 234, 254)'; // blue-50 for rain
                              } else if (desc.includes('cloud') || effectiveRain >= 30) {
                                color = 'rgb(249, 250, 251)'; // gray-50 for cloudy
                              }
                              return `${color} ${(idx / (weatherForDay.hourlyForecasts!.length - 1)) * 100}%`;
                            }).join(', ')})`
                          : (() => {
                              // Fallback: solid color based on daily rain chance
                              let bgColor = 'rgb(254, 252, 232)'; // yellow-50 for clear
                              if (rainChance >= 60) {
                                bgColor = 'rgb(219, 234, 254)'; // blue-50 for rain
                              } else if (rainChance >= 30) {
                                bgColor = 'rgb(249, 250, 251)'; // gray-50 for cloudy
                              }
                              return bgColor;
                            })()
                      } : {}
                      }
                    >
                      {/* Day Header - Simplified without weather icons */}
                      <div className="p-4 text-center">
                        <div className="font-semibold text-base text-gray-900 mb-1">{dayName}</div>
                        <div className="text-sm text-gray-600">{dayDate}</div>
                        
                        {/* Rain Chance Badge - Always takes up space for alignment */}
                        <div className="h-6 flex items-center justify-center mt-2">
                          {weatherForDay && rainChance > 0 && (
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              isBadWeather 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {rainChance}%
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Job Count & Jobs List - With transparent weather icons overlay on right */}
                      <div className="p-3 pr-16 bg-gray-50/50 relative min-h-[280px]">
                        {/* Transparent Weather Icons Overlay - Right side */}
                        {weatherForDay && (
                          <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-around items-center pointer-events-none z-0 py-3">
                            {/* Always show 4 time periods representing the full day */}
                            {(() => {
                              const times = ['5 AM', '11 AM', '5 PM', '11 PM'];
                              const timeHours = [5, 11, 17, 23]; // 24-hour format
                              const currentHour = new Date().getHours();
                              
                              // Always create 4 time slots
                              return times.map((time, idx) => {
                                // Try to get forecast data for this time slot, fallback to daily weather
                                const forecast = weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts[idx]
                                  ? weatherForDay.hourlyForecasts[idx]
                                  : { description: weatherForDay.description, precipitation: rainChance };
                                
                                const effectivePrecipitation = Math.max(forecast.precipitation, rainChance);
                                const { Icon: HourIcon, color: hourColor } = getWeatherIcon(forecast.description, effectivePrecipitation);
                                
                                // For today, gray out times that have passed
                                const isPastTime = isToday && currentHour >= timeHours[idx];
                                const opacityClass = isPastTime ? 'opacity-10' : 'opacity-20';
                                
                                return (
                                  <div key={idx} className={`flex flex-col items-center gap-1 ${opacityClass}`}>
                                    <HourIcon className={`w-10 h-10 ${hourColor} stroke-[1.5]`} />
                                    <span className="text-[10px] text-gray-600 font-medium">{times[idx]}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                        
                        <div className="relative z-10">
                        <div className="text-xs font-semibold mb-2 text-gray-700 text-center">
                          {totalJobs} job{totalJobs !== 1 ? 's' : ''}
                        </div>

                        {/* Only show job list if there are jobs */}
                        {totalJobs > 0 && (
                          <>
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
                                      ? 'bg-blue-200 border-2 border-blue-500 animate-pulse' 
                                      : 'bg-white border border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 truncate flex items-center gap-1">
                                        {isOnBadWeatherDay && <AlertTriangle className="h-3 w-3 text-blue-800 shrink-0" />}
                                        {customer?.name}
                                      </div>
                                      {isOnBadWeatherDay && (
                                        <div className="text-xs text-blue-900 font-medium mt-0.5">
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
                          </>
                        )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

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

      {/* Drag Preview - Shows the job being dragged */}
      {draggedJobId && dragPosition && (() => {
        const draggedJob = jobs.find(j => j.id === draggedJobId);
        const customer = draggedJob ? customers.find(c => c.id === draggedJob.customerId) : null;
        
        if (!draggedJob || !customer) return null;
        
        return (
          <div
            className="fixed pointer-events-none z-50 opacity-80"
            style={{
              left: `${dragPosition.x}px`,
              top: `${dragPosition.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="rounded p-2 bg-blue-500 border-2 border-blue-600 shadow-2xl text-xs min-w-[120px]">
              <div className="font-semibold text-white truncate">
                {customer.name}
              </div>
              <div className="text-blue-100 truncate">
                ${customer.price}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
