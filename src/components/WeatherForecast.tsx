import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  onRescheduleJob?: (jobId: string, newDate: string, timeSlot?: number) => void;
  onUpdateJobTimeSlot?: (jobId: string, timeSlot: number) => void;
  onStartTimeChange?: (date: string, startHour: number) => void;
  onOptimizeRoute?: () => void;
  optimizationStatus?: 'idle' | 'optimizing' | 'optimized';
  startingAddress?: string;
  onStartingAddressChange?: (address: string) => void;
  onLocationChange?: (locationName: string, zipCode: string) => void;
  onEditAddress?: () => void;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

export function WeatherForecast({ 
  jobs = [], 
  customers = [], 
  onRescheduleJob, 
  onStartTimeChange, 
  onOptimizeRoute, 
  optimizationStatus = 'idle',
  startingAddress = '', 
  onStartingAddressChange, 
  onLocationChange, 
  onEditAddress,
  scrollToTodayRef
}: WeatherForecastProps) {
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
  const [addressInput, setAddressInput] = useState(() => {
    return localStorage.getItem('weatherLocationName') || localStorage.getItem('routeStartingAddress') || '';
  });
  const [streetAddress, setStreetAddress] = useState(() => localStorage.getItem('routeStreetAddress') || '');
  const [addressSaved, setAddressSaved] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const forecastScrollContainerRef = useRef<HTMLDivElement>(null);
  const [userGPSLocation, setUserGPSLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [jobAssignments, setJobAssignments] = useState<Map<string, string>>(new Map()); // jobId -> date mapping
  const [jobTimeSlots, setJobTimeSlots] = useState<Map<string, number>>(new Map()); // jobId -> timeSlot (0-11 for 6am-6pm)
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, -1 = yesterday, 1 = tomorrow, etc.
  
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
        // Allow going back to previous days, but not beyond today (dayOffset 0)
        setSlideDirection('right');
        setDayOffset(prev => Math.max(-7, prev - 1)); // Allow up to 7 days in the past for historical view
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
    if (isEditingAddress && addressInputRef.current) {
      setAddressInput(''); // Clear the input when entering edit mode
      setShowAddressSuggestions(false);
      addressInputRef.current.focus();
    }
  }, [isEditingAddress]);

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
    } else {
      // No optimization yet, show button if there are jobs
      setHasJobChanges(jobs.length > 0);
    }
  }, [jobs, lastOptimizedJobState]);

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
  
  // Track days with overnight rain from previous night (for visual "wet grass" indicator)
  const [daysWithOvernightRain, setDaysWithOvernightRain] = useState<Set<string>>(new Set());
  
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; slot: number } | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  // const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null); // Removed for mobile performance
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

    // Analyze each day in the 5-day forecast
    const forecast = weatherData.daily.slice(0, 5);

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
              
              // Suggest moving the overflow jobs
              jobsOnDay.slice(-jobsToMove).forEach(job => {
                const customer = customers.find(c => c.id === job.customerId);
                const jobName = customer ? customer.name : 'Unknown Customer';
                
                moveSuggestions.push({
                  jobId: job.id,
                  jobName,
                  currentDate: dateStr,
                  suggestedDate: bestDay,
                  reason: `Not enough time after delaying start to ${weatherInfo.clearsByHour}:00. Only ${maxJobsAfterDelay} job${maxJobsAfterDelay !== 1 ? 's' : ''} can fit.`,
                  weatherSeverity: 'moderate'
                });
                
                workloadByDay.set(bestDay, (workloadByDay.get(bestDay) || 0) + 1);
              });
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
            
            // Suggest moving the jobs that won't fit
            jobsOnDay.slice(-jobsToMove).forEach(job => {
              const customer = customers.find(c => c.id === job.customerId);
              const jobName = customer ? customer.name : 'Unknown Customer';
              
              moveSuggestions.push({
                jobId: job.id,
                jobName,
                currentDate: dateStr,
                suggestedDate: bestDay,
                reason: `Rain starts at ${lastGoodHour}:00. Only ${maxJobsBeforeRain} job${maxJobsBeforeRain !== 1 ? 's' : ''} can be completed before rain.`,
                weatherSeverity: 'moderate'
              });
              
              workloadByDay.set(bestDay, (workloadByDay.get(bestDay) || 0) + 1);
            });
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
    setShowSuggestions(suggestions.moveSuggestions.length > 0 || suggestions.startTimeSuggestions.length > 0);
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
          // Also set as route starting address
          localStorage.setItem('routeStartingAddress', name);
        } else if (coords.name) {
          setLocationName(coords.name);
          localStorage.setItem('weatherLocationName', coords.name);
          // Also set as route starting address
          localStorage.setItem('routeStartingAddress', coords.name);
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
    setIsEditingAddress(false); // Exit edit mode after selection
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

      // Update parent component's starting address
      if (onStartingAddressChange) {
        onStartingAddressChange(suggestion.display_name);
        console.log('Parent component notified of address change');
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
    e.stopPropagation();
    setDraggedJobId(jobId);
    // setIsDragging(true); // Removed for mobile performance
    
    // Hide the default drag ghost image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
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

  const handleSlotDrop = async (e: React.DragEvent, dateStr: string, targetSlot: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedJobId && onRescheduleJob) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job && job.date !== dateStr) {
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
      
      setDraggedJobId(null);
    }
    setDragOverSlot(null);
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    if (draggedJobId) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job && job.date !== dateStr && onRescheduleJob) {
        const timeSlot = jobTimeSlots.get(draggedJobId);
        
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
      
      setDraggedJobId(null);
    }
    setDragOverDay(null);
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
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset + i);
      days.push(date);
    }
    return days;
  }, [dayOffset]);

  // Scroll to today card on initial load - position it on the left
  useEffect(() => {
    if (!isMobile && forecastScrollContainerRef.current && next30Days.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const cards = forecastScrollContainerRef.current?.querySelectorAll('.forecast-day-card');
        
        if (cards) {
          cards.forEach((card) => {
            const dateAttr = card.getAttribute('data-date');
            if (dateAttr === todayStr) {
              (card as HTMLElement).scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'start' });
            }
          });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isMobile, next30Days.length, visibleCardCount]); // Re-run when card count changes

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
      
      {/* Address Indicator - Top Right Corner - Mobile Only */}
      {locationName && isMobile && !isEditingAddress && (
        <button
          onClick={() => setIsEditingAddress(true)}
          className="fixed top-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-lg border border-blue-200 text-sm hover:bg-blue-50 transition-colors"
          title="Change location"
        >
          <MapPin className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-blue-900">{getZipCode(locationName) || 'Location Set'}</span>
        </button>
      )}

      {/* Weather Section Header - Hidden on mobile, shown on desktop */}
      <div className="hidden md:flex items-center mt-6 mb-0" style={{ gap: 'clamp(0.25rem, 0.3vw, 0.rem)' }}>
        <div className="flex-1 bg-linear-to-r from-blue-200 to-blue-400 rounded-full" style={{ height: 'clamp(1px, 0.1vh, 4px)' }}></div>
        <h2 className="font-bold text-blue-900 uppercase tracking-wide whitespace-nowrap" style={{ fontSize: 'clamp(1.05rem, 2.5vh, 1.5rem)' }}>Weather Forecast</h2>
        <div className="flex-1 bg-linear-to-l from-blue-200 to-blue-400 rounded-full" style={{ height: 'clamp(1px, 0.1vh, 4px)' }}></div>
      </div>

      {/* Weather-Based Job Suggestions - Minimalistic Design */}
      {showSuggestions && (weatherSuggestions.moveSuggestions.length > 0 || weatherSuggestions.startTimeSuggestions.length > 0) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Weather Recommendations</h3>
            </div>
            <Button 
              onClick={dismissSuggestions}
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-slate-600 h-7 px-2"
            >
              Dismiss All
            </Button>
          </div>

          <div className="p-4 space-y-3">
            {/* Jobs to Reschedule */}
            {weatherSuggestions.moveSuggestions.length > 0 && (
              <div className="space-y-2">
                {weatherSuggestions.moveSuggestions.map((suggestion, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {/* Show job count if multiple jobs, or job name if single */}
                          <span className="font-medium text-slate-900 text-sm truncate">
                            {suggestion.jobCount ? `${suggestion.jobCount} Jobs` : suggestion.jobName}
                          </span>
                          {suggestion.weatherSeverity === 'heavy' && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Heavy Rain</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">{suggestion.reason}</p>
                        
                        {/* Show list of job names if multiple */}
                        {suggestion.jobNames && suggestion.jobNames.length > 1 && (
                          <p className="text-xs text-slate-600 mb-2">
                            {suggestion.jobNames.join(', ')}
                          </p>
                        )}
                        
                        {/* Current Day Card Reference */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600">Scheduled on:</span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded font-medium">
                            {(() => {
                              // Parse YYYY-MM-DD string without timezone issues
                              const [year, month, day] = suggestion.currentDate.split('-').map(Number);
                              const date = new Date(year, month - 1, day);
                              return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                            })()}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <Button
                        onClick={() => acceptMoveSuggestion(suggestion, suggestion.suggestedDate)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 h-8 whitespace-nowrap"
                      >
                        Move to {(() => {
                          // Parse YYYY-MM-DD string without timezone issues
                          const [year, month, day] = suggestion.suggestedDate.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        })()}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Start Time Adjustments */}
            {weatherSuggestions.startTimeSuggestions.length > 0 && (
              <div className="space-y-2">
                {weatherSuggestions.startTimeSuggestions.map((suggestion, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900 text-sm">
                            {(() => {
                              // Parse YYYY-MM-DD string without timezone issues
                              const [year, month, day] = suggestion.date.split('-').map(Number);
                              const date = new Date(year, month - 1, day);
                              return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                            })()}
                          </span>
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            {suggestion.jobCount} job{suggestion.jobCount !== 1 ? 's' : ''}
                          </span>
                          {suggestion.type === 'delay' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Delay Start</span>
                          )}
                          {suggestion.type === 'start-early' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">End Early</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">{suggestion.reason}</p>
                        
                        {/* Scheduled Day Reference */}
                        <div className="flex items-center gap-2 text-xs mb-2">
                          <span className="text-slate-600">Scheduled on:</span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded font-medium">
                            {(() => {
                              const [year, month, day] = suggestion.date.split('-').map(Number);
                              const date = new Date(year, month - 1, day);
                              return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                            })()}
                          </span>
                        </div>

                        {/* Time Change */}
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-slate-600">
                            {suggestion.type === 'delay' ? 'Delay from:' : 'Adjust to:'}
                          </span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded font-medium">
                            {suggestion.currentStartTime}:00 {suggestion.currentStartTime < 12 ? 'AM' : 'PM'}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 font-medium">
                            {suggestion.suggestedStartTime}:00 {suggestion.suggestedStartTime < 12 ? 'AM' : 'PM'}
                            {suggestion.suggestedEndTime && (
                              <> - {suggestion.suggestedEndTime}:00 {suggestion.suggestedEndTime < 12 ? 'AM' : 'PM'}</>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <Button
                        onClick={() => acceptStartTimeSuggestion(
                          suggestion.date, 
                          suggestion.suggestedStartTime,
                          suggestion.suggestedEndTime
                        )}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 h-8 whitespace-nowrap"
                      >
                        {suggestion.type === 'delay' ? 'Delay Start' : 'End Early'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Apply All Button */}
            {(weatherSuggestions.moveSuggestions.length + weatherSuggestions.startTimeSuggestions.length) > 1 && (
              <div className="pt-2 border-t border-slate-200">
                <Button 
                  onClick={acceptAllSuggestions}
                  size="sm"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium h-9"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply All ({weatherSuggestions.moveSuggestions.length + weatherSuggestions.startTimeSuggestions.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Location Editor - Full screen overlay */}
      {isMobile && isEditingAddress && (
        <div className="fixed inset-0 bg-white z-100 flex flex-col">
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Set Location</h2>
            {locationName && (
              <button 
                onClick={() => setIsEditingAddress(false)}
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
                    if (e.key === 'Enter' && !showAddressSuggestions) {
                      handleSetAddress();
                    } else if (e.key === 'Escape') {
                      setShowAddressSuggestions(false);
                      if (locationName) {
                        setIsEditingAddress(false);
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

      {/* Location Selector - Centered - Desktop only */}
      <div className="hidden md:flex justify-center mb-0">
        <div className="w-full max-w-3xl px-4">
          {/* Show input when editing or no location set */}
          {(isEditingAddress || !locationName) ? (
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <div className="relative flex-1 min-w-[300px] max-w-[500px]">
                <Input
                  ref={addressInputRef}
                  placeholder={
                    userGPSLocation 
                      ? "Search nearby addresses..." 
                      : "Enter full address (e.g., 123 Main St, Homewood, Alabama)"
                  }
                  value={addressInput}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !showAddressSuggestions) {
                      handleSetAddress();
                    } else if (e.key === 'Escape') {
                      setShowAddressSuggestions(false);
                      if (locationName) {
                        setIsEditingAddress(false);
                      }
                    }
                  }}
                  onFocus={() => {
                    // Don't show suggestions on focus - wait for user to type
                  }}
                  autoComplete="off"
                  disabled={loading}
                  className={`h-10 pr-10 transition-all ${
                    addressSaved 
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500' 
                      : userGPSLocation
                      ? 'border-green-200 focus:border-green-400 focus:ring-green-400'
                      : 'border-blue-200 focus:border-blue-400 focus:ring-blue-400'
                  }`}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  {addressSaved && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {isSearchingAddress && !addressSaved && (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  )}
                  {!addressSaved && !isSearchingAddress && userGPSLocation && (
                    <div title="Using GPS for nearby results">
                      <Navigation className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                </div>
                
                {/* Address Suggestions Dropdown */}
                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <div 
                    ref={dropdownRef}
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-blue-300 rounded-md shadow-lg max-h-60 overflow-y-auto z-50"
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
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Button clicked for:', suggestion.display_name);
                          handleSelectSuggestion(suggestion);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
                      >
                        <div className="flex items-start gap-2 pointer-events-none">
                          <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span className="text-sm text-gray-900">{suggestion.display_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Show clickable location display when location is set and not editing - Icon-only on mobile */
            <div className="flex flex-col md:flex-row items-center gap-3">
              {/* Location display removed from here - will be in top bar */}
            </div>
          )}
        </div>
      </div>

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
                  const dayName = isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayDate = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Get weather for this day - adjust index by dayOffset to get correct weather data
                  // When dayOffset is 0, index 0 = today (weatherData.daily[0])
                  // When dayOffset is 1, index 0 = tomorrow (weatherData.daily[1])
                  const weatherIndex = actualIndex + dayOffset;
                  const weatherForDay = weatherData?.daily[weatherIndex];
                  
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
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      onDragOver={(e) => handleDayCardDragOver(e, dateStr)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      className={`forecast-day-card relative ${ //forecast and day card relation
                        isMobile ? 'mb-8 h-[77.52vh] overflow-hidden flex flex-col w-screen snap-end' : 'h-[81.6vh] shrink-0 flex flex-col rounded-lg'
                      } shadow-lg overflow-hidden`}
                      style={{
                        scrollSnapAlign: isMobile ? 'end' : 'start',
                        scrollSnapStop: isMobile ? 'always' : 'always',
                        width: isMobile ? '97vw' : '280px', // 97vw on mobile to show borders, reduced from 320px on desktop
                        minWidth: isMobile ? '97vw' : '280px',
                        maxWidth: isMobile ? '97vw' : '280px',
                        background: weatherForDay?.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0
                          ? `linear-gradient(to bottom, ${weatherForDay.hourlyForecasts.map((h, idx) => {
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
                                      // Ensure final position is saved
                                      e.preventDefault();
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
                            
                            {/* Time Slot Schedule: 4am-6pm with drag-and-drop (includes 5am icon as first slot) */}
                            {(() => {
                              // Get start time for this day (default to 5am - earliest visible slot)
                              const dayStartHour = dayStartTimes.get(dateStr) || 5;
                              const dayEndHour = dayEndTimes.get(dateStr) || 18;
                              
                              // Generate hourly time slots from 5am to 6pm (14 hours total)
                              const timeSlots = Array.from({ length: 14 }, (_, i) => {
                                const hour = 5 + i; // Start from 5am
                                const timeLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                return { hour, timeLabel, slotIndex: i };
                              });
                              
                              // Get all jobs for this day and sort by status (incomplete first), then by order/scheduledTime
                              const allJobs = [...scheduledJobsForDay, ...assignedJobs].sort((a, b) => {
                                // First priority: Sort by status - incomplete jobs (scheduled/in-progress) before completed
                                const aIncomplete = a.status !== 'completed';
                                const bIncomplete = b.status !== 'completed';
                                if (aIncomplete && !bIncomplete) return -1; // a is incomplete, b is complete - a comes first
                                if (!aIncomplete && bIncomplete) return 1;  // b is incomplete, a is complete - b comes first
                                
                                // Secondary sort: by order field if both have it (for optimized routes)
                                if (a.order && b.order) return a.order - b.order;
                                // Tertiary sort: by scheduledTime if available
                                if (a.scheduledTime && b.scheduledTime) {
                                  return a.scheduledTime.localeCompare(b.scheduledTime);
                                }
                                return 0;
                              });
                              
                              // Calculate offset based on start time (e.g., if start is 8am, offset is 3 from 5am)
                              const slotOffset = Math.max(0, dayStartHour - 5); // Offset from 5am
                              const isDraggingOverThisDay = dragOverSlot?.date === dateStr && draggedJobId;
                              const dragTargetSlot = isDraggingOverThisDay ? dragOverSlot.slot : -1;
                              
                              // Map jobs to their time slots using jobTimeSlots map (updated by useEffect after optimization)
                              const jobsBySlot: { [key: number]: typeof allJobs[0] } = {};
                              
                              allJobs.forEach((job) => {
                                // Skip the dragged job itself - we'll handle it separately
                                if (job.id === draggedJobId) return;
                                
                                // Get the assigned slot from jobTimeSlots (which reflects optimization order)
                                const assignedSlot = jobTimeSlots.get(job.id);
                                if (assignedSlot !== undefined) {
                                  // Apply the slot offset to shift jobs based on day start time
                                  let targetSlot = assignedSlot + slotOffset;
                                  
                                  // Ensure slot is within valid range (0-13 now for 5am-6pm)
                                  if (targetSlot < 0) targetSlot = 0;
                                  if (targetSlot >= 14) targetSlot = 13;
                                  
                                  // If dragging over this day, shift jobs to make space
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
                              
                              return (
                                <div className={`relative flex flex-col time-slots-container overflow-hidden ${
                                  isMobile ? 'space-y-0 flex-1 justify-between gap-y-[0.42vh]' : 'flex-1 justify-between'
                                }`} data-date={dateStr}>
                                {/* Blocked time overlays */}
                                {(() => {
                                  const currentStartTime = dayStartTimes.get(dateStr) || 5;
                                  const currentEndTime = dayEndTimes.get(dateStr) || 18;
                                  
                                  const totalSlots = 14; // 5am to 6pm = 14 hours
                                  
                                  // Calculate blocked area as percentage instead of pixels
                                  const blockedStartSlots = Math.max(0, currentStartTime - 5);
                                  const blockedStartPercent = (blockedStartSlots / totalSlots) * 100;
                                  
                                  // Block from currentEndTime to 6pm (inclusive)
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
                                  
                                  // First slot (5 AM) always shows weather icon + wet indicator
                                  const isFirstSlot = slot.slotIndex === 0;
                                  const hasOvernightRain = daysWithOvernightRain.has(dateStr);
                                  
                                  // Show weather icon at 5am (first slot), 8am, 11am, 2pm, 5pm (every 3 hours, excluding 6pm)
                                  const shouldShowWeatherIcon = weatherForDay && (isFirstSlot || [8, 11, 14, 17].includes(slot.hour));
                                  
                                  // Get weather icon component for this hour
                                  const getWeatherForHour = () => {
                                    if (!shouldShowWeatherIcon) return null;
                                    
                                    // Find the matching hourly forecast by hour24 field, or closest match
                                    let forecast = null;
                                    if (weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0) {
                                      // Try to find exact match first
                                      forecast = weatherForDay.hourlyForecasts.find((f: any) => f.hour24 === slot.hour);
                                      
                                      // If no exact match, find the closest forecast
                                      if (!forecast) {
                                        const closestForecast = weatherForDay.hourlyForecasts.reduce((prev: any, curr: any) => {
                                          const prevDiff = Math.abs((prev.hour24 || 0) - slot.hour);
                                          const currDiff = Math.abs((curr.hour24 || 0) - slot.hour);
                                          return currDiff < prevDiff ? curr : prev;
                                        });
                                        forecast = closestForecast;
                                      }
                                    }
                                    
                                    // Fallback to daily weather if no hourly data
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
                                      slot.hour  // Use the actual slot hour for time-based icons
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
                                  return (
                                    <div 
                                      key={slot.slotIndex} 
                                      className={`relative flex items-center transition-colors ${
                                        isMobile ? 'px-[0.46vh] py-[0.28vh] max-h-[2.65vh]' : 'h-[4.9vh] px-[0.48vh]' //Increased from 4.3vh to 5vh (slot height)
                                        
                                      } ${isDropTarget ? 'bg-blue-100 border-l-4 border-blue-500' : ''}`}
                                      data-time-slot="true"
                                      data-slot-index={slot.slotIndex}
                                      onDragOver={(e) => handleDragOver(e, dateStr, slot.slotIndex)}
                                      onDrop={(e) => handleSlotDrop(e, dateStr, slot.slotIndex)}
                                    >
                                      <div className={`flex items-center w-full h-full ${shouldShowWeatherIcon ? 'gap-[0.48vh]' : 'gap-0'}`}>
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
                                        {jobInSlot ? (() => {
                                          const customer = customers.find(c => c.id === jobInSlot.customerId);
                                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                          const isScheduled = scheduledJobsForDay.some(j => j.id === jobInSlot.id);
                                          const isAssigned = assignedJobs.some(j => j.id === jobInSlot.id);
                                          const isDraggedItem = jobInSlot.id === draggedJobId;
                                          const isCompleted = jobInSlot.status === 'completed';
                                          const scheduledTime = getScheduledTimeForJob(jobInSlot.id, dateStr);
                                          
                                          const isCutItem = jobInSlot.id === cutJobId;
                                          const isSelected = selectedJobIds.has(jobInSlot.id);
                                          
                                          return (
                                            <div
                                              draggable={!isDraggedItem && !isTouchDevice.current && !isCompleted}
                                              onDragStart={(e) => !isDraggedItem && !isCompleted && handleDragStart(e, jobInSlot.id)}
                                              onClick={isTouchDevice.current && !isCompleted ? () => handleJobTap(jobInSlot.id) : undefined}
                                              onTouchStart={isTouchDevice.current && !isCompleted ? (e) => handleJobTouchStart(e, jobInSlot.id) : undefined}
                                              onTouchMove={isTouchDevice.current && !isCompleted ? handleJobTouchMove : undefined}
                                              onTouchEnd={isTouchDevice.current && !isCompleted ? handleJobTouchEnd : undefined}
                                              //is where the size of the job cards are adjusted
                                              className={`flex-1 rounded transition-all text-xs group overflow-hidden flex items-center select-none ${
                                                isMobile ? 'px-[0.73vh] py-[0.46vh] min-h-[3.65vh] max-h-[4.10vh]' : 'px-[0.58vh] py-[0.48vh] h-[4.8vh]'
                                              } ${
                                                isCompleted
                                                  ? 'bg-gray-100 border border-gray-300 opacity-60 cursor-default'
                                                  : isSelected
                                                  ? 'bg-green-100 border-2 border-green-600 shadow-lg'
                                                  : isCutItem
                                                  ? 'bg-yellow-100 border-2 border-yellow-500 shadow-lg'
                                                  : isDraggedItem
                                                  ? 'bg-blue-100 border-2 border-blue-600 shadow-lg scale-105'
                                                  : isAssigned
                                                  ? 'bg-gray-100 border-2 border-gray-400 animate-pulse cursor-move hover:shadow-md'
                                                  : 'bg-white border border-gray-300 cursor-move hover:shadow-md active:bg-blue-50 active:border-blue-400'
                                              }`}
                                              style={{
                                                userSelect: 'none',
                                                WebkitUserSelect: 'none',
                                                WebkitTouchCallout: 'none',
                                              }}
                                            >
                                              <div className="flex items-center justify-between gap-[0.14vh] w-full overflow-hidden">
                                                <div className="flex-1 min-w-0">
                                                  <div className={`font-semibold truncate w-full ${
                                                    isMobile ? 'text-[1.27vh]' : 'text-[1.34vh]'
                                                  } ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                                    {customer?.name}
                                                    {isSelected && (
                                                      <span className={`ml-[0.14vh] text-green-700 ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✓ Selected</span>
                                                    )}
                                                    {isCutItem && isTouchDevice.current && !isSelected && (
                                                      <span className={`ml-[0.14vh] text-yellow-700 ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✂️ Cut</span>
                                                    )}
                                                    {isCompleted && (
                                                      <span className={`ml-[0.14vh] text-green-600 ${isMobile ? 'text-[1.09vh]' : 'text-[1.15vh]'}`}>✓</span>
                                                    )}
                                                  </div>
                                                  {!isDraggedItem && isAssigned && (
                                                    <div className={`text-gray-700 font-medium mt-[0.18vh] italic ${isMobile ? 'text-[1.09vh]' : 'text-[1.06vh]'}`}>
                                                      Moving here...
                                                    </div>
                                                  )}
                                                  {!isDraggedItem && !isAssigned && !isCutItem && (
                                                    <div className={`truncate ${isMobile ? 'text-[1.14vh]' : 'text-[1.1vh]'} ${isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                                                      {scheduledTime && <span className="font-medium">{scheduledTime} • </span>}
                                                      ${customer?.price} • 60 min
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
                                                    onClick={() => unassignJob(jobInSlot.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity shrink-0 w-[0.6vh] h-[0.6vh] flex items-center justify-center"
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
                                    // Ensure final position is saved
                                    e.preventDefault();
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

      {/* Drag preview removed for better mobile performance */}
    </div>
  );
}
