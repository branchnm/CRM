/**
 * Parse date string in local timezone (avoids UTC timezone issues)
 */
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Calculate the next cut date based on frequency and last cut date
 */
export function calculateNextCutDate(
  lastCutDate: string | undefined,
  frequency: 'weekly' | 'biweekly' | 'monthly'
): string | undefined {
  if (!lastCutDate) return undefined;

  const last = parseLocalDate(lastCutDate);
  const next = new Date(last);

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'Not set';
  
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Check if a date is overdue
 */
export function isOverdue(dateString: string | undefined): boolean {
  if (!dateString) return false;
  
  const date = parseLocalDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return date < today;
}

/**
 * Get days until next cut
 */
export function getDaysUntil(dateString: string | undefined): number | null {
  if (!dateString) return null;
  
  const date = parseLocalDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}
