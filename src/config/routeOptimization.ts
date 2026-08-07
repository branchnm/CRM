const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const ROUTE_OPTIMIZATION_ENABLED = import.meta.env.VITE_ROUTE_OPTIMIZATION_ENABLED === 'true';

// Keep the future limit knobs explicit so optimization can be re-enabled in a controlled way.
export const ROUTE_OPTIMIZATION_MAX_DAYS = parsePositiveInteger(import.meta.env.VITE_ROUTE_OPTIMIZATION_MAX_DAYS, 30);
export const ROUTE_OPTIMIZATION_MAX_JOBS_PER_DAY = parsePositiveInteger(import.meta.env.VITE_ROUTE_OPTIMIZATION_MAX_JOBS_PER_DAY, 25);