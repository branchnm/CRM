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
  Clock3,
  Car,
  GripVertical,
  MousePointer2,
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
import { 
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  DEFAULT_JOB_DRIVE_MINUTES,
  DEFAULT_JOB_WORK_MINUTES,
  getDayCapacity,
  getUsableDayMinutes,
  getEstimatedJobMinutes,
  roundDriveMinutesToFive
} from '../utils/scheduleCapacity';
import { toast } from 'sonner';

declare const __APP_BUILD_VERSION__: string;

// Check if demo mode is enabled
const checkDemoMode = (): boolean => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlDemo = urlParams.get('demo') === 'true';
  const sessionDemo = sessionStorage.getItem('demoMode') === 'true';
  const envDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  return urlDemo || sessionDemo || envDemo;
};

const DEMO_MODE = checkDemoMode();
const RESCHEDULE_CAPACITY_MARGIN_PERCENT = 92;
const DESKTOP_DAY_CARD_WIDTH_PX = 426;
const DESKTOP_DAY_CARD_GAP_PX = 20;
const DESKTOP_DAY_CARD_SCROLL_STEP_PX = DESKTOP_DAY_CARD_WIDTH_PX + DESKTOP_DAY_CARD_GAP_PX;
const LANDING_DAY_CARD_PURPLE_GRADIENT = 'linear-gradient(180deg, #ede5ff 0%, #c7b7f2 100%)';

const WORK_DAY_START_HOUR = DEFAULT_DAY_START_HOUR; // 5 AM earliest start
const WORK_DAY_END_HOUR = DEFAULT_DAY_END_HOUR; // 7 PM latest end (19:00 = 7 PM)

// Keep app weather UI aligned with the landing page blue/violet visual system.
const LANDING_WEATHER_PALETTE = {
  clear: '#FDE68A',
  cloud: '#BEC9DD',
  drizzle: '#7DB3FF',
  rain: '#2563EB',
  storm: '#1E3A8A',
  border: '#AFC1E4',
  ring: '#2563EB',
} as const;

// Demo mode default location (Homewood, AL - matches sample customer addresses)
const DEMO_LOCATION: Coordinates = { lat: 33.4665, lon: -86.8089 };
const DEMO_LOCATION_NAME = 'Homewood, AL 35209';
const DEMO_STARTING_ADDRESS = '123 Main St, Homewood, AL 35209';

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
  onRescheduleJob?: (jobId: string, newDate: string, timeSlot?: number) => Promise<void> | void;
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
  onVisibleDayChange?: (dayOffset: number) => void; // NEW: Notify when visible day changes
  visibleForecastDay?: number; // NEW: Receive day offset from parent for bidirectional sync
  onWeatherLoadingChange?: (isLoading: boolean) => void; // NEW: Notify parent of weather loading state
}

interface MoveSuggestion {
  jobId?: string;
  jobIds?: string[];
  jobName?: string;
  jobNames?: string[];
  jobCount?: number;
  currentDate: string;
  suggestedDate: string;
  reason: string;
  weatherSeverity: 'heavy' | 'moderate';
  source?: 'weather' | 'capacity';
}

interface StartTimeSuggestion {
  date: string;
  currentStartTime: number;
  suggestedStartTime: number;
  suggestedEndTime?: number;
  reason: string;
  jobCount: number;
  type?: 'delay' | 'start-early';
  lastGoodHour?: number;
}

interface WeatherSuggestionState {
  moveSuggestions: MoveSuggestion[];
  startTimeSuggestions: StartTimeSuggestion[];
  overnightRainDays: Set<string>;
}

const RAINED_OUT_DAYS_STORAGE_KEY = 'weatherRainedOutDays';

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
  scrollToTodayRef,
  onVisibleDayChange,
  visibleForecastDay,
  onWeatherLoadingChange
}: WeatherForecastProps) {
  console.log('🌤️ WeatherForecast render - onVisibleDayChange:', !!onVisibleDayChange, typeof onVisibleDayChange);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const optimizeAfterRescheduleTimeoutRef = useRef<number | null>(null);
  const [historicalWeatherCache, setHistoricalWeatherCache] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  
  // Notify parent when loading state changes
  useEffect(() => {
    if (onWeatherLoadingChange) {
      onWeatherLoadingChange(loading || !weatherData);
    }
  }, [loading, weatherData, onWeatherLoadingChange]);

  useEffect(() => {
    document.title = `Job Flow • Capacity ${__APP_BUILD_VERSION__}`;
    return () => {
      document.title = 'Job Flow';
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(() => {
    if (DEMO_MODE) return DEMO_LOCATION;
    const saved = localStorage.getItem('weatherLocation');
    return saved ? JSON.parse(saved) : null;
  });
  const [locationName, setLocationName] = useState<string>(() => {
    if (DEMO_MODE) return DEMO_LOCATION_NAME;
    return localStorage.getItem('weatherLocationName') || '';
  });
  const [addressInput, setAddressInput] = useState(() => {
    if (DEMO_MODE) return DEMO_STARTING_ADDRESS;
    return localStorage.getItem('weatherLocationName') || localStorage.getItem('routeStartingAddress') || '';
  });
  const [streetAddress, setStreetAddress] = useState(() => {
    if (DEMO_MODE) return DEMO_STARTING_ADDRESS;
    return localStorage.getItem('routeStreetAddress') || '';
  });
  const [addressSaved, setAddressSaved] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  // Note: isEditingAddress is now passed as a prop (isEditingAddressProp) from parent
  const addressInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const forecastScrollContainerRef = useRef<HTMLDivElement>(null);
  const forecastViewportRef = useRef<HTMLDivElement>(null);
  const hasScrolledToTodayRef = useRef(false); // Track if we've scrolled to today on initial load
  const hasRestoredPositionRef = useRef(false); // Track if we've restored scroll position on this mount
  const [userGPSLocation, setUserGPSLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [jobAssignments, setJobAssignments] = useState<Map<string, string>>(new Map()); // jobId -> date mapping
  const [jobTimeSlots, setJobTimeSlots] = useState<Map<string, number>>(new Map()); // jobId -> timeSlot (0-11 for 6am-6pm)
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, -1 = yesterday, 1 = tomorrow, etc.
  const lastDayOffsetRef = useRef(0); // Track last day offset to avoid unnecessary updates
  const isInternalUpdateRef = useRef(false); // Track if update is from internal scroll vs external prop
  const isSyncingFromParentRef = useRef(false); // Track if we're currently syncing from parent to prevent loop
  
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
  const [forecastViewportHeight, setForecastViewportHeight] = useState<number | null>(null);
  const [persistedRainedOutDays, setPersistedRainedOutDays] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(RAINED_OUT_DAYS_STORAGE_KEY);
      if (!stored) return new Set<string>();
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? new Set<string>(parsed.filter((item) => typeof item === 'string')) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const resolvedForecastViewportHeight = forecastViewportHeight ?? (
    typeof window !== 'undefined'
      ? Math.max(isMobile ? 360 : 320, window.innerHeight - (isMobile ? 104 : 116))
      : null
  );
  const forecastTopInsetPx = isMobile ? 12 : 16;
  const forecastBottomInsetPx = isMobile ? 14 : 16;
  const dayCardViewportHeight = resolvedForecastViewportHeight
    ? Math.max(220, resolvedForecastViewportHeight - forecastTopInsetPx - forecastBottomInsetPx)
    : null;

  const suggestionTrayMaxHeight = resolvedForecastViewportHeight
    ? isMobile
      ? Math.min(Math.max(resolvedForecastViewportHeight * 0.14, 88), 120)
      : Math.min(Math.max(resolvedForecastViewportHeight * 0.16, 104), 140)
    : (isMobile ? 96 : 116);

  // Scroll to top of page - simple and consistent
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Scroll to today function - exposed via ref for nav bar button
  const scrollToToday = useCallback(() => {
    console.log('📍 scrollToToday called - resetting to day 0');
    
    // Update our tracking immediately
    lastDayOffsetRef.current = 0;
    setDayOffset(0); // Reset offset to show today
    
    // Notify parent that we're viewing today
    isInternalUpdateRef.current = true; // Mark as internal since user clicked today button
    onVisibleDayChange?.(0);
    
    // Block position checks during the scroll animation
    isSyncingFromParentRef.current = true;
    console.log('🔒 Blocking checks during scroll to Today');
    
    if (isMobile) {
      // Mobile: just scroll to top
      scrollToTop();
    } else {
      // Desktop: scroll the forecast container to the Today card
      if (forecastScrollContainerRef.current) {
        const todayCard = forecastScrollContainerRef.current.querySelector('[data-date="' + new Date().toLocaleDateString('en-CA') + '"]');
        if (todayCard) {
          const cardLeft = (todayCard as HTMLElement).offsetLeft;
          todayCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          // Update saved position
          sessionStorage.setItem('forecastScrollPosition', cardLeft.toString());
        } else {
          // If Today card not in DOM yet, scroll to start
          forecastScrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
          sessionStorage.setItem('forecastScrollPosition', '0');
        }
      }
      scrollToTop();
    }
    
    // Re-enable checks after scroll animation completes
    setTimeout(() => {
      console.log('🔓 Re-enabling checks after scroll to Today');
      isSyncingFromParentRef.current = false;
      isInternalUpdateRef.current = false;
    }, 500);
  }, [scrollToTop, isMobile, onVisibleDayChange]);

  // Expose scrollToToday function via ref
  useEffect(() => {
    if (scrollToTodayRef) {
      scrollToTodayRef.current = scrollToToday;
    }
  }, [scrollToToday, scrollToTodayRef]);

  // Notify parent when visible day changes from internal scroll
  useEffect(() => {
    console.log('📅📅📅 WeatherForecast useEffect - dayOffset:', dayOffset, 'isInternal:', isInternalUpdateRef.current, 'isSyncing:', isSyncingFromParentRef.current);
    if (isInternalUpdateRef.current && onVisibleDayChange && !isSyncingFromParentRef.current) {
      console.log(`📅📅📅 CALLING PARENT CALLBACK with offset: ${dayOffset}`);
      onVisibleDayChange(dayOffset);
      console.log('✅✅✅ PARENT CALLBACK EXECUTED SUCCESSFULLY');
      isInternalUpdateRef.current = false; // Reset flag after calling
    }
  }, [dayOffset, onVisibleDayChange]);

  // Sync forecast scroll when visibleForecastDay changes from parent (route section)
  useEffect(() => {
    if (visibleForecastDay !== undefined && visibleForecastDay !== lastDayOffsetRef.current) {
      console.log('🔄 Syncing forecast to match route section day:', visibleForecastDay, 'current:', lastDayOffsetRef.current);
      isInternalUpdateRef.current = false; // Mark as external update
      isSyncingFromParentRef.current = true; // Flag that we're syncing from parent
      setDayOffset(visibleForecastDay);
      lastDayOffsetRef.current = visibleForecastDay; // Update last known offset
      
      // Scroll forecast to show the correct day
      if (!isMobile && forecastScrollContainerRef.current) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + visibleForecastDay);
        const targetDateStr = targetDate.toLocaleDateString('en-CA');
        const targetCard = forecastScrollContainerRef.current.querySelector(`[data-date="${targetDateStr}"]`);
        
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      }
      
      // Clear sync flag after scroll completes
      setTimeout(() => {
        isSyncingFromParentRef.current = false;
        console.log('🔓 Parent sync complete, re-enabling position checks');
      }, 200); // Short delay just for smooth scroll to complete
    }
  }, [visibleForecastDay, isMobile]); // Removed dayOffset - compare with lastDayOffsetRef instead

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
      // Only use screen width - touchscreen laptops should use desktop layout
      setIsMobile(window.innerWidth <= 768);
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

      const cardWidth = DESKTOP_DAY_CARD_WIDTH_PX;
      const gapWidth = DESKTOP_DAY_CARD_GAP_PX;
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

  useEffect(() => {
    const updateForecastViewportHeight = () => {
      if (!forecastViewportRef.current) return;

      const rect = forecastViewportRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const bottomPadding = isMobile ? 12 : 20;
      const minimumHeight = isMobile ? 360 : 320;
      const availableHeight = Math.max(minimumHeight, viewportHeight - rect.top - bottomPadding);

      setForecastViewportHeight(availableHeight);
    };

    const frame = window.requestAnimationFrame(updateForecastViewportHeight);
    window.addEventListener('resize', updateForecastViewportHeight);
    window.addEventListener('orientationchange', updateForecastViewportHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateForecastViewportHeight);
      window.removeEventListener('orientationchange', updateForecastViewportHeight);
    };
  }, [isMobile, showTutorialBanner]);

  useEffect(() => {
    localStorage.setItem(RAINED_OUT_DAYS_STORAGE_KEY, JSON.stringify(Array.from(persistedRainedOutDays)));
  }, [persistedRainedOutDays]);

  useEffect(() => {
    setPersistedRainedOutDays(prev => {
      const next = new Set(prev);
      let changed = false;

      prev.forEach((date) => {
        const hasScheduledJobs = jobs.some(job => job.date === date && job.status === 'scheduled');
        if (hasScheduledJobs) {
          next.delete(date);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [jobs]);

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

  // Handle mobile scroll - update dayOffset based on visible card
  useEffect(() => {
    if (!isMobile || !forecastScrollContainerRef.current) {
      console.log('❌ Mobile scroll handler NOT attached - isMobile:', isMobile, 'hasRef:', !!forecastScrollContainerRef.current);
      return;
    }

    console.log('✅ Mobile scroll handler ATTACHED');
    const container = forecastScrollContainerRef.current;
    let mobileScrollTimeout: number | undefined;

    const handleMobileScroll = () => {
      console.log('📱 Mobile forecast scroll detected, scrollLeft:', container.scrollLeft);
      
      // Save scroll position
      sessionStorage.setItem('forecastScrollPosition', container.scrollLeft.toString());
      
      // Update dayOffset in real-time based on leftmost visible card
      const containerLeft = container.getBoundingClientRect().left;
      const cards = container.querySelectorAll('[data-date]');
      
      // Find the leftmost visible card
      let leftmostCard: Element | null = null;
      let minDistance = Infinity;
      
      cards.forEach((card) => {
        const cardElement = card as HTMLElement;
        const cardRect = cardElement.getBoundingClientRect();
        const cardLeft = cardRect.left;
        
        if (cardRect.right > containerLeft) {
          const distance = Math.abs(cardLeft - containerLeft);
          if (distance < minDistance) {
            minDistance = distance;
            leftmostCard = card;
          }
        }
      });
      
      if (leftmostCard) {
        const cardDateStr = (leftmostCard as HTMLElement).getAttribute('data-date');
        if (cardDateStr) {
          const todayStr = new Date().toLocaleDateString('en-CA');
          const cardDate = new Date(cardDateStr + 'T00:00:00');
          const today = new Date(todayStr + 'T00:00:00');
          const daysDiff = Math.round((cardDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const clampedDaysDiff = Math.max(-30, daysDiff);
          
          if (clampedDaysDiff !== lastDayOffsetRef.current) {
            console.log('📱 Mobile: dayOffset changing from', lastDayOffsetRef.current, 'to', clampedDaysDiff);
            lastDayOffsetRef.current = clampedDaysDiff;
            isInternalUpdateRef.current = true; // Mark as internal update
            setDayOffset(clampedDaysDiff);
          }
        }
      }
      
      // Clear existing timeout
      if (mobileScrollTimeout) {
        clearTimeout(mobileScrollTimeout);
      }

      // Set timeout just for cleanup
      mobileScrollTimeout = window.setTimeout(() => {
        // Final update when scrolling stops (in case we missed any)
        // This is just a safety net, main updates happen above
      }, 150);
    };

    container.addEventListener('scroll', handleMobileScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleMobileScroll);
      if (mobileScrollTimeout) {
        clearTimeout(mobileScrollTimeout);
      }
    };
  }, [isMobile]);

  // Handle desktop scroll with snap
  useEffect(() => {
    console.log('🔍🔍🔍 Desktop scroll useEffect RUNNING - isMobile:', isMobile, 'hasRef:', !!forecastScrollContainerRef.current, 'weatherData:', !!weatherData);
    if (isMobile || !forecastScrollContainerRef.current) {
      console.log('❌❌❌ Desktop scroll handler NOT attached - isMobile:', isMobile, 'hasRef:', !!forecastScrollContainerRef.current);
      return;
    }

    console.log('✅✅✅ Desktop scroll handler ATTACHING NOW');
    const container = forecastScrollContainerRef.current;
    console.log('📦 Container element:', container, 'scrollLeft:', container.scrollLeft);
    let scrollCheckTimer: number | undefined;

    const checkLeftmostCardPosition = () => {
      // Skip if we're currently syncing from parent to avoid loop
      if (isSyncingFromParentRef.current) {
        console.log('⏭️ Skipping leftmost check - syncing from parent');
        return;
      }
      
      console.log('🔍 Checking leftmost card position...');
      const containerLeft = container.getBoundingClientRect().left;
      const cards = container.querySelectorAll('[data-date]');
      
      // Find the leftmost card that's at least partially visible
      let leftmostCard: Element | null = null;
      let minDistance = Infinity;
      
      cards.forEach((card) => {
        const cardElement = card as HTMLElement;
        const cardRect = cardElement.getBoundingClientRect();
        const cardLeft = cardRect.left;
        
        // Check if card is visible (right edge is past container left)
        if (cardRect.right > containerLeft) {
          const distance = Math.abs(cardLeft - containerLeft);
          if (distance < minDistance) {
            minDistance = distance;
            leftmostCard = card;
          }
        }
      });
      
      if (leftmostCard) {
        const cardDateStr = (leftmostCard as HTMLElement).getAttribute('data-date');
        if (cardDateStr) {
          const todayStr = new Date().toLocaleDateString('en-CA');
          const cardDate = new Date(cardDateStr + 'T00:00:00');
          const today = new Date(todayStr + 'T00:00:00');
          const daysDiff = Math.round((cardDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const clampedDaysDiff = Math.max(-30, daysDiff);
          
          console.log('🎯 Leftmost card:', cardDateStr, 'Days from today:', clampedDaysDiff, 'Current dayOffset:', lastDayOffsetRef.current);
          
          // Only update if position actually changed from our last known position
          if (clampedDaysDiff !== lastDayOffsetRef.current) {
            console.log('🔄 Updating dayOffset from', lastDayOffsetRef.current, 'to', clampedDaysDiff);
            lastDayOffsetRef.current = clampedDaysDiff;
            isInternalUpdateRef.current = true;
            setDayOffset(clampedDaysDiff);
          } else {
            console.log('✅ Position unchanged, no update needed');
          }
        }
      }
    };

    const handleScroll = () => {
      console.log('📜📜📜 FORECAST SCROLL EVENT!!! scrollLeft:', container.scrollLeft);
      setIsDesktopScrolling(true);
      
      // Save scroll position to sessionStorage
      sessionStorage.setItem('forecastScrollPosition', container.scrollLeft.toString());
      
      // Check if Today card is visible
      checkTodayCardVisibility();
      
      // Clear existing timer
      if (scrollCheckTimer) {
        clearTimeout(scrollCheckTimer);
      }

      // Check position immediately after a brief delay for snap to complete
      scrollCheckTimer = window.setTimeout(() => {
        console.log('⏸️ Scrolling stopped - checking position immediately');
        setIsDesktopScrolling(false);
        snapToNearestCard();
        
        // Check leftmost card immediately (no extra delay)
        checkLeftmostCardPosition();
        checkTodayCardVisibility();
      }, 150); // Reduced from 300ms - just enough for snap
    };

    const handleWheel = (e: WheelEvent) => {
      console.log('🎡🎡🎡 WHEEL EVENT FIRED!!! deltaX:', e.deltaX, 'deltaY:', e.deltaY, 'target:', e.target);
      // Detect horizontal scrolling (trackpad swipe)
      if (Math.abs(e.deltaX) > 0) {
        console.log('🖱️🖱️🖱️ WHEEL EVENT (horizontal): deltaX =', e.deltaX, 'deltaY =', e.deltaY);
        // The scroll event should fire, but let's trigger check as backup
        if (scrollCheckTimer) {
          clearTimeout(scrollCheckTimer);
        }
        scrollCheckTimer = window.setTimeout(() => {
          console.log('⏸️⏸️⏸️ Wheel scrolling stopped - checking position immediately');
          checkLeftmostCardPosition();
        }, 150); // Check immediately after brief delay
      } else {
        console.log('⬆️⬇️ Vertical wheel event (deltaY > deltaX), ignoring');
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    console.log('🎧🎧🎧 Desktop scroll and wheel listeners ADDED to container:', container);
    console.log('🎧 Listener verification - scroll:', !!container.onscroll, 'wheel events should fire now');
    
    // Test that wheel events work at all
    const testWheel = (e: WheelEvent) => {
      console.log('🧪 TEST WHEEL FIRED:', e.deltaX, e.deltaY);
    };
    container.addEventListener('wheel', testWheel, { passive: true });
    console.log('🧪 Test wheel listener also added');

    return () => {
      console.log('🗑️🗑️🗑️ Desktop scroll and wheel listeners BEING REMOVED NOW!!!');
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('wheel', testWheel);
      if (scrollCheckTimer) {
        clearTimeout(scrollCheckTimer);
      }
      if (desktopScrollTimeout.current) {
        clearTimeout(desktopScrollTimeout.current);
      }
    };
  }, [isMobile, weatherData]); // Add weatherData to trigger when forecast renders

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

  // Sync jobTimeSlots with jobs data when jobs prop changes.
  // Prefer persisted scheduledTime so drag/drop slot placement survives refreshes.
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
        let fallbackSlot = 0;
        sorted.forEach((job) => {
          if (!job) return;

          let slotFromTime: number | null = null;
          if (job.scheduledTime) {
            const [hourRaw, minuteRaw] = job.scheduledTime.split(':').map((part: string) => Number.parseInt(part, 10));
            if (Number.isFinite(hourRaw) && Number.isFinite(minuteRaw)) {
              const totalMinutes = (hourRaw * 60) + minuteRaw;
              slotFromTime = Math.max(0, Math.min(55, Math.round((totalMinutes - (5 * 60)) / 15)));
            }
          }

          const slotToUse = slotFromTime ?? fallbackSlot;
          newMap.set(job.id, slotToUse);
          fallbackSlot += Math.max(1, Math.ceil(getEstimatedJobMinutes(job) / 15));
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
    if (!saved) return new Map();

    const parsed = JSON.parse(saved) as Array<[string, number]>;
    return new Map(
      parsed.map(([date, hour]) => [date, hour === 18 ? DEFAULT_DAY_END_HOUR : hour])
    );
  }); // date -> end hour (8-19 for 8am-7pm)
  
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
  const [dragPreviewSize, setDragPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const dragHoverRef = useRef<{ date: string; slot?: number } | null>(null);
  const pendingDragRef = useRef<{ jobId: string; x: number; y: number; offsetX: number; offsetY: number; target: HTMLElement | null } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number }>({ x: 15, y: 15 });
  const touchDragRef = useRef<{ jobId: string; startX: number; startY: number; started: boolean; target: HTMLElement | null } | null>(null);

  const setDragHoverTarget = useCallback((dateStr: string, slotIndex?: number) => {
    const nextTarget = slotIndex !== undefined ? { date: dateStr, slot: slotIndex } : { date: dateStr };
    const currentTarget = dragHoverRef.current;
    const isSameTarget =
      currentTarget?.date === nextTarget.date &&
      (currentTarget?.slot ?? null) === (nextTarget.slot ?? null);

    if (isSameTarget) return;

    dragHoverRef.current = nextTarget;
    setDragOverDay(dateStr);
    setDragOverSlot(slotIndex !== undefined ? { date: dateStr, slot: slotIndex } : null);
  }, []);

  const clearDragHoverTarget = useCallback(() => {
    if (!dragHoverRef.current) return;
    dragHoverRef.current = null;
    setDragOverDay(null);
    setDragOverSlot(null);
  }, []);

  const getOrderedJobsForDay = useCallback((dateStr: string, excludedJobId?: string) => {
    return jobs
      .filter((job) => {
        const effectiveDate = jobAssignments.get(job.id) ?? job.date;
        if (effectiveDate !== dateStr) return false;
        if (job.status !== 'scheduled' && job.status !== 'completed') return false;
        if (excludedJobId && job.id === excludedJobId) return false;
        return true;
      })
      .sort((a, b) => {
        const aIncomplete = a.status !== 'completed';
        const bIncomplete = b.status !== 'completed';
        if (aIncomplete && !bIncomplete) return -1;
        if (!aIncomplete && bIncomplete) return 1;

        const aSlot = jobTimeSlots.get(a.id);
        const bSlot = jobTimeSlots.get(b.id);
        if (aSlot !== undefined && bSlot !== undefined && aSlot !== bSlot) {
          return aSlot - bSlot;
        }

        if (a.scheduledTime && b.scheduledTime && a.scheduledTime !== b.scheduledTime) {
          return a.scheduledTime.localeCompare(b.scheduledTime);
        }

        if (a.order && b.order) return a.order - b.order;
        return 0;
      });
  }, [jobs, jobAssignments, jobTimeSlots]);

  const getDaySlotLayout = useCallback((dateStr: string, excludedJobId?: string) => {
    const dayStartHour = dayStartTimes.get(dateStr) || 5;
    const slotOffset = Math.max(0, (dayStartHour - 5) * 4);
    const orderedJobs = getOrderedJobsForDay(dateStr, excludedJobId);
    const byStartSlot = new Map<number, { job: Job; startSlot: number; slotsNeeded: number }>();

    let currentSlot = slotOffset;
    orderedJobs.forEach((job) => {
      const slotsNeeded = Math.max(1, Math.ceil(getEstimatedJobMinutes(job) / 15));
      if (currentSlot < 56) {
        byStartSlot.set(currentSlot, { job, startSlot: currentSlot, slotsNeeded });
      }
      currentSlot += slotsNeeded;
    });

    return { byStartSlot, orderedJobs, slotOffset };
  }, [dayStartTimes, getOrderedJobsForDay]);

  const getInsertionSlotForPointer = useCallback((
    dateStr: string,
    slotIndex: number,
    clientY: number,
    slotElement: HTMLElement
  ): number => {
    if (!draggedJobId) return slotIndex;

    const layout = getDaySlotLayout(dateStr, draggedJobId);
    const rect = slotElement.getBoundingClientRect();
    const isLowerHalf = clientY > rect.top + rect.height * 0.5;
    const dayContainer = slotElement.closest('.time-slots-container') as HTMLElement | null;

    let pointerSlotFloat = slotIndex + (isLowerHalf ? 0.75 : 0.25);
    if (dayContainer) {
      const dayRect = dayContainer.getBoundingClientRect();
      pointerSlotFloat = Math.max(0, Math.min(55.99, ((clientY - dayRect.top) / Math.max(dayRect.height, 1)) * 56));
    }

    const slotRanges = Array.from(layout.byStartSlot.values());
    const containingRange = slotRanges.find((range) => {
      const rangeEndExclusive = range.startSlot + range.slotsNeeded;
      return slotIndex >= range.startSlot && slotIndex < rangeEndExclusive;
    });

    let insertionSlot = slotIndex;
    if (containingRange) {
      const rangeStart = Math.max(0, Math.min(55, containingRange.startSlot));
      const rangeEnd = Math.max(0, Math.min(55, containingRange.startSlot + containingRange.slotsNeeded));
      const midpoint = containingRange.startSlot + containingRange.slotsNeeded / 2;
      insertionSlot = pointerSlotFloat < midpoint ? rangeStart : rangeEnd;
    } else if (isLowerHalf) {
      insertionSlot = Math.min(55, slotIndex + 1);
    }

    // Magnetic snap: when near a valid boundary, lock the indicator to that boundary.
    if (dayContainer) {
      const dayRect = dayContainer.getBoundingClientRect();
      const rawSlot = Math.max(0, Math.min(55, Math.round(((clientY - dayRect.top) / Math.max(dayRect.height, 1)) * 56)));
      const boundaries = new Set<number>([layout.slotOffset]);
      layout.byStartSlot.forEach((range) => {
        boundaries.add(Math.max(0, Math.min(55, range.startSlot)));
        boundaries.add(Math.max(0, Math.min(55, range.startSlot + range.slotsNeeded)));
      });

      const nearestBoundary = Array.from(boundaries).reduce((closest, boundary) => {
        return Math.abs(boundary - rawSlot) < Math.abs(closest - rawSlot) ? boundary : closest;
      }, insertionSlot);

      const MAGNETIC_SNAP_THRESHOLD_SLOTS = 1;
      if (Math.abs(nearestBoundary - rawSlot) <= MAGNETIC_SNAP_THRESHOLD_SLOTS) {
        insertionSlot = nearestBoundary;
      }
    }

    return insertionSlot;
  }, [draggedJobId, getDaySlotLayout]);

  const getInsertionSlotForDayPointer = useCallback((
    dateStr: string,
    clientY: number,
    dayContainer: HTMLElement
  ): number => {
    const layout = getDaySlotLayout(dateStr, draggedJobId || undefined);
    const slotElements = Array.from(dayContainer.querySelectorAll<HTMLElement>('[data-time-slot]'));

    if (slotElements.length > 0) {
      let insertionSlot = layout.slotOffset;

      for (let i = 0; i < slotElements.length; i++) {
        const slotElement = slotElements[i];
        const slotIndex = Number.parseInt(slotElement.getAttribute('data-slot-index') || '-1', 10);
        if (slotIndex < 0) continue;

        const rect = slotElement.getBoundingClientRect();
        const halfwayPoint = rect.top + rect.height * 0.5;
        if (clientY >= halfwayPoint) {
          insertionSlot = Math.min(55, slotIndex + 1);
          continue;
        }

        insertionSlot = slotIndex;
        break;
      }

      const boundaries = new Set<number>([layout.slotOffset]);
      layout.byStartSlot.forEach((range) => {
        boundaries.add(Math.max(0, Math.min(55, range.startSlot)));
        boundaries.add(Math.max(0, Math.min(55, range.startSlot + range.slotsNeeded)));
      });

      const nearestBoundary = Array.from(boundaries).reduce((closest, boundary) => {
        const dayMidpointDistance = Math.abs(boundary - insertionSlot);
        const closestDistance = Math.abs(closest - insertionSlot);
        return dayMidpointDistance < closestDistance ? boundary : closest;
      }, insertionSlot);

      const MAGNETIC_SNAP_THRESHOLD_SLOTS = 0;
      if (Math.abs(nearestBoundary - insertionSlot) <= MAGNETIC_SNAP_THRESHOLD_SLOTS) {
        insertionSlot = nearestBoundary;
      }

      return insertionSlot;
    }

    const dayRect = dayContainer.getBoundingClientRect();
    const rawSlot = Math.max(0, Math.min(55, Math.floor(((clientY - dayRect.top) / Math.max(dayRect.height, 1)) * 56)));
    return rawSlot;
  }, [draggedJobId, getDaySlotLayout]);

  const getDragPreviewAnchorPoint = useCallback((clientX: number, clientY: number) => {
    const offset = dragPointerOffsetRef.current;
    const previewWidth = dragPreviewSize?.width ?? 140;
    const previewLeft = clientX - offset.x;
    const previewTop = clientY - offset.y;

    // Use a point near the top-left of the floating card so insertion preview
    // matches where the card body visually sits while dragging.
    const anchorX = previewLeft + Math.min(24, Math.max(12, previewWidth - 12));
    const anchorY = previewTop + 8;

    return { x: anchorX, y: anchorY };
  }, [dragPreviewSize]);

  const updateDragHoverFromPoint = useCallback((clientX: number, clientY: number) => {
    if (!draggedJobId) return;

    const anchorPoint = getDragPreviewAnchorPoint(clientX, clientY);

    const element = document.elementFromPoint(anchorPoint.x, anchorPoint.y);
    const slotElement = element?.closest('[data-time-slot]') as HTMLElement | null;

    if (slotElement) {
      const dayCard = slotElement.closest('[data-day-card]');
      const dateStr = dayCard?.getAttribute('data-date');
      const slotIndexStr = slotElement.getAttribute('data-slot-index');

      if (dateStr && slotIndexStr !== null) {
        const slotIndex = Number.parseInt(slotIndexStr, 10);
        const insertionSlot = getInsertionSlotForPointer(dateStr, slotIndex, anchorPoint.y, slotElement);
        setDragHoverTarget(dateStr, insertionSlot);
        return;
      }
    }

    const dayCard = element?.closest('[data-day-card]');
    const dateStr = dayCard?.getAttribute('data-date');
    if (dateStr) {
      const dayContainer = (dayCard as HTMLElement).querySelector('.time-slots-container') as HTMLElement | null;
      if (dayContainer) {
        const insertionSlot = getInsertionSlotForDayPointer(dateStr, anchorPoint.y, dayContainer);
        setDragHoverTarget(dateStr, insertionSlot);
      } else {
        setDragHoverTarget(dateStr);
      }
      return;
    }

    clearDragHoverTarget();
  }, [draggedJobId, getInsertionSlotForPointer, getInsertionSlotForDayPointer, setDragHoverTarget, clearDragHoverTarget, getDragPreviewAnchorPoint]);
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

    // Slot 0 = 5:00 AM, each slot = 15 minutes
    const totalMinutes = (5 * 60) + (slot * 15);
    const hour24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

    if (minutes === 0) return `${hour12} ${period}`;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  const getWeatherBandColor = (description: string, rainAmount: number): string => {
    const desc = description.toLowerCase();

    if (rainAmount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
      return LANDING_WEATHER_PALETTE.storm;
    }

    if (rainAmount > 1 || desc.includes('moderate rain')) {
      return LANDING_WEATHER_PALETTE.rain;
    }

    if (rainAmount > 0 || desc.includes('drizzle') || desc.includes('mist') || desc.includes('light rain')) {
      return LANDING_WEATHER_PALETTE.drizzle;
    }

    if (desc.includes('cloud') || desc.includes('overcast')) {
      return LANDING_WEATHER_PALETTE.cloud;
    }

    return LANDING_WEATHER_PALETTE.clear;
  };

  // Emoji-based weather glyphs to match the landing page icon style.
  const getWeatherIcon = (description: string, rainChance: number, rainAmount?: number, hour24?: number) => {
    const desc = description.toLowerCase();
    const amount = rainAmount || 0;
    
    // Check for snow
    if (desc.includes('snow') || desc.includes('sleet')) {
      return { glyph: '❄️', toneClass: 'text-blue-50' };
    }
    
    // Heavy rain/thunderstorm
    if (amount > 5 || desc.includes('thunder') || desc.includes('heavy')) {
      return { glyph: '🌧️', toneClass: 'text-blue-50' };
    }
    
    // Moderate rain
    if (amount > 1 || (rainChance >= 60 && desc.includes('rain'))) {
      return { glyph: '🌧️', toneClass: 'text-blue-50' };
    }
    
    // Light drizzle/mist
    if (amount > 0 || desc.includes('drizzle') || desc.includes('mist')) {
      return { glyph: '🌦️', toneClass: 'text-blue-50' };
    }
    
    // Cloudy
    if (desc.includes('cloud') || desc.includes('overcast')) {
      return { glyph: '☁️', toneClass: 'text-slate-100' };
    }
    
    // Clear sky - use time-based glyphs if hour is provided
    if (hour24 !== undefined) {
      if (hour24 >= 21 || hour24 < 5) {
        return { glyph: '🌙', toneClass: 'text-blue-50' };
      }
      else if (hour24 >= 5 && hour24 < 7) {
        return { glyph: '🌤️', toneClass: 'text-blue-50' };
      }
      else if (hour24 >= 7 && hour24 < 17) {
        return { glyph: '☀️', toneClass: 'text-blue-50' };
      }
      else if (hour24 >= 17 && hour24 < 21) {
        return { glyph: '🌤️', toneClass: 'text-blue-50' };
      }
    }
    
    return { glyph: '☀️', toneClass: 'text-blue-50' };
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
      return { background: LANDING_WEATHER_PALETTE.clear };
    }

    const colors = hourlyForecasts.map(forecast => {
      return getWeatherBandColor(forecast.description || '', forecast.rainAmount || 0);
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
    
    return { background: LANDING_WEATHER_PALETTE.clear };
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

  const [weatherSuggestions, setWeatherSuggestions] = useState<WeatherSuggestionState>({
    moveSuggestions: [],
    startTimeSuggestions: [],
    overnightRainDays: new Set()
  });
  const [showSuggestions, setShowSuggestions] = useState(true);

  const getEffectiveWorkWindow = useCallback((dateStr: string) => {
    const currentStartTime = dayStartTimes.get(dateStr) ?? WORK_DAY_START_HOUR;
    const currentEndTime = dayEndTimes.get(dateStr) ?? WORK_DAY_END_HOUR;
    const pendingSuggestion = weatherSuggestions.startTimeSuggestions.find(s => s.date === dateStr);

    const startDelayHours = pendingSuggestion?.type === 'delay'
      ? Math.max(0, (pendingSuggestion.suggestedStartTime ?? currentStartTime) - currentStartTime)
      : 0;
    const endEarlyHours = pendingSuggestion?.type === 'start-early'
      ? Math.max(0, currentEndTime - (pendingSuggestion.suggestedEndTime ?? currentEndTime))
      : 0;

    return {
      dayStartHour: currentStartTime,
      dayEndHour: currentEndTime,
      startDelayHours,
      endEarlyHours
    };
  }, [dayEndTimes, dayStartTimes, weatherSuggestions.startTimeSuggestions]);

  // Helper function to check if a day has capacity for additional jobs (time-based)
  const checkDayCapacity = useCallback((dateStr: string, additionalJobIds: string[] = []): { 
    hasCapacity: boolean; 
    reason?: string;
    totalMinutes?: number;
    maxMinutes?: number;
  } => {
    const assignedJobIds = Array.from(jobAssignments.entries())
      .filter(([_, targetDate]) => targetDate === dateStr)
      .map(([jobId]) => jobId);

    const reassignedAwayJobIds = Array.from(jobAssignments.entries())
      .filter(([_, targetDate]) => targetDate !== dateStr)
      .map(([jobId]) => jobId);

    const { dayStartHour, dayEndHour, startDelayHours, endEarlyHours } = getEffectiveWorkWindow(dateStr);

    const capacity = getDayCapacity(jobs, dateStr, {
      additionalJobIds,
      dayStartHour,
      dayEndHour,
      startDelayHours,
      endEarlyHours,
      excludeJobIds: [...assignedJobIds, ...reassignedAwayJobIds]
    });

    return {
      hasCapacity: capacity.hasCapacity,
      reason: capacity.reason,
      totalMinutes: capacity.totalMinutes,
      maxMinutes: capacity.maxMinutes
    };
  }, [getEffectiveWorkWindow, jobs, jobAssignments]);

  const queueRouteOptimization = useCallback(() => {
    if (!onOptimizeRoute) return;
    if (!startingAddress.trim()) return;

    if (optimizeAfterRescheduleTimeoutRef.current !== null) {
      clearTimeout(optimizeAfterRescheduleTimeoutRef.current);
    }

    optimizeAfterRescheduleTimeoutRef.current = window.setTimeout(() => {
      onOptimizeRoute();
      optimizeAfterRescheduleTimeoutRef.current = null;
    }, 350);
  }, [onOptimizeRoute, startingAddress]);

  useEffect(() => {
    return () => {
      if (optimizeAfterRescheduleTimeoutRef.current !== null) {
        clearTimeout(optimizeAfterRescheduleTimeoutRef.current);
      }
    };
  }, []);

  const pickBestRescheduleDay = useCallback((
    jobIds: string[],
    currentDate: string,
    candidateDates: string[],
    preferredDates: Set<string> = new Set()
  ): string | null => {
    if (jobIds.length === 0 || candidateDates.length === 0) {
      return null;
    }

    const marginLimit = RESCHEDULE_CAPACITY_MARGIN_PERCENT / 100;
    const uniqueCandidates = Array.from(new Set(candidateDates)).filter(date => date !== currentDate);
    const currentDateValue = new Date(currentDate + 'T00:00:00').getTime();

    let bestWithinMargin: { date: string; score: number } | null = null;
    let bestFallback: { date: string; score: number } | null = null;

    for (const candidateDate of uniqueCandidates) {
      const additionalJobIds = jobIds.filter(jobId => {
        const existingJob = jobs.find(job => job.id === jobId);
        return existingJob?.date !== candidateDate;
      });

      const capacity = checkDayCapacity(candidateDate, additionalJobIds);
      if (!capacity.hasCapacity || capacity.maxMinutes === undefined || capacity.totalMinutes === undefined || capacity.maxMinutes <= 0) {
        continue;
      }

      const utilization = capacity.totalMinutes / capacity.maxMinutes;
      const scheduledCount = jobs.filter(job => job.date === candidateDate && job.status === 'scheduled').length;
      const daysAway = Math.abs((new Date(candidateDate + 'T00:00:00').getTime() - currentDateValue) / (1000 * 60 * 60 * 24));
      const preferredPenalty = preferredDates.size > 0 && !preferredDates.has(candidateDate) ? 0.75 : 0;
      const score = utilization * 5 + scheduledCount * 0.2 + daysAway * 0.3 + preferredPenalty;

      if (!bestFallback || score < bestFallback.score) {
        bestFallback = { date: candidateDate, score };
      }

      if (utilization <= marginLimit) {
        if (!bestWithinMargin || score < bestWithinMargin.score) {
          bestWithinMargin = { date: candidateDate, score };
        }
      }
    }

    return bestWithinMargin?.date || bestFallback?.date || null;
  }, [checkDayCapacity, jobs]);

  // Check for days that overflow the work hour limit
  const checkForOverflow = useCallback(() => {
    const overflowSuggestions: MoveSuggestion[] = [];
    
    // Get unique dates that have jobs
    const datesWithJobs = new Set(jobs.filter(j => j.status === 'scheduled').map(j => j.date));
    
    datesWithJobs.forEach(dateStr => {
      const capacityCheck = checkDayCapacity(dateStr, []);
      
      if (capacityCheck.totalMinutes !== undefined && capacityCheck.maxMinutes !== undefined && capacityCheck.totalMinutes > capacityCheck.maxMinutes) {
        // Day is overflowing - need to move some jobs
        const jobsOnDay = jobs.filter(j => j.date === dateStr && j.status === 'scheduled');
        
        if (jobsOnDay.length === 0) return;
        
        // Calculate how many jobs need to be moved
        const overflowMinutes = capacityCheck.totalMinutes - capacityCheck.maxMinutes;
        
        // Sort jobs by total time (work + drive) to find which jobs to move
        const sortedJobs = [...jobsOnDay].sort((a, b) => {
          const aTime = getEstimatedJobMinutes(a);
          const bTime = getEstimatedJobMinutes(b);
          return bTime - aTime; // Largest first
        });
        
        // Select jobs to move (start with longest jobs)
        let remainingOverflow = overflowMinutes;
        const jobsToMove: Job[] = [];
        
        for (const job of sortedJobs) {
          if (remainingOverflow <= 0) break;
          jobsToMove.push(job);
          remainingOverflow -= getEstimatedJobMinutes(job);
        }
        
        if (jobsToMove.length === 0) return;
        
        const currentDate = new Date(dateStr + 'T00:00:00');
        const candidateDates: string[] = [];
        for (let i = 1; i <= 7; i++) {
          const futureDate = new Date(currentDate);
          futureDate.setDate(futureDate.getDate() + i);
          candidateDates.push(futureDate.toLocaleDateString('en-CA'));

          const pastDate = new Date(currentDate);
          pastDate.setDate(pastDate.getDate() - i);
          candidateDates.push(pastDate.toLocaleDateString('en-CA'));
        }

        const bestDay = pickBestRescheduleDay(jobsToMove.map(j => j.id), dateStr, candidateDates);
        
        if (bestDay) {
          const hours = Math.floor(capacityCheck.totalMinutes / 60);
          const mins = capacityCheck.totalMinutes % 60;
          const maxHours = Math.floor(capacityCheck.maxMinutes / 60);
          const maxMins = capacityCheck.maxMinutes % 60;
          
          overflowSuggestions.push({
            jobIds: jobsToMove.map(j => j.id),
            jobNames: jobsToMove.map(j => {
              const customer = customers.find(c => c.id === j.customerId);
              return customer ? customer.name : 'Unknown';
            }),
            jobCount: jobsToMove.length,
            currentDate: dateStr,
            suggestedDate: bestDay,
            reason: `Day overflows by ${Math.ceil(overflowMinutes / 60)}h. Total: ${hours}h ${mins}m exceeds ${maxHours}h ${maxMins}m limit.`,
            weatherSeverity: 'moderate',
            source: 'capacity'
          });
        }
      }
    });
    
    return overflowSuggestions;
  }, [jobs, customers, checkDayCapacity, dayStartTimes, pickBestRescheduleDay]);

  // Generate suggestions for moving jobs from bad weather days to good weather days
  const getWeatherBasedSuggestions = useCallback(() => {
    if (!weatherData?.daily || !jobs || jobs.length === 0) {
      return { moveSuggestions: [], startTimeSuggestions: [], overnightRainDays: new Set<string>() };
    }

    const moveSuggestions: MoveSuggestion[] = [];
    const startTimeSuggestions: StartTimeSuggestion[] = [];

    // Coordinate destination days so separate rain/capacity move suggestions
    // do not keep stacking into the same target date.
    const reservedTargetDates = new Set<string>();
    const projectedAdditionalMinutesByDate = new Map<string, number>();

    const getMoveMinutes = (jobIds: string[]): number => {
      return jobIds
        .map(jobId => jobs.find(job => job.id === jobId))
        .filter((job): job is Job => job !== undefined)
        .reduce((sum, job) => sum + getEstimatedJobMinutes(job), 0);
    };

    const pickCoordinatedRescheduleDay = (
      jobIds: string[],
      currentDate: string,
      candidateDates: string[],
      preferredDates: Set<string> = new Set(),
      options: { avoidReserved?: boolean } = {}
    ): string | null => {
      const { avoidReserved = true } = options;
      if (jobIds.length === 0 || candidateDates.length === 0) return null;

      const marginLimit = RESCHEDULE_CAPACITY_MARGIN_PERCENT / 100;
      const uniqueCandidates = Array.from(new Set(candidateDates)).filter(date => date !== currentDate);
      const currentDateValue = new Date(currentDate + 'T00:00:00').getTime();

      let bestWithinMargin: { date: string; score: number } | null = null;
      let bestFallback: { date: string; score: number } | null = null;

      for (const candidateDate of uniqueCandidates) {
        const additionalJobIds = jobIds.filter(jobId => {
          const existingJob = jobs.find(job => job.id === jobId);
          return existingJob?.date !== candidateDate;
        });

        const capacity = checkDayCapacity(candidateDate, additionalJobIds);
        if (!capacity.hasCapacity || capacity.maxMinutes === undefined || capacity.totalMinutes === undefined || capacity.maxMinutes <= 0) {
          continue;
        }

        const projectedTotal = capacity.totalMinutes + (projectedAdditionalMinutesByDate.get(candidateDate) || 0);
        if (projectedTotal > capacity.maxMinutes) {
          continue;
        }

        const utilization = projectedTotal / capacity.maxMinutes;
        const scheduledCount = jobs.filter(job => job.date === candidateDate && job.status === 'scheduled').length;
        const daysAway = Math.abs((new Date(candidateDate + 'T00:00:00').getTime() - currentDateValue) / (1000 * 60 * 60 * 24));
        const preferredPenalty = preferredDates.size > 0 && !preferredDates.has(candidateDate) ? 0.75 : 0;
        const reservedPenalty = avoidReserved && reservedTargetDates.has(candidateDate) ? 1.5 : 0;
        const score = utilization * 5 + scheduledCount * 0.2 + daysAway * 0.3 + preferredPenalty + reservedPenalty;

        if (!bestFallback || score < bestFallback.score) {
          bestFallback = { date: candidateDate, score };
        }

        if (utilization <= marginLimit) {
          if (!bestWithinMargin || score < bestWithinMargin.score) {
            bestWithinMargin = { date: candidateDate, score };
          }
        }
      }

      return bestWithinMargin?.date || bestFallback?.date || null;
    };

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
    // Prioritize heavier and busier days first to improve overall distribution.
    const prioritizedBadWeatherDays = [...badWeatherDays].sort((a, b) => {
      const aIndex = forecastDates.indexOf(a);
      const bIndex = forecastDates.indexOf(b);
      const aWeather = forecast[aIndex];
      const bWeather = forecast[bIndex];
      const aHeavy = aWeather?.hourlyForecasts?.some((f: any) => (f.rainAmount || 0) > 5 || f.description.toLowerCase().includes('thunder')) ? 1 : 0;
      const bHeavy = bWeather?.hourlyForecasts?.some((f: any) => (f.rainAmount || 0) > 5 || f.description.toLowerCase().includes('thunder')) ? 1 : 0;
      if (aHeavy !== bHeavy) return bHeavy - aHeavy;

      const aJobs = jobs.filter(j => j.date === a && j.status === 'scheduled').length;
      const bJobs = jobs.filter(j => j.date === b && j.status === 'scheduled').length;
      return bJobs - aJobs;
    });

    prioritizedBadWeatherDays.forEach(badDate => {
      const jobsOnBadDay = jobs.filter(j => j.date === badDate && j.status === 'scheduled');
      
      console.log(`Checking bad day ${badDate}: Found ${jobsOnBadDay.length} jobs`, jobsOnBadDay.map(j => ({ id: j.id, date: j.date, customer: customers.find(c => c.id === j.customerId)?.name })));
      
      if (jobsOnBadDay.length > 0) {
        // Determine weather severity
        const dayIndex = forecastDates.indexOf(badDate);
        const dayWeather = forecast[dayIndex];
        
        const hasHeavyRain = dayWeather?.hourlyForecasts?.some((f: any) => 
          (f.rainAmount || 0) > 5 || f.description.toLowerCase().includes('thunder')
        );

        // Find good weather days after the bad date
        const futureDays = goodWeatherDays.filter(d => d > badDate);
        
        // If no future days, use any good day
        const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;

        const suggestedDate = pickCoordinatedRescheduleDay(
          jobsOnBadDay.map(j => j.id),
          badDate,
          candidateDays,
          new Set(goodWeatherDays),
          { avoidReserved: true }
        );

        if (suggestedDate) {
          const weatherSeverity: MoveSuggestion['weatherSeverity'] = hasHeavyRain ? 'heavy' : 'moderate';
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
            weatherSeverity,
            source: 'weather' as const,
            jobCount: jobsOnBadDay.length
          };
          
          console.log(`📌 CREATING COMBINED SUGGESTION for ${jobsOnBadDay.length} jobs on ${badDate}:`, {
            currentDate: badDate,
            suggestedDate: suggestedDate,
            jobCount: jobsOnBadDay.length
          });

          reservedTargetDates.add(suggestedDate);
          const moveMinutes = getMoveMinutes(jobsOnBadDay.map(j => j.id));
          projectedAdditionalMinutesByDate.set(
            suggestedDate,
            (projectedAdditionalMinutesByDate.get(suggestedDate) || 0) + moveMinutes
          );
          
          moveSuggestions.push(suggestionObj);
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

            // Calculate how much time remains after the delayed start using the actual day end time
            const dayEndHour = dayEndTimes.get(dateStr) ?? WORK_DAY_END_HOUR;
            const availableMinutes = Math.max(0, (dayEndHour - weatherInfo.clearsByHour) * 60);
            let fitMinutes = 0;
            let jobsThatFit = 0;

            for (const job of jobsOnDay) {
              const jobMinutes = getEstimatedJobMinutes(job);
              if (fitMinutes + jobMinutes > availableMinutes) break;
              fitMinutes += jobMinutes;
              jobsThatFit++;
            }
            
            // If we have more jobs than can fit, suggest moving the overflow
            if (jobsThatFit < jobsOnDay.length) {
              const jobsToMove = jobsOnDay.length - jobsThatFit;
              
              // Find least busy good weather day
              const futureDays = goodWeatherDays.filter(d => d > dateStr);
              const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;
              const jobsToMoveArray = jobsOnDay.slice(-jobsToMove);
              const bestDay = pickCoordinatedRescheduleDay(
                jobsToMoveArray.map(j => j.id),
                dateStr,
                candidateDays,
                new Set(goodWeatherDays),
                { avoidReserved: true }
              );

              if (!bestDay) {
                return;
              }
              
              // Suggest moving the overflow jobs - COMBINE into single suggestion
              
              moveSuggestions.push({
                jobIds: jobsToMoveArray.map(j => j.id), // Array of all job IDs
                jobNames: jobsToMoveArray.map(j => {
                  const customer = customers.find(c => c.id === j.customerId);
                  return customer ? customer.name : 'Unknown Customer';
                }),
                currentDate: dateStr,
                suggestedDate: bestDay,
                reason: `Not enough time after delaying start to ${weatherInfo.clearsByHour}:00. Only ${jobsThatFit} job${jobsThatFit !== 1 ? 's' : ''} fit in the remaining window.`,
                weatherSeverity: 'moderate',
                source: 'weather',
                jobCount: jobsToMove
              });

              reservedTargetDates.add(bestDay);
              const moveMinutes = getMoveMinutes(jobsToMoveArray.map(j => j.id));
              projectedAdditionalMinutesByDate.set(
                bestDay,
                (projectedAdditionalMinutesByDate.get(bestDay) || 0) + moveMinutes
              );
            }

            // Only suggest start time adjustment if user hasn't already adjusted it
            // (If currentStartTime >= clearsByHour, they've already accepted the delay)
            if (currentStartTime < weatherInfo.clearsByHour) {
              startTimeSuggestions.push({
                date: dateStr,
                currentStartTime,
                suggestedStartTime: weatherInfo.clearsByHour,
                reason,
                jobCount: jobsThatFit,
                type: 'delay'
              });
            }
          }
        } else if (weatherInfo.suggestion === 'start-early') {
          // Evening rain - suggest starting earlier OR moving jobs
          const lastGoodHour = weatherInfo.lastGoodHour || 14;
          
          // Check if user already set a custom end time for this day
          const hasCustomEndTime = dayEndTimes.has(dateStr);
          
          // Calculate how much time fits before rain starts using the actual current start time
          const availableMinutes = Math.max(0, (lastGoodHour - currentStartTime) * 60);
          let fitMinutes = 0;
          let jobsThatFit = 0;

          for (const job of jobsOnDay) {
            const jobMinutes = getEstimatedJobMinutes(job);
            if (fitMinutes + jobMinutes > availableMinutes) break;
            fitMinutes += jobMinutes;
            jobsThatFit++;
          }
          
          // If we have more jobs than can fit before rain, suggest moving the overflow
          if (jobsThatFit < jobsOnDay.length) {
            const jobsToMove = jobsOnDay.length - jobsThatFit;
            
            // Find least busy good weather day
            const futureDays = goodWeatherDays.filter(d => d > dateStr);
            const candidateDays = futureDays.length > 0 ? futureDays : goodWeatherDays;
            // Suggest moving the jobs that won't fit - COMBINE into single suggestion
            const jobsToMoveArray = jobsOnDay.slice(-jobsToMove);
            const bestDay = pickCoordinatedRescheduleDay(
              jobsToMoveArray.map(j => j.id),
              dateStr,
              candidateDays,
              new Set(goodWeatherDays),
              { avoidReserved: true }
            );

            if (!bestDay) {
              return;
            }
            
            moveSuggestions.push({
              jobIds: jobsToMoveArray.map(j => j.id), // Array of all job IDs
              jobNames: jobsToMoveArray.map(j => {
                const customer = customers.find(c => c.id === j.customerId);
                return customer ? customer.name : 'Unknown Customer';
              }),
              currentDate: dateStr,
              suggestedDate: bestDay,
              reason: `Rain starts at ${lastGoodHour}:00. Only ${jobsThatFit} job${jobsThatFit !== 1 ? 's' : ''} fit before rain.`,
              weatherSeverity: 'moderate',
              source: 'weather',
              jobCount: jobsToMove
            });

            reservedTargetDates.add(bestDay);
            const moveMinutes = getMoveMinutes(jobsToMoveArray.map(j => j.id));
            projectedAdditionalMinutesByDate.set(
              bestDay,
              (projectedAdditionalMinutesByDate.get(bestDay) || 0) + moveMinutes
            );
          }
          
          // Only suggest end time adjustment if user hasn't already set one
          if (!hasCustomEndTime) {
            startTimeSuggestions.push({
              date: dateStr,
              currentStartTime,
              suggestedStartTime: 6, // Start at 6 AM
              suggestedEndTime: lastGoodHour, // End before rain
              reason: `Rain expected at ${lastGoodHour}:00. Limit work to ${Math.floor(availableMinutes / 60)}h ${availableMinutes % 60}m (6 AM - ${lastGoodHour}:00)`,
              jobCount: jobsThatFit,
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
  }, [weatherData, jobs, customers, dayStartTimes, dayEndTimes, checkDayCapacity]);

  const dedupeMoveSuggestions = useCallback((moveSuggestions: MoveSuggestion[]): MoveSuggestion[] => {
    const byDate = new Map<string, MoveSuggestion>();

    const getPriority = (suggestion: MoveSuggestion): number => {
      let score = 0;
      if ((suggestion.source ?? 'weather') === 'weather') score += 100;
      if (suggestion.weatherSeverity === 'heavy') score += 20;
      score += suggestion.jobCount || 0;
      return score;
    };

    moveSuggestions.forEach((suggestion) => {
      const existing = byDate.get(suggestion.currentDate);
      if (!existing || getPriority(suggestion) > getPriority(existing)) {
        byDate.set(suggestion.currentDate, suggestion);
      }
    });

    return Array.from(byDate.values());
  }, []);

  // Update suggestions when weather or jobs change
  useEffect(() => {
    const suggestions = getWeatherBasedSuggestions();
    
    // Check for overflow and add overflow suggestions
    const overflowSuggestions = checkForOverflow();
    
    // Merge weather-based and overflow suggestions
    const mergedSuggestions = {
      moveSuggestions: dedupeMoveSuggestions([...suggestions.moveSuggestions, ...overflowSuggestions]),
      startTimeSuggestions: suggestions.startTimeSuggestions,
      overnightRainDays: suggestions.overnightRainDays || new Set()
    };
    
    setWeatherSuggestions(mergedSuggestions);
    setDaysWithOvernightRain(mergedSuggestions.overnightRainDays);
    // Always show suggestions when there are any (even if previously dismissed)
    const hasSuggestions = mergedSuggestions.moveSuggestions.length > 0 || mergedSuggestions.startTimeSuggestions.length > 0;
    if (hasSuggestions) {
      setShowSuggestions(true);
    }
  }, [getWeatherBasedSuggestions, jobs, dayStartTimes, dedupeMoveSuggestions]);

  // Accept individual move suggestion (handles both single job and multiple jobs)
  const acceptMoveSuggestion = useCallback(async (suggestion: MoveSuggestion, newDate: string) => {
    if (!onRescheduleJob) return;
    
    // Handle both single job (jobId) and multiple jobs (jobIds)
    const jobIds = (suggestion.jobIds || (suggestion.jobId ? [suggestion.jobId] : [])).filter((jobId): jobId is string => Boolean(jobId));
    const additionalJobIds = jobIds.filter((jobId) => {
      const job = jobs.find(j => j.id === jobId);
      return job?.date !== newDate;
    });

    const capacityCheck = checkDayCapacity(newDate, additionalJobIds);
    if (!capacityCheck.hasCapacity) {
      toast.error(`Cannot move ${jobIds.length} job${jobIds.length !== 1 ? 's' : ''}: ${capacityCheck.reason}`);
      return;
    }
    
    for (const jobId of jobIds as string[]) {
      await Promise.resolve(onRescheduleJob(jobId, newDate));
    }

    const sourceDayScheduledJobIds = jobs
      .filter(job => job.date === suggestion.currentDate && job.status === 'scheduled')
      .map(job => job.id);
    const movedAllJobsForDay = sourceDayScheduledJobIds.length > 0
      && sourceDayScheduledJobIds.every(jobId => jobIds.includes(jobId));

    if (suggestion.source === 'weather' && movedAllJobsForDay) {
      setPersistedRainedOutDays(prev => {
        const next = new Set(prev);
        next.add(suggestion.currentDate);
        return next;
      });
    }
    
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
    const isCapacityMove = suggestion.source === 'capacity';
    queueRouteOptimization();
    toast.success(
      isCapacityMove
        ? `${jobCount} job${jobCount !== 1 ? 's' : ''} rescheduled to balance day capacity`
        : `${jobCount} job${jobCount !== 1 ? 's' : ''} rescheduled to better weather day`
    );
  }, [jobs, onRescheduleJob, checkDayCapacity, queueRouteOptimization]);

  const getJobPriority = useCallback((job: Job) => {
    const customer = customers.find(c => c.id === job.customerId);
    const price = Number(customer?.price || 0);
    const duration = getEstimatedJobMinutes(job);
    const ratio = duration > 0 ? price / duration : price;
    return { price, duration, ratio };
  }, [customers]);

  const selectJobsToMoveForCapacity = useCallback((jobsOnDay: Job[], availableMinutes: number) => {
    if (availableMinutes <= 0 || jobsOnDay.length === 0) {
      return [] as Job[];
    }

    const rankedJobs = [...jobsOnDay]
      .map(job => ({ job, ...getJobPriority(job) }))
      .sort((a, b) => b.ratio - a.ratio);

    const keptJobIds = new Set<string>();
    let usedMinutes = 0;

    rankedJobs.forEach(({ job, duration }) => {
      if (usedMinutes + duration <= availableMinutes) {
        keptJobIds.add(job.id);
        usedMinutes += duration;
      }
    });

    return jobsOnDay.filter(job => !keptJobIds.has(job.id));
  }, [getJobPriority]);

  const selectBestFitSubsetForDay = useCallback((jobIds: string[], targetDate: string): Job[] => {
    const jobsToTry = jobIds
      .map(jobId => jobs.find(job => job.id === jobId))
      .filter((job): job is Job => job !== undefined);

    if (jobsToTry.length === 0) {
      return [];
    }

    const effectiveWindow = getEffectiveWorkWindow(targetDate);
    const existingMinutes = jobs
      .filter(job => job.date === targetDate && job.status === 'scheduled' && !jobIds.includes(job.id))
      .reduce((sum, job) => sum + getEstimatedJobMinutes(job), 0);
    const availableMinutes = Math.max(0, getUsableDayMinutes(effectiveWindow.dayStartHour, effectiveWindow.dayEndHour, {
      startDelayHours: effectiveWindow.startDelayHours,
      endEarlyHours: effectiveWindow.endEarlyHours
    }) - existingMinutes);

    if (availableMinutes <= 0) {
      return [];
    }

    const rankedJobs = [...jobsToTry]
      .map(job => ({ job, ...getJobPriority(job) }))
      .sort((a, b) => b.ratio - a.ratio);

    const selectedJobs: Job[] = [];
    let usedMinutes = 0;

    rankedJobs.forEach(({ job, duration }) => {
      if (usedMinutes + duration <= availableMinutes) {
        selectedJobs.push(job);
        usedMinutes += duration;
      }
    });

    return selectedJobs;
  }, [dayStartTimes, dayEndTimes, getJobPriority, jobs]);

  const findBestAlternativeDayForJobs = useCallback((jobIds: string[], currentDate: string): { date: string; movedJobs: Job[] } | null => {
    if (jobIds.length === 0) {
      return null;
    }

    const currentDateValue = new Date(currentDate);
    const forecast = weatherData?.daily || [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    const forecastDates: string[] = [];

    forecast.forEach((_, index) => {
      const date = new Date(year, month, day + index);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      forecastDates.push(`${yyyy}-${mm}-${dd}`);
    });

    const candidateDates = new Set<string>();

    forecastDates.forEach((dateStr, index) => {
      if (dateStr === currentDate) return;
      if (forecast[index] && isGoodWeatherDay(forecast[index])) {
        candidateDates.add(dateStr);
      }
    });

    for (let offset = 1; offset <= 7; offset++) {
      const futureDate = new Date(currentDateValue);
      futureDate.setDate(futureDate.getDate() + offset);
      candidateDates.add(futureDate.toLocaleDateString('en-CA'));

      const pastDate = new Date(currentDateValue);
      pastDate.setDate(pastDate.getDate() - offset);
      candidateDates.add(pastDate.toLocaleDateString('en-CA'));
    }

    let bestPlan: { date: string; movedJobs: Job[] } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    Array.from(candidateDates).forEach(dateStr => {
      if (dateStr === currentDate) return;

      const { dayStartHour, dayEndHour, startDelayHours, endEarlyHours } = getEffectiveWorkWindow(dateStr);
      const availableMinutes = getUsableDayMinutes(dayStartHour, dayEndHour, {
        startDelayHours,
        endEarlyHours
      });

      if (availableMinutes <= 0) return;

      const movingJobs = selectBestFitSubsetForDay(jobIds, dateStr);
      if (movingJobs.length === 0) return;

      const jobsOnDay = jobs.filter(job => job.date === dateStr && job.status === 'scheduled').length;
      const distance = Math.abs((new Date(dateStr).getTime() - currentDateValue.getTime()) / (1000 * 60 * 60 * 24));
      const weatherPenalty = forecastDates.includes(dateStr) && weatherData?.daily ? 0 : 1;
      const score = (jobIds.length - movingJobs.length) * 1000 + jobsOnDay + distance + weatherPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestPlan = { date: dateStr, movedJobs: movingJobs };
      }
    });

    return bestPlan;
  }, [dayStartTimes, dayEndTimes, jobs, selectBestFitSubsetForDay, weatherData, isGoodWeatherDay]);

  const applyDayTimeAdjustment = useCallback((
    date: string,
    newStartTime: number,
    newEndTime?: number,
    options: { moveOverflowJobs?: boolean } = {}
  ) => {
    const { moveOverflowJobs = false } = options;
    const resolvedEndTime = newEndTime ?? dayEndTimes.get(date) ?? DEFAULT_DAY_END_HOUR;
    const capacityCheck = getDayCapacity(jobs, date, {
      dayStartHour: newStartTime,
      dayEndHour: resolvedEndTime
    });

    const jobsOnDay = jobs.filter(job => job.date === date && job.status === 'scheduled');
    const jobsToMove = capacityCheck.hasCapacity
      ? []
      : selectJobsToMoveForCapacity(jobsOnDay, capacityCheck.availableMinutes);

    let targetDate: string | null = null;
    let movedJobs: Job[] = [];
    if (moveOverflowJobs && jobsToMove.length > 0 && onRescheduleJob) {
      const bestPlan = findBestAlternativeDayForJobs(jobsToMove.map(job => job.id), date);
      targetDate = bestPlan?.date || null;
      movedJobs = bestPlan?.movedJobs || [];
    }

    setDayStartTimes(prev => {
      const newMap = new Map(prev);
      newMap.set(date, newStartTime);
      return newMap;
    });

    if (newEndTime !== undefined) {
      setDayEndTimes(prev => {
        const newMap = new Map(prev);
        newMap.set(date, newEndTime);
        return newMap;
      });
    }

    if (onStartTimeChange) {
      onStartTimeChange(date, newStartTime);
    }

    if (movedJobs.length > 0 && targetDate && onRescheduleJob) {
      movedJobs.forEach(job => {
        onRescheduleJob(job.id, targetDate!);
      });
    }

    return {
      movedJobs,
      targetDate
    };
  }, [dayEndTimes, findBestAlternativeDayForJobs, jobs, onRescheduleJob, onStartTimeChange, selectJobsToMoveForCapacity]);

  // Accept individual start time suggestion without auto-moving unrelated jobs.
  const acceptStartTimeSuggestion = useCallback((date: string, newStartTime: number, newEndTime?: number) => {
    const adjustment = applyDayTimeAdjustment(date, newStartTime, newEndTime, { moveOverflowJobs: false });

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

    if (adjustment.movedJobs.length > 0 && adjustment.targetDate) {
      queueRouteOptimization();
      toast.success(`Schedule adjusted: ${startLabel} - ${endLabel || 'day end'} and ${adjustment.movedJobs.length} job${adjustment.movedJobs.length !== 1 ? 's' : ''} moved to ${adjustment.targetDate}`);
    } else if (endLabel) {
      toast.success(`Schedule adjusted: ${startLabel} - ${endLabel}`);
    } else {
      toast.success(`Start time adjusted to ${startLabel}`);
    }
  }, [applyDayTimeAdjustment, queueRouteOptimization]);

  // Accept all move suggestions and move jobs
  const acceptAllSuggestions = useCallback(async () => {
    const movedJobsByDate = new Map<string, Set<string>>();

    // Move jobs to different days
    for (const suggestion of weatherSuggestions.moveSuggestions) {
      if (!onRescheduleJob) continue;
      const jobIds = suggestion.jobIds || (suggestion.jobId ? [suggestion.jobId] : []);
      const validJobIds = jobIds.filter((jobId): jobId is string => Boolean(jobId));

      if (suggestion.source === 'weather' && validJobIds.length > 0) {
        const existing = movedJobsByDate.get(suggestion.currentDate) || new Set<string>();
        validJobIds.forEach(jobId => existing.add(jobId));
        movedJobsByDate.set(suggestion.currentDate, existing);
      }

      for (const jobId of jobIds) {
        if (jobId) {
          await Promise.resolve(onRescheduleJob(jobId, suggestion.suggestedDate));
        }
      }
    }

    setPersistedRainedOutDays(prev => {
      const next = new Set(prev);

      movedJobsByDate.forEach((movedIds, date) => {
        const sourceDayScheduledJobIds = jobs
          .filter(job => job.date === date && job.status === 'scheduled')
          .map(job => job.id);
        const movedAllJobsForDay = sourceDayScheduledJobIds.length > 0
          && sourceDayScheduledJobIds.every(jobId => movedIds.has(jobId));

        if (movedAllJobsForDay) {
          next.add(date);
        }
      });

      return next;
    });

    // Adjust start times for partial bad weather days
    weatherSuggestions.startTimeSuggestions.forEach(suggestion => {
      applyDayTimeAdjustment(suggestion.date, suggestion.suggestedStartTime, suggestion.suggestedEndTime, { moveOverflowJobs: false });
    });

    const totalChanges = weatherSuggestions.moveSuggestions.length + weatherSuggestions.startTimeSuggestions.length;
    queueRouteOptimization();
    toast.success(`Applied ${totalChanges} weather adjustment${totalChanges !== 1 ? 's' : ''}`);
    setShowSuggestions(false);
  }, [weatherSuggestions, jobs, onRescheduleJob, onStartTimeChange, queueRouteOptimization]);

  // Temporary global hook so App-level "Apply All" buttons can trigger this action.
  useEffect(() => {
    const handleApplyAllSuggestions = () => {
      void acceptAllSuggestions();
    };

    window.addEventListener('applyAllSuggestions', handleApplyAllSuggestions);
    return () => window.removeEventListener('applyAllSuggestions', handleApplyAllSuggestions);
  }, [acceptAllSuggestions]);

  // Dismiss suggestions
  const dismissSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  const formatSuggestionWeekday = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatSuggestionHour = (hour: number): string => {
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour} ${period}`;
  };

  const getSuggestionPresentation = (
    activeSuggestion:
      | { kind: 'move'; suggestion: MoveSuggestion }
      | { kind: 'time'; suggestion: StartTimeSuggestion }
  ) => {
    if (activeSuggestion.kind === 'move') {
      const suggestion = activeSuggestion.suggestion;
      const jobCount = suggestion.jobCount || suggestion.jobIds?.length || (suggestion.jobId ? 1 : 0);
      const moveTarget = formatSuggestionWeekday(suggestion.suggestedDate);
      const toneClass = suggestion.source === 'capacity' ? 'bg-amber-500' : 'bg-blue-600';

      return {
        badge: suggestion.source === 'capacity'
          ? 'Capacity'
          : suggestion.weatherSeverity === 'heavy'
          ? 'Heavy Rain'
          : 'Rain',
        toneClass,
        title: `Move ${jobCount} job${jobCount === 1 ? '' : 's'} to ${moveTarget}`,
        detail: '',
        actionLabel: `Move to ${moveTarget}`,
      };
    }

    const suggestion = activeSuggestion.suggestion;
    const actionLabel = suggestion.type === 'delay'
      ? `Start ${formatSuggestionHour(suggestion.suggestedStartTime)}`
      : `End ${suggestion.suggestedEndTime ? formatSuggestionHour(suggestion.suggestedEndTime) : formatSuggestionHour(suggestion.suggestedStartTime)}`;
    return {
      badge: suggestion.type === 'delay' ? 'Delay' : 'End Early',
      toneClass: 'bg-blue-500',
      title: actionLabel,
      detail: '',
      actionLabel: 'Apply',
    };
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
    if (DEMO_MODE && location) {
      // Auto-load weather for demo mode with preset location
      loadWeather(location);
    } else if (location && jobs.length === 0) {
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
  const handleDragStart = (e: React.MouseEvent | React.DragEvent, jobId: string) => {
    const target = e.currentTarget as HTMLElement;
    if ((e.target as HTMLElement)?.closest('button, input, a, select, textarea')) {
      return;
    }

    e.preventDefault();
    const rect = target.getBoundingClientRect();
    pendingDragRef.current = {
      jobId,
      x: e.clientX,
      y: e.clientY,
      offsetX: Math.max(8, e.clientX - rect.left),
      offsetY: Math.max(8, e.clientY - rect.top),
      target,
    };
  };

  const activateDrag = (
    jobId: string,
    clientX: number,
    clientY: number,
    target: HTMLElement | null,
    offsetX = 15,
    offsetY = 15
  ) => {
    const rect = target?.getBoundingClientRect();
    setDragPreviewSize({ width: rect?.width ?? 140, height: rect?.height ?? 70 });
    dragPointerOffsetRef.current = { x: offsetX, y: offsetY };

    const job = jobs.find(j => j.id === jobId);
    const customer = customers.find(c => c.id === job?.customerId);
    const groupId = customer?.groupId;

    if (groupId) {
      const group = customerGroups.find(g => g.id === groupId);
      if (group) {
        const jobDate = job?.date;
        const groupJobs = jobs.filter(j => {
          if (j.date !== jobDate) return false;
          const jobCustomer = customers.find(c => c.id === j.customerId);
          return jobCustomer?.groupId === groupId;
        }).map(j => j.id);

        setDraggedGroupJobs(groupJobs);
      } else {
        setDraggedGroupJobs([]);
      }
    } else {
      setDraggedGroupJobs([]);
    }

    setDraggedJobId(jobId);
    setDragPosition({ x: clientX, y: clientY });
    updateDragHoverFromPoint(clientX, clientY);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string, slotIndex?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const anchorY = draggedJobId
      ? getDragPreviewAnchorPoint(e.clientX, e.clientY).y
      : e.clientY;

    if (slotIndex === undefined || !draggedJobId) {
      setDragHoverTarget(dateStr, slotIndex);
      return;
    }

    const slotElement = e.currentTarget as HTMLElement;
    const insertionSlot = getInsertionSlotForPointer(dateStr, slotIndex, anchorY, slotElement);

    setDragHoverTarget(dateStr, insertionSlot);
  };

  const handleDayCardDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const anchorY = draggedJobId
      ? getDragPreviewAnchorPoint(e.clientX, e.clientY).y
      : e.clientY;

    if (draggedJobId) {
      const dayContainer = (e.currentTarget as HTMLElement).querySelector('.time-slots-container') as HTMLElement | null;
      if (dayContainer) {
        const insertionSlot = getInsertionSlotForDayPointer(dateStr, anchorY, dayContainer);
        setDragHoverTarget(dateStr, insertionSlot);
        return;
      }
    }

    setDragHoverTarget(dateStr);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const currentTarget = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as Node | null;

    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    clearDragHoverTarget();
  };
  
  // Track mouse movement for drag preview without flooding the console or rerendering on every pixel.
  useEffect(() => {
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (pending) {
        const deltaX = e.clientX - pending.x;
        const deltaY = e.clientY - pending.y;
        if (Math.hypot(deltaX, deltaY) > 4) {
          activateDrag(pending.jobId, e.clientX, e.clientY, pending.target, pending.offsetX, pending.offsetY);
          pendingDragRef.current = null;
        }
        return;
      }

      if (!draggedJobId) return;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        setDragPosition({ x: e.clientX, y: e.clientY });
        updateDragHoverFromPoint(e.clientX, e.clientY);
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (pending) {
        pendingDragRef.current = null;
        return;
      }

      if (!draggedJobId) return;

      // Force one last target evaluation at pointer release so adjacent-slot
      // drops do not use a stale hover target from the rAF mousemove loop.
      updateDragHoverFromPoint(e.clientX, e.clientY);

      const hoverTarget = dragHoverRef.current;
      const targetDate = hoverTarget?.date ?? null;
      const targetSlot = hoverTarget?.slot ?? null;

      if (targetDate && targetSlot !== null) {
        handleSlotDrop({
          preventDefault: () => {},
          stopPropagation: () => {}
        } as any, targetDate, targetSlot);
      } else {
        clearDragHoverTarget();
        setDraggedJobId(null);
        setDraggedGroupJobs([]);
        setDragPosition(null);
        setDragPreviewSize(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedJobId, clearDragHoverTarget, activateDrag, updateDragHoverFromPoint]);

  const handleSlotDrop = async (e: React.DragEvent, dateStr: string, targetSlot: number) => {
    e.preventDefault();
    e.stopPropagation();

    const resolvedTargetSlot = dragHoverRef.current?.date === dateStr && dragHoverRef.current.slot !== undefined
      ? dragHoverRef.current.slot
      : targetSlot;
    
    console.log('📍 SLOT DROP TRIGGERED:', { 
      date: dateStr, 
      slot: resolvedTargetSlot,
      draggedJobId, 
      groupJobs: draggedGroupJobs.length,
      hasOnRescheduleJob: !!onRescheduleJob
    });
    
    clearDragHoverTarget();
    setDragPosition(null);

    if (draggedJobId && onRescheduleJob) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job) {
        // Check capacity before allowing drop
        const jobIdsToMove = draggedGroupJobs.length > 1 ? draggedGroupJobs : [draggedJobId];
        
        // Filter out jobs already on this date (just reordering)
        const additionalJobIds = jobIdsToMove.filter(jId => {
          const j = jobs.find(job => job.id === jId);
          return j?.date !== dateStr;
        });
        
        if (additionalJobIds.length > 0) {
          const capacityCheck = checkDayCapacity(dateStr, additionalJobIds);
          if (!capacityCheck.hasCapacity) {
            toast.error(`Cannot move ${jobIdsToMove.length} job${jobIdsToMove.length > 1 ? 's' : ''}: ${capacityCheck.reason}`);
            setDraggedJobId(null);
            setDraggedGroupJobs([]);
            setDragPosition(null);
            setDragOverSlot(null);
            setDragOverDay(null);
            return;
          }
        }
        
        // Check if this is a group drag
        if (draggedGroupJobs.length > 1) {
          console.log('🔷 Dropping group of', draggedGroupJobs.length, 'jobs at slot', resolvedTargetSlot);
          
          // Move all jobs in the group to consecutive slots starting at targetSlot
          for (let i = 0; i < draggedGroupJobs.length; i++) {
            const groupJobId = draggedGroupJobs[i];
            const slotForThisJob = resolvedTargetSlot + i;
            console.log(`  Moving job ${i + 1}/${draggedGroupJobs.length} to slot ${slotForThisJob}`);
            await onRescheduleJob(groupJobId, dateStr, slotForThisJob);
          }
          
          toast.success(`Moved ${draggedGroupJobs.length} properties`);
        } else {
          // Single job move (or time slot change on same day)
          console.log('📍 Moving single job to', dateStr, 'slot', resolvedTargetSlot);

          if (job.date === dateStr) {
            // Reorder immediately within the day so users see the insert result right away.
            const layout = getDaySlotLayout(dateStr, draggedJobId);
            const reordered = [...layout.orderedJobs];
            const draggedJob = jobs.find(j => j.id === draggedJobId);

            if (draggedJob) {
              const placements = Array.from(layout.byStartSlot.values()).sort((a, b) => a.startSlot - b.startSlot);
              let insertAt = reordered.length;

              for (let i = 0; i < placements.length; i++) {
                if (resolvedTargetSlot <= placements[i].startSlot) {
                  insertAt = i;
                  break;
                }
              }

              reordered.splice(insertAt, 0, draggedJob);

              setJobTimeSlots(prev => {
                const newMap = new Map(prev);
                let runningSlot = layout.slotOffset;
                reordered.forEach((dayJob) => {
                  newMap.set(dayJob.id, runningSlot);
                  runningSlot += Math.max(1, Math.ceil(getEstimatedJobMinutes(dayJob) / 15));
                });
                return newMap;
              });
            }
          }
          
          // Save last action for undo
          setLastAction({
            type: 'move',
            jobId: draggedJobId,
            fromDate: job.date,
            toDate: dateStr,
            timeSlot: resolvedTargetSlot
          });
          
          // Immediately save the change
          await onRescheduleJob(draggedJobId, dateStr, resolvedTargetSlot);
          
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

    const hoverTarget = dragHoverRef.current;
    if (hoverTarget?.date === dateStr && hoverTarget.slot !== undefined) {
      await handleSlotDrop(e, dateStr, hoverTarget.slot);
      return;
    }
    
    console.log('🎯 DROP ATTEMPT:', {
      targetDate: dateStr,
      draggedJobId,
      isGroupDrag: draggedGroupJobs.length > 1
    });
    
    clearDragHoverTarget();
    setDragPosition(null);

    if (draggedJobId) {
      const job = jobs.find(j => j.id === draggedJobId);
      
      if (job && onRescheduleJob) {
        // Check capacity before allowing drop
        const jobIdsToMove = draggedGroupJobs.length > 1 ? draggedGroupJobs : [draggedJobId];
        
        // Filter out jobs already on this date (just reordering)
        const additionalJobIds = jobIdsToMove.filter(jId => {
          const j = jobs.find(job => job.id === jId);
          return j?.date !== dateStr;
        });
        
        if (additionalJobIds.length > 0) {
          const capacityCheck = checkDayCapacity(dateStr, additionalJobIds);
          if (!capacityCheck.hasCapacity) {
            toast.error(`Cannot move ${jobIdsToMove.length} job${jobIdsToMove.length > 1 ? 's' : ''}: ${capacityCheck.reason}`);
            setDraggedJobId(null);
            setDraggedGroupJobs([]);
            setDragPosition(null);
            setDragOverDay(null);
            setDragOverSlot(null);
            return;
          }
        }
        
        // Check if this is a group drag
        if (draggedGroupJobs.length > 1) {
          console.log('🔷 Dropping group of', draggedGroupJobs.length, 'jobs');
          
          // Move all jobs in the group
          for (const groupJobId of draggedGroupJobs) {
            const timeSlot = jobTimeSlots.get(groupJobId);
            await onRescheduleJob(groupJobId, dateStr, timeSlot);
          }
          
          // Clear job assignments for all moved jobs
          setJobAssignments(prev => {
            const newMap = new Map(prev);
            draggedGroupJobs.forEach(jobId => newMap.delete(jobId));
            return newMap;
          });
          
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
          
          // Clear job assignment after successful move
          setJobAssignments(prev => {
            const newMap = new Map(prev);
            newMap.delete(draggedJobId);
            return newMap;
          });
          
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
    
    clearDragHoverTarget();
    setDraggedJobId(null);
    setDraggedGroupJobs([]);
    setDragPosition(null);
    setDragPreviewSize(null);
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

    touchDragRef.current = {
      jobId,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      started: false,
      target: e.currentTarget as HTMLElement,
    };
    
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

    const touch = e.touches[0];
    if (!touch) return;
    
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

      const touchDrag = touchDragRef.current;
      if (touchDrag && touchDrag.jobId === (e.currentTarget as any).dataset.jobId) {
        const dragDistance = Math.hypot(touch.clientX - touchDrag.startX, touch.clientY - touchDrag.startY);

        if (!touchDrag.started && dragDistance > 10) {
          touchDrag.started = true;
          setTouchDraggedJobId(touchDrag.jobId);
          activateDrag(touchDrag.jobId, touch.clientX, touch.clientY, touchDrag.target, 20, 20);
        }

        if (touchDrag.started) {
          e.preventDefault();
          setDragPosition({ x: touch.clientX, y: touch.clientY });
          updateDragHoverFromPoint(touch.clientX, touch.clientY);
        }
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
    const touchDrag = touchDragRef.current;
    if (touchDrag?.started) {
      const hoverTarget = dragHoverRef.current;
      touchDragRef.current = null;
      setTouchDraggedJobId(null);

      if (hoverTarget?.date && hoverTarget.slot !== undefined) {
        handleSlotDrop({
          preventDefault: () => {},
          stopPropagation: () => {}
        } as React.DragEvent, hoverTarget.date, hoverTarget.slot);
      } else {
        clearDragHoverTarget();
        setDraggedJobId(null);
        setDraggedGroupJobs([]);
        setDragPosition(null);
        setDragPreviewSize(null);
      }
      return;
    }

    touchDragRef.current = null;

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

      const additionalJobIds = jobsToMove
        .filter(job => job.date !== dateStr)
        .map(job => job.id);

      const capacityCheck = checkDayCapacity(dateStr, additionalJobIds);
      if (!capacityCheck.hasCapacity) {
        toast.error(`Cannot move ${jobsToMove.length} job${jobsToMove.length !== 1 ? 's' : ''}: ${capacityCheck.reason}`);
        return;
      }
      
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
        const capacityCheck = checkDayCapacity(dateStr, [cutJobId]);
        if (!capacityCheck.hasCapacity) {
          toast.error(`Cannot move job: ${capacityCheck.reason}`);
          lastTapTime.current = 0;
          return;
        }

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
  }, [cutJobId, jobs, onRescheduleJob, isSelectionMode, selectedJobIds, showTutorialBanner, dismissTutorial, checkDayCapacity]);

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
    if (!isMobile && forecastScrollContainerRef.current && next30Days.length > 0 && weatherData) {
      const container = forecastScrollContainerRef.current;
      
      // Check session flags
      const hasScrolledInSession = sessionStorage.getItem('hasScrolledToToday') === 'true';
      const savedScrollPosition = sessionStorage.getItem('forecastScrollPosition');
      
      // ONLY scroll if this is the very first time (no session flags set)
      if (!hasScrolledInSession) {
        // First load ever - scroll to today
        const timer = setTimeout(() => {
          requestAnimationFrame(() => {
            const todayStr = new Date().toLocaleDateString('en-CA');
            const todayCard = container?.querySelector(`[data-date="${todayStr}"]`);
            
            if (todayCard) {
              const cardLeft = (todayCard as HTMLElement).offsetLeft;
              container.scrollTo({ left: cardLeft, behavior: 'auto' });
              console.log(`✅ Initial scroll to today's card at ${todayStr}, offset: ${cardLeft}px`);
              sessionStorage.setItem('hasScrolledToToday', 'true');
              sessionStorage.setItem('forecastScrollPosition', cardLeft.toString());
            }
          });
        }, 500);
        return () => clearTimeout(timer);
      } else if (savedScrollPosition) {
        // Restore saved position (from switching tabs) - but only if current position is different
        const timer = setTimeout(() => {
          requestAnimationFrame(() => {
            const targetPosition = parseInt(savedScrollPosition);
            // Only scroll if we're not already at the saved position (tolerance of 5px)
            if (Math.abs(container.scrollLeft - targetPosition) > 5) {
              container.scrollLeft = targetPosition; // Direct assignment, no animation
              console.log(`✅ Restored scroll position: ${savedScrollPosition}px (was ${container.scrollLeft})`);
            } else {
              console.log(`✅ Already at saved position: ${savedScrollPosition}px`);
            }
          });
        }, 50); // Shorter delay
        return () => clearTimeout(timer);
      }
    }
  }, [isMobile, next30Days.length, weatherData]);

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

  // Notify parent of demo mode starting address on mount
  useEffect(() => {
    if (DEMO_MODE && onStartingAddressChange && streetAddress) {
      onStartingAddressChange(streetAddress);
    }
  }, []); // Only run once on mount

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
        <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-blue-50 z-100 flex flex-col">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between shadow-lg">
            <div>
              <h2 className="text-xl font-bold mb-1">📍 Set Your Location</h2>
              <p className="text-blue-100 text-sm">Enter your address to see weather forecasts</p>
            </div>
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
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-md mx-auto">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {userGPSLocation ? "Search Nearby Addresses" : "Enter Your Full Address"}
                </label>
              </div>
              <div className="relative">
                <Input
                  ref={addressInputRef}
                  placeholder={
                    userGPSLocation 
                      ? "123 Main St, City, State ZIP" 
                      : "123 Main St, City, State ZIP"
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
                  className={`h-14 pr-12 text-base shadow-md ${
                    addressSaved 
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500 bg-green-50' 
                      : userGPSLocation
                      ? 'border-green-200 focus:border-green-400 focus:ring-green-400 bg-white'
                      : 'border-blue-300 focus:border-blue-500 focus:ring-blue-500 bg-white'
                  }`}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  {addressSaved && (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  )}
                  {isSearchingAddress && !addressSaved && (
                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                  )}
                  {!addressSaved && !isSearchingAddress && userGPSLocation && (
                    <div title="Using GPS for nearby results">
                      <Navigation className="h-6 w-6 text-green-600" />
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
        <div
          ref={forecastViewportRef}
          className="flex items-start justify-center"
          style={{
            minHeight: 'auto',
          }}
        >
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
                    console.log('⬅️ LEFT ARROW CLICKED - current dayOffset:', dayOffset);
                    // Directly update dayOffset to go to previous day
                    const newDayOffset = dayOffset - 1;
                    console.log('⬅️ Updating dayOffset to:', newDayOffset);
                    isInternalUpdateRef.current = true;
                    setDayOffset(newDayOffset);
                    
                    // Also scroll the forecast container
                    if (forecastScrollContainerRef.current) {
                      forecastScrollContainerRef.current.scrollBy({ left: -DESKTOP_DAY_CARD_SCROLL_STEP_PX, behavior: 'smooth' });
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
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    console.log('⌨️ KEYBOARD LEFT ARROW - current dayOffset:', dayOffset);
                    const newDayOffset = dayOffset - 1;
                    console.log('⌨️ Updating dayOffset to:', newDayOffset);
                    isInternalUpdateRef.current = true;
                    setDayOffset(newDayOffset);
                    
                    // Also scroll the forecast container
                    if (forecastScrollContainerRef.current) {
                      forecastScrollContainerRef.current.scrollBy({ left: -DESKTOP_DAY_CARD_SCROLL_STEP_PX, behavior: 'smooth' });
                    }
                    scrollToTop();
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    console.log('⌨️ KEYBOARD RIGHT ARROW - current dayOffset:', dayOffset);
                    const newDayOffset = dayOffset + 1;
                    console.log('⌨️ Updating dayOffset to:', newDayOffset);
                    isInternalUpdateRef.current = true;
                    setDayOffset(newDayOffset);
                    
                    // Also scroll the forecast container
                    if (forecastScrollContainerRef.current) {
                      forecastScrollContainerRef.current.scrollBy({ left: DESKTOP_DAY_CARD_SCROLL_STEP_PX, behavior: 'smooth' });
                    }
                    scrollToTop();
                  }
                }}
                className={`forecast-grid-container ${
                  isMobile ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden scrollbar-hide'
                }`}
                style={{
                  scrollSnapType: isMobile ? 'none' : 'x mandatory',
                  scrollBehavior: isMobile ? 'smooth' : 'smooth',
                  width: isMobile ? '97vw' : `${forecastContainerWidth}px`,
                  maxWidth: isMobile ? '97vw' : `${forecastContainerWidth}px`,
                  margin: isMobile ? '0 auto' : '0 auto', // Center on both mobile and desktop
                  height: resolvedForecastViewportHeight ? `${resolvedForecastViewportHeight}px` : undefined,
                  paddingTop: `${forecastTopInsetPx}px`, // Keep the day header clear of sticky chrome
                  scrollPaddingTop: `${forecastTopInsetPx}px`,
                  scrollPaddingBottom: `${forecastBottomInsetPx}px`,
                  overflowY: 'hidden',
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
                    // For desktop: next30Days array is fixed from -30 to +30, index 30 = today
                    // For mobile: next30Days array starts at dayOffset, index 0 = current day
                    const daysFromToday = isMobile 
                      ? actualIndex // Mobile: index 0 is already at dayOffset
                      : actualIndex - 30; // Desktop: index 30 is today, so actualIndex-30 gives days from today
                    
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
                  const assignedJobIds = assignedJobs.map(job => job.id);
                  
                  const totalJobs = scheduledJobsForDay.length + assignedJobs.length;
                  const { dayStartHour, dayEndHour, startDelayHours, endEarlyHours } = getEffectiveWorkWindow(dateStr);
                  const totalWorkMinutes = [...scheduledJobsForDay, ...assignedJobs].reduce((sum, job) => sum + (job.totalTime ?? DEFAULT_JOB_WORK_MINUTES), 0);
                  const totalDriveMinutes = [...scheduledJobsForDay, ...assignedJobs].reduce((sum, job) => sum + roundDriveMinutesToFive(job.driveTime ?? DEFAULT_JOB_DRIVE_MINUTES), 0);
                  const dayCapacity = checkDayCapacity(dateStr, assignedJobIds);
                  const totalMinutes = dayCapacity.totalMinutes ?? [...scheduledJobsForDay, ...assignedJobs].reduce((sum, job) => sum + getEstimatedJobMinutes(job), 0);
                  const availableMinutes = dayCapacity.maxMinutes ?? getUsableDayMinutes(dayStartHour, dayEndHour, { startDelayHours, endEarlyHours });
                  const remainingMinutes = Math.max(0, availableMinutes - totalMinutes);
                  const isAtCapacity = availableMinutes <= 0 ? totalMinutes > 0 : totalMinutes >= availableMinutes;
                  const capacityPercentage = availableMinutes <= 0 ? 100 : Math.min(100, Math.round((totalMinutes / availableMinutes) * 100));
                  
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
                  const hasWeatherMoveSuggestions = suggestionsForDay.moveSuggestions.some(s => (s.source ?? 'weather') === 'weather');
                  const hasWeatherTimeSuggestions = suggestionsForDay.timeSuggestions.some(s => s.type === 'delay' || s.type === 'start-early');
                  const rainTimeSuggestion = suggestionsForDay.timeSuggestions.find(
                    (s) => s.type === 'delay' || s.type === 'start-early'
                  );
                  const isPersistedRainedOutDay = persistedRainedOutDays.has(dateStr);
                  const isWeatherCanceledDay = isPersistedRainedOutDay || (hasWeatherMoveSuggestions && !hasWeatherTimeSuggestions);
                  const isWeatherClosedDay = isPersistedRainedOutDay || ((hasWeatherMoveSuggestions || hasWeatherTimeSuggestions) && (isAtCapacity || remainingMinutes <= 0));
                  const combinedSuggestions = [
                    ...suggestionsForDay.moveSuggestions.map((suggestion) => ({ kind: 'move' as const, suggestion })),
                    ...suggestionsForDay.timeSuggestions.map((suggestion) => ({ kind: 'time' as const, suggestion })),
                  ];
                  // Get list of job IDs that will be affected by rain (need to be moved)
                  const affectedJobIds = new Set<string>();
                  suggestionsForDay.moveSuggestions.forEach(suggestion => {
                    if (suggestion.jobIds) {
                      suggestion.jobIds.forEach(id => affectedJobIds.add(id));
                    } else if (suggestion.jobId) {
                      affectedJobIds.add(suggestion.jobId);
                    }
                  });
                  // Keep highlight focused on move suggestions only.
                  
                  return (
                    <div
                      key={dateStr}
                      data-day-card="true"
                      data-date={dateStr}
                      className="relative flex flex-col"
                      style={{
                        scrollSnapAlign: 'start',
                        scrollMarginTop: isMobile ? '0.75rem' : '1rem',
                        width: isMobile ? '97vw' : `${DESKTOP_DAY_CARD_WIDTH_PX}px`,
                        minWidth: isMobile ? '97vw' : `${DESKTOP_DAY_CARD_WIDTH_PX}px`,
                        maxWidth: isMobile ? '97vw' : `${DESKTOP_DAY_CARD_WIDTH_PX}px`,
                        height: dayCardViewportHeight ? `${dayCardViewportHeight}px` : undefined,
                      }}
                    >
                      {/* Day Card */}
                      <div
                        onDragOver={(e) => {
                          // Check if we can accept the drop
                          const jobIdsToMove = draggedGroupJobs.length > 1 ? draggedGroupJobs : [draggedJobId].filter((id): id is string => id !== null);
                          const additionalJobIds = jobIdsToMove.filter(jId => {
                            const j = jobs.find(job => job.id === jId);
                            return j?.date !== dateStr;
                          });
                          
                          if (additionalJobIds.length > 0) {
                            const capacityCheck = checkDayCapacity(dateStr, additionalJobIds);
                            if (!capacityCheck.hasCapacity) {
                              e.dataTransfer.dropEffect = 'none';
                            }
                          }
                          handleDayCardDragOver(e, dateStr);
                        }}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dateStr)}
                        className={`forecast-day-card relative ${
                          isMobile ? 'overflow-hidden flex flex-col snap-end flex-1 min-h-0 rounded-lg' : 'overflow-hidden flex flex-col flex-1 min-h-0 rounded-lg'
                        } shadow-lg overflow-hidden ${
                          isBeingDraggedOver ? 'ring-4 ring-blue-500/80' : ''
                        } ${isAtCapacity ? 'ring-2 ring-blue-500 shadow-blue-100' : ''}`}
                        style={{
                          scrollSnapStop: isMobile ? 'always' : 'always',
                          background: LANDING_DAY_CARD_PURPLE_GRADIENT,
                        border: isWeatherClosedDay
                          ? `2px solid ${LANDING_WEATHER_PALETTE.border}`
                          : (isAtCapacity ? `2px solid ${LANDING_WEATHER_PALETTE.ring}` : `2px solid ${LANDING_WEATHER_PALETTE.border}`)
                      }}
                    >
                      {(isWeatherClosedDay || isAtCapacity) && (
                        <div className={`absolute inset-x-0 top-0 h-1.5 ${isWeatherClosedDay ? 'bg-blue-600' : 'bg-blue-500'}`} />
                      )}
                      {/* Day Header - Improved with work/drive time stats */}
                      <div className={`bg-white border-b border-gray-200 ${isMobile ? 'px-2 py-[0.42vh] flex-shrink-0' : 'px-[0.44vh] py-[0.53vh]'}`}>
                        {/* Day and Date on same line with rain badge - CENTERED */}
                        <div className={`flex items-center justify-center ${isMobile ? 'mb-[0.08vh]' : 'mb-[0.27vh]'}`}>
                          <div className="flex items-center gap-[0.32vh]">
                            <span className={`font-bold text-gray-900 ${isMobile ? 'text-[1.28vh]' : 'text-[1.95vh]'}`}>{dayName}</span>
                            <span className={`text-gray-500 ${isMobile ? 'text-[1.05vh]' : 'text-[1.59vh]'}`}>{dayDate}</span>
                          </div>
                          
                          {/* Rain Chance Badge */}
                          {weatherForDay && rainChance > 0 && !isMobile && (
                            <div className="inline-flex items-center gap-[0.27vh] px-[0.71vh] py-[0.44vh] ml-[0.88vh] rounded-full font-semibold bg-blue-100 text-blue-800 text-[1.07vh]">
                              <CloudRain className="h-[1.33vh] w-[1.33vh]" />
                              {rainChance}%
                            </div>
                          )}
                        </div>
                        
                        {/* Concise owner summary: what is booked, what is open, and risk status */}
                        <div className={`flex items-center justify-center gap-1 text-gray-700 ${isMobile ? 'text-[0.94vh]' : 'text-[1.18vh]'}`}>
                          {(() => {
                            const plannedHours = Math.floor(totalMinutes / 60);
                            const plannedMins = totalMinutes % 60;
                            const openHours = Math.floor(remainingMinutes / 60);
                            const openMins = remainingMinutes % 60;
                            const plannedLabel = `${plannedHours > 0 ? `${plannedHours}h ` : ''}${plannedMins}m`;
                            const openLabel = `${openHours > 0 ? `${openHours}h ` : ''}${openMins}m`;

                            return (
                              <>
                                <span className="font-semibold text-blue-700">{totalJobs}</span>
                                <span>jobs</span>
                                <span className="text-gray-400">•</span>
                                <span className="font-medium">{plannedLabel} planned</span>
                                <span className="text-gray-400">•</span>
                                <span className="font-medium">{openLabel} open</span>
                                {(isWeatherClosedDay || isAtCapacity || capacityPercentage >= 90) && (
                                  <Badge variant="default" className={`ml-1 px-1.5 py-0 text-[0.86vh] ${isWeatherClosedDay ? 'bg-blue-700 text-white' : isAtCapacity ? 'bg-orange-600 text-white' : 'bg-amber-500 text-white'}`}>
                                    {isWeatherClosedDay ? 'RAIN' : isAtCapacity ? 'FULL' : 'NEAR FULL'}
                                  </Badge>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Main Content: Day Schedule */}
                      <div className={`grid grid-cols-1 gap-0 overflow-hidden flex-1 ${
                        isMobile ? '' : ''
                      }`}>
                        {/* Day schedule with weather icons (5am-6pm) */}
                        <div className={`relative border-r border-gray-200 overflow-hidden ${
                          isMobile ? 'px-1 pb-0 pt-0 flex flex-col' : 'px-[0.44vh] py-0 flex flex-col'
                        }`} style={{ background: LANDING_DAY_CARD_PURPLE_GRADIENT }}>

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
                                <div className={`${isMobile ? 'mb-[1vh]' : 'mb-[0.80vh]'}`}>
                                  {/* Draggable start time handle - ALWAYS visible at top */}
                                  <div
                                    className={`relative cursor-ns-resize transition-all group ${isMobile ? 'py-[0.24vh]' : 'py-[0.53vh]'}`}
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
                              const dayEndHour = dayEndTimes.get(dateStr) || DEFAULT_DAY_END_HOUR;
                              
                              // 15-minute interval slots from 5am to 7pm (14 hours = 56 slots)
                              // But only show labels every 4 slots (hourly)
                              const timeSlots = Array.from({ length: 56 }, (_, i) => {
                                const totalMinutes = 5 * 60 + (i * 15);
                                const hour = Math.floor(totalMinutes / 60);
                                const isHourMark = i % 4 === 0; // Every 4th slot is a full hour
                                const timeLabel = isHourMark ? (hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`) : '';
                                return { hour, timeLabel, slotIndex: i, isHourMark };
                              });
                              
                              // Get all jobs for this day and sort
                              const allJobs = [...scheduledJobsForDay, ...assignedJobs].sort((a, b) => {
                                const aIncomplete = a.status !== 'completed';
                                const bIncomplete = b.status !== 'completed';
                                if (aIncomplete && !bIncomplete) return -1;
                                if (!aIncomplete && bIncomplete) return 1;

                                const aSlot = jobTimeSlots.get(a.id);
                                const bSlot = jobTimeSlots.get(b.id);
                                if (aSlot !== undefined && bSlot !== undefined && aSlot !== bSlot) {
                                  return aSlot - bSlot;
                                }
                                
                                if (a.scheduledTime && b.scheduledTime) {
                                  return a.scheduledTime.localeCompare(b.scheduledTime);
                                }
                                if (a.order && b.order) return a.order - b.order;
                                return 0;
                              });
                              
                              // Calculate offset based on start time (multiply by 4 for 15-min slots per hour)
                              const slotOffset = Math.max(0, (dayStartHour - 5) * 4);
                              const draggedJobPreview = draggedJobId ? jobs.find(job => job.id === draggedJobId) : null;
                              const draggedJobPreviewCustomer = draggedJobPreview ? customers.find(customer => customer.id === draggedJobPreview.customerId) : null;
                              const draggedJobPreviewMinutes = draggedJobPreview ? getEstimatedJobMinutes(draggedJobPreview) : 0;
                              
                              const isDraggingOverThisDay = dragOverSlot?.date === dateStr && draggedJobId;
                              const dragTargetSlot = isDraggingOverThisDay ? dragOverSlot.slot : -1;
                              const isDraggedPreviewCopy = isDraggingOverThisDay && dragTargetSlot >= 0;
                              const renderJobLookup = new Map<string, Job>();
                              
                              const jobsBySlot: { [key: number]: typeof allJobs[0] } = {};
                              const jobSlotRanges = new Map<string, { startSlot: number; slotsNeeded: number }>();

                              allJobs.forEach((job) => renderJobLookup.set(job.id, job));

                              const mapJobsToSlots = (jobsToPlace: typeof allJobs) => {
                                let currentSlot = slotOffset;
                                jobsToPlace.forEach((job) => {
                                  const jobDuration = getEstimatedJobMinutes(job);
                                  const slotsNeeded = Math.max(1, Math.ceil(jobDuration / 15));
                                  jobSlotRanges.set(job.id, { startSlot: currentSlot, slotsNeeded });
                                  if (currentSlot < 56) {
                                    jobsBySlot[currentSlot] = job;
                                  }
                                  currentSlot += slotsNeeded;
                                });
                              };

                              if (isDraggingOverThisDay && draggedJobId) {
                                const draggedJob = jobs.find(j => j.id === draggedJobId);
                                const baseJobs = allJobs.filter(job => job.id !== draggedJobId);

                                if (draggedJob) {
                                  renderJobLookup.set(draggedJob.id, draggedJob);

                                  const baseRanges = new Map<string, { startSlot: number; slotsNeeded: number }>();
                                  let scanSlot = slotOffset;
                                  baseJobs.forEach((job) => {
                                    const slotsNeeded = Math.max(1, Math.ceil(getEstimatedJobMinutes(job) / 15));
                                    baseRanges.set(job.id, { startSlot: scanSlot, slotsNeeded });
                                    scanSlot += slotsNeeded;
                                  });

                                  let insertAt = baseJobs.length;
                                  for (let i = 0; i < baseJobs.length; i++) {
                                    const range = baseRanges.get(baseJobs[i].id);
                                    const start = range?.startSlot ?? slotOffset;
                                    if (dragTargetSlot <= start) {
                                      insertAt = i;
                                      break;
                                    }
                                  }

                                  const previewJobs = [...baseJobs];
                                  previewJobs.splice(insertAt, 0, draggedJob);
                                  mapJobsToSlots(previewJobs);
                                } else {
                                  mapJobsToSlots(baseJobs);
                                }
                              } else {
                                mapJobsToSlots(allJobs.filter(job => job.id !== draggedJobId));
                              }
                              
                              // Calculate job spans based on duration
                              const jobSpans = new Map<number, { job: any; slotsNeeded: number; firstSlot: number }>();
                              const slotsOccupiedByDuration = new Set<number>();
                              
                              jobSlotRanges.forEach((range, jobId) => {
                                const job = renderJobLookup.get(jobId);
                                if (!job) return;
                                
                                // Mark first slot as having the span
                                jobSpans.set(range.startSlot, {
                                  job,
                                  slotsNeeded: range.slotsNeeded,
                                  firstSlot: range.startSlot
                                });
                                
                                // Mark all other slots as occupied
                                for (let i = 1; i < range.slotsNeeded; i++) {
                                  slotsOccupiedByDuration.add(range.startSlot + i);
                                }
                              });
                              
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
                                  isMobile ? 'flex-1' : 'flex-1 justify-between'
                                }`} data-date={dateStr} style={{ 
                                  ['--slot-row-height' as string]: 'calc(100% / 56)',
                                  display: 'grid', 
                                  gridTemplateColumns: isMobile ? '3vh 1fr' : '4.5vh 1fr', 
                                  gridTemplateRows: 'repeat(56, minmax(0, 1fr))', 
                                  gap: 0, 
                                  height: '100%',
                                  minHeight: 0,
                                  flex: '1 1 auto',
                                  alignContent: 'start'
                                }}>
                                {/* Blocked time overlays */}
                                {(() => {
                                  const currentStartTime = dayStartTimes.get(dateStr) || 5;
                                  const currentEndTime = dayEndTimes.get(dateStr) || DEFAULT_DAY_END_HOUR;
                                  
                                  const totalSlots = 14; // 5am to 6pm = 14 hours

                                  const hasSuggestedDelay = Boolean(
                                    rainTimeSuggestion
                                    && (rainTimeSuggestion.type === 'delay'
                                      || (
                                        rainTimeSuggestion.type !== 'start-early'
                                        && rainTimeSuggestion.suggestedEndTime === undefined
                                        && rainTimeSuggestion.suggestedStartTime > rainTimeSuggestion.currentStartTime
                                      ))
                                  );

                                  const hasSuggestedCutoff = Boolean(
                                    rainTimeSuggestion
                                    && (rainTimeSuggestion.type === 'start-early'
                                      || rainTimeSuggestion.suggestedEndTime !== undefined)
                                  );

                                  const suggestedRainDelayHour = hasSuggestedDelay
                                    ? rainTimeSuggestion!.suggestedStartTime
                                    : null;

                                  const suggestedRainCutoffHour = hasSuggestedCutoff
                                    ? (rainTimeSuggestion!.suggestedEndTime ?? rainTimeSuggestion!.suggestedStartTime)
                                    : null;

                                  const topRainHour = suggestedRainDelayHour
                                    ?? (currentStartTime > 5 ? currentStartTime : null);
                                  const bottomRainHour = suggestedRainCutoffHour
                                    ?? (currentEndTime < DEFAULT_DAY_END_HOUR ? currentEndTime : null);
                                  
                                  const blockedStartSlots = topRainHour ? Math.max(0, topRainHour - 5) : 0;
                                  const blockedStartPercent = (blockedStartSlots / totalSlots) * 100;
                                  
                                  const blockedEndSlots = bottomRainHour ? Math.max(0, 19 - bottomRainHour) : 0;
                                  const blockedEndPercent = (blockedEndSlots / totalSlots) * 100;
                                  const blockedEndTopPercent = bottomRainHour ? ((bottomRainHour - 5) / totalSlots) * 100 : 100;

                                  const rainOverlayStyle = {
                                    background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.20) 0%, rgba(59, 130, 246, 0.10) 100%)',
                                    backgroundImage: 'repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.32) 0px, rgba(255, 255, 255, 0.32) 2px, transparent 2px, transparent 10px)',
                                  };
                                  
                                  return (
                                    <>
                                      {/* Full-day weather cancellation overlay */}
                                      {isWeatherCanceledDay && (
                                        <div
                                          className="absolute inset-0 pointer-events-none z-20"
                                          style={{
                                            gridColumn: '1 / -1',
                                            ...rainOverlayStyle,
                                          }}
                                        />
                                      )}

                                      {/* Rain delay overlay (from start of day until suggested dry start) */}
                                      {!isWeatherCanceledDay && blockedStartPercent > 0 && (
                                        <div 
                                          className="absolute top-0 left-0 right-0 pointer-events-none z-20"
                                          style={{ 
                                            gridColumn: '1 / -1',
                                            height: `${blockedStartPercent}%`,
                                            ...rainOverlayStyle,
                                          }}
                                        />
                                      )}
                                      
                                      {/* Rain cutoff overlay (from suggested cutoff through end of day) */}
                                      {!isWeatherCanceledDay && blockedEndPercent > 0 && (
                                        <div 
                                          className="absolute left-0 right-0 pointer-events-none z-20"
                                          style={{ 
                                            gridColumn: '1 / -1',
                                            top: `${blockedEndTopPercent}%`,
                                            height: `${blockedEndPercent}%`,
                                            ...rainOverlayStyle,
                                          }}
                                        />
                                      )}
                                    </>
                                  );
                                })()}
                                
                                {/* Weather symbols column - always visible with absolute positioning */}
                                <div className="relative" style={{ gridColumn: '1', gridRow: '1 / -1', display: 'grid', gridTemplateRows: 'subgrid' }}>
                                  {[
                                    { hour: 5, slotIndex: 0 },      // 5 AM - slot 0
                                    { hour: 8, slotIndex: 12 },     // 8 AM - slot 12 (3 hours * 4 slots)
                                    { hour: 11, slotIndex: 24 },    // 11 AM - slot 24 (6 hours * 4 slots)
                                    { hour: 14, slotIndex: 36 },    // 2 PM - slot 36 (9 hours * 4 slots)
                                    { hour: 17, slotIndex: 48 }     // 5 PM - slot 48 (12 hours * 4 slots)
                                  ].map(({ hour, slotIndex }) => {
                                    const isFirstSlot = hour === 5;
                                    
                                    // Weather icon function
                                    const getWeatherForHour = () => {
                                      if (!weatherForDay) return null;
                                      
                                      let forecast = null;
                                      if (weatherForDay.hourlyForecasts && weatherForDay.hourlyForecasts.length > 0) {
                                        forecast = weatherForDay.hourlyForecasts.find((f: any) => f.hour24 === hour);
                                        
                                        if (!forecast) {
                                          const closestForecast = weatherForDay.hourlyForecasts.reduce((prev: any, curr: any) => {
                                            const prevDiff = Math.abs((prev.hour24 || 0) - hour);
                                            const currDiff = Math.abs((curr.hour24 || 0) - hour);
                                            return currDiff < prevDiff ? curr : prev;
                                          });
                                          forecast = closestForecast;
                                        }
                                      }
                                      
                                      if (!forecast) {
                                        forecast = { 
                                          description: weatherForDay.description, 
                                          precipitation: rainChance, 
                                          rainAmount: weatherForDay.precipitation || 0, 
                                          hour24: hour 
                                        };
                                      }
                                      
                                      const effectivePrecipitation = Math.max(forecast.precipitation || 0, rainChance);
                                      const { glyph, toneClass } = getWeatherIcon(
                                        forecast.description, 
                                        effectivePrecipitation,
                                        forecast.rainAmount,
                                        hour
                                      );
                                      
                                      const timeLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                      
                                      return (
                                        <div className="flex flex-col items-center gap-[0.1vh] w-full shrink-0">
                                          <div className={`inline-flex items-center justify-center rounded-full border border-blue-200/80 bg-linear-to-b from-blue-100/90 to-blue-200/80 shadow-sm ${isMobile ? 'w-[2.1vh] h-[2.1vh] text-[1.62vh]' : 'w-[3.07vh] h-[3.07vh] text-[2.3vh]'} ${toneClass}`}>
                                            <span aria-hidden="true">{glyph}</span>
                                          </div>
                                          <span className={`text-slate-600 font-semibold whitespace-nowrap ${isMobile ? 'text-[0.85vh]' : 'text-[1.06vh]'}`}>
                                            {timeLabel}
                                          </span>
                                        </div>
                                      );
                                    };
                                    
                                    return (
                                      <div 
                                        key={`weather-${hour}`} 
                                        className="flex items-center justify-center" 
                                        style={{ 
                                          gridRow: `${slotIndex + 1} / span 4`,
                                          gridColumn: '1'
                                        }}
                                      >
                                        {isFirstSlot && hasOvernightRain ? (
                                          <div className="flex flex-col items-center gap-[0.14vh]">
                                            {getWeatherForHour()}
                                            <div className="flex flex-col items-center gap-[0.19vh] mt-[0.5vh]">
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
                                        ) : (
                                          getWeatherForHour()
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                {/* Job cards column - flows naturally */}
                                <div className="contents" style={{ gridColumn: '2' }}>
                                  {timeSlots.map((slot) => {
                                  const jobInSlot = jobsBySlot[slot.slotIndex];
                                  const isSlotHovered = dragOverSlot?.date === dateStr && dragOverSlot?.slot === slot.slotIndex;
                                  const isFirstSlot = slot.slotIndex === 0; // First time slot of the day (5 AM)
                                  
                                  // Show weather icons at 5am, 8am, 11am, 2pm, 5pm - ONLY on hour marks
                                  const shouldShowWeatherIcon = slot.isHourMark && weatherForDay && [5, 8, 11, 14, 17].includes(slot.hour);
                                  
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
                                    const { glyph, toneClass } = getWeatherIcon(
                                      forecast.description, 
                                      effectivePrecipitation,
                                      forecast.rainAmount,
                                      slot.hour
                                    );
                                    
                                    const timeLabel = slot.hour > 12 ? `${slot.hour - 12} PM` : slot.hour === 12 ? '12 PM' : `${slot.hour} AM`;
                                    
                                    return (
                                      <div className="flex flex-col items-center gap-[0.19vh] w-[3.84vh] shrink-0">
                                        <div className={`inline-flex items-center justify-center rounded-full border border-blue-200/80 bg-linear-to-b from-blue-100/90 to-blue-200/80 shadow-sm ${isMobile ? 'w-[2.74vh] h-[2.74vh] text-[1.95vh]' : 'w-[3.07vh] h-[3.07vh] text-[2.3vh]'} ${toneClass}`}>
                                          <span aria-hidden="true">{glyph}</span>
                                        </div>
                                        <span className={`text-slate-600 font-semibold whitespace-nowrap ${isMobile ? 'text-[1.09vh]' : 'text-[1.06vh]'}`}>
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
                                  
                                  // Don't show drop indicator if this slot contains the dragged job
                                  const containsDraggedJob = jobInSlot?.id === draggedJobId || 
                                    (groupSpan && groupSpan.jobs.some(j => j.id === draggedJobId)) ||
                                    (jobSpan && jobSpan.job.id === draggedJobId);
                                  
                                  const showDropIndicator = isDropTarget && !containsDraggedJob;
                                  
                                  // Check if this slot is occupied by a duration span from a previous slot
                                  const isOccupiedByDuration = slotsOccupiedByDuration.has(slot.slotIndex);
                                  
                                  return (
                                    <div 
                                      key={slot.slotIndex} 
                                      className={`relative flex items-start ${
                                        isMobile ? 'px-[0.3vh]' : 'px-[0.3vh]'
                                      } ${
                                        showDropIndicator
                                          ? 'bg-blue-50/50'
                                          : ''
                                      }`}
                                      style={{
                                        gridRow: `${slot.slotIndex + 1} / span 1`,
                                        gridColumn: '2',
                                        minHeight: 0,
                                        transition: 'background-color 0.1s ease',
                                      }}
                                      data-time-slot="true"
                                      data-slot-index={slot.slotIndex}
                                      onDragOver={(e) => handleDragOver(e, dateStr, slot.slotIndex)}
                                      onDrop={(e) => handleSlotDrop(e, dateStr, slot.slotIndex)}
                                    >
                                      {showDropIndicator && draggedJobPreview && (
                                        <div className="absolute inset-x-0 top-0 z-30 pointer-events-none px-[0.3vh] py-[0.2vh]">
                                          <div className="rounded-lg border border-blue-400/60 bg-white/70 backdrop-blur-md shadow-[0_8px_20px_rgba(59,130,246,0.14)] opacity-80 px-[0.8vh] py-[0.55vh]">
                                            <div className="flex items-center gap-[0.5vh] min-w-0">
                                              <span className="inline-flex h-[1.6vh] w-[1.6vh] items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[0.95vh] font-bold shrink-0">
                                                ↕
                                              </span>
                                              <div className="min-w-0 flex-1">
                                                <div className="truncate text-[1.02vh] font-semibold text-slate-800">
                                                  {draggedJobPreviewCustomer?.name || 'Move job'}
                                                </div>
                                                <div className="truncate text-[0.92vh] text-slate-500">
                                                  Drop here • {draggedJobPreviewMinutes} min
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {/* Group card overlay - positioned absolutely to span multiple slots */}
                                      {groupSpan && (
                                        <div 
                                          className="absolute left-0 right-0 z-10"
                                          style={{
                                            top: 0,
                                            height: '100%',
                                            marginBottom: '0.3vh',
                                          }}
                                        >
                                          {(() => {
                                            const isDraggedItem = groupSpan.jobs.some(j => j.id === draggedJobId);
                                            const isCompleted = groupSpan.jobs.every(j => j.status === 'completed');
                                            const anyInProgress = groupSpan.jobs.some(j => j.status === 'in-progress');
                                            const groupColor = groupSpan.group.color || '#2563eb'; // Blue default
                                            const canDrag = !isCompleted;
                                            
                                            // Calculate if group overlaps with weather icons
                                            const weatherIconSlots = [0, 12, 24, 36, 48];
                                            const groupStartSlot = slot.slotIndex;
                                            const groupEndSlot = groupStartSlot + groupSpan.jobCount - 1;
                                            const overlapsWeatherIcon = weatherIconSlots.some(iconSlot => 
                                              groupStartSlot <= iconSlot && groupEndSlot >= iconSlot
                                            );
                                            
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
                                                role="button"
                                                tabIndex={isCompleted ? -1 : 0}
                                                onMouseDown={(e) => !isCompleted && handleDragStart(e, groupSpan.firstJobId)}
                                                onTouchStart={isTouchDevice.current && !isCompleted ? (e) => handleJobTouchStart(e, groupSpan.firstJobId) : undefined}
                                                onTouchMove={isTouchDevice.current && !isCompleted ? handleJobTouchMove : undefined}
                                                onTouchEnd={isTouchDevice.current && !isCompleted ? handleJobTouchEnd : undefined}
                                                onMouseUp={() => {
                                                  if (pendingDragRef.current) {
                                                    pendingDragRef.current = null;
                                                  }
                                                }}
                                                className={`h-full rounded text-xs overflow-hidden flex flex-col select-none mx-auto ${
                                                  isMobile ? 'px-[0.5vh] py-[0.4vh] max-w-[85vw]' : 'px-[0.58vh] py-[0.48vh] max-w-[260px]'
                                                } ${
                                                  isCompleted
                                                    ? 'bg-gray-100 border border-gray-300 cursor-default'
                                                    : isDraggedItem
                                                      ? 'bg-white border-2 border-blue-500'
                                                      : 'bg-white border border-gray-300 cursor-grab hover:cursor-grabbing active:cursor-grabbing'
                                                }`}
                                                style={{
                                                  marginLeft: overlapsWeatherIcon ? (isMobile ? '3.5vh' : '5vh') : '0',
                                                  width: overlapsWeatherIcon ? (isMobile ? 'calc(100% - 3.5vh)' : 'calc(100% - 5vh)') : '100%',
                                                  userSelect: 'none',
                                                  WebkitUserSelect: 'none',
                                                  WebkitTouchCallout: 'none',
                                                  opacity: isDraggedItem && !isDraggedPreviewCopy ? 0 : 1,
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
                                                  <div className={`font-semibold text-gray-900 ${isMobile ? 'text-[1.15vh] leading-tight' : 'text-[1.34vh]'}`}>
                                                    {groupSpan.group.name}
                                                  </div>
                                                  <div className={`text-gray-600 ${isMobile ? 'text-[1.05vh] leading-tight' : 'text-[1.1vh]'}`}>
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
                                          const workMinutes = jobInSlot.totalTime ?? DEFAULT_JOB_WORK_MINUTES;
                                          const driveFromPreviousMinutes = roundDriveMinutesToFive(jobInSlot.driveTime ?? DEFAULT_JOB_DRIVE_MINUTES);
                                          const estimatedJobMinutes = getEstimatedJobMinutes(jobInSlot);
                                          const isShortDurationCard = estimatedJobMinutes <= 30 || (spanInfo?.slotsNeeded ?? 1) <= 2;
                                          
                                          const isCutItem = jobInSlot.id === cutJobId;
                                          const isSelected = selectedJobIds.has(jobInSlot.id);
                                          const isAffectedByRain = affectedJobIds.has(jobInSlot.id);
                                          
                                          // Calculate which rows need indentation for wrapping
                                          const weatherIconSlots = [0, 12, 24, 36, 48];
                                          const startsAtWeatherIcon = weatherIconSlots.includes(slot.slotIndex);
                                          
                                          // For multi-slot cards, determine which rows overlap with weather icons
                                          const rowIndents: boolean[] = [];
                                          if (spansMultipleSlots && spanInfo) {
                                            for (let i = 0; i < spanInfo.slotsNeeded; i++) {
                                              const currentSlot = slot.slotIndex + i;
                                              
                                              // Check if this specific slot is within any weather icon's 4-slot (1 hour) range
                                              let isInWeatherRange = false;
                                              for (const weatherSlot of weatherIconSlots) {
                                                // Weather icon occupies slots: weatherSlot, weatherSlot+1, weatherSlot+2, weatherSlot+3
                                                if (currentSlot >= weatherSlot && currentSlot < weatherSlot + 4) {
                                                  isInWeatherRange = true;
                                                  break;
                                                }
                                              }
                                              
                                              rowIndents.push(isInWeatherRange);
                                            }
                                          }
                                          
                                          const jobCardContent = spansMultipleSlots && spanInfo && rowIndents.length > 0 ? (
                                            <div className="w-full relative" style={{ height: isMobile ? 'auto' : `calc(${spanInfo.slotsNeeded} * 100%)`, marginBottom: '0' }}>
                                              <div className="relative flex flex-col" style={{ height: '100%' }}>
                                                {rowIndents.map((needsIndent, rowIndex) => {
                                                  const isFirstRow = rowIndex === 0;
                                                  const isLastRow = rowIndex === rowIndents.length - 1;
                                                  const prevRowIndent = rowIndex > 0 ? rowIndents[rowIndex - 1] : null;
                                                  const nextRowIndent = rowIndex < rowIndents.length - 1 ? rowIndents[rowIndex + 1] : null;
                                                  const roundTopLeft = isFirstRow && !needsIndent;
                                                  const roundTopRight = isFirstRow;
                                                  const roundBottomLeft = isLastRow && !needsIndent;
                                                  const roundBottomRight = isLastRow;
                                                  const borderRadius = `${roundTopLeft ? '3vh' : '0'} ${roundTopRight ? '3vh' : '0'} ${roundBottomRight ? '3vh' : '0'} ${roundBottomLeft ? '3vh' : '0'}`;
                                                  const borderColor = isCompleted ? 'rgb(107, 114, 128)' : isSelected ? 'rgb(21, 128, 61)' : isCutItem ? 'rgb(202, 138, 4)' : isAssigned ? 'rgb(107, 114, 128)' : isAffectedByRain ? 'rgb(217, 119, 6)' : 'rgb(147, 197, 253)';
                                                  const isWidthChangingFromPrev = prevRowIndent !== null && prevRowIndent !== needsIndent;
                                                  const isWidthChangingToNext = nextRowIndent !== null && nextRowIndent !== needsIndent;
                                                  const rowHeight = `calc(100% / ${spanInfo.slotsNeeded})`;

                                                  return (
                                                    <div key={rowIndex} className="relative" style={{ height: rowHeight, flex: 'none' }}>
                                                      <div
                                                        className={`text-xs select-none h-full ${isCompleted ? 'bg-slate-100' : isSelected ? 'bg-emerald-50' : isCutItem ? 'bg-amber-50' : isAssigned ? 'bg-slate-100' : isAffectedByRain ? 'bg-amber-100' : 'bg-blue-50'}`}
                                                        style={{ marginLeft: needsIndent ? '0' : (isMobile ? '-3vh' : '-4.5vh'), width: needsIndent ? '100%' : (isMobile ? 'calc(100% + 3vh)' : 'calc(100% + 4.5vh)'), borderRadius: isFirstRow && isLastRow ? '3vh' : borderRadius, opacity: isDraggedItem && !isDraggedPreviewCopy ? 0 : 1 }}
                                                      />
                                                      {isFirstRow && <div className="absolute pointer-events-none" style={{ top: 0, left: needsIndent ? '0' : (isMobile ? '-3vh' : '-4.5vh'), width: needsIndent ? '100%' : (isMobile ? 'calc(100% + 3vh)' : 'calc(100% + 4.5vh)'), height: '1.5px', background: borderColor, zIndex: 999 }} />}
                                                      {!isFirstRow && isWidthChangingFromPrev && !needsIndent && prevRowIndent && <div className="absolute pointer-events-none" style={{ top: '0', left: isMobile ? '-3vh' : '-4.5vh', width: isMobile ? '3vh' : '4.5vh', height: '1.5px', background: borderColor, zIndex: 999 }} />}
                                                      {isLastRow && <div className="absolute pointer-events-none" style={{ bottom: 0, left: needsIndent ? '0' : (isMobile ? '-3vh' : '-4.5vh'), width: needsIndent ? '100%' : (isMobile ? 'calc(100% + 3vh)' : 'calc(100% + 4.5vh)'), height: '1.5px', background: borderColor, zIndex: 999 }} />}
                                                      {!isLastRow && isWidthChangingToNext && !needsIndent && nextRowIndent && <div className="absolute pointer-events-none" style={{ bottom: '0', left: isMobile ? '-3vh' : '-4.5vh', width: isMobile ? '3vh' : '4.5vh', height: '1.5px', background: borderColor, zIndex: 999 }} />}
                                                      <div className="absolute pointer-events-none" style={{ top: 0, bottom: 0, left: needsIndent ? '0' : (isMobile ? '-3vh' : '-4.5vh'), width: '1.5px', background: borderColor, zIndex: 999 }} />
                                                      <div className="absolute right-0 pointer-events-none" style={{ top: 0, bottom: 0, width: '1.5px', background: borderColor, zIndex: 999 }} />
                                                    </div>
                                                  );
                                                })}
                                              </div>

                                              <div
                                                role="button"
                                                tabIndex={isCompleted ? -1 : 0}
                                                onMouseDown={(e) => !isCompleted && handleDragStart(e, jobInSlot.id)}
                                                onTouchStart={isTouchDevice.current && !isCompleted ? (e) => handleJobTouchStart(e, jobInSlot.id) : undefined}
                                                onTouchMove={isTouchDevice.current && !isCompleted ? handleJobTouchMove : undefined}
                                                onTouchEnd={isTouchDevice.current && !isCompleted ? handleJobTouchEnd : undefined}
                                                onMouseUp={() => { if (pendingDragRef.current) pendingDragRef.current = null; }}
                                                className={`absolute top-0 left-0 right-0 bottom-0 flex items-center ${isMobile ? 'gap-1.5' : 'gap-2'} ${!isCompleted ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                                                style={{ height: '100%', minHeight: '100%', paddingLeft: isMobile ? '6px' : '8px', paddingRight: isMobile ? '6px' : '8px', paddingTop: isMobile ? '4px' : '5px', paddingBottom: isMobile ? '4px' : '5px', maxHeight: spanInfo ? '100%' : 'auto', overflow: 'hidden', borderRadius: spansMultipleSlots ? `${rowIndents[0] ? '0' : '3vh'} 3vh 3vh ${rowIndents[rowIndents.length - 1] ? '0' : '3vh'}` : startsAtWeatherIcon ? '0 3vh 3vh 0' : '3vh', zIndex: 20 }}
                                              >
                                                <div className={`min-w-0 flex-1 truncate font-semibold leading-tight tracking-tight ${isCompleted ? 'text-slate-500' : isAffectedByRain ? 'text-amber-900' : 'text-slate-900'}`} style={{ fontSize: isMobile ? '0.75rem' : '0.8rem' }}>
                                                  {customer?.name}
                                                </div>
                                                <div className={`shrink-0 inline-flex h-[22px] w-[3.7rem] items-center justify-center gap-0.5 rounded-full border px-0.5 text-[0.68rem] font-semibold leading-none ${isCompleted ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                                                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                                                  <input
                                                    id={`job-time-${jobInSlot.id}`}
                                                    type="number"
                                                    value={workMinutes}
                                                    onChange={(e) => {
                                                      const newTime = parseInt(e.target.value) || 30;
                                                      if (onUpdateJobTime && newTime >= 30 && newTime <= 300) {
                                                        onUpdateJobTime(jobInSlot.id, newTime);
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      const value = parseInt(e.target.value);
                                                      if (!value || value < 30) {
                                                        if (onUpdateJobTime) onUpdateJobTime(jobInSlot.id, 30);
                                                      } else if (value > 300) {
                                                        if (onUpdateJobTime) onUpdateJobTime(jobInSlot.id, 300);
                                                      }
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onFocus={(e) => e.currentTarget.select()}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                    onDragStart={(e) => e.preventDefault()}
                                                    className="border-0 bg-transparent px-0 py-0 text-center font-semibold tabular-nums text-[0.68rem] leading-none text-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none"
                                                    min="30"
                                                    max="300"
                                                    step="15"
                                                    style={{
                                                      pointerEvents: 'auto',
                                                      width: `${Math.max(2, String(workMinutes).length)}ch`,
                                                      minWidth: '2ch',
                                                    }}
                                                  />
                                                  <span className="shrink-0 ml-0.5">m</span>
                                                </div>
                                                <div className={`shrink-0 inline-flex h-[22px] w-[3.7rem] items-center justify-center gap-0.5 rounded-full border px-0.5 text-[0.68rem] font-semibold leading-none ${isCompleted ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-violet-300 bg-violet-50 text-violet-700'}`}>
                                                  <Car className="h-3 w-3" aria-hidden="true" />
                                                  <span>{driveFromPreviousMinutes}m</span>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              role="button"
                                              tabIndex={isCompleted ? -1 : 0}
                                              onMouseDown={(e) => !isCompleted && handleDragStart(e, jobInSlot.id)}
                                              onMouseUp={() => {
                                                if (pendingDragRef.current) {
                                                  pendingDragRef.current = null;
                                                }
                                              }}
                                              onClick={isTouchDevice.current && !isCompleted ? (e) => {
                                                // Single tap for selection on touch devices
                                                if (e.detail === 2) {
                                                  // This is part of a double-tap, let onDoubleClick handle it
                                                  return;
                                                }
                                                handleJobTap(jobInSlot.id);
                                              } : undefined}
                                              onTouchStart={isTouchDevice.current && !isCompleted ? (e) => handleJobTouchStart(e, jobInSlot.id) : undefined}
                                              onTouchMove={isTouchDevice.current && !isCompleted ? handleJobTouchMove : undefined}
                                              onTouchEnd={isTouchDevice.current && !isCompleted ? handleJobTouchEnd : undefined}
                                              className={`rounded text-xs group flex items-start select-none w-full ${
                                                isMobile ? 'px-1.5 py-1.5' : 'px-2 py-1.5'
                                              } ${
                                                isCompleted
                                                  ? 'bg-slate-100 border border-slate-300 cursor-default'
                                                  : isSelected
                                                  ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md'
                                                  : isCutItem
                                                  ? 'bg-amber-50 border-2 border-amber-500 shadow-md'
                                                  : isAssigned
                                                  ? 'bg-slate-100 border-2 border-slate-400 animate-pulse cursor-grabbing'
                                                  : isAffectedByRain
                                                  ? 'bg-amber-100 border border-amber-300 shadow-sm cursor-grab hover:cursor-grabbing'
                                                    : 'bg-blue-50/95 border border-blue-200 shadow-[0_1px_4px_rgba(37,99,235,0.10)] cursor-grab hover:cursor-grabbing hover:shadow-[0_4px_10px_rgba(37,99,235,0.14)] active:cursor-grabbing active:bg-blue-100 active:border-blue-300'
                                              }`}
                                              style={{
                                                marginLeft: startsAtWeatherIcon ? (isMobile ? '3.5vh' : '5vh') : '0',
                                                width: startsAtWeatherIcon ? (isMobile ? 'calc(100% - 3.5vh)' : 'calc(100% - 5vh)') : '100%',
                                                userSelect: 'none',
                                                WebkitUserSelect: 'none',
                                                WebkitTouchCallout: 'none',
                                                height: '100%',
                                                minHeight: '0',
                                                marginBottom: '0',
                                                alignSelf: 'flex-start',
                                                pointerEvents: 'auto',
                                                opacity: isDraggedItem && !isDraggedPreviewCopy ? 0 : 1,
                                                overflow: 'hidden',
                                                ...(isAffectedByRain && !isCompleted && !isSelected && !isCutItem && !isDraggedItem && !isAssigned ? {
                                                  backgroundImage: 'none'
                                                } : {})
                                              }}
                                            >
                                              <div className="flex w-full items-center gap-1.5 min-w-0" onDragStart={(e) => e.preventDefault()}>
                                                <div className={`min-w-0 flex-1 truncate font-semibold leading-tight tracking-tight ${isMobile ? 'text-[0.75rem]' : 'text-[0.8rem]'} ${isCompleted ? 'text-slate-500' : isAffectedByRain ? 'text-amber-900' : 'text-slate-900'}`}>
                                                  {customer?.name}
                                                </div>
                                                <div className={`shrink-0 inline-flex h-[22px] w-[3.7rem] items-center justify-center gap-0.5 rounded-full border px-0.5 text-[0.68rem] font-semibold leading-none ${isCompleted ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                                                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                                                  <input
                                                    id={`job-time-${jobInSlot.id}`}
                                                    name={`job-time-${jobInSlot.id}`}
                                                    type="number"
                                                    value={workMinutes}
                                                    onChange={(e) => {
                                                      const newTime = parseInt(e.target.value) || 30;
                                                      if (onUpdateJobTime && newTime >= 30 && newTime <= 300) {
                                                        onUpdateJobTime(jobInSlot.id, newTime);
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      const value = parseInt(e.target.value);
                                                      if (!value || value < 30) {
                                                        if (onUpdateJobTime) onUpdateJobTime(jobInSlot.id, 30);
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
                                                    onFocus={(e) => e.currentTarget.select()}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                    onTouchEnd={(e) => e.stopPropagation()}
                                                    onDragStart={(e) => e.preventDefault()}
                                                    draggable={false}
                                                    className="border-0 bg-transparent px-0 py-0 text-center font-semibold tabular-nums text-[0.68rem] leading-none text-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none"
                                                    min="30"
                                                    max="300"
                                                    step="15"
                                                    style={{
                                                      width: `${Math.max(2, String(workMinutes).length)}ch`,
                                                      minWidth: '2ch',
                                                    }}
                                                  />
                                                  <span className="shrink-0 ml-0.5">m</span>
                                                </div>
                                                <div className={`shrink-0 inline-flex h-[22px] w-[3.7rem] items-center justify-center gap-0.5 rounded-full border px-0.5 text-[0.68rem] font-semibold leading-none ${isCompleted ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-violet-300 bg-violet-50 text-violet-700'}`}>
                                                  <Car className="h-3 w-3" aria-hidden="true" />
                                                  <span>{driveFromPreviousMinutes}m</span>
                                                </div>
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
                                      );
                                })}
                                </div>
                              </div>
                            );
                          })()}                          {/* Draggable END Time Bar - At very bottom after all time slots */}
                          {(() => {
                            const currentEndTime = dayEndTimes.get(dateStr) || DEFAULT_DAY_END_HOUR;
                            
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
                              <div className={`${isMobile ? 'mt-[0.42vh]' : 'mt-[0.44vh]'}`}>
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
                    </div>
                  </div>

                  {showSuggestions && hasSuggestions && combinedSuggestions.length > 0 && (
                    <div
                      className={`${isMobile ? 'mx-2' : 'mx-3'} absolute left-0 right-0 bottom-3 z-30 pointer-events-none`}
                    >
                      <div className="flex flex-col items-start gap-1.5">
                        {combinedSuggestions.map((activeSuggestion, index) => {
                          const presentation = getSuggestionPresentation(activeSuggestion);

                          return (
                            <div
                              key={`${activeSuggestion.kind}-${index}`}
                              className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/96 px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-white shadow-sm ${presentation.toneClass}`}>
                                    {presentation.badge}
                                  </span>
                                  <span className="truncate text-[0.72rem] font-semibold text-slate-900">
                                    {presentation.title}
                                  </span>
                                </div>
                                {presentation.detail ? (
                                  <div className="mt-1 text-[0.63rem] leading-snug text-slate-500">
                                    {presentation.detail}
                                  </div>
                                ) : null}
                              </div>

                              {activeSuggestion.kind === 'move' ? (
                                <button
                                  type="button"
                                  onClick={() => acceptMoveSuggestion(activeSuggestion.suggestion, activeSuggestion.suggestion.suggestedDate)}
                                  className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[0.66rem] font-semibold text-white shadow-sm hover:bg-blue-700"
                                >
                                  {presentation.actionLabel}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => acceptStartTimeSuggestion(activeSuggestion.suggestion.date, activeSuggestion.suggestion.suggestedStartTime, activeSuggestion.suggestion.suggestedEndTime)}
                                  className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[0.66rem] font-semibold text-white shadow-sm hover:bg-blue-700"
                                >
                                  {presentation.actionLabel}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Close wrapper div for day card + suggestions */}
                </div>
                  );
                })}
              </div>

              {/* Right Arrow - Desktop Only - Positioned far outside container */}
              {!isMobile && (
                <button
                  onClick={() => {
                    console.log('➡️ RIGHT ARROW CLICKED - current dayOffset:', dayOffset);
                    // Directly update dayOffset to go to next day
                    const newDayOffset = dayOffset + 1;
                    console.log('➡️ Updating dayOffset to:', newDayOffset);
                    isInternalUpdateRef.current = true;
                    setDayOffset(newDayOffset);
                    
                    // Also scroll the forecast container
                    if (forecastScrollContainerRef.current) {
                      forecastScrollContainerRef.current.scrollBy({ left: DESKTOP_DAY_CARD_SCROLL_STEP_PX, behavior: 'smooth' });
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

      {/* Drag preview - mini version of actual job card */}
      {draggedJobId && dragPosition && (() => {
        const draggedJob = jobs.find(j => j.id === draggedJobId);
        if (!draggedJob) return null;
        
        const customer = customers.find(c => c.id === draggedJob.customerId);
        if (!customer) return null;
        
        const isCompleted = draggedJob.status === 'completed';
        const isGroupDrag = customer.groupId && draggedGroupJobs.length > 1;
        const previewText = isGroupDrag
          ? `${draggedGroupJobs.length} jobs`
          : `${getEstimatedJobMinutes(draggedJob)}m`;
        const previewWidth = Math.min(360, Math.max(150, Math.round(dragPreviewSize?.width ?? 220)));
        const previewHeight = Math.min(220, Math.max(40, Math.round(dragPreviewSize?.height ?? 52)));
        
        return (
          <div
            className="fixed pointer-events-none"
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${dragPosition.x - dragPointerOffsetRef.current.x}px, ${dragPosition.y - dragPointerOffsetRef.current.y}px, 0)`,
              zIndex: 999999,
              willChange: 'transform',
              filter: 'drop-shadow(0 8px 18px rgba(30, 64, 175, 0.32))',
            }}
          >
            <div
              className={`select-none flex items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-[0.72rem] font-semibold shadow-lg ${
                isCompleted
                  ? 'bg-slate-200/95 border-slate-400 text-slate-700'
                  : 'bg-blue-700/92 border-blue-500 text-white'
              }`}
              style={{
                width: `${previewWidth}px`,
                minHeight: `${previewHeight}px`,
              }}
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate leading-none">{customer.name}</span>
              </div>
              <span className="leading-none whitespace-nowrap rounded-full border border-white/35 bg-white/15 px-1.5 py-0.5">
                {previewText}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
