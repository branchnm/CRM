import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Customer, Job, MessageTemplate, Equipment, CustomerGroup } from '../App';
import { updateCustomer } from '../services/customers';
import { addJob, updateJob, fetchJobs } from '../services/jobs';
import { smsService } from '../services/sms';
import { getDriveTime } from '../services/googleMaps';
import { optimizeRoute as optimizeRouteWithGoogleMaps } from '../services/routeOptimizer';
import { Clock, MapPin, Navigation, CheckCircle, Play, Phone, StopCircle, MessageSquare, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { WeatherForecast } from './WeatherForecast';

interface DailyScheduleProps {
  customers: Customer[];
  customerGroups: CustomerGroup[]; // NEW: Customer groups
  jobs: Job[];
  equipment: Equipment[];
  onUpdateJobs: (jobs: Job[]) => void;
  messageTemplates: MessageTemplate[];
  onRefreshCustomers: () => Promise<void> | void;
  onRefreshJobs?: () => Promise<void> | void;
  onLocationChange?: (locationName: string, zipCode: string) => void;
  onEditAddress?: () => void;
  onCancelEditAddress?: () => void;
  onCloseAddressEditor?: () => void;
  isEditingAddress?: boolean;
  optimizationStatus?: 'idle' | 'optimizing' | 'optimized';
  onOptimizationStatusChange?: (status: 'idle' | 'optimizing' | 'optimized') => void;
  onJobChangesDetected?: (hasChanges: boolean) => void;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
  resetToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DailySchedule({ 
  customers, 
  customerGroups, // NEW
  jobs, 
  equipment, 
  onUpdateJobs, 
  messageTemplates, 
  onRefreshCustomers, 
  onRefreshJobs, 
  onLocationChange, 
  onEditAddress,
  onCancelEditAddress,
  onCloseAddressEditor,
  isEditingAddress,
  optimizationStatus = 'idle',
  onOptimizationStatusChange,
  onJobChangesDetected,
  scrollToTodayRef,
  resetToTodayRef
}: DailyScheduleProps) {
  const [jobNotes, setJobNotes] = useState('');
  const [elapsedTime, setElapsedTime] = useState<{ [jobId: string]: number }>({});
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [pendingStartJob, setPendingStartJob] = useState<Job | null>(null);
  const [showNextJobDialog, setShowNextJobDialog] = useState(false);
  const [nextJobToNotify, setNextJobToNotify] = useState<Job | null>(null);
  const [completionMessage, setCompletionMessage] = useState<boolean | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [startingAddress, setStartingAddress] = useState(() => {
    // Try routeStartingAddress first, then fall back to weatherLocationName
    return localStorage.getItem('routeStartingAddress') || 
           localStorage.getItem('weatherLocationName') || '';
  });
  const [driveTimesCache, setDriveTimesCache] = useState<Map<string, string>>(new Map());
  const [dayStartTimes, setDayStartTimes] = useState<Map<string, number>>(new Map());
  
  // Track optimized job order for change detection
  const [optimizedJobOrder, setOptimizedJobOrder] = useState<Map<string, number>>(new Map());
  
  // Drag and drop state
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  
  // Track job creation to prevent race conditions
  const creatingJobsRef = useRef<Set<string>>(new Set());

  // Day navigation state (0 = today, 1 = tomorrow, 2 = day after, etc.)
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  // Use local date (YYYY-MM-DD) to match stored nextCutDate values
  const today = new Date().toLocaleDateString('en-CA');
  
  // Calculate the currently viewed date based on currentDayIndex
  const currentViewDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() + currentDayIndex);
    return date.toLocaleDateString('en-CA');
  })();

  // Get readable date string for display
  const getDateLabel = (dayIndex: number): string => {
    if (dayIndex === 0) return "Today";
    if (dayIndex === 1) return "Tomorrow";
    const date = new Date();
    date.setDate(date.getDate() + dayIndex);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  
  // Get customers who need service on the current viewed date
  const customersDueOnDate = customers.filter(c => c.nextCutDate === currentViewDate);
  
  //console.log('📅 Current view date:', currentViewDate);
  //console.log('📅 Customers due on this date:', customersDueOnDate.length, customersDueOnDate.map(c => c.name));
  
  // Get jobs scheduled for the currently viewed date - sort by order, then by scheduled time
  const displayedJobs = jobs.filter(j => j.date === currentViewDate).sort((a, b) => {
    // Primary sort: by order field (lower numbers first)
    const orderA = a.order || 999;
    const orderB = b.order || 999;
    if (orderA !== orderB) return orderA - orderB;
    
    // Secondary sort: by scheduled time if available
    if (!a.scheduledTime || !b.scheduledTime) return 0;
    return a.scheduledTime.localeCompare(b.scheduledTime);
  });

 // console.log('📅 Displayed jobs for', currentViewDate + ':', displayedJobs.length);
 // console.log('📅 All jobs count:', jobs.length);
 // console.log('📅 Jobs by date:', jobs.reduce((acc, j) => { acc[j.date] = (acc[j.date] || 0) + 1; return acc; }, {} as Record<string, number>));

  // Group jobs by customer group (for displaying nearby properties together)
  type JobGroup = {
    isGroup: true;
    groupName: string;
    jobs: Job[];
    customers: Customer[];
    totalTime: number; // Combined estimated time in minutes
  };

  type SingleJob = {
    isGroup: false;
    job: Job;
    customer: Customer;
  };

  type DisplayItem = JobGroup | SingleJob;

  const displayItems: DisplayItem[] = (() => {
    const items: DisplayItem[] = [];
    const processedJobIds = new Set<string>();

    // Debug: Log customers with groups
    const customersWithGroups = customers.filter(c => c.groupId);
    if (customersWithGroups.length > 0) {
      const groupDetails = customersWithGroups.map(c => {
        const group = customerGroups.find(g => g.id === c.groupId);
        return { name: c.name, groupId: c.groupId, groupName: group?.name };
      });
      console.log('🔍 Customers with groups:', groupDetails);
    }

    displayedJobs.forEach((job) => {
      if (processedJobIds.has(job.id)) return;

      const customer = customers.find(c => c.id === job.customerId);
      if (!customer) return;

      // Check if this customer has a group
      if (customer.groupId) {
        const group = customerGroups.find(g => g.id === customer.groupId);
        if (!group) {
          // Group not found, treat as single job
          items.push({
            isGroup: false,
            job,
            customer
          });
          processedJobIds.add(job.id);
          return;
        }

        // Find all jobs for customers in this group that haven't been processed
        const groupJobs = displayedJobs.filter(j => {
          if (processedJobIds.has(j.id)) return false;
          const c = customers.find(cust => cust.id === j.customerId);
          return c && c.groupId === customer.groupId;
        });

        // Always create a group item, even if only one job
        // This ensures consistent display and drag behavior
        const groupCustomers = groupJobs.map(j => customers.find(c => c.id === j.customerId)!).filter(Boolean);

        items.push({
          isGroup: true,
          groupName: group.name,
          jobs: groupJobs,
          customers: groupCustomers,
          totalTime: group.workTimeMinutes
        });

        // Mark these jobs as processed
        groupJobs.forEach(j => processedJobIds.add(j.id));
      } else {
        // No group - single job
        items.push({
          isGroup: false,
          job,
          customer
        });
        processedJobIds.add(job.id);
      }
    });

    // Debug: Log what displayItems were created
   // console.log('📊 DisplayItems created:', items.length, 'items');
   // console.log('📊 Groups:', items.filter(i => i.isGroup).length);
   // console.log('📊 Singles:', items.filter(i => !i.isGroup).length);
    if (items.some(i => i.isGroup)) {
      console.log('📊 Group details:', items.filter(i => i.isGroup).map(i => i.isGroup ? { name: i.groupName, jobs: i.jobs.length } : null));
    }

    return items;
  })();

  // Sync starting address with weather location
  useEffect(() => {
    const weatherLocation = localStorage.getItem('weatherLocationName');
    if (weatherLocation && !startingAddress) {
      setStartingAddress(weatherLocation);
    }
  }, []); // Run once on mount

  // Register reset to today function
  useEffect(() => {
    if (resetToTodayRef) {
      resetToTodayRef.current = () => {
        setCurrentDayIndex(0);
      };
    }
  }, [resetToTodayRef]);

  // Auto-create jobs for customers due on the currently viewed date who don't have a job yet (in Supabase)
  useEffect(() => {
    const ensureJobs = async () => {
      if (customersDueOnDate.length === 0) return;
      
      // Get current job IDs to avoid re-creating
      const existingJobCustomerIds = new Set(jobs.filter(j => j.date === currentViewDate).map(j => j.customerId));
      const missing = customersDueOnDate.filter(c => {
        const key = `${c.id}-${currentViewDate}`;
        // Skip if already exists OR currently being created
        return !existingJobCustomerIds.has(c.id) && !creatingJobsRef.current.has(key);
      });
      
      if (missing.length === 0) return;
      
      console.log(`🔄 Auto-creating jobs for ${missing.length} customers on ${currentViewDate}`);
      
      // Mark these jobs as being created
      missing.forEach(c => creatingJobsRef.current.add(`${c.id}-${currentViewDate}`));
      
      try {
        // Calculate next order number based on ALL jobs (not just displayed filtered list)
        const dateJobsList = jobs.filter(j => j.date === currentViewDate);
        const maxOrder = Math.max(0, ...dateJobsList.map(j => j.order || 0));
        
        const results = await Promise.allSettled(
          missing.map((c, index) =>
            addJob({ 
              customerId: c.id, 
              date: currentViewDate, 
              status: 'scheduled',
              order: maxOrder + index + 1
            })
          )
        );
        
        const created = results.filter(r => r.status === 'fulfilled').length;
        const duplicates = results.filter(r => 
          r.status === 'rejected' && 
          (r.reason?.message?.includes('duplicate key') || r.reason?.message?.includes('409'))
        ).length;
        const errors = results.filter(r => 
          r.status === 'rejected' && 
          !(r.reason?.message?.includes('duplicate key') || r.reason?.message?.includes('409'))
        ).length;
        
        console.log(`✅ Created: ${created}, ⏭️ Duplicates: ${duplicates}, ❌ Errors: ${errors}`);
        
        // Refresh both customers and jobs from database if any were created
        if (created > 0) {
          await onRefreshJobs?.();
          await onRefreshCustomers();
        }
      } catch (e) {
        console.error('Failed to create jobs in Supabase:', e);
        toast.error('Failed to create jobs for this date.');
      } finally {
        // Clear the creation flags after attempt
        missing.forEach(c => creatingJobsRef.current.delete(`${c.id}-${currentViewDate}`));
      }
    };
    ensureJobs();
  }, [customersDueOnDate.length, currentViewDate]); // Removed jobs.length to avoid infinite loops

  // Auto-create jobs for ALL customers with nextCutDate (for calendar view)
  useEffect(() => {
    const ensureAllScheduledJobs = async () => {
      // Get all customers with a nextCutDate
      const customersWithNextCut = customers.filter(c => c.nextCutDate);
      if (customersWithNextCut.length === 0) return;
      
      // Find customers who have a nextCutDate but no corresponding job
      const existingJobMap = new Map(
        jobs.map(j => [`${j.customerId}-${j.date}`, j])
      );
      
      const missingJobs = customersWithNextCut.filter(c => {
        const key = `${c.id}-${c.nextCutDate}`;
        // Skip if already exists OR currently being created
        return !existingJobMap.has(key) && !creatingJobsRef.current.has(key);
      });
      
      if (missingJobs.length === 0) return;
      
      console.log(`🔄 Auto-creating ${missingJobs.length} jobs for customers with nextCutDate`);
      
      // Mark these jobs as being created
      missingJobs.forEach(c => creatingJobsRef.current.add(`${c.id}-${c.nextCutDate}`));
      
      try {
        // Group by date to calculate order numbers
        const jobsByDate = new Map<string, number>();
        jobs.forEach(j => {
          const current = jobsByDate.get(j.date) || 0;
          jobsByDate.set(j.date, Math.max(current, j.order || 0));
        });
        
        const results = await Promise.allSettled(
          missingJobs.map((c) => {
            const maxOrder = jobsByDate.get(c.nextCutDate!) || 0;
            jobsByDate.set(c.nextCutDate!, maxOrder + 1);
            
            return addJob({ 
              customerId: c.id, 
              date: c.nextCutDate!, 
              status: 'scheduled',
              order: maxOrder + 1
            });
          })
        );
        
        const created = results.filter(r => r.status === 'fulfilled').length;
        const duplicates = results.filter(r => 
          r.status === 'rejected' && 
          (r.reason?.message?.includes('duplicate key') || r.reason?.message?.includes('409'))
        ).length;
        const errors = results.filter(r => 
          r.status === 'rejected' && 
          !(r.reason?.message?.includes('duplicate key') || r.reason?.message?.includes('409'))
        ).length;
        
        console.log(`✅ Created: ${created}, ⏭️ Duplicates: ${duplicates}, ❌ Errors: ${errors}`);
        
        // Refresh jobs from database if any were created
        if (created > 0) {
          await onRefreshJobs?.();
        }
      } catch (e) {
        console.error('Failed to create scheduled jobs:', e);
        toast.error('Failed to create scheduled jobs.');
      } finally {
        // Clear the creation flags after attempt
        missingJobs.forEach(c => creatingJobsRef.current.delete(`${c.id}-${c.nextCutDate}`));
      }
    };
    ensureAllScheduledJobs();
  }, [customers.length, jobs.length]); // Run when customers or jobs change

  // Calculate daily stats for currently viewed date
  const totalDueToday = displayedJobs.length; // Total jobs scheduled for this date
  const completedToday = displayedJobs.filter(j => j.status === 'completed').length;
  const totalWorkTime = displayedJobs
    .filter(j => j.status === 'completed' && j.totalTime)
    .reduce((sum, j) => sum + (j.totalTime || 0), 0);
  const totalDriveTime = displayedJobs
    .filter(j => j.status === 'completed' && j.driveTime)
    .reduce((sum, j) => sum + (j.driveTime || 0), 0);

  // Timer effect for in-progress jobs
  useEffect(() => {
    const interval = setInterval(() => {
      const inProgressJobs = jobs.filter(j => j.status === 'in-progress' && j.startTime);
      
      const newElapsedTime: { [jobId: string]: number } = {};
      inProgressJobs.forEach(job => {
        if (job.startTime) {
          const startTime = new Date(job.startTime).getTime();
          const now = new Date().getTime();
          const elapsedMinutes = Math.floor((now - startTime) / 1000 / 60);
          newElapsedTime[job.id] = elapsedMinutes;
        }
      });
      
      setElapsedTime(newElapsedTime);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [jobs]);

  const formatElapsedTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatScheduledTime = (timeString: string) => {
    // timeString format: "HH:MM" (24-hour)
    const [hourStr, minuteStr] = timeString.split(':');
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const displayMinute = minute.toString().padStart(2, '0');
    
    return `${displayHour}:${displayMinute} ${period}`;
  };

  // Generate Google Maps route URL with waypoints
  const generateRouteUrl = (jobsForRoute: Job[]): string => {
    if (jobsForRoute.length === 0) return '';
    
    // Sort jobs by order to ensure correct route sequence
    const sortedJobs = [...jobsForRoute].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Get addresses for each job
    const addresses = sortedJobs.map(job => {
      const customer = customers.find(c => c.id === job.customerId);
      return customer?.address || '';
    }).filter(addr => addr !== '');
    
    if (addresses.length === 0) return '';
    
    // Google Maps directions URL format:
    // https://www.google.com/maps/dir/?api=1&origin=START&destination=END&waypoints=WAYPOINT1|WAYPOINT2|...
    const origin = startingAddress || addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(0, -1).join('|');
    
    const params = new URLSearchParams({
      api: '1',
      origin: origin,
      destination: destination,
      travelmode: 'driving'
    });
    
    if (waypoints) {
      params.append('waypoints', waypoints);
    }
    
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  // Estimate drive time between two addresses (with Google Maps API integration)
  const estimateDriveTime = (address1: string, address2: string): string => {
    // Check cache first
    const cacheKey = `${address1}|${address2}`;
    if (driveTimesCache.has(cacheKey)) {
      return driveTimesCache.get(cacheKey)!;
    }

    // Return fallback immediately for rendering
    // Real API call happens in background useEffect
    return estimateDriveTimeFallback(address1, address2);
  };

  // Fetch real drive times from Google Maps API in background
  const didDriveTimeRefresh = useRef(false);
  useEffect(() => {
    didDriveTimeRefresh.current = false; // Reset when jobs or address changes
    const fetchDriveTimes = async () => {
      if (displayedJobs.length === 0) return;

      const pairs: Array<{ from: string; to: string }> = [];

      // Collect all address pairs that need drive time calculation
      displayedJobs.forEach((job, index) => {
        const customer = getCustomer(job.customerId);
        if (!customer) return;

        if (index === 0 && startingAddress) {
          // First job - from starting address
          pairs.push({ from: startingAddress, to: customer.address });
        } else if (index > 0) {
          // Subsequent jobs - from previous job
          const prevJob = displayedJobs[index - 1];
          const prevCustomer = getCustomer(prevJob.customerId);
          if (prevCustomer) {
            pairs.push({ from: prevCustomer.address, to: customer.address });
          }
        }
      });

      // Fetch drive times for uncached pairs
      const newCache = new Map(driveTimesCache);
      let allFetched = true;
      for (const { from, to } of pairs) {
        const cacheKey = `${from}|${to}`;
        if (!newCache.has(cacheKey)) {
          allFetched = false;
          try {
            const result = await getDriveTime(from, to);
            if (result) {
              newCache.set(cacheKey, `${result.durationMinutes} min`);
            }
          } catch (error) {
            // Silently fail and use fallback
          }
        }
      }

      setDriveTimesCache(prev => {
        // Only trigger refresh after cache is updated in state
        if (allFetched && !didDriveTimeRefresh.current && typeof onRefreshJobs === 'function') {
          didDriveTimeRefresh.current = true;
          // Use a small timeout to ensure state update is flushed
          setTimeout(() => {
            onRefreshJobs();
          }, 50);
        }
        return newCache;
      });
    };

    fetchDriveTimes();
  }, [displayedJobs.length, startingAddress]); // Re-fetch when jobs or starting address changes

  // Fallback estimation method (improved estimation)
  const estimateDriveTimeFallback = (address1: string, address2: string): string => {
    // Better distance estimation based on address components
    // For production accuracy, integrate Google Maps Distance Matrix API
    
    // Extract street number, name, and type
    const parseAddress = (addr: string) => {
      // Match: number + street name + street type (Lane, Drive, Street, etc)
      const match = addr.match(/^(\d+)\s+([\w\s]+?)\s+(Lane|Drive|Street|Road|Avenue|Circle|Court|Way|Boulevard|Cir|Dr|St|Rd|Ave|Ln|Blvd)(?:\s|,|$)/i);
      if (match) {
        return {
          number: parseInt(match[1]),
          name: match[2].toLowerCase().trim(),
          type: match[3].toLowerCase(),
          fullStreet: `${match[2]} ${match[3]}`.toLowerCase().trim()
        };
      }
      return { 
        number: 0, 
        name: addr.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
        type: '',
        fullStreet: addr.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      };
    };
    
    const addr1 = parseAddress(address1);
    const addr2 = parseAddress(address2);
    
    // Same exact street - calculate based on house number difference
    if (addr1.fullStreet === addr2.fullStreet) {
      const numberDiff = Math.abs(addr1.number - addr2.number);
      if (numberDiff < 50) return '2 min';
      if (numberDiff < 200) return '3 min';
      if (numberDiff < 400) return '5 min';
      return '7 min';
    }
    
    // Check if street names share common words (might be parallel/intersecting streets)
    const name1Words = addr1.name.split(/\s+/);
    const name2Words = addr2.name.split(/\s+/);
    const sharedWords = name1Words.filter(w => w.length > 3 && name2Words.includes(w));
    
    if (sharedWords.length > 0) {
      // Similar street names suggest nearby area
      return '8 min';
    }
    
    // Different streets - use house number differential as rough distance proxy
    // Larger number difference suggests further apart geographically
    const numberDiff = Math.abs(addr1.number - addr2.number);
    
    // Also consider if they're same street type in same numbering area
    if (addr1.type === addr2.type && numberDiff < 200) {
      return '10 min';
    }
    
    // General distance estimation based on address number spread
    if (numberDiff < 100) return '8 min';
    if (numberDiff < 300) return '12 min';
    if (numberDiff < 500) return '15 min';
    if (numberDiff < 1000) return '18 min';
    if (numberDiff < 2000) return '22 min';
    return '25 min';
  };

  const sendMessage = async (customer: Customer, templateType: 'starting' | 'on-the-way' | 'completed' | 'scheduled') => {
    const template = messageTemplates.find(t => t.trigger === templateType && t.active);
    if (!template) {
      toast.error(`No active ${templateType} message template found`);
      return;
    }

    const message = template.message
      .replace('{name}', customer.name)
      .replace('{address}', customer.address)
      .replace('{time}', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    // Validate phone number format
    const phoneNumber = customer.phone?.replace(/\D/g, ''); // Remove non-digits
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error(`Invalid phone number for ${customer.name}`);
      return;
    }

    // Format phone number for SMS (add +1 if US number)
    const formattedPhone = phoneNumber.length === 10 ? `+1${phoneNumber}` : `+${phoneNumber}`;
    
    try {
      // Show sending toast
      toast.loading(`Sending message to ${customer.name}...`, { id: 'sms-sending' });
      
      const success = await smsService.sendSMS(formattedPhone, message);
      
      if (success) {
        toast.success(`Message sent to ${customer.name}`, {
          id: 'sms-sending',
          description: message.substring(0, 60) + (message.length > 60 ? '...' : ''),
          duration: 3000,
        });
      } else {
        toast.error(`Failed to send message to ${customer.name}`, {
          id: 'sms-sending',
          description: 'Please check SMS service configuration',
        });
      }
    } catch (error) {
      console.error('SMS sending error:', error);
      toast.error(`SMS service error`, {
        id: 'sms-sending',
        description: 'Unable to send message at this time',
      });
    }
  };

  const handleStartJobClick = (job: Job) => {
    setPendingStartJob(job);
    setShowStartDialog(true);
  };

  const confirmStartJob = async (shouldSendMessage: boolean) => {
    if (!pendingStartJob) return;
    const startIso = new Date().toISOString();
    const updatedLocal = jobs.map(j =>
      j.id === pendingStartJob.id
        ? { ...j, status: 'in-progress' as const, startTime: startIso }
        : j
    );
    onUpdateJobs(updatedLocal);
    // Persist to Supabase
    updateJob({ ...pendingStartJob, status: 'in-progress', startTime: startIso }).catch((e) => {
      console.error('Failed to persist job start:', e);
      toast.error('Failed to start job in database');
    }).finally(() => {
      onRefreshJobs?.();
    });
    toast.success('Timer started!');

    // Send "starting job" message if requested
    if (shouldSendMessage) {
      const customer = customers.find(c => c.id === pendingStartJob.customerId);
      if (customer) {
        await sendMessage(customer, 'starting');
      }
    }

    setShowStartDialog(false);
    setPendingStartJob(null);
  };

  const handleCompleteJob = async (job: Job, totalMinutes: number, notes: string, sendCompletionMessage: boolean) => {
    const endIso = new Date().toISOString();
    
    // Calculate drive time for this job
    const jobIndex = displayedJobs.findIndex(j => j.id === job.id);
    let calculatedDriveTime = 0;
    
    if (jobIndex === 0 && startingAddress) {
      // First job - drive from starting address
      const customer = customers.find(c => c.id === job.customerId);
      if (customer) {
        const driveTimeStr = estimateDriveTime(startingAddress, customer.address);
        const match = driveTimeStr.match(/(\d+)/);
        calculatedDriveTime = match ? parseInt(match[1]) : 0;
      }
    } else if (jobIndex > 0) {
      // Subsequent jobs - drive from previous job
      const prevJob = displayedJobs[jobIndex - 1];
      const prevCustomer = customers.find(c => c.id === prevJob.customerId);
      const currentCustomer = customers.find(c => c.id === job.customerId);
      if (prevCustomer && currentCustomer) {
        const driveTimeStr = estimateDriveTime(prevCustomer.address, currentCustomer.address);
        const match = driveTimeStr.match(/(\d+)/);
        calculatedDriveTime = match ? parseInt(match[1]) : 0;
      }
    }
    
    const updatedLocal = jobs.map(j =>
      j.id === job.id
        ? {
            ...j,
            status: 'completed' as const,
            endTime: endIso,
            totalTime: totalMinutes,
            driveTime: calculatedDriveTime,
            notes: notes || j.notes,
          }
        : j
    );
    onUpdateJobs(updatedLocal);
    // Persist to Supabase
    const toPersist: Job = {
      ...job,
      status: 'completed',
      endTime: endIso,
      totalTime: totalMinutes,
      driveTime: calculatedDriveTime,
      notes: notes || job.notes,
    };
    updateJob(toPersist).then(() => onRefreshJobs?.()).catch((e) => {
      console.error('Failed to persist job completion:', e);
      toast.error('Failed to save job completion');
    });
  // selectedJob removed; no longer needed
    setJobNotes('');
    
    // Clear elapsed time for this job
    setElapsedTime(prev => {
      const newElapsed = { ...prev };
      delete newElapsed[job.id];
      return newElapsed;
    });

    // Update customer's lastCutDate and nextCutDate
    const customer = customers.find(c => c.id === job.customerId);
    if (customer) {
      const completedDate = job.date; // Use the job's scheduled date as the cut date
      
      // Calculate next cut date based on frequency
      const nextDate = new Date(completedDate);
      switch (customer.frequency) {
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'biweekly':
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
      }
      
      const nextCutDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      
      // Update customer record
      const updatedCustomer = {
        ...customer,
        lastCutDate: completedDate,
        nextCutDate: nextCutDateStr
      };
      
      updateCustomer(updatedCustomer).then(async () => {
        // Refresh customers from database to get updated data
        await onRefreshCustomers();
        
        // Create the next job immediately
        try {
          // Check if job already exists for this date
          const existingJob = jobs.find(j => j.customerId === customer.id && j.date === nextCutDateStr);
          if (!existingJob) {
            // Calculate order for the new job
            const jobsOnDate = jobs.filter(j => j.date === nextCutDateStr);
            const maxOrder = Math.max(0, ...jobsOnDate.map(j => j.order || 0));
            
            await addJob({
              customerId: customer.id,
              date: nextCutDateStr,
              status: 'scheduled',
              order: maxOrder + 1
            });
            
            // Refresh jobs to show the new job
            await onRefreshJobs?.();
            console.log(`Created next job for ${customer.name} on ${nextCutDateStr}`);
          }
        } catch (e) {
          console.error('Failed to create next job:', e);
        }
      }).catch((e) => {
        console.error('Failed to update customer dates:', e);
        toast.error('Failed to update customer schedule');
      });
    }
    
    toast.success('Job completed!');

    // Send completion message if requested
    if (sendCompletionMessage) {
      if (customer) {
        await sendMessage(customer, 'completed');
      }
    }

    // Check for next job and prompt to notify
    const currentJobIndex = displayedJobs.findIndex(j => j.id === job.id);
    const nextJob = displayedJobs[currentJobIndex + 1];
    if (nextJob && nextJob.status === 'scheduled') {
      setNextJobToNotify(nextJob);
      setShowNextJobDialog(true);
    }
  };

  const notifyNextCustomer = () => {
    if (!nextJobToNotify) return;
    
    const customer = customers.find(c => c.id === nextJobToNotify.customerId);
    if (customer) {
      sendMessage(customer, 'on-the-way');
    }
    setShowNextJobDialog(false);
    setNextJobToNotify(null);
  };

  const handleRescheduleJob = async (jobId: string, newDate: string, timeSlot?: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      // Calculate scheduled time from time slot
      // Time slots start at 5am, may be offset by day start time
      const dayStartHour = dayStartTimes.get(newDate) || 5;
      const slotOffset = Math.max(0, dayStartHour - 5);
      const actualHour = 5 + (timeSlot || 0) + slotOffset;
      const scheduledTime = timeSlot !== undefined ? `${actualHour}:00` : undefined;
      
      await updateJob({ ...job, date: newDate, scheduledTime });
      
      // Update customer's nextCutDate if this job was their next cut
      const customer = customers.find(c => c.id === job.customerId);
      if (customer && customer.nextCutDate === job.date) {
        await updateCustomer({
          ...customer,
          nextCutDate: newDate
        });
        await onRefreshCustomers();
      }
      
      await onRefreshJobs?.();
      toast.success('Job rescheduled successfully');
    } catch (error) {
      console.error('Error rescheduling job:', error);
      toast.error('Failed to reschedule job');
    }
  };

  const handleUpdateJobTime = async (jobId: string, estimatedMinutes: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      await updateJob({ ...job, totalTime: estimatedMinutes });
      await onRefreshJobs?.();
    } catch (error) {
      console.error('Error updating job time:', error);
      toast.error('Failed to update job time');
    }
  };

  const handleStartTimeChange = async (date: string, startHour: number) => {
    // Store the start time
    setDayStartTimes(prev => {
      const newMap = new Map(prev);
      newMap.set(date, startHour);
      return newMap;
    });

    // Update scheduled times for all jobs on this date
    const jobsOnDate = jobs.filter(j => j.date === date && j.scheduledTime);
    
    for (const job of jobsOnDate) {
      if (!job.scheduledTime) continue;
      
      // Parse the current scheduled time
      const [hours] = job.scheduledTime.split(':').map(Number);
      
      // If the scheduled time is before the new start time, update it
      if (hours < startHour) {
        const newScheduledTime = `${startHour}:00`;
        try {
          await updateJob({ ...job, scheduledTime: newScheduledTime });
        } catch (error) {
          console.error('Error updating job scheduled time:', error);
        }
      }
    }
    
    // Refresh jobs to show updated times
    await onRefreshJobs?.();
  };

  // Address autocomplete handlers
  const handleStartingAddressChange = (address: string) => {
    setStartingAddress(address);
    localStorage.setItem('routeStartingAddress', address);
    localStorage.setItem('weatherLocationName', address);
  };

  const handleOptimizeRoute = async () => {
    if (!startingAddress.trim()) {
      toast.error('Please set a starting address first');
      return;
    }

    try {
      // Fetch fresh jobs from database to ensure we have the latest data
      // This is critical - if user manually moved jobs, we need the current state
      console.log('Fetching latest jobs from database...');
      const freshJobs = await fetchJobs();
      console.log('Fresh jobs fetched:', freshJobs.length);
      
      // Set optimizing state - this will show "Calculating..." in the UI
      onOptimizationStatusChange?.('optimizing');
      
      // Clear the cache temporarily to show "Calculating..." state
      setDriveTimesCache(new Map());
      
      toast.loading('Calculating optimal routes for all days...', { id: 'optimize-route' });
      
      // Get next 30 days (today + 29 days ahead)
      const next30Days = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        next30Days.push(date.toLocaleDateString('en-CA'));
      }
      
      console.log('=== STARTING MULTI-DAY ROUTE OPTIMIZATION ===');
      console.log('Optimizing jobs for dates:', next30Days);
      console.log('Starting address:', startingAddress);
      
      const allOptimizedJobs: Job[] = [];
      const newDriveTimesCache = new Map<string, string>();
      let totalOptimizedDays = 0;
      
      // Optimize each day's jobs - using fresh jobs from database
      for (const dateStr of next30Days) {
        const dayJobs = freshJobs.filter(j => j.date === dateStr);
        const scheduledJobs = dayJobs.filter(j => j.status === 'scheduled');
        const nonScheduledJobs = dayJobs.filter(j => j.status !== 'scheduled');
        
        if (scheduledJobs.length === 0) {
          console.log(`Skipping ${dateStr} - no scheduled jobs`);
          // Keep non-scheduled jobs as-is
          allOptimizedJobs.push(...nonScheduledJobs);
          continue;
        }
        
        if (scheduledJobs.length === 1) {
          console.log(`Skipping ${dateStr} - only one scheduled job`);
          allOptimizedJobs.push(...dayJobs);
          continue;
        }
        
        console.log(`\n=== Optimizing ${dateStr} (${scheduledJobs.length} jobs) ===`);
        
        // Convert jobs to the format expected by optimizeRoute
        const jobsWithAddresses = scheduledJobs.map(job => {
          const customer = customers.find(c => c.id === job.customerId);
          const jobData = {
            id: job.id,
            address: customer?.address || '',
            order: job.order
          };
          console.log(`  Input: ${customer?.name || 'Unknown'} at ${jobData.address}`);
          return jobData;
        });
        
        // Optimize the route using Google Maps
        const optimizedRoute = await optimizeRouteWithGoogleMaps(startingAddress, jobsWithAddresses);
        
        console.log(`\n=== Results for ${dateStr} ===`);
        console.log(`  Total Duration: ${optimizedRoute.totalDurationText}`);
        console.log(`  Total Distance: ${optimizedRoute.totalDistanceText}`);
        console.log('  Optimized Route Order:');
        optimizedRoute.jobs.forEach((job, idx) => {
          const customer = customers.find(c => c.id === job.id);
          console.log(`    ${idx + 1}. ${customer?.name || 'Unknown'} at ${job.address}`);
        });
        console.log('  Route Segments:');
        optimizedRoute.segments.forEach((seg, idx) => {
          console.log(`    ${idx + 1}. ${seg.fromAddress.substring(0, 30)}... → ${seg.toAddress.substring(0, 30)}...: ${seg.durationText}`);
        });
        
        // Store drive times in cache
        optimizedRoute.segments.forEach((segment) => {
          const cacheKey = `${segment.fromAddress}|${segment.toAddress}`;
          newDriveTimesCache.set(cacheKey, segment.durationText);
        });
        
        // Map the optimized jobs back to the original job objects with new order and scheduled times
        const startHour = dayStartTimes.get(dateStr) || 5;
        let currentTime = startHour * 60; // Convert to minutes from midnight
        
        const optimizedJobsWithData = optimizedRoute.jobs.map((optimizedJob, index) => {
          const originalJob = scheduledJobs.find(j => j.id === optimizedJob.id);
          
          // Calculate scheduled time
          const hours = Math.floor(currentTime / 60);
          const minutes = currentTime % 60;
          const scheduledTime = `${hours}:${minutes.toString().padStart(2, '0')}`;
          
          // Add estimated job duration (60 minutes) + drive time for next iteration
          const jobDuration = 60; // 1 hour per job
          currentTime += jobDuration;
          
          // Add drive time to next location if available
          if (index < optimizedRoute.segments.length) {
            const driveMinutes = optimizedRoute.segments[index].durationMinutes || 10;
            currentTime += driveMinutes;
          }
          
          return {
            ...originalJob!,
            order: optimizedJob.order,
            scheduledTime
          };
        });
        
        // Keep non-scheduled jobs with their existing order (or put at end)
        const maxScheduledOrder = optimizedJobsWithData.length;
        const nonScheduledWithOrder = nonScheduledJobs.map((job, index) => ({
          ...job,
          order: (job.order && job.order > maxScheduledOrder) ? job.order : maxScheduledOrder + index + 1
        }));
        
        // Add this day's jobs to the collection
        allOptimizedJobs.push(...optimizedJobsWithData, ...nonScheduledWithOrder);
        totalOptimizedDays++;
      }
      
      console.log(`\n=== Optimized ${totalOptimizedDays} days ===`);
      console.log('Total optimized jobs:', allOptimizedJobs.length);
      
      // Persist optimized jobs to database
      console.log('Persisting to database...');
      const updatePromises = allOptimizedJobs.map(async (job) => {
        try {
          await updateJob(job);
          console.log(`✓ Updated job for ${job.date} (order: ${job.order})`);
        } catch (err) {
          console.error(`✗ Failed to update job for ${job.date}:`, err);
          throw err;
        }
      });
      
      await Promise.all(updatePromises);
      
      console.log('All jobs updated in database, refreshing...');
      
      // Store the optimized job order for change detection BEFORE refreshing
      const newOptimizedOrder = new Map<string, number>();
      allOptimizedJobs.forEach(job => {
        if (job.order) newOptimizedOrder.set(job.id, job.order);
      });
      setOptimizedJobOrder(newOptimizedOrder);

      // Refresh jobs from database FIRST - this will trigger WeatherForecast to re-sort
      await onRefreshJobs?.();
      
      // Wait for the refresh to propagate through React
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Set optimized state AFTER refresh completes to prevent race condition
      onOptimizationStatusChange?.('optimized');
      onJobChangesDetected?.(false); // No changes right after optimization
      
      // Update cache with the new route data from all days
      setDriveTimesCache(newDriveTimesCache);

      console.log('=== MULTI-DAY ROUTE OPTIMIZATION COMPLETE ===');
      console.log('Optimized jobs with new order:', allOptimizedJobs.map(j => ({ 
        id: j.id.substring(0, 8), 
        date: j.date, 
        order: j.order,
        scheduledTime: j.scheduledTime
      })));

      toast.success(`Routes optimized for ${totalOptimizedDays} ${totalOptimizedDays === 1 ? 'day' : 'days'}!`, { 
        id: 'optimize-route',
        description: `${allOptimizedJobs.length} jobs reordered across all days`
      });
    } catch (error) {
      console.error('=== ROUTE OPTIMIZATION FAILED ===');
      console.error('Error details:', error);
      onOptimizationStatusChange?.('idle'); // Reset state on error
      toast.error('Failed to optimize route', { 
        id: 'optimize-route',
        description: 'Check console for details'
      });
    }
  };

  // Detect job order changes after optimization
  useEffect(() => {
    if (optimizedJobOrder.size === 0) return; // No optimization has occurred yet
    
    // Skip change detection if we're currently optimizing (let it complete)
    if (optimizationStatus === 'optimizing') return;
    
    // Check if any job's order has changed from the optimized order
    let hasChanges = false;
    for (const job of jobs) {
      const optimizedOrder = optimizedJobOrder.get(job.id);
      if (optimizedOrder !== undefined && job.order !== optimizedOrder) {
        hasChanges = true;
        break;
      }
    }
    
    // If there are changes and we're currently in optimized state, reset to idle
    if (hasChanges && optimizationStatus === 'optimized') {
      onOptimizationStatusChange?.('idle');
    }
    
    onJobChangesDetected?.(hasChanges);
  }, [jobs, optimizedJobOrder, onJobChangesDetected, optimizationStatus, onOptimizationStatusChange]);

  // Listen for optimize route event from nav bar
  useEffect(() => {
    const handleOptimizeEvent = () => {
      handleOptimizeRoute();
    };
    
    window.addEventListener('optimizeRoute', handleOptimizeEvent);
    return () => window.removeEventListener('optimizeRoute', handleOptimizeEvent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startingAddress]); // Only re-attach when starting address changes

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.stopPropagation();
    setDraggedJobId(jobId);
    setDragPosition({ x: e.clientX, y: e.clientY });
    e.dataTransfer.effectAllowed = 'move';
    
    // Hide the default drag ghost image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDraggedOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedJobId(null);
    setDragPosition(null);
    setDraggedOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedJobId) return;

    const draggedJob = displayedJobs.find(j => j.id === draggedJobId);
    if (!draggedJob) {
      setDraggedJobId(null);
      setDragPosition(null);
      setDraggedOverIndex(null);
      return;
    }

    const draggedCustomer = customers.find(c => c.id === draggedJob.customerId);
    
    // Check if this is a group
    let jobsToMove: typeof displayedJobs = [draggedJob];
    if (draggedCustomer?.groupId) {
      // Find all jobs in the same group
      const groupId = draggedCustomer.groupId;
      jobsToMove = displayedJobs.filter(j => {
        const c = customers.find(cust => cust.id === j.customerId);
        return c?.groupId === groupId;
      });
      console.log(`📦 Moving group with ${jobsToMove.length} jobs`);
    }

    // Find the source index of the first job in the group
    const sourceIndex = displayedJobs.findIndex(j => j.id === jobsToMove[0].id);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedJobId(null);
      setDragPosition(null);
      setDraggedOverIndex(null);
      return;
    }

    // Reorder jobs - remove all jobs in the group and insert at target
    const reorderedJobs = [...displayedJobs];
    
    // Remove all jobs that are being moved
    const jobIdsToMove = new Set(jobsToMove.map(j => j.id));
    const remainingJobs = reorderedJobs.filter(j => !jobIdsToMove.has(j.id));
    
    // Calculate the actual target index after removing moved jobs
    const adjustedTargetIndex = targetIndex - reorderedJobs.slice(0, targetIndex).filter(j => jobIdsToMove.has(j.id)).length;
    
    // Insert the moved jobs at the target position
    remainingJobs.splice(adjustedTargetIndex, 0, ...jobsToMove);

    // Update order field for all affected jobs
    const updatedJobs = remainingJobs.map((job, idx) => ({
      ...job,
      order: idx + 1
    }));

    // Update in database
    try {
      await Promise.all(
        updatedJobs.map(job => updateJob(job))
      );
      await onRefreshJobs?.();
      toast.success(jobsToMove.length > 1 ? 'Group order updated' : 'Job order updated');
    } catch (error) {
      console.error('Failed to update job order:', error);
      toast.error('Failed to update job order');
    }

    setDraggedJobId(null);
    setDragPosition(null);
    setDraggedOverIndex(null);
  };

  // Track mouse movement for drag preview
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedJobId) {
        setDragPosition({ x: e.clientX, y: e.clientY });
      }
    };

    if (draggedJobId) {
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [draggedJobId]);

  const getCustomer = (customerId: string) => {
    return customers.find(c => c.id === customerId);
  };

  if (customers.length === 0) {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Welcome to Job Flow</CardTitle>
          <CardDescription>Add customers to start scheduling jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            Go to the Customers tab to add your first customer and start managing your daily schedule.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weather Forecast Section */}
      <WeatherForecast 
        jobs={jobs}
        customers={customers}
        customerGroups={customerGroups}
        onRescheduleJob={handleRescheduleJob}
        onUpdateJobTime={handleUpdateJobTime}
        onStartTimeChange={handleStartTimeChange}
        onOptimizeRoute={handleOptimizeRoute}
        optimizationStatus={optimizationStatus}
        onOptimizationStatusChange={onOptimizationStatusChange}
        startingAddress={startingAddress}
        onStartingAddressChange={handleStartingAddressChange}
        onLocationChange={onLocationChange}
        onEditAddress={onEditAddress}
        onCancelEditAddress={onCancelEditAddress}
        onCloseAddressEditor={onCloseAddressEditor}
        isEditingAddress={isEditingAddress}
        scrollToTodayRef={scrollToTodayRef}
      />

      {/* Jobs Section Header with Day Navigation */}
      {displayedJobs.length > 0 && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={() => setCurrentDayIndex(Math.max(0, currentDayIndex - 1))}
              disabled={currentDayIndex === 0}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
              style={{
                width: 'max(4vh, 32px)',
                height: 'max(4vh, 32px)',
                padding: 0
              }}
            >
              <ChevronLeft style={{ width: 'max(2vh, 16px)', height: 'max(2vh, 16px)' }} />
            </Button>
            <div className="h-1 bg-linear-to-r from-blue-200 via-yellow-200 to-blue-200 rounded-full" style={{ width: 'max(8vw, 60px)' }}></div>
            <h2 className="text-blue-900 uppercase tracking-wide whitespace-nowrap font-bold" style={{ fontSize: 'max(2.5vh, 18px)' }}>
              {getDateLabel(currentDayIndex)}'s Jobs
            </h2>
            <div className="h-1 bg-linear-to-l from-blue-200 via-yellow-200 to-blue-200 rounded-full" style={{ width: 'max(8vw, 60px)' }}></div>
            <Button
              size="sm"
              onClick={() => setCurrentDayIndex(currentDayIndex + 1)}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
              style={{
                width: 'max(4vh, 32px)',
                height: 'max(4vh, 32px)',
                padding: 0
              }}
            >
              <ChevronRight style={{ width: 'max(2vh, 16px)', height: 'max(2vh, 16px)' }} />
            </Button>
          </div>
          
          {/* Navigate Full Route Button */}
          {startingAddress && displayedJobs.length > 0 && (
            <div className="flex justify-center">
              <Button
                onClick={() => {
                  const routeUrl = generateRouteUrl(displayedJobs);
                  if (routeUrl) {
                    window.open(routeUrl, '_blank');
                  } else {
                    toast.error('Unable to generate route - missing addresses');
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
              >
                <Navigation className="h-4 w-4 mr-2" />
                Navigate Full Route ({displayedJobs.length} stops)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Job List */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 justify-items-center max-w-7xl mx-auto">
        {customersDueOnDate.length === 0 && displayedJobs.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur col-span-full">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">No customers scheduled for {getDateLabel(currentDayIndex).toLowerCase()}.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {displayItems.map((item, index) => {
              // Handle grouped jobs
              if (item.isGroup) {
                const { groupName, jobs: groupJobs, customers: groupCustomers, totalTime } = item;
                const firstJob = groupJobs[0];
                
                // Get previous item for drive time calculation
                const previousItem = index > 0 ? displayItems[index - 1] : null;
                let previousCustomer: Customer | undefined;
                if (previousItem) {
                  if (previousItem.isGroup) {
                    previousCustomer = previousItem.customers[previousItem.customers.length - 1];
                  } else {
                    previousCustomer = previousItem.customer;
                  }
                }
                
                // Calculate drive time to first property in group
                let driveTime: string;
                if (optimizationStatus === 'optimizing') {
                  driveTime = 'Calculating...';
                } else if (previousCustomer) {
                  const cacheKey = `${previousCustomer.address}|${groupCustomers[0].address}`;
                  driveTime = driveTimesCache.has(cacheKey)
                    ? driveTimesCache.get(cacheKey)!
                    : 'Calculating...';
                } else if (startingAddress) {
                  const cacheKey = `${startingAddress}|${groupCustomers[0].address}`;
                  driveTime = driveTimesCache.has(cacheKey)
                    ? driveTimesCache.get(cacheKey)!
                    : 'Calculating...';
                } else {
                  driveTime = 'Start';
                }
                
                const allCompleted = groupJobs.every(j => j.status === 'completed');
                const anyInProgress = groupJobs.some(j => j.status === 'in-progress');
                
                // Get group color (use the first customer's group color)
                const group = customerGroups.find(g => g.id === groupCustomers[0]?.groupId);
                const groupColor = group?.color || '#2563eb'; // Blue default
                
                // Calculate height based on total time - groups should be taller
                const minHeight = `max(${Math.max(totalTime / 60 * 3, 12)}vh, ${Math.max(totalTime / 60 * 24, 96)}px)`;
                
                return (
                  <Card 
                    key={`group-${groupName}-${firstJob.id}`} 
                    className={`backdrop-blur cursor-move transition-all select-none ${
                      allCompleted 
                        ? 'bg-gray-100 border-2 border-gray-300' 
                        : anyInProgress
                          ? 'bg-blue-50 border-2 border-blue-300'
                          : draggedOverIndex === index 
                            ? 'bg-blue-50 border-2 border-blue-400 border-dashed' 
                            : 'bg-white border-2 border-gray-300 hover:border-blue-400'
                    } ${draggedJobId === firstJob.id ? 'opacity-50' : ''}`}
                    draggable={!allCompleted}
                    onDragStart={(e) => handleDragStart(e, firstJob.id)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, index)}
                    style={{ minHeight }}
                  >
                    <CardContent className="p-1 sm:p-2">
                      <div className="flex flex-col items-center text-center gap-0.5 sm:gap-1">
                        {/* Colored top bar */}
                        <div 
                          className="w-full h-1 rounded-sm -mt-1 -mx-1" 
                          style={{ 
                            width: 'calc(100% + 8px)',
                            backgroundColor: groupColor
                          }}
                        ></div>
                        
                        {/* Group Header */}
                        <div className="w-full">
                          <div className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1">
                            <Badge className="bg-blue-600 text-white text-[7px] sm:text-[8px] px-1 py-0">
                              GROUP
                            </Badge>
                          </div>
                          <h3 className="text-gray-900 font-bold text-[11px] sm:text-xs">{groupName}</h3>
                          <p className="text-gray-700 font-semibold text-[9px] sm:text-[10px] mt-0.5">
                            {groupJobs.length} properties • {totalTime} min
                          </p>
                          
                          {/* Drive time */}
                          <div className="flex items-center justify-center text-blue-600 gap-0.5 sm:gap-1 text-[8px] sm:text-[9px] mt-0.5">
                            <Clock className="w-2 h-2 sm:w-3 sm:h-3 pointer-events-none shrink-0" />
                            <span className="truncate">{driveTime}</span>
                          </div>
                          
                          {/* Customer list */}
                          <div className="mt-1 text-[8px] sm:text-[9px]">
                            {groupCustomers.map((cust, idx) => (
                              <div key={cust.id} className="text-gray-700 truncate">
                                {idx + 1}. {cust.name}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Action buttons for group */}
                        <div className="flex w-full mt-1 sm:mt-2 gap-1">
                          {!allCompleted && !anyInProgress && (
                            <Button
                              onClick={() => handleStartJobClick(firstJob)}
                              className="bg-purple-600 hover:bg-purple-700 w-full h-6 sm:h-7 text-[9px] sm:text-[10px] px-1 sm:px-2"
                            >
                              <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                              <span className="truncate">Start Group</span>
                            </Button>
                          )}
                          {anyInProgress && (
                            <div className="w-full text-center text-purple-700 font-semibold text-[9px] sm:text-[10px]">
                              Group in progress...
                            </div>
                          )}
                          {allCompleted && (
                            <div className="w-full text-center text-green-700 font-semibold text-[9px] sm:text-[10px]">
                              ✓ Group Complete
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              
              // Handle single jobs
              const { job, customer } = item;
              if (!customer) return null;
              
              // Get previous item for drive time calculation
              const previousItem = index > 0 ? displayItems[index - 1] : null;
              let previousCustomer: Customer | undefined;
              if (previousItem) {
                if (previousItem.isGroup) {
                  // If previous was a group, use last customer in that group
                  previousCustomer = previousItem.customers[previousItem.customers.length - 1];
                } else {
                  previousCustomer = previousItem.customer;
                }
              }
              
              // Calculate drive time based on current order
              let driveTime: string;
              if (optimizationStatus === 'optimizing') {
                // Show "Calculating..." during optimization
                driveTime = 'Calculating...';
              } else if (previousCustomer) {
                const cacheKey = `${previousCustomer.address}|${customer.address}`;
                driveTime = driveTimesCache.has(cacheKey)
                  ? driveTimesCache.get(cacheKey)!
                  : 'Calculating...';
              } else if (startingAddress) {
                const cacheKey = `${startingAddress}|${customer.address}`;
                driveTime = driveTimesCache.has(cacheKey)
                  ? driveTimesCache.get(cacheKey)!
                  : 'Calculating...';
              } else {
                driveTime = 'Start';
              }
              
//this job.id is where i can control the colors of the background for the cards. 
            return (
              <Card 
                key={job.id} 
                className={`backdrop-blur cursor-move transition-all select-none ${
                  job.status === 'completed' 
                    ? 'bg-blue-50 border border-blue-300' 
                    : draggedOverIndex === index 
                      ? 'bg-blue-50 border-2 border-blue-400 border-dashed' 
                      : 'bg-white/80'
                } ${draggedJobId === job.id ? 'opacity-50' : ''}`}
                draggable={job.status === 'scheduled'}
                onDragStart={(e) => handleDragStart(e, job.id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, index)}
              >
                <CardContent className="p-1 sm:p-2">
                  {/* Centered layout */}
                  <div className="flex flex-col items-center text-center gap-0.5 sm:gap-1">
                    <div className="w-full">
                      <h3 className="text-blue-800 font-semibold text-[10px] sm:text-xs truncate">{customer.name}</h3>
                      <div className="flex items-center justify-center text-gray-600 gap-0.5 sm:gap-1 text-[8px] sm:text-[9px] mt-0.5">
                        <MapPin className="w-2 h-2 sm:w-3 sm:h-3 shrink-0 pointer-events-none" />
                        <span className="truncate">{customer.address}</span>
                      </div>
                      {job.scheduledTime && (
                        <div className="flex items-center justify-center text-blue-600 font-medium gap-0.5 sm:gap-1 text-[8px] sm:text-[9px] mt-0.5">
                          <Clock className="w-2 h-2 sm:w-3 sm:h-3 pointer-events-none shrink-0" />
                          <span className="truncate">Scheduled: {formatScheduledTime(job.scheduledTime)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-center text-blue-600 gap-0.5 sm:gap-1 text-[8px] sm:text-[9px] mt-0.5">
                        <Clock className="w-2 h-2 sm:w-3 sm:h-3 pointer-events-none shrink-0" />
                        <span className="truncate">{driveTime}</span>
                      </div>
                    </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                    {customer.isHilly && <Badge variant="secondary" className="text-[7px] sm:text-[8px] px-1 py-0">Hilly</Badge>}
                    {customer.hasFencing && <Badge variant="secondary" className="text-[7px] sm:text-[8px] px-1 py-0">Fenced</Badge>}
                    {customer.hasObstacles && <Badge variant="secondary" className="text-[7px] sm:text-[8px] px-1 py-0">Obstacles</Badge>}
                    <Badge variant="outline" className="text-[7px] sm:text-[8px] px-1 py-0">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                    <Badge variant="outline" className="text-[7px] sm:text-[8px] px-1 py-0">${customer.price}</Badge>
                  </div>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex w-full gap-1">

                      {job.status === 'scheduled' && (
                        <Button
                          onClick={() => handleStartJobClick(job)}
                          className="bg-blue-600 hover:bg-blue-700 w-full h-6 sm:h-7 text-[9px] sm:text-[10px] px-1 sm:px-2"
                        >
                          <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 shrink-0" />
                          <span className="truncate">Start</span>
                        </Button>
                      )}
                      {job.status === 'in-progress' && (
                        <>
                          {/* Live Timer Display */}
                          <div className="flex-1 bg-blue-50 border border-blue-200 rounded text-center min-w-0 p-1">
                            <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                              <StopCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-600 animate-pulse shrink-0" />
                              <span className="text-blue-800 whitespace-nowrap text-[8px] sm:text-[9px]">Running</span>
                              <span className="text-blue-600 font-semibold text-[8px] sm:text-[9px]">
                                {formatElapsedTime(elapsedTime[job.id] || 0)}
                              </span>
                            </div>
                          </div>
                          
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                onClick={() => {
                                  setJobNotes('');
                                  setCompletionMessage(null);
                                  setSelectedTime(null);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 shrink-0 h-6 sm:h-7 text-[9px] sm:text-[10px] px-1 sm:px-2"
                              >
                                <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 shrink-0" />
                                <span className="truncate">Complete</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="text-blue-900">Complete Job - {customer.name}</DialogTitle>
                                <DialogDescription className="text-blue-700">
                                  Timer: {formatElapsedTime(elapsedTime[job.id] || 0)}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                {/* Auto-filled time from timer */}
                                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-blue-900">Tracked Time</Label>
                                    <Badge className="bg-blue-600 text-white">Auto-tracked</Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-blue-600" />
                                    <span className="text-blue-800 font-medium">{formatElapsedTime(elapsedTime[job.id] || 0)}</span>
                                  </div>
                                </div>

                                {/* Time selection */}
                                <div>
                                  <Label className="text-blue-900 mb-3 block">Select time:</Label>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <Button
                                      variant={selectedTime === null ? 'default' : 'outline'}
                                      onClick={() => setSelectedTime(null)}
                                      className={`h-12 text-xs sm:text-sm ${selectedTime === null ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'}`}
                                    >
                                      Auto
                                    </Button>
                                    {[30, 60].map(min => (
                                      <Button
                                        key={min}
                                        variant={selectedTime === min ? 'default' : 'outline'}
                                        onClick={() => setSelectedTime(min)}
                                        className={`h-12 text-xs sm:text-sm ${selectedTime === min ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'}`}
                                      >
                                        {min} min
                                      </Button>
                                    ))}
                                  </div>
                                </div>

                                {/* Notes section */}
                                <div className="space-y-2">
                                  <Label htmlFor="notes" className="text-blue-900">Notes (optional)</Label>
                                  <Textarea
                                    id="notes"
                                    value={jobNotes}
                                    onChange={(e) => setJobNotes(e.target.value)}
                                    placeholder="Any issues or observations..."
                                    rows={3}
                                    className="border-blue-200 focus:border-blue-400 focus:ring-blue-400"
                                  />
                                </div>

                                {/* Messaging prompt */}
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <MessageSquare className="h-4 w-4 text-blue-600" />
                                    <span className="text-sm text-blue-900 font-medium">Send completion message?</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      onClick={() => setCompletionMessage(true)}
                                      className={`${completionMessage === true ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'}`}
                                      variant={completionMessage === true ? 'default' : 'outline'}
                                      size="default"
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Send
                                    </Button>
                                    <Button
                                      onClick={() => setCompletionMessage(false)}
                                      className={`${completionMessage === false ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'}`}
                                      variant={completionMessage === false ? 'default' : 'outline'}
                                      size="default"
                                    >
                                      Skip
                                    </Button>
                                  </div>
                                </div>

                                {/* Complete button - only show when message option is selected */}
                                {completionMessage !== null && (
                                  <div className="pt-2">
                                    <Button
                                      onClick={async () => {
                                        const timeToUse = selectedTime !== null ? selectedTime : (elapsedTime[job.id] || 0);
                                        await handleCompleteJob(job, timeToUse, jobNotes, completionMessage);
                                        // Reset state
                                        setCompletionMessage(null);
                                        setSelectedTime(null);
                                      }}
                                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11"
                                      size="lg"
                                    >
                                      <CheckCircle className="h-5 w-5 mr-2" />
                                      Complete Job
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}
                      {job.status === 'completed' && (
                        <button
                          onClick={async () => {
                            // Undo completion - revert to scheduled
                            const revertedLocal = jobs.map(j =>
                              j.id === job.id
                                ? { ...j, status: 'scheduled' as const, endTime: undefined, totalTime: undefined }
                                : j
                            );
                            onUpdateJobs(revertedLocal);
                            
                            // Persist to Supabase
                            const toRevert: Job = {
                              ...job,
                              status: 'scheduled',
                              endTime: undefined,
                              totalTime: undefined,
                            };
                            
                            try {
                              await updateJob(toRevert);
                              await onRefreshJobs?.();
                              
                              // Also revert customer status
                              const customer = customers.find(c => c.id === job.customerId);
                              if (customer) {
                                await updateCustomer({ ...customer, status: 'incomplete' });
                                await onRefreshCustomers?.();
                              }
                              
                              toast.success('Job reverted to scheduled');
                            } catch (e) {
                              console.error('Failed to revert job:', e);
                              toast.error('Failed to revert job status');
                            }
                          }}
                          className="flex-1 text-center text-blue-700 hover:bg-blue-50 rounded-lg p-1 transition-colors border border-blue-300 hover:border-blue-400"
                          title="Click to undo completion"
                        >
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mx-auto" />
                          <span className="text-[8px] sm:text-[9px]">{job.totalTime} min</span>
                        </button>
                      )}
                      {customer.phone && (
                        <Button
                          variant="outline"
                          className="flex-1 min-w-0 h-6 sm:h-7 text-[9px] sm:text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 px-1 sm:px-2"
                          onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                        >
                          <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 shrink-0" />
                          <span className="truncate">Call</span>
                        </Button>
                      )}
                    </div>
                </CardContent>
              </Card>
            );
          })}
          </>
        )}
      </div>

      {/* Start Job Dialog with Message Prompt */}
      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Starting Job</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStartJob && (
                <>
                  Ready to start job for <strong>{getCustomer(pendingStartJob.customerId)?.name}</strong>.
                  <br /><br />
                  Would you like to notify the customer that you're starting work now?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowStartDialog(false);
              setPendingStartJob(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => confirmStartJob(false)}
            >
              Start (No Message)
            </Button>
            <AlertDialogAction onClick={() => confirmStartJob(true)} className="bg-blue-600 hover:bg-blue-700">
              <Send className="h-4 w-4 mr-2" />
              Send "Starting Now"
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Next Customer Notification Dialog */}
      <AlertDialog open={showNextJobDialog} onOpenChange={setShowNextJobDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notify Next Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {nextJobToNotify && (
                <>
                  Your next stop is <strong>{getCustomer(nextJobToNotify.customerId)?.name}</strong> at {nextJobToNotify.scheduledTime || 'soon'}.
                  <br /><br />
                  Would you like to send them an "on the way" message now?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowNextJobDialog(false);
              setNextJobToNotify(null);
            }}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={notifyNextCustomer} className="bg-blue-600 hover:bg-blue-700">
              <Send className="h-4 w-4 mr-2" />
              Send Message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drag Preview - Shows the job being dragged */}
      {draggedJobId && dragPosition && (() => {
        const draggedJob = displayedJobs.find(j => j.id === draggedJobId);
        const customer = draggedJob ? getCustomer(draggedJob.customerId) : null;
        if (!draggedJob || !customer) return null;
        
        // Check if this is a group
        const isGroupDrag = customer.groupId;
        const group = isGroupDrag ? customerGroups.find(g => g.id === customer.groupId) : null;
        const groupJobs = isGroupDrag 
          ? displayedJobs.filter(j => {
              const c = customers.find(cust => cust.id === j.customerId);
              return c?.groupId === customer.groupId;
            })
          : [];
        
        return (
          <div
            className="fixed pointer-events-none z-50 opacity-90"
            style={{
              left: `${dragPosition.x}px`,
              top: `${dragPosition.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Card className="backdrop-blur bg-white/80 shadow-2xl border-2 border-blue-600 w-[280px]">
              <CardContent className="p-4">
                {isGroupDrag && group ? (
                  // Group drag preview
                  <div className="flex flex-col items-center text-center gap-2">
                    <div 
                      className="w-full h-1 rounded-sm -mt-4 -mx-4" 
                      style={{ 
                        width: 'calc(100% + 32px)',
                        backgroundColor: group.color || '#2563eb'
                      }}
                    ></div>
                    <Badge className="bg-blue-600 text-white text-[10px]">GROUP</Badge>
                    <h3 className="text-gray-900 text-sm font-bold">{group.name}</h3>
                    <p className="text-gray-700 text-xs font-semibold">
                      {groupJobs.length} properties • {group.workTimeMinutes} min
                    </p>
                    <div className="text-xs text-gray-600 mt-1">
                      {groupJobs.slice(0, 3).map((j, idx) => {
                        const c = customers.find(cust => cust.id === j.customerId);
                        return c ? (
                          <div key={j.id} className="truncate">
                            {idx + 1}. {c.name}
                          </div>
                        ) : null;
                      })}
                      {groupJobs.length > 3 && (
                        <div className="text-gray-500 italic">
                          +{groupJobs.length - 3} more...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Single job drag preview
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-full">
                      <h3 className="text-blue-800 text-sm font-semibold">{customer.name}</h3>
                      <div className="flex items-center justify-center gap-1.5 text-gray-600 text-xs mt-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{customer.address}</span>
                      </div>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1 justify-center">
                      {customer.isHilly && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Hilly</Badge>}
                      {customer.hasFencing && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Fenced</Badge>}
                      {customer.hasObstacles && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Obstacles</Badge>}
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">${customer.price}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
