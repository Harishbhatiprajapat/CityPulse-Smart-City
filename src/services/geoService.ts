import type { CitySearchResult, POICategory, POIPlace } from '@/types';
import { fetchPlacePhotos } from './photoService';

// In-memory cache for search results to avoid redundant network hits
const citySearchCache = new Map<string, CitySearchResult[]>();
const poiSearchCache = new Map<string, POIPlace[]>();
const geocodeCache = new Map<string, { lat: number; lng: number; label: string } | null>();

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface POICategoryMeta {
  id: POICategory;
  label: string;
  osmQuery: string;
  osmClass: string;
  iconName: string;
  color: string;
  emoji: string;
}

/**
 * 12 Exact Categories defined by user specification:
 * - Hospitals: Red (#EF4444)
 * - Police stations: Blue (#3B82F6)
 * - Schools and colleges: Purple (#A855F7)
 * - Hotels: Orange (#F97316)
 * - Restaurants: Yellow (#EAB308)
 * - Pharmacies: Pink (#EC4899)
 * - Parks: Green (#22C55E)
 * - Bus stations: Cyan (#06B6D4)
 * - Railway stations: Indigo (#6366F1)
 * - ATMs and banks: Teal (#14B8A6)
 * - Government offices: Dark blue (#1E40AF)
 * - Other places: Neutral gray (#6B7280)
 */
export const POI_CATEGORIES: POICategoryMeta[] = [
  { id: 'hospitals', label: 'Hospitals & Clinics', osmQuery: 'hospital', osmClass: 'amenity', iconName: 'Activity', color: '#EF4444', emoji: '🏥' },
  { id: 'police', label: 'Police Stations', osmQuery: 'police', osmClass: 'amenity', iconName: 'Shield', color: '#3B82F6', emoji: '👮' },
  { id: 'schools', label: 'Schools & Colleges', osmQuery: 'school', osmClass: 'amenity', iconName: 'GraduationCap', color: '#A855F7', emoji: '🏫' },
  { id: 'hotels', label: 'Hotels & Lodging', osmQuery: 'hotel', osmClass: 'tourism', iconName: 'Hotel', color: '#F97316', emoji: '🏨' },
  { id: 'restaurants', label: 'Restaurants & Dining', osmQuery: 'restaurant', osmClass: 'amenity', iconName: 'Utensils', color: '#EAB308', emoji: '🍽️' },
  { id: 'pharmacies', label: 'Pharmacies', osmQuery: 'pharmacy', osmClass: 'amenity', iconName: 'Cross', color: '#EC4899', emoji: '💊' },
  { id: 'parks', label: 'Parks & Recreation', osmQuery: 'park', osmClass: 'leisure', iconName: 'Trees', color: '#22C55E', emoji: '🌳' },
  { id: 'bus_stations', label: 'Bus Stations', osmQuery: 'bus_station', osmClass: 'amenity', iconName: 'Bus', color: '#06B6D4', emoji: '🚌' },
  { id: 'railway_stations', label: 'Railway Stations', osmQuery: 'station', osmClass: 'railway', iconName: 'Train', color: '#6366F1', emoji: '🚆' },
  { id: 'atms', label: 'ATMs & Banks', osmQuery: 'bank', osmClass: 'amenity', iconName: 'Landmark', color: '#14B8A6', emoji: '🏧' },
  { id: 'government', label: 'Government Offices', osmQuery: 'townhall', osmClass: 'amenity', iconName: 'Building', color: '#1E40AF', emoji: '🏛️' },
  { id: 'other', label: 'Other Places', osmQuery: 'point_of_interest', osmClass: 'historic', iconName: 'MapPin', color: '#6B7280', emoji: '📍' },
];

export function getCategoryMeta(cat: POICategory): POICategoryMeta {
  return POI_CATEGORIES.find((c) => c.id === cat) || POI_CATEGORIES[POI_CATEGORIES.length - 1];
}

/**
 * Searches worldwide cities with direct Open-Meteo Geocoding, with Supabase fallback.
 */
export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = trimmed.toLowerCase();
  if (citySearchCache.has(cacheKey)) {
    return citySearchCache.get(cacheKey)!;
  }

  try {
    const directUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=10&language=en&format=json`;

    const res = await fetch(directUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data.results && Array.isArray(data.results) && data.results.length > 0) {
        const formatted: CitySearchResult[] = data.results.map((r: {
          id: number;
          name: string;
          country?: string;
          admin1?: string;
          latitude: number;
          longitude: number;
          population?: number | null;
          timezone?: string | null;
        }) => ({
          id: r.id,
          name: r.name,
          country: r.country || '',
          admin1: r.admin1 || '',
          latitude: r.latitude,
          longitude: r.longitude,
          population: r.population || null,
          timezone: r.timezone || null,
          label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        }));
        citySearchCache.set(cacheKey, formatted);
        return formatted;
      }
    }
  } catch {
    // direct fetch failed
  }

  return [];
}

/**
 * Geocodes any city, landmark, or address into coordinates using Nominatim & Open-Meteo
 */
export async function geocodeLocation(
  query: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; label: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cacheKey = trimmed.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    // First try OpenStreetMap Nominatim for exact landmarks / addresses
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed
    )}&limit=1&addressdetails=1`;

    const nomRes = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'CityPulse-Civic-Intelligence/2.0 (OpenGIS)',
        Accept: 'application/json',
      },
      signal,
    });

    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (Array.isArray(nomData) && nomData.length > 0) {
        const item = nomData[0];
        const result = {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          label: item.display_name || trimmed,
        };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    // fallback to Open-Meteo
  }

  try {
    const cities = await searchCities(trimmed, signal);
    if (cities.length > 0) {
      const top = cities[0];
      const result = { lat: top.latitude, lng: top.longitude, label: top.label };
      geocodeCache.set(cacheKey, result);
      return result;
    }
  } catch {
    // failed
  }

  geocodeCache.set(cacheKey, null);
  return null;
}

/**
 * Searches real OpenStreetMap facilities using Nominatim around given coordinates
 * Includes extratags=1 to extract authentic phone numbers, websites, and opening hours
 */
export async function searchNearbyPOIs(
  category: POICategory,
  latitude: number,
  longitude: number,
  radiusKm = 5,
  signal?: AbortSignal
): Promise<POIPlace[]> {
  const cacheKey = `${category}_${latitude.toFixed(3)}_${longitude.toFixed(3)}_${radiusKm}`;
  if (poiSearchCache.has(cacheKey)) {
    return poiSearchCache.get(cacheKey)!;
  }

  const categoryMeta = getCategoryMeta(category);
  const osmQuery = categoryMeta.osmQuery;

  // Approximate 1 deg lat ~ 111 km, 1 deg lng ~ 111 * cos(lat) km
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLng = longitude - lngDelta;
  const maxLng = longitude + lngDelta;

  const primaryQuery = `[${osmQuery}]`;
  const viewbox = `${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)},${minLat.toFixed(4)}`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    primaryQuery
  )}&viewbox=${viewbox}&bounded=1&limit=30&addressdetails=1&extratags=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CityPulse-Civic-Intelligence/2.0 (OpenGIS)',
        Accept: 'application/json',
      },
      signal,
    });

    let data = res.ok ? await res.json() : [];

    // If bracketed category tag query yielded few or no results, fallback to general amenity query
    if (!Array.isArray(data) || data.length < 3) {
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        osmQuery
      )}&viewbox=${viewbox}&bounded=1&limit=30&addressdetails=1&extratags=1`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          'User-Agent': 'CityPulse-Civic-Intelligence/2.0 (OpenGIS)',
          Accept: 'application/json',
        },
        signal,
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          data = Array.isArray(data) ? [...data, ...fallbackData] : fallbackData;
        }
      }
    }

    if (!Array.isArray(data)) return [];

    const seenNames = new Set<string>();
    const places: POIPlace[] = [];

    for (const item of data) {
      const pLat = parseFloat(item.lat);
      const pLng = parseFloat(item.lon);
      if (isNaN(pLat) || isNaN(pLng)) continue;

      const dist = calculateDistanceKm(latitude, longitude, pLat, pLng);
      if (dist > radiusKm * 1.35) continue; // Respect search radius boundary

      const name = item.name || item.display_name?.split(',')[0] || `${categoryMeta.label}`;
      if (seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());

      const address = item.display_name;
      const extratags: Record<string, string> = item.extratags || {};

      // Extract genuine contact, website, and opening hours without inventing anything
      const phone = extratags.phone || extratags['contact:phone'] || extratags['contact:mobile'] || undefined;
      const website = extratags.website || extratags['contact:website'] || extratags['url'] || undefined;
      const openingHours = extratags.opening_hours || undefined;
      const operator = extratags.operator || undefined;
      const wheelchair = extratags.wheelchair || undefined;

      places.push({
        id: String(item.place_id || `${pLat}_${pLng}`),
        name,
        category,
        categoryLabel: categoryMeta.label,
        latitude: pLat,
        longitude: pLng,
        distanceKm: dist,
        address,
        osmType: item.osm_type,
        osmId: item.osm_id,
        verified: true,
        phone,
        website,
        openingHours,
        operator,
        wheelchair,
        tags: {
          class: item.class,
          type: item.type,
        },
        extratags,
      });
    }

    places.sort((a, b) => a.distanceKm - b.distanceKm);
    poiSearchCache.set(cacheKey, places);
    return places;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return [];
  }
}

/**
 * Searches places by free text (landmark, address, or name) within an optional bounding viewbox
 */
export async function searchPlacesFree(
  query: string,
  latitude: number,
  longitude: number,
  radiusKm = 10,
  signal?: AbortSignal
): Promise<POIPlace[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Approximate viewbox
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLng = longitude - lngDelta;
  const maxLng = longitude + lngDelta;

  const viewbox = `${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)},${minLat.toFixed(4)}`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    trimmed
  )}&viewbox=${viewbox}&limit=20&addressdetails=1&extratags=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CityPulse-Civic-Intelligence/2.0 (OpenGIS)',
        Accept: 'application/json',
      },
      signal,
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item) => {
      const pLat = parseFloat(item.lat);
      const pLng = parseFloat(item.lon);
      const dist = calculateDistanceKm(latitude, longitude, pLat, pLng);
      const extratags: Record<string, string> = item.extratags || {};

      // Determine category from class/type
      let cat: POICategory = 'other';
      const c = (item.class || '').toLowerCase();
      const t = (item.type || '').toLowerCase();

      if (t.includes('hospital') || t.includes('clinic')) cat = 'hospitals';
      else if (t.includes('police')) cat = 'police';
      else if (t.includes('school') || t.includes('college') || t.includes('university')) cat = 'schools';
      else if (c === 'tourism' || t.includes('hotel')) cat = 'hotels';
      else if (t.includes('restaurant') || t.includes('cafe') || t.includes('fast_food')) cat = 'restaurants';
      else if (t.includes('pharmacy')) cat = 'pharmacies';
      else if (c === 'leisure' || t.includes('park') || t.includes('garden')) cat = 'parks';
      else if (t.includes('bus')) cat = 'bus_stations';
      else if (t.includes('station') || t.includes('railway')) cat = 'railway_stations';
      else if (t.includes('bank') || t.includes('atm')) cat = 'atms';
      else if (t.includes('townhall') || t.includes('government') || c === 'government') cat = 'government';

      const meta = getCategoryMeta(cat);

      return {
        id: String(item.place_id || `${pLat}_${pLng}`),
        name: item.name || item.display_name?.split(',')[0] || trimmed,
        category: cat,
        categoryLabel: meta.label,
        latitude: pLat,
        longitude: pLng,
        distanceKm: dist,
        address: item.display_name,
        osmType: item.osm_type,
        osmId: item.osm_id,
        verified: true,
        phone: extratags.phone || extratags['contact:phone'] || undefined,
        website: extratags.website || extratags['contact:website'] || undefined,
        openingHours: extratags.opening_hours || undefined,
        operator: extratags.operator || undefined,
        wheelchair: extratags.wheelchair || undefined,
        extratags,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Loads authentic photos for a specific POIPlace
 */
export async function populatePlacePhotos(place: POIPlace, cityName: string): Promise<POIPlace> {
  if (place.photos && place.photos.length > 0) return place;
  const photos = await fetchPlacePhotos(place.name, cityName, place.extratags);
  return { ...place, photos };
}
