import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Customer, Job, MessageTemplate, Equipment } from '../App';
import { updateCustomer } from '../services/customers';
import { addJob, updateJob } from '../services/jobs';
import { Clock, MapPin, Navigation, CheckCircle, Play, Phone, AlertTriangle, Cloud, CloudRain, Sun, StopCircle, MessageSquare, Send, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

interface DailyScheduleProps {
  customers: Customer[];
  jobs: Job[];
  equipment: Equipment[];
  onUpdateJobs: (jobs: Job[]) => void;
  messageTemplates: MessageTemplate[];
  onRefreshCustomers: () => Promise<void> | void;
  onRefreshJobs?: () => Promise<void> | void;
}

export function DailySchedule({ customers, jobs, equipment, onUpdateJobs, messageTemplates, onRefreshCustomers, onRefreshJobs }: DailyScheduleProps) {
  const [jobNotes, setJobNotes] = useState('');
  const [elapsedTime, setElapsedTime] = useState<{ [jobId: string]: number }>({});
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [pendingStartJob, setPendingStartJob] = useState<Job | null>(null);
  const [showNextJobDialog, setShowNextJobDialog] = useState(false);
  const [nextJobToNotify, setNextJobToNotify] = useState<Job | null>(null);
  const [completionMessage, setCompletionMessage] = useState<boolean | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  // Use local date (YYYY-MM-DD) to match stored nextCutDate values
  const today = new Date().toLocaleDateString('en-CA');
  
  // Get customers who need service today based on their nextCutDate
  const customersDueToday = customers.filter(c => c.nextCutDate === today);
  
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

  // Auto-create jobs for customers due today who don't have a job yet (in Supabase)
  useEffect(() => {
    const ensureJobs = async () => {
      if (customersDueToday.length === 0) return;
      const missing = customersDueToday.filter(c => !todayJobs.some(j => j.customerId === c.id));
      if (missing.length === 0) return;
      try {
        // Calculate next order number based on existing jobs
        const maxOrder = Math.max(0, ...todayJobs.map(j => j.order || 0));
        
        await Promise.all(
          missing.map((c, index) =>
            addJob({ 
              customerId: c.id, 
              date: today, 
              status: 'scheduled',
              order: maxOrder + index + 1
            })
          )
        );
        await onRefreshJobs?.();
      } catch (e) {
        console.error('Failed to create jobs in Supabase:', e);
        toast.error('Failed to create today\'s jobs.');
      }
    };
    ensureJobs();
  }, [customersDueToday, todayJobs, today, onRefreshJobs]);

  // Calculate daily stats - only count houses due TODAY
  const totalDueToday = customersDueToday.length; // Total customers whose nextCutDate is today
  const completedToday = todayJobs.filter(j => {
    // Only count completed jobs for customers that are due today
    const customer = customers.find(c => c.id === j.customerId);
    return j.status === 'completed' && customer?.nextCutDate === today;
  }).length;
  const totalWorkTime = todayJobs
    .filter(j => j.status === 'completed' && j.totalTime)
    .reduce((sum, j) => sum + (j.totalTime || 0), 0);
  const totalDriveTime = todayJobs
    .filter(j => j.status === 'completed' && j.driveTime)
    .reduce((sum, j) => sum + (j.driveTime || 0), 0);

  // Mock weather (in production, use real API)
  const weather = {
    condition: 'sunny',
    temp: 75,
    precipitation: 0,
  };

  // Equipment alerts
  const equipmentAlerts = equipment.filter(e => e.hoursUsed >= e.alertThreshold);

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

  const sendMessage = (customer: Customer, templateType: 'on-the-way' | 'completed') => {
    const template = messageTemplates.find(t => t.trigger === templateType);
    if (template) {
      const message = template.message
        .replace('{name}', customer.name)
        .replace('{address}', customer.address)
        .replace('{time}', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      
      // In production, this would send via SMS API
      console.log(`Sending to ${customer.phone}: ${message}`);
      toast.success(`Message sent to ${customer.name}`, {
        description: message.substring(0, 60) + '...',
        duration: 3000,
      });
    }
  };

  const handleStartJobClick = (job: Job) => {
    setPendingStartJob(job);
    setShowStartDialog(true);
  };

  const confirmStartJob = (shouldSendMessage: boolean) => {
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

    // Send "on the way" message if requested
    if (shouldSendMessage) {
      const customer = customers.find(c => c.id === pendingStartJob.customerId);
      if (customer) {
        sendMessage(customer, 'on-the-way');
      }
    }

    setShowStartDialog(false);
    setPendingStartJob(null);
  };

  const handleCompleteJob = (job: Job, totalMinutes: number, notes: string, sendCompletionMessage: boolean) => {
    const endIso = new Date().toISOString();
    const updatedLocal = jobs.map(j =>
      j.id === job.id
        ? {
            ...j,
            status: 'completed' as const,
            endTime: endIso,
            totalTime: totalMinutes,
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
    
    toast.success('Job completed!');

    // Send completion message if requested
    if (sendCompletionMessage) {
      const customer = customers.find(c => c.id === job.customerId);
      if (customer) {
        sendMessage(customer, 'completed');
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

  const sendReminderMessage = (job: Job) => {
    const customer = customers.find(c => c.id === job.customerId);
    if (!customer) return;

    const template = messageTemplates.find(t => t.trigger === 'scheduled');
    if (template) {
      const message = template.message
        .replace('{name}', customer.name)
        .replace('{address}', customer.address)
        .replace('{time}', job.scheduledTime || 'soon');
      
      console.log(`Sending reminder to ${customer.phone}: ${message}`);
      toast.success(`Reminder sent to ${customer.name}`, {
        description: message.substring(0, 60) + '...',
        duration: 3000,
      });
    }
  };

  const getCustomer = (customerId: string) => {
    return customers.find(c => c.id === customerId);
  };

  const getWeatherIcon = () => {
    if (weather.condition === 'rainy') return <CloudRain className="h-5 w-5 text-blue-500" />;
    if (weather.condition === 'cloudy') return <Cloud className="h-5 w-5 text-gray-500" />;
    return <Sun className="h-5 w-5 text-yellow-500" />;
  };

  if (customers.length === 0) {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Welcome to Your Lawn Care CRM</CardTitle>
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
      {/* Daily Summary Card */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-green-800">Today's Schedule</CardTitle>
              <CardDescription>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getWeatherIcon()}
              <span className="text-gray-600">{weather.temp}°F</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-600 mb-1">Due Today</p>
              <p className="text-green-800">{totalDueToday} {totalDueToday === 1 ? 'house' : 'houses'}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Completed</p>
              <p className="text-green-800">{completedToday} / {totalDueToday}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Work Time</p>
              <p className="text-green-800">{totalWorkTime} min</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Drive Time</p>
              <p className="text-green-800">{totalDriveTime} min</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Alerts */}
      {equipmentAlerts.length > 0 && (
        <Alert className="border-orange-300 bg-orange-50/80">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Maintenance Required</AlertTitle>
          <AlertDescription>
            {equipmentAlerts.map(e => e.name).join(', ')} need maintenance
          </AlertDescription>
        </Alert>
      )}

      {/* Job List */}
      <div className="space-y-3">
        {/* Show customers due today */}
        {customersDueToday.length === 0 && todayJobs.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">No customers scheduled for today.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Display customers due today who don't have a job yet */}
            {customersDueToday.some(c => !todayJobs.some(j => j.customerId === c.id)) && (
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-yellow-700 uppercase tracking-wide">Customers Due Today</h3>
              </div>
            )}
            {customersDueToday.map((customer) => {
              // Skip if they already have a job today
              const hasJobToday = todayJobs.some(j => j.customerId === customer.id);
              if (hasJobToday) return null;

              return (
                <Card key={`customer-${customer.id}`} className="bg-yellow-50/80 backdrop-blur border-yellow-300">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-green-800 mb-1">{customer.name}</h3>
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                              <MapPin className="h-4 w-4" />
                              <span>{customer.address}</span>
                            </div>
                            <div className="flex items-center gap-2 text-yellow-700">
                              <Clock className="h-4 w-4" />
                              <span className="font-medium">Due today</span>
                            </div>
                          </div>
                          <Badge className="bg-yellow-600">Needs Service</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {customer.isHilly && <Badge variant="secondary">Hilly</Badge>}
                          {customer.hasFencing && <Badge variant="secondary">Fenced</Badge>}
                          {customer.hasObstacles && <Badge variant="secondary">Obstacles</Badge>}
                          <Badge variant="outline">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                          <Badge variant="outline">${customer.price}</Badge>
                          <Badge variant="outline">{customer.frequency}</Badge>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:w-48">
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full"
                          onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`, '_blank')}
                        >
                          <Navigation className="h-5 w-5 mr-2" />
                          Navigate
                        </Button>
                        {customer.phone && (
                          <Button
                            variant="outline"
                            size="lg"
                            className="w-full"
                            onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                          >
                            <Phone className="h-5 w-5 mr-2" />
                            Call
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Display existing jobs */}
            {todayJobs.length > 0 && (
              <div className="mt-4 mb-2">
                <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">Scheduled Jobs</h3>
              </div>
            )}
            {todayJobs.map((job) => {
              const customer = getCustomer(job.customerId);
              if (!customer) return null;
//this job.id is where i can control the colors of the background for the cards. 
            return (
              <Card key={job.id} className={`backdrop-blur ${job.status === 'completed' ? 'bg-green-50 border border-green-300' : 'bg-white/80'} ${job.status === 'completed' ? '' : ''}`}>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-green-800 mb-1">{customer.name}</h3>
                          <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <MapPin className="h-4 w-4" />
                            <span>{customer.address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>{job.scheduledTime || 'Not scheduled'}</span>
                          </div>
                        </div>
                        <Badge className={
                          job.status === 'completed' ? 'bg-green-600' :
                          job.status === 'in-progress' ? 'bg-blue-600' :
                          'bg-gray-600'
                        }>
                          {job.status === 'completed' ? 'Done' :
                           job.status === 'in-progress' ? 'In Progress' :
                           'Scheduled'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {customer.isHilly && <Badge variant="secondary">Hilly</Badge>}
                        {customer.hasFencing && <Badge variant="secondary">Fenced</Badge>}
                        {customer.hasObstacles && <Badge variant="secondary">Obstacles</Badge>}
                        <Badge variant="outline">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                        <Badge variant="outline">${customer.price}</Badge>
                      </div>
                        {/* Toggle moved to right column */}
                    </div>

                      <div className="flex flex-col gap-2 md:w-48">

                      {job.status === 'scheduled' && (
                        <>
                          <Button
                            onClick={() => handleStartJobClick(job)}
                            className="bg-green-600 hover:bg-green-700 w-full"
                            size="lg"
                          >
                            <Play className="h-5 w-5 mr-2" />
                            Start Job
                          </Button>
                          <Button
                            variant="outline"
                            size="lg"
                            className="w-full"
                            onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`, '_blank')}
                          >
                            <Navigation className="h-5 w-5 mr-2" />
                            Navigate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => sendReminderMessage(job)}
                          >
                            <Bell className="h-4 w-4 mr-2" />
                            Send Reminder
                          </Button>
                        </>
                      )}
                      {job.status === 'in-progress' && (
                        <>
                          {/* Live Timer Display */}
                          <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="pt-4 pb-4">
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-1">
                                  <StopCircle className="h-5 w-5 text-blue-600 animate-pulse" />
                                  <span className="text-blue-800">Timer Running</span>
                                </div>
                                <div className="text-blue-600">
                                  {formatElapsedTime(elapsedTime[job.id] || 0)}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                onClick={() => {
                                  setJobNotes('');
                                  setCompletionMessage(null);
                                  setSelectedTime(null);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 w-full"
                                size="lg"
                              >
                                <CheckCircle className="h-5 w-5 mr-2" />
                                Complete Job
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Complete Job - {customer.name}</DialogTitle>
                                <DialogDescription>
                                  Timer: {formatElapsedTime(elapsedTime[job.id] || 0)}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                {/* Auto-filled time from timer */}
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <Label>Tracked Time</Label>
                                    <Badge className="bg-blue-600">Auto-tracked</Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-blue-600" />
                                    <span className="text-blue-800">{formatElapsedTime(elapsedTime[job.id] || 0)}</span>
                                  </div>
                                </div>

                                {/* Time selection */}
                                <div>
                                  <Label className="text-gray-700 mb-3 block">Select time:</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <Button
                                      variant={selectedTime === null ? 'default' : 'outline'}
                                      onClick={() => setSelectedTime(null)}
                                      className={`h-12 ${selectedTime === null ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 hover:border-blue-300'}`}
                                    >
                                      Auto: {formatElapsedTime(elapsedTime[job.id] || 0)}
                                    </Button>
                                    {[15, 30, 45, 60, 90, 120].map(min => (
                                      <Button
                                        key={min}
                                        variant={selectedTime === min ? 'default' : 'outline'}
                                        onClick={() => setSelectedTime(min)}
                                        className={`h-12 ${selectedTime === min ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 hover:border-blue-300'}`}
                                      >
                                        {min} min
                                      </Button>
                                    ))}
                                  </div>
                                </div>

                                {/* Notes section */}
                                <div className="space-y-2">
                                  <Label htmlFor="notes">Notes (optional)</Label>
                                  <Textarea
                                    id="notes"
                                    value={jobNotes}
                                    onChange={(e) => setJobNotes(e.target.value)}
                                    placeholder="Any issues or observations..."
                                    rows={3}
                                  />
                                </div>

                                {/* Messaging prompt */}
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <MessageSquare className="h-4 w-4 text-green-600" />
                                    <span className="text-green-800">Send completion message?</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => setCompletionMessage(true)}
                                      className={`flex-1 ${completionMessage === true ? 'bg-green-600 text-white hover:bg-green-700' : 'hover:bg-green-100 hover:border-green-300'}`}
                                      variant={completionMessage === true ? 'default' : 'outline'}
                                      size="lg"
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Send Message
                                    </Button>
                                    <Button
                                      onClick={() => setCompletionMessage(false)}
                                      className={`flex-1 ${completionMessage === false ? 'bg-green-600 text-white hover:bg-green-700' : 'hover:bg-green-100 hover:border-green-300'}`}
                                      variant={completionMessage === false ? 'default' : 'outline'}
                                      size="lg"
                                    >
                                      Skip Message
                                    </Button>
                                  </div>
                                </div>

                                {/* Complete button - only show when message option is selected */}
                                {completionMessage !== null && (
                                  <div className="pt-2">
                                    <Button
                                      onClick={() => {
                                        const timeToUse = selectedTime !== null ? selectedTime : (elapsedTime[job.id] || 0);
                                        handleCompleteJob(job, timeToUse, jobNotes, completionMessage);
                                        // Reset state
                                        setCompletionMessage(null);
                                        setSelectedTime(null);
                                      }}
                                      className="w-full bg-green-600 hover:bg-green-700"
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
                          className="text-center text-green-600 hover:bg-green-50 rounded-lg p-2 transition-colors"
                          title="Click to undo completion"
                        >
                          <CheckCircle className="h-8 w-8 mx-auto mb-1" />
                          <span>{job.totalTime} min</span>
                        </button>
                      )}
                      {customer.phone && (
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full"
                          onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                        >
                          <Phone className="h-5 w-5 mr-2" />
                          Call
                        </Button>
                      )}
                    </div>
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
                  Would you like to notify the customer that you're on the way?
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
            <AlertDialogAction onClick={() => confirmStartJob(true)} className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              Start & Send Message
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
            <AlertDialogAction onClick={notifyNextCustomer} className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              Send Message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
