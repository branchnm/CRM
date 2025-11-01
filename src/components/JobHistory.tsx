import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import type { Job, Customer } from '../App';
import { Calendar, DollarSign, Clock, Pencil, Trash2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { updateJob, deleteJob, addJob } from '../services/jobs';

interface JobHistoryProps {
  jobs: Job[];
  customers: Customer[];
  onRefreshJobs: () => Promise<void> | void;
}

export function JobHistory({ jobs, customers, onRefreshJobs }: JobHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [formData, setFormData] = useState<{
    customerId: string;
    date: string;
    status: 'scheduled' | 'in-progress' | 'completed';
    totalTime?: string;
    mowTime?: string;
    trimTime?: string;
    edgeTime?: string;
    blowTime?: string;
    driveTime?: string;
    notes?: string;
    scheduledTime?: string;
  }>({
    customerId: '',
    date: '',
    status: 'completed',
    totalTime: '',
    mowTime: '',
    trimTime: '',
    edgeTime: '',
    blowTime: '',
    driveTime: '',
    notes: '',
    scheduledTime: ''
  });

  const getCustomer = (customerId: string) => {
    return customers.find(c => c.id === customerId);
  };

  // Filter to only show completed jobs, then apply search filter and sort
  const filteredJobs = jobs
    .filter(job => job.status === 'completed') // Only show completed jobs
    .filter(job => {
      if (!searchQuery) return true;
      const customer = getCustomer(job.customerId);
      return (
        customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer?.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.date.includes(searchQuery)
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Newest first

  const resetForm = () => {
    setFormData({
      customerId: '',
      date: '',
      status: 'completed',
      totalTime: '',
      mowTime: '',
      trimTime: '',
      edgeTime: '',
      blowTime: '',
      driveTime: '',
      notes: '',
      scheduledTime: ''
    });
  };

  const openEditDialog = (job: Job) => {
    setEditingJob(job);
    setFormData({
      customerId: job.customerId,
      date: job.date,
      status: job.status,
      totalTime: job.totalTime?.toString() || '',
      mowTime: job.mowTime?.toString() || '',
      trimTime: job.trimTime?.toString() || '',
      edgeTime: job.edgeTime?.toString() || '',
      blowTime: job.blowTime?.toString() || '',
      driveTime: job.driveTime?.toString() || '',
      notes: job.notes || '',
      scheduledTime: job.scheduledTime || ''
    });
  };

  const handleSaveJob = async () => {
    if (!formData.customerId || !formData.date) {
      toast.error('Please select a customer and date');
      return;
    }

    try {
      const jobData = {
        customerId: formData.customerId,
        date: formData.date,
        status: formData.status,
        totalTime: formData.totalTime ? parseInt(formData.totalTime) : undefined,
        mowTime: formData.mowTime ? parseInt(formData.mowTime) : undefined,
        trimTime: formData.trimTime ? parseInt(formData.trimTime) : undefined,
        edgeTime: formData.edgeTime ? parseInt(formData.edgeTime) : undefined,
        blowTime: formData.blowTime ? parseInt(formData.blowTime) : undefined,
        driveTime: formData.driveTime ? parseInt(formData.driveTime) : undefined,
        notes: formData.notes || undefined,
        scheduledTime: formData.scheduledTime || undefined,
      };

      if (editingJob) {
        await updateJob({ ...editingJob, ...jobData });
        toast.success('Job updated successfully');
      } else {
        await addJob(jobData);
        toast.success('Job added successfully');
      }

      await onRefreshJobs();
      setEditingJob(null);
      setIsAddingJob(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save job:', error);
      toast.error('Failed to save job. Please try again.');
    }
  };

  const handleDeleteJob = async (job: Job) => {
    const customer = getCustomer(job.customerId);
    if (confirm(`Delete job for ${customer?.name} on ${new Date(job.date).toLocaleDateString()}?`)) {
      try {
        await deleteJob(job.id);
        await onRefreshJobs();
        toast.success('Job deleted successfully');
      } catch (error) {
        console.error('Failed to delete job:', error);
        toast.error('Failed to delete job. Please try again.');
      }
    }
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'scheduled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job History</CardTitle>
              <CardDescription>View and manage all past and scheduled jobs</CardDescription>
            </div>
            <Button onClick={() => setIsAddingJob(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Job
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by customer name, address, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur">
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                {searchQuery ? 'No jobs found matching your search.' : 'No jobs yet. Add your first job!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map(job => {
            const customer = getCustomer(job.customerId);
            if (!customer) return null;

            return (
              <Card key={job.id} className="bg-white/80 backdrop-blur hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-gray-900">{customer.name}</h3>
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(job.date).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}</span>
                        </div>
                        
                        {job.totalTime && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>Total: {formatDuration(job.totalTime)}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span>${customer.price}</span>
                        </div>
                      </div>

                      {/* Time Breakdown */}
                      {(job.mowTime || job.trimTime || job.edgeTime || job.blowTime) && (
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-2">
                          {job.mowTime && <span>Mow: {formatDuration(job.mowTime)}</span>}
                          {job.trimTime && <span>Trim: {formatDuration(job.trimTime)}</span>}
                          {job.edgeTime && <span>Edge: {formatDuration(job.edgeTime)}</span>}
                          {job.blowTime && <span>Blow: {formatDuration(job.blowTime)}</span>}
                        </div>
                      )}

                      {job.notes && (
                        <p className="text-sm text-gray-600 italic mt-2">"{job.notes}"</p>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(job)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteJob(job)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add/Edit Job Dialog */}
      <Dialog open={editingJob !== null || isAddingJob} onOpenChange={(open) => {
        if (!open) {
          setEditingJob(null);
          setIsAddingJob(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? 'Edit Job' : 'Add New Job'}</DialogTitle>
            <DialogDescription>
              {editingJob ? 'Update job details and time tracking' : 'Add a completed or scheduled job'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label>Customer *</Label>
              <select
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={!!editingJob}
              >
                <option value="">Select a customer...</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="scheduled">Scheduled</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {/* Time Tracking */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Time (minutes)</Label>
                <Input
                  type="number"
                  value={formData.totalTime}
                  onChange={(e) => setFormData({ ...formData, totalTime: e.target.value })}
                  placeholder="e.g., 45"
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <Input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                />
              </div>
            </div>

            {/* Detailed Time Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mow Time (min)</Label>
                <Input
                  type="number"
                  value={formData.mowTime}
                  onChange={(e) => setFormData({ ...formData, mowTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Trim Time (min)</Label>
                <Input
                  type="number"
                  value={formData.trimTime}
                  onChange={(e) => setFormData({ ...formData, trimTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Edge Time (min)</Label>
                <Input
                  type="number"
                  value={formData.edgeTime}
                  onChange={(e) => setFormData({ ...formData, edgeTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Blow Time (min)</Label>
                <Input
                  type="number"
                  value={formData.blowTime}
                  onChange={(e) => setFormData({ ...formData, blowTime: e.target.value })}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any notes about this job..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditingJob(null);
              setIsAddingJob(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveJob} className="bg-blue-600 hover:bg-blue-700">
              {editingJob ? 'Update Job' : 'Add Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
