/**
 * Offline Storage Service
 * Provides mock data storage using localStorage when Supabase is unavailable
 * Enable with VITE_OFFLINE_MODE=true in .env.local
 */

import type { Customer, Job, CustomerGroup } from '../App';

// Check if offline mode is enabled via environment variable OR URL parameter
const checkOfflineMode = (): boolean => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlDemo = urlParams.get('demo') === 'true';
  const envOffline = import.meta.env.VITE_OFFLINE_MODE === 'true';
  
  // Check sessionStorage first (set when ?demo=true is used)
  const sessionDemo = sessionStorage.getItem('demoMode') === 'true';
  
  return urlDemo || sessionDemo || envOffline;
};

const OFFLINE_MODE = checkOfflineMode();

// Storage keys
const CUSTOMERS_KEY = 'offline_customers';
const JOBS_KEY = 'offline_jobs';
const GROUPS_KEY = 'offline_groups';

// Sample data for initial setup
const SAMPLE_CUSTOMERS: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    address: '123 Main St, Homewood, AL',
    phone: '205-555-0101',
    email: 'john.smith@example.com',
    squareFootage: 5000,
    price: 45,
    isHilly: false,
    hasFencing: false,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Front yard only',
    lastCutDate: undefined,
    nextCutDate: new Date().toLocaleDateString('en-CA'),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '2',
    name: 'Jane Doe',
    address: '456 Oak Ave, Homewood, AL',
    phone: '205-555-0102',
    email: 'jane.doe@example.com',
    squareFootage: 7500,
    price: 60,
    isHilly: true,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Back gate code: 1234',
    lastCutDate: undefined,
    nextCutDate: new Date().toLocaleDateString('en-CA'),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '3',
    name: 'Bob Johnson',
    address: '789 Pine Dr, Homewood, AL',
    phone: '205-555-0103',
    email: 'bob.j@example.com',
    squareFootage: 6000,
    price: 50,
    isHilly: false,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'biweekly',
    dayOfWeek: undefined,
    notes: 'Edge trimming needed',
    lastCutDate: undefined,
    nextCutDate: getTomorrowDate(),
    status: 'incomplete',
    groupId: undefined,
  }
];

// Helper to get date in YYYY-MM-DD format
function getDateString(daysOffset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toLocaleDateString('en-CA');
}

// Sample completed jobs for insights demo
const SAMPLE_JOBS: Job[] = [
  // Recent completed jobs (last 3 cuts for each customer as shown in screenshot)
  // John Smith - 3 recent cuts
  {
    id: 'job-1',
    customerId: '1',
    date: getDateString(-3),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:45 AM',
    status: 'completed',
    notes: 'Weekly mowing service',
    totalTime: 45,
    mowTime: 30,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 15,
    order: 1,
  },
  {
    id: 'job-2',
    customerId: '1',
    date: getDateString(-10),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:45 AM',
    status: 'completed',
    notes: 'Regular maintenance',
    totalTime: 45,
    mowTime: 30,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 12,
    order: 1,
  },
  {
    id: 'job-3',
    customerId: '1',
    date: getDateString(-17),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:45 AM',
    status: 'completed',
    notes: 'Weekly lawn care',
    totalTime: 45,
    mowTime: 30,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 10,
    order: 1,
  },
  // Jane Doe - 3 recent cuts
  {
    id: 'job-4',
    customerId: '2',
    date: getDateString(-3),
    scheduledTime: '6:00 AM',
    startTime: '6:00 AM',
    endTime: '7:00 AM',
    status: 'completed',
    notes: 'Full service with trimming',
    totalTime: 60,
    mowTime: 40,
    trimTime: 15,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 8,
    order: 2,
  },
  {
    id: 'job-5',
    customerId: '2',
    date: getDateString(-10),
    scheduledTime: '6:00 AM',
    startTime: '6:00 AM',
    endTime: '7:00 AM',
    status: 'completed',
    notes: 'Complete lawn care',
    totalTime: 60,
    mowTime: 40,
    trimTime: 15,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 10,
    order: 2,
  },
  {
    id: 'job-6',
    customerId: '2',
    date: getDateString(-17),
    scheduledTime: '6:00 AM',
    startTime: '6:00 AM',
    endTime: '7:00 AM',
    status: 'completed',
    notes: 'Weekly service',
    totalTime: 60,
    mowTime: 40,
    trimTime: 15,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 12,
    order: 2,
  },
  // Bob Johnson - 3 recent cuts (biweekly)
  {
    id: 'job-7',
    customerId: '3',
    date: getDateString(-5),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:50 AM',
    status: 'completed',
    notes: 'Biweekly maintenance',
    totalTime: 50,
    mowTime: 35,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 15,
    order: 3,
  },
  {
    id: 'job-8',
    customerId: '3',
    date: getDateString(-19),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:50 AM',
    status: 'completed',
    notes: 'Biweekly service',
    totalTime: 50,
    mowTime: 35,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 18,
    order: 3,
  },
  {
    id: 'job-9',
    customerId: '3',
    date: getDateString(-33),
    scheduledTime: '5:00 AM',
    startTime: '5:00 AM',
    endTime: '5:50 AM',
    status: 'completed',
    notes: 'Biweekly lawn care',
    totalTime: 50,
    mowTime: 35,
    trimTime: 10,
    edgeTime: 3,
    blowTime: 2,
    driveTime: 20,
    order: 3,
  },
];

const SAMPLE_GROUPS: CustomerGroup[] = [];

// Helper to get tomorrow's date in YYYY-MM-DD format
function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-CA');
}

// Initialize storage with sample data if empty
function initializeStorage() {
  if (!localStorage.getItem(CUSTOMERS_KEY)) {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(SAMPLE_CUSTOMERS));
  }
  // Always refresh jobs in demo mode to ensure sample completed jobs are available
  if (!localStorage.getItem(JOBS_KEY)) {
    localStorage.setItem(JOBS_KEY, JSON.stringify(SAMPLE_JOBS));
  } else {
    // Merge existing jobs with sample jobs to preserve any user-created jobs
    const existingJobs = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
    const sampleJobIds = new Set(SAMPLE_JOBS.map(j => j.id));
    const userJobs = existingJobs.filter((j: Job) => !sampleJobIds.has(j.id));
    const mergedJobs = [...SAMPLE_JOBS, ...userJobs];
    localStorage.setItem(JOBS_KEY, JSON.stringify(mergedJobs));
  }
  if (!localStorage.getItem(GROUPS_KEY)) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(SAMPLE_GROUPS));
  }
}

// Check if offline mode is enabled
export function isOfflineMode(): boolean {
  return OFFLINE_MODE;
}

// Customers
export function getOfflineCustomers(): Customer[] {
  initializeStorage();
  const data = localStorage.getItem(CUSTOMERS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveOfflineCustomer(customer: Customer): Customer {
  const customers = getOfflineCustomers();
  const existing = customers.findIndex(c => c.id === customer.id);
  
  if (existing >= 0) {
    customers[existing] = customer;
  } else {
    customers.push(customer);
  }
  
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  return customer;
}

export function deleteOfflineCustomer(id: string): void {
  const customers = getOfflineCustomers().filter(c => c.id !== id);
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
}

// Jobs
export function getOfflineJobs(): Job[] {
  initializeStorage();
  const data = localStorage.getItem(JOBS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveOfflineJob(job: Job): Job {
  const jobs = getOfflineJobs();
  const existing = jobs.findIndex(j => j.id === job.id);
  
  if (existing >= 0) {
    jobs[existing] = job;
  } else {
    jobs.push(job);
  }
  
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  return job;
}

export function deleteOfflineJob(id: string): void {
  const jobs = getOfflineJobs().filter(j => j.id !== id);
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

// Groups
export function getOfflineGroups(): CustomerGroup[] {
  initializeStorage();
  const data = localStorage.getItem(GROUPS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveOfflineGroup(group: CustomerGroup): CustomerGroup {
  const groups = getOfflineGroups();
  const existing = groups.findIndex(g => g.id === group.id);
  
  if (existing >= 0) {
    groups[existing] = group;
  } else {
    groups.push(group);
  }
  
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  return group;
}

export function deleteOfflineGroup(id: string): void {
  const groups = getOfflineGroups().filter(g => g.id !== id);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

// Clear all offline data
export function clearOfflineData(): void {
  localStorage.removeItem(CUSTOMERS_KEY);
  localStorage.removeItem(JOBS_KEY);
  localStorage.removeItem(GROUPS_KEY);
}
