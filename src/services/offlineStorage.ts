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

// Helper to get date in YYYY-MM-DD format
function getDateString(daysOffset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toLocaleDateString('en-CA');
}

// Sample data for initial setup
const SAMPLE_CUSTOMERS: Customer[] = [
  {
    id: '1',
    name: 'Johnson House',
    address: '128 Edgewood Blvd, Homewood, AL 35209',
    phone: '(205) 555-0123',
    email: 'mjohnson@email.com',
    squareFootage: 5000,
    price: 45,
    isHilly: false,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Gate code: 1234. Dog in backyard - call before entering.',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '2',
    name: 'Smith Estate',
    address: '1842 Oxmoor Rd, Homewood, AL 35209',
    phone: '(205) 555-0456',
    email: 'smith.family@email.com',
    squareFootage: 12000,
    price: 95,
    isHilly: true,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Large property with multiple flower beds and trees.',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '3',
    name: 'Martinez Property',
    address: '512 Central Ave, Homewood, AL 35209',
    phone: '(205) 555-0789',
    email: undefined,
    squareFootage: 3500,
    price: 35,
    isHilly: false,
    hasFencing: false,
    hasObstacles: false,
    frequency: 'biweekly',
    dayOfWeek: undefined,
    notes: '',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '4',
    name: 'Williams Home',
    address: '2145 Hollywood Blvd, Homewood, AL 35209',
    phone: '(205) 555-0234',
    email: 'twilliams@email.com',
    squareFootage: 7500,
    price: 55,
    isHilly: false,
    hasFencing: true,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Pool equipment in backyard. Please be careful around it.',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '5',
    name: 'Brown Residence',
    address: '1706 Woodland Ave, Homewood, AL 35209',
    phone: '(205) 555-0567',
    email: undefined,
    squareFootage: 4200,
    price: 40,
    isHilly: true,
    hasFencing: false,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Steep slope in front yard - use caution.',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '6',
    name: 'Davis Property',
    address: '3029 Central Ave, Homewood, AL 35209',
    phone: '(205) 555-0890',
    email: 'ldavis@email.com',
    squareFootage: 6000,
    price: 48,
    isHilly: false,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: '',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '7',
    name: 'Miller Estate',
    address: '1920 Montevallo Rd, Homewood, AL 35209',
    phone: '(205) 555-0345',
    email: undefined,
    squareFootage: 15000,
    price: 120,
    isHilly: true,
    hasFencing: true,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Large estate. Enter through side gate. Client prefers service between 8-10 AM.',
    lastCutDate: undefined,
    nextCutDate: getDateString(0),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '8',
    name: 'Garcia Home',
    address: '224 Delcris Dr, Homewood, AL 35209',
    phone: '(205) 555-0678',
    email: 'garcia.family@email.com',
    squareFootage: 4500,
    price: 42,
    isHilly: false,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'biweekly',
    dayOfWeek: undefined,
    notes: 'Lots of garden decorations - trim carefully.',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '9',
    name: 'Anderson Property',
    address: '1512 Rosewood Ln, Homewood, AL 35209',
    phone: '(205) 555-0901',
    email: undefined,
    squareFootage: 5500,
    price: 50,
    isHilly: false,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: '',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '10',
    name: 'Taylor Residence',
    address: '2801 Linden Ave, Homewood, AL 35209',
    phone: '(205) 555-0123',
    email: 'ktaylor@email.com',
    squareFootage: 8000,
    price: 65,
    isHilly: true,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Hilly backyard. Client leaves payment under doormat.',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '11',
    name: 'Roberts Home',
    address: '1405 Saulter Rd, Homewood, AL 35209',
    phone: '(205) 555-1001',
    email: 'jroberts@email.com',
    squareFootage: 5200,
    price: 47,
    isHilly: false,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Park in driveway. Key under mat for equipment shed.',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '12',
    name: 'Thompson Property',
    address: '817 Palmetto St, Homewood, AL 35209',
    phone: '(205) 555-1102',
    email: undefined,
    squareFootage: 4800,
    price: 43,
    isHilly: true,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Watch for sprinkler heads near front walkway.',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '13',
    name: 'Wilson Estate',
    address: '2234 Montevallo Rd, Homewood, AL 35209',
    phone: '(205) 555-1203',
    email: 'wilson.home@email.com',
    squareFootage: 9500,
    price: 75,
    isHilly: false,
    hasFencing: true,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Large corner lot. Side gate code: 5678.',
    lastCutDate: undefined,
    nextCutDate: getDateString(1),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '14',
    name: 'Martin Residence',
    address: '1623 Carr Ave, Homewood, AL 35209',
    phone: '(205) 555-1304',
    email: 'rmartin@email.com',
    squareFootage: 4100,
    price: 38,
    isHilly: false,
    hasFencing: false,
    hasObstacles: false,
    frequency: 'biweekly',
    dayOfWeek: undefined,
    notes: '',
    lastCutDate: undefined,
    nextCutDate: getDateString(2),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '15',
    name: 'Lee Property',
    address: '1918 Oxmoor Rd, Homewood, AL 35209',
    phone: '(205) 555-1405',
    email: undefined,
    squareFootage: 6200,
    price: 52,
    isHilly: true,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Steep driveway. Extra time needed for hillside.',
    lastCutDate: undefined,
    nextCutDate: getDateString(2),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '16',
    name: 'White Home',
    address: '1340 Broadway St, Homewood, AL 35209',
    phone: '(205) 555-1506',
    email: 'white.family@email.com',
    squareFootage: 5500,
    price: 48,
    isHilly: false,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Lots of landscaping. Take care around flower beds.',
    lastCutDate: undefined,
    nextCutDate: getDateString(2),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '17',
    name: 'Harris Estate',
    address: '2712 Central Ave, Homewood, AL 35209',
    phone: '(205) 555-1607',
    email: undefined,
    squareFootage: 11000,
    price: 90,
    isHilly: true,
    hasFencing: true,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Premium property. Client expects detailed edging.',
    lastCutDate: undefined,
    nextCutDate: getDateString(2),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '18',
    name: 'Clark Property',
    address: '1834 Shades Crest Rd, Homewood, AL 35209',
    phone: '(205) 555-1708',
    email: 'mclark@email.com',
    squareFootage: 7200,
    price: 58,
    isHilly: true,
    hasFencing: false,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Mountain view property. Very steep terrain.',
    lastCutDate: undefined,
    nextCutDate: getDateString(2),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '19',
    name: 'Young Residence',
    address: '916 Green Springs Ave, Homewood, AL 35209',
    phone: '(205) 555-1809',
    email: 'young.home@email.com',
    squareFootage: 4600,
    price: 41,
    isHilly: false,
    hasFencing: true,
    hasObstacles: false,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Fenced backyard with gate access from alley.',
    lastCutDate: undefined,
    nextCutDate: getDateString(3),
    status: 'incomplete',
    groupId: undefined,
  },
  {
    id: '20',
    name: 'King Home',
    address: '2145 Lakeshore Dr, Homewood, AL 35209',
    phone: '(205) 555-1910',
    email: undefined,
    squareFootage: 8200,
    price: 68,
    isHilly: false,
    hasFencing: true,
    hasObstacles: true,
    frequency: 'weekly',
    dayOfWeek: undefined,
    notes: 'Lakefront property. Extra cleanup needed in fall.',
    lastCutDate: undefined,
    nextCutDate: getDateString(3),
    status: 'incomplete',
    groupId: undefined,
  },
];

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
