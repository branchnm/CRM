import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { Job, Customer } from '../App';
import { updateCustomer } from '../services/customers';
import { updateJob } from '../services/jobs';
import { toast } from 'sonner';

interface JobCalendarProps {
  jobs: Job[];
  customers: Customer[];
  onUpdateJobs: (jobs: Job[]) => void;
  onRefreshCustomers?: () => Promise<void> | void;
  onRefreshJobs?: () => Promise<void> | void;
}

export function JobCalendar({ jobs, customers, onUpdateJobs, onRefreshCustomers, onRefreshJobs }: JobCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedJob, setDraggedJob] = useState<Job | null>(null);

  // Format date to YYYY-MM-DD without timezone conversion
  const formatDateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get calendar data for the month
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
    
    const days: Date[] = [];
    const current = new Date(startDate);
    
    // Generate 6 weeks of dates
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  };

  const getJobsForDate = (date: Date) => {
    const dateStr = formatDateToString(date);
    
    // Only show jobs that actually exist in the database
    // The auto-create logic in DailySchedule will create jobs for customers with nextCutDate=today
    return jobs.filter(job => job.date === dateStr);
  };

  const handleDragStart = (e: React.DragEvent, job: Job) => {
    setDraggedJob(job);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    
    if (!draggedJob) return;
    
    const newDateStr = formatDateToString(targetDate);
    const oldDateStr = draggedJob.date;
    
    if (newDateStr === oldDateStr) {
      setDraggedJob(null);
      return;
    }
    
    const customer = customers.find(c => c.id === draggedJob.customerId);
    
    try {
      // Update the job's date in Supabase
      await updateJob({ ...draggedJob, date: newDateStr });
      
      // Update local state
      const updatedJobs = jobs.map(job => 
        job.id === draggedJob.id 
          ? { ...job, date: newDateStr }
          : job
      );
      onUpdateJobs(updatedJobs);
      
      // Refresh from database
      await onRefreshJobs?.();
      
      // If this job's date matches the customer's nextCutDate, update that too
      if (customer && customer.nextCutDate === oldDateStr) {
        await updateCustomer({
          ...customer,
          nextCutDate: newDateStr
        });
        
        // Refresh customers from database
        await onRefreshCustomers?.();
      }
      
      toast.success(
        `Moved ${customer?.name || 'job'} to ${targetDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        })}`
      );
    } catch (error) {
      console.error('Error moving job:', error);
      toast.error('Failed to move job. Please try again.');
    }
    
    setDraggedJob(null);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const calendarDays = getCalendarDays();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const isPastDate = (date: Date) => {
    return date < today;
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Job Calendar</CardTitle>
            <CardDescription>Drag and drop jobs to reschedule</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center font-medium">
              {monthYear}
            </div>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Calendar Grid */}
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Day Headers */}
          <div className="grid grid-cols-7 bg-gray-50/50 border-b border-gray-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-600 border-r border-gray-200 last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((date, index) => {
              const dayJobs = getJobsForDate(date);
              const isThisMonth = isCurrentMonth(date);
              const isTodayDate = isToday(date);
              const isPast = isPastDate(date);
              
              return (
                <div
                  key={index}
                  className={`min-h-[100px] p-2 border-r border-b border-gray-200 last:border-r-0 ${
                    !isThisMonth ? 'bg-gray-50/30' : 'bg-white'
                  } ${isTodayDate ? 'bg-blue-50/50' : ''} ${
                    isPast && !isTodayDate ? 'opacity-50' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, date)}
                >
                  {/* Date Number */}
                  <div className={`text-sm mb-1 ${
                    isTodayDate 
                      ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs' 
                      : !isThisMonth 
                      ? 'text-gray-400 font-medium' 
                      : 'text-gray-700 font-medium'
                  }`}>
                    {date.getDate()}
                  </div>
                  
                  {/* Jobs for this day */}
                  <div className="space-y-1">
                    {dayJobs.map(job => {
                      const customer = customers.find(c => c.id === job.customerId);
                      const isCompleted = job.status === 'completed';
                      const bgColor = isCompleted ? 'bg-gray-50 hover:bg-gray-100 border-gray-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-200';
                      const textColor = isCompleted ? 'text-gray-500' : 'text-blue-900';
                      const accentColor = isCompleted ? 'text-gray-400' : 'text-blue-500';
                      
                      return (
                        <div
                          key={job.id}
                          draggable={!isCompleted}
                          onDragStart={(e) => !isCompleted && handleDragStart(e, job)}
                          className={`group ${bgColor} border rounded px-2 py-1 text-xs ${
                            isCompleted ? 'cursor-default opacity-60' : 'cursor-move'
                          } transition-colors`}
                        >
                          <div className="flex items-center gap-1">
                            {!isCompleted && (
                              <GripVertical className={`h-3 w-3 ${accentColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
                            )}
                            <span className={`truncate flex-1 ${textColor} font-medium`}>
                              {customer?.name || 'Unknown'}
                            </span>
                            {isCompleted && (
                              <span className="text-[10px] text-gray-500">✓</span>
                            )}
                          </div>
                          {job.scheduledTime && (
                            <div className={`${accentColor} text-[10px] ml-4`}>
                              {job.scheduledTime}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-50/50 border border-blue-200 rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
            <span>Scheduled Job</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <span>Drag to reschedule</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
