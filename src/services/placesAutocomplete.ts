// Address Autocomplete service
// Uses multiple providers with automatic fallback

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  distance?: number;
  fullDisplay?: string;
}

/**
 * Fetch address autocomplete suggestions using Nominatim (OpenStreetMap)
 * This is CORS-friendly and works from the browser without API keys
 * @param input - The user's search query
 * @param userLocation - Optional user location for proximity sorting
 * @returns Array of address suggestions
 */
export async function getAddressSuggestions(
  input: string,
  userLocation?: { lat: number; lon: number }
): Promise<AddressSuggestion[]> {
  if (input.length < 3) {
    return [];
  }

  try {
    // Use Nominatim (OpenStreetMap) - free, CORS-friendly, reliable
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', input);
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '10');
    url.searchParams.append('countrycodes', 'us'); // US only
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobFlowCo-CRM/1.0', // Required by Nominatim
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      // Filter and format results
      const results = data
        .filter((item: any) => {
          // Must have location data
          if (!item.display_name || !item.lat || !item.lon) return false;
          // Filter for actual addresses (not just cities/states)
          const hasStreet = item.address && (item.address.road || item.address.house_number);
          return hasStreet || item.type === 'house' || item.type === 'building';
        })
        .map((item: any) => {
          // Build clean address format
          const addr = item.address || {};
          const parts = [];
          
          if (addr.house_number) parts.push(addr.house_number);
          if (addr.road) parts.push(addr.road);
          if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
          if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
          if (addr.state) parts.push(addr.state);
          if (addr.postcode) parts.push(addr.postcode);
          
          const cleanAddress = parts.join(', ') || item.display_name;
          
          // Calculate distance from user if available
          let distance = Infinity;
          if (userLocation) {
            const itemLat = parseFloat(item.lat);
            const itemLon = parseFloat(item.lon);
            // Haversine distance in miles
            const R = 3959;
            const dLat = (itemLat - userLocation.lat) * Math.PI / 180;
            const dLon = (itemLon - userLocation.lon) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(itemLat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            distance = R * c;
          }
          
          return {
            display_name: cleanAddress,
            lat: item.lat,
            lon: item.lon,
            distance,
            fullDisplay: item.display_name
          };
        })
        // Sort by distance if user location available
        .sort((a: any, b: any) => a.distance - b.distance)
        .slice(0, 5);
      
      return results;
    }
    
    return [];
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn('Address autocomplete error:', error.message);
    }
    // Try fallback
    return await getFallbackSuggestions(input, userLocation);
  }
}

/**
 * Fallback to geocode.maps.co if Nominatim fails
 * @param input - The user's search query
 * @param userLocation - Optional user location
 * @returns Array of address suggestions
 */
async function getFallbackSuggestions(
  input: string,
  userLocation?: { lat: number; lon: number }
): Promise<AddressSuggestion[]> {
  try {
    const url = `https://geocode.maps.co/search?q=${encodeURIComponent(input)}&limit=5`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        // Filter for US addresses
        const results = data
          .filter((item: any) => {
            if (!item.display_name || !item.lat || !item.lon) return false;
            const displayLower = item.display_name.toLowerCase();
            return displayLower.includes('united states') || 
                   displayLower.includes(', us');
          })
          .map((item: any) => {
            let distance = Infinity;
            if (userLocation) {
              const itemLat = parseFloat(item.lat);
              const itemLon = parseFloat(item.lon);
              const R = 3959;
              const dLat = (itemLat - userLocation.lat) * Math.PI / 180;
              const dLon = (itemLon - userLocation.lon) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(itemLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              distance = R * c;
            }
            
            return {
              display_name: item.display_name,
              lat: item.lat,
              lon: item.lon,
              distance,
              fullDisplay: item.display_name
            };
          })
          .sort((a: AddressSuggestion, b: AddressSuggestion) => (a.distance || 0) - (b.distance || 0))
          .slice(0, 5);
        
        return results;
      }
    }
    return [];
  } catch (error) {
    console.warn('Fallback geocoding also failed:', error);
    return [];
  }
}
