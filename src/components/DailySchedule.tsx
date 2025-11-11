import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Customer, Job, MessageTemplate, Equipment } from '../App';
import { updateCustomer } from '../services/customers';
import { addJob, updateJob, fetchJobs } from '../services/jobs';
import { smsService } from '../services/sms';
import { getDriveTime } from '../services/googleMaps';
import { optimizeRoute as optimizeRouteWithGoogleMaps } from '../services/routeOptimizer';
import { Clock, MapPin, Navigation, CheckCircle, Play, Phone, StopCircle, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { WeatherForecast } from './WeatherForecast';

interface DailyScheduleProps {
  customers: Customer[];
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
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DailySchedule({ 
  customers, 
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
  scrollToTodayRef
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

  // Use local date (YYYY-MM-DD) to match stored nextCutDate values
  const today = new Date().toLocaleDateString('en-CA');
  
  // Calculate tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toLocaleDateString('en-CA');
  
  // Get customers who need service today based on their nextCutDate
  const customersDueToday = customers.filter(c => c.nextCutDate === today);
  
  // Get customers who need service tomorrow based on their nextCutDate
  const customersDueTomorrow = customers.filter(c => c.nextCutDate === tomorrowDate);
  
  // Get jobs scheduled for tomorrow
  const tomorrowJobs = jobs.filter(j => j.date === tomorrowDate);
  
  // Combine existing jobs with customers due today - sort by order, then by scheduled time
  const todayJobs = jobs.filter(j => j.date === today).sort((a, b) => {
    // Primary sort: by order field (lower numbers first)
    const orderA = a.order || 999;
    const orderB = b.order || 999;
    if (orderA !== orderB) return orderA - orderB;
    
    // Secondary sort: by scheduled time if available
    if (!a.scheduledTime || !b.scheduledTime) return 0;
    return a.scheduledTime.localeCompare(b.scheduledTime);
  });

  // Sync starting address with weather location
  useEffect(() => {
    const weatherLocation = localStorage.getItem('weatherLocationName');
    if (weatherLocation && !startingAddress) {
      setStartingAddress(weatherLocation);
    }
  }, []); // Run once on mount

  // Auto-create jobs for customers due today who don't have a job yet (in Supabase)
  useEffect(() => {
    const ensureJobs = async () => {
      if (customersDueToday.length === 0) return;
      
      // Get current job IDs to avoid re-creating
      const existingJobCustomerIds = new Set(jobs.filter(j => j.date === today).map(j => j.customerId));
      const missing = customersDueToday.filter(c => {
        const key = `${c.id}-${today}`;
        // Skip if already exists OR currently being created
        return !existingJobCustomerIds.has(c.id) && !creatingJobsRef.current.has(key);
      });
      
      if (missing.length === 0) return;
      
      console.log(`🔄 Auto-creating jobs for ${missing.length} customers`);
      
      // Mark these jobs as being created
      missing.forEach(c => creatingJobsRef.current.add(`${c.id}-${today}`));
      
      try {
        // Calculate next order number based on ALL jobs (not just today's filtered list)
        const todayJobsList = jobs.filter(j => j.date === today);
        const maxOrder = Math.max(0, ...todayJobsList.map(j => j.order || 0));
        
        const results = await Promise.allSettled(
          missing.map((c, index) =>
            addJob({ 
              customerId: c.id, 
              date: today, 
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
        toast.error('Failed to create today\'s jobs.');
      } finally {
        // Clear the creation flags after attempt
        missing.forEach(c => creatingJobsRef.current.delete(`${c.id}-${today}`));
      }
    };
    ensureJobs();
  }, [customersDueToday.length, today]); // Removed jobs.length to avoid infinite loops

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

  // Auto-create jobs for customers due tomorrow who don't have a job yet (in Supabase)
  useEffect(() => {
    const ensureTomorrowJobs = async () => {
      if (customersDueTomorrow.length === 0) return;
      
      // Get current job IDs to avoid re-creating
      const existingJobCustomerIds = new Set(jobs.filter(j => j.date === tomorrowDate).map(j => j.customerId));
      const missing = customersDueTomorrow.filter(c => {
        const key = `${c.id}-${tomorrowDate}`;
        // Skip if already exists OR currently being created
        return !existingJobCustomerIds.has(c.id) && !creatingJobsRef.current.has(key);
      });
      
      if (missing.length === 0) return;
      
      console.log(`🔄 Auto-creating ${missing.length} jobs for tomorrow`);
      
      // Mark these jobs as being created
      missing.forEach(c => creatingJobsRef.current.add(`${c.id}-${tomorrowDate}`));
      
      try {
        // Calculate next order number based on tomorrow's jobs
        const tomorrowJobsList = jobs.filter(j => j.date === tomorrowDate);
        const maxOrder = Math.max(0, ...tomorrowJobsList.map(j => j.order || 0));
        
        const results = await Promise.allSettled(
          missing.map((c, index) =>
            addJob({ 
              customerId: c.id, 
              date: tomorrowDate, 
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
        
        // Only refresh if we actually created jobs
        if (created > 0) {
          await onRefreshJobs?.();
        }
      } catch (e) {
        console.error('Failed to create tomorrow\'s jobs in Supabase:', e);
        toast.error('Failed to create tomorrow\'s jobs.');
      } finally {
        // Clear the creation flags after attempt
        missing.forEach(c => creatingJobsRef.current.delete(`${c.id}-${tomorrowDate}`));
      }
    };
    ensureTomorrowJobs();
  }, [customersDueTomorrow.length, jobs.length, tomorrowDate]); // Only run when counts change, not on every job update

  // Calculate daily stats
  const totalDueToday = todayJobs.length; // Total jobs scheduled for today
  const completedToday = todayJobs.filter(j => j.status === 'completed').length;
  const totalWorkTime = todayJobs
    .filter(j => j.status === 'completed' && j.totalTime)
    .reduce((sum, j) => sum + (j.totalTime || 0), 0);
  const totalDriveTime = todayJobs
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
      if (todayJobs.length === 0) return;

      const pairs: Array<{ from: string; to: string }> = [];

      // Collect all address pairs that need drive time calculation
      todayJobs.forEach((job, index) => {
        const customer = getCustomer(job.customerId);
        if (!customer) return;

        if (index === 0 && startingAddress) {
          // First job - from starting address
          pairs.push({ from: startingAddress, to: customer.address });
        } else if (index > 0) {
          // Subsequent jobs - from previous job
          const prevJob = todayJobs[index - 1];
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
  }, [todayJobs.length, startingAddress]); // Re-fetch when jobs or starting address changes

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
    const jobIndex = todayJobs.findIndex(j => j.id === job.id);
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
      const prevJob = todayJobs[jobIndex - 1];
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
    const currentJobIndex = todayJobs.findIndex(j => j.id === job.id);
    const nextJob = todayJobs[currentJobIndex + 1];
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

    const sourceIndex = todayJobs.findIndex(j => j.id === draggedJobId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedJobId(null);
      setDragPosition(null);
      setDraggedOverIndex(null);
      return;
    }

    // Reorder jobs
    const reorderedJobs = [...todayJobs];
    const [movedJob] = reorderedJobs.splice(sourceIndex, 1);
    reorderedJobs.splice(targetIndex, 0, movedJob);

    // Update order field for all affected jobs
    const updatedJobs = reorderedJobs.map((job, idx) => ({
      ...job,
      order: idx + 1
    }));

    // Update in database
    try {
      await Promise.all(
        updatedJobs.map(job => updateJob(job))
      );
      await onRefreshJobs?.();
      toast.success('Job order updated');
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
        onRescheduleJob={handleRescheduleJob}
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

      {/* Today's Jobs Section Header */}
      {todayJobs.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="h-1 flex-1 bg-linear-to-r from-blue-200 via-yellow-200 to-blue-200 rounded-full"></div>
          <h2 className="text-2xl font-bold text-blue-900 uppercase tracking-wide">Today's Jobs</h2>
          <div className="h-1 flex-1 bg-linear-to-l from-blue-200 via-yellow-200 to-blue-200 rounded-full"></div>
        </div>
      )}

      {/* Job List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {customersDueToday.length === 0 && todayJobs.length === 0 && tomorrowJobs.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur col-span-full">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">No customers scheduled for today or tomorrow.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {todayJobs.map((job, index) => {
              const customer = getCustomer(job.customerId);
              if (!customer) return null;
              
              // Get previous job for drive time calculation
              const previousJob = index > 0 ? todayJobs[index - 1] : null;
              const previousCustomer = previousJob ? getCustomer(previousJob.customerId) : null;
              
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
                <CardContent className="p-1.5">
                  {/* Centered layout */}
                  <div className="flex flex-col items-center text-center gap-1">
                    <div className="w-full">
                      <h3 className="text-blue-800 text-xs font-semibold">{customer.name}</h3>
                      <div className="flex items-center justify-center gap-1 text-gray-600 text-[10px] mt-0.5">
                        <MapPin className="h-2.5 w-2.5 shrink-0 pointer-events-none" />
                        <span>{customer.address}</span>
                      </div>
                      {job.scheduledTime && (
                        <div className="flex items-center justify-center gap-1 text-blue-600 text-[10px] font-medium mt-0.5">
                          <Clock className="h-2.5 w-2.5 pointer-events-none" />
                          <span>Scheduled: {formatScheduledTime(job.scheduledTime)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-1 text-blue-600 text-[10px] mt-0.5">
                        <Clock className="h-2.5 w-2.5 pointer-events-none" />
                        <span>{driveTime}</span>
                      </div>
                    </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-0.5 justify-center mb-0.5">
                    {customer.isHilly && <Badge variant="secondary" className="text-[9px] py-0 px-1">Hilly</Badge>}
                    {customer.hasFencing && <Badge variant="secondary" className="text-[9px] py-0 px-1">Fenced</Badge>}
                    {customer.hasObstacles && <Badge variant="secondary" className="text-[9px] py-0 px-1">Obstacles</Badge>}
                    <Badge variant="outline" className="text-[9px] py-0 px-1">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                    <Badge variant="outline" className="text-[9px] py-0 px-1">${customer.price}</Badge>
                  </div>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex gap-1 w-full">

                      {job.status === 'scheduled' && (
                        <>
                          <Button
                            onClick={() => handleStartJobClick(job)}
                            className="bg-blue-600 hover:bg-blue-700 flex-1 h-8 text-xs px-2"
                          >
                            <Play className="h-3 w-3 mr-0.5" />
                            Start
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 h-8 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
                            onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`, '_blank')}
                          >
                            <Navigation className="h-3 w-3 mr-0.5" />
                            Navigate
                          </Button>
                        </>
                      )}
                      {job.status === 'in-progress' && (
                        <>
                          {/* Live Timer Display */}
                          <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 text-center min-w-0">
                            <div className="flex items-center justify-center gap-1">
                              <StopCircle className="h-3 w-3 text-blue-600 animate-pulse shrink-0" />
                              <span className="text-[10px] text-blue-800 whitespace-nowrap">Running</span>
                              <span className="text-[10px] text-blue-600 font-semibold ml-0.5">
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
                                className="bg-blue-600 hover:bg-blue-700 h-8 text-xs px-2 shrink-0"
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                Complete
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
                          className="flex-1 text-center text-blue-700 hover:bg-blue-50 rounded-lg p-1.5 transition-colors border border-blue-300 hover:border-blue-400"
                          title="Click to undo completion"
                        >
                          <CheckCircle className="h-4 w-4 mx-auto" />
                          <span className="text-xs">{job.totalTime} min</span>
                        </button>
                      )}
                      {customer.phone && (
                        <Button
                          variant="outline"
                          className="flex-1 h-9 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
                          onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                        >
                          <Phone className="h-3 w-3 mr-1" />
                          Call
                        </Button>
                      )}
                    </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Display tomorrow's jobs at the bottom */}
          {tomorrowJobs.length > 0 && (
            <div className="col-span-full">
              {/* Tomorrow's Jobs Section Header */}
              <div className="flex items-center gap-3 mt-8 mb-4">
                <div className="h-1 flex-1 bg-linear-to-r from-yellow-200 to-yellow-400 rounded-full"></div>
                <h2 className="text-2xl font-bold text-yellow-900 uppercase tracking-wide">Tomorrow's Jobs</h2>
                <div className="h-1 flex-1 bg-linear-to-l from-yellow-200 to-yellow-400 rounded-full"></div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {tomorrowJobs.map((job, index) => {
                const customer = customers.find(c => c.id === job.customerId);
                if (!customer) return null;

                // Get previous job for drive time calculation
                const previousJob = index > 0 ? tomorrowJobs[index - 1] : null;
                const previousCustomer = previousJob ? customers.find(c => c.id === previousJob.customerId) : null;
                const driveTime = previousCustomer 
                  ? estimateDriveTime(previousCustomer.address, customer.address)
                  : startingAddress 
                    ? estimateDriveTime(startingAddress, customer.address)
                    : 'Start';

                return (
                  <Card key={`tomorrow-${job.id}`} className="bg-yellow-50/80 backdrop-blur border-yellow-300">
                    <CardContent className="p-1.5 flex flex-col">
                      <div className="flex flex-col items-center text-center gap-1">
                        <div className="w-full">
                          <h3 className="text-orange-800 text-xs font-medium">{customer.name}</h3>
                          <div className="flex items-center justify-center gap-1 text-gray-600 text-[10px] mt-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            <span>{customer.address}</span>
                          </div>
                          <div className="flex items-center justify-center gap-1 text-yellow-600 text-[10px] mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{driveTime} drive</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-0.5 justify-center mb-0.5">
                          {customer.isHilly && <Badge variant="secondary" className="text-[9px] py-0 px-1">Hilly</Badge>}
                          {customer.hasFencing && <Badge variant="secondary" className="text-[9px] py-0 px-1">Fenced</Badge>}
                          {customer.hasObstacles && <Badge variant="secondary" className="text-[9px] py-0 px-1">Obstacles</Badge>}
                          <Badge variant="outline" className="text-[9px] py-0 px-1">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                          <Badge variant="outline" className="text-[9px] py-0 px-1">${customer.price}</Badge>
                          <Badge variant="outline" className="text-[9px] py-0 px-1">{customer.frequency}</Badge>
                        </div>

                        {customer.phone && (
                          <Button
                            variant="outline"
                            className="w-full h-7 text-[10px]"
                            onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                          >
                            <Phone className="h-3 w-3 mr-1" />
                            Call
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
            </div>
          )}
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
        const draggedJob = todayJobs.find(j => j.id === draggedJobId);
        const customer = draggedJob ? getCustomer(draggedJob.customerId) : null;
        if (!draggedJob || !customer) return null;
        
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
                {/* Centered layout - matching the original card */}
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
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
