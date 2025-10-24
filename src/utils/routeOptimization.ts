import type { Customer, Job } from '../App';

/**
 * Simple geocoding using approximate coordinates based on address
 * In production, use Google Maps Geocoding API or similar service
 */
// async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
//   // For now, return null - you can integrate with Google Maps API later
//   // TODO: Integrate with Google Maps Geocoding API
//   // Example: https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=YOUR_API_KEY
//   return null;
// }

/**
 * Calculate distance between two coordinates using Haversine formula
 */
// function calculateDistance(
//   lat1: number,
//   lon1: number,
//   lat2: number,
//   lon2: number
// ): number {
//   const R = 3959; // Earth's radius in miles
//   const dLat = toRad(lat2 - lat1);
//   const dLon = toRad(lon2 - lon1);
//   
//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos(toRad(lat1)) *
//       Math.cos(toRad(lat2)) *
//       Math.sin(dLon / 2) *
//       Math.sin(dLon / 2);
//   
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//   const distance = R * c;
//   
//   return distance;
// }

// function toRad(degrees: number): number {
//   return degrees * (Math.PI / 180);
// }

/**
 * Nearest neighbor algorithm for route optimization
 * Starts from a given location and always goes to the nearest unvisited stop
 */
export function optimizeRouteNearestNeighbor(
  jobs: Job[],
  customers: Customer[],
  startAddress: string
): Job[] {
  if (jobs.length === 0) return [];
  
  // Create a simple distance estimation based on address comparison
  // In production, this would use actual geocoding and distance calculations
  const estimateDistance = (addr1: string, addr2: string): number => {
    // Normalize addresses for comparison
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(addr1);
    const n2 = normalize(addr2);
    
    // Extract numeric parts (street numbers, zip codes) for better comparison
    const getNumbers = (s: string) => {
      const matches = s.match(/\d+/g);
      return matches ? matches.map(Number) : [];
    };
    
    const nums1 = getNumbers(addr1);
    const nums2 = getNumbers(addr2);
    
    // Calculate difference in street numbers (primary indicator)
    let numDiff = 0;
    if (nums1.length > 0 && nums2.length > 0) {
      numDiff = Math.abs(nums1[0] - nums2[0]);
    }
    
    // Calculate string similarity
    let charDiff = Math.abs(n1.length - n2.length);
    const minLen = Math.min(n1.length, n2.length);
    
    for (let i = 0; i < minLen; i++) {
      if (n1[i] !== n2[i]) charDiff++;
    }
    
    // Weight numeric difference more heavily (street numbers indicate proximity)
    return numDiff * 10 + charDiff;
  };
  
  const unvisited = new Set(jobs.map(j => j.id));
  const route: Job[] = [];
  let currentAddress = startAddress;
  
  console.log('Starting route optimization from:', startAddress);
  
  while (unvisited.size > 0) {
    let nearestJob: Job | null = null;
    let minDistance = Infinity;
    
    // Find nearest unvisited job
    for (const job of jobs) {
      if (!unvisited.has(job.id)) continue;
      
      const customer = customers.find(c => c.id === job.customerId);
      if (!customer) continue;
      
      const distance = estimateDistance(currentAddress, customer.address);
      
      console.log(`Distance from "${currentAddress}" to "${customer.address}": ${distance}`);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestJob = job;
      }
    }
    
    if (nearestJob) {
      route.push(nearestJob);
      unvisited.delete(nearestJob.id);
      
      const customer = customers.find(c => c.id === nearestJob.customerId);
      if (customer) {
        currentAddress = customer.address;
        console.log(`Added to route: ${customer.name} at ${customer.address}`);
      }
    } else {
      break; // Safety: shouldn't happen, but prevent infinite loop
    }
  }
  
  console.log('Optimized route order:', route.map(j => {
    const c = customers.find(cu => cu.id === j.customerId);
    return c ? `${c.name} (${c.address})` : 'Unknown';
  }));
  
  return route;
}

/**
 * Optimize route using a simple greedy algorithm
 * Can be enhanced with more sophisticated algorithms (2-opt, genetic algorithms, etc.)
 */
export async function optimizeRoute(
  jobs: Job[],
  customers: Customer[],
  startAddress: string = ''
): Promise<Job[]> {
  if (jobs.length === 0) return [];
  if (jobs.length === 1) return jobs;
  
  // Use nearest neighbor for now
  return optimizeRouteNearestNeighbor(jobs, customers, startAddress);
}

/**
 * Update job order numbers based on optimized route
 */
export function assignRouteOrder(jobs: Job[]): Job[] {
  return jobs.map((job, index) => ({
    ...job,
    order: index + 1
  }));
}
