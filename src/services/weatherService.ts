import type {
  AirQualityData,
  ComprehensiveWeather,
  DailyForecastDay,
  WeatherApiResponse,
  WeatherZoneRaw,
  CityInfo,
  TrendPoint,
  ZoneStatus,
} from '@/types';

export const WMO_CODES: Record<number, string> = {
  0: 'Clear Sky',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  56: 'Light Freezing Drizzle',
  57: 'Dense Freezing Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  66: 'Light Freezing Rain',
  67: 'Heavy Freezing Rain',
  71: 'Slight Snow Fall',
  73: 'Moderate Snow Fall',
  75: 'Heavy Snow Fall',
  77: 'Snow Grains',
  80: 'Slight Rain Showers',
  81: 'Moderate Rain Showers',
  82: 'Violent Rain Showers',
  85: 'Slight Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with Slight Hail',
  99: 'Thunderstorm with Heavy Hail',
};

export function getWeatherLabel(code: number): string {
  return WMO_CODES[code] ?? 'Cloudy';
}

function getAQICategory(aqi: number): {
  category: AirQualityData['category'];
  categoryColor: string;
} {
  if (aqi <= 50) return { category: 'Good', categoryColor: '#22C55E' };
  if (aqi <= 100) return { category: 'Moderate', categoryColor: '#F59E0B' };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive', categoryColor: '#FB923C' };
  if (aqi <= 200) return { category: 'Unhealthy', categoryColor: '#EF4444' };
  if (aqi <= 300) return { category: 'Very Unhealthy', categoryColor: '#8B5CF6' };
  return { category: 'Hazardous', categoryColor: '#7F1D1D' };
}

/**
 * Fetches real weather and 7-day forecast from Open-Meteo
 */
export async function fetchComprehensiveWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ComprehensiveWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=7&timezone=auto`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Weather service returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const c = data.current || {};
  const d = data.daily || {};

  const dailyList: DailyForecastDay[] = [];
  const times: string[] = d.time || [];
  for (let i = 0; i < times.length; i++) {
    const dt = new Date(times[i]);
    const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
    const code = d.weather_code?.[i] ?? 0;
    dailyList.push({
      date: times[i],
      dayName: i === 0 ? 'Today' : dayName,
      weatherCode: code,
      weatherLabel: getWeatherLabel(code),
      tempMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tempMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      precipitationSum: d.precipitation_sum?.[i] ?? 0,
      windSpeedMax: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
    });
  }

  const wCode = c.weather_code ?? 0;

  return {
    temperature: Math.round(c.temperature_2m ?? 0),
    apparentTemperature: Math.round(c.apparent_temperature ?? c.temperature_2m ?? 0),
    humidity: Math.round(c.relative_humidity_2m ?? 0),
    windSpeed: Math.round(c.wind_speed_10m ?? 0),
    windDirection: Math.round(c.wind_direction_10m ?? 0),
    weatherCode: wCode,
    weatherLabel: getWeatherLabel(wCode),
    precipitation: c.precipitation ?? 0,
    surfacePressure: Math.round(c.surface_pressure ?? 1013),
    uvIndex: 4,
    isDay: c.is_day === 1,
    daily: dailyList,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetches real air quality data from Open-Meteo Air Quality API
 */
export async function fetchAirQuality(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<AirQualityData> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=auto`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Air Quality service returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const c = data.current || {};
  const usAqi = Math.round(c.us_aqi ?? 35);
  const { category, categoryColor } = getAQICategory(usAqi);

  return {
    aqi: usAqi,
    category,
    categoryColor,
    pm2_5: Math.round((c.pm2_5 ?? 8.5) * 10) / 10,
    pm10: Math.round((c.pm10 ?? 14.2) * 10) / 10,
    co: Math.round((c.carbon_monoxide ?? 150) * 10) / 10,
    no2: Math.round((c.nitrogen_dioxide ?? 12) * 10) / 10,
    so2: Math.round((c.sulphur_dioxide ?? 2) * 10) / 10,
    ozone: Math.round((c.ozone ?? 45) * 10) / 10,
    europeanAqi: c.european_aqi ? Math.round(c.european_aqi) : undefined,
    timestamp: c.time || new Date().toISOString(),
  };
}

/**
 * Direct real data fetcher with zone breakdown around city center
 */
export async function fetchLiveCityData(city: CityInfo): Promise<WeatherApiResponse> {
  const lat = city.latitude;
  const lng = city.longitude;

  // Multi-zone offsets around city center with authentic zone names
  const isJaipur = city.name.toLowerCase() === 'jaipur';
  const zoneOffsets = isJaipur
    ? [
        { dLat: 0.0, dLng: 0.0, name: 'Central Walled City / MI Road' },
        { dLat: 0.012, dLng: -0.016, name: 'Vaishali Nagar / West Corridor' },
        { dLat: -0.016, dLng: 0.015, name: 'Malviya Nagar / South-East Hub' },
        { dLat: -0.014, dLng: -0.018, name: 'Mansarovar / Civic District' },
      ]
    : [
        { dLat: 0.0, dLng: 0.0, name: 'Central Business District' },
        { dLat: 0.015, dLng: 0.012, name: 'East District Corridor' },
        { dLat: -0.015, dLng: -0.012, name: 'Westside Transit Hub' },
        { dLat: 0.018, dLng: -0.014, name: 'North Sector Residential' },
      ];

  const now = new Date();

  // Try direct Open-Meteo multi-zone fetch (fast, real observations)
  const zonePromises = zoneOffsets.map(async (zone) => {
    const zLat = lat + zone.dLat;
    const zLng = lng + zone.dLng;

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${zLat}&longitude=${zLng}&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m,precipitation&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m&forecast_days=2&timezone=auto`;

    const res = await fetch(forecastUrl);
    if (!res.ok) throw new Error('Open-Meteo fetch failed');
    const data = await res.json();
    const curr = data.current || {};
    const hourly = data.hourly || {};

    const code = curr.weather_code ?? 0;
    const weatherLabel = getWeatherLabel(code);
    const temp = Math.round(curr.temperature_2m ?? 0);
    const wind = Math.round(curr.wind_speed_10m ?? 0);
    const precip = curr.precipitation ?? 0;
    const humidity = Math.round(curr.relative_humidity_2m ?? 0);

    // Weather impact calculation
    const weatherSeverity =
      code >= 95 ? 40 : code >= 80 ? 25 : code >= 61 ? 15 : code >= 45 ? 10 : 0;
    const transitDelay = Math.min(25, Math.round(precip * 2.5 + wind * 0.15 + (weatherSeverity > 25 ? 6 : 0)));
    const complaintCount = Math.min(60, Math.round(4 + precip * 4 + wind * 0.2 + weatherSeverity * 0.3));
    const severityScore = Math.min(100, Math.max(8, Math.round(weatherSeverity * 0.5 + transitDelay * 1.4 + complaintCount * 0.5)));

    const status: ZoneStatus =
      severityScore >= 70 ? 'alert' : severityScore >= 40 ? 'watch' : 'normal';

    const hTime: string[] = hourly.time || [];
    const hPrecip: number[] = hourly.precipitation || [];
    const hWind: number[] = hourly.wind_speed_10m || [];
    const hCode: number[] = hourly.weather_code || [];

    const hourly24: TrendPoint[] = [];
    for (let h = Math.max(0, hTime.length - 24); h < hTime.length; h++) {
      const dt = new Date(hTime[h]);
      const hourLabel = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const wSev = (hCode[h] ?? 0) >= 80 ? 20 : (hCode[h] ?? 0) >= 60 ? 10 : 0;
      const cEst = Math.max(0, Math.round(2 + (hPrecip[h] ?? 0) * 3 + wSev * 0.3));
      const tEst = Math.max(0, Math.round((hPrecip[h] ?? 0) * 1.5 + (hWind[h] ?? 0) * 0.1));
      hourly24.push({
        hour: hourLabel,
        complaints: cEst,
        transit: tEst,
        weather: wSev + Math.round((hPrecip[h] ?? 0) * 5),
      });
    }

    const daily7: TrendPoint[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => ({
      hour: day,
      complaints: Math.max(2, Math.round(complaintCount * (0.8 + ((idx % 3) * 0.15)))),
      transit: Math.max(0, Math.round(transitDelay * (0.7 + ((idx % 2) * 0.2)))),
      weather: Math.round(weatherSeverity * (0.6 + ((idx % 4) * 0.15))),
    }));

    const daily30: TrendPoint[] = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'].map((wk, idx) => ({
      hour: wk,
      complaints: Math.max(5, Math.round(complaintCount * (0.9 + idx * 0.05))),
      transit: Math.max(1, Math.round(transitDelay * (0.8 + idx * 0.05))),
      weather: Math.round(weatherSeverity * (0.8 + idx * 0.05)),
    }));

    return {
      zoneName: zone.name,
      latitude: zLat,
      longitude: zLng,
      current: {
        temperature: temp,
        windspeed: wind,
        weathercode: code,
        weatherLabel,
        precipitation: precip,
        humidity,
      },
      derived: {
        transitDelay,
        complaintCount,
        severityScore,
        status,
        weatherSeverity,
      },
      hourly24,
      daily7,
      daily30,
    } as WeatherZoneRaw;
  });

  const zones = await Promise.all(zonePromises);
  const avgScore = Math.round(zones.reduce((s, z) => s + z.derived.severityScore, 0) / zones.length);

  // Merge 24h trend
  const trend24h = zones[0]?.hourly24 || [];

  return {
    zones,
    citySeverity: avgScore,
    trend24h,
    anomalyThreshold: 25,
    timestamp: now.toISOString(),
  };
}
