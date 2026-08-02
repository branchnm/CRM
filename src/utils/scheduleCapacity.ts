import type { Job } from '../App';

export const DEFAULT_DAY_START_HOUR = 5;
export const DEFAULT_DAY_END_HOUR = 19;

export interface DayCapacityResult {
  hasCapacity: boolean;
  reason?: string;
  totalMinutes: number;
  maxMinutes: number;
  availableMinutes: number;
  dayStartHour: number;
  dayEndHour: number;
}

export interface DayCapacityOptions {
  additionalJobIds?: string[];
  excludeJobIds?: string[];
  dayStartHour?: number;
  dayEndHour?: number;
}

function readStoredHourMap(storageKey: string): Map<string, number> {
  if (typeof window === 'undefined') return new Map();

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return new Map();

    return new Map(JSON.parse(saved));
  } catch {
    return new Map();
  }
}

export function getStoredDayStartHour(dateStr: string, fallback = DEFAULT_DAY_START_HOUR): number {
  return readStoredHourMap('dayStartTimes').get(dateStr) || fallback;
}

export function getStoredDayEndHour(dateStr: string, fallback = DEFAULT_DAY_END_HOUR): number {
  return readStoredHourMap('dayEndTimes').get(dateStr) || fallback;
}

export function getDayCapacity(
  jobs: Job[],
  targetDate: string,
  options: DayCapacityOptions = {}
): DayCapacityResult {
  const {
    additionalJobIds = [],
    excludeJobIds = [],
    dayStartHour = DEFAULT_DAY_START_HOUR,
    dayEndHour = DEFAULT_DAY_END_HOUR
  } = options;

  const excludeSet = new Set(excludeJobIds);

  const jobsOnDay = jobs.filter(job => {
    if (job.date !== targetDate) return false;
    if (excludeSet.has(job.id)) return false;
    return job.status === 'scheduled' || job.status === 'completed';
  });

  const additionalJobs = additionalJobIds
    .map(jobId => jobs.find(job => job.id === jobId))
    .filter((job): job is Job => job !== undefined && !excludeSet.has(job.id));

  const allJobs = [...jobsOnDay, ...additionalJobs];
  const totalMinutes = allJobs.reduce(
    (sum, job) => sum + (job.totalTime || 30) + (job.driveTime || 0),
    0
  );
  const availableMinutes = Math.max(0, (dayEndHour - dayStartHour) * 60);

  if (totalMinutes > availableMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const availHours = Math.floor(availableMinutes / 60);
    const availMins = availableMinutes % 60;

    return {
      hasCapacity: false,
      reason: `Work time (${hours}h ${mins}m) exceeds available time (${availHours}h ${availMins}m from ${dayStartHour}:00 to ${dayEndHour}:00)`,
      totalMinutes,
      maxMinutes: availableMinutes,
      availableMinutes,
      dayStartHour,
      dayEndHour
    };
  }

  return {
    hasCapacity: true,
    totalMinutes,
    maxMinutes: availableMinutes,
    availableMinutes,
    dayStartHour,
    dayEndHour
  };
}