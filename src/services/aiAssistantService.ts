import type { AIMessage, CityInfo } from '@/types';
import { searchNearbyPOIs, POI_CATEGORIES } from './geoService';
import { fetchComprehensiveWeather, fetchAirQuality } from './weatherService';
import { fetchCivicAlerts } from './alertService';
import { calculateRoadRoute } from './routingService';

interface ToolExecutionContext {
  city: CityInfo;
  geminiApiKey?: string;
}

/**
 * Executes real application tools on behalf of user requests
 */
export async function executeCityAssistantQuery(
  userQuery: string,
  context: ToolExecutionContext
): Promise<AIMessage> {
  const query = userQuery.trim().toLowerCase();
  const { city } = context;

  const toolCalls: { name: string; args: Record<string, unknown>; result?: unknown }[] = [];

  // 1. Nearby Facilities (Hospitals, Police, Schools, Pharmacies, Restaurants, etc.)
  const matchedCategory = POI_CATEGORIES.find(
    (c) =>
      query.includes(c.id) ||
      query.includes(c.label.toLowerCase()) ||
      (c.id === 'hospitals' && (query.includes('hospital') || query.includes('clinic') || query.includes('doctor') || query.includes('medical') || query.includes('er'))) ||
      (c.id === 'police' && (query.includes('police') || query.includes('precinct') || query.includes('cop'))) ||
      (c.id === 'schools' && (query.includes('school') || query.includes('college') || query.includes('university'))) ||
      (c.id === 'pharmacies' && (query.includes('pharmacy') || query.includes('drugstore') || query.includes('chemist'))) ||
      (c.id === 'hotels' && (query.includes('hotel') || query.includes('motel') || query.includes('lodging'))) ||
      (c.id === 'restaurants' && (query.includes('restaurant') || query.includes('food') || query.includes('cafe'))) ||
      (c.id === 'atms' && (query.includes('atm') || query.includes('bank') || query.includes('cash'))) ||
      (c.id === 'bus_stations' && (query.includes('bus') || query.includes('bus stand') || query.includes('bus station'))) ||
      (c.id === 'railway_stations' && (query.includes('train') || query.includes('railway') || query.includes('station') || query.includes('metro'))) ||
      (c.id === 'government' && (query.includes('government') || query.includes('municipal') || query.includes('collectorate'))) ||
      (c.id === 'parks' && (query.includes('park') || query.includes('garden') || query.includes('playground')))
  );

  // Extract requested radius if specified (e.g., "within 5 km" or "10km")
  const radiusMatch = query.match(/(\d+)\s*(?:km|kilos|kilometers|miles)?/);
  const requestedRadius = radiusMatch ? Math.min(15, Math.max(1, parseInt(radiusMatch[1], 10))) : 5;

  if (matchedCategory) {
    const pois = await searchNearbyPOIs(matchedCategory.id, city.latitude, city.longitude, requestedRadius);
    toolCalls.push({
      name: 'search_nearby_places',
      args: { category: matchedCategory.id, radiusKm: requestedRadius, city: city.name },
      result: { count: pois.length, places: pois.slice(0, 5) },
    });

    if (pois.length === 0) {
      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `I searched OpenStreetMap records around **${city.name}** within **${requestedRadius} km**, but found 0 verified ${matchedCategory.label.toLowerCase()} in this query bounds. You can try widening the search radius in the Explore Map view or searching a neighboring district.`,
        timestamp: new Date().toISOString(),
        toolCalls,
      };
    }

    const listText = pois
      .slice(0, 5)
      .map(
        (p, i) =>
          `${i + 1}. **${p.name}** — ${p.distanceKm} km away\n   *Address:* ${p.address?.split(',').slice(0, 3).join(',') || 'Coordinates: ' + p.latitude.toFixed(4) + ', ' + p.longitude.toFixed(4)}`
      )
      .join('\n\n');

    return {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `Here are the nearest verified **${matchedCategory.label}** within **${requestedRadius} km** of **${city.name}**:\n\n${listText}\n\n*Source: OpenStreetMap live geospatial query. You can view these markers directly on the Explore Map.*`,
      timestamp: new Date().toISOString(),
      toolCalls,
    };
  }

  // 2. Weather & Air Quality Analysis
  if (query.includes('weather') || query.includes('temperature') || query.includes('aqi') || query.includes('air quality') || query.includes('pollution') || query.includes('forecast')) {
    const [weather, aqi] = await Promise.all([
      fetchComprehensiveWeather(city.latitude, city.longitude),
      fetchAirQuality(city.latitude, city.longitude),
    ]);

    toolCalls.push({
      name: 'get_weather_and_aqi',
      args: { latitude: city.latitude, longitude: city.longitude, city: city.name },
      result: { weather, aqi },
    });

    return {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `Current environmental conditions for **${city.label}**:\n\n* **Weather:** ${weather.weatherLabel}, **${weather.temperature}°C** (Feels like ${weather.apparentTemperature}°C)\n* **Wind:** ${weather.windSpeed} km/h · **Humidity:** ${weather.humidity}% · **Precipitation:** ${weather.precipitation} mm\n* **Air Quality:** **${aqi.aqi} US AQI (${aqi.category})**\n* **Key Pollutants:** PM2.5: ${aqi.pm2_5} µg/m³, PM10: ${aqi.pm10} µg/m³, Ozone: ${aqi.ozone} µg/m³\n\n*Data retrieved live from Open-Meteo High-Resolution Forecasting and Copernicus Atmospheric Sensors.*`,
      timestamp: new Date().toISOString(),
      toolCalls,
    };
  }

  // 3. Civic Alerts & Warnings
  if (query.includes('alert') || query.includes('warning') || query.includes('advisory') || query.includes('incident') || query.includes('emergency')) {
    const [weather, aqi] = await Promise.all([
      fetchComprehensiveWeather(city.latitude, city.longitude).catch(() => undefined),
      fetchAirQuality(city.latitude, city.longitude).catch(() => undefined),
    ]);
    const alerts = await fetchCivicAlerts(city.latitude, city.longitude, weather, aqi);

    toolCalls.push({
      name: 'get_civic_alerts',
      args: { city: city.name, coordinates: [city.latitude, city.longitude] },
      result: { activeAlertCount: alerts.length, alerts },
    });

    if (alerts.length === 0) {
      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `There are currently **no active critical alerts** reported for **${city.label}** from official monitoring agencies. All primary atmospheric and public safety indicators are operating within normal baseline limits.`,
        timestamp: new Date().toISOString(),
        toolCalls,
      };
    }

    const alertSummary = alerts
      .map(
        (a, i) =>
          `${i + 1}. **[${a.severity.toUpperCase()}] ${a.event}**\n   *Headline:* ${a.headline}\n   *Source:* ${a.source}\n   *Effective:* ${new Date(a.effective).toLocaleString()}`
      )
      .join('\n\n');

    return {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `I found **${alerts.length} active verified alert(s)** for **${city.name}**:\n\n${alertSummary}\n\n*Review full details and instructions in the Civic Alerts tab.*`,
      timestamp: new Date().toISOString(),
      toolCalls,
    };
  }

  // 4. Route Calculation
  if (query.includes('route') || query.includes('directions') || query.includes('how far') || query.includes('driving')) {
    // Attempt sample nearby destination route
    const hospitals = await searchNearbyPOIs('hospitals', city.latitude, city.longitude, 5);
    if (hospitals.length > 0) {
      const dest = hospitals[0];
      const route = await calculateRoadRoute(
        city.latitude,
        city.longitude,
        dest.latitude,
        dest.longitude,
        `${city.name} Center`,
        dest.name
      );

      toolCalls.push({
        name: 'calculate_route',
        args: { origin: `${city.name} Center`, destination: dest.name },
        result: route,
      });

      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `I calculated an actual road-network route from **${city.name} Center** to **${dest.name}**:\n\n* **Distance:** ${(route.distanceMeters / 1000).toFixed(2)} km\n* **Estimated Driving Time:** ${Math.round(route.durationSeconds / 60)} minutes\n* **Route Overview:** ${route.steps.slice(0, 3).map((s) => s.instruction).join(' → ')}...\n\n*Calculated using OSRM real road routing. Open the Route Planning tab to specify custom origin and destination points.*`,
        timestamp: new Date().toISOString(),
        toolCalls,
      };
    }
  }

  // Fallback intelligent response explaining available tools
  return {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: `I am your CityPulse Civic Intelligence Assistant for **${city.name}**. I connect directly to the platform's live data services. You can ask me to:\n\n* **Find nearby facilities:** *"Find hospitals within 5 km"*, *"Where is the nearest police station?"*, *"Locate schools and pharmacies"*.\n* **Check live environmental data:** *"What is the current weather and AQI?"*, *"Show air pollution levels"*.\n* **Scan civic alerts:** *"Are there any active weather or road warnings?"*\n* **Plan routes:** *"Calculate route to nearest hospital"*.\n\nWhat would you like me to look up?`,
    timestamp: new Date().toISOString(),
  };
}
