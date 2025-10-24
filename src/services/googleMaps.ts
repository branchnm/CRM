// Google Maps Distance Matrix API service via Supabase Edge Function
import { supabase } from '../lib/supabase';

export interface DistanceMatrixResult {
  durationMinutes: number;
  durationText: string;
  distanceText: string;
  distanceMeters: number;
  durationSeconds: number;
}

// Cache to avoid redundant API calls
const driveTimeCache = new Map<string, DistanceMatrixResult>();

/**
 * Get drive time between two addresses using Supabase Edge Function
 * This calls Google Maps Distance Matrix API securely from the backend
 */
export async function getDriveTime(
  origin: string,
  destination: string
): Promise<DistanceMatrixResult | null> {
  // Create cache key
  const cacheKey = `${origin}|${destination}`;
  
  // Check cache first
  if (driveTimeCache.has(cacheKey)) {
    return driveTimeCache.get(cacheKey)!;
  }

  try {
    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('get-drive-time', {
      body: { origin, destination }
    });

    if (error) {
      console.error('Error calling get-drive-time function:', error);
      return null;
    }

    if (!data || data.error) {
      console.error('Drive time API error:', data?.error);
      return null;
    }

    const result: DistanceMatrixResult = {
      durationMinutes: data.durationMinutes,
      durationText: data.durationText,
      distanceText: data.distanceText,
      distanceMeters: data.distanceMeters,
      durationSeconds: data.durationSeconds,
    };

    // Cache the result
    driveTimeCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error fetching drive time:', error);
    return null;
  }
}

/**
 * Batch get drive times for multiple origin-destination pairs
 */
export async function getBatchDriveTimes(
  pairs: Array<{ origin: string; destination: string }>
): Promise<Map<string, DistanceMatrixResult>> {
  const results = new Map<string, DistanceMatrixResult>();
  
  // Process in batches to avoid rate limits (max 25 elements per request)
  const batchSize = 10;
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const promises = batch.map(({ origin, destination }) =>
      getDriveTime(origin, destination).then(result => ({
        key: `${origin}|${destination}`,
        result,
      }))
    );

    const batchResults = await Promise.all(promises);
    batchResults.forEach(({ key, result }) => {
      if (result) {
        results.set(key, result);
      }
    });
  }

  return results;
}

/**
 * Clear the drive time cache
 */
export function clearDriveTimeCache() {
  driveTimeCache.clear();
}
