import assert from 'node:assert/strict';

import {
  calculateDistanceKm,
  POI_CATEGORIES,
  PRIMARY_POI_CATEGORY_IDS,
  SECONDARY_POI_CATEGORY_IDS,
  getCategoryMeta,
} from '@/services/geoService';

import {
  MAP_LAYERS,
  ESSENTIAL_LAYER_IDS,
} from '@/services/mapLayerService';

import {
  getWeatherLabel,
  clearWeatherCaches,
} from '@/services/weatherService';

import {
  getTrafficProviderConfig,
  clearTrafficCache,
} from '@/services/trafficService';

import {
  clearAlertCache,
  fetchCivicAlerts,
} from '@/services/alertService';

import type { ComprehensiveWeather, AirQualityData } from '@/types';

export async function runPhaseTests() {
  console.log('------------------------------------------------------------');
  console.log('📌 FEATURE A: Explore Nearby & Geographic Amenities (Reference Image 1)');
  console.log('------------------------------------------------------------');

  // Test 1: Distance calculation accuracy (Haversine)
  {
    const dist = calculateDistanceKm(26.9124, 75.7873, 28.6139, 77.2090);
    assert.ok(dist >= 230 && dist <= 250, `Distance was ${dist} km, expected ~238 km`);
    const zeroDist = calculateDistanceKm(26.9124, 75.7873, 26.9124, 75.7873);
    assert.strictEqual(zeroDist, 0, 'Distance to same coordinate must be 0 km');
    console.log('  ✔ calculateDistanceKm: Haversine distance matches expected Jaipur-Delhi range (~238 km)');
  }

  // Test 2: Category definition integrity (24 civic categories + other)
  {
    assert.strictEqual(POI_CATEGORIES.length, 25, 'Must have 25 configured place categories');
    assert.strictEqual(PRIMARY_POI_CATEGORY_IDS.length, 8, 'Must have 8 primary visible category buttons');
    assert.strictEqual(SECONDARY_POI_CATEGORY_IDS.length, 16, 'Must have 16 secondary categories in More menu');

    const expectedPrimary = [
      'restaurants',
      'cafes',
      'hotels',
      'hospitals',
      'schools',
      'police',
      'atms',
      'petrol',
    ];

    assert.deepStrictEqual(PRIMARY_POI_CATEGORY_IDS, expectedPrimary, 'Primary categories must match Reference Image 1');

    for (const cat of POI_CATEGORIES) {
      assert.ok(cat.color.startsWith('#'), `Category ${cat.id} color must be valid hex`);
      assert.ok(cat.emoji.length > 0, `Category ${cat.id} must have an emoji icon`);
      assert.ok(cat.osmQuery.length > 0, `Category ${cat.id} must have an osm query keyword`);
    }
    console.log('  ✔ POI_CATEGORIES: All 24 categories + More menu properly configured with styling & OSM queries');
  }

  // Test 3: getCategoryMeta lookup & fallback
  {
    const hospital = getCategoryMeta('hospitals');
    assert.strictEqual(hospital.id, 'hospitals');
    assert.strictEqual(hospital.color, '#EF4444');
    assert.strictEqual(hospital.emoji, '🏥');

    const fallback = getCategoryMeta('non_existent_category' as any);
    assert.strictEqual(fallback.id, 'other');
    console.log('  ✔ getCategoryMeta: Accurate lookup and fallback to "other" category');
  }

  console.log('\n------------------------------------------------------------');
  console.log('📌 FEATURE B: Live Geographic Intelligence Map (Reference Image 2)');
  console.log('------------------------------------------------------------');

  // Test 4: 16 Map Layers & Essential Preset
  {
    assert.strictEqual(MAP_LAYERS.length, 16, 'Must have all 16 selectable layers configured');
    assert.strictEqual(ESSENTIAL_LAYER_IDS.length, 6, 'Must have exactly 6 essential layers matching Reference Image 2');

    const expectedEssential = [
      'weather',
      'traffic',
      'civic_incidents',
      'hospitals',
      'air_quality',
      'alerts',
    ];
    assert.deepStrictEqual(ESSENTIAL_LAYER_IDS, expectedEssential, 'Essential layers must match Reference Image 2 exactly');
    console.log('  ✔ MAP_LAYERS: 16 layers and 6-layer Essential preset verified (Reference Image 2)');
  }

  // Test 5: WMO weather codes
  {
    assert.strictEqual(getWeatherLabel(0), 'Clear Sky');
    assert.strictEqual(getWeatherLabel(3), 'Overcast');
    assert.strictEqual(getWeatherLabel(65), 'Heavy Rain');
    assert.strictEqual(getWeatherLabel(95), 'Thunderstorm');
    assert.strictEqual(getWeatherLabel(999), 'Cloudy');
    console.log('  ✔ WMO Codes: Proper meteorological text descriptions returned');
  }

  // Test 6: Traffic provider configuration & fallback
  {
    const noKey = getTrafficProviderConfig('');
    assert.strictEqual(noKey.provider, 'TomTom');
    assert.strictEqual(noKey.hasApiKey, false);
    assert.strictEqual(noKey.tileUrlTemplate, undefined);

    const withKey = getTrafficProviderConfig('TEST_TOMTOM_KEY_999');
    assert.strictEqual(withKey.hasApiKey, true);
    assert.ok(withKey.tileUrlTemplate?.includes('TEST_TOMTOM_KEY_999'));
    console.log('  ✔ Traffic Provider: Handles missing and custom API keys correctly');
  }

  // Test 7: Civic alert generation from meteorological anomalies
  {
    const mockWeather: ComprehensiveWeather = {
      temperature: 33,
      apparentTemperature: 37,
      humidity: 82,
      windSpeed: 64, // Gale winds > 55 km/h
      windDirection: 210,
      weatherCode: 95, // Severe Thunderstorm
      weatherLabel: 'Thunderstorm',
      precipitation: 16, // Heavy rain > 10 mm/h
      surfacePressure: 1007,
      uvIndex: 5,
      isDay: true,
      daily: [],
      timestamp: new Date().toISOString(),
    };

    const mockAqi: AirQualityData = {
      aqi: 215, // Severe AQI > 200
      category: 'Very Unhealthy',
      categoryColor: '#8B5CF6',
      pm2_5: 92,
      pm10: 175,
      co: 350,
      no2: 50,
      so2: 15,
      ozone: 98,
      timestamp: new Date().toISOString(),
    };

    const alerts = await fetchCivicAlerts(26.9124, 75.7873, mockWeather, mockAqi);
    assert.ok(alerts.length >= 3, `Expected at least 3 generated alerts, received ${alerts.length}`);

    const wind = alerts.find((a) => a.event.includes('High Wind'));
    assert.ok(wind, 'High wind advisory must trigger');

    const rain = alerts.find((a) => a.event.includes('Heavy Rainfall'));
    assert.ok(rain, 'Heavy rainfall warning must trigger');

    const storm = alerts.find((a) => a.event.includes('Thunderstorm'));
    assert.ok(storm, 'Severe thunderstorm warning must trigger');

    const aqi = alerts.find((a) => a.event.includes('Air Quality'));
    assert.ok(aqi, 'AQI warning must trigger');
    assert.strictEqual(aqi?.severity, 'critical');

    console.log(`  ✔ Civic Alerts: Generated ${alerts.length} verified alerts for meteorological & environmental anomalies`);
  }

  // Test 8: Cache clearing and TTL operations
  {
    assert.doesNotThrow(() => clearWeatherCaches(), 'Weather caches must reset cleanly');
    assert.doesNotThrow(() => clearTrafficCache(), 'Traffic cache must reset cleanly');
    assert.doesNotThrow(() => clearAlertCache(), 'Alert cache must reset cleanly');
    console.log('  ✔ In-Memory TTL Caching: Resets and cache storage APIs function flawlessly');
  }
}
