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
 * Fetch address autocomplete suggestions using multiple providers
 * Tries Nominatim first, then photon.komoot.io, then geocode.maps.co
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

  // Try Nominatim first
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', input);
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '10');
    url.searchParams.append('countrycodes', 'us');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobFlowCo-CRM/1.0',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      
      if (data && data.length > 0) {
        const results = data
          .filter((item: any) => {
            if (!item.display_name || !item.lat || !item.lon) return false;
            const hasStreet = item.address && (item.address.road || item.address.house_number);
            return hasStreet || item.type === 'house' || item.type === 'building';
          })
          .map((item: any) => {
            const addr = item.address || {};
            const parts = [];
            
            if (addr.house_number) parts.push(addr.house_number);
            if (addr.road) parts.push(addr.road);
            if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
            if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
            if (addr.state) parts.push(addr.state);
            if (addr.postcode) parts.push(addr.postcode);
            
            const cleanAddress = parts.join(', ') || item.display_name;
            const distance = userLocation ? calculateDistance(
              userLocation.lat, userLocation.lon,
              parseFloat(item.lat), parseFloat(item.lon)
            ) : Infinity;
            
            return {
              display_name: cleanAddress,
              lat: item.lat,
              lon: item.lon,
              distance,
              fullDisplay: item.display_name
            };
          })
          .sort((a: any, b: any) => a.distance - b.distance)
          .slice(0, 5);
        
        if (results.length > 0) {
          console.log('✅ Address suggestions from Nominatim:', results.length);
          return results;
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Nominatim unavailable, trying Photon...');
  }

  // Try Photon (Komoot) as second option
  try {
    const results = await getPhotonSuggestions(input, userLocation);
    if (results.length > 0) {
      console.log('✅ Address suggestions from Photon:', results.length);
      return results;
    }
  } catch (error) {
    console.log('⚠️ Photon unavailable, trying geocode.maps.co...');
  }

  // Try geocode.maps.co as last resort
  return await getFallbackSuggestions(input, userLocation);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Try Photon geocoding service (powered by Komoot)
 * Free, CORS-friendly, no API key needed
 */
async function getPhotonSuggestions(
  input: string,
  userLocation?: { lat: number; lon: number }
): Promise<AddressSuggestion[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.append('q', input);
  url.searchParams.append('limit', '10');
  
  // Bias results to user location if available
  if (userLocation) {
    url.searchParams.append('lat', userLocation.lat.toString());
    url.searchParams.append('lon', userLocation.lon.toString());
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const response = await fetch(url.toString(), {
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Photon API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.features && data.features.length > 0) {
    const results = data.features
      .filter((item: any) => {
        // Filter for US addresses
        const props = item.properties || {};
        return props.country === 'United States' || props.countrycode === 'US';
      })
      .filter((item: any) => {
        // Must have street address
        const props = item.properties || {};
        return props.street || props.name;
      })
      .map((item: any) => {
        const props = item.properties || {};
        const coords = item.geometry?.coordinates || [0, 0];
        const parts = [];
        
        if (props.housenumber) parts.push(props.housenumber);
        if (props.street) parts.push(props.street);
        if (props.city || props.name) parts.push(props.city || props.name);
        if (props.state) parts.push(props.state);
        if (props.postcode) parts.push(props.postcode);
        
        const cleanAddress = parts.join(', ');
        const distance = userLocation ? calculateDistance(
          userLocation.lat, userLocation.lon,
          coords[1], coords[0]
        ) : Infinity;
        
        return {
          display_name: cleanAddress,
          lat: coords[1].toString(),
          lon: coords[0].toString(),
          distance,
          fullDisplay: cleanAddress
        };
      })
      .sort((a: AddressSuggestion, b: AddressSuggestion) => (a.distance || 0) - (b.distance || 0))
      .slice(0, 5);
    
    return results;
  }
  
  return [];
}

/**
 * Fallback to geocode.maps.co if other services fail
 * Note: This service can be rate-limited, use as last resort
 */
async function getFallbackSuggestions(
  input: string,
  userLocation?: { lat: number; lon: number }
): Promise<AddressSuggestion[]> {
  try {
    const url = `https://geocode.maps.co/search?q=${encodeURIComponent(input)}&limit=5`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const results = data
          .filter((item: any) => {
            if (!item.display_name || !item.lat || !item.lon) return false;
            const displayLower = item.display_name.toLowerCase();
            return displayLower.includes('united states') || 
                   displayLower.includes(', us');
          })
          .map((item: any) => {
            const distance = userLocation ? calculateDistance(
              userLocation.lat, userLocation.lon,
              parseFloat(item.lat), parseFloat(item.lon)
            ) : Infinity;
            
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
        
        if (results.length > 0) {
          console.log('✅ Address suggestions from geocode.maps.co:', results.length);
          return results;
        }
      }
    }
  } catch (error) {
    console.warn('❌ All geocoding services failed');
  }
  
  return [];
}
