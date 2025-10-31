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
  // ...existing code continues...
  Navigation,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Cloud,
  Sun,
  CloudSnow,
  CloudDrizzle,
  CloudRainWind
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
  onRescheduleJob?: (jobId: string, newDate: string, timeSlot?: number) => void;
  onUpdateJobTimeSlot?: (jobId: string, timeSlot: number) => void;
  onStartTimeChange?: (date: string, startHour: number) => void;
}

export function WeatherForecast({ jobs = [], customers = [], onRescheduleJob, onUpdateJobTimeSlot, onStartTimeChange }: WeatherForecastProps) {
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
  const [jobTimeSlots, setJobTimeSlots] = useState<Map<string, number>>(new Map()); // jobId -> timeSlot (0-11 for 6am-6pm)

  // Sync jobTimeSlots with jobs order when jobs prop changes (e.g., after optimization)
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;
    // Group jobs by date
    const jobsByDate = new Map();
    jobs.forEach((job: any) => {
      if (!jobsByDate.has(job.date)) jobsByDate.set(job.date, []);
      jobsByDate.get(job.date).push(job);
    });
    setJobTimeSlots((prev: Map<string, number>) => {
      const newMap = new Map(prev);
      for (const [, jobsForDate] of jobsByDate.entries()) {
        // Sort jobs by scheduledTime if available, otherwise by order in array
        const sorted = [...jobsForDate].sort((a, b) => {
          if (a.scheduledTime && b.scheduledTime) {
            return a.scheduledTime.localeCompare(b.scheduledTime);
          }
          return 0;
        });
        sorted.forEach((job, idx) => {
          if (job) newMap.set(job.id, idx);
        });
      }
      return newMap;
    });
  }, [jobs]);
  const [dayStartTimes, setDayStartTimes] = useState<Map<string, number>>(() => {
    const saved = localStorage.getItem('dayStartTimes');
    return saved ? new Map(JSON.parse(saved)) : new Map();
  }); // date -> start hour (6-17 for 6am-5pm)
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; slot: number } | null>(null);
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
  const getWeatherIcon = (description: string, rainChance: number, rainAmount?: number) => {
    const desc = description.toLowerCase();
    
    // Check for snow
    if (desc.includes('snow') || desc.includes('sleet')) {
      return { Icon: CloudSnow, color: 'text-blue-400' };
    }
    
    // Check for rain/drizzle with intensity based on actual rain amount
    if (rainChance >= 30 || desc.includes('rain') || desc.includes('drizzle') || desc.includes('thunder') || desc.includes('storm')) {
      const amount = rainAmount || 0;
      
      // Heavy rain (>5mm/3h) - includes thunderstorms
      if (amount > 5 || rainChance >= 80 || desc.includes('thunder') || desc.includes('storm')) {
        return { Icon: CloudRainWind, color: 'text-blue-600' };
      }
      
      // Light drizzle (<1mm/3h)
      if (amount < 1 && rainChance < 60) {
        return { Icon: CloudDrizzle, color: 'text-blue-300' };
      }
      
      // Moderate rain (1-5mm/3h)
      if (rainChance >= 60) {
        return { Icon: CloudRain, color: 'text-blue-500' };
      }
    }
    
    if (desc.includes('cloud')) {
      return { Icon: Cloud, color: 'text-gray-500' };
    }
    
    return { Icon: Sun, color: 'text-yellow-500' };
  };

  // Helper to check if there was heavy overnight rain (11pm-5am) that would affect morning jobs
  const hasHeavyOvernightRain = (weatherForDay: any, previousDayWeather?: any): boolean => {
    if (!weatherForDay?.hourlyForecasts) return false;

    // Check current day's early morning forecasts (midnight-5am)
    const earlyMorningRain = weatherForDay.hourlyForecasts.filter((f: any) => 
      f.hour24 !== undefined && f.hour24 >= 0 && f.hour24 < 5
    );
    
    // Check for heavy rain in early morning (>5mm or high precipitation)
    const hasEarlyMorningHeavyRain = earlyMorningRain.some((f: any) => {
      const desc = f.description?.toLowerCase() || '';
      const isHeavyRain = (f.rainAmount || 0) > 5 || f.precipitation >= 80 || desc.includes('thunder') || desc.includes('storm');
      return isHeavyRain;
    });

    // Check previous day's late night forecasts (11pm-midnight)
    if (previousDayWeather?.hourlyForecasts) {
      const lateNightRain = previousDayWeather.hourlyForecasts.filter((f: any) => 
        f.hour24 !== undefined && f.hour24 >= 23
      );
      
      const hasLateNightHeavyRain = lateNightRain.some((f: any) => {
        const desc = f.description?.toLowerCase() || '';
        const isHeavyRain = (f.rainAmount || 0) > 5 || f.precipitation >= 80 || desc.includes('thunder') || desc.includes('storm');
        return isHeavyRain;
      });
      
      if (hasLateNightHeavyRain) return true;
    }

    return hasEarlyMorningHeavyRain;
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

  // Save day start times to localStorage
  useEffect(() => {
    localStorage.setItem('dayStartTimes', JSON.stringify(Array.from(dayStartTimes.entries())));
  }, [dayStartTimes]);

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

  const handleDragOver = (e: React.DragEvent, dateStr: string, slotIndex?: number) => {
    e.preventDefault();
    // Only set dragOverDay if not already set (prevents flicker)
    if (dragOverDay !== dateStr) {
      setDragOverDay(dateStr);
    }
    // Always set slot for preview
    if (slotIndex !== undefined) {
      setDragOverSlot({ date: dateStr, slot: slotIndex });
    }
  };

  const handleDayCardDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    // Only set the day-level drag state, don't let it bubble to children
    if (dragOverDay !== dateStr) {
      setDragOverDay(dateStr);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the entire day card (not just moving between slots)
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (relatedTarget) {
      const dayCard = relatedTarget.closest('[data-day-card]');
      if (dayCard && dayCard === currentTarget) {
        return;
      }
    }
    setDragOverDay(null);
    setDragOverSlot(null);
  };

  const handleSlotDrop = (e: React.DragEvent, dateStr: string, targetSlot: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (draggedJobId) {
      const job = jobs.find(j => j.id === draggedJobId);
      const originalDate = originalJobDates.current.get(draggedJobId);
      if (job) {
        // Update job assignment for the new date
        setJobAssignments(prev => {
          const newMap = new Map(prev);
          if (originalDate === dateStr) {
            newMap.delete(draggedJobId);
          } else {
            newMap.set(draggedJobId, dateStr);
          }
          return newMap;
        });
        // Recalculate all job slots for this day to match the previewed order
        setJobTimeSlots(prev => {
          // Get all jobs for this day (including the dragged job)
          const assignedJobs = Array.from(jobAssignments.entries())
            .filter(([_, d]) => d === dateStr)
            .map(([id]) => jobs.find(j => j.id === id))
            .filter(Boolean);
          const scheduledJobsForDay = jobs.filter(j => j.date === dateStr && j.status === 'scheduled' && (!jobAssignments.has(j.id) || jobAssignments.get(j.id) === dateStr));
          // Remove the dragged job from both lists (will insert at new slot)
          const filteredJobs = [...scheduledJobsForDay, ...assignedJobs].filter(j => j && j.id !== draggedJobId);
          // Insert the dragged job at the target slot
          filteredJobs.splice(targetSlot, 0, job);
          // Build new slot map for this day
          const newMap = new Map(prev);
          filteredJobs.forEach((j, idx) => {
            newMap.set(j.id, idx);
          });
          return newMap;
        });
      }
      setDraggedJobId(null);
    }
    setDragOverDay(null);
    setDragOverSlot(null);
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
    setJobTimeSlots(prev => {
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
    
    // Find the time slot first (more specific)
    const timeSlot = element?.closest('[data-time-slot]');
    if (timeSlot) {
      const dayCard = timeSlot.closest('[data-day-card]');
      const dateStr = dayCard?.getAttribute('data-date');
      const slotIndex = timeSlot.getAttribute('data-slot-index');
      if (dateStr && slotIndex !== null) {
        setDragOverDay(dateStr);
        setDragOverSlot({ date: dateStr, slot: parseInt(slotIndex) });
        return;
      }
    }
    
    // Fallback to day card
    const dayCard = element?.closest('[data-day-card]');
    if (dayCard) {
      const dateStr = dayCard.getAttribute('data-date');
      if (dateStr) {
        setDragOverDay(dateStr);
        setDragOverSlot(null);
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
    
    // Find the time slot first (more specific)
    const timeSlot = element?.closest('[data-time-slot]');
    if (timeSlot) {
      const dayCard = timeSlot.closest('[data-day-card]');
      const dateStr = dayCard?.getAttribute('data-date');
      const slotIndexStr = timeSlot.getAttribute('data-slot-index');
      
      if (dateStr && slotIndexStr !== null && touchDraggedJobId) {
        const slotIndex = parseInt(slotIndexStr);
        const job = jobs.find(j => j.id === touchDraggedJobId);
        const originalDate = originalJobDates.current.get(touchDraggedJobId);
        
        if (job) {
          // Update job assignment for the new date
          setJobAssignments(prev => {
            const newMap = new Map(prev);
            if (originalDate === dateStr) {
              newMap.delete(touchDraggedJobId);
            } else {
              newMap.set(touchDraggedJobId, dateStr);
            }
            return newMap;
          });
          
          // Update time slot assignment
          setJobTimeSlots(prev => {
            const newMap = new Map(prev);
            newMap.set(touchDraggedJobId, slotIndex);
            return newMap;
          });
        }
      }
      
      setTouchDraggedJobId(null);
      setDraggedJobId(null);
      setDragOverDay(null);
      setDragOverSlot(null);
      document.body.style.overflow = '';
      return;
    }
    
    // Fallback to day card (no specific time slot)
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
    setDragOverSlot(null);
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
                    const timeSlot = jobTimeSlots.get(jobId);
                    if (job) {
                      await onRescheduleJob(jobId, newDateStr, timeSlot);
                      originalJobDates.current.set(jobId, newDateStr);
                    }
                  }
                  
                  setJobAssignments(new Map());
                  setJobTimeSlots(new Map());
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
                  
                  // Get weather for this day and previous day - IMPORTANT: index matches the day iteration
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
                  const isBeingDraggedOver = dragOverDay === dateStr;
                  
                  // Helper function to get border color based on weather
                  const getBorderColorForWeather = (precipitation: number, description: string, rainAmount?: number) => {
                    const desc = description.toLowerCase();
                    const amount = rainAmount || 0;
                    
                    // Heavy rain, thunderstorm - DARK BLUE (Cannot mow)
                    if (desc.includes('thunder') || desc.includes('storm') || desc.includes('heavy') || amount > 3 || precipitation >= 70) {
                      return 'rgb(29, 78, 216)'; // blue-700 - Cannot mow - More vibrant
                    }
                    
                    // Moderate rain - MEDIUM BLUE (Risky to mow)
                    if (amount > 1 || precipitation >= 60 || desc.includes('rain')) {
                      return 'rgb(37, 99, 235)'; // blue-600 - Risky - More vibrant
                    }
                    
                    // Light drizzle - LIGHT BLUE (Can mow)
                    if (amount > 0 || precipitation >= 30 || desc.includes('drizzle')) {
                      return 'rgb(96, 165, 250)'; // blue-400 - Can mow after - More vibrant
                    }
                    
                    // Cloudy - GRAY (Can mow)
                    if (desc.includes('cloud')) {
                      return 'rgb(156, 163, 175)'; // gray-400 - Can mow - Stronger gray
                    }
                    
                    // Clear/sunny - BRIGHT YELLOW (Perfect for mowing)
                    return 'rgb(234, 179, 8)'; // yellow-500 - Perfect - More vibrant
                  };
                  
                  // Generate border gradient based on weather progression
                  const borderGradient = weatherForDay?.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0
                    ? weatherForDay.hourlyForecasts.map((h, idx) => {
                        const effectiveRain = Math.max(h.precipitation, rainChance);
                        const color = getBorderColorForWeather(effectiveRain, h.description, h.rainAmount);
                        return `${color} ${(idx / (weatherForDay.hourlyForecasts!.length - 1)) * 100}%`;
                      }).join(', ')
                    : (() => {
                        // Fallback: solid border based on daily rain chance
                        return getBorderColorForWeather(rainChance, weatherForDay?.description || 'clear sky');
                      })();
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      onDragOver={(e) => handleDayCardDragOver(e, dateStr)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      className={`transition-all duration-200 overflow-hidden relative ${
                        isBeingDraggedOver
                          ? 'scale-[1.02] shadow-2xl ring-4 ring-blue-400 ring-opacity-50'
                          : 'shadow-sm'
                      }`}
                      style={{
                        background: weatherForDay?.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0
                          ? `linear-gradient(to bottom, ${weatherForDay.hourlyForecasts.map((h, idx) => {
                              const desc = h.description.toLowerCase();
                              const effectiveRain = Math.max(h.precipitation, rainChance);
                              const amount = h.rainAmount || 0;
                              // More vibrant background colors for better gradient visibility
                              let color = 'rgb(254, 249, 195)'; // yellow-100 for clear - More vibrant
                              // Heavy rain/thunderstorm - BLUE background (Cannot mow)
                              if (desc.includes('thunder') || desc.includes('storm') || amount > 3 || effectiveRain >= 70) {
                                color = 'rgb(147, 197, 253)'; // blue-300 - Clearly bad weather - More vibrant
                              }
                              // Moderate to heavy rain - LIGHT BLUE background (Risky)
                              else if (amount > 1 || effectiveRain >= 60 || desc.includes('rain')) {
                                color = 'rgb(191, 219, 254)'; // blue-200 - Rainy - More vibrant
                              }
                              // Light drizzle or cloudy - PALE BLUE/GRAY background (Can mow)
                              else if (amount > 0 || effectiveRain >= 30 || desc.includes('drizzle') || desc.includes('cloud')) {
                                color = 'rgb(229, 231, 235)'; // gray-200 - Light rain/cloudy - More visible
                              }
                              return `${color} ${(idx / (weatherForDay.hourlyForecasts!.length - 1)) * 100}%`;
                            }).join(', ')})`
                          : (() => {
                              // Fallback: solid color based on daily rain chance
                              let bgColor = 'rgb(254, 249, 195)'; // yellow-100 for clear
                              if (rainChance >= 60) {
                                bgColor = 'rgb(191, 219, 254)'; // blue-200 for rain
                              } else if (rainChance >= 30) {
                                bgColor = 'rgb(229, 231, 235)'; // gray-200 for cloudy
                              }
                              return bgColor;
                            })(),
                        border: '3px solid transparent',
                        borderImage: `linear-gradient(to bottom, ${borderGradient}) 1`
                      }}
                    >
                      {/* Day Header - Compact single line */}
                      <div className="px-3 py-2 flex items-center justify-between bg-white">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-start">
                            <div className="font-semibold text-sm text-gray-900">{dayName}</div>
                            <div className="text-xs text-gray-600">{dayDate}</div>
                          </div>
                          {/* Job Count */}
                          <div className="text-[11px] font-semibold text-gray-700">
                            {totalJobs} job{totalJobs !== 1 ? 's' : ''}
                          </div>
                        </div>
                        
                        {/* Rain Chance Badge - Top right corner */}
                        {weatherForDay && rainChance > 0 && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {rainChance}%
                          </div>
                        )}
                      </div>

                      {/* Main Content: Day Schedule (left) + Night Weather (right) */}
                      <div className="grid grid-cols-[1fr_auto] gap-0">
                        {/* Left: Job Count & Jobs List with day weather icons (5am-6pm) */}
                        <div className="px-1 py-2 bg-gray-50/50 relative min-h-[280px] border-r border-gray-200">
                          
                          <div className="relative z-10">
                            {/* 5am Weather Symbol with Start Time Selector */}
                            <div className="flex items-center gap-1 mb-1">
                              {weatherForDay && (() => {
                                const forecast = weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts[0]
                                  ? weatherForDay.hourlyForecasts[0]
                                  : { description: weatherForDay.description, precipitation: rainChance, rainAmount: 0 };
                                
                                const effectivePrecipitation = Math.max(forecast.precipitation, rainChance);
                                const { Icon: HourIcon, color: hourColor } = getWeatherIcon(
                                  forecast.description, 
                                  effectivePrecipitation,
                                  forecast.rainAmount
                                );
                                
                                return (
                                  <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                                    <HourIcon className={`w-6 h-6 ${hourColor} stroke-[1.5]`} />
                                    <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">5 AM</span>
                                  </div>
                                );
                              })()}
                              <div className="flex-1 flex items-center justify-center gap-1">
                                <span className="text-[10px] text-gray-500">Start:</span>
                                <select
                                  value={dayStartTimes.get(dateStr) || 6}
                                  onChange={(e) => {
                                    const newStartTime = parseInt(e.target.value);
                                    setDayStartTimes(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(dateStr, newStartTime);
                                      return newMap;
                                    });
                                    // Move jobs in now-hidden slots to the first visible slot
                                    setJobTimeSlots(prev => {
                                      const minSlotIndex = newStartTime - 6;
                                      const newMap = new Map(prev);
                                      // Find jobs in this day with slot < minSlotIndex
                                      for (const [jobId, slot] of prev.entries()) {
                                        const job = jobs.find(j => j.id === jobId && (j.date === dateStr || jobAssignments.get(j.id) === dateStr));
                                        if (job && slot < minSlotIndex) {
                                          // Find first available visible slot
                                          let found = false;
                                          for (let i = minSlotIndex; i < 13; i++) {
                                            if (![...newMap.entries()].some(([otherId, otherSlot]) => otherId !== jobId && otherSlot === i)) {
                                              newMap.set(jobId, i);
                                              found = true;
                                              break;
                                            }
                                          }
                                          // If no slot found, just set to minSlotIndex
                                          if (!found) newMap.set(jobId, minSlotIndex);
                                        }
                                      }
                                      return newMap;
                                    });
                                    // Notify parent component of start time change
                                    onStartTimeChange?.(dateStr, newStartTime);
                                  }}
                                  className="text-[11px] border border-gray-300 rounded px-1 py-0.5 bg-white"
                                >
                                  {Array.from({ length: 13 }, (_, i) => {
                                    const hour = 6 + i;
                                    const label = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                    return (
                                      <option key={hour} value={hour}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            </div>

                            {/* Time Slot Schedule: 6am-6pm with drag-and-drop */}
                            {(() => {
                              // Generate hourly time slots from 6am to 6pm (13 hours)
                              const timeSlots = Array.from({ length: 13 }, (_, i) => {
                                const hour = 6 + i;
                                const timeLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                return { hour, timeLabel, slotIndex: i };
                              });
                              
                              // Get all jobs for this day
                              const allJobs = [...scheduledJobsForDay, ...assignedJobs];
                              
                              // Get start time for this day (default to 6am)
                              const dayStartHour = dayStartTimes.get(dateStr) || 6;
                              const minSlotIndex = dayStartHour - 6; // Convert hour to slot index (6am = slot 0)
                              
                              // Check if we're dragging over this day
                              const isDraggingOverThisDay = dragOverSlot?.date === dateStr && draggedJobId;
                              const dragTargetSlot = isDraggingOverThisDay ? dragOverSlot.slot : -1;
                              
                              // Map jobs to their time slots, accounting for drag-and-drop preview
                              const jobsBySlot: { [key: number]: typeof allJobs[0] } = {};
                              allJobs.forEach(job => {
                                // Skip the dragged job itself - we'll handle it separately
                                if (job.id === draggedJobId) return;
                                
                                const assignedSlot = jobTimeSlots.get(job.id);
                                if (assignedSlot !== undefined && assignedSlot >= minSlotIndex) {
                                  let targetSlot = assignedSlot;
                                  
                                  // If dragging over this day, shift jobs to make space
                                  if (isDraggingOverThisDay && assignedSlot >= dragTargetSlot) {
                                    targetSlot = assignedSlot + 1;
                                  }
                                  
                                  jobsBySlot[targetSlot] = job;
                                } else {
                                  // If no specific time slot assigned, place sequentially starting from start time
                                  for (let i = minSlotIndex; i < 13; i++) {
                                    let checkSlot = i;
                                    
                                    // If dragging, adjust for the insertion point
                                    if (isDraggingOverThisDay && i >= dragTargetSlot) {
                                      checkSlot = i + 1;
                                    }
                                    
                                    if (!jobsBySlot[checkSlot]) {
                                      jobsBySlot[checkSlot] = job;
                                      break;
                                    }
                                  }
                                }
                              });
                              
                              // If dragging over this day, place the dragged job at the target slot
                              if (isDraggingOverThisDay) {
                                const draggedJob = jobs.find(j => j.id === draggedJobId);
                                if (draggedJob) {
                                  jobsBySlot[dragTargetSlot] = draggedJob;
                                }
                              }
                              
                              return (
                                <div className="space-y-1 relative h-[468px] flex flex-col justify-between">
                                {timeSlots.map((slot) => {
                                  const jobInSlot = jobsBySlot[slot.slotIndex];
                                  const isSlotHovered = dragOverSlot?.date === dateStr && dragOverSlot?.slot === slot.slotIndex;
                                  
                                  // Show weather icon at 8am, 11am, 2pm, 5pm (every 3 hours, excluding 6pm)
                                  const shouldShowWeatherIcon = weatherForDay && [8, 11, 14, 17].includes(slot.hour);
                                  
                                  // Get weather icon component for this hour
                                  const getWeatherForHour = () => {
                                    if (!shouldShowWeatherIcon) return null;
                                    
                                    // Map hour to forecast index
                                    const forecastIdx = slot.hour <= 8 ? 0 : slot.hour <= 14 ? 1 : slot.hour <= 17 ? 2 : 3;
                                    const forecast = weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts[forecastIdx]
                                      ? weatherForDay.hourlyForecasts[forecastIdx]
                                      : { description: weatherForDay.description, precipitation: rainChance, rainAmount: 0 };
                                    
                                    const effectivePrecipitation = Math.max(forecast.precipitation, rainChance);
                                    const { Icon: HourIcon, color: hourColor } = getWeatherIcon(
                                      forecast.description, 
                                      effectivePrecipitation,
                                      forecast.rainAmount
                                    );
                                    
                                    const timeLabel = slot.hour > 12 ? `${slot.hour - 12} PM` : slot.hour === 12 ? '12 PM' : `${slot.hour} AM`;
                                    
                                    return (
                                      <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                                        <HourIcon className={`w-6 h-6 ${hourColor} stroke-[1.5]`} />
                                        <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
                                          {timeLabel}
                                        </span>
                                      </div>
                                    );
                                  };
                                  
                                  // All slots are always visible and active
                                  return (
                                    <div 
                                      key={slot.slotIndex}
                                      className="relative min-h-[38.5px] h-[38.5px] flex items-center"
                                      data-time-slot="true"
                                      data-slot-index={slot.slotIndex}
                                      onDragOver={(e) => handleDragOver(e, dateStr, slot.slotIndex)}
                                      onDrop={(e) => handleSlotDrop(e, dateStr, slot.slotIndex)}
                                    >
                                      <div className="flex items-center gap-1 w-full h-full">
                                        {/* Show weather icon with time, or just empty space for alignment */}
                                        {shouldShowWeatherIcon ? getWeatherForHour() : (
                                          <div className="w-10 shrink-0"></div>
                                        )}
                                        
                                        {/* Job card or empty drop zone */}
                                        {jobInSlot ? (() => {
                                          const customer = customers.find(c => c.id === jobInSlot.customerId);
                                          const isScheduled = scheduledJobsForDay.some(j => j.id === jobInSlot.id);
                                          const isAssigned = assignedJobs.some(j => j.id === jobInSlot.id);
                                          const isDraggedItem = jobInSlot.id === draggedJobId;
                                          
                                          return (
                                            <div
                                              draggable={!isDraggedItem}
                                              onDragStart={() => !isDraggedItem && handleDragStart(jobInSlot.id)}
                                              onTouchStart={(e) => !isDraggedItem && handleTouchStart(e, jobInSlot.id)}
                                              onTouchMove={handleTouchMove}
                                              onTouchEnd={handleTouchEnd}
                                              className={`flex-1 rounded px-3 py-2 transition-all text-xs group min-h-[40px] h-[40px] overflow-hidden flex items-center ${
                                                isDraggedItem
                                                  ? 'bg-blue-50 border-2 border-blue-400 border-dashed opacity-60'
                                                  : isAssigned
                                                  ? 'bg-gray-100 border-2 border-gray-400 animate-pulse cursor-move hover:shadow-md'
                                                  : 'bg-white border border-gray-300 cursor-move hover:shadow-md'
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-semibold text-gray-900 truncate w-full">
                                                    {customer?.name}
                                                  </div>
                                                  {isDraggedItem && (
                                                    <div className="text-xs text-blue-600 font-medium mt-0.5 italic">
                                                      Drop to confirm...
                                                    </div>
                                                  )}
                                                  {!isDraggedItem && isAssigned && (
                                                    <div className="text-xs text-gray-700 font-medium mt-0.5 italic">
                                                      Moving here...
                                                    </div>
                                                  )}
                                                  {!isDraggedItem && !isAssigned && (
                                                    <div className="text-xs text-gray-600 truncate">
                                                      ${customer?.price} • 60 min
                                                    </div>
                                                  )}
                                                </div>
                                                {isScheduled && !isDraggedItem && (
                                                  <button
                                                    onClick={() => unassignJob(jobInSlot.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity shrink-0 w-4 h-4 flex items-center justify-center"
                                                    title="Remove"
                                                  >
                                                    ✕
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })() : (
                                          <div 
                                            className={`flex-1 border border-dashed rounded p-2 text-center text-[10px] transition-opacity ${
                                              isSlotHovered 
                                                ? 'opacity-100 border-blue-500 text-blue-600' 
                                                : 'opacity-0 hover:opacity-100 border-gray-300 text-gray-400'
                                            }`}
                                          >
                                            Drop job here
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right: Night Weather (8pm, 11pm, 2am) aligned with day rows */}
                      <div className="bg-slate-800 px-1 py-2 min-h-[280px] w-[50px]">
                        <div className="mb-1 h-[24px]"></div>
                        
                        {/* Night weather icons aligned with specific day time slots */}
                        {weatherForDay && (() => {
                          // Create array matching day schedule structure (13 slots for 6am-6pm)
                          const nightSlots = Array.from({ length: 13 }, (_, i) => {
                            const dayHour = 6 + i; // 6am to 6pm
                            // Show night weather at: 8am slot (8pm), 11am slot (11pm), 2pm slot (2am)
                            if (dayHour === 8) return { show: true, label: '8 PM' };
                            if (dayHour === 11) return { show: true, label: '11 PM' };
                            if (dayHour === 14) return { show: true, label: '2 AM' };
                            return { show: false };
                          });
                          
                          const forecastIdx = 3; // Use evening/night forecast
                          const forecast = weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts[forecastIdx]
                            ? weatherForDay.hourlyForecasts[forecastIdx]
                            : { description: weatherForDay.description, precipitation: rainChance, rainAmount: 0 };
                          
                          const effectivePrecipitation = Math.max(forecast.precipitation, rainChance);
                          const { Icon: NightIcon, color: nightColor } = getWeatherIcon(
                            forecast.description, 
                            effectivePrecipitation,
                            forecast.rainAmount
                          );
                          
                          return (
                            <div className="space-y-1">
                              {nightSlots.map((slot, idx) => (
                                <div key={idx} className="h-[40px] flex items-center justify-center">
                                  {slot.show && (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <NightIcon className={`w-6 h-6 ${nightColor} stroke-[1.5]`} />
                                      <span className="text-[10px] text-slate-300 font-medium whitespace-nowrap">
                                        {slot.label}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
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
            <div className="rounded-lg p-2 bg-blue-500 border-2 border-blue-600 shadow-2xl text-xs min-w-[120px] flex flex-col items-start"
                 style={{ minWidth: 120 }}>
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
