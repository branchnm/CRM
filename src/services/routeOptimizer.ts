import { getDriveTime, getBatchDriveTimes } from './googleMaps';

export interface Job {
  id: string;
  address: string;
  order?: number;
}

export interface RouteSegment {
  fromAddress: string;
  toAddress: string;
  durationMinutes: number;
  distanceMeters: number;
  durationText: string;
  distanceText: string;
}

export interface OptimizedRoute {
  jobs: Job[];
  segments: RouteSegment[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  totalDistanceText: string;
  totalDurationText: string;
}

/**
 * Optimizes the route for a set of jobs using real Google Maps data.
 * Prioritizes fastest route, but considers distance if time difference is minimal.
 * 
 * @param startAddress - Starting location (e.g., business address)
 * @param jobs - Array of jobs to optimize
 * @param timeThresholdPercent - If time difference is less than this %, consider distance (default 10%)
 * @param distanceThresholdPercent - Distance difference threshold to switch routes (default 15%)
 */
export async function optimizeRoute(
  startAddress: string,
  jobs: Job[],
  timeThresholdPercent: number = 10,
  distanceThresholdPercent: number = 15
): Promise<OptimizedRoute> {
  if (jobs.length === 0) {
    return {
      jobs: [],
      segments: [],
      totalDurationMinutes: 0,
      totalDistanceMeters: 0,
      totalDistanceText: '0 mi',
      totalDurationText: '0 mins'
    };
  }

  if (jobs.length === 1) {
    const result = await getDriveTime(startAddress, jobs[0].address);
    return {
      jobs: [{ ...jobs[0], order: 1 }],
      segments: result ? [{
        fromAddress: startAddress,
        toAddress: jobs[0].address,
        durationMinutes: result.durationMinutes,
        distanceMeters: result.distanceMeters,
        durationText: result.durationText,
        distanceText: result.distanceText
      }] : [],
      totalDurationMinutes: result?.durationMinutes || 0,
      totalDistanceMeters: result?.distanceMeters || 0,
      totalDistanceText: result?.distanceText || '0 mi',
      totalDurationText: result?.durationText || '0 mins'
    };
  }

  // Fetch all pairwise distances and times
  const allAddresses = [startAddress, ...jobs.map(j => j.address)];
  const distanceMatrix = await buildDistanceMatrix(allAddresses);

  // Use optimized traveling salesman algorithm
  const optimizedOrder = findOptimalRoute(
    distanceMatrix,
    timeThresholdPercent,
    distanceThresholdPercent
  );

  // Build the result
  const orderedJobs = optimizedOrder.map((jobIndex, order) => ({
    ...jobs[jobIndex],
    order: order + 1
  }));

  const segments: RouteSegment[] = [];
  let totalDurationMinutes = 0;
  let totalDistanceMeters = 0;

  // First segment: start -> first job
  const firstSegment = distanceMatrix[0][optimizedOrder[0] + 1];
  if (firstSegment) {
    segments.push({
      fromAddress: startAddress,
      toAddress: jobs[optimizedOrder[0]].address,
      durationMinutes: firstSegment.durationMinutes,
      distanceMeters: firstSegment.distanceMeters,
      durationText: firstSegment.durationText,
      distanceText: firstSegment.distanceText
    });
    totalDurationMinutes += firstSegment.durationMinutes;
    totalDistanceMeters += firstSegment.distanceMeters;
  }

  // Remaining segments: job to job
  for (let i = 0; i < optimizedOrder.length - 1; i++) {
    const fromIndex = optimizedOrder[i] + 1;
    const toIndex = optimizedOrder[i + 1] + 1;
    const segment = distanceMatrix[fromIndex][toIndex];
    
    if (segment) {
      segments.push({
        fromAddress: jobs[optimizedOrder[i]].address,
        toAddress: jobs[optimizedOrder[i + 1]].address,
        durationMinutes: segment.durationMinutes,
        distanceMeters: segment.distanceMeters,
        durationText: segment.durationText,
        distanceText: segment.distanceText
      });
      totalDurationMinutes += segment.durationMinutes;
      totalDistanceMeters += segment.distanceMeters;
    }
  }

  return {
    jobs: orderedJobs,
    segments,
    totalDurationMinutes,
    totalDistanceMeters,
    totalDistanceText: formatDistance(totalDistanceMeters),
    totalDurationText: formatDuration(totalDurationMinutes)
  };
}

interface DistanceMatrixEntry {
  durationMinutes: number;
  distanceMeters: number;
  durationText: string;
  distanceText: string;
}

async function buildDistanceMatrix(addresses: string[]): Promise<(DistanceMatrixEntry | null)[][]> {
  const n = addresses.length;
  const matrix: (DistanceMatrixEntry | null)[][] = Array(n).fill(null).map(() => Array(n).fill(null));

  // Build all origin-destination pairs
  const pairs: Array<{ origin: string; destination: string; fromIdx: number; toIdx: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        pairs.push({ 
          origin: addresses[i], 
          destination: addresses[j],
          fromIdx: i,
          toIdx: j
        });
      }
    }
  }

  // Fetch in batches
  const results = await getBatchDriveTimes(
    pairs.map(p => ({ origin: p.origin, destination: p.destination }))
  );

  // Fill matrix with results
  pairs.forEach(({ origin, destination, fromIdx, toIdx }) => {
    const key = `${origin}|${destination}`;
    const result = results.get(key);
    
    if (result) {
      matrix[fromIdx][toIdx] = {
        durationMinutes: result.durationMinutes,
        distanceMeters: result.distanceMeters,
        durationText: result.durationText,
        distanceText: result.distanceText
      };
    }
  });

  return matrix;
}

/**
 * Find optimal route using a greedy nearest-neighbor approach with smart time/distance tradeoffs.
 * For larger sets, this uses a 2-opt improvement heuristic.
 */
function findOptimalRoute(
  distanceMatrix: (DistanceMatrixEntry | null)[][],
  timeThresholdPercent: number,
  distanceThresholdPercent: number
): number[] {
  const n = distanceMatrix.length - 1; // Exclude starting point
  if (n === 0) return [];
  if (n === 1) return [0];

  // Start with greedy nearest neighbor with smart selection
  let route = greedyRouteWithSmartSelection(
    distanceMatrix,
    timeThresholdPercent,
    distanceThresholdPercent
  );

  // Improve with 2-opt if more than 3 jobs
  if (n > 3) {
    route = twoOptImprovement(distanceMatrix, route);
  }

  return route;
}

function greedyRouteWithSmartSelection(
  distanceMatrix: (DistanceMatrixEntry | null)[][],
  timeThresholdPercent: number,
  distanceThresholdPercent: number
): number[] {
  const n = distanceMatrix.length - 1;
  const unvisited = new Set(Array.from({ length: n }, (_, i) => i));
  const route: number[] = [];
  let currentIndex = 0; // Start from starting address (index 0)

  while (unvisited.size > 0) {
    let bestJob: number | null = null;
    let bestScore = Infinity;
    let bestTime = Infinity;
    let bestDistance = Infinity;

    // Find the best next job
    for (const jobIndex of unvisited) {
      const matrixIndex = jobIndex + 1;
      const segment = distanceMatrix[currentIndex][matrixIndex];
      
      if (!segment) continue;

      const time = segment.durationMinutes;
      const distance = segment.distanceMeters;

      // Primary criterion: time
      // Secondary: if times are similar (within threshold), prefer shorter distance
      let score = time;

      // Check if we have a previous best
      if (bestJob !== null) {
        const timeDiff = Math.abs(time - bestTime);
        const timeThreshold = (bestTime * timeThresholdPercent) / 100;

        // If time difference is small, factor in distance
        if (timeDiff <= timeThreshold) {
          const distanceDiff = ((distance - bestDistance) / bestDistance) * 100;
          
          // If this option is significantly shorter in distance, prefer it
          if (distanceDiff < -distanceThresholdPercent) {
            score = time - 1; // Give it a slight boost
          }
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestJob = jobIndex;
        bestTime = time;
        bestDistance = distance;
      }
    }

    if (bestJob !== null) {
      route.push(bestJob);
      unvisited.delete(bestJob);
      currentIndex = bestJob + 1;
      } else {
      // No valid segment found, just take any remaining
      const next = unvisited.values().next().value;
      if (next !== undefined) {
        route.push(next);
        unvisited.delete(next);
        currentIndex = next + 1;
      }
    }
  }

  return route;
}

/**
 * 2-opt improvement: try swapping segments to reduce total time
 */
function twoOptImprovement(
  distanceMatrix: (DistanceMatrixEntry | null)[][],
  route: number[]
): number[] {
  let improved = true;
  let currentRoute = [...route];

  while (improved) {
    improved = false;

    for (let i = 0; i < currentRoute.length - 1; i++) {
      for (let j = i + 2; j < currentRoute.length; j++) {
        const currentCost = getRouteCost(distanceMatrix, currentRoute);
        
        // Reverse segment between i and j
        const newRoute = [...currentRoute];
        const segment = newRoute.slice(i + 1, j + 1).reverse();
        newRoute.splice(i + 1, j - i, ...segment);

        const newCost = getRouteCost(distanceMatrix, newRoute);

        if (newCost < currentCost) {
          currentRoute = newRoute;
          improved = true;
        }
      }
    }
  }

  return currentRoute;
}

function getRouteCost(distanceMatrix: (DistanceMatrixEntry | null)[][], route: number[]): number {
  let cost = 0;
  
  // Cost from start to first job
  const firstSegment = distanceMatrix[0][route[0] + 1];
  if (firstSegment) cost += firstSegment.durationMinutes;

  // Cost between jobs
  for (let i = 0; i < route.length - 1; i++) {
    const segment = distanceMatrix[route[i] + 1][route[i + 1] + 1];
    if (segment) cost += segment.durationMinutes;
  }

  return cost;
}

function formatDistance(meters: number): string {
  const miles = meters * 0.000621371;
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} mins`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
