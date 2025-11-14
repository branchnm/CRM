import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { Job, Customer, CustomerGroup } from '../App';
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
  Moon,
  Sunrise,
  Sunset,
  CloudSnow,
  CloudDrizzle,
  CloudRainWind,
  Route,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Calendar,
  X
} from 'lucide-react';
import { 
  getWeatherData, 
  getCoordinatesFromAddress, 
  getCurrentLocation, 
  getLocationName,
  type WeatherData,
  type Coordinates 
} from '../services/weather';
import { getAddressSuggestions, type AddressSuggestion } from '../services/placesAutocomplete';
import { 
  saveTodaysWeather, 
  getHistoricalWeather, 
  ensureHistoricalWeatherData 
} from '../services/weatherHistory';
import { toast } from 'sonner';

// Debounce helper function
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface WeatherForecastProps {
  jobs?: Job[];
  customers?: Customer[];
  customerGroups?: CustomerGroup[]; // NEW: Array of customer groups
  onRescheduleJob?: (jobId: string, newDate: string, timeSlot?: number) => void;
  onUpdateJobTimeSlot?: (jobId: string, timeSlot: number) => void;
  onUpdateJobTime?: (jobId: string, estimatedMinutes: number) => void; // NEW: Update estimated time
  onStartTimeChange?: (date: string, startHour: number) => void;
  onOptimizeRoute?: () => void;
  optimizationStatus?: 'idle' | 'optimizing' | 'optimized';
  onOptimizationStatusChange?: (status: 'idle' | 'optimizing' | 'optimized') => void;
  startingAddress?: string;
  onStartingAddressChange?: (address: string) => void;
  onLocationChange?: (locationName: string, zipCode: string) => void;
  onEditAddress?: () => void;
  onCancelEditAddress?: () => void;
  onCloseAddressEditor?: () => void; // Close without reverting
  isEditingAddress?: boolean;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

export function WeatherForecast({ 
  jobs = [], 
  customers = [], 
  customerGroups = [], // NEW: Customer groups
  onRescheduleJob, 
  onUpdateJobTime, // NEW
  onStartTimeChange, 
  onOptimizeRoute, 
  optimizationStatus = 'idle',
  onOptimizationStatusChange,
  startingAddress = '', 
  onStartingAddressChange, 
  onLocationChange, 
  onEditAddress,
  onCancelEditAddress,
  onCloseAddressEditor,
  isEditingAddress: isEditingAddressProp,
  scrollToTodayRef
}: WeatherForecastProps) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [historicalWeatherCache, setHistoricalWeatherCache] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(() => {
    const saved = localStorage.getItem('weatherLocation');
    return saved ? JSON.parse(saved) : null;
  });
  const [locationName, setLocationName] = useState<string>(() => {
    return localStorage.getItem('weatherLocationName') || '';
  });
  const [addressInput, setAddressInput] = useState(() => {
    return localStorage.getItem('weatherLocationName') || localStorage.getItem('routeStartingAddress') || '';
  });
  const [streetAddress, setStreetAddress] = useState(() => localStorage.getItem('routeStreetAddress') || '');
  const [addressSaved, setAddressSaved] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  // Note: isEditingAddress is now passed as a prop (isEditingAddressProp) from parent
  const addressInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const forecastScrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToTodayRef = useRef(false); // Track if we've scrolled to today on initial load
  const [userGPSLocation, setUserGPSLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [jobAssignments, setJobAssignments] = useState<Map<string, string>>(new Map()); // jobId -> date mapping
  const [jobTimeSlots, setJobTimeSlots] = useState<Map<string, number>>(new Map()); // jobId -> timeSlot (0-11 for 6am-6pm)
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, -1 = yesterday, 1 = tomorrow, etc.
  
  // Track jobs being dragged as a group
  const [draggedGroupJobs, setDraggedGroupJobs] = useState<string[]>([]); // Array of job IDs in the dragged group
  
  // Undo functionality - store last action
  const [lastAction, setLastAction] = useState<{
    type: 'move';
    jobId: string;
    fromDate: string;
    toDate: string;
    timeSlot?: number;
  } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  
  // Touch swipe detection for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const previousDayOffset = useRef(dayOffset);
  
  // Desktop horizontal scroll state
  const [desktopScrollLeft, setDesktopScrollLeft] = useState(0);
  const [isDesktopScrolling, setIsDesktopScrolling] = useState(false);
  const desktopScrollTimeout = useRef<number | undefined>(undefined);
  const [isTodayCardVisible, setIsTodayCardVisible] = useState(true);
  
  // Track tutorial dismissal - show only once for first-time users
  const [showTutorialBanner, setShowTutorialBanner] = useState(() => {
    const dismissed = localStorage.getItem('tutorialDismissed');
    return dismissed !== 'true';
  });

  // Track job changes to show/hide optimize button
  const [lastOptimizedJobState, setLastOptimizedJobState] = useState<string>('');
  const [hasJobChanges, setHasJobChanges] = useState(false);

  // Calculate number of visible day cards based on viewport width
  const [visibleCardCount, setVisibleCardCount] = useState(3);
  const [forecastContainerWidth, setForecastContainerWidth] = useState<number>(0);

  // Scroll to top of page - simple and consistent
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Scroll to today function - exposed via ref for nav bar button
  const scrollToToday = useCallback(() => {
    setDayOffset(0); // Reset offset to show today
    
    if (isMobile) {
      // Mobile: just scroll to top
      scrollToTop();
    } else {
      // Desktop: scroll the forecast container to the Today card
      if (forecastScrollContainerRef.current) {
        const todayCard = forecastScrollContainerRef.current.querySelector('[data-date="' + new Date().toLocaleDateString('en-CA') + '"]');
        if (todayCard) {
          todayCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        } else {
          // If Today card not in DOM yet, scroll to start
          forecastScrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        }
      }
      scrollToTop();
    }
  }, [scrollToTop, isMobile]);

  // Expose scrollToToday function via ref
  useEffect(() => {
    if (scrollToTodayRef) {
      scrollToTodayRef.current = scrollToToday;
    }
  }, [scrollToToday, scrollToTodayRef]);

  // Handler to dismiss tutorial banner
  const dismissTutorial = useCallback(() => {
    setShowTutorialBanner(false);
    localStorage.setItem('tutorialDismissed', 'true');
  }, []);

  // Debounce address input to reduce API calls
  const debouncedAddressInput = useDebounce(addressInput, 500); // 500ms delay

  // Detect if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate how many full day cards can fit in the viewport
  useEffect(() => {
    const calculateVisibleCards = () => {
      if (isMobile) {
        setVisibleCardCount(1);
        setForecastContainerWidth(window.innerWidth);
        return;
      }

      const cardWidth = 280; // Reduced from 320px to fit 4-5 cards on most screens
      const gapWidth = 20; // Reduced gap from 24px to 20px
      const arrowSpace = 200; // Space for arrows positioned outside (100px each side)
      
      const availableWidth = window.innerWidth - arrowSpace;
      
      // Calculate how many cards can fit: (width + gap) * n - gap <= availableWidth
      // Solving for n: n <= (availableWidth + gap) / (width + gap)
      let maxCards = Math.floor((availableWidth + gapWidth) / (cardWidth + gapWidth));
      
      // Ensure at least 1 card, maximum reasonable is 7-8 cards
      maxCards = Math.max(1, Math.min(maxCards, 8));
      
      // Calculate exact width needed for that many cards
      const totalWidth = (cardWidth * maxCards) + (gapWidth * (maxCards - 1));
      
      setVisibleCardCount(maxCards);
      setForecastContainerWidth(totalWidth);
    };

    calculateVisibleCards();
    window.addEventListener('resize', calculateVisibleCards);
    return () => window.removeEventListener('resize', calculateVisibleCards);
  }, [isMobile]);

  // Custom scroll snap for day cards on mobile
  useEffect(() => {
    if (!isMobile) return;

    let scrollTimeout: number;
    let isScrolling = false;
    let scrollStartY = 0;
    let lastScrollY = window.scrollY;

    const handleTouchStartCapture = (e: TouchEvent) => {
      scrollStartY = window.scrollY;
      isScrolling = false;
    };

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      // User is actively scrolling
      if (Math.abs(scrollDelta) > 1) {
        isScrolling = true;
      }

      // Clear any pending snap
      clearTimeout(scrollTimeout);

      // Wait for scrolling to stop
      scrollTimeout = window.setTimeout(() => {
        if (!isScrolling) return;
        isScrolling = false;

        // Find all day cards
        const dayCards = document.querySelectorAll('.forecast-day-card');
        if (dayCards.length === 0) return;

        const viewportHeight = window.innerHeight;
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + viewportHeight;
        const snapThreshold = viewportHeight * 0.7; // Snap if card is within 70% of viewport

        let closestCard: HTMLElement | null = null;
        let closestDistance = Infinity;

        // Find the card that has 75%+ visible and is closest to center
        dayCards.forEach((card) => {
          const cardElement = card as HTMLElement;
          const rect = cardElement.getBoundingClientRect();
          const cardTop = rect.top + window.scrollY;
          const cardBottom = cardTop + rect.height;
          
          // Calculate how much of the card is visible
          const visibleTop = Math.max(cardTop, viewportTop);
          const visibleBottom = Math.min(cardBottom, viewportBottom);
          const visibleHeight = Math.max(0, visibleBottom - visibleTop);
          const visibilityPercent = (visibleHeight / rect.height) * 100;

          // Only consider cards with 75% or more visible
          if (visibilityPercent >= 75) {
            const cardCenter = cardTop + (rect.height / 2);
            const viewportCenter = window.scrollY + (viewportHeight / 2);
            const distance = Math.abs(cardCenter - viewportCenter);

            if (distance < closestDistance) {
              closestDistance = distance;
              closestCard = cardElement;
            }
          }
        });

        // Snap to center the closest card if it's within threshold
        if (closestCard !== null && closestDistance < snapThreshold) {
          const cardElement = closestCard as HTMLElement;
          const rect = cardElement.getBoundingClientRect();
          const cardTop = rect.top + window.scrollY;
          const cardHeight = rect.height;
          
          // Calculate scroll position to center the card in viewport
          const targetScrollY = cardTop - (viewportHeight / 2) + (cardHeight / 2);

          // Smooth scroll to position
          window.scrollTo({
            top: targetScrollY,
            behavior: 'smooth'
          });
        }
      }, 150); // Wait 150ms after scrolling stops
    };

    document.addEventListener('touchstart', handleTouchStartCapture, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStartCapture);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isMobile]);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;
  const swipeDirectionThreshold = 1.5; // Horizontal movement must be 1.5x vertical movement

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
    setSwipeOffset(0);
    setIsTransitioning(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const currentTouch = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    };
    setTouchEnd(currentTouch);
    
    if (touchStart !== null) {
      const deltaX = currentTouch.x - touchStart.x;
      const deltaY = currentTouch.y - touchStart.y;
      
      // Only update offset if movement is primarily horizontal
      if (Math.abs(deltaX) > Math.abs(deltaY) * swipeDirectionThreshold) {
        setSwipeOffset(deltaX);
        // Prevent vertical scrolling when swiping horizontally
        e.preventDefault();
      } else {
        // Movement is primarily vertical, reset offset to allow normal scrolling
        setSwipeOffset(0);
      }
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;
    
    // Only trigger day change if swipe was primarily horizontal
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * swipeDirectionThreshold;
    
    if (isHorizontalSwipe) {
      const isLeftSwipe = deltaX > minSwipeDistance;
      const isRightSwipe = deltaX < -minSwipeDistance;

      if (isLeftSwipe) {
        // Swipe left = next day (day slides in from right)
        setSlideDirection('left');
        setDayOffset(prev => prev + 1);
        setTimeout(() => setSlideDirection(null), 300);
      } else if (isRightSwipe) {
        // Swipe right = previous day (day slides in from left)
        // Allow going back to previous days - extended to 30 days for historical view
        setSlideDirection('right');
        setDayOffset(prev => Math.max(-30, prev - 1)); // Allow up to 30 days in the past
        setTimeout(() => setSlideDirection(null), 300);
      }
    }
    
    // Reset swipe offset with transition
    setSwipeOffset(0);
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  // Check if Today card is visible in viewport
  const checkTodayCardVisibility = useCallback(() => {
    if (!forecastScrollContainerRef.current) return;
    
    const container = forecastScrollContainerRef.current;
    const cards = container.querySelectorAll('.forecast-day-card');
    if (cards.length === 0) return;
    
    // Find the card with today's date
    const todayStr = new Date().toLocaleDateString('en-CA');
    let todayCard: Element | null = null;
    
    cards.forEach((card) => {
      const dateAttr = card.getAttribute('data-date');
      if (dateAttr === todayStr) {
        todayCard = card;
      }
    });
    
    if (!todayCard) {
      setIsTodayCardVisible(false);
      return;
    }
    
    // Check if today card is visible in viewport
    const containerRect = container.getBoundingClientRect();
    const cardRect = (todayCard as HTMLElement).getBoundingClientRect();
    
    // Card is visible if any part of it is within the container's visible area
    const isVisible = cardRect.right > containerRect.left && cardRect.left < containerRect.right;
    setIsTodayCardVisible(isVisible);
  }, []);

  // Desktop horizontal scroll with snap
  const snapToNearestCard = useCallback(() => {
    if (!forecastScrollContainerRef.current || isMobile) return;
    
    const container = forecastScrollContainerRef.current;
    const cards = container.querySelectorAll('.forecast-day-card');
    if (cards.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const containerLeft = containerRect.left;

    let closestCard: Element | null = null;
    let closestDistance = Infinity;
    let closestIndex = 0;

    // Find card whose left edge is closest to container's left edge
    cards.forEach((card, index) => {
      const cardRect = card.getBoundingClientRect();
      const distance = Math.abs(cardRect.left - containerLeft);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCard = card;
        closestIndex = index;
      }
    });

    if (closestCard) {
      const closestElement = closestCard as HTMLElement;
      closestElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      
      // Update dayOffset to match the visible card
      // closestIndex represents which card in the current view is visible
      // We need to update dayOffset to reflect this
      const cardDateStr = closestElement.getAttribute('data-date');
      const todayStr = new Date().toLocaleDateString('en-CA');
      
      if (cardDateStr) {
        const cardDate = new Date(cardDateStr + 'T00:00:00');
        const today = new Date(todayStr + 'T00:00:00');
        const daysDiff = Math.round((cardDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Clamp daysDiff to allowed range: -7 (7 days ago) to 30+ (future)
        const clampedDaysDiff = Math.max(-7, daysDiff);
        
        // Use setTimeout to avoid updating state during render
        setTimeout(() => {
          setDayOffset(clampedDaysDiff);
        }, 0);
      }
    }
  }, [isMobile]); // Removed dayOffset from dependencies to prevent infinite loops

  // Handle desktop scroll with snap
  useEffect(() => {
    if (isMobile || !forecastScrollContainerRef.current) return;

    const container = forecastScrollContainerRef.current;

    const handleScroll = () => {
      setIsDesktopScrolling(true);
      
      // Check if Today card is visible
      checkTodayCardVisibility();
      
      // Clear existing timeout
      if (desktopScrollTimeout.current) {
        clearTimeout(desktopScrollTimeout.current);
      }

      // Set new timeout to detect when scrolling stops
      desktopScrollTimeout.current = window.setTimeout(() => {
        setIsDesktopScrolling(false);
        snapToNearestCard();
        
        // Final check of Today card visibility after snap
        checkTodayCardVisibility();
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (desktopScrollTimeout.current) {
        clearTimeout(desktopScrollTimeout.current);
      }
    };
  }, [isMobile, snapToNearestCard, checkTodayCardVisibility]);

  // Check Today card visibility on mount and when forecast renders
  useEffect(() => {
    if (!isMobile && forecastScrollContainerRef.current) {
      // Delay to ensure DOM is ready
      const timer = setTimeout(() => {
        checkTodayCardVisibility();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMobile, checkTodayCardVisibility, weatherData]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking inside the input or dropdown
      if (
        addressInputRef.current && !addressInputRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setShowAddressSuggestions(false);
      }
    };

    if (showAddressSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAddressSuggestions]);

  // Get user's GPS location on mount to bias address search results
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const gpsData = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          setUserGPSLocation(gpsData);
          console.log('GPS Location acquired:', gpsData, 'Accuracy:', position.coords.accuracy, 'meters');
        },
        (error) => {
          console.log('GPS permission denied or unavailable:', error.message);
          // Silently fail - we'll just not bias the search
        },
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 } // Better accuracy settings
      );
    }
  }, []);

  // Sync addressInput with startingAddress prop ONLY on initial mount
  useEffect(() => {
    if (startingAddress && !addressInput) {
      setAddressInput(startingAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Auto-focus input and clear it when entering edit mode
  useEffect(() => {
    if (isEditingAddressProp && addressInputRef.current) {
      setAddressInput(''); // Clear the input when entering edit mode
      setShowAddressSuggestions(false);
      addressInputRef.current.focus();
    }
  }, [isEditingAddressProp]);

  // Sync jobTimeSlots with jobs order when jobs prop changes (e.g., after optimization)
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;
    console.log('WeatherForecast: Syncing job time slots after jobs update');
    // Group jobs by date
    const jobsByDate = new Map();
    jobs.forEach((job: any) => {
      if (!jobsByDate.has(job.date)) jobsByDate.set(job.date, []);
      jobsByDate.get(job.date).push(job);
    });
    setJobTimeSlots(() => {
      // Start fresh - don't merge with previous state
      const newMap = new Map<string, number>();
      for (const [dateStr, jobsForDate] of jobsByDate.entries()) {
        // Sort jobs by order field (from route optimization) first, then by scheduledTime
        const sorted = [...jobsForDate].sort((a, b) => {
          // Primary sort: by order field if both have it
          if (a.order && b.order) return a.order - b.order;
          // Secondary sort: by scheduledTime if available
          if (a.scheduledTime && b.scheduledTime) {
            return a.scheduledTime.localeCompare(b.scheduledTime);
          }
          return 0;
        });
        sorted.forEach((job, idx) => {
          if (job) newMap.set(job.id, idx);
        });
        console.log(`  ${dateStr}: Sorted ${sorted.length} jobs by order:`, 
          sorted.map(j => ({ name: j.id.substring(0, 8), order: j.order, slot: newMap.get(j.id) }))
        );
      }
      return newMap;
    });
  }, [jobs]);

  // Track job changes to conditionally show optimize button
  useEffect(() => {
    // Create a snapshot of current job state (order and dates)
    const currentJobState = JSON.stringify(
      jobs.map(j => ({ id: j.id, date: j.date, order: j.order, status: j.status }))
        .sort((a, b) => a.id.localeCompare(b.id))
    );
    
    // If we have a last optimized state, compare it
    if (lastOptimizedJobState) {
      const hasChanges = currentJobState !== lastOptimizedJobState;
      setHasJobChanges(hasChanges);
      
      // If there are changes and we're currently optimized, reset to idle
      if (hasChanges && optimizationStatus === 'optimized') {
        onOptimizationStatusChange?.('idle');
      }
    } else {
      // No optimization yet, show button if there are jobs
      setHasJobChanges(jobs.length > 0);
    }
  }, [jobs, lastOptimizedJobState, optimizationStatus, onOptimizationStatusChange]);

  // When optimize completes, save the current job state
  useEffect(() => {
    if (optimizationStatus === 'optimized') {
      const currentJobState = JSON.stringify(
        jobs.map(j => ({ id: j.id, date: j.date, order: j.order, status: j.status }))
          .sort((a, b) => a.id.localeCompare(b.id))
      );
      setLastOptimizedJobState(currentJobState);
      setHasJobChanges(false);
    }
  }, [optimizationStatus, jobs]);

  const [dayStartTimes, setDayStartTimes] = useState<Map<string, number>>(() => {
    const saved = localStorage.getItem('dayStartTimes');
    return saved ? new Map(JSON.parse(saved)) : new Map();
  }); // date -> start hour (6-17 for 6am-5pm)
  
  const [dayEndTimes, setDayEndTimes] = useState<Map<string, number>>(() => {
    const saved = localStorage.getItem('dayEndTimes');
    return saved ? new Map(JSON.parse(saved)) : new Map();
  }); // date -> end hour (8-18 for 8am-6pm)
  
  // Track the last day start/end times when optimized
  const [lastOptimizedDayTimes, setLastOptimizedDayTimes] = useState<string>('');
  
  // Track changes to day start/end times (delay bars)
  useEffect(() => {
    const currentDayTimesState = JSON.stringify({
      startTimes: Array.from(dayStartTimes.entries()),
      endTimes: Array.from(dayEndTimes.entries())
    });
    
    // If we have a last optimized state and times have changed, trigger re-optimization need
    if (lastOptimizedDayTimes && currentDayTimesState !== lastOptimizedDayTimes && optimizationStatus === 'optimized') {
      // Day times changed after optimization - need to re-optimize
      setHasJobChanges(true);
      onOptimizationStatusChange?.('idle');
    }
  }, [dayStartTimes, dayEndTimes, lastOptimizedDayTimes, optimizationStatus, onOptimizationStatusChange]);
  
  // Save day times state when optimization completes
  useEffect(() => {
    if (optimizationStatus === 'optimized') {
      const currentDayTimesState = JSON.stringify({
        startTimes: Array.from(dayStartTimes.entries()),
        endTimes: Array.from(dayEndTimes.entries())
      });
      setLastOptimizedDayTimes(currentDayTimesState);
    }
  }, [optimizationStatus, dayStartTimes, dayEndTimes]);
  
  // Track days with overnight rain from previous night (for visual "wet grass" indicator)
  const [daysWithOvernightRain, setDaysWithOvernightRain] = useState<Set<string>>(new Set());
  
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; slot: number } | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Debug log when dragPosition changes
  useEffect(() => {
    console.log('🔄 DRAG POSITION STATE CHANGED:', dragPosition);
  }, [dragPosition]);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number | null>(null);
  const dragDelayTimeout = useRef<number | null>(null);
  const [touchDraggedJobId, setTouchDraggedJobId] = useState<string | null>(null);
  const originalJobDates = useRef<Map<string, string>>(new Map()); // Track original dates for jobs
  const autoScrollInterval = useRef<number | null>(null);
  // const [isDragging, setIsDragging] = useState(false); // Removed for mobile performance
  
  // Mobile cut/paste mode - better UX than drag on mobile
  const [cutJobId, setCutJobId] = useState<string | null>(null);
  
  // Multi-select mode - hold to select multiple jobs
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const selectionHoldTimeout = useRef<number | null>(null);
  
  const lastTapTime = useRef<number>(0);
  const lastTapJobId = useRef<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  
  // Detect if device supports touch
  const isTouchDevice = useRef(
    'ontouchstart' in window || navigator.maxTouchPoints > 0
  );

  // Desktop drag auto-scroll disabled for mobile performance
  // Touch scrolling works naturally on mobile devices
  
  // Helper function to calculate scheduled time for a job based on its slot
  const getScheduledTimeForJob = (jobId: string, dateStr: string): string => {
    const slot = jobTimeSlots.get(jobId);
    if (slot === undefined) return '';
    
    const dayStartHour = dayStartTimes.get(dateStr) || 5;
    const slotOffset = Math.max(0, dayStartHour - 5);
    const adjustedSlot = slot + slotOffset;
    
    // Calculate hour from slot (slot 0 = 5am)
    const hour = 5 + adjustedSlot;
    
    // Format time
    if (hour > 12) return `${hour - 12} PM`;
    if (hour === 12) return '12 PM';
    return `${hour} AM`;
  };
  
  // Helper function to get weather icon based on description, precipitation, and time of day
  const getWeatherIcon = (description: string, rainChance: number, rainAmount?: number, hour24?: number) => {
    const desc = description.toLowerCase();
    const amount = rainAmount || 0;
    
    // Check for snow
    if (desc.includes('snow') || desc.includes('sleet')) {
      return { Icon: CloudSnow, color: 'text-blue-400' };
    }
    
    // Heavy rain/thunderstorm (>5mm) - DARK BLUE
    if (amount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
      return { Icon: CloudRainWind, color: 'text-blue-800' };
    }
    
    // Moderate rain (1-5mm) - MEDIUM BLUE
    if (amount > 1 || (rainChance >= 60 && desc.includes('rain'))) {
      return { Icon: CloudRain, color: 'text-blue-600' };
    }
    
    // Light drizzle/mist (<1mm) - LIGHT BLUE
    if (amount > 0 || desc.includes('drizzle') || desc.includes('mist')) {
      return { Icon: CloudDrizzle, color: 'text-blue-400' };
    }
    
    // Cloudy (no rain)
    if (desc.includes('cloud') || desc.includes('overcast')) {
      return { Icon: Cloud, color: 'text-gray-500' };
    }
    
    // Clear sky - use time-based icons if hour is provided
    if (hour24 !== undefined) {
      // Night time (9 PM to 5 AM) - show moon
      if (hour24 >= 21 || hour24 < 5) {
        return { Icon: Moon, color: 'text-blue-400' };
      }
      // Sunrise (5 AM to 7 AM) - show sunrise (sun with arrow up)
      else if (hour24 >= 5 && hour24 < 7) {
        return { Icon: Sunrise, color: 'text-yellow-500' };
      }
      // Daytime (7 AM to 5 PM) - show sun
      else if (hour24 >= 7 && hour24 < 17) {
        return { Icon: Sun, color: 'text-yellow-500' };
      }
      // Sunset (5 PM to 9 PM) - show sunset (sun with arrow down)
      else if (hour24 >= 17 && hour24 < 21) {
        return { Icon: Sunset, color: 'text-yellow-500' };
      }
    }
    
    // Default: daytime sun
    return { Icon: Sun, color: 'text-yellow-500' };
  };

  // Helper to check if there was heavy overnight rain (11pm-5am) that would affect morning jobs
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getWeatherGradient = (hourlyForecasts: any[] | undefined) => {
    if (!hourlyForecasts || hourlyForecasts.length === 0) {
      return 'bg-yellow-50'; // Default sunny
    }

    const colors = hourlyForecasts.map(forecast => {
      const desc = forecast.description.toLowerCase();
      const rainAmount = forecast.rainAmount || 0;
      
      // Heavy rain/thunderstorm (>5mm) - VERY DARK BLUE
      if (rainAmount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
        return '#1E3A8A'; // blue-900 - very dark blue for heavy rain
      }
      // Moderate rain (1-5mm) - MEDIUM DARK BLUE  
      else if (rainAmount > 1 || desc.includes('moderate rain')) {
        return '#3B82F6'; // blue-500 - medium blue
      }
      // Light drizzle/mist (<1mm) - LIGHT BLUE
      else if (rainAmount > 0 || desc.includes('drizzle') || desc.includes('mist') || desc.includes('light rain')) {
        return '#93C5FD'; // blue-300 - light blue
      }
      // Overcast/cloudy - light gray
      else if (desc.includes('overcast') || desc.includes('cloud')) {
        return '#E5E7EB'; // gray-200
      }
      // Clear/sunny - light yellow
      else {
        return '#FEF9C3'; // yellow-100
      }
    });

    // Create inline gradient with actual color values
    if (colors.length === 1) {
      return { background: colors[0] };
    } else if (colors.length === 2) {
      return { background: `linear-gradient(to bottom, ${colors[0]}, ${colors[1]})` };
    } else if (colors.length === 3) {
      return { background: `linear-gradient(to bottom, ${colors[0]}, ${colors[1]}, ${colors[2]})` };
    } else if (colors.length >= 4) {
      return { background: `linear-gradient(to bottom, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[3]})` };
    }
    
    return { background: '#FEF9C3' }; // Default yellow
  };

  // Analyze if a day has bad weather (moderate to heavy rain throughout the day)
  const isBadWeatherDay = (dailyWeather: any): boolean => {
    if (!dailyWeather?.hourlyForecasts || dailyWeather.hourlyForecasts.length === 0) {
      return false;
    }

    // Count how many time slots have moderate to heavy rain
    const badWeatherSlots = dailyWeather.hourlyForecasts.filter((forecast: any) => {
      const amount = forecast.rainAmount || 0;
      const desc = forecast.description.toLowerCase();
      
      // Moderate to heavy rain (>1mm) or thunderstorms
      return amount > 1 || desc.includes('thunder') || desc.includes('heavy') || desc.includes('moderate rain');
    });

    // If 75% or more of the day has bad weather, consider it a bad weather day
    return badWeatherSlots.length >= dailyWeather.hourlyForecasts.length * 0.75;
  };

  // Analyze if a day has good weather (clear or light conditions)
  const isGoodWeatherDay = (dailyWeather: any): boolean => {
    if (!dailyWeather?.hourlyForecasts || dailyWeather.hourlyForecasts.length === 0) {
      return false;
    }

    // Count how many time slots have good weather
    const goodWeatherSlots = dailyWeather.hourlyForecasts.filter((forecast: any) => {
      const amount = forecast.rainAmount || 0;
      const desc = forecast.description.toLowerCase();
      
      // Clear, cloudy, or light drizzle only (<1mm)
      return amount <= 1 && !desc.includes('thunder') && !desc.includes('heavy') && !desc.includes('moderate rain');
    });

    // If 75% or more of the day has good weather, consider it a good weather day
    return goodWeatherSlots.length >= dailyWeather.hourlyForecasts.length * 0.75;
  };

  // Generate suggestions for moving jobs from bad weather days to good weather days
  const getWeatherBasedSuggestions = useCallback(() => {
    if (!weatherData?.daily || !jobs || jobs.length === 0) {
      return { moveSuggestions: [], startTimeSuggestions: [] };
    }

    const moveSuggestions: Array<{
      jobId?: string;
      jobIds?: string[];
      jobName?: string;
      jobNames?: string[];
      jobCount?: number;
      currentDate: string;
      suggestedDate: string;
      reason: string;
      weatherSeverity: 'heavy' | 'moderate';
    }> = [];

    const startTimeSuggestions: Array<{
      date: string;
      currentStartTime: number;
      suggestedStartTime: number;
      suggestedEndTime?: number;
      reason: string;
      jobCount: number;
      type?: 'delay' | 'start-early';
      lastGoodHour?: number;
    }> = [];

    // Analyze each day in the forecast (typically 5-7 days from API)
    const forecast = weatherData.daily;

    // Map forecast indices to actual calendar dates (use UTC to avoid timezone issues)
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    
    const forecastDates = forecast.map((_, index) => {
      const date = new Date(year, month, day + index);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD format
    });

    console.log('📅 Forecast date mapping:', forecastDates);

    // Identify bad and good weather days
    const badWeatherDays: string[] = [];
    const goodWeatherDays: string[] = [];
    const partialBadWeatherDays: Map<string, { 
      clearsByHour: number; 
      morningRain: boolean;
      eveningRain?: boolean;
      previousNightRain?: boolean;
      suggestion?: 'delay' | 'start-early';
      lastGoodHour?: number;
    }> = new Map();
    const overnightRainDays = new Set<string>(); // Track days with previous night rain

    forecast.forEach((day, index) => {
      const dateStr = forecastDates[index];

      if (isBadWeatherDay(day)) {
        badWeatherDays.push(dateStr);
        console.log(`❌ BAD WEATHER DAY: ${dateStr}`, day);
      } else if (isGoodWeatherDay(day)) {
        goodWeatherDays.push(dateStr);
        console.log(`✅ GOOD WEATHER DAY: ${dateStr}`, day);
      } else {
        // Check for partial bad weather patterns requiring start time adjustments
        if (day.hourlyForecasts && day.hourlyForecasts.length > 0) {
          // Pattern 1: Morning rain (bad early, good later in day)
          const morningBad = day.hourlyForecasts.slice(0, 2).some((f: any) => {
            const amount = f.rainAmount || 0;
            const desc = f.description.toLowerCase();
            return amount > 0.5 || desc.includes('rain');
          });

          const afternoonGood = day.hourlyForecasts.slice(2).every((f: any) => {
            const amount = f.rainAmount || 0;
            const desc = f.description.toLowerCase();
            return amount <= 1 && !desc.includes('thunder') && !desc.includes('heavy');
          });

          if (morningBad && afternoonGood) {
            // Find when weather clears (less than 1mm rain)
            const clearIndex = day.hourlyForecasts.findIndex((f: any) => {
              const amount = f.rainAmount || 0;
              const desc = f.description.toLowerCase();
              return amount <= 1 && !desc.includes('rain');
            });

            if (clearIndex >= 0) {
              const clearHour = day.hourlyForecasts[clearIndex].hour24 || 14;
              // Add drying time (1-2 hours after rain stops)
              const safeStartHour = Math.min(clearHour + 1, 17); // Don't start later than 5 PM
              
              partialBadWeatherDays.set(dateStr, {
                clearsByHour: safeStartHour,
                morningRain: true,
                eveningRain: false,
                suggestion: 'delay'
              });
              console.log(`⏰ MORNING RAIN (delay start): ${dateStr} - suggest starting at ${safeStartHour}:00`);
            }
          }

          // Pattern 2: Evening rain (good early, bad later in day)
          const morningGood = day.hourlyForecasts.slice(0, 2).every((f: any) => {
            const amount = f.rainAmount || 0;
            const desc = f.description.toLowerCase();
            return amount <= 1 && !desc.includes('thunder') && !desc.includes('heavy');
          });

          const eveningBad = day.hourlyForecasts.slice(-2).some((f: any) => {
            const amount = f.rainAmount || 0;
            const desc = f.description.toLowerCase();
            return amount > 1 || desc.includes('rain');
          });

          if (morningGood && eveningBad && !morningBad) {
            // Find last good hour before rain starts
            const lastGoodIndex = [...day.hourlyForecasts].reverse().findIndex((f: any) => {
              const amount = f.rainAmount || 0;
              const desc = f.description.toLowerCase();
              return amount <= 1 && !desc.includes('rain');
            });

            if (lastGoodIndex >= 0) {
              const actualIndex = day.hourlyForecasts.length - 1 - lastGoodIndex;
              const lastGoodHour = day.hourlyForecasts[actualIndex]?.hour24 || 14;
              // Suggest ending by this hour (or starting earlier to finish before rain)
              
              partialBadWeatherDays.set(dateStr, {
                clearsByHour: 6, // Start early (6 AM)
                morningRain: false,
                eveningRain: true,
                lastGoodHour,
                suggestion: 'start-early'
              });
              console.log(`⏰ EVENING RAIN (start early): ${dateStr} - finish by ${lastGoodHour}:00`);
            }
          }
        }
      }

      // Check previous night's weather (if not the first day)
      if (index > 0) {
        const prevDay = forecast[index - 1];
        if (prevDay?.hourlyForecasts && prevDay.hourlyForecasts.length > 0) {
          // Only check actual late night hours (after 5 PM / 17:00)
          const lateNightForecasts = prevDay.hourlyForecasts.filter((f: any) => {
            const hour = f.hour24 || 0;
            return hour >= 17; // 5 PM or later
          });
          
          // Check if there was ACTUAL heavy rain in late night hours
          const lateNightRain = lateNightForecasts.length > 0 && lateNightForecasts.some((f: any) => {
            const amount = f.rainAmount || 0;
            const desc = f.description.toLowerCase();
            return amount > 3 || desc.includes('heavy') || desc.includes('thunder');
          });

          if (lateNightRain && !partialBadWeatherDays.has(dateStr) && !badWeatherDays.includes(dateStr)) {
            // Heavy rain the night before - grass will be wet in morning
            // Find when it's safe to start (give grass time to dry)
            const dryingHour = 10; // Wait until 10 AM for grass to dry after overnight rain
            
            // Track this day as having overnight rain for visual indicator
            overnightRainDays.add(dateStr);
            
            partialBadWeatherDays.set(dateStr, {
              clearsByHour: dryingHour,
              morningRain: false,
              eveningRain: false,
              previousNightRain: true,
              suggestion: 'delay'
            });
            console.log(`🌙 PREVIOUS NIGHT RAIN: ${dateStr} - heavy rain overnight (${lateNightForecasts.map(f => f.rainAmount).join(', ')}mm), grass wet in morning, suggest starting at ${dryingHour}:00 AM`);
          }
        }
      }
    });

    // Find jobs on bad weather days and suggest moving them (combine by day)
    badWeatherDays.forEach(badDate => {
      const jobsOnBadDay = jobs.filter(j => j.date === badDate && j.status === 'scheduled');
      
      console.log(`Checking bad day ${badDate}: Found ${jobsOnBadDay.length} jobs`, jobsOnBadDay.map(j => ({ id: j.id, date: j.date, customer: customers.find(c => c.id === j.customerId)?.name })));
      
      if (jobsOnBadDay.length > 0) {
        // Determine weather severity
        const dayIndex = forecastDates.indexOf(badDate);
        const dayWeather = forecast[dayIndex];
        
        const hasHeavyRain = dayWeather?.hourlyForecasts?.some((f: any) => 
          (f.rainAmount || 0) > 5 || f.description.toLowerCase().includes('thunder')
        );

        // Calculate workload for each good weather day
        const workloadByDay = new Map<string, number>();
        goodWeatherDays.forEach(goodDay => {
          const jobsOnGoodDay = jobs.filter(j => j.date === goodDay && j.status === 'scheduled').length;
          workloadByDay.set(goodDay, jobsOnGoodDay);
        });

        // Find good weather days after the bad date
        const futureDays = goodWeatherDays.filter(d => d > badDate);
        
        // If no future days, use any good day
        const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;

        // Find the least busy day among candidates
        let suggestedDate = candidateDays[0];
        let minWorkload = workloadByDay.get(suggestedDate) || 0;

        candidateDays.forEach(day => {
          const workload = workloadByDay.get(day) || 0;
          if (workload < minWorkload) {
            minWorkload = workload;
            suggestedDate = day;
          }
        });

        if (suggestedDate) {
          // Create a SINGLE combined suggestion for all jobs on this bad weather day
          const suggestionObj = {
            jobIds: jobsOnBadDay.map(j => j.id), // Array of all job IDs
            jobNames: jobsOnBadDay.map(j => {
              const customer = customers.find(c => c.id === j.customerId);
              return customer ? customer.name : 'Unknown Customer';
            }),
            currentDate: badDate,
            suggestedDate,
            reason: hasHeavyRain 
              ? 'Heavy rain/thunderstorm expected all day'
              : 'Moderate rain expected throughout the day',
            weatherSeverity: hasHeavyRain ? 'heavy' : 'moderate',
            jobCount: jobsOnBadDay.length
          };
          
          console.log(`📌 CREATING COMBINED SUGGESTION for ${jobsOnBadDay.length} jobs on ${badDate}:`, {
            currentDate: badDate,
            suggestedDate: suggestedDate,
            jobCount: jobsOnBadDay.length
          });
          
          moveSuggestions.push(suggestionObj as any);
          
          // Update workload for suggested day
          workloadByDay.set(suggestedDate, (workloadByDay.get(suggestedDate) || 0) + jobsOnBadDay.length);
        }
      }
    });

    // Check partial bad weather days for start time adjustments
    partialBadWeatherDays.forEach((weatherInfo, dateStr) => {
      const jobsOnDay = jobs.filter(j => j.date === dateStr && j.status === 'scheduled');
      
      if (jobsOnDay.length > 0) {
        // Get current start time for this day (default 5 AM = hour 5)
        const currentStartTime = dayStartTimes.get(dateStr) || 5;

        if (weatherInfo.suggestion === 'delay') {
          // Morning rain or previous night rain - delay start time
          if (weatherInfo.clearsByHour > currentStartTime) {
            const reason = weatherInfo.previousNightRain
              ? `Heavy rain overnight. Grass needs time to dry before mowing - safe to start around ${weatherInfo.clearsByHour}:00 AM`
              : weatherInfo.morningRain
              ? `Morning rain expected. Weather clears around ${weatherInfo.clearsByHour - 1}:00, grass needs time to dry`
              : `Rain clearing. Safe to start around ${weatherInfo.clearsByHour}:00 AM`;

            // Calculate how many jobs can fit in the remaining time
            // Time slots from suggestedStartTime to 6 PM (18:00)
            const availableHours = 18 - weatherInfo.clearsByHour; // e.g., 18 - 14 = 4 hours
            const maxJobsAfterDelay = Math.floor(availableHours); // Rough estimate: 1 job per hour
            
            // If we have more jobs than can fit, suggest moving the overflow
            if (jobsOnDay.length > maxJobsAfterDelay) {
              const jobsToMove = jobsOnDay.length - maxJobsAfterDelay;
              
              // Calculate workload for good weather days
              const workloadByDay = new Map<string, number>();
              goodWeatherDays.forEach(goodDay => {
                const jobsOnGoodDay = jobs.filter(j => j.date === goodDay && j.status === 'scheduled').length;
                workloadByDay.set(goodDay, jobsOnGoodDay);
              });
              
              // Find least busy good weather day
              const futureDays = goodWeatherDays.filter(d => d > dateStr);
              const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;
              
              let bestDay = candidateDays[0];
              let minWorkload = workloadByDay.get(bestDay) || 0;
              candidateDays.forEach(day => {
                const workload = workloadByDay.get(day) || 0;
                if (workload < minWorkload) {
                  minWorkload = workload;
                  bestDay = day;
                }
              });
              
              // Suggest moving the overflow jobs - COMBINE into single suggestion
              const jobsToMoveArray = jobsOnDay.slice(-jobsToMove);
              
              moveSuggestions.push({
                jobIds: jobsToMoveArray.map(j => j.id), // Array of all job IDs
                jobNames: jobsToMoveArray.map(j => {
                  const customer = customers.find(c => c.id === j.customerId);
                  return customer ? customer.name : 'Unknown Customer';
                }),
                currentDate: dateStr,
                suggestedDate: bestDay,
                reason: `Not enough time after delaying start to ${weatherInfo.clearsByHour}:00. Only ${maxJobsAfterDelay} job${maxJobsAfterDelay !== 1 ? 's' : ''} can fit.`,
                weatherSeverity: 'moderate',
                jobCount: jobsToMove
              } as any);
              
              workloadByDay.set(bestDay, (workloadByDay.get(bestDay) || 0) + jobsToMove);
            }

            // Only suggest start time adjustment if user hasn't already adjusted it
            // (If currentStartTime >= clearsByHour, they've already accepted the delay)
            if (currentStartTime < weatherInfo.clearsByHour) {
              startTimeSuggestions.push({
                date: dateStr,
                currentStartTime,
                suggestedStartTime: weatherInfo.clearsByHour,
                reason,
                jobCount: Math.min(jobsOnDay.length, maxJobsAfterDelay), // Only jobs that will fit
                type: 'delay'
              });
            }
          }
        } else if (weatherInfo.suggestion === 'start-early') {
          // Evening rain - suggest starting earlier OR moving jobs
          const lastGoodHour = weatherInfo.lastGoodHour || 14;
          
          // Check if user already set a custom end time for this day
          const hasCustomEndTime = dayEndTimes.has(dateStr);
          
          // Calculate how many jobs can fit before rain starts
          // From 6 AM to lastGoodHour
          const availableHours = lastGoodHour - 6;
          const maxJobsBeforeRain = Math.floor(availableHours);
          
          // If we have more jobs than can fit before rain, suggest moving the overflow
          if (jobsOnDay.length > maxJobsBeforeRain) {
            const jobsToMove = jobsOnDay.length - maxJobsBeforeRain;
            
            // Calculate workload for good weather days
            const workloadByDay = new Map<string, number>();
            goodWeatherDays.forEach(goodDay => {
              const jobsOnGoodDay = jobs.filter(j => j.date === goodDay && j.status === 'scheduled').length;
              workloadByDay.set(goodDay, jobsOnGoodDay);
            });
            
            // Find least busy good weather day
            const futureDays = goodWeatherDays.filter(d => d > dateStr);
            const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;
            
            let bestDay = candidateDays[0];
            let minWorkload = workloadByDay.get(bestDay) || 0;
            candidateDays.forEach(day => {
              const workload = workloadByDay.get(day) || 0;
              if (workload < minWorkload) {
                minWorkload = workload;
                bestDay = day;
              }
            });
            
            // Suggest moving the jobs that won't fit - COMBINE into single suggestion
            const jobsToMoveArray = jobsOnDay.slice(-jobsToMove);
            
            moveSuggestions.push({
              jobIds: jobsToMoveArray.map(j => j.id), // Array of all job IDs
              jobNames: jobsToMoveArray.map(j => {
                const customer = customers.find(c => c.id === j.customerId);
                return customer ? customer.name : 'Unknown Customer';
              }),
              currentDate: dateStr,
              suggestedDate: bestDay,
              reason: `Rain starts at ${lastGoodHour}:00. Only ${maxJobsBeforeRain} job${maxJobsBeforeRain !== 1 ? 's' : ''} can be completed before rain.`,
              weatherSeverity: 'moderate',
              jobCount: jobsToMove
            } as any);
            
            workloadByDay.set(bestDay, (workloadByDay.get(bestDay) || 0) + jobsToMove);
          }
          
          // Only suggest end time adjustment if user hasn't already set one
          if (!hasCustomEndTime) {
            startTimeSuggestions.push({
              date: dateStr,
              currentStartTime,
              suggestedStartTime: 6, // Start at 6 AM
              suggestedEndTime: lastGoodHour, // End before rain
              reason: `Rain expected at ${lastGoodHour}:00. Limit work to ${availableHours} hours (6 AM - ${lastGoodHour}:00)`,
              jobCount: Math.min(jobsOnDay.length, maxJobsBeforeRain), // Only jobs that will fit
              lastGoodHour,
              type: 'start-early'
            });
          }
        }
      }
    });

    console.log('📊 WEATHER ANALYSIS COMPLETE:', {
      badWeatherDays,
      goodWeatherDays,
      partialBadWeatherDays: Array.from(partialBadWeatherDays.entries()),
      moveSuggestions,
      startTimeSuggestions
    });

    return { moveSuggestions, startTimeSuggestions, overnightRainDays };
  }, [weatherData, jobs, customers, dayStartTimes, dayEndTimes]);

  // State for weather suggestions
  const [weatherSuggestions, setWeatherSuggestions] = useState<ReturnType<typeof getWeatherBasedSuggestions>>({
    moveSuggestions: [],
    startTimeSuggestions: [],
    overnightRainDays: new Set()
  });
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Update suggestions when weather or jobs change
  useEffect(() => {
    const suggestions = getWeatherBasedSuggestions();
    setWeatherSuggestions(suggestions);
    setDaysWithOvernightRain(suggestions.overnightRainDays || new Set());
    // Always show suggestions when there are any (even if previously dismissed)
    const hasSuggestions = suggestions.moveSuggestions.length > 0 || suggestions.startTimeSuggestions.length > 0;
    if (hasSuggestions) {
      setShowSuggestions(true);
    }
  }, [getWeatherBasedSuggestions]);

  // Accept individual move suggestion (handles both single job and multiple jobs)
  const acceptMoveSuggestion = useCallback((suggestion: any, newDate: string) => {
    if (!onRescheduleJob) return;
    
    // Handle both single job (jobId) and multiple jobs (jobIds)
    const jobIds = suggestion.jobIds || [suggestion.jobId];
    
    jobIds.forEach((jobId: string) => {
      onRescheduleJob(jobId, newDate);
    });
    
    // Remove this suggestion from the list
    setWeatherSuggestions(prev => {
      const updated = {
        moveSuggestions: prev.moveSuggestions.filter(s => {
          // For single job suggestions
          if (s.jobId) return s.jobId !== suggestion.jobId;
          // For combined suggestions
          if (s.jobIds) return s.currentDate !== suggestion.currentDate;
          return true;
        }),
        startTimeSuggestions: prev.startTimeSuggestions,
        overnightRainDays: prev.overnightRainDays || new Set<string>()
      };
      
      // Hide suggestions panel if no suggestions left
      if (updated.moveSuggestions.length === 0 && updated.startTimeSuggestions.length === 0) {
        setShowSuggestions(false);
      }
      
      return updated;
    });
    
    const jobCount = jobIds.length;
    toast.success(`${jobCount} job${jobCount !== 1 ? 's' : ''} rescheduled to better weather day`);
  }, [onRescheduleJob]);

  // Accept individual start time suggestion
  const acceptStartTimeSuggestion = useCallback((date: string, newStartTime: number, newEndTime?: number) => {
    // Update the local dayStartTimes state
    setDayStartTimes(prev => {
      const newMap = new Map(prev);
      newMap.set(date, newStartTime);
      return newMap;
    });
    
    // Update end time if provided (for "End Early" suggestions)
    if (newEndTime !== undefined) {
      setDayEndTimes(prev => {
        const newMap = new Map(prev);
        newMap.set(date, newEndTime);
        return newMap;
      });
    }
    
    // Notify parent component of start time change
    if (onStartTimeChange) {
      onStartTimeChange(date, newStartTime);
    }
    
    // Remove this suggestion from the list
    setWeatherSuggestions(prev => {
      const updated = {
        moveSuggestions: prev.moveSuggestions,
        startTimeSuggestions: prev.startTimeSuggestions.filter(s => s.date !== date),
        overnightRainDays: prev.overnightRainDays || new Set<string>()
      };
      
      // Hide suggestions panel if no suggestions left
      if (updated.moveSuggestions.length === 0 && updated.startTimeSuggestions.length === 0) {
        setShowSuggestions(false);
      }
      
      return updated;
    });
    
    const startLabel = newStartTime > 12 ? `${newStartTime - 12} PM` : newStartTime === 12 ? '12 PM' : `${newStartTime} AM`;
    const endLabel = newEndTime ? (newEndTime > 12 ? `${newEndTime - 12} PM` : newEndTime === 12 ? '12 PM' : `${newEndTime} AM`) : null;
    
    if (endLabel) {
      toast.success(`Schedule adjusted: ${startLabel} - ${endLabel}`);
    } else {
      toast.success(`Start time adjusted to ${startLabel}`);
    }
  }, [onStartTimeChange]);

  // Accept all move suggestions and move jobs
  const acceptAllSuggestions = useCallback(() => {
    // Move jobs to different days
    weatherSuggestions.moveSuggestions.forEach(suggestion => {
      if (onRescheduleJob) {
        // Handle both single job (jobId) and multiple jobs (jobIds)
        const jobIds = suggestion.jobIds || (suggestion.jobId ? [suggestion.jobId] : []);
        jobIds.forEach((jobId) => {
          if (jobId) {
            onRescheduleJob(jobId, suggestion.suggestedDate);
          }
        });
      }
    });

    // Adjust start times for partial bad weather days
    weatherSuggestions.startTimeSuggestions.forEach(suggestion => {
      // Update local start time state
      setDayStartTimes(prev => {
        const newMap = new Map(prev);
        newMap.set(suggestion.date, suggestion.suggestedStartTime);
        return newMap;
      });
      
      // Update end time if provided
      if (suggestion.suggestedEndTime !== undefined) {
        setDayEndTimes(prev => {
          const newMap = new Map(prev);
          newMap.set(suggestion.date, suggestion.suggestedEndTime!);
          return newMap;
        });
      }
      
      // Notify parent
      if (onStartTimeChange) {
        onStartTimeChange(suggestion.date, suggestion.suggestedStartTime);
      }
    });

    const totalChanges = weatherSuggestions.moveSuggestions.length + weatherSuggestions.startTimeSuggestions.length;
    toast.success(`Applied ${totalChanges} weather adjustment${totalChanges !== 1 ? 's' : ''}`);
    setShowSuggestions(false);
  }, [weatherSuggestions, onRescheduleJob, onStartTimeChange]);

  // Dismiss suggestions
  const dismissSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

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
  
  // Save day end times to localStorage
  useEffect(() => {
    localStorage.setItem('dayEndTimes', JSON.stringify(Array.from(dayEndTimes.entries())));
  }, [dayEndTimes]);

  // Load weather based on customer job locations (not starting address)
  useEffect(() => {
    const loadWeatherForCustomerLocations = async () => {
      // Get today's date
      const todayStr = new Date().toLocaleDateString('en-CA');
      
      // Find jobs scheduled for today or the next few days
      const upcomingJobs = jobs.filter(j => {
        if (!j.date) return false;
        const jobDate = new Date(j.date);
        const today = new Date(todayStr);
        const daysDiff = Math.floor((jobDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff < 7; // Next 7 days
      });
      
      if (upcomingJobs.length === 0) {
        console.log('No upcoming jobs found, using stored location or GPS');
        // Fall back to stored location or GPS
        if (location) {
          loadWeather(location);
        }
        return;
      }
      
      // Get the first customer with a job
      const firstJob = upcomingJobs[0];
      const customer = customers.find(c => c.id === firstJob.customerId);
      
      if (customer?.address) {
        console.log('Loading weather for customer location:', customer.address);
        try {
          const coords = await getCoordinatesFromAddress(customer.address);
          if (coords) {
            coords.name = customer.address;
            setLocation(coords);
            localStorage.setItem('weatherLocation', JSON.stringify(coords));
            await loadWeather(coords);
          }
        } catch (error) {
          console.error('Failed to get coordinates for customer address:', error);
          // Fall back to stored location
          if (location) {
            loadWeather(location);
          }
        }
      } else if (location) {
        // No customer address, use stored location
        loadWeather(location);
      }
    };
    
    if (jobs.length > 0 && customers.length > 0) {
      loadWeatherForCustomerLocations();
    }
  }, [jobs, customers]);

  // Load weather on mount if location is set (fallback)
  useEffect(() => {
    if (location && jobs.length === 0) {
      loadWeather(location);
    }
  }, []);

  // Seed localStorage with fake historical data for testing (if no data exists)
  const seedLocalStorageHistoricalData = () => {
    const historicalWeather = JSON.parse(localStorage.getItem('historicalWeather') || '{}');
    
    // Check if we already have historical data
    if (Object.keys(historicalWeather).length > 5) {
      return; // Already seeded
    }
    
    console.log('🌱 Seeding localStorage with fake historical weather data...');
    
    const weatherPatterns = [
      { desc: 'clear sky', icon: '01d', precip: 0, chance: 0 },
      { desc: 'partly cloudy', icon: '02d', precip: 0, chance: 10 },
      { desc: 'scattered clouds', icon: '03d', precip: 0, chance: 15 },
      { desc: 'overcast clouds', icon: '04d', precip: 0.2, chance: 30 },
      { desc: 'light rain', icon: '10d', precip: 2.5, chance: 65 },
      { desc: 'moderate rain', icon: '10d', precip: 5.8, chance: 85 },
    ];
    
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-CA');
      
      const pattern = weatherPatterns[Math.floor(Math.random() * weatherPatterns.length)];
      const baseTempMax = 65 + Math.floor(Math.random() * 20);
      const tempMin = baseTempMax - (10 + Math.floor(Math.random() * 10));
      
      const hourlyForecasts = [8, 11, 14, 17].map(hour => ({
        time: hour <= 12 ? `${hour} AM` : `${hour - 12} PM`,
        temp: tempMin + Math.floor(Math.random() * (baseTempMax - tempMin)),
        precipitation: pattern.chance + Math.floor(Math.random() * 10 - 5),
        icon: pattern.icon,
        description: pattern.desc,
        rainAmount: pattern.precip * (0.5 + Math.random() * 0.5),
        hour24: hour
      }));
      
      historicalWeather[dateStr] = {
        daily: [{
          tempMax: baseTempMax,
          tempMin: tempMin,
          precipitation: pattern.precip,
          precipitationChance: pattern.chance,
          description: pattern.desc,
          icon: pattern.icon,
          windSpeed: 5 + Math.floor(Math.random() * 15),
          humidity: 40 + Math.floor(Math.random() * 40),
          hourlyForecasts
        }],
        location: locationName,
        savedAt: new Date().toISOString()
      };
    }
    
    localStorage.setItem('historicalWeather', JSON.stringify(historicalWeather));
    console.log(`✅ Seeded ${Object.keys(historicalWeather).length} days of historical weather to localStorage`);
  };

  const loadWeather = async (coords: Coordinates) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWeatherData(coords);
      if (data) {
        setWeatherData(data);
        setError(null);
        
        // Get location name if not already set
        let finalLocationName = locationName;
        if (!locationName || !coords.name) {
          const name = await getLocationName(coords.lat, coords.lon);
          finalLocationName = name;
          setLocationName(name);
          localStorage.setItem('weatherLocationName', name);
          // Also set as route starting address
          localStorage.setItem('routeStartingAddress', name);
        } else if (coords.name) {
          finalLocationName = coords.name;
          setLocationName(coords.name);
          localStorage.setItem('weatherLocationName', coords.name);
          // Also set as route starting address
          localStorage.setItem('routeStartingAddress', coords.name);
        }
        
        // Seed localStorage with historical data for testing (if needed)
        seedLocalStorageHistoricalData();
        
        // Extract zipcode from location name
        const zipcode = getZipCode(finalLocationName);
        
        // Save today's weather to Supabase database
        try {
          await saveTodaysWeather(
            finalLocationName,
            zipcode,
            coords.lat,
            coords.lon,
            data
          );
          
          // Also ensure we have historical seed data (only runs if table is empty)
          await ensureHistoricalWeatherData(
            finalLocationName,
            zipcode,
            coords.lat,
            coords.lon
          );
        } catch (dbError) {
          console.error('Failed to save weather to database:', dbError);
          // Don't fail the whole operation if DB save fails
        }
        
        // Also save to localStorage as backup
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const historicalWeather = JSON.parse(localStorage.getItem('historicalWeather') || '{}');
        
        // Store today's weather data with the date as key
        historicalWeather[today] = {
          daily: data.daily,
          location: finalLocationName,
          savedAt: new Date().toISOString()
        };
        
        // Keep only last 30 days of historical data to avoid bloating storage
        const dates = Object.keys(historicalWeather);
        if (dates.length > 30) {
          dates.sort().slice(0, dates.length - 30).forEach(oldDate => {
            delete historicalWeather[oldDate];
          });
        }
        
        localStorage.setItem('historicalWeather', JSON.stringify(historicalWeather));
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

  const handleSaveStreetAddress = () => {
    const trimmed = streetAddress.trim();
    if (!trimmed) {
      toast.error('Please enter a street address');
      return;
    }
    
    localStorage.setItem('routeStreetAddress', trimmed);
    // Build full address for route optimization
    const fullAddress = `${trimmed}, ${locationName}`;
    localStorage.setItem('routeStartingAddress', fullAddress);
    
    // Show confirmation
    setAddressSaved(true);
    toast.success('Starting address saved!');
    
    // Reset confirmation after 2 seconds
    setTimeout(() => setAddressSaved(false), 2000);
  };

  const handleSetAddress = async () => {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      toast.error('Please enter an address');
      return;
    }

    setLoading(true);
    toast.loading('Setting address...', { id: 'set-address' });
    
    try {
      const coords = await getCoordinatesFromAddress(trimmed);
      if (coords) {
        setLocation(coords);
        const displayName = coords.name || trimmed;
        setLocationName(displayName);
        localStorage.setItem('weatherLocation', JSON.stringify(coords));
        localStorage.setItem('weatherLocationName', displayName);
        localStorage.setItem('routeStartingAddress', displayName);
        
        // Update parent component immediately
        if (onLocationChange) {
          const zipCode = getZipCode(displayName) || '';
          onLocationChange(displayName, zipCode);
        }
        
        // Show confirmation
        setAddressSaved(true);
        toast.success(`Address set: ${displayName}`, { id: 'set-address' });
        setTimeout(() => setAddressSaved(false), 2000);
        
        // Hide suggestions
        setShowAddressSuggestions(false);
        
        // Load weather
        await loadWeather(coords);
      }
    } catch (error) {
      console.error('Error setting address:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to set address';
      toast.error(errorMsg, { id: 'set-address' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddressInputChange = async (value: string) => {
    setAddressInput(value);
    setAddressSaved(false);
    // Don't fetch suggestions here - let the debounced effect handle it
  };

  // Fetch address suggestions when debounced input changes
  useEffect(() => {
    const fetchAddressSuggestions = async () => {
      if (debouncedAddressInput.length < 3) {
        setShowAddressSuggestions(false);
        setAddressSuggestions([]);
        return;
      }

      setIsSearchingAddress(true);

      try {
        console.log('Fetching address suggestions for:', debouncedAddressInput);
        
        // Use the new service which handles Nominatim + fallback
        const results = await getAddressSuggestions(
          debouncedAddressInput,
          userGPSLocation || undefined
        );
        
        console.log('Address suggestions received:', results.length);
        
        if (results.length > 0) {
          setAddressSuggestions(results);
          setShowAddressSuggestions(true);
        } else {
          setShowAddressSuggestions(false);
          setAddressSuggestions([]);
        }
      } catch (error) {
        console.error('Error fetching address suggestions:', error);
        setShowAddressSuggestions(false);
        setAddressSuggestions([]);
      } finally {
        setIsSearchingAddress(false);
      }
    };

    fetchAddressSuggestions();
  }, [debouncedAddressInput, userGPSLocation]);

  const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
    console.log('handleSelectSuggestion called with:', suggestion.display_name);
    
    // First, fill in the address and close dropdown
    setAddressInput(suggestion.display_name);
    setShowAddressSuggestions(false);
    setLoading(true);

    try {
      const coords = {
        lat: parseFloat(suggestion.lat),
        lon: parseFloat(suggestion.lon),
        name: suggestion.display_name
      };

      setLocation(coords);
      setLocationName(suggestion.display_name);
      localStorage.setItem('weatherLocation', JSON.stringify(coords));
      localStorage.setItem('weatherLocationName', suggestion.display_name);
      localStorage.setItem('routeStartingAddress', suggestion.display_name);

      console.log('Address saved to localStorage:', suggestion.display_name);

      // Update parent component's starting address and location immediately
      if (onStartingAddressChange) {
        onStartingAddressChange(suggestion.display_name);
        console.log('Parent component notified of address change');
      }
      
      // Update the zipcode button in nav bar immediately
      if (onLocationChange) {
        const zipCode = getZipCode(suggestion.display_name) || '';
        onLocationChange(suggestion.display_name, zipCode);
        console.log('Parent component notified of location change:', zipCode);
      }

      // Show confirmation
      setAddressSaved(true);
      toast.success('Address set successfully!');
      
      // Load weather
      await loadWeather(coords);
      
      // Keep confirmation visible briefly, then trigger optimization
      setTimeout(() => {
        setAddressSaved(false);
        // Trigger route optimization if the callback is available
        if (onOptimizeRoute) {
          onOptimizeRoute();
        }
      }, 1500);
    } catch (error) {
      console.error('Error setting address:', error);
      toast.error('Failed to set address');
      setAddressSaved(false);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to extract street address and zip code from full address
  const getShortAddress = (fullAddress: string) => {
    // Try to extract street address and zip code
    // Format from OpenStreetMap is typically: "Number, Street Name, City, State, Zip, Country"
    // We want: "Number Street Name, Zip"
    const parts = fullAddress.split(',').map(p => p.trim());
    
    // Get the street number and name (first two parts if available)
    let street = '';
    if (parts.length >= 2) {
      // Combine first two parts (street number and street name) without comma
      street = `${parts[0]} ${parts[1]}`;
    } else {
      street = parts[0] || '';
    }
    
    // Try to find zip code (usually 5 digits, possibly with dash and 4 more digits)
    const zipMatch = fullAddress.match(/\b\d{5}(?:-\d{4})?\b/);
    const zip = zipMatch ? zipMatch[0] : '';
    
    if (street && zip) {
      return `${street}, ${zip}`;
    } else if (street) {
      return street;
    }
    
    return fullAddress; // Fallback to full address if parsing fails
  };

  // Helper function to extract just zipcode from address
  const getZipCode = (fullAddress: string) => {
    const zipMatch = fullAddress.match(/\b\d{5}(?:-\d{4})?\b/);
    return zipMatch ? zipMatch[0] : '';
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const recommendations = getWeatherRecommendations();

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    
    // Check if this job is part of a group
    const job = jobs.find(j => j.id === jobId);
    const customer = customers.find(c => c.id === job?.customerId);
    const groupId = customer?.groupId;
    
    console.log('🎯 DRAG START:', {
      jobId,
      customerName: customer?.name,
      currentDate: job?.date,
      groupId: groupId || 'none'
    });
    
    if (groupId) {
      // Find the group details
      const group = customerGroups.find(g => g.id === groupId);
      
      if (group) {
        // Find all jobs for customers in this group on the same date
        const jobDate = job?.date;
        const groupJobs = jobs.filter(j => {
          if (j.date !== jobDate) return false;
          const jobCustomer = customers.find(c => c.id === j.customerId);
          return jobCustomer?.groupId === groupId;
        }).map(j => j.id);
        
        setDraggedGroupJobs(groupJobs);
        console.log('🔷 Dragging group:', group.name, 'with', groupJobs.length, 'jobs');
      } else {
        setDraggedGroupJobs([]);
      }
    } else {
      setDraggedGroupJobs([]);
    }
    
    setDraggedJobId(jobId);
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string, slotIndex?: number) => {
    e.preventDefault();
    // Only set dragOverDay if not already set (prevents flicker)
    if (dragOverDay !== dateStr) {
      setDragOverDay(dateStr);
      console.log('🎯 DRAG OVER NEW DAY:', { date: dateStr });
    }
    // Always set slot for preview
    if (slotIndex !== undefined) {
      setDragOverSlot({ date: dateStr, slot: slotIndex });
      console.log('🎯 DRAG OVER SLOT:', { date: dateStr, slot: slotIndex });
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
  
  // Track mouse movement for drag preview
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedJobId) {
        setDragPosition({ x: e.clientX, y: e.clientY });
        console.log('🖱️ MOUSE MOVE:', { x: e.clientX, y: e.clientY, draggedJobId });
      }
    };

    if (draggedJobId) {
      console.log('✅ MOUSE TRACKING ENABLED for job:', draggedJobId);
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        console.log('❌ MOUSE TRACKING DISABLED');
        window.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [draggedJobId]);

  const handleSlotDrop = async (e: React.DragEvent, dateStr: string, targetSlot: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('📍 SLOT DROP TRIGGERED:', { 
      date: dateStr, 
      slot: targetSlot, 
      draggedJobId, 
      groupJobs: draggedGroupJobs.length,
      hasOnRescheduleJob: !!onRescheduleJob
    });
    
    // Immediately clear drag preview to prevent ghost card
    setDragPosition(null);
    console.log('🧹 DRAG POSITION CLEARED in handleSlotDrop');
    
    if (draggedJobId && onRescheduleJob) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job) {
        // Check if this is a group drag
        if (draggedGroupJobs.length > 1) {
          console.log('🔷 Dropping group of', draggedGroupJobs.length, 'jobs at slot', targetSlot);
          
          // Move all jobs in the group to consecutive slots starting at targetSlot
          for (let i = 0; i < draggedGroupJobs.length; i++) {
            const groupJobId = draggedGroupJobs[i];
            const slotForThisJob = targetSlot + i;
            console.log(`  Moving job ${i + 1}/${draggedGroupJobs.length} to slot ${slotForThisJob}`);
            await onRescheduleJob(groupJobId, dateStr, slotForThisJob);
          }
          
          toast.success(`Moved ${draggedGroupJobs.length} properties`);
        } else if (job.date !== dateStr || !jobTimeSlots.has(draggedJobId) || jobTimeSlots.get(draggedJobId) !== targetSlot) {
          // Single job move (or time slot change on same day)
          console.log('📍 Moving single job to', dateStr, 'slot', targetSlot);
          
          // Save last action for undo
          setLastAction({
            type: 'move',
            jobId: draggedJobId,
            fromDate: job.date,
            toDate: dateStr,
            timeSlot: targetSlot
          });
          
          // Immediately save the change
          await onRescheduleJob(draggedJobId, dateStr, targetSlot);
          
          // Show undo button
          setShowUndo(true);
          setTimeout(() => setShowUndo(false), 5000);
          
          toast.success('Job moved');
        }
      }
      
      setDraggedJobId(null);
      setDraggedGroupJobs([]);
      setDragPosition(null);
    }
    setDragOverSlot(null);
    setDragOverDay(null);
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    
    console.log('🎯 DROP ATTEMPT:', {
      targetDate: dateStr,
      draggedJobId,
      isGroupDrag: draggedGroupJobs.length > 1
    });
    
    // Immediately clear drag preview to prevent ghost card
    setDragPosition(null);
    
    if (draggedJobId) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job && onRescheduleJob) {
        // Check if this is a group drag
        if (draggedGroupJobs.length > 1) {
          console.log('🔷 Dropping group of', draggedGroupJobs.length, 'jobs');
          
          // Move all jobs in the group
          for (const groupJobId of draggedGroupJobs) {
            const timeSlot = jobTimeSlots.get(groupJobId);
            await onRescheduleJob(groupJobId, dateStr, timeSlot);
          }
          
          console.log('✅ GROUP DROP SUCCESS:', { movedJobs: draggedGroupJobs.length, toDate: dateStr });
          toast.success(`Moved ${draggedGroupJobs.length} properties`);
        } else if (job.date !== dateStr) {
          // Single job move
          const timeSlot = jobTimeSlots.get(draggedJobId);
          console.log('✅ SINGLE JOB DROP SUCCESS:', { jobId: draggedJobId, fromDate: job.date, toDate: dateStr, timeSlot });
          
          // Save last action for undo
          setLastAction({
            type: 'move',
            jobId: draggedJobId,
            fromDate: job.date,
            toDate: dateStr,
            timeSlot
          });
          
          // Immediately save the change
          await onRescheduleJob(draggedJobId, dateStr, timeSlot);
          
          // Show undo button
          setShowUndo(true);
          
          // Auto-hide undo after 5 seconds
          setTimeout(() => setShowUndo(false), 5000);
          
          toast.success('Job moved');
        }
      }
      
      setDraggedJobId(null);
      setDraggedGroupJobs([]);
      setDragPosition(null);
    }
    setDragOverDay(null);
    setDragOverSlot(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    console.log('🎯 DRAG END:', {
      dropEffect: e.dataTransfer.dropEffect,
      wasCancelled: e.dataTransfer.dropEffect === 'none',
      draggedJobId,
      hadDragPosition: !!dragPosition
    });
    
    if (e.dataTransfer.dropEffect === 'none') {
      console.log('↩️ DRAG CANCELLED: Card returned to original position');
    } else {
      console.log('✅ DRAG COMPLETED: Preview removed');
    }
    
    // Clean up drag state - ALWAYS clear on drag end
    setDraggedJobId(null);
    setDraggedGroupJobs([]);
    setDragPosition(null);
    setDragOverDay(null);
    setDragOverSlot(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Mobile tap handler - disabled in favor of hold-to-select
  const handleJobTap = useCallback((jobId: string) => {
    // If in selection mode, toggle selection
    if (isSelectionMode) {
      setSelectedJobIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(jobId)) {
          newSet.delete(jobId);
          // Exit selection mode if no jobs selected
          if (newSet.size === 0) {
            setIsSelectionMode(false);
          }
        } else {
          newSet.add(jobId);
        }
        return newSet;
      });
    }
    // Double-tap functionality removed - use hold-to-select instead
  }, [isSelectionMode]);

  // Long-press handlers for cutting jobs on mobile
  const handleJobTouchStart = (e: React.TouchEvent, jobId: string) => {
    // Record start position and time to detect taps vs swipes
    longPressStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
    
    // Store the start time to detect quick taps
    const startTime = Date.now();
    
    // If in selection mode, handle on touch end (not here)
    if (isSelectionMode) {
      e.preventDefault();
      // Store jobId for touch end handler
      (e.currentTarget as any).dataset.jobId = jobId;
      (e.currentTarget as any).dataset.touchStartTime = startTime;
      return;
    }
    
    // Prevent text selection during long press
    e.preventDefault();
    
    // Store for touch end handler
    (e.currentTarget as any).dataset.jobId = jobId;
    (e.currentTarget as any).dataset.touchStartTime = startTime;
    
    // Start long-press timer (500ms) - enters selection mode
    longPressTimer.current = window.setTimeout(() => {
      // Enter selection mode and select this job
      setIsSelectionMode(true);
      setSelectedJobIds(new Set([jobId]));
      
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const handleJobTouchMove = (e: React.TouchEvent) => {
    if (!longPressStartPos.current) return;
    
    const moveX = Math.abs(e.touches[0].clientX - longPressStartPos.current.x);
    const moveY = Math.abs(e.touches[0].clientY - longPressStartPos.current.y);
    
    // Different thresholds for different modes
    if (isSelectionMode) {
      // In selection mode: Allow more movement before canceling tap (15px)
      // This prevents accidental cancellation from small finger movements
      if (moveX > 15 || moveY > 15) {
        (e.currentTarget as any).dataset.hasMoved = 'true';
      }
    } else {
      // Not in selection mode: Very sensitive (4px) to detect swipes/scrolls
      // This cancels long-press quickly if user is swiping
      if (moveX > 4 || moveY > 4) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        (e.currentTarget as any).dataset.hasMoved = 'true';
      }
    }
  };

  const handleJobTouchEnd = (e: React.TouchEvent) => {
    const target = e.currentTarget as any;
    const jobId = target.dataset.jobId;
    const startTime = parseInt(target.dataset.touchStartTime || '0');
    const hasMoved = target.dataset.hasMoved === 'true';
    const duration = Date.now() - startTime;
    
    // Clear long-press timer if touch ended before 500ms
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    // Clean up
    delete target.dataset.jobId;
    delete target.dataset.touchStartTime;
    delete target.dataset.hasMoved;
    longPressStartPos.current = null;
    
    // If in selection mode and this was a quick tap without movement
    if (isSelectionMode && jobId && !hasMoved && duration < 300) {
      e.preventDefault();
      setSelectedJobIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(jobId)) {
          newSet.delete(jobId);
          // Exit selection mode if no jobs selected
          if (newSet.size === 0) {
            setIsSelectionMode(false);
          }
        } else {
          newSet.add(jobId);
        }
        return newSet;
      });
    }
  };

  // Handle double-tap on empty slot to paste or move selected jobs
  const handleSlotTap = useCallback(async (dateStr: string, slotIndex: number) => {
    // If in selection mode, move all selected jobs to this day
    if (isSelectionMode && selectedJobIds.size > 0 && onRescheduleJob) {
      const jobsToMove = Array.from(selectedJobIds)
        .map(id => jobs.find(j => j.id === id))
        .filter(Boolean) as Job[];
      
      // Move each job to the target date, starting at the target slot
      for (let i = 0; i < jobsToMove.length; i++) {
        const job = jobsToMove[i];
        await onRescheduleJob(job.id, dateStr, slotIndex + i);
      }
      
      // Exit selection mode
      setIsSelectionMode(false);
      setSelectedJobIds(new Set());
      
      // Auto-dismiss tutorial on first paste
      if (showTutorialBanner) {
        dismissTutorial();
      }
      
      toast.success(`Moved ${jobsToMove.length} job${jobsToMove.length > 1 ? 's' : ''}`);
      return;
    }
    
    if (!cutJobId || !onRescheduleJob) return; // Nothing to paste
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    // Double-tap detection
    if (timeSinceLastTap < 500) {
      const job = jobs.find(j => j.id === cutJobId);
      
      if (job && job.date !== dateStr) {
        // Save last action for undo
        setLastAction({
          type: 'move',
          jobId: cutJobId,
          fromDate: job.date,
          toDate: dateStr,
          timeSlot: slotIndex
        });
        
        // Immediately save the change
        await onRescheduleJob(cutJobId, dateStr, slotIndex);
        
        // Clear cut mode
        setCutJobId(null);
        
        // Auto-dismiss tutorial on first paste
        if (showTutorialBanner) {
          dismissTutorial();
        }
        
        // Show undo button
        setShowUndo(true);
        setTimeout(() => setShowUndo(false), 5000);
        
        toast.success('Job moved');
      }
      
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  }, [cutJobId, jobs, onRescheduleJob, isSelectionMode, selectedJobIds, showTutorialBanner, dismissTutorial]);

  // Remove old touch handlers - replaced with tap handlers
  /*
  // Touch handlers for mobile drag and drop - works immediately like desktop
  const handleTouchStart = useCallback((e: React.TouchEvent, jobId: string) => {
    const touch = e.touches[0];
    if (!touch) return;
    
    // Immediately start dragging - no delay
    setTouchDraggedJobId(jobId);
    setDraggedJobId(jobId);
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    console.log('Touch drag started for job:', jobId);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchDraggedJobId) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    // Highlight drop zones based on touch position
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
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
    
    const dayCard = element?.closest('[data-day-card]');
    if (dayCard) {
      const dateStr = dayCard.getAttribute('data-date');
      if (dateStr) {
        setDragOverDay(dateStr);
        setDragOverSlot(null);
      }
    }
  }, [touchDraggedJobId]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    console.log('Touch end - draggedJobId:', touchDraggedJobId);
    
    touchStartPos.current = null;
    
    if (!touchDraggedJobId) {
      console.log('Touch end - no drag active');
      return;
    }
    
    const touch = e.changedTouches[0];
    if (!touch) {
      setTouchDraggedJobId(null);
      setDraggedJobId(null);
      setDragOverDay(null);
      setDragOverSlot(null);
      console.log('Touch end - no touch data, cleaning up');
      return;
    }
    
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
          console.log('Dropping job on time slot:', dateStr, slotIndex);
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
      console.log('Touch end - dropped on time slot, cleaned up');
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
          console.log('Dropping job on day card:', dateStr);
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
    
    // Always clean up at the end
    setTouchDraggedJobId(null);
    setDraggedJobId(null);
    setDragOverDay(null);
    setDragOverSlot(null);
    console.log('Touch end - completed, state cleaned up');
  }, [touchDraggedJobId, jobs, jobAssignments]);
  */
  
  // Desktop drag handlers remain unchanged for computer use

  // Get the next 30 days for the forecast view, including past days based on offset
  const next30Days = useMemo(() => {
    const days = [];
    // Start from 30 days ago to allow viewing past days
    const startOffset = isMobile ? dayOffset : -30;
    for (let i = 0; i < 60; i++) { // 60 days total (30 past + 30 future)
      const date = new Date();
      date.setDate(date.getDate() + startOffset + i);
      days.push(date);
    }
    return days;
  }, [dayOffset, isMobile]);

  // Scroll to today card ONLY on initial load (not on page navigation) - position it on the left
  useEffect(() => {
    // Only scroll if we haven't scrolled yet, and only on desktop
    if (!isMobile && !hasScrolledToTodayRef.current && forecastScrollContainerRef.current && next30Days.length > 0 && weatherData) {
      // Use longer delay and requestAnimationFrame to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          const todayStr = new Date().toLocaleDateString('en-CA');
          const todayCard = forecastScrollContainerRef.current?.querySelector(`[data-date="${todayStr}"]`);
          
          if (todayCard) {
            // Calculate scroll position to place today's card at the left edge
            const container = forecastScrollContainerRef.current;
            if (container) {
              const cardLeft = (todayCard as HTMLElement).offsetLeft;
              container.scrollTo({ left: cardLeft, behavior: 'auto' });
              console.log(`✅ Scrolled to today's card at ${todayStr}, offset: ${cardLeft}px`);
              hasScrolledToTodayRef.current = true; // Mark that we've scrolled
            }
          } else {
            console.log(`⚠️ Today's card not found for ${todayStr}`);
          }
        });
      }, 500); // Increased delay to ensure weather data is rendered
      
      return () => clearTimeout(timer);
    }
  }, [isMobile, next30Days.length, weatherData]); // weatherData ensures we wait for data to load

  // Load historical weather data from database
  useEffect(() => {
    const loadHistoricalWeather = async () => {
      if (!locationName) return;
      
      const zipcode = getZipCode(locationName);
      const today = new Date();
      const cache = new Map<string, any>();
      
      console.log(`📡 Loading historical weather for location: ${locationName}, zipcode: ${zipcode}`);
      
      // Load 30 days of historical weather
      for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-CA');
        
        try {
          // Try to get from database first
          const weatherRecord = await getHistoricalWeather(dateStr, zipcode);
          if (weatherRecord) {
            // Transform database record to match expected format
            cache.set(dateStr, {
              tempMax: weatherRecord.temp_max,
              tempMin: weatherRecord.temp_min,
              precipitation: weatherRecord.precipitation,
              precipitationChance: weatherRecord.precipitation_chance,
              description: weatherRecord.description,
              icon: weatherRecord.icon,
              windSpeed: weatherRecord.wind_speed,
              humidity: weatherRecord.humidity,
              hourlyForecasts: weatherRecord.hourly_forecasts
            });
          } else {
            // Fallback to localStorage
            const historicalWeather = JSON.parse(localStorage.getItem('historicalWeather') || '{}');
            const savedWeather = historicalWeather[dateStr];
            if (savedWeather && savedWeather.daily && savedWeather.daily.length > 0) {
              cache.set(dateStr, savedWeather.daily[0]);
            }
          }
        } catch (error) {
          console.error(`Error loading historical weather for ${dateStr}:`, error);
          // Try localStorage as final fallback
          try {
            const historicalWeather = JSON.parse(localStorage.getItem('historicalWeather') || '{}');
            const savedWeather = historicalWeather[dateStr];
            if (savedWeather && savedWeather.daily && savedWeather.daily.length > 0) {
              cache.set(dateStr, savedWeather.daily[0]);
            }
          } catch (localError) {
            console.error(`Error loading from localStorage for ${dateStr}:`, localError);
          }
        }
      }
      
      setHistoricalWeatherCache(cache);
      if (cache.size > 0) {
        console.log(`✅ Loaded ${cache.size} days of historical weather`);
      } else {
        console.warn(`⚠️ No historical weather data found. Database table may not exist yet. See WEATHER_HISTORY_SETUP.md`);
      }
    };
    
    loadHistoricalWeather();
  }, [locationName]); // Reload when location changes

  // Notify parent when location changes
  useEffect(() => {
    if (locationName && onLocationChange) {
      const zipCode = getZipCode(locationName) || '';
      onLocationChange(locationName, zipCode);
    }
  }, [locationName, onLocationChange]);

  // Auto-optimize on initial load when location and jobs are ready
  useEffect(() => {
    // Check if we have location, jobs, and haven't optimized yet on initial load
    const hasInitialOptimized = sessionStorage.getItem('hasInitialOptimized');
    
    if (
      locationName && 
      jobs.length > 0 && 
      startingAddress && 
      !hasInitialOptimized && 
      onOptimizeRoute &&
      optimizationStatus === 'idle'
    ) {
      // Trigger optimization (status managed by parent)
      onOptimizeRoute();
      
      // Mark that we've done the initial optimization for this session
      sessionStorage.setItem('hasInitialOptimized', 'true');
    }
  }, [locationName, jobs.length, startingAddress, onOptimizeRoute, optimizationStatus]);

  return (
    <div className="space-y-4 relative">
      {/* Cancel Selection Button - Floating bottom-right when jobs selected */}
      {isSelectionMode && selectedJobIds.size > 0 && (
        <div className="fixed bottom-20 right-4 z-50">
          <Button
            onClick={() => {
              setIsSelectionMode(false);
              setSelectedJobIds(new Set());
            }}
            size="sm"
            className="bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50 shadow-lg"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel ({selectedJobIds.size})
          </Button>
        </div>
      )}
      
      {/* Mobile top-right location bubble removed - location button now only in bottom nav bar */}

      {/* Weather Section Header - Hidden on mobile, shown on desktop */}
      <div className="hidden md:flex items-center mt-6 mb-0" style={{ gap: 'clamp(0.25rem, 0.3vw, 0.rem)' }}>
        <div className="flex-1 bg-linear-to-r from-blue-200 to-blue-400 rounded-full" style={{ height: 'clamp(1px, 0.1vh, 4px)' }}></div>
        <h2 className="font-bold text-blue-900 uppercase tracking-wide whitespace-nowrap" style={{ fontSize: 'clamp(1.05rem, 2.5vh, 1.5rem)' }}>Weather Forecast</h2>
        <div className="flex-1 bg-linear-to-l from-blue-200 to-blue-400 rounded-full" style={{ height: 'clamp(1px, 0.1vh, 4px)' }}></div>
      </div>

      {/* Weather-Based Job Suggestions - Now shown above individual day cards */}
      {/* Global banner hidden - suggestions appear contextually above each affected day */}

      {/* Mobile Location Editor - Full screen overlay */}
      {isMobile && isEditingAddressProp && (
        <div className="fixed inset-0 bg-white z-100 flex flex-col">
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Set Location</h2>
            {locationName && (
              <button 
                onClick={() => {
                  // Cancel editing and revert to previous location
                  if (onCancelEditAddress) {
                    onCancelEditAddress();
                  }
                }}
                className="p-2 hover:bg-blue-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="max-w-md mx-auto">
              <div className="relative">
                <Input
                  ref={addressInputRef}
                  placeholder={
                    userGPSLocation 
                      ? "Search nearby addresses..." 
                      : "Enter full address"
                  }
                  value={addressInput}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Allow Enter to use typed address directly
                      handleSetAddress();
                    } else if (e.key === 'Escape') {
                      setShowAddressSuggestions(false);
                      if (locationName && onCancelEditAddress) {
                        onCancelEditAddress();
                      }
                    }
                  }}
                  autoComplete="off"
                  disabled={loading}
                  className={`h-12 pr-10 text-base ${
                    addressSaved 
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500' 
                      : userGPSLocation
                      ? 'border-green-200 focus:border-green-400 focus:ring-green-400'
                      : 'border-blue-200 focus:border-blue-400 focus:ring-blue-400'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {addressSaved && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {isSearchingAddress && !addressSaved && (
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                  {!addressSaved && !isSearchingAddress && userGPSLocation && (
                    <div title="Using GPS for nearby results">
                      <Navigation className="h-5 w-5 text-green-600" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Address Suggestions for Mobile */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="mt-2 bg-white border border-blue-300 rounded-md shadow-lg max-h-[60vh] overflow-y-auto">
                  {userGPSLocation && (
                    <div className="px-4 py-3 bg-green-50 border-b border-green-200 text-sm text-green-700 flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      <span>Showing nearby addresses</span>
                    </div>
                  )}
                  {addressSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-900">{suggestion.display_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop Location Editor - Dialog Modal */}
      {!isMobile && isEditingAddressProp && (
        <Dialog open={isEditingAddressProp} onOpenChange={(open) => {
          if (!open && onCancelEditAddress) {
            onCancelEditAddress();
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Change Location</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="relative">
                <Input
                  ref={addressInputRef}
                  placeholder={
                    userGPSLocation 
                      ? "Search nearby addresses..." 
                      : "Enter full address"
                  }
                  value={addressInput}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Allow Enter to use typed address directly
                      handleSetAddress();
                      onCloseAddressEditor?.();
                    } else if (e.key === 'Escape') {
                      setShowAddressSuggestions(false);
                      onCancelEditAddress?.();
                    }
                  }}
                  autoComplete="off"
                  disabled={loading}
                  className={`h-12 pr-10 text-base ${
                    addressSaved 
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500' 
                      : userGPSLocation
                      ? 'border-green-200 focus:border-green-400 focus:ring-green-400'
                      : 'border-blue-200 focus:border-blue-400 focus:ring-blue-400'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {addressSaved && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {isSearchingAddress && !addressSaved && (
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                  {!addressSaved && !isSearchingAddress && userGPSLocation && (
                    <div title="Using GPS for nearby results">
                      <Navigation className="h-5 w-5 text-green-600" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Address Suggestions for Desktop */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="bg-white border border-blue-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                  {userGPSLocation && (
                    <div className="px-4 py-3 bg-green-50 border-b border-green-200 text-sm text-green-700 flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      <span>Showing nearby addresses</span>
                    </div>
                  )}
                  {addressSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        handleSelectSuggestion(suggestion);
                        // Close dialog without reverting (address already saved in handleSelectSuggestion)
                        onCloseAddressEditor?.();
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-900">{suggestion.display_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              <Button
                onClick={async () => {
                  await handleUseGPS();
                  onCloseAddressEditor?.();
                }}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Navigation className="h-4 w-4 mr-2" />
                Use My Current Location
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Location Input - Show when no location is set (Desktop & Mobile) */}
      {!loading && !location && !error && (
        <div className="max-w-2xl mx-auto px-4">
          <Card className="bg-white/80 backdrop-blur border-blue-200">
            <CardContent className="pt-6 pb-6">
              <div className="text-center mb-6">
                <MapPin className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-blue-900 mb-2">Set Your Location</h3>
                <p className="text-blue-700 text-sm">
                  Enter your business address to view weather forecasts and optimize routes
                </p>
              </div>
              
              <div className="relative">
                <Input
                  ref={addressInputRef}
                  placeholder="Enter full address (e.g., 123 Main St, Homewood, AL)"
                  value={addressInput}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !showAddressSuggestions) {
                      handleSetAddress();
                    } else if (e.key === 'Escape') {
                      setShowAddressSuggestions(false);
                    }
                  }}
                  autoComplete="off"
                  disabled={loading}
                  className={`h-12 pr-10 text-base ${
                    addressSaved 
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500' 
                      : userGPSLocation
                      ? 'border-green-200 focus:border-green-400 focus:ring-green-400'
                      : 'border-blue-200 focus:border-blue-400 focus:ring-blue-400'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {addressSaved && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {isSearchingAddress && !addressSaved && (
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                  {!addressSaved && !isSearchingAddress && userGPSLocation && (
                    <div title="Using GPS for nearby results">
                      <Navigation className="h-5 w-5 text-green-600" />
                    </div>
                  )}
                </div>
                
                {/* Address Suggestions Dropdown */}
                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <div 
                    ref={dropdownRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-blue-300 rounded-md shadow-lg max-h-60 overflow-y-auto z-50"
                  >
                    {userGPSLocation && (
                      <div className="px-4 py-2 bg-green-50 border-b border-green-200 text-xs text-green-700 flex items-center gap-2">
                        <Navigation className="h-3 w-3" />
                        <span>Showing nearby addresses based on your location</span>
                      </div>
                    )}
                    {addressSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
                      >
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span className="text-sm text-gray-900">{suggestion.display_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3 mt-4">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-xs text-gray-500">or</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>
              
              <Button
                onClick={handleUseGPS}
                variant="outline"
                className="w-full mt-4 border-blue-200 text-blue-700 hover:bg-blue-50"
                disabled={loading}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Use My Current Location
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No Location Set - Removed (replaced with input UI above) */}

      {/* Undo Button - Bottom Right - Shows briefly after moving a job */}
      {showUndo && lastAction && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 animate-in slide-in-from-bottom-4">
          <Button
            size="sm"
            variant="outline"
            className="bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 shadow-lg"
            onClick={async () => {
              if (!onRescheduleJob) return;
              
              // Undo the last action
              await onRescheduleJob(lastAction.jobId, lastAction.fromDate, lastAction.timeSlot);
              
              setShowUndo(false);
              setLastAction(null);
              toast.success('Undone');
            }}
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
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

      {/* Combined Weather Forecast & Job Planning Card */}
      {weatherData && (
        <div className="flex items-center justify-center" style={{
          minHeight: 'calc(100vh - 5vh - 4rem)', // Full viewport minus nav bar (5vh) and container padding
        }}>
          <div className="space-y-2 w-full">
            {/* Floating Tutorial Banner - Shows once for new users */}
            {showTutorialBanner && jobs.length > 0 && isTouchDevice.current && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md mx-4 animate-in slide-in-from-top duration-300">
                <div className="bg-linear-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-2xl p-4 border-2 border-blue-400">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">📱</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm mb-1">Quick Tip!</h3>
                      <p className="text-xs leading-relaxed">
                        Hold a job to cut it, then double-tap any slot to paste. Swipe between days to reschedule.
                      </p>
                    </div>
                    <button 
                      onClick={dismissTutorial}
                      className="shrink-0 hover:bg-white/20 rounded-full p-1 transition-colors"
                      aria-label="Dismiss tutorial"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Cut Job Active Banner */}
            {isMobile && isTouchDevice.current && cutJobId && (
              <div className="p-2 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-yellow-800 font-medium">
                  <span className="text-lg">✂️</span>
                  <span>Job cut! Double-tap any slot to paste. Swipe to change days.</span>
                </div>
              </div>
            )}

            {/* Week View Grid - Droppable Days with Navigation */}
            <div className="relative flex items-center justify-center w-full">
              {/* Left Arrow - Desktop Only - Positioned far outside container */}
              {!isMobile && (
                <button
                  onClick={() => {
                    // Scroll the forecast container left by one card width
                    if (forecastScrollContainerRef.current) {
                      const cardWidth = 280 + 20; // Card width + gap
                      forecastScrollContainerRef.current.scrollBy({ left: -cardWidth, behavior: 'smooth' });
                    }
                    scrollToTop();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-15 shrink-0 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-lg transition-all hover:scale-110"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Flex wrapper - horizontal scroll container with snap */}
              <div 
                ref={forecastScrollContainerRef}
                className={`forecast-grid-container ${
                  isMobile ? 'overflow-y-auto snap-y snap-mandatory' : 'overflow-x-auto overflow-y-visible scrollbar-hide'
                }`}
                style={{
                  scrollSnapType: isMobile ? 'y mandatory' : 'x mandatory',
                  scrollBehavior: isMobile ? 'smooth' : 'smooth',
                  width: isMobile ? '97vw' : `${forecastContainerWidth}px`,
                  maxWidth: isMobile ? '97vw' : `${forecastContainerWidth}px`,
                  margin: isMobile ? '0 auto' : '0 auto', // Center on both mobile and desktop
                  height: isMobile ? 'calc(100vh - var(--header-height, 0px) - var(--footer-height, 0px))' : undefined,
                  paddingTop: isMobile ? '0' : '1rem', // Add spacing at top for desktop to prevent overlap
                }}
              >
                {/* Desktop Cut Job Active Banner */}
                {!isMobile && isTouchDevice.current && cutJobId && (
                  <div className="p-2 bg-yellow-50 border-2 border-yellow-400 rounded-lg mb-2">
                    <div className="flex items-center gap-2 text-xs text-yellow-800 font-medium">
                      <span className="text-lg">✂️</span>
                      <span>Job cut! Double-tap any slot to paste. Swipe to change days.</span>
                    </div>
                  </div>
                )}

                {/* Forecast Grid with Touch Support and Snap Scrolling */}
                <div 
                  className={`${isMobile ? 'grid grid-cols-1 forecast-grid-mobile' : 'flex items-stretch justify-start'} relative ${
                    isMobile ? (
                      slideDirection === 'left' ? 'animate-slide-in-right' : 
                      slideDirection === 'right' ? 'animate-slide-in-left' : ''
                    ) : ''
                  }`}
                  style={{
                    gap: isMobile ? undefined : '1.25rem', // Reduced from 1.5rem (24px) to 1.25rem (20px)
                    transform: isMobile && !slideDirection ? `translateX(${swipeOffset}px)` : undefined,
                    transition: isTransitioning && !slideDirection ? 'transform 0.3s ease-out' : 'none',
                    paddingLeft: isMobile ? undefined : '0',
                    paddingRight: isMobile ? undefined : '0',
                  }}
                  onTouchStart={isMobile ? onTouchStart : undefined}
                  onTouchMove={isMobile ? onTouchMove : undefined}
                  onTouchEnd={isMobile ? onTouchEnd : undefined}
                >
                {next30Days
                  .filter((_, index) => isMobile ? index === 0 : true) // On mobile, only show the first day (offset by dayOffset); desktop shows all that fit
                  .map((day, index) => {
                  // For mobile, index is always 0 (showing only current offset day)
                  // For desktop, index matches the day in the array
                  const actualIndex = isMobile ? 0 : index;
                  const dateStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  const todayStr = new Date().toLocaleDateString('en-CA');
                  const isToday = dateStr === todayStr;
                  const isPastDay = day < new Date(todayStr + 'T00:00:00');
                  const dayName = isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayDate = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Get weather for this day
                  // For future days: use weatherData.daily[weatherIndex]
                  // For past days: try to load from historical data
                  let weatherForDay = null;
                  
                  if (isPastDay) {
                    // Try to load historical weather data from database cache
                    weatherForDay = historicalWeatherCache.get(dateStr);
                    if (!weatherForDay) {
                      // Fallback to localStorage for backward compatibility
                      const historicalWeather = JSON.parse(localStorage.getItem('historicalWeather') || '{}');
                      const savedWeather = historicalWeather[dateStr];
                      if (savedWeather && savedWeather.daily && savedWeather.daily.length > 0) {
                        weatherForDay = savedWeather.daily[0];
                      }
                    }
                  } else {
                    // Future day - use forecast data
                    // Calculate weather index based on actual day offset from today
                    // For desktop: startOffset=-30, so actualIndex 30 = today
                    // For mobile: startOffset=dayOffset, so actualIndex 0 = today+dayOffset
                    const daysFromToday = isMobile 
                      ? actualIndex + dayOffset 
                      : actualIndex - 30 + dayOffset; // Adjust for 30 past days on desktop
                    
                    // Only use weather data if it's within the forecast range (typically 5-7 days)
                    if (daysFromToday >= 0 && daysFromToday < (weatherData?.daily?.length || 0)) {
                      weatherForDay = weatherData?.daily[daysFromToday];
                    }
                  }
                  
                  // Get jobs scheduled for this day (including completed jobs to show greyed out)
                  const scheduledJobsForDay = jobs.filter(j => {
                    if (j.date !== dateStr) return false;
                    // Include both scheduled and completed jobs
                    if (j.status !== 'scheduled' && j.status !== 'completed') return false;
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
                  const hasOvernightRain = daysWithOvernightRain.has(dateStr);
                  
                  // Get suggestions for this specific day
                  const suggestionsForDay = (() => {
                    const moveSuggestions = weatherSuggestions.moveSuggestions.filter(s => s.currentDate === dateStr);
                    const timeSuggestions = weatherSuggestions.startTimeSuggestions.filter(s => s.date === dateStr);
                    return { moveSuggestions, timeSuggestions };
                  })();
                  
                  const hasSuggestions = suggestionsForDay.moveSuggestions.length > 0 || suggestionsForDay.timeSuggestions.length > 0;
                  
                  // Get list of job IDs that will be affected by rain (need to be moved)
                  const affectedJobIds = new Set<string>();
                  suggestionsForDay.moveSuggestions.forEach(suggestion => {
                    if (suggestion.jobIds) {
                      suggestion.jobIds.forEach(id => affectedJobIds.add(id));
                    } else if (suggestion.jobId) {
                      affectedJobIds.add(suggestion.jobId);
                    }
                  });
                  
                  // Also mark jobs affected by time adjustments (delays/early ends)
                  if (suggestionsForDay.timeSuggestions.length > 0) {
                    // All jobs on this day are affected by time adjustments
                    scheduledJobsForDay.forEach(job => {
                      if (job.status === 'scheduled') {
                        affectedJobIds.add(job.id);
                      }
                    });
                  }
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      className="relative"
                      style={{
                        scrollSnapAlign: isMobile ? 'end' : 'start',
                        width: isMobile ? '97vw' : '280px',
                        minWidth: isMobile ? '97vw' : '280px',
                        maxWidth: isMobile ? '97vw' : '280px',
                      }}
                    >
                      {/* Suggestion Banner for this day - appears above day card */}
                      {showSuggestions && hasSuggestions && (
                        <div className={`mb-2 ${isMobile ? 'mx-1' : ''}`}>
                          {suggestionsForDay.moveSuggestions.map((suggestion, idx) => (
                            <div key={`move-${idx}`} className="bg-white border-2 border-blue-500 rounded-lg overflow-hidden shadow-md mb-2">
                              <div className="px-3 py-2">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 flex-1">
                                    {suggestion.weatherSeverity === 'heavy' ? (
                                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                        Heavy Rain
                                      </span>
                                    ) : (
                                      <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                        Rain
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-600 font-medium">
                                      {suggestion.jobCount || 1} job{(suggestion.jobCount || 1) !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <Button
                                    onClick={() => acceptMoveSuggestion(suggestion, suggestion.suggestedDate)}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-0.5 h-6"
                                  >
                                    Move to {(() => {
                                      const [year, month, day] = suggestion.suggestedDate.split('-').map(Number);
                                      const date = new Date(year, month - 1, day);
                                      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                    })()}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {suggestionsForDay.timeSuggestions.map((suggestion, idx) => (
                            <div key={`time-${idx}`} className="bg-white border-2 border-blue-500 rounded-lg overflow-hidden shadow-md mb-2">
                              <div className="px-3 py-2">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 flex-1">
                                    <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                      {suggestion.type === 'delay' ? 'Delay' : 'End Early'}
                                    </span>
                                    <span className="text-xs text-gray-600 font-medium">
                                      {(() => {
                                        const formatTime = (hour: number) => {
                                          const period = hour < 12 ? 'AM' : 'PM';
                                          const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                          return `${displayHour}:00 ${period}`;
                                        };
                                        return `${formatTime(suggestion.currentStartTime)} → ${formatTime(suggestion.suggestedStartTime)}`;
                                      })()}
                                    </span>
                                  </div>
                                  <Button
                                    onClick={() => acceptStartTimeSuggestion(suggestion.date, suggestion.suggestedStartTime, suggestion.suggestedEndTime)}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-0.5 h-6"
                                  >
                                    Apply
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Day Card */}
                      <div
                        onDragOver={(e) => handleDayCardDragOver(e, dateStr)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dateStr)}
                        className={`forecast-day-card relative ${
                          isMobile ? 'mb-8 h-[77.52vh] overflow-hidden flex flex-col snap-end' : 'h-[81.6vh] shrink-0 flex flex-col rounded-lg'
                        } shadow-lg overflow-hidden`}
                        style={{
                          scrollSnapStop: isMobile ? 'always' : 'always',
                          background: weatherForDay?.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0
                          ? `linear-gradient(to bottom, ${weatherForDay.hourlyForecasts.map((h: any, idx: number) => {
                              const desc = h.description.toLowerCase();
                              const amount = h.rainAmount || 0;
                              
                              let color = 'rgb(254, 243, 199)'; // yellow-200 - Sunny/Clear (BRIGHTER)
                              
                              // Heavy rain/thunderstorm (>5mm) - VERY DARK BLUE (match blue-800 icon)
                              if (amount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
                                color = 'rgb(30, 64, 175)'; // blue-800 - VERY DARK BLUE
                              }
                              // Moderate rain (1-5mm) - MEDIUM DARK BLUE (match blue-600 icon)
                              else if (amount > 1 || desc.includes('moderate rain')) {
                                color = 'rgb(37, 99, 235)'; // blue-600 - MEDIUM DARK BLUE
                              }
                              // Light drizzle/mist (<1mm) - LIGHT BLUE (match blue-400 icon)
                              else if (amount > 0 || desc.includes('drizzle') || desc.includes('mist') || desc.includes('light rain')) {
                                color = 'rgb(96, 165, 250)'; // blue-400 - LIGHT BLUE
                              }
                              // Cloudy/Overcast - MEDIUM GRAY (more visible)
                              else if (desc.includes('cloud') || desc.includes('overcast')) {
                                color = 'rgb(209, 213, 219)'; // gray-300 - More visible gray
                              }
                              // Clear/Sunny - BRIGHT YELLOW
                              
                              return `${color} ${(idx / (weatherForDay.hourlyForecasts!.length - 1)) * 100}%`;
                            }).join(', ')})`
                          : (() => {
                              // Fallback: solid color based on daily weather description
                              if (!weatherForDay) return 'rgb(254, 243, 199)'; // yellow default
                              
                              const desc = (weatherForDay.description || '').toLowerCase();
                              const amount = weatherForDay.precipitation || 0;
                              
                              // Heavy rain/thunderstorm - VERY DARK BLUE
                              if (amount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
                                return 'rgb(30, 64, 175)'; // blue-800
                              }
                              // Moderate rain - MEDIUM DARK BLUE
                              if (amount > 1 || desc.includes('moderate rain')) {
                                return 'rgb(37, 99, 235)'; // blue-600
                              }
                              // Light drizzle - LIGHT BLUE
                              if (amount > 0 || desc.includes('drizzle') || desc.includes('light rain')) {
                                return 'rgb(96, 165, 250)'; // blue-400
                              }
                              // Cloudy/Overcast - MEDIUM GRAY
                              if (desc.includes('cloud') || desc.includes('overcast')) {
                                return 'rgb(209, 213, 219)'; // gray-300
                              }
                              // Clear/Sunny - BRIGHT YELLOW
                              return 'rgb(254, 243, 199)'; // yellow-200
                            })(),
                        border: '2px solid rgb(209, 213, 219)' // gray-300 neutral border, slightly thicker
                      }}
                    >
                      {/* Day Header - Improved with work/drive time stats */}
                      <div className={`bg-white border-b border-gray-200 ${isMobile ? 'px-2 py-[0.3vh]' : 'px-[0.44vh] py-[0.53vh]'}`}>
                        {/* Day and Date on same line with rain badge - CENTERED */}
                        <div className={`flex items-center justify-center ${isMobile ? 'mb-0' : 'mb-[0.27vh]'}`}>
                          <div className="flex items-center gap-[0.44vh]">
                            <span className={`font-bold text-gray-900 ${isMobile ? 'text-[1.94vh]' : 'text-[1.95vh]'}`}>{dayName}</span>
                            <span className={`text-gray-500 ${isMobile ? 'text-[1.62vh]' : 'text-[1.59vh]'}`}>{dayDate}</span>
                          </div>
                          
                          {/* Rain Chance Badge */}
                          {weatherForDay && rainChance > 0 && !isMobile && (
                            <div className="inline-flex items-center gap-[0.27vh] px-[0.71vh] py-[0.44vh] ml-[0.88vh] rounded-full font-semibold bg-blue-100 text-blue-800 text-[1.07vh]">
                              <CloudRain className="h-[1.33vh] w-[1.33vh]" />
                              {rainChance}%
                            </div>
                          )}
                        </div>
                        
                        {/* Work Stats Row - Centered - Always show job count - LARGER TEXT */}
                        <div className={`flex items-center justify-center gap-[0.53vh] ${isMobile ? 'text-[1.26vh]' : 'text-[1.24vh]'}`}>
                          <div className="flex items-center gap-[0.27vh] text-gray-700">
                            <span className={`font-bold text-blue-600 ${isMobile ? 'text-[1.62vh]' : 'text-[1.59vh]'}`}>{totalJobs}</span>
                            <span className={`text-gray-600 font-medium ${isMobile ? 'text-[1.26vh]' : 'text-[1.24vh]'}`}>job{totalJobs !== 1 ? 's' : ''}</span>
                          </div>
                          {totalJobs > 0 && (() => {
                            const totalWorkMinutes = [...scheduledJobsForDay, ...assignedJobs].reduce((sum, job) => sum + (job.totalTime || 30), 0);
                            const totalDriveMinutes = [...scheduledJobsForDay, ...assignedJobs].reduce((sum, job) => sum + (job.driveTime || 0), 0);
                            const workHours = Math.floor(totalWorkMinutes / 60);
                            const workMins = totalWorkMinutes % 60;
                            const driveHours = Math.floor(totalDriveMinutes / 60);
                            const driveMins = totalDriveMinutes % 60;
                            
                            return (
                              <>
                                {totalWorkMinutes > 0 && (
                                  <>
                                    <div className="h-[0.53vh] w-[0.13vh] bg-gray-300"></div>
                                    <div className="flex items-center gap-[0.27vh] text-gray-700">
                                      <span className={`${isMobile ? 'text-[1.43vh]' : 'text-[1.33vh]'}`}>⏱</span>
                                      <span className={`font-semibold ${isMobile ? 'text-[1.26vh]' : 'text-[1.24vh]'}`}>
                                        {workHours > 0 && `${workHours}h `}{workMins > 0 && `${workMins}m`}
                                        {!workHours && !workMins && '30m'}
                                      </span>
                                    </div>
                                  </>
                                )}
                                {totalDriveMinutes > 0 && (
                                  <>
                                    <div className="h-[0.53vh] w-[0.13vh] bg-gray-300"></div>
                                    <div className="flex items-center gap-[0.27vh] text-gray-700">
                                      <span className={`${isMobile ? 'text-[1.43vh]' : 'text-[1.33vh]'}`}>🚗</span>
                                      <span className={`font-semibold ${isMobile ? 'text-[1.26vh]' : 'text-[1.24vh]'}`}>
                                        {driveHours > 0 && `${driveHours}h `}{driveMins}m
                                      </span>
                                    </div>
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Main Content: Day Schedule (left) + Night Weather (right) */}
                      <div className={`grid grid-cols-[1fr_auto] gap-0 overflow-hidden flex-1 ${
                        isMobile ? '' : ''
                      }`}>
                        {/* Left: Job Count & Jobs List with day weather icons (5am-6pm) */}
                        <div className={`bg-gray-50/50 relative border-r border-gray-200 overflow-hidden ${
                          isMobile ? 'px-1 pb-0 pt-0 flex flex-col' : 'px-[0.44vh] py-0 flex flex-col'
                        }`}>
                          
                          <div className={`relative z-10 ${isMobile ? 'flex-1 flex flex-col min-h-0' : 'flex-1 flex flex-col min-h-0'}`}>
                            {/* Draggable START Time Bar - At very top before 5am icon */}
                            {(() => {
                              const currentStartTime = dayStartTimes.get(dateStr) || 5;
                              const hasOvernightRain = daysWithOvernightRain.has(dateStr);
                              
                              // Determine reason for delayed start
                              let startReason = "Adjust start time";
                              if (hasOvernightRain && currentStartTime > 5) {
                                startReason = "🌙 Overnight rain - Grass still wet";
                              } else if (weatherForDay && currentStartTime > 5) {
                                const morningForecasts = weatherForDay.hourlyForecasts?.slice(0, 3) || [];
                                const hasMorningRain = morningForecasts.some((f: any) => (f.rainAmount || 0) > 0.5);
                                if (hasMorningRain) {
                                  startReason = "🌧️ Morning rain - Wait for clearing";
                                }
                              }
                              
                              return (
                                <div className={`${isMobile ? 'mb-[2vh]' : 'mb-[0.80vh]'}`}>
                                  {/* Draggable start time handle - ALWAYS visible at top */}
                                  <div
                                    className={`relative cursor-ns-resize transition-all group ${isMobile ? 'py-[0.42vh]' : 'py-[0.53vh]'}`}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('timeAdjust', 'start');
                                    }}
                                    onDrag={(e) => {
                                      if (e.clientY === 0) return;
                                      
                                      const container = document.querySelector(`[data-date="${dateStr}"] .time-slots-container`);
                                      if (!container) return;
                                      
                                      const rect = container.getBoundingClientRect();
                                      const y = e.clientY - rect.top;
                                      
                                      // Calculate slot based on percentage of container height
                                      const totalSlots = 14; // 5am to 6pm
                                      const slotIndex = Math.round((y / rect.height) * totalSlots);
                                      const newHour = 5 + slotIndex;
                                      const clampedHour = Math.max(5, Math.min(17, newHour));
                                      
                                      if (clampedHour !== currentStartTime) {
                                        setDayStartTimes(prev => {
                                          const newMap = new Map(prev);
                                          newMap.set(dateStr, clampedHour);
                                          localStorage.setItem('dayStartTimes', JSON.stringify(Array.from(newMap.entries())));
                                          return newMap;
                                        });
                                        onStartTimeChange?.(dateStr, clampedHour);
                                      }
                                    }}
                                    onDragEnd={(e) => {
                                      // Ensure final position is saved and clear drag state
                                      e.preventDefault();
                                      setDragPosition(null);
                                      setDraggedJobId(null);
                                      setDraggedGroupJobs([]);
                                      setDragOverDay(null);
                                      setDragOverSlot(null);
                                    }}
                                    onTouchStart={(e) => {
                                      e.preventDefault();
                                      const touch = e.touches[0];
                                      const container = document.querySelector(`[data-date="${dateStr}"] .time-slots-container`);
                                      if (!container) return;
                                      
                                      const rect = container.getBoundingClientRect();
                                      const startY = touch.clientY;
                                      const startTime = currentStartTime;
                                      
                                      const handleTouchMove = (moveEvent: TouchEvent) => {
                                        moveEvent.preventDefault();
                                        const moveTouch = moveEvent.touches[0];
                                        const y = moveTouch.clientY - rect.top;
                                        
                                        // Calculate slot based on percentage of container height
                                        const totalSlots = 14;
                                        const slotIndex = Math.round((y / rect.height) * totalSlots);
                                        const newHour = 5 + slotIndex;
                                        const clampedHour = Math.max(5, Math.min(17, newHour));
                                        
                                        if (clampedHour !== currentStartTime) {
                                          setDayStartTimes(prev => {
                                            const newMap = new Map(prev);
                                            newMap.set(dateStr, clampedHour);
                                            localStorage.setItem('dayStartTimes', JSON.stringify(Array.from(newMap.entries())));
                                            return newMap;
                                          });
                                          onStartTimeChange?.(dateStr, clampedHour);
                                        }
                                      };
                                      
                                      const handleTouchEnd = () => {
                                        document.removeEventListener('touchmove', handleTouchMove);
                                        document.removeEventListener('touchend', handleTouchEnd);
                                      };
                                      
                                      document.addEventListener('touchmove', handleTouchMove, { passive: false });
                                      document.addEventListener('touchend', handleTouchEnd);
                                  }}
                                >
                                    {/* Visible bar - THICKER */}
                                    <div className="h-[0.71vh] bg-blue-600 shadow-md rounded"></div>
                                    
                                    {/* Drag handle indicator - ALWAYS VISIBLE */}
                                    <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[1.33vh] h-[1.07vh] bg-blue-600 rounded-full flex items-center justify-center shadow-md z-10">
                                      <svg className="w-[0.62vh] h-[0.62vh] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                      </svg>
                                    </div>
                                    {/* Time label - Always visible - positioned on right side - LARGER TEXT */}
                                    <div className={`absolute left-full ml-[0.44vh] top-1/2 -translate-y-1/2 bg-blue-600 text-white px-[0.44vh] py-[0.27vh] rounded font-semibold whitespace-nowrap shadow-md z-10 ${
                                      isMobile ? 'text-[1.18vh]' : 'text-[1.15vh]'
                                    }`}>
                                      Start: {currentStartTime > 12 ? `${currentStartTime - 12}PM` : currentStartTime === 12 ? '12PM' : `${currentStartTime}AM`}
                                    </div>
                                    
                                    {/* Reason label - appears on right */}
                                    {currentStartTime > 5 && (
                                      <div className={`absolute -right-[0.27vh] top-1/2 -translate-y-1/2 translate-x-full bg-white/95 text-blue-700 px-[0.27vh] py-[0.36vh] rounded shadow-sm font-medium whitespace-nowrap ${
                                        isMobile ? 'text-[0.84vh]' : 'text-[0.88vh]'
                                      }`}>
                                        {startReason}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* Time Slot Schedule: 5am-6pm hourly with drag-and-drop */}
                            {(() => {
                              // Get start time for this day (default to 5am)
                              const dayStartHour = dayStartTimes.get(dateStr) || 5;
                              const dayEndHour = dayEndTimes.get(dateStr) || 18;
                              
                              // Simple hourly slots from 5am to 6pm (14 hours total)
                              const timeSlots = Array.from({ length: 14 }, (_, i) => {
                                const hour = 5 + i;
                                const timeLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                return { hour, timeLabel, slotIndex: i };
                              });
                              
                              // Get all jobs for this day and sort
                              const allJobs = [...scheduledJobsForDay, ...assignedJobs].sort((a, b) => {
                                const aIncomplete = a.status !== 'completed';
                                const bIncomplete = b.status !== 'completed';
                                if (aIncomplete && !bIncomplete) return -1;
                                if (!aIncomplete && bIncomplete) return 1;
                                
                                if (a.order && b.order) return a.order - b.order;
                                if (a.scheduledTime && b.scheduledTime) {
                                  return a.scheduledTime.localeCompare(b.scheduledTime);
                                }
                                return 0;
                              });
                              
                              // Calculate offset based on start time
                              const slotOffset = Math.max(0, dayStartHour - 5);
                              
                              const isDraggingOverThisDay = dragOverSlot?.date === dateStr && draggedJobId;
                              const dragTargetSlot = isDraggingOverThisDay ? dragOverSlot.slot : -1;
                              
                              // Map jobs to their 15-minute time slots
                              const jobsBySlot: { [key: number]: typeof allJobs[0] } = {};
                              
                              allJobs.forEach((job) => {
                                if (job.id === draggedJobId) return;
                                
                                const assignedSlot = jobTimeSlots.get(job.id);
                                if (assignedSlot !== undefined) {
                                  let targetSlot = assignedSlot + slotOffset;
                                  
                                  if (targetSlot < 0) targetSlot = 0;
                                  if (targetSlot >= 14) targetSlot = 13;
                                  
                                  if (isDraggingOverThisDay && targetSlot >= dragTargetSlot) {
                                    targetSlot = targetSlot + 1;
                                  }
                                  
                                  if (targetSlot < 14) {
                                    jobsBySlot[targetSlot] = job;
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
                              
                              // Simple system - no duration spanning for now
                              const jobSpans = new Map<number, { job: any; slotsNeeded: number; firstSlot: number }>();
                              const slotsOccupiedByDuration = new Set<number>();
                              
                              // GROUPS LOGIC REMOVED - handled separately
                              // Group detection: identify which slots belong to groups and should be rendered as single tall cards
                              const groupSpans = new Map<number, { group: CustomerGroup; jobCount: number; firstJobId: string; jobs: any[] }>();
                              const slotsToSkip = new Set<number>();
                              
                              // Sort slots to process in order
                              const sortedSlots = Object.keys(jobsBySlot).map(Number).sort((a, b) => a - b);
                              
                              sortedSlots.forEach((slotIndex) => {
                                const job = jobsBySlot[slotIndex];
                                const customer = customers.find(c => c.id === job.customerId);
                                const groupId = customer?.groupId;
                                
                                if (!groupId) return; // Skip non-grouped jobs
                                
                                // Find the group
                                const group = customerGroups.find(g => g.id === groupId);
                                if (!group) return;
                                
                                // Check if this is the first job in a group
                                const isFirstInGroup = !sortedSlots.slice(0, sortedSlots.indexOf(slotIndex)).some(prevSlot => {
                                  const prevJob = jobsBySlot[prevSlot];
                                  const prevCustomer = customers.find(c => c.id === prevJob.customerId);
                                  return prevCustomer?.groupId === groupId;
                                });
                                
                                if (isFirstInGroup) {
                                  // This is the first job in the group - collect all consecutive jobs in this group
                                  const groupJobs: any[] = [job];
                                  let currentSlot = slotIndex + 1;
                                  
                                  // Find all consecutive jobs in the same group
                                  while (currentSlot < 14) {
                                    const nextJob = jobsBySlot[currentSlot];
                                    if (!nextJob) break;
                                    
                                    const nextCustomer = customers.find(c => c.id === nextJob.customerId);
                                    if (nextCustomer?.groupId !== groupId) break;
                                    
                                    groupJobs.push(nextJob);
                                    slotsToSkip.add(currentSlot); // Mark this slot to skip rendering
                                    currentSlot++;
                                  }
                                  
                                  // Store group span information
                                  groupSpans.set(slotIndex, {
                                    group,
                                    jobCount: groupJobs.length,
                                    firstJobId: job.id,
                                    jobs: groupJobs
                                  });
                                }
                              });
                              
                              return (
                                <div className={`relative flex flex-col time-slots-container overflow-hidden ${
                                  isMobile ? 'space-y-0 flex-1 justify-between gap-y-[0.42vh]' : 'flex-1 justify-between'
                                }`} data-date={dateStr}>
                                {/* Blocked time overlays */}
                                {(() => {
                                  const currentStartTime = dayStartTimes.get(dateStr) || 5;
                                  const currentEndTime = dayEndTimes.get(dateStr) || 18;
                                  
                                  const totalSlots = 14; // 5am to 6pm = 14 hours
                                  
                                  const blockedStartSlots = Math.max(0, currentStartTime - 5);
                                  const blockedStartPercent = (blockedStartSlots / totalSlots) * 100;
                                  
                                  const blockedEndSlots = Math.max(0, 19 - currentEndTime);
                                  const blockedEndPercent = (blockedEndSlots / totalSlots) * 100;
                                  const blockedEndTopPercent = ((currentEndTime - 5) / totalSlots) * 100;
                                  
                                  return (
                                    <>
                                      {/* Blocked time overlay (before start time) - Blue rain pattern */}
                                      {currentStartTime > 5 && (
                                        <div 
                                          className="absolute top-0 left-0 right-0 bg-blue-50/60 pointer-events-none z-20"
                                          style={{ 
                                            height: `${blockedStartPercent}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(59, 130, 246, 0.2) 4px, rgba(59, 130, 246, 0.2) 8px)'
                                          }}
                                        />
                                      )}
                                      
                                      {/* Blocked time overlay (after end time) - Blue rain pattern (same as start) */}
                                      {currentEndTime < 18 && (
                                        <div 
                                          className="absolute left-0 right-0 bg-blue-50/60 pointer-events-none z-20"
                                          style={{ 
                                            top: `${blockedEndTopPercent}%`,
                                            height: `${blockedEndPercent}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(59, 130, 246, 0.2) 4px, rgba(59, 130, 246, 0.2) 8px)'
                                          }}
                                        />
                                      )}
                                    </>
                                  );
                                })()}
                                
                                {timeSlots.map((slot) => {
                                  const jobInSlot = jobsBySlot[slot.slotIndex];
                                  const isSlotHovered = dragOverSlot?.date === dateStr && dragOverSlot?.slot === slot.slotIndex;
                                  const isFirstSlot = slot.slotIndex === 0; // First time slot of the day (5 AM)
                                  
                                  // Show weather icons at 5am, 8am, 11am, 2pm, 5pm
                                  const shouldShowWeatherIcon = weatherForDay && [5, 8, 11, 14, 17].includes(slot.hour);
                                  
                                  // Get weather icon component for this hour (if should show)
                                  const getWeatherForHour = () => {
                                    if (!shouldShowWeatherIcon || !weatherForDay) return null;
                                    
                                    // Find the matching hourly forecast
                                    let forecast = null;
                                    if (weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0) {
                                      forecast = weatherForDay.hourlyForecasts.find((f: any) => f.hour24 === slot.hour);
                                      
                                      if (!forecast) {
                                        const closestForecast = weatherForDay.hourlyForecasts.reduce((prev: any, curr: any) => {
                                          const prevDiff = Math.abs((prev.hour24 || 0) - slot.hour);
                                          const currDiff = Math.abs((curr.hour24 || 0) - slot.hour);
                                          return currDiff < prevDiff ? curr : prev;
                                        });
                                        forecast = closestForecast;
                                      }
                                    }
                                    
                                    // Fallback to daily weather
                                    if (!forecast) {
                                      forecast = { 
                                        description: weatherForDay.description, 
                                        precipitation: rainChance, 
                                        rainAmount: weatherForDay.precipitation || 0, 
                                        hour24: slot.hour 
                                      };
                                    }
                                    
                                    const effectivePrecipitation = Math.max(forecast.precipitation || 0, rainChance);
                                    const { Icon: HourIcon, color: hourColor } = getWeatherIcon(
                                      forecast.description, 
                                      effectivePrecipitation,
                                      forecast.rainAmount,
                                      slot.hour
                                    );
                                    
                                    const timeLabel = slot.hour > 12 ? `${slot.hour - 12} PM` : slot.hour === 12 ? '12 PM' : `${slot.hour} AM`;
                                    
                                    return (
                                      <div className="flex flex-col items-center gap-[0.19vh] w-[3.84vh] shrink-0">
                                        <HourIcon className={`${isMobile ? 'w-[2.74vh] h-[2.74vh]' : 'w-[3.07vh] h-[3.07vh]'} ${hourColor} stroke-[1.5]`} />
                                        <span className={`text-gray-500 font-medium whitespace-nowrap ${isMobile ? 'text-[1.09vh]' : 'text-[1.06vh]'}`}>
                                          {timeLabel}
                                        </span>
                                      </div>
                                    );
                                  };
                                  
                                  // All slots are always visible and active
                                  const isDropTarget = dragOverSlot?.date === dateStr && dragOverSlot?.slot === slot.slotIndex;
                                  
                                  // Check if this is the start of a group span
                                  const groupSpan = groupSpans.get(slot.slotIndex);
                                  
                                  // Check if this slot is part of a group (but not the first slot)
                                  const isPartOfGroup = slotsToSkip.has(slot.slotIndex);
                                  
                                  // Check if this is the start of a duration span
                                  const jobSpan = jobSpans.get(slot.slotIndex);
                                  
                                  // Check if this slot is occupied by a duration span from a previous slot
                                  const isOccupiedByDuration = slotsOccupiedByDuration.has(slot.slotIndex);
                                  
                                  return (
                                    <div 
                                      key={slot.slotIndex} 
                                      className={`relative flex items-start transition-colors ${
                                        isMobile ? 'px-[0.46vh] py-[0.28vh] max-h-[2.65vh]' : 'h-[4.9vh] px-[0.48vh]'
                                      } ${isDropTarget ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
                                      data-time-slot="true"
                                      data-slot-index={slot.slotIndex}
                                      onDragOver={(e) => !isOccupiedByDuration && handleDragOver(e, dateStr, slot.slotIndex)}
                                      onDrop={(e) => !isOccupiedByDuration && handleSlotDrop(e, dateStr, slot.slotIndex)}
                                    >
                                      {/* Group card overlay - positioned absolutely to span multiple slots */}
                                      {groupSpan && (
                                        <div 
                                          className="absolute left-0 right-0 z-10"
                                          style={{
                                            top: 0,
                                            height: `calc(${groupSpan.jobCount} * (4.9vh + 0.28vh) - 0.28vh)`,
                                          }}
                                        >
                                          {(() => {
                                            const isDraggedItem = groupSpan.jobs.some(j => j.id === draggedJobId);
                                            const isCompleted = groupSpan.jobs.every(j => j.status === 'completed');
                                            const anyInProgress = groupSpan.jobs.some(j => j.status === 'in-progress');
                                            const groupColor = groupSpan.group.color || '#2563eb'; // Blue default
                                            const canDrag = !isCompleted;
                                            
                                            if (Math.random() < 0.05) { // Log occasionally to avoid spam
                                              console.log('🎴 GROUP CARD:', { 
                                                groupName: groupSpan.group.name, 
                                                isDraggedItem, 
                                                isCompleted, 
                                                canDrag
                                              });
                                            }
                                            
                                            return (
                                              <div
                                                draggable={!isCompleted}
                                                onDragStart={(e) => !isCompleted && handleDragStart(e, groupSpan.firstJobId)}
                                                onDragEnd={handleDragEnd}
                                                className={`h-full rounded transition-all text-xs overflow-hidden flex flex-col select-none mx-auto ${
                                                  isMobile ? 'px-[0.73vh] py-[0.46vh] max-w-[90vw]' : 'px-[0.58vh] py-[0.48vh] max-w-[260px]'
                                                } ${
                                                  isCompleted
                                                    ? 'bg-gray-100 border border-gray-300 cursor-default'
                                                    : isDraggedItem
                                                      ? 'bg-blue-50 border-2 border-blue-500 shadow-xl opacity-70'
                                                      : 'bg-white border border-gray-300 cursor-move hover:shadow-md hover:border-blue-400'
                                                }`}
                                                style={{
                                                  userSelect: 'none',
                                                  WebkitUserSelect: 'none',
                                                  WebkitTouchCallout: 'none',
                                                }}
                                              >
                                                {/* Colored bar at top */}
                                                <div 
                                                  className="w-full h-[0.4vh] rounded-sm mb-[0.3vh] -mx-[0.58vh] -mt-[0.48vh]" 
                                                  style={{ 
                                                    width: 'calc(100% + 1.16vh)',
                                                    backgroundColor: groupColor,
                                                    pointerEvents: 'none'
                                                  }}
                                                ></div>
                                                
                                                <div className="flex flex-col gap-[0.2vh] w-full flex-1 justify-center">
                                                  <div className={`font-semibold text-gray-900 ${isMobile ? 'text-[1.27vh]' : 'text-[1.34vh]'}`}>
                                                    {groupSpan.group.name}
                                                  </div>
                                                  <div className={`text-gray-600 ${isMobile ? 'text-[1.14vh]' : 'text-[1.1vh]'}`}>
                                                    {groupSpan.jobCount} properties • {groupSpan.group.workTimeMinutes} min
                                                  </div>
                                                  {isCompleted && (
                                                    <div className={`text-gray-700 font-bold ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>
                                                      ✓ Complete
                                                    </div>
                                                  )}
                                                  {anyInProgress && !isCompleted && (
                                                    <div className={`text-blue-600 font-medium ${isMobile ? 'text-[1.09vh]' : 'text-[1.06vh]'}`}>
                                                      In Progress...
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                      
                                      <div className={`flex items-start w-full ${shouldShowWeatherIcon ? 'gap-[0.48vh]' : 'gap-0'}`}>
                                        {/* Show weather icon with time, or just empty space for alignment */}
                                        {shouldShowWeatherIcon ? (() => {
                                          const weatherIcon = getWeatherForHour();
                                          
                                          // For first slot (5 AM), add wet grass indicator if overnight rain
                                          if (isFirstSlot && hasOvernightRain) {
                                            return (
                                              <div className="flex items-center gap-[0.14vh]">
                                                {weatherIcon}
                                                <div className="flex flex-col items-center gap-[0.19vh]">
                                                  <div className={`relative flex items-center justify-center bg-blue-50 rounded-full border border-blue-200 ${
                                                    isMobile ? 'w-[2.74vh] h-[2.74vh]' : 'w-[3.07vh] h-[3.07vh]'
                                                  }`}>
                                                    <svg className={`text-blue-600 ${isMobile ? 'w-[1.82vh] h-[1.82vh]' : 'w-[1.92vh] h-[1.92vh]'}`} fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" clipRule="evenodd" />
                                                    </svg>
                                                  </div>
                                                  <span className={`text-blue-700 font-bold whitespace-nowrap tracking-tight ${
                                                    isMobile ? 'text-[0.91vh]' : 'text-[0.96vh]'
                                                  }`}>WET</span>
                                                </div>
                                              </div>
                                            );
                                          }
                                          
                                          return weatherIcon;
                                        })() : (
                                          <div className="w-[1.92vh] shrink-0"></div>
                                        )}
                                        
                                        {/* Job card or empty drop zone */}
                                        {jobInSlot && !isPartOfGroup ? (() => {
                                          // Groups are handled separately
                                          // Duration spans: job only exists in jobsBySlot at first slot
                                          
                                          // Check if this job spans multiple slots based on duration
                                          const spanInfo = jobSpan;
                                          const spansMultipleSlots = spanInfo && spanInfo.slotsNeeded > 1;
                                          
                                          // Regular single job card
                                          const customer = customers.find(c => c.id === jobInSlot.customerId);
                                          
                                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                          const isScheduled = scheduledJobsForDay.some(j => j.id === jobInSlot.id);
                                          const isAssigned = assignedJobs.some(j => j.id === jobInSlot.id);
                                          const isDraggedItem = jobInSlot.id === draggedJobId;
                                          const isCompleted = jobInSlot.status === 'completed';
                                          const scheduledTime = getScheduledTimeForJob(jobInSlot.id, dateStr);
                                          
                                          const isCutItem = jobInSlot.id === cutJobId;
                                          const isSelected = selectedJobIds.has(jobInSlot.id);
                                          const isAffectedByRain = affectedJobIds.has(jobInSlot.id);
                                          
                                          // If this job spans multiple slots, render it absolutely positioned
                                          const jobCardContent = (
                                            <div
                                              draggable={!isCompleted}
                                              onDragStart={(e) => !isCompleted && handleDragStart(e, jobInSlot.id)}
                                              onDragEnd={handleDragEnd}
                                              onClick={isTouchDevice.current && !isCompleted ? () => handleJobTap(jobInSlot.id) : undefined}
                                              onTouchStart={isTouchDevice.current && !isCompleted ? (e) => handleJobTouchStart(e, jobInSlot.id) : undefined}
                                              onTouchMove={isTouchDevice.current && !isCompleted ? handleJobTouchMove : undefined}
                                              onTouchEnd={isTouchDevice.current && !isCompleted ? handleJobTouchEnd : undefined}
                                              //is where the size of the job cards are adjusted
                                              className={`rounded transition-all text-xs group overflow-hidden flex items-start select-none mx-auto ${
                                                isMobile ? 'px-[0.73vh] py-[0.46vh] max-w-[90vw]' : 'px-[0.58vh] py-[0.48vh] max-w-[260px]'
                                              } ${
                                                isCompleted
                                                  ? 'bg-gray-200/80 border border-gray-400 cursor-default'
                                                  : isSelected
                                                  ? 'bg-green-100 border-2 border-green-600 shadow-lg'
                                                  : isCutItem
                                                  ? 'bg-yellow-100 border-2 border-yellow-500 shadow-lg'
                                                  : isAssigned
                                                  ? 'bg-gray-100 border-2 border-gray-400 animate-pulse cursor-move hover:shadow-md'
                                                  : isAffectedByRain
                                                  ? 'bg-blue-50 border-2 border-blue-300 cursor-move hover:shadow-md'
                                                  : 'bg-white border border-gray-300 cursor-move hover:shadow-md active:bg-blue-50 active:border-blue-400'
                                              } ${isDraggedItem ? 'opacity-50' : ''}`}
                                              style={{
                                                userSelect: 'none',
                                                WebkitUserSelect: 'none',
                                                WebkitTouchCallout: 'none',
                                                height: isMobile ? 'auto' : `${Math.max(2.45, ((jobInSlot.totalTime || 60) / 60) * 4.9)}vh`,
                                                minHeight: isMobile ? '3.65vh' : '2.45vh',
                                                alignSelf: 'flex-start',
                                                ...(isAffectedByRain && !isCompleted && !isSelected && !isCutItem && !isDraggedItem && !isAssigned ? {
                                                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(59, 130, 246, 0.08) 6px, rgba(59, 130, 246, 0.08) 12px)'
                                                } : {})
                                              }}
                                            >
                                              <div className="flex items-center justify-between gap-[0.14vh] w-full overflow-hidden">
                                                <div className="flex-1 min-w-0">
                                                  <div className={`font-semibold truncate w-full ${
                                                    isMobile ? 'text-[1.27vh]' : 'text-[1.34vh]'
                                                  } ${isCompleted ? 'text-gray-600' : 'text-gray-900'}`}>
                                                    {customer?.name}
                                                    {isSelected && (
                                                      <span className={`ml-[0.14vh] text-green-700 ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✓ Selected</span>
                                                    )}
                                                    {isCutItem && isTouchDevice.current && !isSelected && (
                                                      <span className={`ml-[0.14vh] text-yellow-700 ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✂️ Cut</span>
                                                    )}
                                                    {isCompleted && (
                                                      <span className={`ml-[0.14vh] text-gray-700 font-bold ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✓</span>
                                                    )}
                                                  </div>
                                                  {!isDraggedItem && isAssigned && (
                                                    <div className={`text-gray-700 font-medium mt-[0.18vh] italic ${isMobile ? 'text-[1.09vh]' : 'text-[1.06vh]'}`}>
                                                      Moving here...
                                                    </div>
                                                  )}
                                                  {!isDraggedItem && !isAssigned && !isCutItem && (
                                                    <div className={`truncate ${
                                                      isMobile ? 'text-[1.14vh]' : 'text-[1.1vh]'
                                                    } ${isCompleted ? 'text-gray-500' : 'text-gray-600'}`}>
                                                      {scheduledTime && <span className="font-medium">{scheduledTime} • </span>}
                                                      ${customer?.price} • 
                                                      <input
                                                        id={`job-time-${jobInSlot.id}`}
                                                        name={`job-time-${jobInSlot.id}`}
                                                        type="number"
                                                        value={jobInSlot.totalTime || 60}
                                                        onChange={(e) => {
                                                          const newTime = parseInt(e.target.value) || 60;
                                                          if (onUpdateJobTime && newTime >= 15 && newTime <= 300) {
                                                            onUpdateJobTime(jobInSlot.id, newTime);
                                                          }
                                                        }}
                                                        onBlur={(e) => {
                                                          // Ensure value is valid on blur
                                                          const value = parseInt(e.target.value);
                                                          if (!value || value < 15) {
                                                            if (onUpdateJobTime) onUpdateJobTime(jobInSlot.id, 15);
                                                          } else if (value > 300) {
                                                            if (onUpdateJobTime) onUpdateJobTime(jobInSlot.id, 300);
                                                          }
                                                        }}
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                          }
                                                          e.stopPropagation();
                                                        }}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          e.currentTarget.select();
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onDragStart={(e) => e.preventDefault()}
                                                        draggable={false}
                                                        className="w-10 bg-transparent border-b border-dashed border-gray-400 hover:border-blue-500 focus:outline-none focus:border-blue-600 text-center cursor-text"
                                                        min="15"
                                                        max="300"
                                                        step="15"
                                                      /> min
                                                    </div>
                                                  )}
                                                  {isCutItem && isTouchDevice.current && (
                                                    <div className={`text-yellow-700 font-medium mt-[0.19vh] ${isMobile ? 'text-[1.14vh]' : 'text-[1.1vh]'}`}>
                                                      Double-tap slot to paste or hold to cancel
                                                    </div>
                                                  )}
                                                </div>
                                                {isScheduled && !isDraggedItem && !isCompleted && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      unassignJob(jobInSlot.id);
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity shrink-0 w-[0.6vh] h-[0.6vh] flex items-center justify-center"
                                                    title="Remove"
                                                  >
                                                    ✕
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                          
                                          
                                          return jobCardContent;
                                        })() : isPartOfGroup || isOccupiedByDuration ? (
                                          // Empty transparent drop zone
                                          <div className="flex-1 h-[4.5vh]"></div>
                                        ) : (
                                          // Normal empty drop zone
                                          <div 
                                            onClick={isTouchDevice.current && (cutJobId || (isSelectionMode && selectedJobIds.size > 0)) ? () => handleSlotTap(dateStr, slot.slotIndex) : undefined}
                                            className={`flex-1 border border-dashed rounded flex items-center justify-center text-center text-[1.2vh] transition-all h-[4.2vh] ${
                                              (cutJobId || (isSelectionMode && selectedJobIds.size > 0)) && isTouchDevice.current
                                                ? 'opacity-100 border-green-500 bg-green-50 text-green-700 cursor-pointer active:bg-green-100'
                                                : isSlotHovered 
                                                ? 'opacity-100 border-blue-500 text-blue-600' 
                                                : 'opacity-0 hover:opacity-100 border-gray-300 text-gray-400'
                                            }`}
                                          >
                                            {(isSelectionMode && selectedJobIds.size > 0 && isTouchDevice.current) 
                                              ? `📋 Tap to paste ${selectedJobIds.size} job${selectedJobIds.size > 1 ? 's' : ''}`
                                              : cutJobId && isTouchDevice.current 
                                              ? '📋 Double-tap to paste' 
                                              : 'Drop job here'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          
                          {/* Draggable END Time Bar - At very bottom after all time slots */}
                          {(() => {
                            const currentEndTime = dayEndTimes.get(dateStr) || 18;
                            
                            // Determine reason for early end
                            let endReason = "Adjust end time";
                            
                            if (weatherForDay && currentEndTime < 18) {
                              const afternoonForecasts = weatherForDay.hourlyForecasts?.slice(3) || [];
                              const hasAfternoonRain = afternoonForecasts.some((f: any) => {
                                const amount = f.rainAmount || 0;
                                const desc = (f.description || '').toLowerCase();
                                return amount > 2 || desc.includes('thunder') || desc.includes('storm');
                              });
                              
                              if (hasAfternoonRain) {
                                const hasThunder = afternoonForecasts.some((f: any) => 
                                  (f.description || '').toLowerCase().includes('thunder') || 
                                  (f.description || '').toLowerCase().includes('storm')
                                );
                                endReason = hasThunder 
                                  ? "⛈️ Afternoon storms - End work early"
                                  : "🌧️ Afternoon rain - End early";
                              }
                            }
                            
                            return (
                              <div className={`${isMobile ? 'mt-[0.16vh]' : 'mt-[0.27vh]'}`}>
                                {/* Draggable end time handle - ALWAYS visible at bottom */}
                                <div
                                  className={`relative cursor-ns-resize transition-all group ${isMobile ? 'py-[0.42vh]' : 'py-[0.53vh]'}`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('timeAdjust', 'end');
                                  }}
                                  onDrag={(e) => {
                                    if (e.clientY === 0) return;
                                    
                                    const container = document.querySelector(`[data-date="${dateStr}"] .time-slots-container`);
                                    if (!container) return;
                                    
                                    const rect = container.getBoundingClientRect();
                                    const y = e.clientY - rect.top;
                                    
                                    // Calculate slot based on percentage of container height
                                    const totalSlots = 14;
                                    const slotIndex = Math.round((y / rect.height) * totalSlots);
                                    const newHour = 5 + slotIndex;
                                    const clampedHour = Math.max(6, Math.min(18, newHour));
                                    
                                    if (clampedHour !== currentEndTime) {
                                      setDayEndTimes(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(dateStr, clampedHour);
                                        localStorage.setItem('dayEndTimes', JSON.stringify(Array.from(newMap.entries())));
                                        return newMap;
                                      });
                                    }
                                  }}
                                  onDragEnd={(e) => {
                                    // Ensure final position is saved and clear drag state
                                    e.preventDefault();
                                    setDragPosition(null);
                                    setDraggedJobId(null);
                                    setDraggedGroupJobs([]);
                                    setDragOverDay(null);
                                    setDragOverSlot(null);
                                  }}
                                  onTouchStart={(e) => {
                                    e.preventDefault();
                                    const touch = e.touches[0];
                                    const container = document.querySelector(`[data-date="${dateStr}"] .time-slots-container`);
                                    if (!container) return;
                                    
                                    const rect = container.getBoundingClientRect();
                                    
                                    const handleTouchMove = (moveEvent: TouchEvent) => {
                                      moveEvent.preventDefault();
                                      const moveTouch = moveEvent.touches[0];
                                      const y = moveTouch.clientY - rect.top;
                                      
                                      // Calculate slot based on percentage of container height
                                      const totalSlots = 14;
                                      const slotIndex = Math.round((y / rect.height) * totalSlots);
                                      const newHour = 5 + slotIndex;
                                      const clampedHour = Math.max(6, Math.min(18, newHour));
                                      
                                      if (clampedHour !== currentEndTime) {
                                        setDayEndTimes(prev => {
                                          const newMap = new Map(prev);
                                          newMap.set(dateStr, clampedHour);
                                          localStorage.setItem('dayEndTimes', JSON.stringify(Array.from(newMap.entries())));
                                          return newMap;
                                        });
                                      }
                                    };
                                    
                                    const handleTouchEnd = () => {
                                      document.removeEventListener('touchmove', handleTouchMove);
                                      document.removeEventListener('touchend', handleTouchEnd);
                                    };
                                    
                                    document.addEventListener('touchmove', handleTouchMove, { passive: false });
                                    document.addEventListener('touchend', handleTouchEnd);
                                  }}
                                >
                                  {/* Visible bar - THICKER */}
                                  <div className="h-[0.71vh] bg-blue-600 shadow-md rounded"></div>
                                  
                                  {/* Drag handle indicator - ALWAYS VISIBLE */}
                                  <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[1.33vh] h-[1.07vh] bg-blue-600 rounded-full flex items-center justify-center shadow-md z-10">
                                    <svg className="w-[0.62vh] h-[0.62vh] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                  </div>
                                  
                                  {/* Time label - Always visible - positioned on right side - LARGER TEXT */}
                                  <div className={`absolute left-full ml-[0.44vh] top-1/2 -translate-y-1/2 bg-blue-600 text-white px-[0.44vh] py-[0.27vh] rounded font-semibold whitespace-nowrap shadow-md z-10 ${
                                    isMobile ? 'text-[1.18vh]' : 'text-[1.15vh]'
                                  }`}>
                                    End: {currentEndTime > 12 ? `${currentEndTime - 12}PM` : currentEndTime === 12 ? '12PM' : `${currentEndTime}AM`}
                                  </div>
                                  
                                  {/* Reason label - appears on right */}
                                  {currentEndTime < 18 && (
                                    <div className={`absolute -right-[0.27vh] top-1/2 -translate-y-1/2 translate-x-full bg-white/95 text-blue-700 px-[0.27vh] py-[0.36vh] rounded shadow-sm font-medium whitespace-nowrap ${
                                      isMobile ? 'text-[0.84vh]' : 'text-[0.88vh]'
                                    }`}>
                                      {endReason}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right: Night Weather (8pm, 11pm, 2am) aligned with day rows */}
                      <div className={`bg-slate-800 px-[0.14vh] py-[0.28vh] w-12 h-full ${isMobile ? 'flex flex-col' : ''}`}>
                        {/* Spacer to align with the day header + 5AM row */}
                        <div className={`${isMobile ? 'h-auto shrink-0' : 'h-[6.93vh]'}`}></div>
                        
                        {/* Night weather icons aligned with specific day time slots */}
                        {weatherForDay && (() => {
                          // Create array with 15 slots (14 day slots + spacing) - 1 hidden at start, 3 visible, 11 hidden
                          // This aligns 3 night icons with 5 day weather icon positions
                          const nightSlots = Array.from({ length: 15 }, (_, i) => {
                            // Slot 0: hidden spacer (aligns with 5am)
                            // Slot 1-2: hidden (aligns with 6am-7am)
                            // Slot 3: 8 PM (aligns with 8am slot)
                            // Slot 4-5: hidden (aligns with 9am-10am)
                            // Slot 6: 11 PM (aligns with 11am slot)
                            // Slot 7-8: hidden (aligns with 12pm-1pm)
                            // Slot 9: 2 AM (aligns with 2pm slot)
                            // Slot 10-14: hidden (aligns with 3pm-6pm + end bar)
                            if (i === 3) return { show: true, label: '8 PM' };
                            if (i === 6) return { show: true, label: '11 PM' };
                            if (i === 9) return { show: true, label: '2 AM' };
                            return { show: false };
                          });
                          
                          const forecastIdx = 3; // Use evening/night forecast
                          const forecast = weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts[forecastIdx]
                            ? weatherForDay.hourlyForecasts[forecastIdx]
                            : { description: weatherForDay.description, precipitation: rainChance, rainAmount: 0, hour24: 23 };
                          
                          const effectivePrecipitation = Math.max(forecast.precipitation, rainChance);
                          // Use hour24: 21 (9 PM) for nighttime icons
                          const { Icon: NightIcon, color: nightColor } = getWeatherIcon(
                            forecast.description, 
                            effectivePrecipitation,
                            forecast.rainAmount,
                            21  // 9 PM for nighttime display
                          );
                          
                          return (
                            <div className={`${isMobile ? 'space-y-0 flex-1 flex flex-col justify-between gap-y-[0.42vh]' : 'flex-1 flex flex-col justify-between'}`}>
                              {nightSlots.map((slot, idx) => (
                                <div key={idx} className={`flex items-center justify-center ${
                                  //Night weather slot - matches day slot height exactly
                                  isMobile ? 'px-[.42vh] py-[.26vh] max-h-[2.37vh]' : 'h-[4.44vh] px-[0.44vh]'

                                }`}>
                                  {slot.show && (
                                    <div className="flex flex-col items-center gap-[0.17vh]">
                                      <NightIcon className={`${isMobile ? 'w-[2.53vh] h-[2.53vh]' : 'w-[2.84vh] h-[2.84vh]'} ${nightColor} stroke-[1.5]`} />
                                      <span className={`text-slate-300 font-medium whitespace-nowrap ${
                                        isMobile ? 'text-[1.02vh]' : 'text-[0.98vh]'
                                      }`}>
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
                  {/* Close wrapper div for day card + suggestions */}
                </div>
                  );
                })}
              </div>

              {/* Right Arrow - Desktop Only - Positioned far outside container */}
              {!isMobile && (
                <button
                  onClick={() => {
                    // Scroll the forecast container right by one card width
                    if (forecastScrollContainerRef.current) {
                      const cardWidth = 280 + 20; // Card width + gap
                      forecastScrollContainerRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });
                    }
                    scrollToTop();
                  }}
                 className="absolute right-4 top-1/2 -translate-y-1/2 z-15 shrink-0 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-lg transition-all hover:scale-110"
                  aria-label="Next day"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>
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

      {/* Drag preview - shows card following cursor */}
      {draggedJobId && dragPosition && (() => {
        const draggedJob = jobs.find(j => j.id === draggedJobId);
        if (!draggedJob) return null;
        
        const customer = customers.find(c => c.id === draggedJob.customerId);
        if (!customer || !dragPosition) return null;
        
        // Check if this is a group drag
        const isGroupDrag = customer.groupId && draggedGroupJobs.length > 1;
        const group = isGroupDrag ? customerGroups.find(g => g.id === customer.groupId) : null;
        const groupColor = group?.color || '#2563eb';
        
        return (
          <div
            className="fixed pointer-events-none"
            style={{
              left: `${dragPosition.x}px`,
              top: `${dragPosition.y}px`,
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
            }}
          >
            {isGroupDrag && group ? (
              // Group drag preview - matches forecast card styling exactly
              <div
                className="rounded text-xs overflow-hidden flex flex-col select-none bg-white border-2 border-blue-500 shadow-xl opacity-90"
                style={{
                  padding: 'max(0.58vh, 5px)',
                  minWidth: '120px',
                  minHeight: '60px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
              >
                <div 
                  className="w-full rounded-sm mb-[0.3vh]" 
                  style={{ 
                    height: 'max(0.4vh, 3px)',
                    width: 'calc(100% + max(1.16vh, 10px))',
                    marginLeft: 'calc(-1 * max(0.58vh, 5px))',
                    marginTop: 'calc(-1 * max(0.48vh, 4px))',
                    backgroundColor: groupColor
                  }}
                ></div>
                
                <div className="flex flex-col gap-[0.2vh] w-full flex-1 justify-center">
                  <div className="font-semibold text-gray-900" style={{ fontSize: 'max(1.34vh, 11px)' }}>
                    {group.name}
                  </div>
                  <div className="text-gray-600" style={{ fontSize: 'max(1.1vh, 9px)' }}>
                    {draggedGroupJobs.length} properties • {group.workTimeMinutes} min
                  </div>
                </div>
              </div>
            ) : (
              // Single job drag preview - simplified version
              <div 
                className="rounded text-xs overflow-hidden flex flex-col select-none bg-white border-2 border-blue-500 shadow-xl opacity-90"
                style={{
                  padding: 'max(0.58vh, 5px)',
                  minWidth: '120px',
                  minHeight: '60px',
                }}
              >
                <div className="flex flex-col gap-1 justify-center items-center text-center h-full">
                  <div className="font-semibold text-gray-900" style={{ fontSize: 'max(1.34vh, 11px)' }}>
                    {customer.name}
                  </div>
                  <div className="text-gray-600 text-[10px]">{customer.address}</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
