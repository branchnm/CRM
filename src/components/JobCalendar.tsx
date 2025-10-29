import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { Job, Customer } from '../App';
import { updateCustomer } from '../services/customers';
import { updateJob } from '../services/jobs';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('week'); // Default to week view for mobile
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const [touchDraggedJob, setTouchDraggedJob] = useState<Job | null>(null);
  const [editForm, setEditForm] = useState({
    price: '',
    scheduledTime: '',
    notes: '',
    status: 'scheduled' as 'scheduled' | 'in-progress' | 'completed'
  });

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

  // Get calendar data for the current week
  const getWeekDays = () => {
    const today = new Date(currentDate);
    const dayOfWeek = today.getDay(); // 0 = Sunday
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek); // Start from Sunday
    
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    
    return days;
  };

  const getJobsForDate = (date: Date) => {
    const dateStr = formatDateToString(date);
    
    // Only show jobs that actually exist in the database
    // The auto-create logic in DailySchedule will create jobs for customers with nextCutDate=today
    return jobs.filter(job => job.date === dateStr);
  };

  const getNextCutsForDate = (date: Date) => {
    const dateStr = formatDateToString(date);
    
    // Find customers whose next cut date matches this date
    return customers.filter(customer => customer.nextCutDate === dateStr);
  };

  const getNextNextCutsForDate = (date: Date) => {
    const dateStr = formatDateToString(date);
    
    // Calculate the "next next" cut for each customer
    // This is the cut after their current nextCutDate
    return customers
      .map(customer => {
        if (!customer.nextCutDate || !customer.frequency) return null;
        
        const nextCutDate = new Date(customer.nextCutDate + 'T00:00:00');
        let nextNextCutDate: Date;
        
        if (customer.frequency === 'weekly') {
          nextNextCutDate = new Date(nextCutDate);
          nextNextCutDate.setDate(nextNextCutDate.getDate() + 7);
        } else if (customer.frequency === 'biweekly') {
          nextNextCutDate = new Date(nextCutDate);
          nextNextCutDate.setDate(nextNextCutDate.getDate() + 14);
        } else if (customer.frequency === 'monthly') {
          nextNextCutDate = new Date(nextCutDate);
          nextNextCutDate.setMonth(nextNextCutDate.getMonth() + 1);
        } else {
          return null;
        }
        
        const nextNextCutDateStr = formatDateToString(nextNextCutDate);
        
        if (nextNextCutDateStr === dateStr) {
          return customer;
        }
        
        return null;
      })
      .filter((customer): customer is Customer => customer !== null);
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

  // Touch handlers for mobile drag and drop
  const handleTouchStart = (e: React.TouchEvent, job: Job) => {
    if (job.status === 'completed') return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    setTouchDraggedJob(job);
    setDraggedJob(job);
    // Prevent body scroll while dragging
    document.body.style.overflow = 'hidden';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDraggedJob) return;
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the calendar day cell
    const dayCell = element?.closest('[data-calendar-day]');
    if (dayCell) {
      // Visual feedback could be added here if needed
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    if (!touchDraggedJob) return;
    
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the calendar day cell
    const dayCell = element?.closest('[data-calendar-day]');
    if (dayCell) {
      const dateStr = dayCell.getAttribute('data-date');
      if (dateStr) {
        const targetDate = new Date(dateStr + 'T00:00:00');
        const newDateStr = formatDateToString(targetDate);
        const oldDateStr = touchDraggedJob.date;
        
        if (newDateStr !== oldDateStr) {
          const customer = customers.find(c => c.id === touchDraggedJob.customerId);
          
          try {
            // Update the job's date in Supabase
            await updateJob({ ...touchDraggedJob, date: newDateStr });
            
            // Update local state
            const updatedJobs = jobs.map(job => 
              job.id === touchDraggedJob.id 
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
        }
      }
    }
    
    setTouchDraggedJob(null);
    setDraggedJob(null);
    touchStartPos.current = null;
    // Re-enable body scroll
    document.body.style.overflow = '';
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleJobDoubleClick = (job: Job) => {
    const customer = customers.find(c => c.id === job.customerId);
    setEditingJob(job);
    setEditForm({
      price: customer?.price?.toString() || '',
      scheduledTime: job.scheduledTime || '',
      notes: job.notes || '',
      status: job.status || 'scheduled'
    });
  };

  const handleSaveEdit = async () => {
    if (!editingJob) return;

    try {
      const updatedJob = {
        ...editingJob,
        scheduledTime: editForm.scheduledTime || undefined,
        notes: editForm.notes || undefined,
        status: editForm.status
      };

      await updateJob(updatedJob);
      
      // If price changed, update customer
      const customer = customers.find(c => c.id === editingJob.customerId);
      if (customer && editForm.price && parseFloat(editForm.price) !== customer.price) {
        await updateCustomer({
          ...customer,
          price: parseFloat(editForm.price)
        });
        await onRefreshCustomers?.();
      }

      await onRefreshJobs?.();
      setEditingJob(null);
      toast.success('Job updated successfully');
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
    }
  };

  const handleCancelEdit = () => {
    setEditingJob(null);
  };

  const calendarDays = viewMode === 'week' ? getWeekDays() : getCalendarDays();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const weekRange = viewMode === 'week' ? (() => {
    const weekDays = getWeekDays();
    const start = weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  })() : '';

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
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job Calendar</CardTitle>
              <CardDescription>Drag and drop jobs to reschedule</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={viewMode === 'week' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setViewMode('week')}
                className="hidden sm:inline-flex"
              >
                Week
              </Button>
              <Button 
                variant={viewMode === 'month' ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setViewMode('month')}
                className="hidden sm:inline-flex"
              >
                Month
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={viewMode === 'week' ? handlePrevWeek : handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[140px] text-center font-medium text-sm">
                {viewMode === 'week' ? weekRange : monthYear}
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={viewMode === 'week' ? handleNextWeek : handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
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
          <div className={`grid grid-cols-7 ${viewMode === 'week' ? 'auto-rows-auto' : ''}`}>
            {calendarDays.map((date, index) => {
              const dayJobs = getJobsForDate(date);
              const isThisMonth = isCurrentMonth(date);
              const isTodayDate = isToday(date);
              const isPast = isPastDate(date);
              const dateStr = formatDateToString(date);
              
              return (
                <div
                  key={index}
                  data-calendar-day="true"
                  data-date={dateStr}
                  className={`${viewMode === 'week' ? 'min-h-[140px]' : 'min-h-[100px]'} p-2 border-r border-b border-gray-200 last:border-r-0 ${
                    !isThisMonth && viewMode === 'month' ? 'bg-gray-50/30' : 'bg-white'
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
                      // A job is truly completed only if it has completion data (totalTime and endTime)
                      const isCompleted = job.status === 'completed' && job.totalTime && job.endTime;
                      
                      // Determine if this job is the next cut for this customer
                      // A job is the "next cut" if it's the earliest non-completed job for this customer
                      const customerJobs = jobs.filter(j => j.customerId === job.customerId && !(j.status === 'completed' && j.totalTime && j.endTime));
                      const sortedCustomerJobs = customerJobs.sort((a, b) => a.date.localeCompare(b.date));
                      const isNextCut = sortedCustomerJobs.length > 0 && sortedCustomerJobs[0].id === job.id;
                      
                      // Color logic:
                      // - Completed jobs: gray
                      // - Jobs matching nextCutDate: green/emerald (next cut)
                      // - Other future jobs: orange (future cuts beyond next)
                      let bgColor, textColor, accentColor;
                      if (isCompleted) {
                        bgColor = 'bg-gray-50 hover:bg-gray-100 border-gray-300';
                        textColor = 'text-gray-500';
                        accentColor = 'text-gray-400';
                      } else if (isNextCut) {
                        bgColor = 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200';
                        textColor = 'text-emerald-900';
                        accentColor = 'text-emerald-600';
                      } else {
                        bgColor = 'bg-orange-50 hover:bg-orange-100 border-orange-200';
                        textColor = 'text-orange-900';
                        accentColor = 'text-orange-600';
                      }
                      
                      return (
                        <div
                          key={job.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, job)}
                          onTouchStart={(e) => handleTouchStart(e, job)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onDoubleClick={() => handleJobDoubleClick(job)}
                          className={`group ${bgColor} border rounded px-2 py-1 text-xs cursor-move hover:cursor-pointer ${
                            isCompleted ? 'opacity-60' : ''
                          } transition-colors`}
                        >
                          <div className="flex items-center gap-1">
                            <GripVertical className={`h-3 w-3 ${accentColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
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
                    
                    {/* Show next cut dates for customers without jobs yet */}
                    {getNextCutsForDate(date)
                      .filter(customer => {
                        // Only show preview if this customer has NO jobs scheduled for this date
                        const hasJobOnThisDate = dayJobs.some(job => job.customerId === customer.id);
                        return !hasJobOnThisDate;
                      })
                      .map(customer => (
                        <div
                          key={`nextcut-${customer.id}`}
                          className="group bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-1 text-xs transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate flex-1 text-emerald-900 font-medium">
                              {customer.name}
                            </span>
                            <span className="text-[10px] text-emerald-600">📅</span>
                          </div>
                          <div className="text-emerald-600 text-[10px] ml-0">
                            Next cut scheduled
                          </div>
                        </div>
                      ))}
                    
                    {/* Show next-next cut dates (the cut after the next cut) */}
                    {getNextNextCutsForDate(date)
                      .filter(customer => {
                        // Only show preview if this customer has NO jobs scheduled for this date
                        const hasJobOnThisDate = dayJobs.some(job => job.customerId === customer.id);
                        return !hasJobOnThisDate;
                      })
                      .map(customer => (
                        <div
                          key={`nextnextcut-${customer.id}`}
                          className="group bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded px-2 py-1 text-xs transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate flex-1 text-orange-900 font-medium">
                              {customer.name}
                            </span>
                            <span className="text-[10px] text-orange-600">📆</span>
                          </div>
                          <div className="text-orange-600 text-[10px] ml-0">
                            Future cut scheduled
                          </div>
                        </div>
                      ))}
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
            <div className="w-4 h-4 bg-emerald-50 border border-emerald-200 rounded"></div>
            <span>Next Cut</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-50 border border-orange-200 rounded"></div>
            <span>Future Cut</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <span>Drag to reschedule</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">💡 Double-click to edit job details</span>
          </div>
        </div>
      </CardContent>

      {/* Edit Job Dialog */}
      <Dialog open={!!editingJob} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>
              Update job details for {editingJob && customers.find(c => c.id === editingJob.customerId)?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                placeholder="Enter price"
              />
              <p className="text-xs text-gray-500">
                Updating price will change it for this customer
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="scheduledTime">Scheduled Time</Label>
              <Input
                id="scheduledTime"
                type="time"
                value={editForm.scheduledTime}
                onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value: 'scheduled' | 'in-progress' | 'completed') => 
                  setEditForm({ ...editForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Add notes about this job..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
