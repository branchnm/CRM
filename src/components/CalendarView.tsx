import { JobCalendar } from './JobCalendar';
import { JobHistory } from './JobHistory';
import type { Job, Customer } from '../App';

interface CalendarViewProps {
  jobs: Job[];
  customers: Customer[];
  onUpdateJobs: (jobs: Job[]) => void;
  onRefreshCustomers?: () => Promise<void> | void;
  onRefreshJobs?: () => Promise<void> | void;
}

export function CalendarView({ jobs, customers, onUpdateJobs, onRefreshCustomers, onRefreshJobs }: CalendarViewProps) {
  return (
    <div className="space-y-6">
      {/* Job Calendar */}
      <JobCalendar
        jobs={jobs}
        customers={customers}
        onUpdateJobs={onUpdateJobs}
        onRefreshCustomers={onRefreshCustomers}
        onRefreshJobs={onRefreshJobs}
      />

      {/* Job History Section */}
      {onRefreshJobs && (
        <JobHistory 
          jobs={jobs}
          customers={customers}
          onRefreshJobs={onRefreshJobs}
        />
      )}
    </div>
  );
}
