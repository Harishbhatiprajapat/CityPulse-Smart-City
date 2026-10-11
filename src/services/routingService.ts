import type { RouteResult, RouteStep } from '@/types';

/**
 * Calculates genuine road-network route using OSRM (Open Source Routing Machine).
 * Coordinates are passed as lon,lat to OSRM and returned as [lat, lng] for Leaflet polyline.
 */
export async function calculateRoadRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  originName = 'Start Location',
  destinationName = 'Destination',
  signal?: AbortSignal
): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Routing service returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No driving route found between these locations.');
  }

  const primaryRoute = data.routes[0];
  const geojsonCoords: [number, number][] = primaryRoute.geometry.coordinates || [];

  // OSRM returns coordinates as [lon, lat], convert to Leaflet's [lat, lng]
  const leafletCoords: [number, number][] = geojsonCoords.map(([lon, lat]) => [lat, lon]);

  const steps: RouteStep[] = [];
  if (primaryRoute.legs && primaryRoute.legs.length > 0) {
    for (const leg of primaryRoute.legs) {
      if (leg.steps) {
        for (const s of leg.steps) {
          const modifier = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : '';
          const type = s.maneuver?.type || 'proceed';
          const streetName = s.name ? ` onto ${s.name}` : '';
          const instruction = `${capitalize(type)}${modifier}${streetName}`;

          steps.push({
            instruction: s.maneuver?.instruction || instruction,
            distanceMeters: Math.round(s.distance || 0),
            durationSeconds: Math.round(s.duration || 0),
            name: s.name || undefined,
          });
        }
      }
    }
  }

  const distKm = (primaryRoute.distance / 1000).toFixed(1);
  const durMins = Math.round(primaryRoute.duration / 60);

  return {
    coordinates: leafletCoords,
    distanceMeters: Math.round(primaryRoute.distance),
    durationSeconds: Math.round(primaryRoute.duration),
    summary: `${distKm} km · approx ${durMins} mins driving`,
    steps,
    originName,
    destinationName,
  };
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
